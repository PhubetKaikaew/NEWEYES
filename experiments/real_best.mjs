// ภาพจริง -> readBest (ตัวเดียวกับเว็บ)
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const w = await Tesseract.createWorker(["tha", "eng"], 1, { cachePath: path.resolve("data/cache/best_int") });
await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
const recognize = async (p) => {
    const o = createCanvas(p.width, p.height); const d = o.getContext("2d").createImageData(p.width, p.height);
    d.data.set(p.rgba); o.getContext("2d").putImageData(d, 0, 0);
    return (await w.recognize(o.toBuffer("image/png"))).data;
};
for (const f of process.argv.slice(2)) {
    const [file, roiMode] = f.split("#");
    const img = await loadImage(file);
    const c = createCanvas(img.width, img.height); c.getContext("2d").drawImage(img, 0, 0);
    const roi = roiMode === "guide" ? NE.ROI : { x0: 0, y0: 0, x1: 1, y1: 1 };
    const t = Date.now();
    const b = await NE.readBest(c.getContext("2d").getImageData(0, 0, img.width, img.height).data, img.width, img.height, roi, recognize);
    console.log(`=== ${file} ${roiMode || "full"}: deg=${b.deg} vertical=${b.vertical} q=${b.q.toFixed(0)} lm=${b.lm?.toFixed(2)} conf=${Math.round(b.confidence)} ${Date.now() - t}ms\n${b.text || "(ว่าง)"}`);
}
await w.terminate();
