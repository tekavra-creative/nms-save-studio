/* ============================================================================
   Merge Studio comp engine — shared by all three directions (inlined by
   _tools/assemble.py between the CORE markers; edit here, not in index.html).
   Owns: fictional data, staged-change state, undo/redo, springs, drag & drop,
   keyboard, command palette, live announcements. Each comp supplies
   window.View = { render(Q,S), ghost(item,cat), onDragStart?, onDragMove?, onDragEnd? }.
   Nothing here touches a disk: "Write" is simulated.
   ========================================================================== */
(() => {
'use strict';
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => mqReduce.matches || document.documentElement.dataset.motion === 'reduce';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NF = new Intl.NumberFormat();
const fmt = n => NF.format(n);
const DT_STAMP = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const DT_TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* ---------- fictional data (invented names only) ---------- */
const SAVES = {
  A: { key: 'A', name: 'Vesper Drift', slot: 2, hours: '214 h', mode: 'Normal', saved: '2 days ago', freighter: 'Anvil of Rest', bases: 4, exocraft: 3 },
  B: { key: 'B', name: 'Hollow Meridian', slot: 4, hours: '96 h', mode: 'Normal', saved: 'Today, 09:14', freighter: 'Long Quiet', bases: 2, exocraft: 5 },
};
const NEW_SLOT = 5;
const CATS = [
  { id: 'ships', label: 'Starships', one: 'starship', glyph: 'starship', cap: 12, key: '1', place: 'bay' },
  { id: 'tools', label: 'Multitools', one: 'multitool', glyph: 'multitool', cap: 6, key: '2', place: 'rack' },
  { id: 'pets', label: 'Companions', one: 'companion', glyph: 'companion', cap: 30, key: '3', place: 'slot' },
  { id: 'currency', label: 'Currencies', glyph: 'currency', key: '4' },
  { id: 'knowledge', label: 'Knowledge', glyph: 'blueprint', key: '5' },
];
const petA = ['Juniper','Fennick','Sorrel','Pip','Marlo','Ottoline','Biscuit','Quill','Tansy','Rook','Nettle','Wick','Hazel','Clove','Ember','Moth','Sprocket','Dune'];
const species = ['Glimmerback','Mossjaw','Skitterfin','Dunestrider','Tallowcat','Hornet Hound'];
const ITEMS = {
  ships: {
    A: [
      { id: 's-a1', name: 'Vesper’s Needle', cls: 'Fighter', sil: 'fighter', rank: 'A', slots: 38 },
      { id: 's-a2', name: 'Quiet Anvil', cls: 'Hauler', sil: 'hauler', rank: 'B', slots: 48 },
      { id: 's-a3', name: 'Pale Courier', cls: 'Shuttle', sil: 'explorer', rank: 'C', slots: 22 },
    ],
    B: [
      { id: 's-b1', name: 'Glasswing', cls: 'Explorer', sil: 'explorer', rank: 'S', slots: 44 },
      { id: 's-b2', name: 'Halcyon Ferry', cls: 'Hauler', sil: 'hauler', rank: 'A', slots: 56 },
      { id: 's-b3', name: 'Tallow Moth', cls: 'Living Ship', sil: 'living', rank: 'S', slots: 32 },
      { id: 's-b4', name: 'Brass Heron', cls: 'Fighter', sil: 'fighter', rank: 'B', slots: 34 },
      { id: 's-b5', name: 'Saltmarsh Kite', cls: 'Solar', sil: 'explorer', rank: 'A', slots: 40 },
      { id: 's-b6', name: 'Ninth Lantern', cls: 'Sentinel Interceptor', sil: 'fighter', rank: 'S', slots: 36 },
    ],
  },
  tools: {
    A: [{ id: 't-a1', name: 'Copperline', cls: 'Pistol', rank: 'B', slots: 18 }],
    B: [
      { id: 't-b1', name: 'Wren’s Lantern', cls: 'Experimental', rank: 'S', slots: 24 },
      { id: 't-b2', name: 'Grey Tithe', cls: 'Rifle', rank: 'A', slots: 22 },
      { id: 't-b3', name: 'Undersong', cls: 'Staff', rank: 'S', slots: 20 },
    ],
  },
  pets: {
    A: petA.map((n, i) => ({ id: 'p-a' + i, name: n, cls: species[i % species.length] })),
    B: [
      { id: 'p-b1', name: 'Pim', cls: 'Glimmerback' },
      { id: 'p-b2', name: 'Oriel', cls: 'Mossjaw' },
      { id: 'p-b3', name: 'Tamsin', cls: 'Skitterfin' },
      { id: 'p-b4', name: 'Bramble', cls: 'Hornet Hound' },
    ],
  },
};
const CURRENCY = [
  { id: 'units', label: 'Units', a: 14208550, b: 3902114 },
  { id: 'nanites', label: 'Nanites', a: 48210, b: 12905 },
  { id: 'quicksilver', label: 'Quicksilver', a: 2450, b: 1200 },
];
const KNOW = [
  { id: 'blueprints', label: 'Blueprints', glyph: 'blueprint', a: 412, b: 437, union: 451 },
  { id: 'gek', label: 'Gek words', glyph: 'words', a: 312, b: 340, union: 351 },
  { id: 'korvax', label: 'Korvax words', glyph: 'words', a: 188, b: 241, union: 252 },
  { id: 'vykeen', label: 'Vy’keen words', glyph: 'words', a: 240, b: 198, union: 240 },
];
const CHOICES = [
  { id: 'sum', label: 'Sum' },
  { id: 'keep', label: 'Keep' },
  { id: 'take', label: 'Replace' },
];

/* ---------- state ---------- */
const S = { cat: 'ships', target: 'A', changes: [], phase: 'edit', lastWrite: null, fx: {} };
const PRESENT = new Set(); // items already written into A (a copy is never offered twice)
const H = { past: [], future: [] };
let seq = 0;
const nid = () => 'c' + (++seq);

/* ---------- queries (what views read) ---------- */
const catOf = id => CATS.find(c => c.id === id);
const allItems = cat => [...(ITEMS[cat]?.A || []), ...(ITEMS[cat]?.B || [])];
const findItem = (cat, id) => allItems(cat).find(i => i.id === id);
const stagedCopy = (cat, id) => S.changes.find(c => c.kind === 'copy' && c.cat === cat && c.itemId === id);
const Q = {
  saves: SAVES, cats: CATS, cat: catOf, newSlot: NEW_SLOT, choices: CHOICES, fmt, isMac,
  mod: isMac ? '⌘' : 'Ctrl+', shift: isMac ? '⇧' : 'Shift+',
  targetName: () => (S.target === 'A' ? SAVES.A.name : `New save · slot ${NEW_SLOT}`),
  targetShort: () => (S.target === 'A' ? SAVES.A.name : `slot ${NEW_SLOT}`),
  srcItems: cat => (ITEMS[cat]?.B || []).map(i => {
    const ch = stagedCopy(cat, i.id);
    return { ...i, staged: !!ch, present: PRESENT.has(i.id), changeId: ch?.id || null };
  }),
  destItems: cat => {
    const own = (ITEMS[cat]?.A || []).map(i => ({ ...i, staged: false }));
    const cps = S.changes.filter(c => c.kind === 'copy' && c.cat === cat)
      .map(c => ({ ...findItem(cat, c.itemId), staged: true, changeId: c.id }));
    return [...own, ...cps];
  },
  cap: cat => {
    const c = catOf(cat); if (!c?.cap) return null;
    const own = (ITEMS[cat]?.A || []).length;
    const staged = S.changes.filter(x => x.kind === 'copy' && x.cat === cat).length;
    return { own, staged, used: own + staged, cap: c.cap, free: c.cap - own - staged };
  },
  currency: () => CURRENCY.map(c => {
    const ch = S.changes.find(x => x.kind === 'currency' && x.cid === c.id);
    return { ...c, staged: ch || null, result: ch ? currencyResult(c, ch.choice) : c.a };
  }),
  knowledge: () => KNOW.map(k => {
    const ch = S.changes.find(x => x.kind === 'learn' && x.kid === k.id);
    return { ...k, gain: k.union - k.a, staged: ch || null, result: ch ? k.union : k.a };
  }),
  changes: () => S.changes.map(describe),
  count: () => S.changes.length,
  canUndo: () => H.past.length > 0,
  canRedo: () => H.future.length > 0,
};
function currencyResult(c, choice) { return choice === 'sum' ? c.a + c.b : choice === 'take' ? c.b : c.a; }
function describe(ch) {
  if (ch.kind === 'copy') {
    const it = findItem(ch.cat, ch.itemId); const cat = catOf(ch.cat);
    const pos = Q.destItems(ch.cat).findIndex(d => d.id === ch.itemId) + 1;
    return { id: ch.id, kind: ch.kind, cat: ch.cat, glyph: cat.glyph, verb: 'Copy', subject: it.name,
      note: it.rank ? `${it.cls} · ${it.rank}-class` : it.cls,
      detail: `into ${cat.place} ${String(pos).padStart(2, '0')}`, pos, item: it };
  }
  if (ch.kind === 'currency') {
    const c = CURRENCY.find(x => x.id === ch.cid); const r = currencyResult(c, ch.choice);
    const detail = ch.choice === 'sum' ? `${fmt(c.a)} + ${fmt(c.b)} = ${fmt(r)}`
      : ch.choice === 'take' ? `${fmt(c.a)} → ${fmt(r)}` : `stays ${fmt(c.a)}`;
    return { id: ch.id, kind: ch.kind, glyph: 'currency', verb: ch.choice === 'sum' ? 'Add' : ch.choice === 'take' ? 'Replace' : 'Keep',
      subject: c.label, detail, choice: ch.choice, conflict: true, from: c.a, to: r, noop: ch.choice === 'keep' };
  }
  const k = KNOW.find(x => x.id === ch.kid);
  return { id: ch.id, kind: ch.kind, glyph: k.glyph, verb: 'Learn', subject: `${k.union - k.a} ${k.label.toLowerCase()}`,
    detail: `${fmt(k.a)} → ${fmt(k.union)}`, from: k.a, to: k.union };
}

/* ---------- history ---------- */
function apply(e, inverse) {
  const t = inverse ? { add: 'remove', remove: 'add', choice: 'choice' }[e.type] : e.type;
  if (t === 'add') e.changes.forEach((c, i) => S.changes.splice(Math.min(e.index + i, S.changes.length), 0, c));
  else if (t === 'remove') e.changes.forEach(c => { const i = S.changes.indexOf(c); if (i > -1) S.changes.splice(i, 1); });
  else { const c = S.changes.find(x => x.id === e.id); if (c) c.choice = inverse ? e.from : e.to; }
}
function act(e) { apply(e); H.past.push(e); H.future.length = 0; }

/* ---------- live region ---------- */
let liveEl;
function say(msg) { if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { liveEl.textContent = msg; }, 30); }
const tally = () => `${S.changes.length} change${S.changes.length === 1 ? '' : 's'} staged, nothing written yet.`;

/* ---------- render + focus preservation + number ticks ---------- */
const prevNums = new Map();
function render() {
  const a = document.activeElement;
  const fk = a && a.dataset ? a.dataset.focusKey : null;
  window.View.render(Q, S);
  $$('[data-num]').forEach(el => {
    const k = el.dataset.num, v = parseFloat(String(el.textContent).replace(/[^\d.-]/g, ''));
    const p = prevNums.get(k);
    if (p !== undefined && p !== v && !reduced()) {
      el.classList.remove('num-up', 'num-down'); void el.offsetWidth;
      el.classList.add(v > p ? 'num-up' : 'num-down');
    }
    prevNums.set(k, v);
  });
  if (S.fx.arrive) $$(`[data-dest-item="${S.fx.arrive}"]`).forEach(el => {
    el.classList.add(S.fx.landing ? 'is-landing' : 'is-arriving');
    if (!S.fx.landing) setTimeout(() => el.classList.remove('is-arriving'), 1400);
  });
  if (S.fx.newChange) $$(`[data-change="${S.fx.newChange}"]`).forEach(el => {
    el.classList.add('is-new'); setTimeout(() => el.classList.remove('is-new'), 1600);
  });
  if (fk) {
    const t = $(`[data-focus-key="${CSS.escape(fk)}"]`) || (fk.startsWith('revert:') && ($('[data-focus-key^="revert:"]') || $('[data-focus-key="changes"]')));
    if (t && t !== document.activeElement) t.focus({ preventScroll: true });
  }
  S.fx = {};
}

/* ---------- actions ---------- */
function copy(cat, itemId, fx = {}) {
  const cap = Q.cap(cat); if (!cap || cap.free <= 0 || stagedCopy(cat, itemId) || PRESENT.has(itemId)) return null;
  const ch = { id: nid(), kind: 'copy', cat, itemId };
  act({ type: 'add', changes: [ch], index: S.changes.length });
  S.fx = { arrive: itemId, newChange: ch.id, ...fx };
  if (S.phase === 'written') S.phase = 'edit';
  render();
  const it = findItem(cat, itemId); const c = Q.cap(cat);
  say(`${it.name} staged into ${Q.targetName()}, ${catOf(cat).place} ${c.used} of ${c.cap}. ${tally()}`);
  return ch;
}
function stageCurrency(cid) {
  if (S.changes.find(x => x.kind === 'currency' && x.cid === cid)) return;
  const ch = { id: nid(), kind: 'currency', cid, choice: 'sum' };
  act({ type: 'add', changes: [ch], index: S.changes.length });
  S.fx = { newChange: ch.id }; S.phase = 'edit'; render();
  say(`${CURRENCY.find(c => c.id === cid).label} staged as a sum. ${tally()}`);
}
function learn(kid) {
  const k = KNOW.find(x => x.id === kid);
  if (!k || k.union === k.a || S.changes.find(x => x.kind === 'learn' && x.kid === kid)) return;
  const ch = { id: nid(), kind: 'learn', kid };
  act({ type: 'add', changes: [ch], index: S.changes.length });
  S.fx = { newChange: ch.id }; S.phase = 'edit'; render();
  say(`Learn ${k.union - k.a} ${k.label.toLowerCase()} staged. ${tally()}`);
}
function setChoice(id, to) {
  const c = S.changes.find(x => x.id === id); if (!c || c.choice === to) return;
  act({ type: 'choice', id, from: c.choice, to }); render();
  const d = describe(c); say(`${d.subject}: ${d.verb.toLowerCase()}, ${d.detail}.`);
}
function revert(id) {
  const c = S.changes.find(x => x.id === id); if (!c) return;
  const back = c.kind === 'copy' ? flyBackPrep(c) : null;
  act({ type: 'remove', changes: [c], index: S.changes.indexOf(c) });
  render(); back && back();
  say(`Reverted: ${describe(c).verb.toLowerCase()} ${describe(c).subject}. ${tally()}`);
}
function undo() {
  const e = H.past.pop(); if (!e) return say('Nothing to undo.');
  const backs = e.type === 'add' ? e.changes.filter(c => c.kind === 'copy').map(flyBackPrep).filter(Boolean) : [];
  apply(e, true); H.future.push(e);
  if (e.type === 'remove') { S.fx = { newChange: e.changes[0].id, arrive: e.changes[0].itemId }; }
  render(); backs.forEach(f => f());
  say(`Undone. ${tally()}`);
}
function redo() {
  const e = H.future.pop(); if (!e) return say('Nothing to redo.');
  const backs = e.type === 'remove' ? e.changes.filter(c => c.kind === 'copy').map(flyBackPrep).filter(Boolean) : [];
  apply(e); H.past.push(e);
  if (e.type === 'add') S.fx = { newChange: e.changes[0].id, arrive: e.changes[0].itemId };
  render(); backs.forEach(f => f());
  say(`Redone. ${tally()}`);
}
function setCat(id) {
  if (!catOf(id) || S.cat === id) return; S.cat = id; render(); say(`Showing ${catOf(id).label}.`);
  try { history.replaceState(null, '', '#' + id); } catch (_) {} // the open tab is part of the URL
}
function setTarget(t) { if (S.target === t) return; S.target = t; render(); say(t === 'A' ? `Changes will be written into ${SAVES.A.name}.` : `Changes will be written to a new save in slot ${NEW_SLOT}; ${SAVES.A.name} stays untouched.`); }
function write() {
  if (!S.changes.length || S.phase === 'writing') return;
  const n = S.changes.length, target = Q.targetName();
  S.phase = 'writing'; render(); say(`Writing ${n} changes to ${target}…`);
  setTimeout(() => {
    // bake staged changes into save A (comp only — simulated write)
    S.changes.forEach(c => {
      if (c.kind === 'copy') { ITEMS[c.cat].A.push({ ...findItem(c.cat, c.itemId) }); PRESENT.add(c.itemId); }
      if (c.kind === 'currency') { const k = CURRENCY.find(x => x.id === c.cid); k.a = currencyResult(k, c.choice); }
      if (c.kind === 'learn') { const k = KNOW.find(x => x.id === c.kid); k.a = k.union; }
    });
    const d = new Date();
    S.lastWrite = { count: n, target, backup: `${SAVES.A.name} — backup ${DT_STAMP.format(d)}`, at: DT_TIME.format(d) };
    S.changes = []; H.past = []; H.future = [];
    S.phase = 'written'; render();
    say(`Written. ${n} changes saved to ${target}. A backup was kept first.`);
  }, reduced() ? 300 : 1150);
}
function resume() { S.phase = 'edit'; S.lastWrite = null; render(); }
function copyAll() {
  const cat = S.cat; if (!catOf(cat).cap) return;
  const todo = Q.srcItems(cat).filter(i => !i.staged).slice(0, Q.cap(cat).free);
  if (!todo.length) return say('Nothing left to copy.');
  const chs = todo.map(i => ({ id: nid(), kind: 'copy', cat, itemId: i.id }));
  act({ type: 'add', changes: chs, index: S.changes.length });
  S.phase = 'edit'; S.fx = { newChange: chs[0].id }; render();
  chs.forEach((c, i) => setTimeout(() => { $$(`[data-dest-item="${c.itemId}"]`).forEach(el => { el.classList.add('is-arriving'); setTimeout(() => el.classList.remove('is-arriving'), 1400); }); }, reduced() ? 0 : i * 70));
  say(`${chs.length} ${catOf(cat).label.toLowerCase()} staged. ${tally()}`);
}

/* ---------- springs (damping ratio + response, Apple-style) ---------- */
class Spring {
  constructor(v, eps = 0.25) { this.v = v; this.vel = 0; this.t = v; this.k = 0; this.c = 0; this.on = false; this.eps = eps; }
  to(t, { damping = 1, response = 0.35, velocity } = {}) {
    const w = (2 * Math.PI) / response; this.k = w * w; this.c = 2 * damping * w; this.t = t;
    if (velocity !== undefined) this.vel = velocity; this.on = true;
  }
  set(v) { this.v = this.t = v; this.vel = 0; this.on = false; }
  step(h) {
    if (!this.on) return false;
    this.vel += (-this.k * (this.v - this.t) - this.c * this.vel) * h; this.v += this.vel * h;
    if (Math.abs(this.v - this.t) < this.eps && Math.abs(this.vel) < this.eps * 20) { this.v = this.t; this.vel = 0; this.on = false; }
    return this.on;
  }
}

/* ---------- ghost flight engine ---------- */
const G = { el: null, x: new Spring(0), y: new Spring(0), s: new Spring(1, 0.002), r: new Spring(0, 0.05), o: new Spring(1, 0.01), raf: 0, last: 0, onArrive: null, onRest: null, arrived: false, tracking: false };
function ghostApply() {
  if (!G.el) return;
  G.el.style.transform = `translate3d(${G.x.v}px,${G.y.v}px,0) rotate(${G.r.v}deg) scale(${G.s.v})`;
  G.el.style.opacity = G.o.v;
}
function ghostLoop(t) {
  const dt = Math.min(0.05, (t - (G.last || t)) / 1000 || 0.016); G.last = t;
  let on = false; const n = Math.max(1, Math.round(dt / (1 / 240))); const h = dt / n;
  for (let i = 0; i < n; i++) for (const k of ['x', 'y', 's', 'r', 'o']) on = G[k].step(h) || on;
  ghostApply();
  if (G.onArrive && !G.arrived && Math.hypot(G.x.v - G.x.t, G.y.v - G.y.t) < 3) { G.arrived = true; const f = G.onArrive; G.onArrive = null; f(); }
  if (on || G.tracking) G.raf = requestAnimationFrame(ghostLoop);
  else { G.raf = 0; G.last = 0; const f = G.onRest; G.onRest = null; f && f(); }
}
function kick() { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(ghostLoop); } }
function makeGhost(node, w, h, origin) {
  if (G.el) G.el.remove();
  node.classList.add('ms-ghost'); node.setAttribute('aria-hidden', 'true'); node.inert = true;
  node.style.width = w + 'px'; node.style.height = h + 'px';
  node.style.transformOrigin = origin || '50% 50%';
  document.body.appendChild(node); G.el = node; G.arrived = false; G.onArrive = null; G.onRest = null;
  ['x', 'y', 's', 'r', 'o'].forEach(k => G[k].on = false);
  return node;
}
function dropGhost() { if (G.el) G.el.remove(); G.el = null; G.tracking = false; }

/* fly an element-shaped ghost from rect A into the next free slot, then commit */
function flyCopy(srcEl) {
  const cat = srcEl.dataset.cat, id = srcEl.dataset.srcItem;
  if (srcEl.getAttribute('aria-disabled') === 'true') return refuse(srcEl);
  const slot = $('[data-next-slot]');
  if (!slot) return refuse(srcEl);
  if (reduced()) return copy(cat, id);
  slot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const sr = slot.getBoundingClientRect(), er = srcEl.getBoundingClientRect();
  const g = makeGhost(window.View.ghost(findItem(cat, id), cat), sr.width, sr.height, '0 0');
  const s0 = clamp(Math.min(er.width / sr.width, er.height / sr.height), 0.3, 1);
  G.x.set(er.left + (er.width - sr.width * s0) / 2); G.y.set(er.top + (er.height - sr.height * s0) / 2);
  G.s.set(s0); G.r.set(0); G.o.set(1); ghostApply();
  window.View.onDragStart?.({ el: srcEl, ghost: g, origin: er, keyboard: true });
  G.x.to(sr.left, { damping: 0.82, response: 0.46 }); G.y.to(sr.top, { damping: 0.82, response: 0.46 });
  G.s.to(1, { damping: 0.9, response: 0.4 });
  land(cat, id, srcEl); kick();
}
function land(cat, id, srcEl) {
  G.onArrive = () => { copy(cat, id, { landing: true }); window.View.onDragEnd?.({ el: srcEl, dropped: true }); };
  G.onRest = () => {
    $$(`[data-dest-item="${id}"]`).forEach(el => { el.classList.remove('is-landing'); el.classList.add('is-arriving'); setTimeout(() => el.classList.remove('is-arriving'), 1400); });
    dropGhost(); srcEl.classList?.remove('is-drag-source', 'is-pressed');
  };
}
function refuse(el) {
  el.classList.remove('is-refused'); void el.offsetWidth; el.classList.add('is-refused');
  setTimeout(() => el.classList.remove('is-refused'), 500);
  const cat = catOf(el.dataset.cat); const it = findItem(el.dataset.cat, el.dataset.srcItem);
  say(stagedCopy(el.dataset.cat, el.dataset.srcItem) ? `${it.name} is already staged.` : `${Q.targetName()} has no free ${cat.place}s.`);
}
/* undo/revert: fly the destination card back to where it came from (spatial consistency) */
function flyBackPrep(ch) {
  if (reduced()) return null;
  const d = $(`[data-dest-item="${ch.itemId}"]`); if (!d) return null;
  const dr = d.getBoundingClientRect();
  const node = d.cloneNode(true); node.removeAttribute('data-dest-item'); node.removeAttribute('id');
  $$('[id],[data-focus-key],[data-dest-item]', node).forEach(n => { n.removeAttribute('id'); n.removeAttribute('data-focus-key'); n.removeAttribute('data-dest-item'); });
  return () => {
    const s = $(`[data-src-item="${ch.itemId}"]`);
    const g = makeGhost(node, dr.width, dr.height, '0 0');
    G.x.set(dr.left); G.y.set(dr.top); G.s.set(1); G.r.set(0); G.o.set(1); ghostApply();
    if (s) {
      const sr = s.getBoundingClientRect(); const sc = clamp(Math.min(sr.width / dr.width, sr.height / dr.height), 0.3, 1);
      G.x.to(sr.left + (sr.width - dr.width * sc) / 2, { damping: 1, response: 0.34 }); G.y.to(sr.top + (sr.height - dr.height * sc) / 2, { damping: 1, response: 0.34 });
      G.s.to(sc, { damping: 1, response: 0.34 }); G.o.to(0, { damping: 1, response: 0.5 });
      s.classList.add('is-returning'); setTimeout(() => s.classList.remove('is-returning'), 700);
    } else { G.s.to(0.9, { damping: 1, response: 0.25 }); G.o.to(0, { damping: 1, response: 0.25 }); }
    G.onRest = dropGhost; kick();
  };
}

/* ---------- pointer drag ---------- */
let D = null, suppressClick = false;
function velocity(h = D.hist) {
  const now = h[h.length - 1];
  let i = h.length - 1; while (i > 0 && now.t - h[i - 1].t < 90) i--;
  const p = h[Math.max(0, i - 1)]; const dt = (now.t - p.t) / 1000;
  return dt > 0.001 ? { x: (now.x - p.x) / dt, y: (now.y - p.y) / dt } : { x: 0, y: 0 };
}
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-src-item]');
  if (!el || e.button !== 0 || G.el) return;
  D = { el, id: el.dataset.srcItem, cat: el.dataset.cat, sx: e.clientX, sy: e.clientY, started: false, hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  el.classList.add('is-pressed');
  try { el.setPointerCapture(e.pointerId); } catch (_) {}
});
document.addEventListener('pointermove', e => {
  if (!D) return;
  D.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp }); if (D.hist.length > 12) D.hist.shift();
  if (!D.started) {
    if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 5) return;
    if (!startDrag()) return;
  }
  moveDrag(e.clientX, e.clientY);
});
function startDrag() {
  const el = D.el;
  if (el.getAttribute('aria-disabled') === 'true') { refuse(el); el.classList.remove('is-pressed'); D = null; suppressClick = true; return false; }
  const slot = $('[data-next-slot]');
  if (!slot) { refuse(el); el.classList.remove('is-pressed'); D = null; suppressClick = true; return false; }
  slot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const sr = slot.getBoundingClientRect(), er = el.getBoundingClientRect();
  D.started = true; suppressClick = true;
  D.w = sr.width; D.h = sr.height;
  D.ax = clamp((D.sx - er.left) / er.width, 0, 1); D.ay = clamp((D.sy - er.top) / er.height, 0, 1);
  D.s0 = clamp(Math.min(er.width / sr.width, er.height / sr.height), 0.3, 1);
  D.origin = er; D.zone = $('[data-dropzone]');
  const g = makeGhost(window.View.ghost(findItem(D.cat, D.id), D.cat), D.w, D.h, `${D.ax * 100}% ${D.ay * 100}%`);
  G.tracking = true;
  G.x.set(D.sx - D.ax * D.w); G.y.set(D.sy - D.ay * D.h);
  if (reduced()) { G.s.set(1); } else { G.s.set(D.s0); G.s.to(1.03, { damping: 0.86, response: 0.28 }); }
  G.r.set(0); G.o.set(1); ghostApply();
  el.classList.add('is-drag-source'); document.body.classList.add('ms-dragging');
  window.View.onDragStart?.({ el, ghost: g, origin: er });
  kick();
  return true;
}
function moveDrag(px, py) {
  G.x.set(px - D.ax * D.w); G.y.set(py - D.ay * D.h);
  const v = velocity();
  if (!reduced()) G.r.to(clamp(v.x / 90, -6, 6), { damping: 1, response: 0.22 });
  const zr = D.zone?.getBoundingClientRect();
  const over = !!zr && px >= zr.left && px <= zr.right && py >= zr.top && py <= zr.bottom;
  if (over !== D.over) {
    D.over = over; D.zone?.classList.toggle('is-drop-ready', over);
    $('[data-next-slot]')?.classList.toggle('is-targeted', over);
    if (!reduced()) G.s.to(over ? 1 : 1.03, { damping: 0.8, response: 0.25 });
  }
  window.View.onDragMove?.({ x: px, y: py, over, origin: D.origin, ghost: G.el });
}
function endDrag(e, cancelled) {
  if (!D) return;
  const d = D; D = null;
  d.el.classList.remove('is-pressed');
  if (!d.started) return;
  document.body.classList.remove('ms-dragging');
  d.zone?.classList.remove('is-drop-ready');
  const slot = $('[data-next-slot]'); slot?.classList.remove('is-targeted');
  G.tracking = false;
  setTimeout(() => { suppressClick = false; }, 0);
  const v = velocity(d.hist);
  if (!cancelled && d.over && slot) {
    const sr = slot.getBoundingClientRect();
    if (reduced()) { dropGhost(); d.el.classList.remove('is-drag-source'); copy(d.cat, d.id); window.View.onDragEnd?.({ el: d.el, dropped: true }); return; }
    G.el.style.transformOrigin = '0 0';
    // re-base position for origin 0 0 so the handoff has no jump
    const bx = G.x.v + d.ax * d.w * (1 - G.s.v), by = G.y.v + d.ay * d.h * (1 - G.s.v);
    G.x.set(bx); G.y.set(by);
    G.x.to(sr.left, { damping: 0.72, response: 0.42, velocity: v.x });
    G.y.to(sr.top, { damping: 0.72, response: 0.42, velocity: v.y });
    G.s.to(1, { damping: 0.8, response: 0.3 }); G.r.to(0, { damping: 0.62, response: 0.38 });
    land(d.cat, d.id, d.el); kick();
  } else {
    // spring home along the same path it left by
    const er = d.el.getBoundingClientRect();
    G.el.style.transformOrigin = '0 0';
    const bx = G.x.v + d.ax * d.w * (1 - G.s.v), by = G.y.v + d.ay * d.h * (1 - G.s.v);
    G.x.set(bx); G.y.set(by);
    const tx = er.left + (er.width - d.w * d.s0) / 2, ty = er.top + (er.height - d.h * d.s0) / 2;
    if (reduced()) { dropGhost(); d.el.classList.remove('is-drag-source'); window.View.onDragEnd?.({ el: d.el, dropped: false }); return; }
    G.x.to(tx, { damping: 1, response: 0.32, velocity: v.x }); G.y.to(ty, { damping: 1, response: 0.32, velocity: v.y });
    G.s.to(d.s0, { damping: 1, response: 0.3 }); G.r.to(0, { damping: 1, response: 0.3 });
    G.onRest = () => { dropGhost(); d.el.classList.remove('is-drag-source'); };
    window.View.onDragEnd?.({ el: d.el, dropped: false });
    kick();
    say('Drag cancelled. Nothing changed.');
  }
}
document.addEventListener('pointerup', e => endDrag(e, false));
document.addEventListener('pointercancel', e => endDrag(e, true));

/* ---------- clicks, choices, keyboard ---------- */
document.addEventListener('click', e => {
  const src = e.target.closest('[data-src-item]');
  if (src) { if (suppressClick) { suppressClick = false; return; } return flyCopy(src); }
  const a = e.target.closest('[data-action]'); if (!a) return;
  const k = a.dataset.action;
  if (k === 'revert') revert(a.dataset.id);
  else if (k === 'undo') undo();
  else if (k === 'redo') redo();
  else if (k === 'write') write();
  else if (k === 'resume') resume();
  else if (k === 'cat') setCat(a.dataset.cat);
  else if (k === 'target') setTarget(a.dataset.target);
  else if (k === 'stage-currency') stageCurrency(a.dataset.cid);
  else if (k === 'learn') learn(a.dataset.kid);
  else if (k === 'palette') openPalette();
  else if (k === 'copy-all') copyAll();
});
document.addEventListener('change', e => {
  const r = e.target.closest('input[data-choice]'); if (r && r.checked) setChoice(r.dataset.choice, r.value);
});
const typing = t => t && (t.tagName === 'INPUT' && !['radio', 'checkbox', 'button'].includes(t.type) || t.tagName === 'TEXTAREA' || t.isContentEditable);
document.addEventListener('keydown', e => {
  const mod = isMac ? e.metaKey : e.ctrlKey; const key = e.key.toLowerCase();
  if (mod && key === 'k') { e.preventDefault(); return PAL.open ? closePalette() : openPalette(); }
  if (e.key === 'Escape') { if (PAL.open) return closePalette(); if (D && D.started) return endDrag(e, true); }
  if (PAL.open) return;
  if (mod && key === 'z' && !typing(e.target)) { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (!isMac && e.ctrlKey && key === 'y') { e.preventDefault(); return redo(); }
  if (mod && key === 's') { e.preventDefault(); return write(); }
  if (!mod && !e.altKey && !typing(e.target) && /^[1-5]$/.test(e.key)) { const c = CATS.find(x => x.key === e.key); c && setCat(c.id); }
});

/* ---------- command palette (non-modal popover; Esc closes) ---------- */
const PAL = { open: false, el: null, input: null, list: null, items: [], sel: 0, ret: null };
function commands() {
  const n = S.changes.length, c = catOf(S.cat);
  const cmds = [
    { id: 'write', label: n ? `Write ${n} change${n === 1 ? '' : 's'} to ${Q.targetShort()}` : 'Write changes', hint: `${Q.mod}S`, run: write, on: n > 0 },
    { id: 'undo', label: 'Undo last change', hint: `${Q.mod}Z`, run: undo, on: Q.canUndo() },
    { id: 'redo', label: 'Redo', hint: `${Q.shift}${Q.mod}Z`, run: redo, on: Q.canRedo() },
  ];
  if (c.cap) cmds.push({ id: 'all', label: `Copy every ${c.one} from ${SAVES.B.name}`, hint: '', run: copyAll, on: Q.srcItems(S.cat).some(i => !i.staged) && Q.cap(S.cat).free > 0 });
  cmds.push({ id: 'target', label: S.target === 'A' ? `Write to a new slot instead (keeps ${SAVES.A.name} as it is)` : `Write into ${SAVES.A.name} instead`, hint: '', run: () => setTarget(S.target === 'A' ? 'new' : 'A'), on: true });
  CATS.forEach(x => cmds.push({ id: 'cat-' + x.id, label: `Show ${x.label}`, hint: x.key, run: () => setCat(x.id), on: x.id !== S.cat }));
  return cmds;
}
function buildPalette() {
  const el = document.createElement('div');
  el.className = 'cmdk'; el.hidden = true;
  el.innerHTML = `<div class="cmdk-box" role="dialog" aria-label="Command palette">
    <div class="cmdk-field"><span class="cmdk-k" aria-hidden="true">${Q.mod}K</span>
    <input class="cmdk-input" type="text" name="command" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="Search commands" placeholder="Type a command…" autocomplete="off" spellcheck="false"></div>
    <ul class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Commands"></ul>
    <p class="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> run · <kbd>esc</kbd> close</p></div>`;
  document.body.appendChild(el);
  PAL.el = el; PAL.input = $('.cmdk-input', el); PAL.list = $('.cmdk-list', el);
  PAL.input.addEventListener('input', () => { PAL.sel = 0; drawPalette(); });
  PAL.input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); PAL.sel = Math.min(PAL.items.length - 1, PAL.sel + 1); drawPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.sel = Math.max(0, PAL.sel - 1); drawPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runCmd(PAL.items[PAL.sel]); }
  });
  PAL.list.addEventListener('click', e => { const li = e.target.closest('[data-cmd]'); if (li) runCmd(PAL.items.find(c => c.id === li.dataset.cmd)); });
  el.addEventListener('pointerdown', e => { if (e.target === el) closePalette(); });
}
function drawPalette() {
  const q = PAL.input.value.trim().toLowerCase();
  PAL.items = commands().filter(c => c.on && (!q || c.label.toLowerCase().includes(q)));
  PAL.list.innerHTML = PAL.items.length ? PAL.items.map((c, i) =>
    `<li id="cmd-${c.id}" role="option" data-cmd="${c.id}" aria-selected="${i === PAL.sel}" class="cmdk-item${i === PAL.sel ? ' is-sel' : ''}"><span>${c.label}</span>${c.hint ? `<kbd>${c.hint}</kbd>` : ''}</li>`).join('')
    : `<li class="cmdk-empty" role="option" aria-disabled="true">No matching command</li>`;
  PAL.input.setAttribute('aria-activedescendant', PAL.items[PAL.sel] ? 'cmd-' + PAL.items[PAL.sel].id : '');
}
function openPalette() {
  if (!PAL.el) buildPalette();
  PAL.ret = document.activeElement; PAL.open = true; PAL.el.hidden = false; PAL.input.value = ''; PAL.sel = 0; drawPalette();
  requestAnimationFrame(() => { PAL.el.classList.add('is-open'); PAL.input.focus(); });
  $$('[data-action="palette"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
}
function closePalette() {
  if (!PAL.open) return; PAL.open = false; PAL.el.classList.remove('is-open'); PAL.el.hidden = true;
  $$('[data-action="palette"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  PAL.ret?.focus?.({ preventScroll: true });
}
function runCmd(c) { if (!c) return; closePalette(); c.run(); }

/* ---------- boot ---------- */
function boot() {
  const css = document.createElement('style');
  css.textContent = `.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.ms-ghost{position:fixed!important;left:0;top:0;z-index:1000;pointer-events:none;will-change:transform,opacity;margin:0!important;box-sizing:border-box}
[data-num]{display:inline-block}
.num-up{animation:ms-num-up .38s cubic-bezier(.2,.9,.25,1)}.num-down{animation:ms-num-down .38s cubic-bezier(.2,.9,.25,1)}
@keyframes ms-num-up{from{transform:translateY(.55em);opacity:0}}@keyframes ms-num-down{from{transform:translateY(-.55em);opacity:0}}
.is-landing{visibility:hidden}
body.ms-dragging,body.ms-dragging *{cursor:grabbing!important;user-select:none;-webkit-user-select:none}
@media (prefers-reduced-motion:reduce){.num-up,.num-down{animation:none}}`;
  document.head.appendChild(css);
  liveEl = document.createElement('div'); liveEl.className = 'sr-only'; liveEl.setAttribute('aria-live', 'polite'); liveEl.setAttribute('role', 'status');
  document.body.appendChild(liveEl);
  const h = decodeURIComponent(location.hash.slice(1)); if (catOf(h)) S.cat = h;
  // the session so far: two decisions already staged (shows the Changes anatomy)
  S.changes.push({ id: nid(), kind: 'currency', cid: 'units', choice: 'sum' });
  S.changes.push({ id: nid(), kind: 'learn', kid: 'blueprints' });
  H.past.push({ type: 'add', changes: [S.changes[0]], index: 0 }, { type: 'add', changes: [S.changes[1]], index: 1 });
  render();
  document.documentElement.classList.add('is-ready');
}
window.MS = { Q, S, fmt, reduced, say, actions: { copy, revert, undo, redo, setChoice, write, resume, setCat, setTarget, stageCurrency, learn, copyAll, openPalette, closePalette, flyCopy } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
