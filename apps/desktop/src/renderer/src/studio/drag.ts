// Skin-agnostic drag engine, ported from the design comps' shared core.
// Works purely on DOM data attributes, so every skin's markup drives the same physics:
//   [data-src-item]  a source asset that can be lifted      [data-dropzone]  the target save's area
//   [data-next-slot] the empty bay the next item lands in

class Spring {
  v: number;
  vel = 0;
  t: number;
  k = 0;
  c = 0;
  on = false;
  eps: number;
  constructor(v: number, eps = 0.25) {
    this.v = v;
    this.t = v;
    this.eps = eps;
  }
  to(t: number, { damping = 1, response = 0.35, velocity }: { damping?: number; response?: number; velocity?: number } = {}): void {
    const w = (2 * Math.PI) / response;
    this.k = w * w;
    this.c = 2 * damping * w;
    this.t = t;
    if (velocity !== undefined) this.vel = velocity;
    this.on = true;
  }
  set(v: number): void {
    this.v = this.t = v;
    this.vel = 0;
    this.on = false;
  }
  step(h: number): boolean {
    if (!this.on) return false;
    this.vel += (-this.k * (this.v - this.t) - this.c * this.vel) * h;
    this.v += this.vel * h;
    if (Math.abs(this.v - this.t) < this.eps && Math.abs(this.vel) < this.eps * 20) {
      this.v = this.t;
      this.vel = 0;
      this.on = false;
    }
    return this.on;
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface DragHooks {
  /** Build the floating card for a source element (staged look). */
  ghost: (src: HTMLElement) => HTMLElement;
  /** Commit the copy (called when the ghost reaches the bay). */
  copy: (src: HTMLElement) => void;
  /** After the ghost has settled: e.g. play the arrival pulse. */
  landed?: (src: HTMLElement) => void;
  refuse: (src: HTMLElement, why: 'disabled' | 'full') => void;
  cancelled?: () => void;
  tether?: { start: (origin: DOMRect) => void; move: (x: number, y: number) => void; end: () => void };
}

type Key = 'x' | 'y' | 's' | 'r' | 'o';

export class DragEngine {
  #root: HTMLElement;
  #hooks: DragHooks;
  #g = { el: null as HTMLElement | null, x: new Spring(0), y: new Spring(0), s: new Spring(1, 0.002), r: new Spring(0, 0.05), o: new Spring(1, 0.01) };
  #raf = 0;
  #last = 0;
  #tracking = false;
  #arrived = false;
  #onArrive: (() => void) | null = null;
  #onRest: (() => void) | null = null;
  #d: null | {
    el: HTMLElement;
    sx: number;
    sy: number;
    started: boolean;
    hist: { x: number; y: number; t: number }[];
    w: number;
    h: number;
    ax: number;
    ay: number;
    s0: number;
    origin: DOMRect;
    zone: HTMLElement | null;
    over: boolean;
  } = null;
  #suppressClick = false;
  #off: (() => void)[] = [];

  constructor(root: HTMLElement, hooks: DragHooks) {
    this.#root = root;
    this.#hooks = hooks;
    const on = <K extends keyof DocumentEventMap>(t: K, f: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      document.addEventListener(t, f, opts);
      this.#off.push(() => document.removeEventListener(t, f, opts));
    };
    on('pointerdown', (e) => this.#down(e));
    on('pointermove', (e) => this.#move(e));
    on('pointerup', () => this.#end(false));
    on('pointercancel', () => this.#end(true));
    on('keydown', (e) => {
      if (e.key === 'Escape' && this.#d?.started) this.#end(true);
    });
    on('click', (e) => this.#click(e), { capture: true });
  }

  destroy(): void {
    this.#off.forEach((f) => f());
    cancelAnimationFrame(this.#raf);
    this.#g.el?.remove();
  }

  get busy(): boolean {
    return !!this.#g.el;
  }

  #reduced(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  #q(sel: string): HTMLElement | null {
    return this.#root.querySelector(sel);
  }

  #apply(): void {
    const g = this.#g;
    if (!g.el) return;
    g.el.style.transform = `translate3d(${g.x.v}px,${g.y.v}px,0) rotate(${g.r.v}deg) scale(${g.s.v})`;
    g.el.style.opacity = String(g.o.v);
  }

  #loop = (t: number): void => {
    const g = this.#g;
    const dt = Math.min(0.05, (t - (this.#last || t)) / 1000 || 0.016);
    this.#last = t;
    let on = false;
    const n = Math.max(1, Math.round(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) for (const k of ['x', 'y', 's', 'r', 'o'] as Key[]) on = g[k].step(h) || on;
    this.#apply();
    if (this.#onArrive && !this.#arrived && Math.hypot(g.x.v - g.x.t, g.y.v - g.y.t) < 3) {
      this.#arrived = true;
      const f = this.#onArrive;
      this.#onArrive = null;
      f();
    }
    if (on || this.#tracking) this.#raf = requestAnimationFrame(this.#loop);
    else {
      this.#raf = 0;
      this.#last = 0;
      const f = this.#onRest;
      this.#onRest = null;
      f?.();
    }
  };

  #kick(): void {
    if (!this.#raf) {
      this.#last = 0;
      this.#raf = requestAnimationFrame(this.#loop);
    }
  }

  #makeGhost(node: HTMLElement, w: number, h: number, origin: string): HTMLElement {
    this.#g.el?.remove();
    node.classList.add('ms-ghost');
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    Object.assign(node.style, { position: 'fixed', left: '0', top: '0', zIndex: '1000', pointerEvents: 'none', margin: '0', width: `${w}px`, height: `${h}px`, transformOrigin: origin });
    document.body.appendChild(node);
    this.#g.el = node;
    this.#arrived = false;
    this.#onArrive = null;
    this.#onRest = null;
    for (const k of ['x', 'y', 's', 'r', 'o'] as Key[]) this.#g[k].on = false;
    return node;
  }

  #dropGhost(): void {
    this.#g.el?.remove();
    this.#g.el = null;
    this.#tracking = false;
  }

  #land(src: HTMLElement): void {
    this.#onArrive = () => this.#hooks.copy(src);
    this.#onRest = () => {
      this.#dropGhost();
      src.classList.remove('is-drag-source', 'is-pressed');
      this.#hooks.landed?.(src);
    };
  }

  #refuse(src: HTMLElement, why: 'disabled' | 'full'): void {
    src.classList.remove('is-refused');
    void src.offsetWidth;
    src.classList.add('is-refused');
    setTimeout(() => src.classList.remove('is-refused'), 500);
    this.#hooks.refuse(src, why);
  }

  /** Keyboard / click path: fly a copy from the source straight into the next free bay. */
  flyCopy(src: HTMLElement): void {
    if (this.busy) return;
    if (src.getAttribute('aria-disabled') === 'true') return this.#refuse(src, 'disabled');
    const slot = this.#q('[data-next-slot]');
    if (!slot) return this.#refuse(src, 'full');
    if (this.#reduced()) return this.#hooks.copy(src);
    slot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const sr = slot.getBoundingClientRect();
    const er = src.getBoundingClientRect();
    this.#makeGhost(this.#hooks.ghost(src), sr.width, sr.height, '0 0');
    const g = this.#g;
    const s0 = clamp(Math.min(er.width / sr.width, er.height / sr.height), 0.3, 1);
    g.x.set(er.left + (er.width - sr.width * s0) / 2);
    g.y.set(er.top + (er.height - sr.height * s0) / 2);
    g.s.set(s0);
    g.r.set(0);
    g.o.set(1);
    this.#apply();
    g.x.to(sr.left, { damping: 0.82, response: 0.46 });
    g.y.to(sr.top, { damping: 0.82, response: 0.46 });
    g.s.to(1, { damping: 0.9, response: 0.4 });
    this.#land(src);
    this.#kick();
  }

  /** Undo/revert path: fly a bay card back to where it came from, fading out. */
  flyBack(bay: HTMLElement, src: HTMLElement | null): void {
    if (this.#reduced() || this.busy) return;
    const dr = bay.getBoundingClientRect();
    const node = bay.cloneNode(true) as HTMLElement;
    node.querySelectorAll('[id],[data-bay],[data-src-item]').forEach((n) => {
      n.removeAttribute('id');
      n.removeAttribute('data-bay');
    });
    node.removeAttribute('data-bay');
    this.#makeGhost(node, dr.width, dr.height, '0 0');
    const g = this.#g;
    g.x.set(dr.left);
    g.y.set(dr.top);
    g.s.set(1);
    g.r.set(0);
    g.o.set(1);
    this.#apply();
    if (src) {
      const sr = src.getBoundingClientRect();
      const sc = clamp(Math.min(sr.width / dr.width, sr.height / dr.height), 0.3, 1);
      g.x.to(sr.left + (sr.width - dr.width * sc) / 2, { damping: 1, response: 0.34 });
      g.y.to(sr.top + (sr.height - dr.height * sc) / 2, { damping: 1, response: 0.34 });
      g.s.to(sc, { damping: 1, response: 0.34 });
      g.o.to(0, { damping: 1, response: 0.5 });
      src.classList.add('is-returning');
      setTimeout(() => src.classList.remove('is-returning'), 700);
    } else {
      g.s.to(0.9, { damping: 1, response: 0.25 });
      g.o.to(0, { damping: 1, response: 0.25 });
    }
    this.#onRest = () => this.#dropGhost();
    this.#kick();
  }

  #velocity(h: { x: number; y: number; t: number }[]): { x: number; y: number } {
    const now = h[h.length - 1]!;
    let i = h.length - 1;
    while (i > 0 && now.t - h[i - 1]!.t < 90) i--;
    const p = h[Math.max(0, i - 1)]!;
    const dt = (now.t - p.t) / 1000;
    return dt > 0.001 ? { x: (now.x - p.x) / dt, y: (now.y - p.y) / dt } : { x: 0, y: 0 };
  }

  #down(e: PointerEvent): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-src-item]');
    if (!el || e.button !== 0 || this.busy || !this.#root.contains(el)) return;
    this.#d = {
      el,
      sx: e.clientX,
      sy: e.clientY,
      started: false,
      hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
      w: 0,
      h: 0,
      ax: 0,
      ay: 0,
      s0: 1,
      origin: el.getBoundingClientRect(),
      zone: null,
      over: false,
    };
    el.classList.add('is-pressed');
  }

  #move(e: PointerEvent): void {
    const d = this.#d;
    if (!d) return;
    d.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 12) d.hist.shift();
    if (!d.started) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      if (!this.#start()) return;
    }
    this.#drag(e.clientX, e.clientY);
  }

  #start(): boolean {
    const d = this.#d!;
    const el = d.el;
    const stop = (why: 'disabled' | 'full') => {
      this.#refuse(el, why);
      el.classList.remove('is-pressed');
      this.#d = null;
      this.#suppressClick = true;
      return false;
    };
    if (el.getAttribute('aria-disabled') === 'true') return stop('disabled');
    const slot = this.#q('[data-next-slot]');
    if (!slot) return stop('full');
    slot.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const sr = slot.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    d.started = true;
    this.#suppressClick = true;
    d.w = sr.width;
    d.h = sr.height;
    d.ax = clamp((d.sx - er.left) / er.width, 0, 1);
    d.ay = clamp((d.sy - er.top) / er.height, 0, 1);
    d.s0 = clamp(Math.min(er.width / sr.width, er.height / sr.height), 0.3, 1);
    d.origin = er;
    d.zone = this.#q('[data-dropzone]');
    this.#makeGhost(this.#hooks.ghost(el), d.w, d.h, `${d.ax * 100}% ${d.ay * 100}%`);
    const g = this.#g;
    this.#tracking = true;
    g.x.set(d.sx - d.ax * d.w);
    g.y.set(d.sy - d.ay * d.h);
    if (this.#reduced()) g.s.set(1);
    else {
      g.s.set(d.s0);
      g.s.to(1.03, { damping: 0.86, response: 0.28 });
    }
    g.r.set(0);
    g.o.set(1);
    this.#apply();
    el.classList.add('is-drag-source');
    document.body.classList.add('ms-dragging');
    this.#hooks.tether?.start(er);
    this.#kick();
    return true;
  }

  #drag(px: number, py: number): void {
    const d = this.#d!;
    const g = this.#g;
    g.x.set(px - d.ax * d.w);
    g.y.set(py - d.ay * d.h);
    const v = this.#velocity(d.hist);
    if (!this.#reduced()) g.r.to(clamp(v.x / 90, -6, 6), { damping: 1, response: 0.22 });
    const zr = d.zone?.getBoundingClientRect();
    const over = !!zr && px >= zr.left && px <= zr.right && py >= zr.top && py <= zr.bottom;
    if (over !== d.over) {
      d.over = over;
      d.zone?.classList.toggle('is-drop-ready', over);
      this.#q('[data-next-slot]')?.classList.toggle('is-targeted', over);
      if (!this.#reduced()) g.s.to(over ? 1 : 1.03, { damping: 0.8, response: 0.25 });
    }
    this.#hooks.tether?.move(px, py);
  }

  #end(cancelled: boolean): void {
    const d = this.#d;
    if (!d) return;
    this.#d = null;
    d.el.classList.remove('is-pressed');
    if (!d.started) return;
    document.body.classList.remove('ms-dragging');
    d.zone?.classList.remove('is-drop-ready');
    const slot = this.#q('[data-next-slot]');
    slot?.classList.remove('is-targeted');
    this.#hooks.tether?.end();
    this.#tracking = false;
    setTimeout(() => (this.#suppressClick = false), 0);
    const g = this.#g;
    const v = this.#velocity(d.hist);
    const rebase = () => {
      g.el!.style.transformOrigin = '0 0';
      g.x.set(g.x.v + d.ax * d.w * (1 - g.s.v));
      g.y.set(g.y.v + d.ay * d.h * (1 - g.s.v));
    };
    if (!cancelled && d.over && slot) {
      if (this.#reduced()) {
        this.#dropGhost();
        d.el.classList.remove('is-drag-source');
        this.#hooks.copy(d.el);
        return;
      }
      const sr = slot.getBoundingClientRect();
      rebase();
      g.x.to(sr.left, { damping: 0.72, response: 0.42, velocity: v.x });
      g.y.to(sr.top, { damping: 0.72, response: 0.42, velocity: v.y });
      g.s.to(1, { damping: 0.8, response: 0.3 });
      g.r.to(0, { damping: 0.62, response: 0.38 });
      this.#land(d.el);
      this.#kick();
      return;
    }
    if (this.#reduced()) {
      this.#dropGhost();
      d.el.classList.remove('is-drag-source');
      this.#hooks.cancelled?.();
      return;
    }
    const er = d.el.getBoundingClientRect();
    rebase();
    g.x.to(er.left + (er.width - d.w * d.s0) / 2, { damping: 1, response: 0.32, velocity: v.x });
    g.y.to(er.top + (er.height - d.h * d.s0) / 2, { damping: 1, response: 0.32, velocity: v.y });
    g.s.to(d.s0, { damping: 1, response: 0.3 });
    g.r.to(0, { damping: 1, response: 0.3 });
    this.#onRest = () => {
      this.#dropGhost();
      d.el.classList.remove('is-drag-source');
    };
    this.#hooks.cancelled?.();
    this.#kick();
  }

  #click(e: MouseEvent): void {
    const src = (e.target as Element | null)?.closest<HTMLElement>('[data-src-item]');
    if (!src || !this.#root.contains(src)) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    this.flyCopy(src);
  }
}
