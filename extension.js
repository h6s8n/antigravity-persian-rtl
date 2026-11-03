'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = 'agyRtlV2';
const OLD_ANCHOR = 'a.search=m.toString();return a.toString()}setupFontChangeListener';

/**
 * Discovers all installed Antigravity extension files across:
 * 1. Standalone Google Antigravity IDE (built-in extensions/agy)
 * 2. VS Code / Insiders / OSS user extensions (google.google-antigravity-*)
 */
function findTargetFiles() {
  const targets = new Set();

  // 1. Built-in extension inside the running IDE (Antigravity IDE standalone)
  if (vscode.env && vscode.env.appRoot) {
    const builtInAgy = path.join(vscode.env.appRoot, 'extensions', 'agy');
    for (const rel of ['vscode/extension.js', 'dist/extension.js', 'extension.js']) {
      const candidate = path.join(builtInAgy, rel);
      if (fs.existsSync(candidate)) targets.add(candidate);
    }
  }

  // 2. Common Windows standalone Antigravity IDE path fallback
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const winAgy = path.join(
      process.env.LOCALAPPDATA,
      'Programs',
      'Antigravity IDE',
      'resources',
      'app',
      'extensions',
      'agy',
      'vscode',
      'extension.js'
    );
    if (fs.existsSync(winAgy)) targets.add(winAgy);
  }

  // 3. User-installed VS Code extensions (.vscode, .antigravity, .antigravity-ide, etc.)
  const home = os.homedir();
  const extRoots = [
    '.vscode',
    '.vscode-insiders',
    '.vscode-server',
    '.vscode-oss',
    '.antigravity',
    '.antigravity-ide'
  ]
    .map((d) => path.join(home, d, 'extensions'))
    .filter((d) => fs.existsSync(d));

  for (const root of extRoots) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (!name.startsWith('google.google-antigravity-') && !name.startsWith('google.antigravity')) continue;
        const dir = path.join(root, name);
        for (const rel of ['extension.js', 'vscode/extension.js', 'dist/extension.js']) {
          const candidate = path.join(dir, rel);
          if (fs.existsSync(candidate)) targets.add(candidate);
        }
      }
    } catch (_) {}
  }

  return Array.from(targets);
}

function applyPatch(context) {
  const sourceProxy = path.join(context.extensionPath, 'rtl-proxy.js');
  const files = findTargetFiles();
  let newlyPatched = 0;
  let alreadyPatched = 0;
  const errors = [];

  for (const file of files) {
    try {
      const orig = file + '.orig';
      const currentSrc = fs.readFileSync(file, 'utf8');

      const parentFolder = path.basename(path.dirname(file));
      const targetDir = (parentFolder === 'vscode' || parentFolder === 'dist')
        ? path.dirname(path.dirname(file))
        : path.dirname(file);
      const deployedProxy = path.join(targetDir, 'rtl-proxy.js');

      try {
        fs.copyFileSync(sourceProxy, deployedProxy);
      } catch (_) {}

      if (currentSrc.includes(MARK)) {
        alreadyPatched++;
        continue;
      }

      const baseSrc = fs.existsSync(orig) ? fs.readFileSync(orig, 'utf8') : currentSrc;
      const parts = baseSrc.split(OLD_ANCHOR);
      if (parts.length !== 2) continue;

      if (!fs.existsSync(orig)) {
        fs.copyFileSync(file, orig);
      }

      const newAnchor = `a.search=m.toString();try{return require(${JSON.stringify(deployedProxy)}).wrap(a.toString())}catch(${MARK}){return a.toString()}}setupFontChangeListener`;
      const preload = `\n;try{require(${JSON.stringify(deployedProxy)})}catch(${MARK}){}\n`;

      fs.writeFileSync(file, baseSrc.replace(OLD_ANCHOR, newAnchor) + preload, 'utf8');
      newlyPatched++;
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }

  return { newlyPatched, alreadyPatched, errors };
}

function removePatch() {
  const files = findTargetFiles();
  let restored = 0;
  const errors = [];

  for (const file of files) {
    try {
      const orig = file + '.orig';
      if (fs.existsSync(orig)) {
        fs.copyFileSync(orig, file);
        fs.unlinkSync(orig);
        restored++;
      }
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }

  return { restored, errors };
}

async function promptReload(message) {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityPersianRtl.enable', async () => {
      const res = applyPatch(context);
      if (res.errors.length > 0) {
        vscode.window.showErrorMessage(`Antigravity RTL Error: ${res.errors.join('; ')}`);
      } else if (res.newlyPatched > 0 || res.alreadyPatched > 0) {
        await promptReload('Antigravity Persian & Arabic RTL is active! Reload window to apply.');
      } else {
        vscode.window.showWarningMessage('Could not find a compatible Antigravity extension target.');
      }
    }),

    vscode.commands.registerCommand('antigravityPersianRtl.disable', async () => {
      const res = removePatch();
      if (res.errors.length > 0) {
        vscode.window.showErrorMessage(`Antigravity RTL Error: ${res.errors.join('; ')}`);
      } else if (res.restored > 0) {
        await promptReload('Antigravity RTL disabled and original files restored. Reload window to apply.');
      } else {
        vscode.window.showInformationMessage('Antigravity RTL was not active.');
      }
    })
  );

  // Zero-configuration: automatically apply on startup if not patched yet
  const res = applyPatch(context);
  if (res.newlyPatched > 0) {
    promptReload('Antigravity Persian & Arabic RTL installed! Click "Reload Window" once to activate RTL chat.');
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
