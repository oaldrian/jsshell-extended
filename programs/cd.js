/*! cd.js | `cd` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const cdCommands = ['cd'];

/**
 * Execute the `cd` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeCdCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'cd') {
    return { handled: false, shouldContinue: true };
  }

  const target = args[0] || '/';
  try {
    vfs.changeDirectory(target);
  } catch (err) {
    shell.print(String(err.message || err));
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: err };
  }

  return { handled: true, shouldContinue: true, ok: true };
}
