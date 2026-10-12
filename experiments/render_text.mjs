// เรนเดอร์ข้อความตัวอย่างเป็น PNG พื้นใส ด้วย Skia (จัดสระ/วรรณยุกต์ไทยถูกต้องเหมือน Chrome)
// ผลลัพธ์: data/text/<id>.png และ data/text/clutter_<i>.png
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";

const F = "C:/Windows/Fonts/";
const fonts = {
    "THSarabunNew": "THSarabunNew.ttf",
    "Tahoma": "tahoma.ttf",
    "Leelawadee UI": "LeelawUI.ttf",
    "Angsana New": "AngsanaNew-01.ttf",
    "Arial": "arial.ttf",
    "Times New Roman": "times.ttf",
};
for (const [name, file] of Object.entries(fonts)) {
    if (!GlobalFonts.registerFromPath(F + file, name)) throw new Error("font failed: " + file);
}
// ฟอนต์ไทยแบบหนังสือ (Sarabun/Angsana) ตัวเล็กกว่าที่ขนาดเดียวกัน ใช้ขนาดใหญ่ขึ้นเหมือนเอกสารจริง (16pt vs 12pt)
const sizeMul = { "THSarabunNew": 1.4, "Angsana New": 1.45 };

const EM = 96; // ขนาดตอนเรนเดอร์ (ความละเอียดสูง แล้วค่อยย่อในฉาก)
fs.mkdirSync("data/text", { recursive: true });

function render(text, font, out) {
    const size = EM * (sizeMul[font] || 1);
    const lines = text.split("\n");
    const probe = createCanvas(10, 10).getContext("2d");
    probe.font = `${size}px "${font}"`;
    const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + size;
    const lh = Math.round(size * 1.55);
    const h = lh * lines.length + Math.round(size * 0.6);
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.font = `${size}px "${font}"`;
    ctx.fillStyle = "#151515";
    ctx.textBaseline = "alphabetic";
    lines.forEach((l, i) => ctx.fillText(l, size / 2, lh * (i + 1) - Math.round(size * 0.25)));
    fs.writeFileSync(out, c.toBuffer("image/png"));
    return { w, h, em: EM };
}

const cfg = JSON.parse(fs.readFileSync("samples.json", "utf8"));
const meta = {};
for (const s of cfg.samples) meta[s.id] = render(s.text, s.font, `data/text/${s.id}.png`);
cfg.clutter.forEach((t, i) => render(t, i % 2 ? "Tahoma" : "THSarabunNew", `data/text/clutter_${i}.png`));
fs.writeFileSync("data/text/meta.json", JSON.stringify(meta, null, 1));
console.log("rendered", Object.keys(meta).length, "samples +", cfg.clutter.length, "clutter");
