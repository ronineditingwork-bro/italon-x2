"""Follow a photo's tile joints from crossing to crossing and write the lattice of crossings.

AI-drawn scenes bend perspective across the frame, so one homography drifts off the joints after a few
tiles. Here each neighbour is predicted from the last step (p + (p - previous)) and snapped to the
strongest crossing of the two local joint directions nearby, so the lattice follows the photo itself.

Usage: python track_grid.py WORK.png '{"seeds": [[x, y, i, j], ...], "polygon": [...], "exclude": [...]}' OUT.json [DEBUG.jpg]
Seeds: one crossing (i, j) and its neighbours (i+1, j) and (i, j+1) at least. i runs along the tile's long side.
OUT.json: {"lattice": [[x, y, i, j], ...]} for a plane "fit" in a scene JSON (see photo_scene.py).
"""
import json, sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw
from fit_grid import joint_map

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def track(J, seeds, inside, min_score=7.0, max_nodes=4000, cfg_radius=0.3):
    h, w = J.shape
    P = np.pad(J, 1, mode='edge'); Js = sum(P[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)) / 9

    def support(x, y, d):
        n = np.linalg.norm(d)
        if n < 1e-6: return 0.0
        t = np.linspace(-0.35, 0.35, 15) * n; u = d / n   # sample along the joint, a third of a tile each way
        xs = np.clip(np.rint(x + t * u[0]), 0, w - 1).astype(int); ys = np.clip(np.rint(y + t * u[1]), 0, h - 1).astype(int)
        return float(Js[ys, xs].mean())

    nodes = {(i, j): np.array([x, y], float) for x, y, i, j in seeds}
    queue = deque(nodes)
    while queue and len(nodes) < max_nodes:
        i, j = queue.popleft(); p = nodes[(i, j)]
        for di, dj in DIRS:
            key = (i + di, j + dj)
            if key in nodes: continue
            back = nodes.get((i - di, j - dj))
            if back is None:   # no step in this direction yet: borrow it from a neighbour that has one
                for (oi, oj) in [(i + dj, j + di), (i - dj, j - di)]:
                    if (oi, oj) in nodes and (oi + di, oj + dj) in nodes: back = p - (nodes[(oi + di, oj + dj)] - nodes[(oi, oj)]); break
            if back is None: continue
            step = p - back; guess = p + step
            if not (0 <= guess[0] < w and 0 <= guess[1] < h) or not inside[int(guess[1]), int(guess[0])]: continue
            # the other direction at the guess, from a known perpendicular step nearby
            perp = None
            for (a, b) in [((i + dj, j + di), (i, j)), ((i, j), (i - dj, j - di))]:
                if a in nodes and b in nodes: perp = nodes[a] - nodes[b]; break
            if perp is None: perp = np.array([-step[1], step[0]])
            r = max(2, int(cfg_radius * min(np.linalg.norm(step), np.linalg.norm(perp))))
            best, at = -1.0, None
            for oy in range(-r, r + 1):
                for ox in range(-r, r + 1):
                    x, y = guess[0] + ox, guess[1] + oy
                    if not (0 <= x < w and 0 <= y < h): continue
                    s = min(support(x, y, step), support(x, y, perp))   # a real crossing has both joints, not one
                    if s > best: best, at = s, np.array([x, y])
            if best >= min_score and inside[int(at[1]), int(at[0])]:
                nodes[key] = at; queue.append(key)
    return nodes


if __name__ == '__main__':
    work = Image.open(sys.argv[1]).convert('RGB'); cfg = json.loads(sys.argv[2]); out = sys.argv[3]
    W, H = work.size
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m); d.polygon([tuple(p) for p in cfg['polygon']], fill=255)
    for p in cfg.get('exclude', []): d.polygon([tuple(q) for q in p], fill=0)
    nodes = track(joint_map(work, cfg.get('joints', 'both')), cfg['seeds'], np.asarray(m) > 0, cfg.get('minScore', 7.0), cfg_radius=cfg.get('radius', 0.3))
    json.dump({'lattice': [[round(float(p[0]), 1), round(float(p[1]), 1), i, j] for (i, j), p in sorted(nodes.items())]}, open(out, 'w'))
    print(json.dumps({'nodes': len(nodes)}))
    if len(sys.argv) > 4:
        dr = ImageDraw.Draw(work)
        for (i, j), p in nodes.items():
            for di, dj, col in [(1, 0, (255, 0, 0)), (0, 1, (0, 90, 255))]:
                q = nodes.get((i + di, j + dj))
                if q is not None: dr.line([tuple(p), tuple(q)], fill=col, width=2)
        dr.polygon([tuple(p) for p in cfg['polygon']], outline=(0, 200, 0))
        work.save(sys.argv[4], quality=85)
