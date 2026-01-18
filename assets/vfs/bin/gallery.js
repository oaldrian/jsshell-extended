/* gallery.js (VFS) | Fullscreen image viewer for VFS-stored PNGs */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function joinPath(a, b) {
  const left = String(a || '').replace(/\/+$/g, '');
  const right = String(b || '').replace(/^\/+/, '');
  if (!left) return '/' + right;
  if (!right) return left || '/';
  return `${left}/${right}`;
}

function normalizePath(path) {
  const raw = String(path || '');
  const absolute = raw.startsWith('/');
  const parts = raw.split('/');
  const stack = [];

  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      if (stack.length) stack.pop();
      continue;
    }
    stack.push(p);
  }

  const out = (absolute ? '/' : '') + stack.join('/');
  return out || (absolute ? '/' : '.');
}

function normalizePathFromCwd(cwdPath, input) {
  const token = String(input || '').trim();
  if (!token) return normalizePath(String(cwdPath || '/'));
  if (token.startsWith('/')) return normalizePath(token);
  return normalizePath(joinPath(String(cwdPath || '/'), token));
}

function parseDelayMs(token) {
  if (token == null) return null;
  const raw = String(token).trim();
  if (!raw) return null;

  const msMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*ms$/i);
  if (msMatch) {
    const n = Number(msMatch[1]);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return Math.round(n);
  }

  const sMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*s$/i);
  if (sMatch) {
    const n = Number(sMatch[1]);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return Math.round(n * 1000);
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 1000);
}

function resolveTargetFromArgs(cwdPath, args) {
  const tokens = Array.isArray(args) ? args.filter((a) => a != null && String(a).length > 0) : [];
  if (tokens.length === 0) return { targetPath: null, delayMs: null, error: null };

  // Real shell-style: paths with spaces must be quoted so they arrive as a single arg.
  // Usage is: gallery <path> [delay]
  if (tokens.length === 1) {
    return { targetPath: normalizePathFromCwd(cwdPath, tokens[0]), delayMs: null, error: null };
  }

  if (tokens.length === 2) {
    const maybeDelay = parseDelayMs(tokens[1]);
    if (maybeDelay === null || Number.isNaN(maybeDelay)) {
      return {
        targetPath: null,
        delayMs: null,
        error: `gallery: invalid delay (or unquoted spaces in path): ${String(tokens[1])}`
      };
    }
    return {
      targetPath: normalizePathFromCwd(cwdPath, tokens[0]),
      delayMs: maybeDelay,
      error: null
    };
  }

  // Too many tokens: likely an unquoted path with spaces.
  return {
    targetPath: null,
    delayMs: null,
    error: 'gallery: too many arguments (quote paths with spaces)'
  };
}

function collectPngFilesRecursive(folderPath) {
  const out = [];
  const stack = [folderPath];

  while (stack.length) {
    const current = stack.pop();
    let listing;
    try {
      listing = vfs.list(current);
    } catch (_) {
      continue;
    }

    const folders = Array.isArray(listing.folders) ? listing.folders : [];
    const files = Array.isArray(listing.files) ? listing.files : [];

    for (const f of folders) {
      stack.push(joinPath(current, f));
    }

    for (const name of files) {
      if (typeof name !== 'string') continue;
      if (!name.toLowerCase().endsWith('.png')) continue;
      out.push(joinPath(current, name));
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function render(shell, state) {
  const currentPath = state.paths[state.index];
  const total = state.paths.length;

  shell.clear();

  shell.print(`Gallery: ${currentPath}`);
  shell.print(`(${state.index + 1}/${total})`);
  shell.print('');

  let dataUrl = state.cache.get(currentPath);
  if (typeof dataUrl !== 'string') {
    try {
      dataUrl = vfs.readFile(currentPath);
      state.cache.set(currentPath, dataUrl);
    } catch (e) {
      dataUrl = null;
    }
  }

  if (!dataUrl) {
    shell.print(`gallery: failed to load: ${currentPath}`);
    return;
  }

  shell.printHTML(
    `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:75vh;">` +
    `<img alt="${escapeHtml(currentPath)}" src="${escapeHtml(dataUrl)}" ` +
    `style="max-width:100%; max-height:100%; object-fit:contain; border: 1px solid rgba(255,255,255,0.2);" />` +
    `</div>`
  );
}

async function main(shell, command, args) {
  const cwdPath = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  const { targetPath, delayMs, error } = resolveTargetFromArgs(cwdPath, args);

  if (error) {
    shell.print(String(error));
    shell.print('Usage: gallery <picture-or-folder> [delay]');
    shell.print('Tip: quote paths with spaces, e.g. gallery "My Album" 2');
    shell.print('');
    return;
  }

  if (!targetPath) {
    shell.print('gallery: missing operand');
    shell.print('Usage: gallery <picture-or-folder> [delay]');
    shell.print('  delay: number = seconds (default), or use suffix: 1500ms, 2s');
    shell.print('');
    return;
  }

  // delayMs is already validated by resolveTargetFromArgs

  let paths = [];
  try {
    vfs.list(targetPath);
    paths = collectPngFilesRecursive(targetPath);
  } catch (_) {
    try {
      vfs.readFile(targetPath);
      paths = [targetPath];
    } catch (e) {
      shell.print(`gallery: not found: ${targetPath}`);
      shell.print('');
      return;
    }
  }

  if (!paths.length) {
    shell.print(`gallery: no .png files found under: ${targetPath}`);
    shell.print('');
    return;
  }

  shell.enterProgramMode();
  shell.enterFullscreenMode();

  const exitRaw = typeof shell.enterRawMode === 'function'
    ? shell.enterRawMode({ hideInput: true })
    : null;

  const state = {
    paths,
    index: 0,
    cache: new Map()
  };

  const showStatus = () => {
    const delayLabel = (typeof delayMs === 'number')
      ? `auto: ${Math.round(delayMs / 100) / 10}s`
      : 'manual';

    shell.setStatusLine(
      `<span style="opacity:0.85;">←/→ navigate</span>` +
      `<span style="opacity:0.85;"> | Esc/q close</span>` +
      `<span style="float:right; opacity:0.85;">${escapeHtml(delayLabel)}</span>`
    );
  };

  try {
    let running = true;

    while (running) {
      render(shell, state);
      showStatus();

      const keyEvent = (typeof delayMs === 'number')
        ? await shell.readKey({ timeout: delayMs })
        : await shell.readKey();

      if (typeof delayMs === 'number' && !keyEvent) {
        if (state.paths.length === 1) {
          running = false;
          continue;
        }

        if (state.index >= state.paths.length - 1) {
          running = false;
          continue;
        }

        state.index = Math.min(state.index + 1, state.paths.length - 1);
        continue;
      }

      if (!keyEvent) {
        continue;
      }

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') {
        running = false;
        continue;
      }

      if (keyEvent.code === 'ArrowRight') {
        state.index = Math.min(state.index + 1, state.paths.length - 1);
        continue;
      }

      if (keyEvent.code === 'ArrowLeft') {
        state.index = Math.max(state.index - 1, 0);
        continue;
      }
    }
  } finally {
    if (typeof exitRaw === 'function') {
      exitRaw();
    }
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
