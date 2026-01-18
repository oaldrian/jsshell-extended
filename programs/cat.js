/*! cat.js | `cat` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const catCommands = ['cat'];

/**
 * Execute the `cat` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeCatCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'cat') {
    return { handled: false, shouldContinue: true };
  }

  if (!args.length) {
    shell.print('cat: missing operand');
    shell.print("Try 'cat filename'");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('cat: missing operand') };
  }

  let hadError = false;
  for (const path of args) {
    try {
      const content = vfs.readFile(path);
      shell.print(content);
    } catch (err) {
      hadError = true;
      shell.print(String(err.message || err));
    }
  }
  shell.print('');

  return hadError
    ? { handled: true, shouldContinue: true, ok: false, error: new Error('cat: one or more files could not be read') }
    : { handled: true, shouldContinue: true, ok: true };
}
