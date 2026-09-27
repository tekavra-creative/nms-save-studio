#!/bin/bash
# Vectorise every raw imagen output into the tintable SVGs each comp uses.
# usage: bash design/comps/_tools/trace-all.sh   (from repo root; needs ~/.claude/tools/venv)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HOME/.claude/tools/venv/bin/python"
T="$HERE/trace.py"
C="$HERE/.."
GLYPHS="starship multitool companion freighter currency blueprint words exocraft base"
SHIPS="fighter hauler explorer living"

d="$C/instrument-panel/assets"
for g in $GLYPHS; do "$PY" "$T" "$d/raw/glyph-$g.jpg" "$d/glyph-$g.svg" mono --stroke 0.07 --square; done
for s in $SHIPS; do "$PY" "$T" "$d/raw/ship-$s.jpg" "$d/ship-$s.svg" mono --stroke 0.008; done

d="$C/cartographers-atlas/assets"
for g in $GLYPHS; do "$PY" "$T" "$d/raw/glyph-$g.jpg" "$d/glyph-$g.svg" fill --square; done
for s in $SHIPS; do "$PY" "$T" "$d/raw/ship-$s.jpg" "$d/ship-$s.svg" engrave --work 900; done

d="$C/quiet-cosmos/assets"
for g in $GLYPHS; do
  extra=""; [ "$g" = "words" ] && extra="--fill-outline"   # outline bubble -> solid bubble
  "$PY" "$T" "$d/raw/glyph-$g.jpg" "$d/glyph-$g.svg" soft --square --largest $extra
done
for s in $SHIPS; do "$PY" "$T" "$d/raw/ship-$s.jpg" "$d/ship-$s.svg" fill; done
