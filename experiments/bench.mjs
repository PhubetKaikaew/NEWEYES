// วัดเวลาแต่ละขั้นของ readBest (worker เดียว รันทีละภาพ = ใกล้เคียงการใช้งานจริงบนมือถือ)
// node bench.mjs [--invert 0|1] [--model best_int|fast] [--lean 0|1] [--targetH 20]
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const invert = opt("invert", "1"), model = opt("model", "best_int"), lean = opt("lean", "0") === "1";
const targetH = Number(opt("targetH", "20"));

const wopts = { cachePath: path.resolve("data/cache", model) };
if (model !== "best_int") Object.assign(wopts, { langPath: path.resolve("data/models", model), gzip: false });
const w = await Tesseract.createWorker(["tha", "eng"], 1, wopts);
await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1", tessedit_do_invert: invert });
const output = lean ? { text: true, blocks: true, hocr: false, tsv: false } : undefined;

const docs = JSON.parse(fs.readFileSync("data/scenes/manifest.json")).filter((_, i) => i % 5 === 0);
const boards = JSON.parse(fs.readFileSync("data/board_scenes/manifest.json")).filter((_, i) => i % 3 === 0);
const files = [...docs.map((d) => d.path), ...boards.map((b) => b.path), "data/real/card_frame.png"];
const T = {};
const t0 = Date.now();
for (const f of files) {
    const img = await loadImage(f);
    const c = createCanvas(img.width, img.height);
    c.getContext("2d").drawImage(img, 0, 0);
    const rec = async (p) => {
        const o = createCanvas(p.width, p.height);
        const id = o.getContext("2d").createImageData(p.width, p.height);
        id.data.set(p.rgba);
        o.getContext("2d").putImageData(id, 0, 0);
        const png = o.toBuffer("image/png");
        return (await w.recognize(png, {}, output)).data;
    };
    await NE.readBest(c.getContext("2d").getImageData(0, 0, img.width, img.height).data, img.width, img.height, NE.ROI, rec, 60, targetH, { timing: T });
}
const n = files.length;
const total = (Date.now() - t0) / n;
const rows = Object.entries(T).filter(([k]) => !k.startsWith("ocr") || k === "ocr").map(([k, v]) => `${k} ${(v / n).toFixed(0)}`);
console.log(`[invert=${invert} model=${model} lean=${lean} targetH=${targetH}] ${n} ภาพ, เฉลี่ย ${total.toFixed(0)} ms/ภาพ | OCR ${T.ocrCalls / n} ครั้ง/ภาพ ${(T.ocrPixels / T.ocrCalls / 1e6).toFixed(2)} MP | ${rows.join(" · ")}`);
await w.terminate();
