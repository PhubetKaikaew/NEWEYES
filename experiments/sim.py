"""จำลองภาพที่กล้องมือถือถ่ายได้ แล้วเตรียมภาพตามวิธีต่าง ๆ ก่อนส่งให้ OCR

python -I sim.py scenes     -> data/scenes/<scenario>/<sample>.png + data/scenes/manifest.json
python -I sim.py pipelines  -> data/prep/<pipeline>/<scenario>/<sample>.png + data/prep/manifest.json
python -I sim.py sequence   -> data/seq/<sample>/fNN.png (วิดีโอจำลอง: ขยับกล้อง -> นิ่ง -> ขยับ)
"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "data")
CFG = json.load(open(os.path.join(HERE, "samples.json"), encoding="utf-8"))
RENDER_EM = 96

# ROI = กรอบนำสายตาที่จะแสดงบนจอ (สัดส่วนของเฟรม)
ROI = (0.10, 0.20, 0.90, 0.80)  # x0, y0, x1, y1

# ชื่อ: (กว้าง, สูง, ขนาดตัวอักษรในเฟรม px, เบลอโฟกัส sigma, เบลอเคลื่อนไหว px, แสง, เอียงองศา, jpeg)
SCENARIOS = {
    "ideal":      (1920, 1080, 34, 0.6, 0, "even",   0, 85),
    "vga":        (640,  480,  12, 0.6, 0, "even",   0, 85),
    "hd":         (1280, 720,  22, 1.0, 0, "mild",   0, 80),
    "shadow":     (1280, 720,  22, 1.0, 0, "shadow", 0, 80),
    "dim":        (1280, 720,  22, 1.2, 0, "dim",    0, 75),
    "defocus":    (1280, 720,  22, 2.2, 0, "mild",   0, 80),
    "motion":     (1280, 720,  22, 0.8, 10, "mild",  0, 80),
    "tilt":       (1280, 720,  22, 1.0, 0, "mild",  25, 80),
    "far_video":  (1920, 1080, 15, 0.8, 0, "mild",   0, 85),
    "far_photo":  (4032, 3024, 30, 1.4, 0, "mild",   0, 92),
}


def load_rgba(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return img[:, :, 3].astype(np.float32) / 255.0  # ใช้แค่ alpha = หมึก


def background(w, h, rng):
    base = np.array(rng.choice([[70, 105, 140], [60, 80, 95], [150, 160, 170], [40, 60, 85]]), np.float32)  # BGR โต๊ะ
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    grad = 0.85 + 0.3 * (xx / w)
    bg = base[None, None, :] * grad[..., None]
    bg += rng.normal(0, 6, (h, w, 1)).astype(np.float32)
    for _ in range(6):  # ของบนโต๊ะ
        x0, y0 = int(rng.uniform(0, w)), int(rng.uniform(0, h))
        col = tuple(float(c) for c in rng.uniform(20, 230, 3))
        if rng.random() < 0.5:
            cv2.rectangle(bg, (x0, y0), (x0 + int(rng.uniform(w * .05, w * .2)), y0 + int(rng.uniform(h * .03, h * .1))), col, -1)
        else:
            cv2.ellipse(bg, (x0, y0), (int(w * .05), int(h * .04)), float(rng.uniform(0, 180)), 0, 360, col, -1)
    return bg


def paper_layer(text_alpha, w, h, scale, rng):
    """กระดาษ (สี + หมึก) ขนาดเท่าเฟรม; คืน (rgb, mask กระดาษ)"""
    paper = np.zeros((h, w), np.float32)
    px0, py0, px1, py1 = int(w * .04), int(h * .05), int(w * .96), int(h * .97)
    paper[py0:py1, px0:px1] = 1.0
    ink = np.zeros((h, w), np.float32)

    t = cv2.resize(text_alpha, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    th, tw = t.shape
    x, y = (w - tw) // 2, (h - th) // 2
    ink[y:y + th, x:x + tw] = np.maximum(ink[y:y + th, x:x + tw], t)

    # ข้อความอื่นบนหน้ากระดาษ อยู่นอกกรอบ ROI (หัวกระดาษ/เลขหน้า)
    for i, (cx, cy) in enumerate([(0.07, 0.07), (0.62, 0.86)]):
        c = load_rgba(os.path.join(D, "text", f"clutter_{(i + rng.integers(0, 5)) % 5}.png"))
        c = cv2.resize(c, None, fx=scale * 0.8, fy=scale * 0.8, interpolation=cv2.INTER_AREA)
        ch, cw = c.shape
        X, Y = int(w * cx), int(h * cy)
        ch, cw = min(ch, h - Y), min(cw, w - X)
        ink[Y:Y + ch, X:X + cw] = np.maximum(ink[Y:Y + ch, X:X + cw], c[:ch, :cw])

    tone = rng.uniform(232, 250)
    rgb = np.full((h, w, 3), tone, np.float32) * np.array([1.0, 0.99, 0.97], np.float32)
    rgb = rgb * (1 - ink[..., None]) + 22 * ink[..., None]
    return rgb, paper, (x, y, tw, th)


def warp(img, mask, w, h, tilt_deg, rot_deg):
    """หมุนเล็กน้อย + เอียงแบบมุมมอง (กล้องไม่ขนานกระดาษ)"""
    k = np.tan(np.radians(tilt_deg)) * 0.35
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[w * k * .5, h * k * .3], [w - w * k * .5, 0], [w, h], [0, h - h * k * .3]]) if tilt_deg else src.copy()
    M = cv2.getPerspectiveTransform(src, dst)
    R = np.vstack([cv2.getRotationMatrix2D((w / 2, h / 2), rot_deg, 1.0), [0, 0, 1]])
    M = R @ M
    img = cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    mask = cv2.warpPerspective(mask, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    return img, mask


def lighting(img, kind, rng):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / w) ** 2 + ((yy - h / 2) / h) ** 2)
    field = 1.0 - 0.25 * r  # vignette
    if kind == "mild":
        field *= 0.85 + 0.15 * (xx / w)
    elif kind == "shadow":
        # เงามือ/เงาโทรศัพท์ทอดเฉียงครึ่งภาพ
        edge = (xx / w) * 0.8 + (yy / h) * 0.6 - 0.75
        field *= 1.0 - 0.6 * (1 / (1 + np.exp(-edge * 18)))
    elif kind == "dim":
        field *= 0.28
    return img * field[..., None]


def motion_kernel(length, angle):
    k = np.zeros((length, length), np.float32)
    k[length // 2, :] = 1
    M = cv2.getRotationMatrix2D((length / 2 - .5, length / 2 - .5), angle, 1)
    k = cv2.warpAffine(k, M, (length, length))
    return k / k.sum()


def make_frame(sample_id, scen, rng, override=None):
    W, H, em, blur, motion, light, tilt, q = SCENARIOS[scen]
    if override:
        W, H, em, blur, motion, light, tilt, q = override
    SS = 2 if W <= 2000 else 1
    w, h = W * SS, H * SS
    alpha = load_rgba(os.path.join(D, "text", f"{sample_id}.png"))
    scale = em * SS / RENDER_EM
    th, tw = alpha.shape
    roi_w, roi_h = (ROI[2] - ROI[0]) * w * 0.95, (ROI[3] - ROI[1]) * h * 0.95
    fit = min(1.0, roi_w / (tw * scale), roi_h / (th * scale))  # ถอยกล้องให้ข้อความพอดีกรอบ
    scale *= fit

    bg = background(w, h, rng)
    paper, mask, _ = paper_layer(alpha, w, h, scale, rng)
    paper, mask = warp(paper, mask, w, h, tilt, rng.uniform(-2.5, 2.5))
    img = bg * (1 - mask[..., None]) + paper * mask[..., None]
    img = lighting(img, light, rng)

    if blur > 0:
        img = cv2.GaussianBlur(img, (0, 0), blur * SS)
    if motion > 0:
        img = cv2.filter2D(img, -1, motion_kernel(int(motion * SS) | 1, rng.uniform(0, 180)))
    img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)

    if light == "dim":  # กล้องดึงแสงขึ้นอัตโนมัติ -> noise เยอะ
        img = img + rng.normal(0, 3.5, img.shape)
        img = img * 3.0
    img = img + rng.normal(0, 2.0, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR), em * fit


# ---------------- การเตรียมภาพก่อน OCR ----------------

def roi_crop(img):
    h, w = img.shape[:2]
    return img[int(h * ROI[1]):int(h * ROI[3]), int(w * ROI[0]):int(w * ROI[2])]


def stretch(gray):
    # หมึกมักกินพื้นที่ <1% ของภาพ ถ้าใช้ percentile 1 จะได้สีกระดาษ แล้วขยาย noise จนตัวหนังสือพัง
    lo, hi = np.percentile(gray, (0.3, 99.5))
    lo = min(lo, hi - 80)
    return np.clip((gray.astype(np.float32) - lo) * 255.0 / max(hi - lo, 1), 0, 255).astype(np.uint8)


def flat(gray):
    """หารด้วยพื้นหลังที่ประมาณจากภาพเบลอมาก ๆ -> ลบเงา/แสงไม่สม่ำเสมอ"""
    g = gray.astype(np.float32)
    k = max(15, (min(g.shape) // 8) | 1)
    bgr = cv2.dilate(g, cv2.getStructuringElement(cv2.MORPH_RECT, (k // 3 | 1, k // 3 | 1)))
    bgr = cv2.GaussianBlur(bgr, (0, 0), k / 3)
    return stretch(np.clip(g / np.maximum(bgr, 1) * 255, 0, 255))


def upscale(img, target_w=2000, max_scale=3.0):
    s = min(max_scale, target_w / img.shape[1])
    if s <= 1.0:
        return img
    return cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)


def cap(img, max_w=1600):
    if img.shape[1] <= max_w:
        return img
    s = max_w / img.shape[1]
    return cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)


def unsharp(g, sigma=2.0, amount=1.0):
    b = cv2.GaussianBlur(g.astype(np.float32), (0, 0), sigma)
    return np.clip(g + amount * (g - b), 0, 255).astype(np.uint8)


def gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def noise_sigma(g):
    """ประมาณ noise ของภาพ (MAD ของส่วนต่างกับ median 3x3)"""
    d = g.astype(np.float32) - cv2.medianBlur(g, 3).astype(np.float32)
    return float(1.4826 * np.median(np.abs(d - np.median(d))))


def char_height(g):
    """ความสูงตัวอักษรโดยประมาณ (มัธยฐานความสูงของก้อนหมึก) หน่วย px"""
    b = cv2.threshold(flat(g), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    n, _, st, _ = cv2.connectedComponentsWithStats(b, connectivity=8)
    hs = st[1:, cv2.CC_STAT_HEIGHT]
    ws = st[1:, cv2.CC_STAT_WIDTH]
    area = st[1:, cv2.CC_STAT_AREA]
    ok = (hs >= 4) & (hs < g.shape[0] * 0.3) & (area >= 8) & (ws < g.shape[1] * 0.3)
    if ok.sum() < 5:
        return None
    return float(np.median(hs[ok]))


def adaptive(f, target_h=28, noise_thr=2.0, sharp_thr=None, info=None):
    """P9: ครอป ROI -> (ลด noise ถ้าจำเป็น) -> ย่อ/ขยายให้ตัวอักษรสูง target_h px -> ลบเงา"""
    g = gray(cap(roi_crop(f), 2400))
    nz = noise_sigma(g)
    if nz > noise_thr:
        g = cv2.GaussianBlur(g, (0, 0), 0.8)
    h = char_height(g)
    s = 1.0 if h is None else float(np.clip(target_h / h, 0.5, 4.0))
    if s != 1.0:
        g = cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
    if sharp_thr is not None and nz <= noise_thr:
        g = unsharp(g)
    if info is not None:
        info.update(noise=round(nz, 2), char_h=h, scale=round(s, 2))
    return flat(g)


PIPELINES = {
    # ปัจจุบันในเว็บ: ทั้งเฟรม ย่อเหลือกว้าง ≤1600
    "P0_current":     lambda f: cap(f),
    "P1_gray":        lambda f: stretch(gray(cap(f))),
    "P2_roi":         lambda f: stretch(gray(cap(roi_crop(f), 2400))),
    "P3_roi_up":      lambda f: stretch(gray(upscale(cap(roi_crop(f), 2400)))),
    "P4_roi_up_flat": lambda f: flat(gray(upscale(cap(roi_crop(f), 2400)))),
    "P5_roi_up_bin":  lambda f: cv2.threshold(flat(gray(upscale(cap(roi_crop(f), 2400)))), 0, 255,
                                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
    # ลด noise ก่อนขยาย (ช่วยตอนแสงน้อย)
    "P6_denoise":     lambda f: flat(upscale(cv2.GaussianBlur(gray(cap(roi_crop(f), 2400)), (0, 0), 0.8))),
    # ขยายใหญ่ขึ้นอีก (ช่วยตอนตัวหนังสือเล็ก/กล้องความละเอียดต่ำ)
    "P7_up3000":      lambda f: flat(gray(upscale(cap(roi_crop(f), 2400), 3000, 4.0))),
    # เพิ่มความคม (unsharp mask) หลังขยาย
    "P8_sharpen":     lambda f: flat(unsharp(gray(upscale(cap(roi_crop(f), 2400))))),
    # ปรับขนาดตัวอักษรอัตโนมัติ + ลด noise เฉพาะตอนจำเป็น
    "P9_h20":         lambda f: adaptive(f, 20),
    "P9_h28":         lambda f: adaptive(f, 28),
    "P9_h36":         lambda f: adaptive(f, 36),
    "P9_h28_sharp":   lambda f: adaptive(f, 28, sharp_thr=True),
}


def cmd_stats():
    """ดูค่า noise / ความสูงตัวอักษร ของแต่ละสถานการณ์ เพื่อตั้งค่า threshold"""
    by = {}
    for it in json.load(open(os.path.join(D, "scenes", "manifest.json"))):
        f = cv2.imread(it["path"])
        info = {}
        adaptive(f, 28, info=info)
        by.setdefault(it["scenario"], []).append(info)
    for k, v in by.items():
        print(f"{k:10s} noise {np.median([x['noise'] for x in v]):5.2f}  char_h "
              f"{np.median([x['char_h'] or 0 for x in v]):5.1f}  scale {np.median([x['scale'] for x in v]):4.2f}")


def cmd_scenes():
    man = []
    for scen in SCENARIOS:
        os.makedirs(os.path.join(D, "scenes", scen), exist_ok=True)
        for i, s in enumerate(CFG["samples"]):
            rng = np.random.default_rng(1000 * list(SCENARIOS).index(scen) + i)
            img, em = make_frame(s["id"], scen, rng)
            p = os.path.join(D, "scenes", scen, s["id"] + ".png")
            cv2.imwrite(p, img)
            man.append({"scenario": scen, "sample": s["id"], "path": p, "em": round(float(em), 1)})
        print("scene", scen, "done")
    json.dump(man, open(os.path.join(D, "scenes", "manifest.json"), "w"), indent=1)


def cmd_pipelines():
    man = []
    for it in json.load(open(os.path.join(D, "scenes", "manifest.json"))):
        f = cv2.imread(it["path"])
        for name, fn in PIPELINES.items():
            out = os.path.join(D, "prep", name, it["scenario"])
            os.makedirs(out, exist_ok=True)
            p = os.path.join(out, it["sample"] + ".png")
            cv2.imwrite(p, fn(f))
            man.append({**it, "pipeline": name, "path": p})
    json.dump(man, open(os.path.join(D, "prep", "manifest.json"), "w"), indent=1)
    print("prepared", len(man))


def sharpness(img):
    """ความคมของกรอบ ROI (variance of Laplacian บนภาพย่อกว้าง 480) — ใช้ตัดสินว่ากล้องนิ่งพอหรือยัง"""
    g = gray(roi_crop(img))
    s = 480 / g.shape[1]
    g = cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def cmd_sequence():
    """วิดีโอจำลอง 1280x720 ทุก 0.5 วินาที: ยกกล้อง (เบลอ/ส่าย) -> นิ่ง -> ย้ายไปหน้าถัดไป -> นิ่ง"""
    man = []
    plan = (["move"] * 4 + ["settle"] + ["still"] * 7 + ["move"] * 3 + ["settle"] + ["still"] * 7)
    for i, s in enumerate(CFG["samples"]):
        nxt = CFG["samples"][(i + 1) % len(CFG["samples"])]["id"]
        out = os.path.join(D, "seq", s["id"])
        os.makedirs(out, exist_ok=True)
        frames = []
        for t, state in enumerate(plan):
            sid = s["id"] if t < 12 else nxt
            rng = np.random.default_rng(50000 + i * 100 + t)
            if state == "move":
                ov = (1280, 720, 22, 1.5, int(rng.uniform(14, 30)), "mild", int(rng.uniform(0, 30)), 75)
            elif state == "settle":
                ov = (1280, 720, 22, 1.4, 6, "mild", 5, 78)
            else:
                ov = (1280, 720, 22, 1.0, 0, "mild", 0, 80)
            img, _ = make_frame(sid, "hd", rng, override=ov)
            p = os.path.join(out, f"f{t:02d}.png")
            cv2.imwrite(p, img)
            frames.append({"t": t * 0.5, "state": state, "sample": sid, "path": p, "sharp": round(sharpness(img), 1),
                           "prep": None})
            # เตรียมภาพแบบที่ดีที่สุดไว้ด้วย (ใช้กับนโยบายใหม่)
            pp = p.replace(".png", "_prep.png")
            cv2.imwrite(pp, PIPELINES["P9_h28_sharp"](img))
            frames[-1]["prep"] = pp
        man.append({"sample": s["id"], "next": nxt, "frames": frames})
        print("seq", s["id"], "sharp still~", np.median([f["sharp"] for f in frames if f["state"] == "still"]).round(0),
              "move~", np.median([f["sharp"] for f in frames if f["state"] == "move"]).round(0))
    json.dump(man, open(os.path.join(D, "seq", "manifest.json"), "w"), indent=1)


if __name__ == "__main__":
    {"scenes": cmd_scenes, "pipelines": cmd_pipelines, "sequence": cmd_sequence, "stats": cmd_stats}[sys.argv[1]]()
