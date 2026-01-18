/*! cls.js | `cls` command for JsShell */

// Command names provided by this module
export const clsCommands = ['cls'];

/**
 * Execute the `cls` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeClsCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'cls') {
    return { handled: false, shouldContinue: true };
  }

  shell.clear();
  shell.print('');

  return { handled: true, shouldContinue: true };
}
