/*! date.js | `date` command for JsShell */

// Command names provided by this module
export const dateCommands = ['date'];

/**
 * Execute the `date` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeDateCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'date') {
    return { handled: false, shouldContinue: true };
  }

  const now = new Date();
  shell.print(`Current date and time: ${now.toLocaleString()}`);
  shell.print('');

  return { handled: true, shouldContinue: true };
}
