/*! exit.js | `exit` command for JsShell */

// Command names provided by this module
export const exitCommands = ['exit'];

/**
 * Execute the `exit` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export function executeExitCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'exit') {
    return { handled: false, shouldContinue: true };
  }

  shell.print('Bye...');
  return { handled: true, shouldContinue: false };
}
