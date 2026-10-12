// ทดสอบภาพจริงจากมือถือ: หมุนภาพ 0/90/180/270 แล้วดูว่า OCR อ่านได้แค่ไหน
// node real_test.mjs <image> [roi=full|guide]
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const [file, roiMode = "full"] = process.argv.slice(2);
const img = await loadImage(file);

const w = await Tesseract.createWorker(["tha", "eng"], 1, { cachePath: path.resolve("data/cache/best_int") });
await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });

for (const deg of [0, 90, 180, 270]) {
    const rot = deg % 180 !== 0;
    const c = createCanvas(rot ? img.height : img.width, rot ? img.width : img.height);
    const x = c.getContext("2d");
    x.translate(c.width / 2, c.height / 2);
    x.rotate((deg * Math.PI) / 180);
    x.drawImage(img, -img.width / 2, -img.height / 2);
    const roi = roiMode === "full" ? { x0: 0, y0: 0, x1: 1, y1: 1 } : NE.ROI;
    const p = NE.prepare(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, roi);
    const o = createCanvas(p.width, p.height);
    const id = o.getContext("2d").createImageData(p.width, p.height);
    id.data.set(p.rgba);
    o.getContext("2d").putImageData(id, 0, 0);
    const { data } = await w.recognize(o.toBuffer("image/png"));
    console.log(`--- rotate ${deg}°  conf=${Math.round(data.confidence)}  info=${JSON.stringify(p.info)}`);
    console.log(NE.filterLines(data, 60) || "(ว่าง)");
}
await w.terminate();
