// NEW EYES — ของตกแต่ง: ภาพตัดแปะที่วาดด้วยโค้ด + ผีเสื้อ (Monarch / Blue Morpho / Swallowtail) บินตอนเปิดหน้าเว็บ
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

    // ---------- ผีเสื้อ ----------
    // ปีกครึ่งซ้าย (viewBox 0 0 60 110, ลำตัวอยู่ที่ x=60) — ปีกขวาใช้รูปเดียวกันกลับด้าน
    const FORE = "M60,44 C52,30 36,10 10,3 C4,2 1,6 2,12 C5,26 16,42 27,51 C39,54 50,52 60,50 Z";
    const HIND = "M60,50 C48,52 35,54 25,60 C15,67 11,80 17,90 C23,99 37,98 46,88 C53,79 58,66 60,55 Z";
    const HIND_TAIL = "M60,50 C48,52 35,54 25,60 C15,67 11,80 17,90 C22,97 30,98 35,95 C35,101 33,107 31,110 C36,108 40,101 41,94 C47,87 54,76 57,66 C59,61 60,57 60,55 Z";
    const dots = (pts, r, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join("");

    // ลวดลายปีกจริงของผีเสื้อ 3 พันธุ์
    const SPECIES = {
        monarch: `
            <path d="${HIND}" fill="url(#bfMonarch)"/>
            <path d="${FORE}" fill="url(#bfMonarch)"/>
            <g stroke="#140c06" stroke-width="1.6" fill="none" stroke-linecap="round">
                <path d="M59,46 C46,30 30,14 9,6"/><path d="M59,47 C44,36 28,26 6,18"/><path d="M59,48 C46,42 32,38 13,32"/>
                <path d="M58,49 C46,48 36,46 24,46"/><path d="M58,53 C46,60 32,68 20,82"/><path d="M58,54 C49,66 40,80 30,94"/>
                <path d="M59,55 C54,68 50,82 44,89"/><path d="M58,52 C44,55 32,58 22,66"/>
            </g>
            <path d="${FORE}" fill="none" stroke="#140c06" stroke-width="5"/>
            <path d="${HIND}" fill="none" stroke="#140c06" stroke-width="5"/>
            <path d="M10,3 C4,2 1,6 2,12 C5,22 10,30 16,36 C18,26 20,16 24,8 C19,5 14,3 10,3 Z" fill="#140c06"/>
            ${dots([[8,11],[12,17],[8,22],[14,24],[17,13],[20,9]], 1.3, "#f6efe2")}
            ${dots([[21,29],[24,34]], 1.6, "#f2a33a")}
            ${dots([[3.6,15],[6,26],[12,37],[19,46],[17,87],[24,93],[33,95],[42,90],[14,77]], 1, "#f6efe2")}`,
        morpho: `
            <path d="${HIND}" fill="url(#bfMorpho)"/>
            <path d="${FORE}" fill="url(#bfMorpho)"/>
            <path d="${FORE}" fill="url(#bfSheen)"/>
            <g stroke="#0b2a6e" stroke-width=".8" fill="none" opacity=".55">
                <path d="M59,46 C46,30 30,14 9,6"/><path d="M59,47 C44,36 28,26 6,18"/><path d="M58,49 C46,46 32,42 16,40"/>
                <path d="M58,53 C46,60 32,68 20,82"/><path d="M58,54 C49,66 40,80 30,94"/>
            </g>
            <path d="${FORE}" fill="none" stroke="#06122b" stroke-width="7"/>
            <path d="${HIND}" fill="none" stroke="#06122b" stroke-width="6"/>
            ${dots([[9,10],[6,17],[13,8]], 1.4, "#eaf4ff")}
            ${dots([[20,88],[30,94],[40,91]], 1.1, "#c9d9ff")}`,
        swallowtail: `
            <path d="${HIND_TAIL}" fill="url(#bfSwallow)"/>
            <path d="${FORE}" fill="url(#bfSwallow)"/>
            <g fill="#17130c">
                <path d="M24,7 C26,16 30,26 36,36 L40,38 C34,28 30,18 29,9 Z"/>
                <path d="M38,16 C40,24 44,32 50,40 L53,41 C48,33 44,25 42,18 Z"/>
                <path d="M14,4 C16,10 20,18 25,25 L28,26 C24,19 21,11 19,5 Z"/>
                <path d="M60,44 C56,40 52,38 50,40 C54,44 57,47 60,48 Z"/>
                <path d="M60,52 C52,56 46,62 42,72 L46,74 C50,64 55,58 60,56 Z"/>
            </g>
            <path d="${FORE}" fill="none" stroke="#17130c" stroke-width="5"/>
            <path d="${HIND_TAIL}" fill="none" stroke="#17130c" stroke-width="5.5"/>
            ${dots([[4,12],[7,24],[14,36],[22,46]], 1.2, "#f7d84a")}
            ${dots([[18,84],[24,91],[32,93]], 2.2, "#4b8fe0")}
            <circle cx="44" cy="86" r="3" fill="#e8642a"/><circle cx="44" cy="86" r="1.3" fill="#17130c"/>`,
    };
    const ORDER = ["monarch", "morpho", "swallowtail", "monarch", "swallowtail", "morpho"];

    // gradient ของแต่ละพันธุ์ ประกาศครั้งเดียวทั้งหน้า
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true");
    defs.style.position = "absolute";
    defs.innerHTML = `<defs>
        <radialGradient id="bfMonarch" cx="100%" cy="50%" r="95%"><stop offset="0" stop-color="#b8440c"/><stop offset=".45" stop-color="#e8741c"/><stop offset="1" stop-color="#f7a83a"/></radialGradient>
        <radialGradient id="bfMorpho" cx="100%" cy="48%" r="100%"><stop offset="0" stop-color="#0a2a78"/><stop offset=".35" stop-color="#1f6fe0"/><stop offset=".7" stop-color="#5fd0ff"/><stop offset="1" stop-color="#1a5fd0"/></radialGradient>
        <linearGradient id="bfSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#e9fbff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <radialGradient id="bfSwallow" cx="100%" cy="50%" r="100%"><stop offset="0" stop-color="#e2b52a"/><stop offset=".5" stop-color="#f7d84a"/><stop offset="1" stop-color="#fbe98a"/></radialGradient>
    </defs>`;
    document.body.appendChild(defs);

    const wingSVG = (sp) => `<svg viewBox="0 0 60 110" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">${SPECIES[sp]}</svg>`;
    const BODY = `<svg class="body" viewBox="0 0 12 110" aria-hidden="true" focusable="false">
        <path d="M5,40 C2,24 -2,14 -4,8 M7,40 C10,24 14,14 16,8" stroke="#1a1410" stroke-width="1" fill="none" stroke-linecap="round"/>
        <circle cx="-4" cy="8" r="1.4" fill="#1a1410"/><circle cx="16" cy="8" r="1.4" fill="#1a1410"/>
        <ellipse cx="6" cy="44" rx="3.2" ry="4" fill="#1a1410"/>
        <ellipse cx="6" cy="56" rx="2.6" ry="9" fill="#1a1410"/>
        <ellipse cx="6" cy="78" rx="2" ry="15" fill="#241a12"/>
        <circle cx="5" cy="52" r=".7" fill="#f6efe2"/><circle cx="7" cy="58" r=".7" fill="#f6efe2"/>
    </svg>`;

    function makeButterfly(i, size) {
        const el = document.createElement("div");
        el.className = "bf";
        el.style.setProperty("--size", `${size}px`);
        el.style.setProperty("--flap", `${(0.13 + Math.random() * 0.06).toFixed(3)}s`);
        el.style.setProperty("--rest-delay", `${(-Math.random() * 6).toFixed(2)}s`);
        const sp = ORDER[i % ORDER.length];
        el.innerHTML = `<div class="wing left">${wingSVG(sp)}</div><div class="wing right">${wingSVG(sp)}</div>${BODY}`;
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
        bf.style.top = `${perch.h * perch.ay - size * 0.46}px`;
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
