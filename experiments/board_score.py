"""ให้คะแนนผลอ่านกระดาน
CER   = ความผิดพลาดตามลำดับ (ผิด/หาย/เกิน + เรียงผิด)
BAG   = ความผิดพลาดแบบไม่สนลำดับ (นับตัวอักษรเป็นถุง) -> CER - BAG ≈ ส่วนที่เกิดจาก "เรียงผิด"
OK%   = ภาพที่ CER <= 10%
"""
import json
import re
import sys
from collections import Counter, defaultdict

import analyze as A

P = lambda s: re.sub(r"[^ก-๛A-Za-z0-9]", "", A.norm(s))


def score(r):
    g, p = P(r["gtClean"]), P(r["text"])
    S, D, I = A.align(p, g)
    cg, cp = Counter(g), Counter(p)
    bag = (sum((cg - cp).values()) + sum((cp - cg).values())) / max(len(g), 1)
    return min((S + D + I) / max(len(g), 1), 1), min(bag, 1)


rows = defaultdict(list)
for f in sys.argv[1:]:
    for r in json.load(open(f, encoding="utf-8")):
        c, b = score(r)
        rows[r["pipeline"]].append((r["scenario"], c, b))

for pipe, rs in rows.items():
    n = len(rs)
    print(f"\n## {pipe}   CER {100*sum(x[1] for x in rs)/n:5.1f}%  BAG {100*sum(x[2] for x in rs)/n:5.1f}%  OK {100*sum(x[1]<=.1 for x in rs)/n:3.0f}%")
    by = defaultdict(list)
    for s, c, b in rs:
        by[s].append((c, b))
    print("   " + "  ".join(f"{s}={100*sum(x[0] for x in v)/len(v):.0f}/{100*sum(x[1] for x in v)/len(v):.0f}" for s, v in by.items()))
