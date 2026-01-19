/*! init.js | Initialize base folder structure and environment for the virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';
import { STORAGE_KEYS } from '../constants.js';

export const initCommands = ['init'];

const VFS_STORAGE_KEY = STORAGE_KEYS.VFS;
const VFS_BACKUP_PREFIX = STORAGE_KEYS.VFS_BACKUP_PREFIX;

const SYS_ENV_PATH = '/sys/env.json';
const SYS_ASSETS_VERSION_PATH = '/sys/assets-version.json';

const ASSET_BASE_URL = new URL('../assets/', import.meta.url);
const ASSET_MANIFEST_URL = new URL('manifest.json', ASSET_BASE_URL);
const ASSET_VERSION_URL = new URL('version.json', ASSET_BASE_URL);

function ensureDirPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  vfs.changeDirectory('/');
  for (const part of parts) {
    try {
      vfs.mkdir(part);
    } catch (_) {
      // Ignore errors if the folder already exists
    }
    vfs.changeDirectory(part);
  }
}

async function fetchAsDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function fetchAsJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

function getParentDir(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

async function loadAssetsManifest() {
  // If the runtime doesn't support fetch (non-browser), skip.
  if (typeof fetch !== 'function') {
    return [];
  }

  const response = await fetch(ASSET_MANIFEST_URL);
  if (!response.ok) {
    return [];
  }

  const json = await response.json();
  if (!Array.isArray(json)) {
    return [];
  }

  return json
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const src = typeof e.src === 'string' ? e.src.replace(/^\/+/, '') : '';
      const dest = typeof e.dest === 'string' ? e.dest : '';
      const encoding = typeof e.encoding === 'string' ? e.encoding : 'text';
      return { src, dest, encoding };
    })
    .filter((e) => e.src && e.dest && e.dest.startsWith('/'));
}

async function loadAssetsVersion() {
  if (typeof fetch !== 'function') {
    return null;
  }

  try {
    const json = await fetchAsJson(ASSET_VERSION_URL);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return null;
    }
    const version = typeof json.version === 'string' ? json.version.trim() : '';
    if (!version) {
      return null;
    }
    return { version };
  } catch (_) {
    return null;
  }
}

function readJsonFromVfs(path, fallback) {
  try {
    const raw = vfs.readFile(path);
    return JSON.parse(String(raw || ''));
  } catch (_) {
    return fallback;
  }
}

function writeJsonToVfs(path, value) {
  try {
    const parentDir = getParentDir(path);
    if (parentDir && parentDir !== '/') {
      ensureDirPath(parentDir);
    }
    vfs.writeFile(path, JSON.stringify(value, null, 2));
  } catch (_) {
    // ignore
  }
}

function getInstalledAssetsVersion() {
  const parsed = readJsonFromVfs(SYS_ASSETS_VERSION_PATH, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
    if (version) return version;
  }
  return null;
}

function setInstalledAssetsVersion(version) {
  const v = String(version || '').trim();
  if (!v) return;
  writeJsonToVfs(SYS_ASSETS_VERSION_PATH, { version: v, updatedAt: new Date().toISOString() });
}

function shouldTreatAssetAsBinary(entry) {
  return String(entry?.encoding || 'text') === 'dataUrl';
}

async function syncAssetsFromManifest(shell, { mode }) {
  const manifest = await loadAssetsManifest();
  if (!manifest.length) {
    return {
      imported: 0,
      failed: 0,
      total: 0,
      updated: 0,
      unchanged: 0,
      missing: 0,
      outdated: 0,
      checked: 0,
      missingPaths: [],
      outdatedPaths: [],
      failedPaths: [],
      updatedPaths: []
    };
  }

  if (shell && typeof shell.print === 'function') {
    const label = mode === 'check'
      ? 'checking'
      : (mode === 'update' ? 'updating' : 'importing');
    shell.print(`init: ${label} ${manifest.length} asset${manifest.length === 1 ? '' : 's'}...`);
  }

  const cwdSnapshot = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  let imported = 0;
  let failed = 0;
  let updated = 0;
  let unchanged = 0;
  let missing = 0;
  let outdated = 0;
  let checked = 0;
  let processed = 0;

  const missingPaths = [];
  const outdatedPaths = [];
  const failedPaths = [];
  const updatedPaths = [];

  try {
    for (const entry of manifest) {
      try {
        const url = new URL(entry.src, ASSET_BASE_URL);
        const parentDir = getParentDir(entry.dest);
        if (parentDir && parentDir !== '/') {
          ensureDirPath(parentDir);
        }

        let existing = null;
        try {
          existing = vfs.readFile(entry.dest);
        } catch (_) {
          existing = null;
        }

        let remote;
        if (shouldTreatAssetAsBinary(entry)) {
          if (typeof FileReader === 'undefined') {
            throw new Error('FileReader not available');
          }
          remote = await fetchAsDataUrl(url);
        } else {
          remote = await fetchAsText(url);
        }

        const isMissing = existing == null;
        const isDifferent = !isMissing && String(existing) !== String(remote);

        if (mode === 'check') {
          checked += 1;
          if (isMissing) {
            missing += 1;
            missingPaths.push(entry.dest);
          } else if (isDifferent) {
            outdated += 1;
            outdatedPaths.push(entry.dest);
          }
          else unchanged += 1;
        } else if (mode === 'update') {
          checked += 1;
          if (isMissing || isDifferent) {
            vfs.writeFile(entry.dest, remote);
            updated += 1;
            updatedPaths.push(entry.dest);
            if (isMissing) {
              missing += 1;
              missingPaths.push(entry.dest);
            } else {
              outdated += 1;
              outdatedPaths.push(entry.dest);
            }
          } else {
            unchanged += 1;
          }
          imported += 1;
        } else {
          // install/import: always write
          vfs.writeFile(entry.dest, remote);
          imported += 1;
        }
      } catch (_) {
        failed += 1;
        if (entry && typeof entry.dest === 'string' && entry.dest) {
          failedPaths.push(entry.dest);
        }
      }

      processed += 1;
      if (shell && typeof shell.print === 'function' && (processed % 10 === 0 || processed === manifest.length)) {
        shell.print(`${processed}/${manifest.length}`);
      }
    }
  } finally {
    try {
      vfs.changeDirectory(cwdSnapshot);
    } catch (_) {
      // ignore
    }
  }

  return {
    imported,
    failed,
    total: manifest.length,
    updated,
    unchanged,
    missing,
    outdated,
    checked,
    missingPaths,
    outdatedPaths,
    failedPaths,
    updatedPaths
  };
}

function printAssetPathList(shell, title, paths) {
  if (!shell || typeof shell.print !== 'function') return;
  const list = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (list.length === 0) return;

  shell.print(title);
  for (const p of list) {
    shell.print(`  ${p}`);
  }
}

async function importAssetsFromManifest(shell) {
  return await syncAssetsFromManifest(shell, { mode: 'import' });
}

async function checkAssetsFromManifest(shell) {
  return await syncAssetsFromManifest(shell, { mode: 'check' });
}

async function updateAssetsFromManifest(shell) {
  return await syncAssetsFromManifest(shell, { mode: 'update' });
}

function isVfsEmpty() {
  const root = vfs.state && vfs.state.root;
  if (!root) return true;

  const folders = Array.isArray(root.folders) ? root.folders : [];
  const files = Array.isArray(root.files) ? root.files : [];

  // Treat a VFS that only contains /sys (shell state) as "empty" for the
  // purposes of initialization. This prevents early /sys writes (history/config/env)
  // from blocking init from creating the base directory layout.
  const nonSysFolders = folders.filter((f) => f && typeof f.name === 'string' && f.name !== 'sys');
  return nonSysFolders.length === 0 && files.length === 0;
}

function backupVfsIfNeeded() {
  let backedUp = false;
  let backupKey = null;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { backedUp: false, backupKey: null };
    }
    const storage = window.localStorage;
    const raw = storage.getItem(VFS_STORAGE_KEY);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupKey = `${VFS_BACKUP_PREFIX}.${timestamp}`;
    if (raw) {
      storage.setItem(backupKey, raw);
    } else {
      storage.setItem(backupKey, JSON.stringify(vfs.state));
    }
    backedUp = true;
  } catch (e) {
    backedUp = false;
  }
  return { backedUp, backupKey };
}

function setupBaseStructure() {
  // Start from a clean filesystem
  vfs.reset();

  // Basic directory layout
  ensureDirPath('/bin');
  ensureDirPath('/home/user');
  ensureDirPath('/home/user/pictures');
  ensureDirPath('/home/user/docs');
  ensureDirPath('/tmp');
  ensureDirPath('/sys');

  // Default working directory is the user home
  try {
    vfs.changeDirectory('/home/user');
  } catch (e) {
    // If for some reason this fails, we simply stay at root
  }
}

function ensurePathEnv() {
  try {
    let env = {};
    try {
      env = JSON.parse(String(vfs.readFile(SYS_ENV_PATH) || '')) || {};
    } catch (_) {
      env = {};
    }

    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      env = {};
    }
    if (!Array.isArray(env.PATH)) {
      env.PATH = [];
    }
    if (!env.PATH.includes('/bin')) {
      env.PATH.push('/bin');
    }

    vfs.writeFile(SYS_ENV_PATH, JSON.stringify(env, null, 2));
  } catch (e) {
    // Ignore env persistence errors; they are not fatal for init
  }
}

/**
 * Execute the init program.
 *
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ handled: boolean, shouldContinue: boolean } | undefined>}
 */
export async function executeInitProgram(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'init') {
    return { handled: false, shouldContinue: true };
  }

  const doCheck = args.includes('--check');
  const doUpdate = args.includes('--update');

  const force = args.includes('-f') || args.includes('--force');
  const empty = isVfsEmpty();

  let storageHasVfs = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      storageHasVfs = Boolean(window.localStorage.getItem(VFS_STORAGE_KEY));
    }
  } catch (_) {
    storageHasVfs = false;
  }

  if (doCheck) {
    const remote = await loadAssetsVersion();
    const localVersion = getInstalledAssetsVersion();
    if (remote && remote.version) {
      if (localVersion && localVersion !== remote.version) {
        shell.print(`init: new version available: ${remote.version} (installed: ${localVersion}).`);
      } else if (localVersion && localVersion === remote.version) {
        shell.print(`init: installed version is up to date: ${localVersion}.`);
      } else {
        shell.print(`init: latest version: ${remote.version}.`);
      }
    }

    const assets = await checkAssetsFromManifest(shell);
    if (assets.total === 0) {
      shell.print('init: no assets found in manifest.');
      shell.print('');
      return { handled: true, shouldContinue: true, ok: true };
    }

    shell.print(
      `init: checked ${assets.checked}/${assets.total} assets: ` +
      `${assets.unchanged} ok, ${assets.missing} missing, ${assets.outdated} outdated` +
      `${assets.failed ? ` (${assets.failed} failed)` : ''}.`
    );

    printAssetPathList(shell, 'init: missing:', assets.missingPaths);
    printAssetPathList(shell, 'init: outdated:', assets.outdatedPaths);
    printAssetPathList(shell, 'init: failed:', assets.failedPaths);

    shell.print('');
    return { handled: true, shouldContinue: true, ok: assets.failed === 0 };
  }

  if (doUpdate) {
    const cwdSnapshot = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
    const remote = await loadAssetsVersion();
    const assets = await updateAssetsFromManifest(shell);
    if (assets.total === 0) {
      shell.print('init: no assets found in manifest.');
      shell.print('');
      try {
        vfs.changeDirectory(cwdSnapshot);
      } catch (_) {
        // ignore
      }
      return { handled: true, shouldContinue: true, ok: true };
    }

    shell.print(
      `init: updated ${assets.updated}/${assets.total} assets (` +
      `${assets.unchanged} unchanged` +
      `${assets.failed ? `, ${assets.failed} failed` : ''}` +
      `).`
    );

    printAssetPathList(shell, 'init: updated files:', assets.updatedPaths);

    if (remote && remote.version) {
      setInstalledAssetsVersion(remote.version);
      shell.print(`init: installed assets version is now ${remote.version}.`);
    }

    shell.print('');
    try {
      vfs.changeDirectory(cwdSnapshot);
    } catch (_) {
      // ignore
    }
    return { handled: true, shouldContinue: true, ok: assets.failed === 0 };
  }

  if (!empty && !force) {
    shell.print('init: virtual filesystem already initialized.');
    shell.print('Use "init -f" to force re-initialize (creates a backup).');
    shell.print('Tip: use "init --check" or "init --update" to sync bundled assets without resetting your VFS.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  let backedUp = false;
  let backupKey = null;
  if (!empty) {
    const info = backupVfsIfNeeded();
    backedUp = info.backedUp;
    backupKey = info.backupKey;
  }

  shell.print('init: create base folder structure.');
  setupBaseStructure();
  const assets = await importAssetsFromManifest(shell);
  ensurePathEnv();

  {
    const remote = await loadAssetsVersion();
    if (remote && remote.version) {
      setInstalledAssetsVersion(remote.version);
    }
  }

  shell.print('init: base folder structure initialized.');
  await shell.sleep(100);
  
  if (!empty && backedUp) {
    shell.print(
      `init: previous filesystem backed up under localStorage key "${backupKey}".`
    );
  } else if (!empty && !backedUp) {
    shell.print('init: warning: previous filesystem could not be backed up.');
  } else if (empty) {
    shell.print('init: no previous filesystem found; nothing to backup.');
  }
  await shell.sleep(100);
  shell.print('Home directory: /home/user');
  shell.print('Binary directory prepared on PATH: /bin');
  shell.print('');

  return { handled: true, shouldContinue: true };
}
