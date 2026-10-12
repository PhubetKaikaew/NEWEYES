"""จำลอง "อ่านอัตโนมัติ" บนวิดีโอ: ขยับกล้อง -> นิ่ง (หน้า A) -> ขยับ -> นิ่ง (หน้า B)

เทียบนโยบายเดิมในเว็บ (OCR ทุก 2.5 วินาที) กับนโยบายใหม่ (รอภาพคม + ผลอ่านตรงกัน 2 ครั้ง)
สมมติ: OCR บนมือถือใช้เวลา 1.5 วิ, TTS ภาษาไทยพูด ~11 ตัวอักษร/วินาที ที่ความเร็ว 1.0
"""
import io
import json
import sys

import analyze as A

OCR_SEC = float(__import__("os").environ.get("OCR_SEC", "1.5"))
CHARS_PER_SEC = 11


def load(path):
    by = {}
    for r in json.load(open(path, encoding="utf-8")):
        by.setdefault(r["seq"], []).append(r)
    return {k: sorted(v, key=lambda r: r["t"]) for k, v in by.items()}


def speak_secs(text, rate):
    return len(A.norm(text)) / (CHARS_PER_SEC * rate)


def run(frames, policy):
    utt = []
    t_free = 0.0       # เวลาที่ว่าง (ไม่ได้ OCR / ไม่ได้พูด)
    last_spoken = ""
    prev_ok = None     # ผล OCR ครั้งก่อนที่ผ่านเกณฑ์ (ใช้กับ agreement)
    recent = []        # ความคมย้อนหลัง
    prev_sharp = 0.0
    for f in frames:
        t = f["t"]
        recent = (recent + [f["sharp"]])[-10:]
        ps, prev_sharp = prev_sharp, f["sharp"]  # ความคมถูกวัดทุกเฟรม แม้ตอนกำลัง OCR/พูด
        if policy["kind"] == "current":
            if t % 2.5 != 0 or t < t_free:
                continue
            text = A.POST["raw"](f)
            t_free = t + OCR_SEC
            if len(A.norm(text)) < 3 or f["confidence"] < 45:
                continue
            if A_sim(text, last_spoken) >= 0.8:
                continue
        else:
            if t < t_free:
                continue
            gate = max(policy["abs_min"], policy["rel"] * max(recent))
            if f["sharp"] < gate:
                prev_ok = None
                continue
            # นิ่งจริง = เฟรมก่อนหน้าก็คม และความคมไม่เปลี่ยนเกิน 35%
            if policy.get("stable") and (ps < gate or abs(f["sharp"] - ps) / max(f["sharp"], ps) > 0.35):
                continue
            t_free = t + OCR_SEC
            text = A.POST[policy["post"]](f)
            if len(A.norm(text)) < 3:
                prev_ok = None
                continue
            if policy["agree"]:
                agreed = prev_ok is not None and A_sim(text, prev_ok) >= 0.8
                prev_ok = text
                if not agreed:
                    continue
            if A_sim(text, last_spoken) >= 0.8:
                continue
        start = t_free
        dur = speak_secs(text, policy.get("rate", 0.9))
        t_free = start + dur
        last_spoken = text
        utt.append({"t": start, "page": f["sample"], "cer": A.score(text, f["sample"])["cer"], "text": text})
    return utt


def A_sim(a, b):
    a, b = A.norm(a), A.norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    pa = {}
    for i in range(len(a) - 1):
        pa[a[i:i + 2]] = pa.get(a[i:i + 2], 0) + 1
    hit = 0
    for i in range(len(b) - 1):
        p = b[i:i + 2]
        if pa.get(p):
            hit += 1
            pa[p] -= 1
    return 2 * hit / max(len(a) + len(b) - 2, 1)


POLICIES = {
    "เดิม: ทุก 2.5 วิ (P0, psm3)":           ("seq_p0", {"kind": "current"}),
    "ใหม่: รอภาพคม (P9)":                    ("seq_p9", {"kind": "new", "abs_min": 12, "rel": 0.5, "post": "junk+line60", "agree": False}),
    "ใหม่: รอภาพคม + อ่านตรงกัน 2 ครั้ง":     ("seq_p9", {"kind": "new", "abs_min": 12, "rel": 0.5, "post": "junk+line60", "agree": True}),
    "ใหม่: รอภาพนิ่ง 2 เฟรม (P9)":            ("seq_p9", {"kind": "new", "abs_min": 12, "rel": 0.5, "post": "junk+line60", "agree": False, "stable": True}),
    "ใหม่: รอภาพนิ่ง 2 เฟรม + ตรงกัน 2 ครั้ง":  ("seq_p9", {"kind": "new", "abs_min": 12, "rel": 0.5, "post": "junk+line60", "agree": True, "stable": True}),
    "ใหม่: ไม่รอภาพคม (P9)":                ("seq_p9", {"kind": "new", "abs_min": 0, "rel": 0, "post": "junk+line60", "agree": False}),
}

if __name__ == "__main__":
    print(f"{'นโยบาย':40s} {'พูด':>4s} {'ถูก':>4s} {'มั่ว':>4s} {'ซ้ำ':>4s} {'หน้าที่อ่านถูก':>14s} {'รอ(วิ)':>7s}")
    for name, (src, pol) in POLICIES.items():
        seqs = load(f"results/{src}.json")
        tot = good = bad = rep = covered = 0
        lat = []
        for k, frames in seqs.items():
            u = run(frames, pol)
            tot += len(u)
            good += sum(x["cer"] <= 0.10 for x in u)
            bad += sum(x["cer"] > 0.30 for x in u)
            pages = [frames[0]["sample"] if True else None, frames[-1]["sample"]]
            for pi, page in enumerate(pages):
                still_t = min(f["t"] for f in frames if f["sample"] == page and f["state"] == "still")
                ok = [x for x in u if x["page"] == page and x["cer"] <= 0.10]
                spoken = [x for x in u if x["page"] == page]
                rep += max(0, len(spoken) - 1)
                if ok:
                    covered += 1
                    lat.append(ok[0]["t"] - still_t)
        n_pages = 2 * len(seqs)
        print(f"{name:40s} {tot:4d} {good:4d} {bad:4d} {rep:4d} {covered:>8d}/{n_pages:<5d} {sum(lat) / max(len(lat), 1):7.1f}")
    if len(sys.argv) > 1:
        src, pol = POLICIES[sys.argv[1]]
        for k, frames in load(f"results/{src}.json").items():
            for x in run(frames, pol):
                print(k, f"t={x['t']:.1f}", x["page"], f"CER={x['cer']:.2f}", repr(x["text"][:60]))
