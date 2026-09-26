import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, protocol, utilityProcess, type UtilityProcess } from 'electron';
import { API_CHANNEL, ENGINE_OPS, type EngineRequest } from '../shared/api.ts';
import { hardenApp } from './security.ts';

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;
hardenApp(isDev);
protocol.registerSchemesAsPrivileged([{ scheme: 'nms-icon', privileges: { standard: true, secure: true } }]);

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
  if (isDev) void win.loadURL(process.env.ELECTRON_RENDERER_URL!);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
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
