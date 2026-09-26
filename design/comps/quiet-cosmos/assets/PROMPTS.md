# Parhelion — Quiet Cosmos — art log

Every image here was generated for this comp through **imagen.tekavra.com** — original art, no game screenshots or icons.

- Provider: `cfwa` (Cloudflare Workers AI, Flux Schnell), quality `premium` (8 steps), 1024×1024. **Free tier — no paid calls.**
- `recraft` (the SVG provider) is not configured on the Imagen worker (`RECRAFT_API_KEY secret not configured`), so every glyph and ship was generated as a black-on-white raster and **vectorised locally** by `design/comps/_tools/trace.py` (`bash design/comps/_tools/trace-all.sh` re-runs it).
- Trace modes for this direction: glyphs `soft --square --largest (words: + --fill-outline)`, ships `fill`. The mode is what makes separately generated images read as one family (same stroke weight / same fill logic).
- The traced SVGs are inlined into `index.html` as `<symbol>`s by `design/comps/_tools/assemble.py`, so they recolour from CSS (`currentColor`).
- Wordmark marks are hand-drawn SVG in `index.html`, not generated.
- Flux on Workers AI ignores `seed`, so re-running a prompt gives a new variation, not the same image.

| Output (raw → used) | Imagen id | Tries | Prompt |
|---|---|---|---|
| `raw/glyph-companion.jpg` → `assets/glyph-companion.svg` | `gen_ILfbjI2MVESIxp9Giwxdrw` | 1 | single icon of a small four-legged alien pet creature with a long tail, soft rounded solid black silhouette, smooth friendly minimal shape, pure white background, centered, generous margin, flat, no text, no outline |
| `raw/glyph-freighter.jpg` → `assets/glyph-freighter.svg` | `gen_Tke2YeHEKisF-qHcSkOOJA` | 2 | single icon of a massive space freighter spaceship, side view, no water, soft rounded solid black filled silhouette, thick chunky shape, pure white background, centered, generous margin, flat, no thin lines, no text |
| `raw/glyph-currency.jpg` → `assets/glyph-currency.svg` | `gen_k1tMKsKroweb492qrgG9OQ` | 1 | single icon of a single faceted crystal coin, soft rounded solid black silhouette, smooth friendly minimal shape, pure white background, centered, generous margin, flat, no text, no outline |
| `raw/glyph-blueprint.jpg` → `assets/glyph-blueprint.svg` | `gen_KrpEmj_l5FSQuRC18pb9mw` | 5 | a single thick solid black gear cog icon with rounded teeth and a round hole in the middle, filled black shape, white background, centered, flat, no text |
| `raw/glyph-words.jpg` → `assets/glyph-words.svg` | `gen_YX2lKN-oxxHmOv1MyruZzw` | 2 | single icon of a speech bubble with three white dots inside, soft rounded solid black filled silhouette, thick chunky shape, pure white background, centered, generous margin, flat, no thin lines, no text |
| `raw/glyph-base.jpg` → `assets/glyph-base.svg` | `gen_iG4Tv4XWrmdgmYvSAu2eIA` | 1 | single icon of a small domed habitat building with an antenna, soft rounded solid black silhouette, smooth friendly minimal shape, pure white background, centered, generous margin, flat, no text, no outline |
| `raw/glyph-starship.jpg` → `assets/glyph-starship.svg` | `gen_Fwe0zsoDAj7EGy1e0HLtGA` | 1 | single icon of a small starship, soft rounded solid black silhouette, smooth friendly minimal shape, pure white background, centered, generous margin, flat, no text, no outline |
| `raw/glyph-multitool.jpg` → `assets/glyph-multitool.svg` | `gen_oo_lYDPet5vbLlAjqoYv-g` | 1 | single icon of a compact handheld sci-fi scanning tool, like a futuristic pistol-shaped multitool, soft rounded solid black silhouette, smooth friendly minimal shape, pure white background, centered, generous margin, flat, no text, no outline |
| `raw/glyph-exocraft.jpg` → `assets/glyph-exocraft.svg` | `gen_SyE_HM0MsxQw6kEqNac76w` | 1 | single icon of a six-wheeled planetary rover vehicle, soft rounded solid black silhouette, smooth friendly minimal shape, pure white background, centered, generous margin, flat, no text, no outline |
| `raw/ship-fighter.jpg` → `assets/ship-fighter.svg` | `gen_Dijd59AqSZ62ocukBZ3O_A` | 1 | side-view silhouette of a sleek sci-fi fighter spaceship with swept forward wings and a small cockpit, smooth solid black shape, elegant and minimal, pure white background, centered, horizontal, flat, no text |
| `raw/ship-hauler.jpg` → `assets/ship-hauler.svg` | `gen_ABUgbfG2Trh49tu5wSwsbA` | 1 | side-view silhouette of a sleek sci-fi heavy cargo hauler spaceship, boxy and long with large engines, smooth solid black shape, elegant and minimal, pure white background, centered, horizontal, flat, no text |
| `raw/ship-explorer.jpg` → `assets/ship-explorer.svg` | `gen_b-3oM0XqWbuydl-biUmM2Q` | 1 | side-view silhouette of a sleek sci-fi explorer spaceship with long thin fuselage and scanning antennae, smooth solid black shape, elegant and minimal, pure white background, centered, horizontal, flat, no text |
| `raw/ship-living.jpg` → `assets/ship-living.svg` | `gen_-XmF4Mrp4i-LPq-qQwm_vA` | 1 | side-view silhouette of a sleek sci-fi organic living spaceship shaped like a biological creature with curved ribs and tendrils, smooth solid black shape, elegant and minimal, pure white background, centered, horizontal, flat, no text |
| `raw/bg-nebula-b.jpg` → `— (discarded; file not kept)` | `gen_4EMRwIrVlJ4690m2hs07Xg` | 1 | vast calm cosmic haze, deep midnight blue fading to soft teal, a warm peach glow near the horizon, delicate wisps of light, sparse tiny stars, serene, minimal, no planets, no text |
| `raw/bg-nebula-a.jpg` → `assets/bg-nebula.jpg` — mirrored left↔right (warm glow sits behind Write) and top 100px cropped to remove a moon | `gen_FVqjPqx3uRonsaI2b3OMzQ` | 1 | soft luminous nebula in deep teal and dusky blue with warm peach and rose light, gentle drifting gas clouds, a few faint stars, dreamy, airy, calm, wide empty space, no planets, no text |

Successful calls logged for this direction: **21** (cfwa, $0 billed — the worker records a nominal ~$0.004 neuron estimate each).
Some prompts were reworded after Workers AI’s safety filter falsely flagged harmless words (e.g. a companion creature, a dome); the table shows the prompt that produced the file in use.
