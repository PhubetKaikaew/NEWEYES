// NEW EYES — เตรียมภาพก่อนส่ง OCR + กรองผลลัพธ์
// ผลการทดลอง (experiments/) : CER 46% -> 11%, ภาพที่ฟังรู้เรื่อง 35% -> 84%
// ใช้ได้ทั้งในเบราว์เซอร์ (window.NEPrep) และใน Node (require) เพื่อทดสอบ
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.NEPrep = api;
})(typeof self !== "undefined" ? self : this, function () {
    // กรองนำสายตา (สัดส่วนของเฟรม) — อ่านเฉพาะข้างใน ตัดหัวกระดาษ/เลขหน้า/ของรอบ ๆ ทิ้ง
    const ROI = { x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.8 };
    const TARGET_CHAR_H = 20; // ความสูงตัวอักษรที่อ่านแม่นและเร็วที่สุดจากการทดลอง (ลอง 20/24/28 px)
    const NOISE_THR = 2;      // noise เกินนี้ = แสงน้อย -> เบลอเบา ๆ ก่อน และไม่เพิ่มความคม
    const MAX_PIXELS = 8e6;
    const MAX_ROI_W = 2400;   // ภาพจากกล้องความละเอียดสูงมาก ย่อก่อนเพื่อความเร็ว

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    // ---------- พื้นฐาน ----------

    function grayROI(rgba, W, H, roi = ROI) {
        const x0 = Math.round(W * roi.x0), y0 = Math.round(H * roi.y0);
        const w = Math.round(W * roi.x1) - x0, h = Math.round(H * roi.y1) - y0;
        const g = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            let i = ((y0 + y) * W + x0) * 4;
            for (let x = 0; x < w; x++, i += 4) {
                g[y * w + x] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
            }
        }
        return { g, w, h };
    }

    function resize(g, w, h, s) {
        const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
        if (s < 1) g = gaussian(g, w, h, 0.4 / s); // กัน aliasing ก่อนย่อ
        const o = new Float32Array(W * H);
        for (let y = 0; y < H; y++) { // bilinear
            const fy = clamp((y + 0.5) / s - 0.5, 0, h - 1), y0 = fy | 0, y1 = Math.min(y0 + 1, h - 1), dy = fy - y0;
            for (let x = 0; x < W; x++) {
                const fx = clamp((x + 0.5) / s - 0.5, 0, w - 1), x0 = fx | 0, x1 = Math.min(x0 + 1, w - 1), dx = fx - x0;
                const a = g[y0 * w + x0] + (g[y0 * w + x1] - g[y0 * w + x0]) * dx;
                const b = g[y1 * w + x0] + (g[y1 * w + x1] - g[y1 * w + x0]) * dx;
                o[y * W + x] = a + (b - a) * dy;
            }
        }
        return { g: o, w: W, h: H };
    }

    function gaussian(g, w, h, sigma) {
        const r = Math.max(1, Math.ceil(sigma * 3));
        const k = new Float32Array(2 * r + 1);
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += (k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)));
        for (let i = 0; i < k.length; i++) k[i] /= sum;
        const t = new Float32Array(w * h), o = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                let v = 0;
                for (let i = -r; i <= r; i++) v += g[row + clamp(x + i, 0, w - 1)] * k[i + r];
                t[row + x] = v;
            }
        }
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let v = 0;
                for (let i = -r; i <= r; i++) v += t[clamp(y + i, 0, h - 1) * w + x] * k[i + r];
                o[y * w + x] = v;
            }
        }
        return o;
    }

    function median(arr) {
        const a = Float32Array.from(arr).sort();
        return a.length ? a[a.length >> 1] : 0;
    }

    // ---------- วัดสภาพภาพ ----------

    /** noise ของภาพ (MAD ของส่วนต่างกับ median 3x3) */
    function noiseSigma(g, w, h) {
        const step = Math.max(1, Math.round(Math.sqrt((w * h) / 250000)));
        const d = [];
        const n9 = new Float32Array(9);
        for (let y = 1; y < h - 1; y += step) {
            for (let x = 1; x < w - 1; x += step) {
                let c = 0;
                for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) n9[c++] = g[(y + j) * w + x + i];
                n9.sort();
                d.push(g[y * w + x] - n9[4]);
            }
        }
        const md = median(d);
        return 1.4826 * median(d.map((v) => Math.abs(v - md)));
    }

    /** ความคม = variance ของ Laplacian (ใช้ตัดสินว่ากล้องนิ่ง/โฟกัสแล้วหรือยัง) */
    function sharpness(rgba, W, H) {
        let { g, w, h } = grayROI(rgba, W, H);
        if (w > 480) ({ g, w, h } = resize(g, w, h, 480 / w));
        let s = 0, s2 = 0, n = 0;
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
                s += v; s2 += v * v; n++;
            }
        }
        return n ? s2 / n - (s / n) ** 2 : 0;
    }

    // ---------- แก้แสง ----------

    function stretch(g) {
        const hist = new Uint32Array(256);
        for (let i = 0; i < g.length; i++) hist[clamp(Math.round(g[i]), 0, 255)]++;
        const pct = (p) => {
            let acc = 0;
            const lim = g.length * p;
            for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= lim) return v;
            return 255;
        };
        const hi = pct(0.995);
        const lo = Math.min(pct(0.003), hi - 80); // หมึกมักน้อยกว่า 1% ของภาพ
        const o = new Float32Array(g.length);
        for (let i = 0; i < g.length; i++) o[i] = clamp(((g[i] - lo) * 255) / (hi - lo), 0, 255);
        return o;
    }

    /** หารด้วยพื้นหลัง (สีกระดาษ) ที่ประมาณได้ -> ลบเงา/แสงไม่สม่ำเสมอ ตัวช่วยที่ได้ผลที่สุดในการทดลอง */
    function flat(g, w, h) {
        const k = Math.max(15, Math.min(w, h) >> 3);
        const b = Math.max(3, Math.round(k / 3));
        const sw = Math.ceil(w / b), sh = Math.ceil(h / b);
        let bg = new Float32Array(sw * sh);
        for (let y = 0; y < h; y++) {
            const Y = (y / b) | 0;
            for (let x = 0; x < w; x++) {
                const i = Y * sw + ((x / b) | 0);
                if (g[y * w + x] > bg[i]) bg[i] = g[y * w + x];
            }
        }
        bg = gaussian(bg, sw, sh, 1.0);
        const o = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            const fy = clamp((y + 0.5) / b - 0.5, 0, sh - 1), y0 = fy | 0, y1 = Math.min(y0 + 1, sh - 1), dy = fy - y0;
            for (let x = 0; x < w; x++) {
                const fx = clamp((x + 0.5) / b - 0.5, 0, sw - 1), x0 = fx | 0, x1 = Math.min(x0 + 1, sw - 1), dx = fx - x0;
                const a = bg[y0 * sw + x0] + (bg[y0 * sw + x1] - bg[y0 * sw + x0]) * dx;
                const c = bg[y1 * sw + x0] + (bg[y1 * sw + x1] - bg[y1 * sw + x0]) * dx;
                o[y * w + x] = clamp((g[y * w + x] / Math.max(a + (c - a) * dy, 1)) * 255, 0, 255);
            }
        }
        return stretch(o);
    }

    function unsharp(g, w, h) {
        const b = gaussian(g, w, h, 2.0);
        const o = new Float32Array(g.length);
        for (let i = 0; i < g.length; i++) o[i] = clamp(2 * g[i] - b[i], 0, 255);
        return o;
    }

    // ---------- ขนาดตัวอักษร ----------

    function otsu(g) {
        const hist = new Float64Array(256);
        for (let i = 0; i < g.length; i++) hist[clamp(Math.round(g[i]), 0, 255)]++;
        let sum = 0;
        for (let v = 0; v < 256; v++) sum += v * hist[v];
        let wB = 0, sB = 0, best = 0, thr = 128;
        for (let v = 0; v < 256; v++) {
            wB += hist[v];
            if (!wB) continue;
            const wF = g.length - wB;
            if (!wF) break;
            sB += v * hist[v];
            const mB = sB / wB, mF = (sum - sB) / wF;
            const between = wB * wF * (mB - mF) ** 2;
            if (between > best) { best = between; thr = v; }
        }
        return thr;
    }

    /** ความสูงตัวอักษรโดยประมาณ (มัธยฐานความสูงของก้อนหมึก) */
    function charHeight(g, w, h) {
        const f = flat(g, w, h);
        const thr = otsu(f);
        const lab = new Int32Array(w * h);
        const parent = [0];
        const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
        let next = 1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (f[i] > thr) continue;
                const ns = [];
                if (x > 0 && lab[i - 1]) ns.push(lab[i - 1]);
                if (y > 0) {
                    if (lab[i - w]) ns.push(lab[i - w]);
                    if (x > 0 && lab[i - w - 1]) ns.push(lab[i - w - 1]);
                    if (x < w - 1 && lab[i - w + 1]) ns.push(lab[i - w + 1]);
                }
                if (!ns.length) { lab[i] = next; parent.push(next++); continue; }
                let m = find(ns[0]);
                for (const n of ns) m = Math.min(m, find(n));
                for (const n of ns) parent[find(n)] = m;
                lab[i] = m;
            }
        }
        const box = new Map();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const l = lab[y * w + x];
                if (!l) continue;
                const r = find(l);
                let bb = box.get(r);
                if (!bb) box.set(r, (bb = [x, y, x, y, 0]));
                if (x < bb[0]) bb[0] = x; if (x > bb[2]) bb[2] = x;
                if (y < bb[1]) bb[1] = y; if (y > bb[3]) bb[3] = y;
                bb[4]++;
            }
        }
        const hs = [];
        for (const [x0, y0, x1, y1, area] of box.values()) {
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            if (bh >= 4 && bh < h * 0.3 && bw < w * 0.3 && area >= 8) hs.push(bh);
        }
        return hs.length >= 5 ? median(hs) : null;
    }

    // ---------- ทิศทางตัวหนังสือ ----------

    /** ความ "เป็นแถว" ของหมึก: บรรทัดตัวหนังสือทำให้ผลรวมหมึกรายแถวขึ้นลงเป็นจังหวะ (CV สูง) */
    function profileCV(ink, w, h, alongRows) {
        const n = alongRows ? h : w;
        const prof = new Float32Array(n);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) prof[alongRows ? y : x]++;
        let s = 0, s2 = 0;
        for (let i = 1; i < n - 1; i++) {
            const v = (prof[i - 1] + prof[i] + prof[i + 1]) / 3;
            s += v; s2 += v * v;
        }
        const m = s / (n - 2);
        return m > 0 ? Math.sqrt(Math.max(0, s2 / (n - 2) - m * m)) / m : 0;
    }

    /** ตัวหนังสือในกรอบเรียงแนวนอนหรือแนวตั้ง (มือถือถือแนวตั้งถ่ายการ์ดแนวนอน -> ตัวหนังสือหมุน 90°) */
    function textOrientation(rgba, W, H, roi = ROI) {
        let { g, w, h } = grayROI(rgba, W, H, roi);
        const s = 400 / Math.max(w, h);
        if (s < 1) ({ g, w, h } = resize(g, w, h, s));
        const f = flat(g, w, h);
        const thr = otsu(f);
        const ink = new Uint8Array(w * h);
        for (let i = 0; i < f.length; i++) ink[i] = f[i] <= thr ? 1 : 0;
        const rows = profileCV(ink, w, h, true), cols = profileCV(ink, w, h, false);
        return { vertical: cols > rows * 1.15, rows, cols };
    }

    // ---------- รวมทุกขั้นตอน ----------

    /** rgba ทั้งเฟรม -> ภาพขาวดำพร้อมส่ง OCR (เฉพาะในกรอบ) */
    function prepare(rgba, W, H, roi = ROI, targetH = TARGET_CHAR_H) {
        let { g, w, h } = grayROI(rgba, W, H, roi);
        if (w > MAX_ROI_W) ({ g, w, h } = resize(g, w, h, MAX_ROI_W / w));
        const noise = noiseSigma(g, w, h);
        const noisy = noise > NOISE_THR;
        if (noisy) g = gaussian(g, w, h, 0.8);
        const charH = charHeight(g, w, h);
        let s = charH ? clamp(targetH / charH, 0.5, 4) : 1;
        if (w * h * s * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h));
        if (Math.abs(s - 1) > 0.05) ({ g, w, h } = resize(g, w, h, s));
        if (!noisy) g = unsharp(g, w, h);
        g = flat(g, w, h);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let i = 0, j = 0; i < g.length; i++, j += 4) {
            out[j] = out[j + 1] = out[j + 2] = g[i];
            out[j + 3] = 255;
        }
        return { rgba: out, width: w, height: h, info: { noise, charH, scale: s } };
    }

    // ---------- กรองผลลัพธ์ ----------

    const THAI = /[฀-๿]/;
    const BASE = /[ก-ฮA-Za-z0-9]/g; // พยัญชนะไทย / ตัวอังกฤษ / ตัวเลข

    function joinWords(words) {
        let out = "";
        for (const t of words) {
            if (out && !(THAI.test(out[out.length - 1]) && THAI.test(t[0]))) out += " ";
            out += t;
        }
        return out;
    }

    const thaiLM = () => (typeof ThaiLM !== "undefined" ? ThaiLM : typeof require === "function" ? safeRequire("./thai-lm.js") : null);
    function safeRequire(p) {
        try { return require(p); } catch (e) { return null; }
    }
    const LM_JUNK = -6.3; // คะแนนภาษาไทยต่ำกว่านี้ = ขยะ (ข้อความจริง ≈ -3.5..-5, ขยะ ≈ -6.5..-8.5)

    /** ทิ้งบรรทัดขยะ (เช่นวรรณยุกต์ที่หลุดเป็นบรรทัดเดี่ยว "ะ ส ว"), บรรทัดที่ความมั่นใจต่ำ และบรรทัดที่ไม่เหมือนภาษาไทยจริง */
    function filterLines(data, lineMin = 60, minBase = 3) {
        const keep = [];
        const lm = thaiLM();
        for (const line of data.lines || []) {
            const ws = line.words.filter((w) => w.text.trim());
            if (!ws.length) continue;
            const txt = joinWords(ws.map((w) => w.text));
            const len = ws.reduce((a, w) => a + w.text.length, 0);
            const conf = ws.reduce((a, w) => a + w.confidence * w.text.length, 0) / len;
            if ((txt.match(BASE) || []).length < minBase || conf < lineMin) continue;
            if (lm) {
                const s = lm.score(txt);
                if (s.n >= 4 && s.perChar < LM_JUNK) continue;
            }
            keep.push(txt.replace(/\s+/g, " ").trim());
        }
        return keep.join("\n");
    }

    // ---------- ทำความสะอาดก่อนพูด ----------

    const LONE_MARK = /^[ะ-ฺเ-๎]+$/; // สระ/วรรณยุกต์ลอย ๆ
    /** ตัดสัญลักษณ์และเศษตัวอักษรที่ TTS จะอ่านออกมาเป็นเสียงแปลก ๆ */
    function cleanForSpeech(text) {
        const out = [];
        for (let line of text.split("\n")) {
            line = line.replace(/[^ก-๛A-Za-z0-9 .,?!:/%\-]/g, " ").replace(/\s+/g, " ").trim();
            const thai = (line.match(/[ก-๛]/g) || []).length;
            if (thai) {
                line = line
                    .replace(/(\d)\s*[-–]\s*(\d)/g, "$1 ถึง $2") // 08.30 - 16.30 -> 08.30 ถึง 16.30
                    .replace(/(\d)\s*[นu]\s*\.?(?=\s|$)/g, "$1 นาฬิกา"); // 16.30 น. -> 16.30 นาฬิกา (OCR มักอ่าน น เป็น u)
            }
            const latin = (line.match(/[A-Za-z]/g) || []).length;
            if (thai >= latin) {
                // บรรทัดภาษาไทย: ตัดคำอังกฤษ 1-2 ตัวที่หลุดมา (มักเป็นขยะจากรูปภาพ) และสระ/วรรณยุกต์ลอย
                let toks = line.split(" ").filter((t) => !/^[A-Za-z]{1,2}[.,:]?$/.test(t) && !LONE_MARK.test(t) && !/^[.,:\-/!?]+$/.test(t));
                // ตัวอักษรเดี่ยว ๆ ที่เรียงกันตั้งแต่ 2 ตัวขึ้นไป เช่น "ป 5 ด 6 ว 1" = เศษจากรูปภาพ
                const short = (t) => (t.match(/[ก-ฮA-Za-z0-9]/g) || []).length <= 1;
                toks = toks.filter((t, i) => !(short(t) && ((i > 0 && short(toks[i - 1])) || (i < toks.length - 1 && short(toks[i + 1])))));
                line = toks.join(" ");
            }
            if ((line.match(/[ก-ฮA-Za-z0-9]/g) || []).length >= 2) out.push(line);
        }
        return out.join("\n");
    }

    // ---------- หมุนภาพ + เลือกมุมที่อ่านได้ดีที่สุด ----------

    function cropRGBA(rgba, W, H, roi) {
        const x0 = Math.round(W * roi.x0), y0 = Math.round(H * roi.y0);
        const w = Math.round(W * roi.x1) - x0, h = Math.round(H * roi.y1) - y0;
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) out.set(rgba.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
        return { data: out, w, h };
    }

    /** หมุนภาพตามเข็มนาฬิกา 0/90/180/270 องศา */
    function rotateRGBA(img, deg) {
        const { data, w, h } = img;
        if (!deg) return img;
        const W = deg === 180 ? w : h, H = deg === 180 ? h : w;
        const out = new Uint8ClampedArray(W * H * 4);
        const u32 = new Uint32Array(data.buffer, data.byteOffset, w * h), o32 = new Uint32Array(out.buffer);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let X, Y;
                if (deg === 90) { X = h - 1 - y; Y = x; }
                else if (deg === 180) { X = w - 1 - x; Y = h - 1 - y; }
                else { X = y; Y = w - 1 - x; }
                o32[Y * W + X] = u32[y * w + x];
            }
        }
        return { data: out, w: W, h: H };
    }

    /** คะแนนความน่าเชื่อถือของผลอ่าน: อักษรไทยที่ "เหมือนภาษาไทยจริง" + อักษรอังกฤษถ่วงด้วยความมั่นใจ */
    function quality(text, conf) {
        const lm = thaiLM();
        const s = lm ? lm.score(text) : { perChar: -5, n: (text.match(/[ก-๛]/g) || []).length };
        const latin = (text.match(/[A-Za-z]/g) || []).length;
        const thaiQ = s.n ? s.n * clamp((s.perChar + 7) / 3, 0, 1) : 0;
        const q = thaiQ + latin * (conf / 100) ** 2;
        const good = (s.n >= 12 && s.perChar >= -5.3) || (s.n < 5 && latin >= 8 && conf >= 75);
        return { q, good, lm: s.perChar, thai: s.n, latin };
    }

    /**
     * อ่านข้อความในกรอบ โดยตรวจทิศทางตัวหนังสือก่อน แล้วลองมุมที่เป็นไปได้ เลือกมุมที่อ่านได้ดีที่สุด
     * recognize(prepared) -> Promise<tesseract data>
     */
    async function readBest(rgba, W, H, roi, recognize, lineMin = 60, targetH = TARGET_CHAR_H) {
        const crop = cropRGBA(rgba, W, H, roi);
        const full = { x0: 0, y0: 0, x1: 1, y1: 1 };
        const orient = textOrientation(crop.data, crop.w, crop.h, full);
        const order = orient.vertical ? [270, 90] : [0, 180];
        let best = null;
        for (const deg of order) {
            const r = rotateRGBA(crop, deg);
            const p = prepare(r.data, r.w, r.h, full, targetH);
            const data = await recognize(p);
            const text = cleanForSpeech(filterLines(data, lineMin));
            const qa = quality(text, data.confidence);
            const cur = { text, deg, prep: p, confidence: data.confidence, ...qa };
            if (!best || cur.q > best.q) best = cur;
            if (qa.good) break; // มุมแรกดีพอแล้ว ไม่ต้องลองมุมอื่น (ประหยัดเวลา)
        }
        best.vertical = orient.vertical;
        return best;
    }

    return {
        ROI, prepare, sharpness, filterLines, textOrientation, readBest, cleanForSpeech, quality,
        rotateRGBA, cropRGBA, grayROI, noiseSigma, charHeight,
    };
});
