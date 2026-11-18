#!/usr/bin/env python3
"""Готовит картинки сцен X2 Outdoor из общего макета: вырезает панели, убирает подписи и выноски, пишет WebP в public/media/outdoor/.
Запуск: python3 scripts/outdoor/prep-scenes.py <макет.png|webp>. Нужны Pillow, numpy, opencv-python-headless.
Когда появятся чистые рендеры без подписей, этот шаг не нужен: положите готовый файл в public/media/outdoor/<id>.webp и опишите сцену в site/shared/outdoor/scenes.mjs."""
import sys, math
import numpy as np, cv2
from PIL import Image

src = sys.argv[1]
im = np.asarray(Image.open(src).convert('RGB'))

# панель: (x0, y0, x1, y1) в макете; верх обрезаем до top — там плашка с названием сцены
PANELS = {
  's1': dict(box=(0, 0, 1536, 509), top=62, name='modern-pool'),
  's2': dict(box=(0, 516, 765, 1024), top=64, name='log-house'),
  's3': dict(box=(771, 516, 1536, 1024), top=64, name='fachwerk-fire'),
}
# выноски в координатах панели: (прямоугольник x0,y0,x1,y1, точка-указатель x,y)
CALLOUTS = {
  's1': [((508, 176, 622, 222), (477, 260)), ((1000, 236, 1122, 281), (978, 315)), ((455, 393, 575, 437), (425, 462))],
  's2': [((565, 215, 683, 260), (540, 295)), ((465, 387, 582, 432), (439, 457))],
  's3': [((64, 194, 190, 242), (40, 282)), ((608, 215, 725, 260), (570, 295)), ((417, 370, 538, 414), (385, 439))],
}

def patch_bubble(img, rect, forbidden):
    """Закрасить плашку «куском» соседней текстуры (Poisson-вставка): в листве и стекле выглядит естественнее, чем размытая заливка."""
    a, b, c, d = rect; pad = 7
    x0, y0, x1, y1 = max(0, a - pad), max(0, b - pad), min(img.shape[1], c + pad), min(img.shape[0], d + pad)
    w, h = x1 - x0, y1 - y0; best = None
    # цвет и разброс окружения считаем по кольцу вокруг плашки (сама тёмная плашка не учитывается)
    ex0, ey0, ex1, ey1 = max(0, x0 - 16), max(0, y0 - 16), min(img.shape[1], x1 + 16), min(img.shape[0], y1 + 16)
    around = img[ey0:ey1, ex0:ex1].astype(np.float32); keep = np.ones(around.shape[:2], bool); keep[y0 - ey0:y1 - ey0, x0 - ex0:x1 - ex0] = False
    gray = around.mean(axis=2)[keep]; sat = float((np.abs(around[..., 0] - around[..., 1]) + np.abs(around[..., 1] - around[..., 2]))[keep].mean())
    if rect[1] > 330 or (float(gray.std()) < 22 and sat < 30): return None   # нижние плашки лежат на бетоне          # ровная серая поверхность (бетон, небо) — обычная заливка лучше
    ring = lambda im, x, y: im[max(0, y - 6):y + h + 6, max(0, x - 6):x + w + 6].astype(np.float32)
    target = ring(img, x0, y0)
    for dx, dy in ((-(w + 30), 0), (w + 30, 0), (0, -(h + 24)), (0, h + 24), (-(w + 30), -(h + 24)), (w + 30, -(h + 24)), (-(w + 30), h + 24), (w + 30, h + 24), (-(w + 80), 0), (w + 80, 0)):
        sx, sy = x0 + dx, y0 + dy
        if sx < 8 or sy < 8 or sx + w > img.shape[1] - 8 or sy + h > img.shape[0] - 8: continue
        if forbidden[sy:sy + h, sx:sx + w].any(): continue
        cand = ring(img, sx, sy)
        if cand.shape != target.shape: continue
        score = float(np.abs(cand - target)[:6].mean() + np.abs(cand - target)[:, :6].mean()) if False else float(np.abs(cand - target).mean())
        if best is None or score < best[0]: best = (score, sx, sy)
    if best is None: return None
    _, sx, sy = best
    src = img[sy:sy + h, sx:sx + w].copy(); m = np.full((h, w), 255, np.uint8)
    return cv2.seamlessClone(src, img, m, (x0 + w // 2, y0 + h // 2), cv2.NORMAL_CLONE)

for key, p in PANELS.items():
    x0, y0, x1, y1 = p['box']
    tile = np.ascontiguousarray(im[y0:y1, x0:x1])
    out = tile.copy()
    for k, ((a, b, c, d), (px, py)) in enumerate(CALLOUTS[key]):
        forbidden = np.zeros(tile.shape[:2], np.uint8)          # чужие плашки и точки (свою можно перекрывать: она будет заменена)
        for j, ((a2, b2, c2, d2), (px2, py2)) in enumerate(CALLOUTS[key]):
            if j != k: cv2.rectangle(forbidden, (a2 - 12, b2 - 12), (c2 + 12, d2 + 12), 255, -1); cv2.circle(forbidden, (px2, py2), 16, 255, -1)
        cv2.circle(forbidden, (px, py), 16, 255, -1)
        r = patch_bubble(out, (a, b, c, d), forbidden)
        if r is None:
            m = np.zeros(out.shape[:2], np.uint8); cv2.rectangle(m, (a - 7, b - 7), (c + 7, d + 7), 255, -1); out = cv2.inpaint(out, m, 7, cv2.INPAINT_TELEA)
        else: out = r
    # выноски (тонкие линии) и точки — обычной заливкой
    lines = np.zeros(out.shape[:2], np.uint8)
    for (a, b, c, d), (px, py) in CALLOUTS[key]:
        cx = a if abs(px - a) < abs(px - c) else c; cy = d if abs(py - d) < abs(py - b) else b
        cv2.line(lines, (cx, cy), (px, py), 255, 7); cv2.circle(lines, (px, py), 11, 255, -1)
    out = cv2.inpaint(out, lines, 5, cv2.INPAINT_TELEA)
    out = out[p['top']:]
    h, w = out.shape[:2]
    Image.fromarray(out).save(f"public/media/outdoor/{p['name']}.webp", quality=92, method=6)
    print(key, p['name'], w, h)
