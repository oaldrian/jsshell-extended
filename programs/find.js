/*! find.js | `find` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';
import { joinPath, normalizePathFromCwd } from '../fs/pathUtils.js';

export const findCommands = ['find'];

function globToRegExp(glob) {
  const src = String(glob || '');
  const escaped = src.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexSrc = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(regexSrc);
}

function parseFindArgs(args) {
  const opts = {
    ls: false,
    name: null,
    type: null, // 'f' | 'd'
    maxDepth: Infinity
  };

  let path = null;
  let parsingFlags = true;

  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i] ?? '');
    if (parsingFlags && a === '--') {
      parsingFlags = false;
      continue;
    }

    if (parsingFlags && a.startsWith('-')) {
      if (a === '-ls') {
        opts.ls = true;
        continue;
      }
      if (a === '-name') {
        const next = args[i + 1];
        if (next == null) return { error: 'find: -name requires a pattern', opts, path };
        opts.name = String(next);
        i += 1;
        continue;
      }
      if (a === '-type') {
        const next = args[i + 1];
        if (next == null) return { error: 'find: -type requires f or d', opts, path };
        const t = String(next).toLowerCase();
        if (t !== 'f' && t !== 'd') return { error: 'find: -type must be f or d', opts, path };
        opts.type = t;
        i += 1;
        continue;
      }
      if (a === '-maxdepth') {
        const next = args[i + 1];
        if (next == null) return { error: 'find: -maxdepth requires a number', opts, path };
        const n = Number(next);
        if (!Number.isFinite(n) || n < 0) return { error: 'find: -maxdepth must be a non-negative number', opts, path };
        opts.maxDepth = Math.floor(n);
        i += 1;
        continue;
      }

      return { error: `find: unknown option: ${a}`, opts, path };
    }

    if (!path) {
      path = a;
      continue;
    }

    return { error: 'find: too many paths (only one start path supported)', opts, path };
  }

  return { opts, path: path || '.', error: null };
}

function basename(p) {
  const s = String(p || '');
  if (s === '/' || !s) return s;
  const parts = s.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function getLsSizeForPath(path, kind) {
  if (kind === 'file') {
    try {
      const content = vfs.readFile(path);
      return String((content || '').length);
    } catch (_) {
      return '0';
    }
  }

  // folder: show immediate child count (similar to ls -l implementation)
  try {
    const listed = vfs.list(path);
    const count = (listed.folders?.length || 0) + (listed.files?.length || 0);
    return String(count);
  } catch (_) {
    return '0';
  }
}

function *walk(startPath, maxDepth) {
  // Yields { path, kind, depth }
  const stack = [{ path: startPath, depth: 0, kind: null }];

  while (stack.length) {
    const item = stack.pop();
    const currentPath = item.path;
    const depth = item.depth;

    // Determine node kind once
    let kind = item.kind;
    if (!kind) {
      try {
        vfs.list(currentPath);
        kind = 'folder';
      } catch (_) {
        kind = 'file';
      }
    }

    yield { path: currentPath, kind, depth };

    if (kind !== 'folder') continue;
    if (depth >= maxDepth) continue;

    let listing;
    try {
      listing = vfs.list(currentPath);
    } catch (_) {
      continue;
    }

    const folders = Array.isArray(listing.folders) ? listing.folders.slice().sort((a, b) => String(a).localeCompare(String(b))) : [];
    const files = Array.isArray(listing.files) ? listing.files.slice().sort((a, b) => String(a).localeCompare(String(b))) : [];

    // Push in reverse order so the output is stable (stack = LIFO)
    for (let i = files.length - 1; i >= 0; i -= 1) {
      stack.push({ path: joinPath(currentPath, files[i]), depth: depth + 1, kind: 'file' });
    }
    for (let i = folders.length - 1; i >= 0; i -= 1) {
      stack.push({ path: joinPath(currentPath, folders[i]), depth: depth + 1, kind: 'folder' });
    }
  }
}

/**
 * Execute the `find` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 */
export function executeFindCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'find') {
    return { handled: false, shouldContinue: true };
  }

  const parsed = parseFindArgs(Array.isArray(args) ? args : []);
  if (parsed.error) {
    shell.print(parsed.error);
    shell.print('Usage: find [path] [-ls] [-name <glob>] [-type f|d] [-maxdepth N]');
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false };
  }

  const cwdPath = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  const startPath = normalizePathFromCwd(cwdPath, parsed.path);

  // Validate start path exists
  let startKind = null;
  try {
    vfs.list(startPath);
    startKind = 'folder';
  } catch (_) {
    try {
      vfs.readFile(startPath);
      startKind = 'file';
    } catch (e) {
      shell.print(`find: ${startPath}: No such file or directory`);
      shell.print('');
      return { handled: true, shouldContinue: true, ok: false, error: e };
    }
  }

  const nameRe = parsed.opts.name ? globToRegExp(parsed.opts.name) : null;

  for (const entry of walk(startPath, parsed.opts.maxDepth)) {
    if (entry.depth === 0 && startKind && entry.kind !== startKind) {
      // should not happen, but keep consistent
    }

    if (parsed.opts.type) {
      if (parsed.opts.type === 'f' && entry.kind !== 'file') continue;
      if (parsed.opts.type === 'd' && entry.kind !== 'folder') continue;
    }

    if (nameRe) {
      const base = basename(entry.path);
      if (!nameRe.test(base)) continue;
    }

    if (parsed.opts.ls) {
      const typeChar = entry.kind === 'folder' ? 'd' : '-';
      const size = getLsSizeForPath(entry.path, entry.kind);
      const sizeCol = String(size).padStart(6, ' ');
      shell.print(`${typeChar} ${sizeCol} ${entry.path}`);
    } else {
      shell.print(entry.path);
    }
  }

  shell.print('');
  return { handled: true, shouldContinue: true, ok: true };
}
