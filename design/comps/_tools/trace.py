#!/usr/bin/env python3
"""Raster -> clean single-colour SVG tracer for the comp art.

Imagen's SVG provider (recraft) is not configured, so every glyph/silhouette is generated as a
black-on-white raster on the free `cfwa` provider and vectorised here. The mode also *normalises
style*, which is what makes a set of separately generated images read as one family:

  mono    - skeleton -> uniform dilation: every glyph gets the exact same stroke weight
            (filled shapes are converted to their outline first)
  fill    - solid silhouette, small specks removed, lightly smoothed
  soft    - solid silhouette with morphological rounding + heavy smoothing (soft corners)
  engrave - keeps fine hatching detail (for large plate illustrations)

Output: <svg viewBox> with one evenodd path, fill="currentColor" (tintable from CSS).

usage: python trace.py <in.jpg> <out.svg> <mode> [--stroke 0.075] [--square]
Needs: numpy, scikit-image, scipy, pillow (Tekavra shared venv: ~/.claude/tools/venv).
"""
import sys, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import filters, measure, morphology, segmentation

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("mode", choices=["mono", "fill", "soft", "engrave"])
ap.add_argument("--stroke", type=float, default=0.075, help="mono stroke width as fraction of max dimension")
ap.add_argument("--square", action="store_true", help="pad viewBox to a square (icons)")
ap.add_argument("--work", type=int, default=512, help="working resolution (max dimension)")
ap.add_argument("--largest", action="store_true", help="keep only the main shape(s), drop stray fragments")
ap.add_argument("--fill-outline", action="store_true", help="soft: fill large enclosed areas of an outline drawing")
a = ap.parse_args()

g = np.asarray(Image.open(a.src).convert("L"), dtype=np.float32) / 255.0
ink = 1.0 - g
t = filters.threshold_otsu(ink)
b = ink > max(t, 0.25)
# drop specks + anything touching the frame edge (vignettes, borders)
b = morphology.remove_small_objects(b, max_size=int(b.size * 0.00015))
lab = measure.label(b)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
for e in edge:
    b[lab == e] = False
ys, xs = np.nonzero(b)
if len(xs) == 0:
    sys.exit(f"empty image: {a.src}")
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crop = ink[y0:y1, x0:x1]
bc = b[y0:y1, x0:x1]
h, w = bc.shape
s = a.work / max(h, w)
W, H = max(1, round(w * s)), max(1, round(h * s))
crop = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
bc = crop > max(t, 0.25)
M = a.work

if a.largest:  # drop stray fragments (e.g. a detached magazine next to a tool)
    lab = measure.label(bc)
    if lab.max() > 1:
        areas = np.bincount(lab.ravel())[1:]
        keep = np.nonzero(areas >= areas.max() * 0.25)[0] + 1
        bc = np.isin(lab, keep)

if a.mode == "mono":
    # skeletonise at full resolution (thin lines break if downsampled first)
    fb = b[y0:y1, x0:x1]
    FM = max(fb.shape)
    dt = ndi.distance_transform_edt(fb)
    thick = np.percentile(dt[fb], 90) if fb.any() else 0
    if thick > FM * 0.03:  # filled shapes -> outline first
        fb = segmentation.find_boundaries(ndi.binary_fill_holes(fb), mode="inner")
    fb = morphology.binary_closing(fb, morphology.disk(3))
    sk = morphology.skeletonize(fb)
    sk = morphology.remove_small_objects(sk, max_size=int(FM * 0.02), connectivity=2)
    r = max(1, round(a.stroke * FM / 2))
    mask = ndi.binary_dilation(sk, structure=morphology.disk(r))
    mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
    field = filters.gaussian(mask, sigma=0.8)
elif a.mode == "fill":
    bc = morphology.binary_closing(bc, morphology.disk(2))
    bc = morphology.remove_small_holes(bc, max_size=int(M * M * 0.0004))
    field = filters.gaussian(bc.astype(np.float32), sigma=1.4)
elif a.mode == "soft":
    # outline drawings -> solid shapes: fill big enclosed areas, keep small holes (eyes, dots)
    holes = ndi.binary_fill_holes(bc) & ~bc
    hl = measure.label(holes)
    if a.fill_outline and hl.max():
        areas = np.bincount(hl.ravel())
        big = np.nonzero(areas > bc.size * 0.015)[0]
        bc = bc | np.isin(hl, big[big > 0])
    bc = morphology.binary_closing(bc, morphology.disk(6))
    bc = morphology.remove_small_holes(bc, max_size=int(M * M * 0.002))
    bc = morphology.binary_opening(bc, morphology.disk(4))
    field = filters.gaussian(bc.astype(np.float32), sigma=3.0)
else:  # engrave
    field = filters.gaussian(crop, sigma=0.7)
    field = np.clip((field - t * 0.8) / max(1e-3, 1 - t * 0.8), 0, 1)

pad = 8
field = np.pad(field, pad)
level = 0.5 if a.mode != "engrave" else 0.35
contours = measure.find_contours(field, level)
min_len = 10 if a.mode == "engrave" else 16
parts = []
for c in contours:
    if len(c) < min_len:
        continue
    c = measure.approximate_polygon(c, tolerance=0.45 if a.mode != "soft" else 0.8)
    if len(c) < 3:
        continue
    pts = [(x - pad, y - pad) for y, x in c]
    if a.mode == "soft":  # midpoint-quadratic smoothing
        n = len(pts)
        mids = [((pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2) for i in range(n)]
        d = f"M{mids[-1][0]:.1f} {mids[-1][1]:.1f}" + "".join(
            f"Q{pts[i][0]:.1f} {pts[i][1]:.1f} {mids[i][0]:.1f} {mids[i][1]:.1f}" for i in range(n)) + "Z"
    else:
        d = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"
    parts.append(d)

m = 6
vx, vy, vw, vh = -m, -m, W + 2 * m, H + 2 * m
if a.square:
    side = max(vw, vh)
    vx -= (side - vw) / 2; vy -= (side - vh) / 2; vw = vh = side
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.1f} {vy:.1f} {vw:.1f} {vh:.1f}">'
       f'<path fill="currentColor" fill-rule="evenodd" d="{"".join(parts)}"/></svg>\n')
open(a.dst, "w").write(svg)
print(f"{a.dst.split('/')[-1]}: {len(parts)} paths, {len(svg)//1024}KB, {W}x{H}")
