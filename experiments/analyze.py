"""คำนวณความแม่นยำของ OCR จากผลใน results/*.json

CER  = (แทนที่ + ตกหล่น + เกินมา) / จำนวนตัวอักษรจริง  (ไม่นับช่องว่าง)
INS  = ตัวอักษรที่ "เกินมา" = ขยะที่ TTS จะพูดออกมา
OK%  = สัดส่วนภาพที่ CER <= 10% (ฟังแล้วเข้าใจ)
"""
import json
import io
import os
import re
import sys
import unicodedata
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
GT = {s["id"]: s["text"] for s in json.load(open(os.path.join(HERE, "samples.json"), encoding="utf-8"))["samples"]}

THAI = re.compile(r"[฀-๿]")
BASE = re.compile(r"[ก-ฮA-Za-z0-9]")  # พยัญชนะไทย/ตัวอังกฤษ/ตัวเลข (ไม่ใช่สระลอย/วรรณยุกต์)


def norm(s):
    s = unicodedata.normalize("NFC", s).replace("ํา", "ำ")
    s = s.replace("–", "-").replace("—", "-").replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", "", s).lower()


def align(pred, gt):
    """คืน (S, D, I) ระหว่าง pred กับ gt"""
    n, m = len(gt), len(pred)
    prev = [(j, 0, 0, j) for j in range(m + 1)]  # (cost, S, D, I)
    for i in range(1, n + 1):
        cur = [(i, 0, i, 0)]
        for j in range(1, m + 1):
            c_sub = prev[j - 1][0] + (gt[i - 1] != pred[j - 1])
            c_del = prev[j][0] + 1
            c_ins = cur[j - 1][0] + 1
            best = min(c_sub, c_del, c_ins)
            if best == c_sub:
                p = prev[j - 1]
                cur.append((best, p[1] + (gt[i - 1] != pred[j - 1]), p[2], p[3]))
            elif best == c_del:
                p = prev[j]
                cur.append((best, p[1], p[2] + 1, p[3]))
            else:
                p = cur[j - 1]
                cur.append((best, p[1], p[2], p[3] + 1))
        prev = cur
    _, S, D, I = prev[m]
    return S, D, I


def score(pred, sample):
    g, p = norm(GT[sample]), norm(pred)
    S, D, I = align(p, g)
    return {"cer": (S + D + I) / len(g), "ins": I / len(g), "miss": D / len(g)}


# ---------- การกรองผลลัพธ์ (จำลองโค้ดฝั่งเว็บ) ----------

def clean_current(text):
    """เหมือน cleanText() ในเว็บตอนนี้"""
    t = re.sub(r"([฀-๿]) +(?=[฀-๿])", r"\1", text)
    return re.sub(r"\n{2,}", "\n", re.sub(r"[ \t]+", " ", t)).strip()


def lines_from_words(words):
    lines = defaultdict(list)
    for w in words:
        lines[w["line"]].append(w)
    return [lines[k] for k in sorted(lines, key=lambda x: (x is None, x))]


def join_words(ws):
    out = ""
    for w in ws:
        if out and not (THAI.search(out[-1]) and THAI.search(w["t"][:1] or " ")):
            out += " "
        out += w["t"]
    return out


def filtered(r, word_min=0, line_min=0, min_base=3):
    """ทิ้งคำที่ความมั่นใจต่ำ + ทิ้งบรรทัดขยะ (ตัวหลักน้อยกว่า min_base หรือค่าเฉลี่ยความมั่นใจต่ำ)"""
    keep = []
    for ws in lines_from_words(r["words"]):
        ws = [w for w in ws if w["c"] >= word_min and w["t"].strip()]
        if not ws:
            continue
        txt = join_words(ws)
        base = len(BASE.findall(txt))
        mean_c = sum(w["c"] * len(w["t"]) for w in ws) / sum(len(w["t"]) for w in ws)
        if base < min_base or mean_c < line_min:
            continue
        keep.append(txt)
    return "\n".join(keep)


POST = {
    "raw": lambda r: clean_current(r["text"]),
    "junk": lambda r: filtered(r),
    "junk+line60": lambda r: filtered(r, line_min=60),
    "junk+line70": lambda r: filtered(r, line_min=70),
    "junk+word40": lambda r: filtered(r, word_min=40),
    "junk+word40+line60": lambda r: filtered(r, word_min=40, line_min=60),
}


def summarize(rows, key):
    agg = defaultdict(list)
    for r in rows:
        agg[key(r)].append(r)
    out = {}
    for k, rs in agg.items():
        out[k] = {
            "n": len(rs),
            "cer": sum(min(x["cer"], 1) for x in rs) / len(rs),
            "ins": sum(min(x["ins"], 1) for x in rs) / len(rs),
            "ok": sum(x["cer"] <= 0.10 for x in rs) / len(rs),
            "ms": sum(x.get("ms") or 0 for x in rs) / len(rs),
        }
    return out


def evaluate(path, post="raw"):
    rows = []
    for r in json.load(open(path, encoding="utf-8")):
        s = score(POST[post](r), r["sample"])
        rows.append({**{k: r.get(k) for k in ("scenario", "sample", "pipeline", "model", "psm", "lang", "ms")}, **s,
                     "post": post})
    return rows


def table(title, summ, order=None):
    print(f"\n## {title}")
    print(f"{'':22s} {'CER':>6s} {'ขยะ':>6s} {'ใช้ได้':>6s} {'ms':>6s}")
    for k in order or sorted(summ):
        if k in summ:
            v = summ[k]
            print(f"{str(k):22s} {v['cer']*100:5.1f}% {v['ins']*100:5.1f}% {v['ok']*100:5.0f}% {v['ms']:6.0f}")


if __name__ == "__main__":
    path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "pipelines"
    if mode == "pipelines":
        rows = evaluate(path, "raw")
        table("วิธีเตรียมภาพ (ทุกสถานการณ์)", summarize(rows, lambda r: r["pipeline"]))
        scen = sorted({r["scenario"] for r in rows}, key=lambda s: list(dict.fromkeys(r["scenario"] for r in rows)).index(s))
        print("\n## CER แยกตามสถานการณ์ (แถว) × วิธี (คอลัมน์)")
        pipes = sorted({r["pipeline"] for r in rows})
        print(f"{'':12s}" + "".join(f"{p[:12]:>14s}" for p in pipes))
        for s in scen:
            line = f"{s:12s}"
            for p in pipes:
                rs = [r for r in rows if r["scenario"] == s and r["pipeline"] == p]
                line += f"{sum(min(r['cer'], 1) for r in rs) / len(rs) * 100:13.1f}%"
            print(line)
    elif mode == "post":
        pipe = sys.argv[3]
        allrows = []
        for post in POST:
            rows = [r for r in evaluate(path, post) if r["pipeline"] == pipe]
            allrows += rows
        table(f"การกรองผลลัพธ์ (pipeline {pipe})", summarize(allrows, lambda r: r["post"]), list(POST))
    elif mode == "group":
        post = sys.argv[3]
        field = sys.argv[4]
        rows = evaluate(path, post)
        table(f"{field} ({post})", summarize(rows, lambda r: r[field]))
        print("\nแยกตามสถานการณ์:")
        table("", summarize(rows, lambda r: f"{r['scenario']}|{r[field]}"))
