"""สร้างโมเดลภาษาไทยระดับตัวอักษร (trigram + stupid backoff) จากความถี่คำ TNC แล้วบีบอัดเป็น docs/thai-lm.js"""
import json, math, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
C=json.load(open('ngram_counts.json',encoding='utf-8'))
uni,bi,tri=C['uni'],C['bi'],C['tri']
N=sum(uni.values())
MIN_TRI=int(sys.argv[1]) if len(sys.argv)>1 else 10
STEP=0.25  # ความละเอียดของ -log2 p ที่เก็บ

def q(p):  # quantize -log2 p
    return min(90, max(0, round(-math.log2(p)/STEP)))
P_uni={c:q(v/N) for c,v in uni.items()}
P_bi={k:q(v/uni[k[0]]) for k,v in bi.items()}
P_tri={k:q(v/bi[k[:2]]) for k,v in tri.items() if v>=MIN_TRI}

def lp(a,b,c):
    if a+b+c in P_tri: return -P_tri[a+b+c]*STEP
    if b+c in P_bi: return math.log2(0.4)-P_bi[b+c]*STEP
    return 2*math.log2(0.4)-P_uni.get(c,90)*STEP - 4  # ตัวอักษรแปลก ๆ โดนหนัก
def score(text):
    tot=n=0
    for r in re.findall(r'[\u0E01-\u0E5B]+',text):
        s='^^'+r+'$'
        for i in range(2,len(s)): tot+=lp(s[i-2],s[i-1],s[i]); n+=1
    return (tot/n if n else None)

T=eval("{"+open('lm_score.py',encoding='utf-8').read().split("T={",1)[1].split("}\n",1)[0]+"}")
for k,t in T.items(): print(f'{k:8s} {score(t):6.2f}')

# บีบอัด: map อักษรไทย U+0E01..U+0E5B -> ASCII 0x23.. (1 ไบต์), ^ -> '!', $ -> '"'
def enc(ch):
    if ch=='^': return '!'
    if ch=='$': return '"'
    return chr(0x23+ord(ch)-0x0E01)
def table(d):
    return ''.join(''.join(enc(c) for c in k)+chr(0x30+v) for k,v in sorted(d.items()))
out={'step':STEP,'uni':table(P_uni),'bi':table(P_bi),'tri':table(P_tri)}
js=f"""// โมเดลภาษาไทยระดับตัวอักษร (trigram, stupid backoff) สร้างจากความถี่คำของ Thai National Corpus (ผ่าน PyThaiNLP)
// ใช้ให้คะแนนว่าข้อความที่ OCR อ่านได้ "หน้าตาเหมือนภาษาไทยจริง" แค่ไหน: ข้อความจริง ≈ -3.5..-5, ขยะ ≈ -8
// สร้างด้วย experiments/build_lm.py — อย่าแก้ด้วยมือ
(function (root, factory) {{
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.ThaiLM = api;
}})(typeof self !== "undefined" ? self : this, function () {{
    const D = {json.dumps(out, ensure_ascii=True)};
    const dec = (c) => (c === "!" ? "^" : c === '"' ? "$" : String.fromCharCode(c.charCodeAt(0) - 0x23 + 0x0E01));
    function load(s, n) {{
        const m = new Map();
        for (let i = 0; i < s.length; i += n + 1) {{
            let k = "";
            for (let j = 0; j < n; j++) k += dec(s[i + j]);
            m.set(k, (s.charCodeAt(i + n) - 0x30) * D.step);
        }}
        return m;
    }}
    let U, B, T;
    const L04 = Math.log2(0.4);
    function lp(a, b, c) {{
        const t = T.get(a + b + c);
        if (t !== undefined) return -t;
        const bb = B.get(b + c);
        if (bb !== undefined) return L04 - bb;
        const u = U.get(c);
        return 2 * L04 - (u === undefined ? 22.5 : u) - 4;
    }}
    /** คะแนนเฉลี่ย log2 ต่อตัวอักษรไทย (null ถ้าไม่มีอักษรไทย) และจำนวนตัวอักษร */
    function score(text) {{
        if (!U) {{ U = load(D.uni, 1); B = load(D.bi, 2); T = load(D.tri, 3); }}
        let tot = 0, n = 0;
        for (const run of text.match(/[\u0E01-\u0E5B]+/g) || []) {{
            const s = "^^" + run + "$";
            for (let i = 2; i < s.length; i++) {{ tot += lp(s[i - 2], s[i - 1], s[i]); n++; }}
        }}
        return {{ perChar: n ? tot / n : null, n }};
    }}
    return {{ score }};
}});
"""
open(sys.argv[2] if len(sys.argv)>2 else 'thai-lm.js','w',encoding='utf-8').write(js)
print('tri kept',len(P_tri),'js bytes',len(js.encode()))
