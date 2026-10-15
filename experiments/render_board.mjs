// เรนเดอร์ข้อความบนกระดานเป็นก้อน ๆ (หัวเรื่อง / คอลัมน์ซ้าย / คอลัมน์ขวา) แบบลายมือเขียนกระดาน
// บรรทัดเอียงเล็กน้อยและตัวอักษรขยับขึ้นลงนิดหน่อย -> data/board/<id>_<part>.png
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";

const F = "C:/Windows/Fonts/";
for (const [name, file] of Object.entries({ SarabunB: "THSarabunNew Bold.ttf", LeelaB: "LeelaUIb.ttf", InkFree: "Inkfree.ttf" })) {
    if (!GlobalFonts.registerFromPath(F + file, name)) throw new Error(file);
}
fs.mkdirSync("data/board", { recursive: true });

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function render(text, font, size, out) {
    const lines = text.split("\n");
    const probe = createCanvas(10, 10).getContext("2d");
    probe.font = `${size}px "${font}"`;
    const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width)) * 1.08) + size;
    const lh = Math.round(size * 1.6);
    const h = lh * lines.length + size;
    const c = createCanvas(w, h);
    const x = c.getContext("2d");
    x.fillStyle = "#000";
    x.textBaseline = "alphabetic";
    lines.forEach((l, i) => {
        x.save();
        x.translate(size / 2, lh * (i + 1) - size * 0.2);
        x.rotate((rnd() - 0.5) * 0.04); // บรรทัดเอียงเหมือนเขียนมือ
        let cx = 0;
        // วาดทีละ "กลุ่มตัวอักษร" (ไม่แยกสระ/วรรณยุกต์ออกจากพยัญชนะ) ให้ขยับขึ้นลงนิดหน่อย
        const clusters = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(l)].map((s) => s.segment);
        x.font = `${size}px "${font}"`;
        for (const g of clusters) {
            x.fillText(g, cx, (rnd() - 0.5) * size * 0.06);
            cx += x.measureText(g).width * (1 + (rnd() - 0.5) * 0.06);
        }
        x.restore();
    });
    fs.writeFileSync(out, c.toBuffer("image/png"));
}

const { boards } = JSON.parse(fs.readFileSync("boards.json", "utf8"));
for (const b of boards) {
    const latin = !/[\u0E00-\u0E7F]/.test(b.title + b.left + b.right);
    const font = latin ? "InkFree" : b.id.charCodeAt(1) % 2 ? "SarabunB" : "LeelaB";
    const k = font === "SarabunB" ? 1.45 : 1;
    render(b.title, font, 120 * k, `data/board/${b.id}_title.png`);
    render(b.left, font, 92 * k, `data/board/${b.id}_left.png`);
    render(b.right, font, 92 * k, `data/board/${b.id}_right.png`);
}
console.log("rendered", boards.length, "boards");
