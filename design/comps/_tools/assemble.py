#!/usr/bin/env python3
"""Inline the shared engine + the traced art into each comp so every index.html is self-contained.

Replaces the text between these markers in design/comps/<slug>/index.html:
  /* CORE:BEGIN */ ... /* CORE:END */              <- _tools/core.js
  <!-- SPRITE:BEGIN --> ... <!-- SPRITE:END -->     <- <symbol>s from assets/glyph-*.svg + ship-*.svg
Symbols are ids g-<name> (glyphs) and s-<name> (ship silhouettes); use <svg><use href="#g-starship"/></svg>.
usage: python3 design/comps/_tools/assemble.py [slug ...]
"""
import re, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent
COMPS = HERE.parent
core = (HERE / "core.js").read_text()
slugs = sys.argv[1:] or ["instrument-panel", "cartographers-atlas", "quiet-cosmos"]

def symbol(path, prefix):
    s = path.read_text()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    inner = re.search(r"<svg[^>]*>(.*)</svg>", s, re.S).group(1).strip()
    return f'<symbol id="{prefix}-{path.stem.split("-", 1)[1]}" viewBox="{vb}">{inner}</symbol>'

for slug in slugs:
    f = COMPS / slug / "index.html"
    html = f.read_text()
    assets = COMPS / slug / "assets"
    syms = [symbol(p, "g") for p in sorted(assets.glob("glyph-*.svg"))] + [symbol(p, "s") for p in sorted(assets.glob("ship-*.svg"))]
    sprite = '<svg class="sprite" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">' + "".join(syms) + "</svg>"
    html = re.sub(r"(/\* CORE:BEGIN \*/).*?(/\* CORE:END \*/)", lambda m: m.group(1) + "\n" + core + "\n" + m.group(2), html, flags=re.S)
    html = re.sub(r"(<!-- SPRITE:BEGIN -->).*?(<!-- SPRITE:END -->)", lambda m: m.group(1) + sprite + m.group(2), html, flags=re.S)
    f.write_text(html)
    print(f"{slug}: {len(syms)} symbols, {len(html)//1024} KB")
