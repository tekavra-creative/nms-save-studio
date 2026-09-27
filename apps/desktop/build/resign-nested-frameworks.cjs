// electron-builder's own signing pass sometimes skips the older Obj-C frameworks bundled inside
// every Electron app (Squirrel.framework and its ShipIt helper, Mantle, ReactiveObjC) — they come
// out still carrying Electron's original signature, which Apple's notarization service rejects
// ("not signed with a valid Developer ID certificate" / "signature does not include a secure
// timestamp"). This re-signs them explicitly, after electron-builder's pass and before it submits
// for notarization (electron-builder calls afterSign, then notarizes, in the same build).
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Whole FRAMEWORK BUNDLES, not the raw binaries inside them: signing just the inner Mach-O
// (Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel) leaves the framework's OWN
// _CodeSignature/CodeResources manifest pointing at the old hash — that's what "a sealed resource
// is missing or invalid" actually meant. Signing the bundle path re-signs the binary AND recomputes
// the framework's own seal together.
const NESTED = [
  'Contents/Frameworks/Squirrel.framework',
  'Contents/Frameworks/Mantle.framework',
  'Contents/Frameworks/ReactiveObjC.framework',
];

exports.default = async function resignNestedFrameworks(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const identity = context.packager.config.mac?.identity;
  // electron-builder's own CSC_IDENTITY_AUTO_DISCOVERY already picked a Developer ID identity for
  // the main signing pass; find the same one again rather than trust a config value that may be unset.
  const found = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning']).toString();
  const match = found.match(/"Developer ID Application:[^"]+"/);
  const signIdentity = identity || (match ? match[0].slice(1, -1) : null);
  if (!signIdentity) throw new Error('resign-nested-frameworks: no Developer ID Application identity found in the keychain');

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = join(__dirname, 'entitlements.mac.plist');
  for (const rel of NESTED) {
    const p = join(appPath, rel);
    if (!existsSync(p)) continue;
    // No --entitlements here: those are only for the main executable and helper apps Electron
    // actually launches, not for shared frameworks/libraries.
    execFileSync('codesign', ['--force', '--timestamp', '--options', 'runtime', '--sign', signIdentity, p], { stdio: 'inherit' });
  }
  // Re-signing those framework bundles invalidated the OUTER app's own seal (its
  // _CodeSignature/CodeResources no longer matches what's inside Contents/Frameworks) — Apple's
  // notarization check doesn't catch that, but real Gatekeeper (`spctl`) does: "a sealed resource
  // is missing or invalid". Re-seal just the outer bundle now that the nested pieces are correct —
  // deliberately WITHOUT --deep: electron-builder already signed each helper .app individually with
  // its own correct entitlements, and --deep here would blanket-overwrite all of them with the
  // main app's entitlements (wrong per-helper capabilities) and re-touch already-correct nested
  // signatures, which is what produced the next error ("code has no resources but signature
  // indicates they must be present").
  execFileSync('codesign', [
    '--force', '--timestamp', '--options', 'runtime',
    '--entitlements', entitlements,
    '--sign', signIdentity,
    appPath,
  ], { stdio: 'inherit' });
};
