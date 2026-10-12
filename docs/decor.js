// NEW EYES — ของตกแต่ง: ภาพตัดแปะที่วาดด้วยโค้ด + ผีเสื้อกระดาษตอนเปิดหน้าเว็บ
// ไม่มีผลกับการทำงานของตัวอ่าน และปิดการเคลื่อนไหวเองถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว
(function () {
    const root = document.documentElement;
    const css = getComputedStyle(root);
    const cv = (k) => css.getPropertyValue(k).trim();
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function rng(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function canvasOf(w, h) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        return c;
    }
    function grainPixels(ctx, w, h, amp) {
        const img = ctx.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() - 0.5) * amp;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
    }
    // วาดรูปหลายเหลี่ยมขอบหยัก เหมือนกระดาษที่ฉีก/ตัดด้วยมือ
    function torn(x, pts, r, jitter, fill) {
        x.fillStyle = fill;
        x.beginPath();
        pts.forEach(([px, py], i) => {
            const jx = px + (r() - 0.5) * jitter, jy = py + (r() - 0.5) * jitter;
            i ? x.lineTo(jx, jy) : x.moveTo(jx, jy);
        });
        x.closePath();
        x.fill();
    }
    const circle = (cx, cy, rad, n = 64) =>
        Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * rad, cy + Math.sin((i / n) * 2 * Math.PI) * rad]);

    // ---------- ภาพตัดแปะ ----------
    const painters = {
        // ดวงตากระดาษตัดแปะ + จุดอักษรเบรลล์ = "ดวงตาคู่ใหม่"
        eye() {
            const w = 1600, h = 800, c = canvasOf(w, h), x = c.getContext("2d"), r = rng(11);
            x.fillStyle = cv("--cut-1"); x.fillRect(0, 0, w, h);
            torn(x, [[-20, 90], [520, 40], [560, 220], [-20, 300]], r, 14, cv("--cut-2"));
            torn(x, [[980, 560], [1640, 470], [1640, 860], [940, 860]], r, 14, cv("--cut-4"));
            torn(x, [[1180, -20], [1460, -20], [1380, 330], [1150, 260]], r, 12, cv("--cut-5"));

            // จุดเบรลล์นูนด้านขวา
            for (let gx = 0; gx < 9; gx++) {
                for (let gy = 0; gy < 3; gy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        if (r() < 0.45) continue;
                        const px = 1080 + gx * 52 + dx * 18, py = 330 + gy * 20 + Math.floor(gx / 3) * 0;
                        x.fillStyle = "rgba(243,238,230,.85)";
                        x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill();
                    }
                }
            }

            // ตา: เปลือกตา (ทรงอัลมอนด์) -> ม่านตา -> รูม่านตา -> แสงสะท้อน
            const cx = 640, cy = 430, ew = 760, eh = 230, pts = [];
            for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([cx - ew / 2 + ew * t, cy - Math.sin(Math.PI * t) * eh]); }
            for (let i = 40; i >= 0; i--) { const t = i / 40; pts.push([cx - ew / 2 + ew * t, cy + Math.sin(Math.PI * t) * eh * 0.8]); }
            x.save(); x.translate(12, 16); torn(x, pts, r, 10, "rgba(0,0,0,.35)"); x.restore(); // เงากระดาษ
            torn(x, pts, r, 10, cv("--cream"));
            torn(x, circle(cx, cy, 165), r, 9, cv("--cut-5"));
            torn(x, circle(cx, cy, 118), r, 8, cv("--cut-3"));
            torn(x, circle(cx, cy, 68), r, 6, cv("--cut-4"));
            torn(x, circle(cx - 34, cy - 40, 24, 24), r, 4, cv("--cream"));

            grainPixels(x, w, h, 34);
            return c.toDataURL("image/jpeg", 0.85);
        },
        horizon() {
            const w = 1400, h = 800, c = canvasOf(w, h), x = c.getContext("2d");
            const g = x.createLinearGradient(0, 0, 0, h);
            [[0, "#0B1426"], [0.32, "#26508E"], [0.52, "#7F97C4"], [0.63, "#C69A8A"], [0.7, "#E27A40"],
             [0.735, "#B8401F"], [0.76, "#2A1610"], [1, "#141413"]].forEach(([o, col]) => g.addColorStop(o, col));
            x.fillStyle = g; x.fillRect(0, 0, w, h);
            grainPixels(x, w, h, 22);
            return c.toDataURL("image/jpeg", 0.82);
        },
    };
    document.querySelectorAll("[data-paint]").forEach((el) => {
        const p = painters[el.dataset.paint];
        if (p) el.style.backgroundImage = `url(${p()})`;
    });

    // ---------- ผีเสื้อกระดาษ ----------
    const cream = cv("--cream");
    const PALETTES = [
        [cv("--cut-1"), cv("--cut-5"), cream],
        [cv("--cut-2"), cv("--cut-4"), cream],
        [cv("--cut-3"), cv("--cut-5"), cream],
        [cv("--cut-5"), cv("--cut-2"), cv("--cut-4")],
        [cream, cv("--cut-1"), cv("--cut-2")],
        [cv("--cut-2"), cv("--cut-5"), cv("--cut-4")],
    ];

    function butterflySVG([c1, c2, c3]) {
        const edge = `stroke="${cream}" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"`;
        const wing = `
            <path d="M-2,-4 C-16,-40 -50,-42 -46,-14 C-43,3 -22,5 -2,2 Z" fill="${c1}" ${edge}/>
            <path d="M-2,2 C-24,6 -42,22 -31,37 C-20,47 -6,28 -2,8 Z" fill="${c1}" ${edge}/>
            <path d="M-9,-7 C-20,-29 -39,-31 -38,-16 C-36,-6 -21,-3 -9,-3 Z" fill="${c2}"/>
            <circle cx="-31" cy="-21" r="4.2" fill="${c3}"/>
            <circle cx="-22" cy="26" r="5" fill="${c2}"/>`;
        return `
        <svg viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
            <g class="paper">
                <g class="wing">${wing}</g>
                <g transform="scale(-1,1)"><g class="wing">${wing}</g></g>
                <ellipse cx="0" cy="2" rx="2.6" ry="17" fill="${cv("--cut-4")}" ${edge}/>
                <path d="M-1,-14 C-4,-24 -9,-30 -13,-32 M1,-14 C4,-24 9,-30 13,-32" stroke="${cv("--cut-4")}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
            </g>
        </svg>`;
    }

    function makeButterfly(i, size) {
        const el = document.createElement("div");
        el.className = "bf";
        el.style.setProperty("--size", `${size}px`);
        el.style.setProperty("--flap", `${(0.2 + Math.random() * 0.12).toFixed(2)}s`);
        el.style.setProperty("--rest-delay", `${(-Math.random() * 5).toFixed(2)}s`);
        el.innerHTML = butterflySVG(PALETTES[i % PALETTES.length]);
        return el;
    }

    // จุดที่ผีเสื้อจะเกาะ (สัดส่วนของกล่อง element นั้น + มุมเอียง)
    const PERCHES = [
        { sel: ".hero-title .latin", ax: 0.98, ay: 0.12, rot: 24, size: 1.15 },
        { sel: ".logo-wrap", ax: 0.02, ay: 0.88, rot: -32, size: 0.85 },
        { sel: "#readerTitle", ax: 0.96, ay: 0.35, rot: -12, size: 1 },
    ];

    function perchPoint(p) {
        const el = document.querySelector(p.sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        if (getComputedStyle(el).position === "static") el.style.position = "relative";
        return { el, x: b.left + b.width * p.ax + scrollX, y: b.top + b.height * p.ay + scrollY, w: b.width, h: b.height, ...p };
    }

    function settle(bf, perch, size) {
        bf.classList.add("resting");
        bf.style.transform = `rotate(${perch.rot}deg)`;
        bf.style.left = `${perch.w * perch.ax - size / 2}px`;
        bf.style.top = `${perch.h * perch.ay - size / 2}px`;
        perch.el.appendChild(bf);
    }

    function fly() {
        const layer = document.getElementById("flight");
        if (!layer) return;
        const W = innerWidth, H = innerHeight;
        const mobile = W < 600;
        const base = mobile ? 44 : 64;
        const count = mobile ? 6 : 9;
        const perches = PERCHES.map(perchPoint).filter(Boolean);

        if (reduceMotion) { // ไม่บิน แค่เกาะอยู่เฉย ๆ
            perches.forEach((p, i) => {
                const size = base * p.size;
                settle(makeButterfly(i, size), p, size);
            });
            return;
        }

        const flights = [];
        for (let i = 0; i < count; i++) {
            const perch = perches[i] || null; // ตัวแรก ๆ ไปเกาะ ที่เหลือบินออกไป
            const size = base * (perch ? perch.size : 0.7 + Math.random() * 0.6);
            const bf = makeButterfly(i, size);
            layer.appendChild(bf);
            const start = [W * (0.1 + Math.random() * 0.8), H + 60 + Math.random() * 80];
            const end = perch
                ? [perch.x, perch.y]
                : (() => {
                      const side = Math.random();
                      return side < 0.6 ? [W * Math.random(), -80] : [side < 0.8 ? -80 : W + 80, H * Math.random() * 0.5];
                  })();
            const c1 = [W * (0.1 + Math.random() * 0.8), H * (0.35 + Math.random() * 0.5)];
            const c2 = [W * (0.1 + Math.random() * 0.8), H * (0.05 + Math.random() * 0.6)];
            flights.push({
                bf, perch, size, pts: [start, c1, c2, end],
                delay: i * 260 + Math.random() * 300,
                dur: (perch ? 5200 : 4200) + Math.random() * 1800,
                amp: 10 + Math.random() * 14,
                waves: 4 + Math.random() * 3,
                done: false,
            });
        }

        const bez = (P, t) => {
            const u = 1 - t;
            return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]);
        };
        const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

        function pos(f, t) {
            const p = ease(t);
            const a = bez(f.pts, p), b = bez(f.pts, Math.min(1, p + 0.01));
            let dx = b[0] - a[0], dy = b[1] - a[1];
            const len = Math.hypot(dx, dy) || 1;
            dx /= len; dy /= len;
            // ส่ายซ้ายขวาแบบผีเสื้อ ค่อย ๆ หายไปตอนจะเกาะ
            const fade = f.perch ? Math.min(1, (1 - t) * 4) : 1;
            const off = Math.sin(t * f.waves * 2 * Math.PI) * f.amp * fade;
            return { x: a[0] - dy * off, y: a[1] + dx * off, ang: (Math.atan2(dy, dx) * 180) / Math.PI + 90 };
        }

        const t0 = performance.now();
        function frame(now) {
            let alive = 0;
            for (const f of flights) {
                if (f.done) continue;
                const t = (now - t0 - f.delay) / f.dur;
                if (t < 0) { alive++; f.bf.style.transform = "translate(-200px,-200px)"; continue; }
                if (t >= 1) {
                    f.done = true;
                    if (f.perch) settle(f.bf, f.perch, f.size);
                    else f.bf.remove();
                    continue;
                }
                alive++;
                const p = pos(f, t);
                // ตอนจะเกาะ หมุนตัวไปตามมุมเกาะ
                const ang = f.perch && t > 0.85 ? p.ang + (f.perch.rot - p.ang) * ((t - 0.85) / 0.15) : p.ang;
                f.bf.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${ang.toFixed(1)}deg)`;
            }
            if (alive) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // รอฟอนต์โหลดก่อน ตำแหน่งที่เกาะจะได้ไม่เลื่อน
    const go = () => setTimeout(fly, 350);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
    else addEventListener("load", go);
})();
