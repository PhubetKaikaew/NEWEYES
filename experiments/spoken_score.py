"""แยกความผิดพลาดเป็น "พูดผิด" (แทนที่ + เกินมา = ได้ยินคำผิด) กับ "พูดไม่ครบ" (ตกหล่น)"""
import json
import re
import sys
from collections import defaultdict

import analyze as A

P = lambda s: re.sub(r"[^ก-๛A-Za-z0-9]", "", A.norm(s))
rows = defaultdict(list)
for r in json.load(open(sys.argv[1], encoding="utf-8")):
    g, p = P(r["gtClean"]), P(r["text"])
    S, D, I = A.align(p, g)
    n = max(len(g), 1)
    rows[r["pipeline"]].append({"wrong": min((S + I) / n, 1), "miss": min(D / n, 1), "cer": min((S + D + I) / n, 1),
                                "clean": (S + I) / n <= 0.03, "scen": r["scenario"]})
print(f"{'วิธี':22s} {'พูดผิด':>7s} {'ไม่ครบ':>7s} {'CER':>6s} {'ไม่มีคำผิดเลย':>14s}")
for k, v in rows.items():
    n = len(v)
    print(f"{k:22s} {100*sum(x['wrong'] for x in v)/n:6.1f}% {100*sum(x['miss'] for x in v)/n:6.1f}% "
          f"{100*sum(x['cer'] for x in v)/n:5.1f}% {100*sum(x['clean'] for x in v)/n:12.0f}%")
