/*! pwd.js | `pwd` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const pwdCommands = ['pwd'];

/**
 * Execute the `pwd` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executePwdCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'pwd') {
    return { handled: false, shouldContinue: true };
  }

  shell.print(vfs.getCwdPath());
  shell.print('');

  return { handled: true, shouldContinue: true, ok: true };
}
