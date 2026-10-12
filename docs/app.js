// NEW EYES — ทำงานในเบราว์เซอร์ทั้งหมด ไม่ต้องมีเซิร์ฟเวอร์ Python
// กล้อง: getUserMedia | เตรียมภาพ: preprocess.js | อ่านข้อความ: Tesseract.js | อ่านออกเสียง: speechSynthesis
// ค่าต่าง ๆ ด้านล่างมาจากการทดลองใน experiments/ (ดู experiments/REPORT.md)

const $ = (id) => document.getElementById(id);
const viewer = $("viewer");
const video = $("video");
const photo = $("photo");
const guide = $("guide");
const placeholder = $("placeholder");
const canvas = $("canvas");
const statusEl = $("status");
const resultEl = $("result");
const voiceWarn = $("voiceWarn");
const btnCamera = $("btnCamera");
const btnRead = $("btnRead");
const btnAuto = $("btnAuto");
const btnTorch = $("btnTorch");
const btnRepeat = $("btnRepeat");
const btnStop = $("btnStop");
const fileInput = $("fileInput");
const langSelect = $("lang");
const rateInput = $("rate");

const SAMPLE_MS = 500;            // วัดความคมของภาพทุกครึ่งวินาที
const SHARP_ABS_MIN = 12;         // ความคมต่ำกว่านี้ = เบลอแน่นอน
const SHARP_REL = 0.5;            // ต้องคมอย่างน้อยครึ่งหนึ่งของที่เคยคมที่สุดใน 5 วินาทีล่าสุด
const SHARP_STABLE = 0.35;        // 2 เฟรมติดกันความคมต่างกันไม่เกิน 35% = กล้องนิ่งแล้ว
const LINE_MIN_CONF = 60;         // ทิ้งบรรทัดที่ OCR มั่นใจต่ำกว่านี้
const SMALL_CHAR_PX = 9;          // ตัวหนังสือในภาพเล็กกว่านี้ -> บอกให้เข้าใกล้
const WAIT_STEADY_MS = 3000;      // กด "อ่านเลย" แล้วรอภาพนิ่งได้นานสุดเท่านี้
const HINT_AFTER_MS = 6000;       // อ่านอัตโนมัติ: ไม่เจอภาพนิ่งนานเท่านี้ -> พูดแนะนำ
const HINT_COOLDOWN_MS = 12000;
const SAME_TEXT_THRESHOLD = 0.8;  // ข้อความคล้ายเดิมเกินนี้ไม่ต้องอ่านซ้ำ

let worker = null;
let workerLang = null;
let workerReady = null;
let stream = null;
let track = null;
let torchOn = false;
let busy = false;
let autoOn = false;
let sampler = null;
let sharpHist = [];
let lastSharp = 0;
let steady = false;
let lastSteadyAt = 0;
let lastHintAt = 0;
let lastSpoken = "";
let voices = [];
const synth = window.speechSynthesis; // บางเบราว์เซอร์ไม่มี
const small = document.createElement("canvas");

function setStatus(msg) {
    statusEl.textContent = msg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- OCR ----------

function getWorker() {
    const lang = langSelect.value;
    if (worker && workerLang === lang) return workerReady;

    const old = worker;
    workerLang = lang;
    workerReady = (async () => {
        if (old) await old.terminate();
        setStatus("กำลังโหลดตัวอ่านภาษา…");
        const w = await Tesseract.createWorker(lang.split("+"), 1, {
            logger: (m) => {
                if (m.status === "loading language traineddata" && m.progress < 1) {
                    setStatus(`กำลังโหลดตัวอ่านภาษา… ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        // PSM 6 = ข้อความเป็นก้อนเดียว (โหมดอัตโนมัติเดิมทิ้งข้อความไป 27% ของภาพ)
        await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
        worker = w;
        setStatus("พร้อมใช้งาน");
        return w;
    })();
    workerReady.catch(() => {
        worker = null;
        workerLang = null;
        setStatus("โหลดตัวอ่านภาษาไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    });
    return workerReady;
}

function isThai(text) {
    const thai = (text.match(/[฀-๿]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return thai >= latin;
}

// ความคล้ายของข้อความ (Dice coefficient จากคู่ตัวอักษร) 0 = ต่างกัน, 1 = เหมือนกัน
function similarity(a, b) {
    const norm = (s) => s.replace(/\s+/g, "").toLowerCase();
    a = norm(a);
    b = norm(b);
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const pairs = new Map();
    for (let i = 0; i < a.length - 1; i++) {
        const p = a.slice(i, i + 2);
        pairs.set(p, (pairs.get(p) || 0) + 1);
    }
    let hits = 0;
    for (let i = 0; i < b.length - 1; i++) {
        const p = b.slice(i, i + 2);
        const n = pairs.get(p);
        if (n) {
            hits++;
            pairs.set(p, n - 1);
        }
    }
    return (2 * hits) / (a.length + b.length - 2);
}

// ถ่ายภาพความละเอียดเต็มจากกล้อง/รูป แล้วเตรียมภาพ (เฉพาะในกรอบ, ปรับขนาดตัวอักษร, ลบเงา)
function captureAndPrepare() {
    const isVideo = Boolean(stream && video.videoWidth);
    const src = isVideo ? video : photo;
    const W = isVideo ? video.videoWidth : photo.naturalWidth;
    const H = isVideo ? video.videoHeight : photo.naturalHeight;
    if (!W) return null;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, W, H);
    // รูปที่เลือกเอง ข้อความอาจอยู่ตรงไหนก็ได้ จึงใช้ทั้งภาพ
    const roi = isVideo ? NEPrep.ROI : { x0: 0, y0: 0, x1: 1, y1: 1 };
    const p = NEPrep.prepare(ctx.getImageData(0, 0, W, H).data, W, H, roi);
    canvas.width = p.width;
    canvas.height = p.height;
    const img = ctx.createImageData(p.width, p.height);
    img.data.set(p.rgba);
    ctx.putImageData(img, 0, 0);
    return { canvas, info: p.info };
}

async function waitForSteady(maxMs) {
    const t0 = Date.now();
    while (!steady && Date.now() - t0 < maxMs) await sleep(100);
    return steady;
}

// auto = true: ไม่พูดข้อความเดิมซ้ำ และไม่บอกว่า "ไม่พบข้อความ" ทุกรอบ
async function readNow(auto = false) {
    if (busy) return;
    if (!hasImage()) {
        setStatus("ยังไม่มีภาพ กดเปิดกล้อง หรือถ่ายรูป / เลือกรูปก่อน");
        return;
    }

    busy = true;
    btnRead.disabled = true;
    try {
        const w = await getWorker();
        if (!auto && stream && !steady) {
            setStatus("กำลังรอให้ภาพนิ่ง… ถือกล้องค้างไว้");
            if (!(await waitForSteady(WAIT_STEADY_MS))) speakHint("ภาพยังสั่นอยู่ จะลองอ่านให้นะ");
        }
        if (!auto) setStatus("กำลังอ่านข้อความ…");
        await sleep(0); // ให้หน้าจออัปเดตก่อนประมวลผลภาพ
        const shot = captureAndPrepare();
        if (!shot) return;
        const { data } = await w.recognize(shot.canvas);
        const text = NEPrep.filterLines(data, LINE_MIN_CONF);

        if (text.replace(/\s/g, "").length < 3) {
            const tooSmall = shot.info.charH && shot.info.charH < SMALL_CHAR_PX;
            const hint = tooSmall
                ? "ตัวหนังสือเล็กเกินไป ลองเลื่อนกล้องเข้าใกล้อีกนิด"
                : stream
                ? "ไม่พบข้อความ ลองให้ข้อความอยู่กลางจอ และเพิ่มแสง"
                : "ไม่พบข้อความในรูปนี้";
            if (!auto) {
                setStatus(hint);
                speak(hint);
            } else if (tooSmall) {
                speakHint(hint);
            }
            return;
        }

        if (auto && similarity(text, lastSpoken) >= SAME_TEXT_THRESHOLD) return;

        resultEl.textContent = text;
        setStatus(`อ่านได้แล้ว (ความมั่นใจ ${Math.round(data.confidence)}%)`);
        lastSpoken = text;
        btnRepeat.disabled = false;
        speak(text);
    } catch (err) {
        console.error(err);
        setStatus("อ่านข้อความไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
        busy = false;
        btnRead.disabled = !hasImage();
    }
}

// ---------- ความคม / กล้องนิ่ง ----------

function sampleSharpness() {
    if (!stream || !video.videoWidth) return;
    const w = 600;
    const h = Math.round((w * video.videoHeight) / video.videoWidth);
    small.width = w;
    small.height = h;
    const ctx = small.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const s = NEPrep.sharpness(ctx.getImageData(0, 0, w, h).data, w, h);
    sharpHist = [...sharpHist, s].slice(-10);
    const gate = Math.max(SHARP_ABS_MIN, SHARP_REL * Math.max(...sharpHist));
    steady = s >= gate && lastSharp >= gate && Math.abs(s - lastSharp) / Math.max(s, lastSharp) <= SHARP_STABLE;
    lastSharp = s;
    guide.classList.toggle("steady", steady);
    if (steady) lastSteadyAt = Date.now();
    if (autoOn) autoTick();
}

function autoTick() {
    if (busy || synth?.speaking) return;
    if (steady) {
        readNow(true);
    } else if (Date.now() - lastSteadyAt > HINT_AFTER_MS) {
        speakHint("ยังไม่เห็นข้อความชัด ๆ ถือกล้องให้นิ่ง ห่างจากกระดาษประมาณหนึ่งคืบ");
    }
}

// ---------- เสียง ----------

function loadVoices() {
    voices = synth ? synth.getVoices() : [];
    const hasThai = voices.some((v) => v.lang.toLowerCase().replace("_", "-").startsWith("th"));
    voiceWarn.hidden = !voices.length || hasThai;
}

function pickVoice(lang) {
    const want = lang.slice(0, 2);
    const list = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(want));
    return list.find((v) => v.localService) || list[0] || null;
}

// อ่านทีละบรรทัด: มีจังหวะหยุดระหว่างบรรทัด เลือกภาษาให้แต่ละบรรทัด และไม่โดนตัดกลางคันเมื่อข้อความยาว
function speak(text) {
    if (!synth) {
        setStatus("เบราว์เซอร์นี้อ่านออกเสียงไม่ได้ แสดงเป็นข้อความแทน");
        return;
    }
    synth.cancel();
    for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const u = new SpeechSynthesisUtterance(line);
        u.lang = isThai(line) ? "th-TH" : "en-US";
        u.rate = Number(rateInput.value);
        const v = pickVoice(u.lang);
        if (v) u.voice = v;
        synth.speak(u);
    }
}

function speakHint(msg) {
    if (Date.now() - lastHintAt < HINT_COOLDOWN_MS || synth?.speaking) return;
    lastHintAt = Date.now();
    setStatus(msg);
    speak(msg);
}

// ---------- กล้อง / รูป ----------

function hasImage() {
    return Boolean(stream) || (!photo.hidden && photo.naturalWidth > 0);
}

// ให้กรอบภาพมีสัดส่วนเท่ากล้อง/รูปจริง กรอบนำสายตาจะได้ตรงกับส่วนที่อ่านจริง
function fitViewer(w, h) {
    const ar = w / h;
    viewer.style.aspectRatio = `${w} / ${h}`;
    viewer.style.width = `min(100%, ${(70 * ar).toFixed(1)}vh)`;
}

function showSource(kind) {
    video.hidden = kind !== "video";
    photo.hidden = kind !== "photo";
    guide.hidden = kind !== "video";
    placeholder.hidden = kind !== "none";
    btnRead.disabled = kind === "none";
    btnAuto.disabled = kind !== "video";
    if (kind === "none") viewer.removeAttribute("style");
}

async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("เปิดกล้องได้เฉพาะเว็บที่เป็น https เท่านั้น ใช้ปุ่มถ่ายรูป / เลือกรูปแทนได้");
        return;
    }
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
        track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode?.includes("continuous")) {
            track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        }
        btnTorch.hidden = !caps.torch;
        fitViewer(video.videoWidth, video.videoHeight);
        showSource("video");
        sharpHist = [];
        lastSteadyAt = Date.now();
        sampler = setInterval(sampleSharpness, SAMPLE_MS);
        btnCamera.textContent = "ปิดกล้อง";
        setStatus("เปิดกล้องแล้ว ให้ข้อความอยู่ในกรอบ ถือนิ่ง ๆ แล้วกดอ่านเลย");
    } catch (err) {
        console.error(err);
        stream = null;
        const msg = err.name === "NotFoundError"
            ? "ไม่พบกล้องในเครื่องนี้ ใช้ปุ่มถ่ายรูป / เลือกรูปแทนได้"
            : "เปิดกล้องไม่ได้ กรุณาอนุญาตให้ใช้กล้อง หรือใช้ปุ่มถ่ายรูป / เลือกรูปแทน";
        setStatus(msg);
    }
}

function stopCamera() {
    setAuto(false);
    clearInterval(sampler);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    track = null;
    torchOn = false;
    btnTorch.hidden = true;
    btnTorch.setAttribute("aria-pressed", "false");
    steady = false;
    video.srcObject = null;
    btnCamera.textContent = "เปิดกล้อง";
    if (photo.naturalWidth && !photo.hidden) fitViewer(photo.naturalWidth, photo.naturalHeight);
    showSource(photo.naturalWidth ? "photo" : "none");
}

function setAuto(on) {
    autoOn = on;
    btnAuto.setAttribute("aria-pressed", String(on));
    btnAuto.textContent = `อ่านอัตโนมัติ: ${on ? "เปิด" : "ปิด"}`;
    if (on) {
        lastSpoken = "";
        lastSteadyAt = Date.now();
        setStatus("อ่านอัตโนมัติเปิดอยู่ จะอ่านเมื่อภาพนิ่งและเจอข้อความใหม่");
    }
}

async function toggleTorch() {
    if (!track) return;
    try {
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        btnTorch.setAttribute("aria-pressed", String(torchOn));
        btnTorch.textContent = `ไฟฉาย: ${torchOn ? "เปิด" : "ปิด"}`;
    } catch {
        torchOn = false;
        setStatus("เปิดไฟฉายไม่ได้ในเครื่องนี้");
    }
}

// ---------- ปุ่ม ----------

btnCamera.addEventListener("click", () => (stream ? stopCamera() : startCamera()));
btnRead.addEventListener("click", () => readNow(false));
btnAuto.addEventListener("click", () => setAuto(!autoOn));
btnTorch.addEventListener("click", toggleTorch);
btnRepeat.addEventListener("click", () => lastSpoken && speak(lastSpoken));
btnStop.addEventListener("click", () => {
    synth?.cancel();
    setAuto(false);
});
langSelect.addEventListener("change", () => getWorker());

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (stream) stopCamera();
    if (photo.src) URL.revokeObjectURL(photo.src);
    photo.onload = () => {
        fitViewer(photo.naturalWidth, photo.naturalHeight);
        showSource("photo");
        readNow(false);
    };
    photo.src = URL.createObjectURL(file);
    fileInput.value = "";
});

if (synth) {
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
}
showSource("none");
getWorker(); // โหลดตัวอ่านภาษาไว้ก่อน จะได้ไม่ต้องรอตอนกดครั้งแรก
