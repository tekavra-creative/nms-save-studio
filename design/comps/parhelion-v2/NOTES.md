# Parhelion v2 — cleaned up

Vikelas's note: *"clean up parhelion to look less AI."* This folder is a second pass at the
Parhelion comp (`design/comps/quiet-cosmos/`). Same idea, same behaviour, same name — every
visible "an AI made this" tell replaced with something built by hand. Nothing about the merge
logic changed; only how it looks.

## What was reading as AI-made, and what replaced it

| v1 (quiet-cosmos) | Why it read as AI | v2 (this folder) |
|---|---|---|
| Photographic nebula background, glowing colour blobs | Stock "AI dream" look, generated via Flux/Workers AI | Solid near-black blue, a hand-placed scatter of a dozen tiny stars, faint film grain (SVG turbulence at 3.5% opacity) |
| Blur + translucency on every panel (glassmorphism) | The single most recognisable "2024 AI generator" texture | Solid flat surfaces, three elevation steps (page / panel / card), 1px hairline borders. No `backdrop-filter` anywhere |
| Ship silhouettes: Flux-generated raster, autotraced (blobby, inconsistent) | Traced bitmaps always have soft, wandering outlines | 9 hand-built SVG line drawings, one per ship class, same viewBox, same 2px stroke (`vector-effect="non-scaling-stroke"` keeps it crisp at any size), same side-profile convention, one small accent mark (a "canopy" dot, or a diamond, or a halo ring) per ship |
| Category glyphs: same Flux+trace pipeline | Same problem, smaller icons | 6 hand-built line icons (starship, multitool, companion, currency, blueprint, words) on a 24×24 grid, same stroke system as the ships |
| Unbounded (display) | The single most over-used "AI/trend" typeface of the last two years | **Newsreader** italic light — a real serif, used only for the save name, the wordmark, and section titles (never on a number) |
| Gradient pill buttons, rounded-everything | Generic "SaaS gradient" tell | One flat gold rectangle (the Write button), 6–8px corner radius everywhere a control lives, no gradients on any control |
| Glowing "light tether" drag line (blurred, 10px wide) | Sparkle/glow reads as decoration, not feedback | A thin (1.5px) dashed gold line, no blur, no glow layer |
| Heavy box-shadow bloom on hover / staged / drop-ready states | Same glow problem, everywhere | Every glow removed; hover/staged states now just a border-colour or background change, sometimes a small elevation shadow |

## What was kept (it already worked)

- The vertical flow: your save on top, the other save orbiting below, you lift things **up**.
- The ring gauge (capacity meter) — restrained now: thin track, two flat colours, no drop-shadow.
- The name **Parhelion** and the "twin suns" wordmark mark (simplified, no gradient fill).
- Zero modal dialogs, the ⌘K command palette, ⌘Z/⇧⌘Z undo/redo, the disk-state indicator, the
  Changes panel with per-line revert, "Write N Changes" as the one primary action.
- The spring-physics drag engine (`_tools/core.js`, untouched) — it was already doing the
  "physical settle, not sparkle" thing right; only the paint on top was the problem.

## New this pass

The old data only had 4 ship silhouettes (Explorer, Fighter, Hauler, Living) and quietly reused
them for classes that don't look like any of those (a Shuttle drawn as an Explorer, a Solar ship
drawn as an Explorer, a Sentinel Interceptor drawn as a Fighter). Since the brief was "one icon
per ship class," this pass adds real Shuttle, Exotic, Solar, Sentinel Interceptor, and Boundary
Herald icons, fixes the three mislabeled ships in the sample data to point at the right one, and
adds two fictional ships (**Driftglass Choir**, an Exotic; **Ashwake Herald**, a Boundary Herald)
to the other save so all 9 classes are visible in the default screenshot without touching the
peak-moment demo (still: drag **Glasswing** up into the open bay).

## Palette (OKLCH)

```
--bg-0   oklch(13% 0.026 250)   page background
--bg-1   oklch(18% 0.024 250)   panel surface
--bg-2   oklch(23% 0.022 250)   card / tile surface
--bg-3   oklch(29% 0.02  250)   hover / raised
--edge   oklch(100% 0 0 / .08)  hairline border
--edge-2 oklch(100% 0 0 / .16)  hairline border, brighter (panel tops)
--text   oklch(96% 0.006 250)
--text-2 oklch(78% 0.016 250)
--text-3 oklch(58% 0.02  250)
--gold      oklch(80% 0.135 75)   the one accent — primary action + staged state, only
--cool      oklch(72% 0.05  225)  muted — "can be lifted", focus rings
--mint      oklch(76% 0.075 165)  written-to-disk state
```
P3 displays get a small chroma bump on the three accents (`@media (color-gamut: p3)`), per the
playbook's dark-mode colour guidance — lift chroma, not just lightness, or accents wash out on a
dark surface.

## Fonts

- **Newsreader** (italic, weight 300) — the save name, the wordmark, section titles. The only
  place personality shows up; never on a number.
- **Public Sans** — everything else: body copy, labels, controls, and every number
  (`font-variant-numeric: tabular-nums lining-nums`, forced via the shared `.num` class so figures
  never jump width when they change).
- Neither is Unbounded, Space Grotesk, Inter, Poppins, or Montserrat.

## Files

- `index.html` — the comp. Same structure as `quiet-cosmos/index.html` (same `_tools/core.js`
  engine inlined between `CORE:BEGIN`/`CORE:END`, patched only to fix 3 ship-class/icon mismatches
  and add the 2 fictional ships above — merge logic itself is untouched).
- `assets/glyph-*.svg`, `assets/ship-*.svg` — the 15 hand-built line-art source files (6 category
  glyphs + 9 ship classes), inlined into `index.html`'s sprite block by hand rather than through
  the Flux+trace pipeline the other two comps use.
- `screenshots/` — 1440×900 and 1280×800 default states, mid-drag, after-drop, after-undo, the
  Knowledge tab, the ⌘K palette, and a reduced-motion click-to-copy pass. All clean, no console
  errors.

## Review pass (`web-design-guidelines` skill)

Ran the Vercel Web Interface Guidelines checklist against `index.html`. Two real findings, both
fixed:

- `--text-3` (labels, meta text) measured 4.40:1 on `--bg-1` and 3.95:1 on `--bg-2` — under the
  4.5:1 WCAG AA floor for normal-size text. Lifted `oklch(58% ...)` → `oklch(64% ...)`; now 5.60:1
  / 5.03:1 (computed via the real OKLCH→linear-sRGB conversion in a headless browser, not eyeballed).
- `.rev` (the per-line revert button) was 30×30px; bumped to 32×32 for a slightly more comfortable
  click target.

Everything else already passed: every interactive element is a real `<button>` (keyboard works
for free — Enter/Space trigger `click`, no custom key handling needed), Esc closes the palette and
cancels an in-progress drag, ⌘K/⌘Z/⇧⌘Z are wired with an input-focus guard, `aria-live="polite"`
announces every state change, icon-only buttons (`.rev`, `.search`) carry `aria-label`, no
`transition: all` anywhere, and `prefers-reduced-motion` swaps every spring/flight animation for
an instant state change (verified: clicking a ship under `reducedMotion: 'reduce'` throws no
errors and completes immediately). The one `outline: none` (`.cmdk-input`) has a visible
replacement already — the command-palette field gets a bottom-border highlight on
`:focus-within` — same pattern the original three comps use.

## Rough edges

- The two added fictional ships push the source save's tile row to 8 columns instead of 6, so
  long names (`Ninth Lantern`, `Ashwake Herald`) truncate with an ellipsis a little more eagerly
  than in v1. Doesn't overflow or wrap at either 1440 or 1280 — just tighter.
- Only Starships actually render the new ship art; Multitools/Companions still use the category
  glyph for every item (same as v1 — those tabs were never wired to per-item art).
- Grain/star field is intentionally very faint (3.5% blend, opacity .22–.45 on the stars) — reads
  as "there's a real surface here" up close, invisible from a normal viewing distance. Turn it up
  if it should read more.
