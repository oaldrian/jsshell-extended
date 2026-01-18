/*! delay.js | `delay` command for JsShell (useful in .jsh scripts) */

export const delayCommands = ['delay'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute the `delay` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 */
export async function executeDelayProgram(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'delay') {
    return { handled: false, shouldContinue: true };
  }

  if (!Array.isArray(args) || args.length < 1) {
    shell.print('delay: missing operand');
    shell.print("Try 'delay 500' (milliseconds)");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('delay: missing operand') };
  }

  const raw = String(args[0]).trim();
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms < 0) {
    shell.print(`delay: invalid milliseconds: ${raw}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('delay: invalid milliseconds') };
  }

  const clamped = Math.min(Math.floor(ms), 60 * 60 * 1000);

  // Prefer shell.sleep if present; otherwise fallback.
  if (shell && typeof shell.sleep === 'function') {
    await shell.sleep(clamped);
  } else {
    await sleep(clamped);
  }

  return { handled: true, shouldContinue: true, ok: true };
}
