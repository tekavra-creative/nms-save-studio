import { app, session } from 'electron';

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: nms-icon:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const DEV_CSP = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'none'",
  'connect-src ws://localhost:* http://localhost:*',
);

/** Lock the app down: no navigation, no new windows, no permissions, strict CSP. */
export function hardenApp(isDev: boolean): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (e) => e.preventDefault());
    contents.on('will-redirect', (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [isDev ? DEV_CSP : PROD_CSP] },
      });
    });
  });
}
