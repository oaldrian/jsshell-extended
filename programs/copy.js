/*! copy.js | `copy` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

export const copyCommands = ['copy'];

function joinPathLike(base, name) {
  if (!base || base === '.') return name;
  if (base === '/') return '/' + name;
  return base.endsWith('/') ? (base + name) : (base + '/' + name);
}

function basename(path) {
  const s = String(path || '');
  const parts = s.split('/').filter((p) => p);
  return parts.length ? parts[parts.length - 1] : s;
}

/**
 * Execute the `copy` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 */
export function executeCopyCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'copy') {
    return { handled: false, shouldContinue: true };
  }

  if (!Array.isArray(args) || args.length < 2) {
    shell.print('copy: missing operand');
    shell.print("Try 'copy source.txt dest.txt'");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('copy: missing operand') };
  }

  const src = args[0];
  const destArg = args[1];

  let content = '';
  try {
    content = vfs.readFile(src);
  } catch (err) {
    shell.print(`copy: cannot read '${src}': ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('copy: cannot read source') };
  }

  let dest = destArg;
  try {
    // If destination is an existing folder, copy into it using source basename.
    vfs.list(destArg);
    dest = joinPathLike(destArg, basename(src));
  } catch (_) {
    // Not a folder (or doesn't exist) -> treat as file path.
  }

  try {
    vfs.writeFile(dest, content);
  } catch (err) {
    shell.print(`copy: cannot write '${dest}': ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('copy: cannot write destination') };
  }

  return { handled: true, shouldContinue: true, ok: true };
}
