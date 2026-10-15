// เทียบ: พูดจากเฟรมเดียว vs รวมผล 2 เฟรม vs 3 เฟรม (กระดานจำลองที่มือสั่นนิด ๆ)
// node consensus_eval.mjs <out.json>
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const items = JSON.parse(fs.readFileSync("data/board_seq/manifest.json", "utf8"));
const scheduler = Tesseract.createScheduler();
for (let i = 0; i < 10; i++) {
    const w = await Tesseract.createWorker(["tha", "eng"], 1, { cachePath: path.resolve("data/cache/best_int") });
    await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    scheduler.addWorker(w);
}
const recognize = async (p) => {
    const oc = createCanvas(p.width, p.height);
    const id = oc.getContext("2d").createImageData(p.width, p.height);
    id.data.set(p.rgba);
    oc.getContext("2d").putImageData(id, 0, 0);
    return (await scheduler.addJob("recognize", oc.toBuffer("image/png"))).data;
};
async function read(file, opts) {
    const img = await loadImage(file);
    const c = createCanvas(img.width, img.height);
    c.getContext("2d").drawImage(img, 0, 0);
    return NE.readBest(c.getContext("2d").getImageData(0, 0, img.width, img.height).data, img.width, img.height, NE.ROI, recognize, 60, undefined, opts);
}
const out = [];
await Promise.all(items.map(async (it) => {
    const r0 = await read(it.frames[0], {});
    const more = { deg: r0.deg, inverted: r0.inverted };
    const [r1, r2] = await Promise.all([read(it.frames[1], more), read(it.frames[2], more)]);
    const c2 = NE.consensus([r0.text, r1.text], 2);
    // แบบปรับตัว: ถ้า 2 เฟรมเห็นตรงกันน้อย ค่อยอ่านเฟรมที่ 3 แล้วเอาที่ตรงกัน 2 ใน 3
    const adaptive = c2.agreed >= Math.max(1, Math.ceil(c2.total * 0.6)) ? c2 : NE.consensus([r0.text, r1.text, r2.text], 2);
    const gtClean = NE.cleanForSpeech(it.gt);
    const base = { scenario: it.scenario, sample: it.sample, gtClean };
    out.push({ ...base, pipeline: "1 เฟรม", text: r0.text });
    out.push({ ...base, pipeline: "2 เฟรมตรงกัน", text: c2.text });
    out.push({ ...base, pipeline: "2-3 เฟรม (ปรับตัว)", text: adaptive.text, frames: adaptive === c2 ? 2 : 3 });
    // ปรับตัวแบบ 2: มีบรรทัดไหนที่ยังไม่ได้รับการยืนยัน -> อ่านเฟรมที่ 3
    const adaptive2 = c2.agreed > 0 && c2.agreed >= c2.total ? c2 : NE.consensus([r0.text, r1.text, r2.text], 2);
    out.push({ ...base, pipeline: "2-3 เฟรม (ยืนยันทุกบรรทัด)", text: adaptive2.text, frames2: adaptive2 === c2 ? 2 : 3 });
    out.push({ ...base, pipeline: "2 ใน 3 เฟรม", text: NE.consensus([r0.text, r1.text, r2.text], 2).text });
}));
await scheduler.terminate();
fs.writeFileSync(process.argv[2], JSON.stringify(out));
const ad = out.filter((r) => r.frames);
const a2 = out.filter((r) => r.frames2);
console.log(`adaptive2 used 3 frames in ${a2.filter((r) => r.frames2 === 3).length}/${a2.length}`);
console.log(`done ${items.length} boards; adaptive used 3 frames in ${ad.filter((r) => r.frames === 3).length}/${ad.length}`);
