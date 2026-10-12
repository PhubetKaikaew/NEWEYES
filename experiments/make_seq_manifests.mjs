// แปลง data/seq/manifest.json เป็นรายการภาพให้ ocr.mjs (ภาพดิบ = วิธีเดิม, ภาพเตรียมแล้ว = วิธีใหม่)
import fs from "node:fs";
const S = JSON.parse(fs.readFileSync("data/seq/manifest.json", "utf8"));
const a = [], b = [];
for (const s of S) for (const f of s.frames) {
    const base = { seq: s.sample, t: f.t, state: f.state, sample: f.sample, sharp: f.sharp, scenario: "seq" };
    a.push({ ...base, pipeline: "P0_current", path: f.path });
    b.push({ ...base, pipeline: "P9", path: f.prep });
}
fs.writeFileSync("data/seq/m_p0.json", JSON.stringify(a));
fs.writeFileSync("data/seq/m_p9.json", JSON.stringify(b));
console.log("frames", a.length);
