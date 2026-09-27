# Reddit post draft — r/NoMansSkyTheGame (or similar)

**Suggested title:**
NMS Save Studio — a native save merger/editor for Mac (merge ships/currencies between two saves, edit any field)

**Suggested flair:** Fan Content / Tools (check the sub's rules for what's allowed)

---

**Body:**

I built a save editor because I had two saves I loved for different reasons and didn't want to
replay a story I'd already finished on another platform just to get a specific ship into my main
save. Existing tools are Windows-only, need Java, and can't combine saves at all — so I made
something that does, natively, on Mac (Windows build coming).

**What it does:**
- **Merge Studio** — drag ships, multi-tools, companions, currencies, and known
  tech/blueprints/words from one save into a copy of another. Undo anything before you write.
- **Raw Explorer** — search and edit any field in the save, not just the stuff above.
- **Survival check** — after you load the merged save in-game, confirms what actually stuck (the
  game silently drops data it doesn't like).
- Never touches your original save unless you tell it to — writes go to a new save slot by
  default, and every write snapshots your whole save folder first.
- Three switchable themes, because why not.

Download + source: https://github.com/tekavra-creative/nms-save-studio

macOS (Apple Silicon) only right now. It's ad-hoc signed, not notarized yet, so macOS will warn on
first launch — right-click → Open → Open gets past that once.

Not affiliated with Hello Games. Happy to answer questions or take feature requests.

---

## Notes for posting

- Post the actual screenshots from `docs/media/` (screenshot-home.png, screenshot-merge.png)
  inline in the Reddit post — image posts do much better than link posts on this sub.
- Check each sub's self-promo rules before posting (some cap it at 1-in-10 posts, some ban it
  outright, some want a "Fan Content" flair). r/NoMansSkyTheGame and r/NMS_Federation are the two
  obvious ones; NMS Discord servers usually have a #fan-content or #tools channel too.
- Once notarized (needs a Developer ID cert — see the release notes), update this post/comment to
  say Gatekeeper no longer warns.
