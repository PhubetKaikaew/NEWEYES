// รันโค้ดจริงของเว็บ (docs/preprocess.js) กับภาพจำลองทั้ง 100 ภาพ เพื่อยืนยันว่าแม่นเท่าผลทดลองใน Python
// node validate_js.mjs <out.json> [psm]
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const [outPath, psm = "6"] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync("data/scenes/manifest.json", "utf8"));

const scheduler = Tesseract.createScheduler();
for (let i = 0; i < 10; i++) {
    const w = await Tesseract.createWorker(["tha", "eng"], 1, { cachePath: path.resolve("data/cache/best_int") });
    await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" });
    scheduler.addWorker(w);
}

let prepMs = 0;
const out = await Promise.all(items.map(async (it) => {
    const img = await loadImage(it.path);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const recognize = async (p) => {
        const oc = createCanvas(p.width, p.height);
        const id = oc.getContext("2d").createImageData(p.width, p.height);
        id.data.set(p.rgba);
        oc.getContext("2d").putImageData(id, 0, 0);
        return (await scheduler.addJob("recognize", oc.toBuffer("image/png"))).data;
    };
    const t = Date.now();
    const best = await NE.readBest(data, img.width, img.height, NE.ROI, recognize, 60, Number(process.env.TARGET_H || 28));
    prepMs += Date.now() - t;
    return { ...it, pipeline: "JS_best|" + psm, psm, text: best.text, deg: best.deg, q: best.q, lm: best.lm, info: best.prep.info, words: [] };
}));
await scheduler.terminate();
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`done ${out.length}, avg ${(prepMs / out.length).toFixed(0)} ms/frame (incl. OCR, parallel)`);
