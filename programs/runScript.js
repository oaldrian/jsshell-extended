/*! runScript.js | Execute .js files from the virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';
import { normalizePathFromCwd } from '../fs/pathUtils.js';

// No fixed command names here; invocation is via ./filename.js
export const scriptCommands = [];

async function runSource(shell, command, args, source) {
  try {
    const wrappedSource = `
const argv = args;
${source}
if (typeof main === 'function') {
  return main(shell, command, args);
}
return undefined;
`;

    const fn = new Function('shell', 'command', 'args', 'vfs', wrappedSource);
    const result = fn(shell, command, args, vfs);
    if (result instanceof Promise) {
      await result;
    }
    return { ok: true, error: null };
  } catch (err) {
    shell.print(`Error executing ${command}: ${err.message || err}`);
    return { ok: false, error: err };
  }
}

/**
 * Execute a VFS-stored JavaScript file at an absolute or relative VFS path.
 *
 * This is the same execution mechanism used by `./script.js`:
 * - The script may define `main(shell, command, args)` (recommended).
 * - Otherwise, the script body runs once with `shell` and `argv` in scope.
 *
 * The `invokedAs` parameter controls what the script sees as the `command`
 * string (for example: `./sample.js` or `sample`).
 *
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} scriptPath - VFS path to the script (absolute or relative)
 * @param {string[]} args
 * @param {string} [invokedAs]
 * @returns {Promise<{ handled: boolean, shouldContinue: boolean, ok?: boolean, error?: any } | undefined>}
 */
export async function executeVfsScript(shell, scriptPath, args, invokedAs) {
  let source;
  try {
    source = vfs.readFile(scriptPath);
  } catch (err) {
    shell.print(`exec: ${scriptPath}: ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: err };
  }

  const command = invokedAs || scriptPath;

  const runResult = await runSource(shell, command, args, source);

  shell.print('');
  return { handled: true, shouldContinue: true, ok: runResult.ok, error: runResult.error };
}

/**
 * Execute a .js file when invoked like ./filename.js [args...].
 *
 * Convention for VFS-stored programs:
 *   - The script may define a function `main(shell, command, args)`.
 *   - If present, `main` will be called and its (possibly async) result awaited.
 *   - Otherwise, the script body runs once with `shell` and `argv` in scope
 *     via `const argv = args;`, preserving the legacy behavior.
 *
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ handled: boolean, shouldContinue: boolean, ok?: boolean, error?: any } | undefined>}
 */
export async function executeScriptFile(shell, command, args) {
  if (!command || !command.startsWith('./') || !command.endsWith('.js')) {
    return { handled: false, shouldContinue: true };
  }

  let source;
  try {
    const cwdPath = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
    const canonicalPath = normalizePathFromCwd(cwdPath, command.slice(2)); // strip leading './'
    source = vfs.readFile(canonicalPath);
  } catch (err) {
    shell.print(`exec: ${command}: ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: err };
  }

  const runResult = await runSource(shell, command, args, source);
  shell.print('');
  return { handled: true, shouldContinue: true, ok: runResult.ok, error: runResult.error };
}
