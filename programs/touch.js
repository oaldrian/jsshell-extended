/*! touch.js | `touch` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const touchCommands = ['touch'];

/**
 * Execute the `touch` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeTouchCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'touch') {
    return { handled: false, shouldContinue: true };
  }

  if (!args.length) {
    shell.print('touch: missing file operand');
    shell.print("Try 'touch filename'");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('touch: missing operand') };
  }

  let hadError = false;
  for (const path of args) {
    try {
      // Try to read existing content; if file doesn't exist, create empty
      let content = '';
      try {
        content = vfs.readFile(path);
      } catch (_) {
        content = '';
      }
      vfs.writeFile(path, content);
    } catch (err) {
      hadError = true;
      shell.print(String(err.message || err));
    }
  }
  shell.print('');

  return hadError
    ? { handled: true, shouldContinue: true, ok: false, error: new Error('touch: one or more operations failed') }
    : { handled: true, shouldContinue: true, ok: true };
}
