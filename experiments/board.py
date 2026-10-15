"""จำลองภาพกระดานในห้องเรียน (ไวท์บอร์ด / กระดานดำเขียว) ที่ถ่ายด้วยมือถือ

python -I board.py           -> data/board_scenes/<view>/<id>_<kind>.png + manifest.json
กระดานมี 3 ก้อนข้อความ: หัวเรื่อง (กลาง), คอลัมน์ซ้าย, คอลัมน์ขวา
ลำดับการอ่านที่ถูก = หัวเรื่อง -> คอลัมน์ซ้าย -> คอลัมน์ขวา
"""
import json
import os

import cv2
import numpy as np

import sim

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "data")
BOARDS = json.load(open(os.path.join(HERE, "boards.json"), encoding="utf-8"))["boards"]

# มุมกล้อง: (กว้าง, สูง, สัดส่วนความกว้างกระดานต่อเฟรม, เอียง, เบลอ)
VIEWS = {
    "near":     (1920, 1080, 0.86, 0, 0.9),
    "far":      (1920, 1080, 0.55, 0, 1.0),
    "side":     (1920, 1080, 0.80, 25, 1.0),
    "portrait": (1080, 1920, 0.80, 0, 1.0),
}


def alpha(path):
    return cv2.imread(path, cv2.IMREAD_UNCHANGED)[:, :, 3].astype(np.float32) / 255.0


def make_board(b, kind, rng, BW=2400, BH=1250):
    yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
    if kind == "white":
        base = np.array([238, 236, 232], np.float32)  # BGR
        img = np.ones((BH, BW, 3), np.float32) * base
        # รอยลบไม่สะอาด
        for _ in range(14):
            p = (int(rng.uniform(0, BW)), int(rng.uniform(0, BH)))
            cv2.ellipse(img, p, (int(rng.uniform(80, 300)), int(rng.uniform(8, 30))), float(rng.uniform(-20, 20)), 0, 360,
                        tuple(float(v) for v in base - rng.uniform(10, 22)), -1)
        img = cv2.GaussianBlur(img, (0, 0), 6)
        ink = {"title": np.array([45, 45, 190], np.float32), "left": np.array([150, 60, 35], np.float32),
               "right": np.array([40, 40, 40], np.float32)}
    else:
        base = np.array([62, 82, 48], np.float32)  # เขียวเข้ม (BGR)
        img = np.ones((BH, BW, 3), np.float32) * base
        for _ in range(18):  # ฝุ่นชอล์กที่ลบไม่หมด
            p = (int(rng.uniform(0, BW)), int(rng.uniform(0, BH)))
            cv2.ellipse(img, p, (int(rng.uniform(100, 380)), int(rng.uniform(20, 70))), float(rng.uniform(-30, 30)), 0, 360,
                        tuple(float(v) for v in base + rng.uniform(14, 34)), -1)
        img = cv2.GaussianBlur(img, (0, 0), 18)
        chalk = np.array([222, 228, 226], np.float32)
        ink = {"title": chalk, "left": chalk, "right": np.array([150, 225, 240], np.float32)}  # ชอล์กเหลืองอ่อนด้านขวา

    places = {"title": (0.5, 0.07, 0.8), "left": (0.06, 0.36, 0.42), "right": (0.54, 0.36, 0.42)}
    for part, (px, py, maxw) in places.items():
        a = alpha(os.path.join(D, "board", f"{b['id']}_{part}.png"))
        s = min(1.0, maxw * BW / a.shape[1], 0.5 * BH / a.shape[0])
        a = cv2.resize(a, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        if kind == "green":  # เนื้อชอล์ก: ขาด ๆ เป็นจุด ๆ
            a *= np.clip(0.55 + 0.45 * rng.random(a.shape).astype(np.float32) + 0.15, 0, 1)
            a = cv2.GaussianBlur(a, (0, 0), 0.6)
        h, w = a.shape
        x = int(px * BW - (w / 2 if part == "title" else 0))
        y = int(py * BH)
        h, w = min(h, BH - y), min(w, BW - x)
        reg = img[y:y + h, x:x + w]
        reg[:] = reg * (1 - a[:h, :w, None]) + ink[part] * a[:h, :w, None]

    if kind == "white":  # แสงสะท้อนจากหลอดไฟบนไวท์บอร์ด
        cx, cy = rng.uniform(0.25, 0.75) * BW, rng.uniform(0.2, 0.5) * BH
        g = np.exp(-(((xx - cx) / (BW * 0.18)) ** 2 + ((yy - cy) / (BH * 0.12)) ** 2))
        img = img + g[..., None] * 70
    return np.clip(img, 0, 255)


def make_scene(b, kind, view, rng):
    W, H, frac, tilt, blur = VIEWS[view]
    board = make_board(b, kind, rng)
    BH, BW = board.shape[:2]
    # ผนังห้อง + ขอบกระดาน
    frame_col = np.array([175, 180, 185], np.float32) if kind == "white" else np.array([40, 75, 110], np.float32)
    bw = int(W * frac)
    bh = int(bw * BH / BW)
    pad = max(6, bw // 60)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    wall = np.ones((H, W, 3), np.float32) * np.array([190, 205, 215], np.float32) * (0.85 + 0.2 * yy[..., None] / H)
    x0, y0 = (W - bw) // 2, int(H * 0.5 - bh * 0.55)
    layer = np.zeros((H, W, 3), np.float32)
    mask = np.zeros((H, W), np.float32)
    layer[y0 - pad:y0 + bh + pad, x0 - pad:x0 + bw + pad] = frame_col
    mask[y0 - pad:y0 + bh + pad, x0 - pad:x0 + bw + pad] = 1
    layer[y0:y0 + bh, x0:x0 + bw] = cv2.resize(board, (bw, bh), interpolation=cv2.INTER_AREA)
    layer, mask = sim.warp(layer, mask, W, H, tilt, rng.uniform(-2, 2))
    img = wall * (1 - mask[..., None]) + layer * mask[..., None]
    img = sim.lighting(img, "mild", rng)
    img = cv2.GaussianBlur(img, (0, 0), blur)
    img = img + rng.normal(0, 2.5, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def main():
    man = []
    for vi, view in enumerate(VIEWS):
        os.makedirs(os.path.join(D, "board_scenes", view), exist_ok=True)
        for bi, b in enumerate(BOARDS):
            for kind in ("white", "green"):
                rng = np.random.default_rng(9000 + vi * 100 + bi * 2 + (kind == "green"))
                img = make_scene(b, kind, view, rng)
                p = os.path.join(D, "board_scenes", view, f"{b['id']}_{kind}.png")
                cv2.imwrite(p, img)
                man.append({"scenario": f"{view}|{kind}", "view": view, "kind": kind, "sample": b["id"], "path": p,
                            "gt": "\n".join([b["title"], b["left"], b["right"]])})
        print("view", view, "done")
    json.dump(man, open(os.path.join(D, "board_scenes", "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def jitter_frames(n=3):
    """เฟรมต่อเนื่องของกระดานเดียวกัน: มือสั่นนิด ๆ (เลื่อน/เอียง/เบลอ/โฟกัสต่างกัน) — ใช้ทดสอบการอ่านหลายเฟรม"""
    man = []
    for vi, view in enumerate(VIEWS):
        for bi, b in enumerate(BOARDS):
            for kind in ("white", "green"):
                frames = []
                for k in range(n):
                    rng = np.random.default_rng(9000 + vi * 100 + bi * 2 + (kind == "green"))  # กระดานเดิม
                    W, H, frac, tilt, blur = VIEWS[view]
                    VIEWS[view] = (W, H, frac * (1 + (k - 1) * 0.03), tilt, blur * (0.9 + 0.6 * np.random.default_rng(k + 31 * bi + vi).random()))
                    img = make_scene(b, kind, view, rng)
                    VIEWS[view] = (W, H, frac, tilt, blur)
                    krng = np.random.default_rng(777 + k * 13 + bi * 7 + vi)
                    if krng.random() < 0.5:  # มือสั่นเล็กน้อยในบางเฟรม
                        img = cv2.filter2D(img, -1, sim.motion_kernel(int(krng.uniform(3, 7)) | 1, krng.uniform(0, 180)))
                    p = os.path.join(D, "board_seq", f"{view}_{b['id']}_{kind}_{k}.png")
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    cv2.imwrite(p, img)
                    frames.append(p)
                man.append({"scenario": f"{view}|{kind}", "view": view, "kind": kind, "sample": b["id"], "frames": frames,
                            "gt": "\n".join([b["title"], b["left"], b["right"]])})
    json.dump(man, open(os.path.join(D, "board_seq", "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("board sequences", len(man))


if __name__ == "__main__":
    import sys
    jitter_frames() if sys.argv[1:] == ["seq"] else main()
