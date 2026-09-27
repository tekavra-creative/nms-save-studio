import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, net, protocol, utilityProcess, type UtilityProcess } from 'electron';
import { API_CHANNEL, ENGINE_OPS, type EngineRequest } from '../shared/api.ts';
import { hardenApp } from './security.ts';

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;
hardenApp(isDev);
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'nms-icon', privileges: { standard: true, secure: true } },
]);

const RENDERER_DIR = join(import.meta.dirname, '../renderer');

// app://bundle/<file> serves the built interface from inside the package (file:// has no extra privileges).
function registerAppProtocol(): void {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = normalize(join(RENDERER_DIR, rel));
    if (!file.startsWith(RENDERER_DIR + sep)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

let engine: UtilityProcess | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function startEngine(): UtilityProcess {
  const child = utilityProcess.fork(join(import.meta.dirname, 'engine-host.js'), [], {
    serviceName: 'Save Engine',
    env: { ...process.env, NSS_USER_DATA: app.getPath('userData') },
  });
  child.on('message', (msg: { id: number; ok: boolean; value?: unknown; error?: string }) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error));
  });
  child.on('exit', () => {
    for (const p of pending.values()) p.reject(new Error('save engine stopped'));
    pending.clear();
    engine = undefined;
  });
  return child;
}

function callEngine(request: EngineRequest): Promise<unknown> {
  engine ??= startEngine();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    engine!.postMessage({ id, request });
  });
}

const ALLOWED_OPS = new Set<EngineRequest['op']>(ENGINE_OPS);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'NMS Save Studio',
    backgroundColor: '#0b0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  const shot = process.env['NSS_SELFTEST_SHOT'];
  if (shot) void selfTest(win, shot);
  if (isDev) void win.loadURL(process.env.ELECTRON_RENDERER_URL!);
  else void win.loadURL('app://bundle/index.html');
}

// Packaged-build smoke test: fuses block debugger attach, so the app proves itself.
// NSS_SELFTEST_SHOT=/path.png → wait for the saves list, save a screenshot, quit.
async function selfTest(win: BrowserWindow, path: string): Promise<void> {
  const { writeFileSync } = await import('node:fs');
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    ok = await win.webContents
      .executeJavaScript("!!document.querySelector('[aria-label=\"Saves\"] button')")
      .catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 250));
  }
  writeFileSync(path, (await win.webContents.capturePage()).toPNG());
  console.log(`selftest ${ok ? 'PASS' : 'FAIL'} ${path}`);
  app.exit(ok ? 0 : 1);
}

ipcMain.handle(API_CHANNEL, async (event, request: EngineRequest) => {
  if (!event.senderFrame || !ALLOWED_OPS.has(request?.op)) throw new Error('request rejected');
  return callEngine(request);
});

// nms-icon://icon/<path inside the game's icon folder> → PNG decoded from the user's own install.
function registerIconProtocol(): void {
  protocol.handle('nms-icon', async (req) => {
    try {
      const path = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ''));
      const png = (await callEngine({ op: 'icon', path })) as Uint8Array;
      return new Response(new Uint8Array(png) as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=31536000, immutable' } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

app.whenReady().then(() => {
  registerAppProtocol();
  registerIconProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => engine?.kill());
