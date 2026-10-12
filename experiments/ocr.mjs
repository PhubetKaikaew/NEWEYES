// รัน Tesseract.js (ตัวเดียวกับในเว็บ) กับรายการภาพ แล้วเก็บผลเป็น JSON
// node ocr.mjs <manifest.json> <out.json> [--lang tha+eng] [--psm 3] [--model best_int|best|fast] [--workers 6] [--where key=value,...]
import Tesseract from "tesseract.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const opt = (k, d) => {
    const i = args.indexOf("--" + k);
    return i >= 0 ? args[i + 1] : d;
};
const [manifest, outPath] = args;
const lang = opt("lang", "tha+eng");
const psm = opt("psm", "3");
const model = opt("model", "best_int");
const nWorkers = Number(opt("workers", Math.max(2, os.cpus().length - 2)));
const where = Object.fromEntries((opt("where", "") || "").split(",").filter(Boolean).map((kv) => kv.split("=")));

let items = JSON.parse(fs.readFileSync(manifest, "utf8"));
items = items.filter((it) => Object.entries(where).every(([k, v]) => v.split("|").includes(String(it[k]))));

const workerOpts = { cachePath: path.resolve("data/cache", model) };
if (model !== "best_int") Object.assign(workerOpts, { langPath: path.resolve("data/models", model), gzip: false });
fs.mkdirSync(workerOpts.cachePath, { recursive: true });

const scheduler = Tesseract.createScheduler();
for (let i = 0; i < nWorkers; i++) {
    const w = await Tesseract.createWorker(lang.split("+"), 1, workerOpts);
    await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1" });
    scheduler.addWorker(w);
}

const t0 = Date.now();
let done = 0;
const results = await Promise.all(
    items.map(async (it) => {
        const s = Date.now();
        const { data } = await scheduler.addJob("recognize", it.path);
        if (++done % 50 === 0) console.error(`${done}/${items.length}`);
        return {
            ...it,
            lang, psm, model,
            ms: Date.now() - s,
            text: data.text,
            confidence: data.confidence,
            words: (data.words || []).map((w) => ({ t: w.text, c: Math.round(w.confidence), line: w.line?.bbox?.y0 ?? null })),
        };
    })
);
await scheduler.terminate();
fs.writeFileSync(outPath, JSON.stringify(results));
console.log(`OCR ${results.length} images in ${((Date.now() - t0) / 1000).toFixed(1)}s (${nWorkers} workers) -> ${outPath}`);
