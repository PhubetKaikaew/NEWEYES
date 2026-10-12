// ภาพการ์ดจริง: เทียบ gray แบบ luminance กับ min-channel ที่มุม 270° + ทดสอบตัวตรวจทิศทาง
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const LM = require("../docs/thai-lm.js");
const img = await loadImage(process.argv[2]);
const w = await Tesseract.createWorker(["tha", "eng"], 1, { cachePath: path.resolve("data/cache/best_int") });
await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
function rotated(deg) {
    const rot = deg % 180 !== 0;
    const c = createCanvas(rot ? img.height : img.width, rot ? img.width : img.height);
    const x = c.getContext("2d");
    x.translate(c.width / 2, c.height / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(img, -img.width / 2, -img.height / 2);
    return x.getImageData(0, 0, c.width, c.height);
}
const full = { x0: 0, y0: 0, x1: 1, y1: 1 };
for (const deg of [0, 90, 180, 270]) {
    const id = rotated(deg);
    console.log(`rot ${deg}: orientation=${JSON.stringify(NE.textOrientation ? NE.textOrientation(id.data, id.width, id.height, full) : null)}`);
}
for (const mode of ["lum", "min"]) {
    const id = rotated(270);
    if (mode === "min") for (let i = 0; i < id.data.length; i += 4) { const m = Math.min(id.data[i], id.data[i + 1], id.data[i + 2]); id.data[i] = id.data[i + 1] = id.data[i + 2] = m; }
    const p = NE.prepare(id.data, id.width, id.height, full);
    const o = createCanvas(p.width, p.height); const d = o.getContext("2d").createImageData(p.width, p.height); d.data.set(p.rgba); o.getContext("2d").putImageData(d, 0, 0);
    const { data } = await w.recognize(o.toBuffer("image/png"));
    const t = NE.filterLines(data, 60);
    console.log(`--- ${mode} conf=${Math.round(data.confidence)} lm=${JSON.stringify(LM.score(t))}\n${t}`);
}
await w.terminate();
