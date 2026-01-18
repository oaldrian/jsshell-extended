/*! rmdir.js | `rmdir` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const rmdirCommands = ['rmdir'];

/**
 * Execute the `rmdir` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeRmdirCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'rmdir') {
    return { handled: false, shouldContinue: true };
  }

  if (!args.length) {
    shell.print('rmdir: missing operand');
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('rmdir: missing operand') };
  }

  let hadError = false;
  for (const name of args) {
    try {
      vfs.rmdir(name);
    } catch (err) {
      hadError = true;
      shell.print(String(err.message || err));
    }
  }
  shell.print('');

  return hadError
    ? { handled: true, shouldContinue: true, ok: false, error: new Error('rmdir: one or more operations failed') }
    : { handled: true, shouldContinue: true, ok: true };
}
