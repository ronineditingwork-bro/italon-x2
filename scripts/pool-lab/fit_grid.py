"""Fit the homography of one tiled plane in a photo from its own joint grid.

Seeds are a few joint crossings typed in by hand as [x, y, iu, iv] (pixel position in the working
image, tile index along the long and short side). The fit then predicts every crossing inside the
polygon, snaps each to the strongest crossing of the two joint directions nearby, and refits, so
the result rests on hundreds of points instead of the seeds.

Usage: python fit_grid.py WORK.png '{"seeds": [...], "polygon": [...], "tile": [1.2, 0.6]}' [DEBUG.jpg]
Prints the 3x3 matrix mapping pixels to (u, v) metres, for a plane "fit": {"H": ...} in a scene JSON.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def joint_map(img):
    g = img.convert('L')
    closed = g.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    return np.asarray(closed, np.float32) - np.asarray(g, np.float32)


def dlt(img_pts, plane_pts):
    """Homography taking image points to plane points (normalised DLT)."""
    def norm(p):
        c = p.mean(0); s = np.sqrt(2) / np.mean(np.linalg.norm(p - c, axis=1))
        return np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    T1, T2 = norm(img_pts), norm(plane_pts)
    a = (T1 @ np.c_[img_pts, np.ones(len(img_pts))].T).T; b = (T2 @ np.c_[plane_pts, np.ones(len(plane_pts))].T).T
    rows = []
    for (x, y, w), (u, v, z) in zip(a, b):
        rows.append([0, 0, 0, -z * x, -z * y, -z * w, v * x, v * y, v * w])
        rows.append([z * x, z * y, z * w, 0, 0, 0, -u * x, -u * y, -u * w])
    H = np.linalg.svd(np.array(rows))[2][-1].reshape(3, 3)
    H = np.linalg.inv(T2) @ H @ T1
    return H / H[2, 2]


def apply(H, pts):
    q = np.c_[pts, np.ones(len(pts))] @ H.T
    return q[:, :2] / q[:, 2:]


def fit(J, seeds, polygon, tile, rounds=4, radius=6):
    lu, lv = tile
    pts = np.array([s[:2] for s in seeds], float); idx = np.array([s[2:] for s in seeds], float)
    H = dlt(pts, idx * [lu, lv])
    h, w = J.shape
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in polygon], fill=255); inside = np.asarray(m) > 0
    P = np.pad(J, 1, mode='edge'); Js = sum(P[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)) / 9

    def support(x, y, d):
        t = np.linspace(-9, 9, 19); xs = np.clip(np.rint(x + t * d[0]), 0, w - 1).astype(int); ys = np.clip(np.rint(y + t * d[1]), 0, h - 1).astype(int)
        return Js[ys, xs].mean()

    for _ in range(rounds):
        Hi = np.linalg.inv(H)
        corners = apply(H, np.array(polygon, float)) / [lu, lv]
        iu0, iv0 = np.floor(corners.min(0)).astype(int); iu1, iv1 = np.ceil(corners.max(0)).astype(int)
        found_img, found_idx = [], []
        for iu in range(iu0, iu1 + 1):
            for iv in range(iv0, iv1 + 1):
                p = apply(Hi, np.array([[iu * lu, iv * lv]]))[0]
                if not (0 <= p[0] < w and 0 <= p[1] < h) or not inside[int(p[1]), int(p[0])]: continue
                du = apply(Hi, np.array([[(iu + 0.05) * lu, iv * lv]]))[0] - p; dv = apply(Hi, np.array([[iu * lu, (iv + 0.05) * lv]]))[0] - p
                du /= np.linalg.norm(du) + 1e-9; dv /= np.linalg.norm(dv) + 1e-9
                best, where = -1, None
                for oy in range(-radius, radius + 1):
                    for ox in range(-radius, radius + 1):
                        s = support(p[0] + ox, p[1] + oy, du) * support(p[0] + ox, p[1] + oy, dv)
                        if s > best: best, where = s, (p[0] + ox, p[1] + oy)
                if best > 9: found_img.append(where); found_idx.append((iu, iv))
        fi, fx = np.array(found_img, float), np.array(found_idx, float) * [lu, lv]
        H = dlt(fi, fx)
        err = np.linalg.norm(apply(np.linalg.inv(H), fx) - fi, axis=1)
        keep = err < max(3.0, 2.5 * np.median(err))
        H = dlt(fi[keep], fx[keep])
    err = np.linalg.norm(apply(np.linalg.inv(H), fx[keep]) - fi[keep], axis=1)
    return H, fi[keep], err


if __name__ == '__main__':
    work = Image.open(sys.argv[1]).convert('RGB'); cfg = json.loads(sys.argv[2])
    J = joint_map(work)
    H, used, err = fit(J, cfg['seeds'], cfg['polygon'], cfg.get('tile', [1.2, 0.6]))
    print(json.dumps({'H': [[round(v, 9) for v in row] for row in H.tolist()], 'points': len(used),
                      'medianErrorPx': round(float(np.median(err)), 2), 'p90ErrorPx': round(float(np.percentile(err, 90)), 2)}))
    if len(sys.argv) > 3:  # overlay the fitted joints so the fit can be checked by eye
        d = ImageDraw.Draw(work); Hi = np.linalg.inv(H); lu, lv = cfg.get('tile', [1.2, 0.6])
        c = apply(H, np.array(cfg['polygon'], float)) / [lu, lv]; lo, hi = np.floor(c.min(0)) - 1, np.ceil(c.max(0)) + 1
        for iu in np.arange(lo[0], hi[0] + 1):
            d.line([tuple(p) for p in apply(Hi, np.array([[iu * lu, t * lv] for t in np.linspace(lo[1], hi[1], 60)]))], fill=(255, 0, 0), width=1)
        for iv in np.arange(lo[1], hi[1] + 1):
            d.line([tuple(p) for p in apply(Hi, np.array([[t * lu, iv * lv] for t in np.linspace(lo[0], hi[0], 60)]))], fill=(0, 90, 255), width=1)
        for x, y in used: d.ellipse([x - 2, y - 2, x + 2, y + 2], outline=(255, 220, 0))
        d.polygon([tuple(p) for p in cfg['polygon']], outline=(0, 200, 0))
        work.save(sys.argv[3], quality=85)
