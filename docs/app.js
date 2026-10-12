// NEW EYES — ทำงานในเบราว์เซอร์ทั้งหมด ไม่ต้องมีเซิร์ฟเวอร์ Python
// กล้อง: getUserMedia | อ่านข้อความ: Tesseract.js | อ่านออกเสียง: speechSynthesis

const $ = (id) => document.getElementById(id);
const video = $("video");
const photo = $("photo");
const placeholder = $("placeholder");
const canvas = $("canvas");
const statusEl = $("status");
const resultEl = $("result");
const btnCamera = $("btnCamera");
const btnRead = $("btnRead");
const btnAuto = $("btnAuto");
const btnRepeat = $("btnRepeat");
const btnStop = $("btnStop");
const fileInput = $("fileInput");
const langSelect = $("lang");
const rateInput = $("rate");

const AUTO_INTERVAL_MS = 2500;   // อ่านอัตโนมัติทุกกี่มิลลิวินาที
const MIN_CONFIDENCE = 45;       // ความมั่นใจขั้นต่ำของ OCR (0-100)
const MIN_CHARS = 3;             // ข้อความสั้นกว่านี้ถือว่าไม่มีข้อความ
const SAME_TEXT_THRESHOLD = 0.8; // ข้อความคล้ายเดิมเกินนี้ไม่ต้องอ่านซ้ำ
const MAX_WIDTH = 1600;          // ย่อภาพก่อน OCR ให้เร็วขึ้น

let worker = null;
let workerLang = null;
let workerReady = null;
let stream = null;
let busy = false;
let autoTimer = null;
let lastSpoken = "";
const synth = window.speechSynthesis; // บางเบราว์เซอร์ไม่มี

function setStatus(msg) {
    statusEl.textContent = msg;
}

// ---------- OCR ----------

function getWorker() {
    const lang = langSelect.value;
    if (worker && workerLang === lang) return workerReady;

    const old = worker;
    workerLang = lang;
    workerReady = (async () => {
        if (old) await old.terminate();
        setStatus("กำลังโหลดตัวอ่านภาษา…");
        worker = await Tesseract.createWorker(lang.split("+"), 1, {
            logger: (m) => {
                if (m.status === "loading language traineddata" && m.progress < 1) {
                    setStatus(`กำลังโหลดตัวอ่านภาษา… ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        setStatus("พร้อมใช้งาน");
        return worker;
    })();
    workerReady.catch(() => {
        worker = null;
        workerLang = null;
        setStatus("โหลดตัวอ่านภาษาไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    });
    return workerReady;
}

// Tesseract มักเว้นวรรคระหว่างตัวอักษรไทย ต้องลบออกก่อนอ่าน
function cleanText(text) {
    return text
        .replace(/([฀-๿]) +(?=[฀-๿])/g, "$1")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();
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

// วาดภาพลง canvas (ย่อถ้าใหญ่เกิน) แล้วส่งให้ OCR
function toCanvas(source, w, h) {
    const scale = Math.min(1, MAX_WIDTH / w);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function currentImage() {
    if (stream && video.videoWidth) {
        return toCanvas(video, video.videoWidth, video.videoHeight);
    }
    if (!photo.hidden && photo.naturalWidth) {
        return toCanvas(photo, photo.naturalWidth, photo.naturalHeight);
    }
    return null;
}

// fromAuto = true จะไม่พูดข้อความเดิมซ้ำ และไม่บอกว่า "ไม่พบข้อความ" ทุกรอบ
async function readNow(fromAuto = false) {
    if (busy) return;
    if (fromAuto && synth?.speaking) return;

    const image = currentImage();
    if (!image) {
        setStatus("ยังไม่มีภาพ กดเปิดกล้อง หรือถ่ายรูป / เลือกรูปก่อน");
        return;
    }

    busy = true;
    btnRead.disabled = true;
    try {
        const w = await getWorker();
        if (!fromAuto) setStatus("กำลังอ่านข้อความ…");
        const { data } = await w.recognize(image);
        const text = cleanText(data.text);

        if (text.replace(/\s/g, "").length < MIN_CHARS || data.confidence < MIN_CONFIDENCE) {
            if (!fromAuto) {
                setStatus("ไม่พบข้อความที่ชัดพอ ลองขยับให้ใกล้ขึ้นหรือเพิ่มแสง");
                speak("ไม่พบข้อความ", "th-TH");
            }
            return;
        }

        if (fromAuto && similarity(text, lastSpoken) >= SAME_TEXT_THRESHOLD) return;

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

// ---------- เสียง ----------

function speak(text, lang) {
    if (!synth) {
        setStatus("เบราว์เซอร์นี้อ่านออกเสียงไม่ได้ แสดงเป็นข้อความแทน");
        return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || (isThai(text) ? "th-TH" : "en-US");
    u.rate = Number(rateInput.value);
    const voice = synth.getVoices().find((v) => v.lang.replace("_", "-").startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    synth.speak(u);
}

// ---------- กล้อง / รูป ----------

function hasImage() {
    return Boolean(stream) || (!photo.hidden && photo.naturalWidth > 0);
}

function showSource(kind) {
    video.hidden = kind !== "video";
    photo.hidden = kind !== "photo";
    placeholder.hidden = kind !== "none";
    btnRead.disabled = kind === "none";
    btnAuto.disabled = kind !== "video";
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
        showSource("video");
        btnCamera.textContent = "📷 ปิดกล้อง";
        setStatus("เปิดกล้องแล้ว หันกล้องไปที่ข้อความ แล้วกดอ่านเลย");
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
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    btnCamera.textContent = "📷 เปิดกล้อง";
    showSource(photo.naturalWidth ? "photo" : "none");
}

function setAuto(on) {
    clearInterval(autoTimer);
    autoTimer = on ? setInterval(() => readNow(true), AUTO_INTERVAL_MS) : null;
    btnAuto.setAttribute("aria-pressed", String(on));
    btnAuto.textContent = `🔁 อ่านอัตโนมัติ: ${on ? "เปิด" : "ปิด"}`;
    if (on) {
        lastSpoken = "";
        setStatus("อ่านอัตโนมัติเปิดอยู่ จะอ่านเมื่อเจอข้อความใหม่");
    }
}

// ---------- ปุ่ม ----------

btnCamera.addEventListener("click", () => (stream ? stopCamera() : startCamera()));
btnRead.addEventListener("click", () => readNow(false));
btnAuto.addEventListener("click", () => setAuto(!autoTimer));
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
        showSource("photo");
        readNow(false);
    };
    photo.src = URL.createObjectURL(file);
    fileInput.value = "";
});

showSource("none");
getWorker(); // โหลดตัวอ่านภาษาไว้ก่อน จะได้ไม่ต้องรอตอนกดครั้งแรก
