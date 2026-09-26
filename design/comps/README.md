# Merge Studio — three directions

Three working mock-ups ("hero comps") of the same screen: two saves side by side, you drag
things from the other save into yours, every change is listed, and nothing touches the disk
until you press **Write**. Pick one look and one name; the behaviour is the same in all three
(they share one engine, `_tools/core.js`), so you are choosing feel, not features.

**Open one:** double-click `<folder>/index.html`, or from the repo root run
`python3 -m http.server 8000` and visit `http://localhost:8000/design/comps/<folder>/`.
**Try:** drag a starship from the other save into yours · ⌘Z to undo it · ⌘K for commands ·
keys 1–5 switch tabs · focus a card and press ↵ to copy without dragging · ⌘S to write.

| | **Drydock** | **Portolan** | **Parhelion** |
|---|---|---|---|
| Folder | `instrument-panel/` | `cartographers-atlas/` | `quiet-cosmos/` |
| Mood | A night cockpit: calm, dense, every mark is a reading. | An open atlas on a desk: warm paper, ink, a navigator's ledger. | Glass floating in a soft nebula: quiet, spacious, one warm light. |
| Paradigm lens | Instrument, pure — you operate a console. | Instrument read as a logbook — you correct a chart in red pencil. | Instrument inside an Environment — you work in a calm space. |
| Layout | Three columns, left → right: other save · your save · changes log. | Book spread: left page · spine · right page · ledger in the margin. | Vertical: your save is the big pane, the other save orbits below; you lift things **up**. |
| Type | B612 + B612 Mono (the family Airbus designed for cockpit screens) | IM Fell English + EB Garamond (17th-century book types) | Unbounded, light (big quiet numbers) + Albert Sans |
| Palette (OKLCH) | graphite `14.5% .008 250` · cyan `82% .115 210` = can copy · magenta `72% .19 340` = lands here · amber `83% .15 78` = staged · green `80% .16 152` = written | paper `95.2% .021 84` · ink `23% .035 265` · verdigris `47% .08 188` = can take · vermilion `54% .19 33` = staged · gold `72% .13 82` = sealed | deep sea `17% .035 235` · smoky glass `27% .035 232 / .56` · sky `87% .075 205` = can lift · sun `87% .105 62` = staged · mint `88% .1 165` = written |
| Peak moment | A magenta route line is plotted from the row to the bay; the ship springs into bay 04; its gauge light flicks magenta → amber; a scan line sweeps the bay; line 03 slides into the log. | The plate lifts like paper and a dotted course line runs from a compass rose; the berth "breathes"; on landing a red ink frame draws itself round the berth, the star dot inks in, and the ledger line writes itself left to right. | The tile rises on a thread of light (cool → warm); the free berth glows; the ship settles with a soft halo; the ring gauge segment flares; the change drifts up into the list. |
| Why it feels good | Colour carries meaning, so you read the state at a glance — only one thing on screen is amber-filled: Write. | Familiar ritual: pencil in, strike out, then seal. The seal is a satisfying ending. | Restraint: lots of empty space, so the one warm light (staged work → Write) is impossible to miss. |
| Playbook principle that drove it | Colour as information architecture (Part 2 §2.5, Tufte) + Von Restorff | Law of familiarity / past experience (Part 2 §2.4) + Peak-End (the seal) | Ma — negative space (Part 1) + Von Restorff through light; dark-mode colour science (Part 3b) |
| Undo | ⌘Z / Undo button; the ship flies back to where it came from | ⌘Z / "strike" on any ledger line (hover previews the strike-through) | ⌘Z / × on any change |
| End state (Write) | Amber bar fills → green "Written" card with backup name | Wax seal presses → gold "Sealed at <time>" stamp | Light sweeps the pill → mint "Written" orb |

**Shared by all three (Instrument paradigm: "lag = broken"):** the dragged card tracks your
pointer 1:1 from where you grabbed it, carries your throw speed into a spring when you let go,
and can be dropped back at any time (it springs home along the path it left). Everything also
works without a mouse — Tab to a card, ↵ to copy — and with Reduce Motion on, flights become
simple fades. Zero pop-up dialogs; ⌘K is a small command menu, Esc closes it.

**Art:** every glyph, ship silhouette and background was generated through imagen.tekavra.com
(free Workers AI provider, 65 calls, $0 billed) and vectorised locally so each set shares one
stroke/fill style. Prompts, ids and processing: `<folder>/assets/PROMPTS.md`.

**Not real yet:** the data is invented (no real saves, people or IDs); "Write" is simulated;
only Starships, Multitools, Companions, Currencies and Knowledge tabs are wired.
