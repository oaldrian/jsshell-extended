/*! ls.js | `ls` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const lsCommands = ['ls'];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function joinListedPath(base, name) {
  if (!base || base === '.') return name;
  if (base === '/') return '/' + name;
  return base.endsWith('/') ? (base + name) : (base + '/' + name);
}

function isHiddenName(name) {
  return typeof name === 'string' && name.startsWith('.');
}

function isExecutableName(name) {
  if (typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return lower.endsWith('.js') || lower.endsWith('.jsh');
}

function styleNameHtml(name, { isFolder, isExecutable, isHidden }) {
  const safe = escapeHtml(name);
  const suffix = isFolder ? '/' : '';

  let color = '#90ee90'; // files
  if (isFolder) color = '#87ceeb';
  if (isExecutable) color = '#ffff00';
  if (isHidden) color = '#b0b0b0';

  return `<span style="color: ${color};">${safe}${suffix}</span>`;
}

function parseLsArgs(args) {
  const opts = {
    long: false,
    all: false
  };
  const rest = [];

  let parsingFlags = true;
  for (const a of args) {
    if (parsingFlags && a === '--') {
      parsingFlags = false;
      continue;
    }
    if (parsingFlags && a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'l') opts.long = true;
        if (ch === 'a') opts.all = true;
      }
      continue;
    }
    rest.push(a);
  }

  return { opts, rest };
}

/**
 * Execute the `ls` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeLsCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'ls') {
    return { handled: false, shouldContinue: true };
  }

  const { opts, rest } = parseLsArgs(args);
  const target = rest[0] || '.';
  try {
    const { folders, files } = vfs.list(target);

    const entries = [
      ...folders.map((name) => ({ name, kind: 'folder' })),
      ...files.map((name) => ({ name, kind: 'file' }))
    ]
      .filter((e) => (opts.all ? true : !isHiddenName(e.name)))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (opts.long) {
      for (const e of entries) {
        const isFolder = e.kind === 'folder';
        const isExecutable = !isFolder && isExecutableName(e.name);
        const isHidden = isHiddenName(e.name);

        let size = '';
        if (!isFolder) {
          try {
            const p = joinListedPath(target, e.name);
            const content = vfs.readFile(p);
            size = String((content || '').length);
          } catch (_) {
            size = '0';
          }
        } else {
          try {
            const p = joinListedPath(target, e.name);
            const listed = vfs.list(p);
            const count = (listed.folders?.length || 0) + (listed.files?.length || 0);
            size = String(count);
          } catch (_) {
            size = '0';
          }
        }

        const typeChar = isFolder ? 'd' : '-';
        const sizeCol = size.padStart(6, ' ');
        const nameHtml = styleNameHtml(e.name, { isFolder, isExecutable, isHidden });
        shell.printHTML(`${typeChar} ${sizeCol} ${nameHtml}`);
      }
      shell.print('');
      return { handled: true, shouldContinue: true, ok: true };
    }

    const html = entries
      .map((e) => {
        const isFolder = e.kind === 'folder';
        const isExecutable = !isFolder && isExecutableName(e.name);
        const isHidden = isHiddenName(e.name);
        return styleNameHtml(e.name, { isFolder, isExecutable, isHidden });
      })
      .join('&nbsp;&nbsp;');

    shell.printHTML(html);
    shell.print('');
  } catch (err) {
    shell.print(String(err.message || err));
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: err };
  }

  return { handled: true, shouldContinue: true, ok: true };
}
