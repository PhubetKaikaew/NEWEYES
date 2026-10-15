// รันตัวอ่านของเว็บ (readBest) กับภาพกระดานจำลอง โดยปรับตัวเลือกได้
// node board_eval.mjs <manifest> <out.json> [--psm 6] [--polarity on|off] [--roi guide|full]
import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const NE = require("../docs/preprocess.js");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const [manifest, outPath] = args;
const psm = opt("psm", "6"), polarity = opt("polarity", "on") === "on", roiMode = opt("roi", "guide");
const items = JSON.parse(fs.readFileSync(manifest, "utf8"));

const scheduler = Tesseract.createScheduler();
for (let i = 0; i < 10; i++) {
    const w = await Tesseract.createWorker(["tha", "eng"], 1, { cachePath: path.resolve("data/cache/best_int") });
    await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" });
    scheduler.addWorker(w);
}
const out = await Promise.all(items.map(async (it) => {
    const img = await loadImage(it.path);
    const c = createCanvas(img.width, img.height);
    c.getContext("2d").drawImage(img, 0, 0);
    const recognize = async (p) => {
        const oc = createCanvas(p.width, p.height);
        const id = oc.getContext("2d").createImageData(p.width, p.height);
        id.data.set(p.rgba);
        oc.getContext("2d").putImageData(id, 0, 0);
        return (await scheduler.addJob("recognize", oc.toBuffer("image/png"))).data;
    };
    const roi = roiMode === "full" ? { x0: 0, y0: 0, x1: 1, y1: 1 } : roiMode === "wide" || roiMode === "wide+core" ? NE.READ_ROI : NE.ROI;
    const best = await NE.readBest(c.getContext("2d").getImageData(0, 0, img.width, img.height).data, img.width, img.height, roi, recognize, 60, undefined, { polarity, core: roiMode === "wide+core" ? NE.ROI : null });
    return { ...it, pipeline: `psm${psm}|pol-${polarity ? "on" : "off"}|${roiMode}`, text: best.text, gtClean: NE.cleanForSpeech(it.gt || ""), deg: best.deg, inverted: best.inverted, q: best.q, lm: best.lm };
}));
await scheduler.terminate();
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`done ${out.length} -> ${outPath}; inverted ${out.filter((r) => r.inverted).length}`);
