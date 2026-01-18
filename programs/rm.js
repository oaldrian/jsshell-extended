/*! rm.js | `rm` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';

// Command names provided by this module
export const rmCommands = ['rm'];

/**
 * Execute the `rm` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeRmCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'rm') {
    return { handled: false, shouldContinue: true };
  }

  if (!args.length) {
    shell.print('rm: missing operand');
    shell.print("Try 'rm filename'");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('rm: missing operand') };
  }

  let hadError = false;
  for (const path of args) {
    try {
      vfs.unlink(path);
    } catch (err) {
      hadError = true;
      shell.print(`rm: cannot remove '${path}': ${err.message || err}`);
    }
  }
  shell.print('');

  return hadError
    ? { handled: true, shouldContinue: true, ok: false, error: new Error('rm: one or more operations failed') }
    : { handled: true, shouldContinue: true, ok: true };
}
