/*! jsShellHolder.js | Setup helper for JsShell demo */

import { JsShellExtended } from './jsShellExtended.js';
import { vfs } from './fs/virtualFileSystem.js';
import { normalizePathFromCwd } from './fs/pathUtils.js';
import { helpCommands, executeHelpCommand } from './programs/help.js';
import { clsCommands, executeClsCommand } from './programs/cls.js';
import { exitCommands, executeExitCommand } from './programs/exit.js';
import { dateCommands, executeDateCommand } from './programs/date.js';
import { mkdirCommands, executeMkdirCommand } from './programs/mkdir.js';
import { lsCommands, executeLsCommand } from './programs/ls.js';
import { findCommands, executeFindCommand } from './programs/find.js';
import { grepCommands, executeGrepCommand } from './programs/grep.js';
import { rmdirCommands, executeRmdirCommand } from './programs/rmdir.js';
import { cdCommands, executeCdCommand } from './programs/cd.js';
import { pwdCommands, executePwdCommand } from './programs/pwd.js';
import { catCommands, executeCatCommand } from './programs/cat.js';
import { touchCommands, executeTouchCommand } from './programs/touch.js';
import { rmCommands, executeRmCommand } from './programs/rm.js';
import { executePrintProgram, printCommands } from './programs/print.js';
import { executeCopyCommand, copyCommands } from './programs/copy.js';
import { executeDelayProgram, delayCommands } from './programs/delay.js';
import { executeMvCommand, mvCommands } from './programs/mv.js';
import { executeScriptFile, executeVfsScript, scriptCommands } from './programs/runScript.js';
import { executeInitProgram, initCommands } from './programs/init.js';
import { executeBackupProgram, backupCommands } from './programs/backup.js';
import { executeRestoreProgram, restoreCommands } from './programs/restore.js';
import { executeDownloadProgram, downloadCommands } from './programs/download.js';
import { executeUploadProgram, uploadCommands } from './programs/upload.js';
import { DEFAULT_CONFIG, buildPromptHtml, applyConfigVisuals, createConfigHandler, configCommands } from './programs/config.js';
import { STORAGE_KEYS } from './constants.js';
import { parseCommandLine, tokenizeCommandLine } from './utils/commandLine.js';

const SYS_DIR = '/sys';
const SYS_ENV_PATH = '/sys/env.json';
const SYS_HISTORY_PATH = '/sys/history.json';
const SYS_HISTORY_LIMIT_PATH = '/sys/historyLimit.txt';
const SYS_CONFIG_PATH = '/sys/config.json';
const SYS_ASSETS_VERSION_PATH = '/sys/assets-version.json';

const ASSET_BASE_URL = new URL('./assets/', import.meta.url);
const ASSET_VERSION_URL = new URL('version.json', ASSET_BASE_URL);

function getParentDir(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

function ensureDirPath(path) {
  const cwdSnapshot = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  const parts = String(path || '').split('/').filter(Boolean);
  try {
    vfs.changeDirectory('/');
    for (const part of parts) {
      try {
        vfs.mkdir(part);
      } catch (_) {
        // ignore
      }
      vfs.changeDirectory(part);
    }
  } catch (_) {
    // ignore
  } finally {
    try {
      vfs.changeDirectory(cwdSnapshot);
    } catch (_) {
      // ignore
    }
  }
}

function readJsonFromVfs(path, fallback) {
  try {
    const raw = vfs.readFile(path);
    const parsed = JSON.parse(String(raw || ''));
    return parsed;
  } catch (_) {
    return fallback;
  }
}

function writeJsonToVfs(path, value) {
  try {
    const parent = getParentDir(path);
    if (parent && parent !== '/') {
      ensureDirPath(parent);
    }
    vfs.writeFile(path, JSON.stringify(value, null, 2));
  } catch (_) {
    // ignore
  }
}

function readHistoryLimitFromVfs() {
  const fallback = 500;
  try {
    const raw = vfs.readFile(SYS_HISTORY_LIMIT_PATH);
    const parsed = Number.parseInt(String(raw || '').trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch (_) {
    // ignore
  }

  try {
    vfs.writeFile(SYS_HISTORY_LIMIT_PATH, String(fallback));
  } catch (_) {
    // ignore
  }

  return fallback;
}

async function maybePrintUpdateBanner(shell) {
  if (typeof fetch !== 'function') {
    return;
  }

  let remoteVersion = null;
  try {
    const res = await fetch(ASSET_VERSION_URL);
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === 'object' && !Array.isArray(json) && typeof json.version === 'string') {
        const v = json.version.trim();
        if (v) remoteVersion = v;
      }
    }
  } catch (_) {
    remoteVersion = null;
  }

  if (!remoteVersion) {
    return;
  }

  const local = readJsonFromVfs(SYS_ASSETS_VERSION_PATH, null);
  const localVersion = (local && typeof local === 'object' && typeof local.version === 'string')
    ? local.version.trim()
    : '';

  if (localVersion && localVersion !== remoteVersion) {
    shell.printHTML(
      `<span style="color:#ff6b6b;">New version available: ${remoteVersion}</span>` +
      `<span style="opacity:0.8;"> (installed: ${localVersion}) — run <code>init --check</code></span>`
    );
    shell.print('');
  }
}

/**
 * Initialize a JsShell instance in the given container and start the main loop.
 * @param {string} containerId - DOM id of the shell container element.
 * @returns {JsShellExtended} The initialized shell instance.
 */
export function jsShellHolder(containerId) {
  // Initialize terminal
  const shell = new JsShellExtended(containerId, {
    // Initial prompt; will be updated dynamically based on virtual cwd
    promptPS: '<span style="color: #00ff00;">user@jsshell</span>:<span style="color: #0080ff;">/</span>$ ',
    height: '96vh'
  });

  // Ensure /sys exists (best effort). This is where shell state is stored.
  ensureDirPath(SYS_DIR);

  // Command history (stored in VFS: /sys/history.json)
  let commandHistory = [];
  const historyLimit = readHistoryLimitFromVfs();
  {
    const parsed = readJsonFromVfs(SYS_HISTORY_PATH, null);
    if (Array.isArray(parsed)) {
      commandHistory = parsed.filter((item) => typeof item === 'string');
    }
  }

  // Shell configuration (stored in VFS: /sys/config.json)
  let config = { ...DEFAULT_CONFIG };
  {
    const parsed = readJsonFromVfs(SYS_CONFIG_PATH, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      config = { ...DEFAULT_CONFIG, ...parsed };
    }
  }

  // Environment (stored in VFS: /sys/env.json)
  //
  // This is intentionally lightweight: it's just a JSON object stored in the
  // VFS so it persists with the rest of the filesystem. Two keys are relevant
  // to command resolution:
  //   - env.PATH: string[] of VFS folders (e.g. ["/bin"]).
  //   - env.ALIAS: Record<string, string> mapping alias -> expansion.
  //
  // Resolution order (high level):
  //   1) built-in commands (commandModules)
  //   2) explicit scripts via ./file.js
  //   3) fallback: alias expansion, then PATH search for <cmd>.js
  //
  // The PATH fallback executes the resolved VFS script via the same mechanism
  // as ./file.js (see programs/runScript.js): `main(shell, command, args)`
  // convention is supported.
  let env = { PATH: ['/bin'], ALIAS: {} };
  {
    const parsedEnv = readJsonFromVfs(SYS_ENV_PATH, null);
    if (parsedEnv && typeof parsedEnv === 'object' && !Array.isArray(parsedEnv)) {
      env = { ...env, ...parsedEnv };
    }
  }

  if (!Array.isArray(env.PATH)) env.PATH = ['/bin'];
  if (!env.ALIAS || typeof env.ALIAS !== 'object' || Array.isArray(env.ALIAS)) env.ALIAS = {};

  // Ensure /bin is on PATH by default.
  if (!env.PATH.includes('/bin')) env.PATH.push('/bin');

  const persistEnv = () => {
    writeJsonToVfs(SYS_ENV_PATH, env);
  };

  // Persist back normalized defaults (helps when init wrote an older shape).
  persistEnv();

  function expandAliasesOnce(command, args) {
    const target = env && env.ALIAS ? env.ALIAS[command] : undefined;
    if (typeof target !== 'string' || !target.trim()) {
      return { command, args };
    }
    const parsed = parseCommandLine(target.trim());
    const nextCommand = parsed.command || command;
    const nextArgs = (parsed.args || []).concat(args);
    return { command: nextCommand, args: nextArgs };
  }

  function expandAliases(command, args, maxDepth = 5) {
    let currentCommand = command;
    let currentArgs = args;
    const seen = new Set();

    for (let i = 0; i < maxDepth; i += 1) {
      if (seen.has(currentCommand)) {
        break;
      }
      const expanded = expandAliasesOnce(currentCommand, currentArgs);
      if (expanded.command === currentCommand && expanded.args === currentArgs) {
        break;
      }
      seen.add(currentCommand);
      currentCommand = expanded.command;
      currentArgs = expanded.args;
    }

    return { command: currentCommand, args: currentArgs };
  }

  function joinVfsPath(dir, file) {
    const base = String(dir || '').replace(/\/+$/g, '');
    const leaf = String(file || '').replace(/^\/+/, '');
    return `${base}/${leaf}`;
  }

  function resolveScriptOnPath(commandName) {
    if (!commandName || typeof commandName !== 'string') return null;
    // Only treat plain command tokens as PATH candidates (no slashes).
    if (commandName.includes('/')) return null;
    const fileName = commandName.endsWith('.js') ? commandName : `${commandName}.js`;

    const dirs = Array.isArray(env.PATH) ? env.PATH : [];
    for (const dir of dirs) {
      if (typeof dir !== 'string' || !dir.startsWith('/')) continue;
      try {
        const listing = vfs.list(dir);
        if (listing && Array.isArray(listing.files) && listing.files.includes(fileName)) {
          return joinVfsPath(dir, fileName);
        }
      } catch (_) {
        // Ignore missing/unreadable PATH dirs
      }
    }

    return null;
  }

  const persistHistory = () => {
    if (commandHistory.length > historyLimit) {
      const excess = commandHistory.length - historyLimit;
      commandHistory.splice(0, excess);
    }
    writeJsonToVfs(SYS_HISTORY_PATH, commandHistory);
  };

  const persistConfig = () => {
    writeJsonToVfs(SYS_CONFIG_PATH, config);
  };

  const state = {
    historyIndex: -1,
    searchMode: false,
    searchQuery: '',
    completionSession: null
  };

  // Apply initial visual configuration (colors, prompt) using shared helper
  applyConfigVisuals(shell, config);

  // Persist normalized defaults so /sys always has a usable baseline.
  persistEnv();
  persistConfig();
  persistHistory();

  // First-load bootstrap: if there's no VFS yet in localStorage, initialize it
  // immediately.
  let shouldBootstrapInit = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const hasStorageKey = Boolean(window.localStorage.getItem(STORAGE_KEYS.VFS));

      // Important edge case: jsShellHolder persists /sys state (env/config/history)
      // early, which creates a VFS in localStorage that may only contain /sys.
      // Treat that as "empty" so init still auto-creates the base structure.
      const root = vfs.state && vfs.state.root;
      const folders = root && Array.isArray(root.folders) ? root.folders : [];
      const files = root && Array.isArray(root.files) ? root.files : [];
      const nonSysFolders = folders.filter((f) => f && typeof f.name === 'string' && f.name !== 'sys');
      const vfsLooksEmpty = !root || (nonSysFolders.length === 0 && files.length === 0);

      shouldBootstrapInit = !hasStorageKey || vfsLooksEmpty;
    }
  } catch (_) {
    shouldBootstrapInit = false;
  }

  // Register all command handlers here; add more from other command.js files
  // Each entry provides a handler and its own command list for completion.
  const commandModules = [
    { handler: executeHelpCommand, commands: helpCommands },
    { handler: executeClsCommand, commands: clsCommands },
    { handler: executeExitCommand, commands: exitCommands },
    { handler: executeDateCommand, commands: dateCommands },
    { handler: executeMkdirCommand, commands: mkdirCommands },
    { handler: executeLsCommand, commands: lsCommands },
    { handler: executeFindCommand, commands: findCommands },
    { handler: executeGrepCommand, commands: grepCommands },
    { handler: executeRmdirCommand, commands: rmdirCommands },
    { handler: executeCdCommand, commands: cdCommands },
    { handler: executePwdCommand, commands: pwdCommands },
    { handler: executeCatCommand, commands: catCommands },
    { handler: executeTouchCommand, commands: touchCommands },
    { handler: executeRmCommand, commands: rmCommands },
    { handler: executePrintProgram, commands: printCommands },
    { handler: executeCopyCommand, commands: copyCommands },
    { handler: executeDelayProgram, commands: delayCommands },
    { handler: executeMvCommand, commands: mvCommands },
    // Script execution for ./filename.js
    { handler: executeScriptFile, commands: scriptCommands },
    // init program to create base folder structure and environment
    { handler: executeInitProgram, commands: initCommands },
    // backup and restore programs for localStorage snapshots
    { handler: executeBackupProgram, commands: backupCommands },
    { handler: executeRestoreProgram, commands: restoreCommands },
    // download a VFS file to the user's machine
    { handler: executeDownloadProgram, commands: downloadCommands },
    // upload a local file into the VFS
    { handler: executeUploadProgram, commands: uploadCommands },
    // config command to change prompt, colors and other options
    { handler: createConfigHandler(config, persistConfig), commands: configCommands }
    // add more modules like: { handler: executeExtraCommands, commands: extraCommands },
  ];

  // Aggregate all available commands from registered command modules
  const commands = Array.from(
    new Set(commandModules.flatMap((m) => m.commands || []))
  );

  function collectCommandsFromPath() {
    const out = [];
    const dirs = Array.isArray(env.PATH) ? env.PATH : [];
    for (const dir of dirs) {
      if (typeof dir !== 'string' || !dir.startsWith('/')) continue;
      let listing;
      try {
        listing = vfs.list(dir);
      } catch (_) {
        continue;
      }
      const files = listing && Array.isArray(listing.files) ? listing.files : [];
      for (const name of files) {
        if (typeof name !== 'string') continue;
        if (!name.toLowerCase().endsWith('.js')) continue;
        const base = name.slice(0, -3);
        if (!base) continue;
        out.push(base);
      }
    }
    return out;
  }

  function refreshCommandsFromPath() {
    const existing = new Set(commands);
    for (const cmd of collectCommandsFromPath()) {
      if (!existing.has(cmd)) {
        commands.push(cmd);
        existing.add(cmd);
      }
    }
  }

  // Include PATH-installed VFS programs in command completion.
  refreshCommandsFromPath();

  // Initialize universal key handler extension
  shell.initUniversalKeyHandler({
    commands,
    commandHistory,
    state
  });

  function parseSimpleCommandLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      return { command: '', args: [] };
    }

    // Comments
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return { command: '', args: [] };
    }

    return parseCommandLine(trimmed);
  }

  async function dispatchRegisteredModules(shellInstance, command, args) {
    for (const { handler } of commandModules) {
      const result = await handler(shellInstance, command, args);
      if (!result) {
        continue;
      }

      if (result.handled) {
        if ((command || '').toLowerCase() === 'init') {
          // init can install new scripts into /bin; refresh completion.
          refreshCommandsFromPath();
        }
        return {
          handled: true,
          shouldContinue: result.shouldContinue !== false,
          ok: typeof result.ok === 'boolean' ? result.ok : true,
          error: result.error
        };
      }
    }

    return { handled: false, shouldContinue: true };
  }

  async function dispatchStrict(shellInstance, command, args) {
    // Strict dispatch is used by .jsh scripts:
    // - no alias expansion
    // - no PATH fallback
    // - still supports ./file.js execution

    if (!command) {
      return { ok: true, handled: true, shouldContinue: true };
    }

    let innerCommand = command;
    let innerArgs = Array.isArray(args) ? args : [];

    try {
      const result = await dispatchRegisteredModules(shellInstance, innerCommand, innerArgs);
      if (!result.handled) {
        return { ok: false, handled: false, shouldContinue: true, error: new Error(`Command not found: ${innerCommand}`) };
      }
      if (result.ok === false) {
        return { ok: false, handled: true, shouldContinue: true, error: result.error || new Error(`Execution failed: ${innerCommand}`) };
      }
      return { ok: true, handled: true, shouldContinue: result.shouldContinue };
    } catch (err) {
      return { ok: false, handled: true, shouldContinue: true, error: err };
    }
  }

  async function runJshScript(shellInstance, invokedAs) {
    const cwdPath = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
    const scriptRel = String(invokedAs).slice(2); // strip leading "./"
    const canonicalPath = normalizePathFromCwd(cwdPath, scriptRel);

    let content = '';
    try {
      content = vfs.readFile(canonicalPath);
    } catch (err) {
      shellInstance.print(`exec: ${invokedAs}: ${err.message || err}`);
      shellInstance.print('');
      return { handled: true, shouldContinue: true };
    }

    const lines = String(content).split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const parsed = parseSimpleCommandLine(rawLine);
      if (!parsed.command) {
        continue;
      }

      const r = await dispatchStrict(shellInstance, parsed.command, parsed.args);
      if (!r.ok) {
        shellInstance.print(`jsh: stopped at ${invokedAs}:${i + 1}`);
        shellInstance.print(`jsh: ${rawLine}`);
        shellInstance.print(`jsh: ${String((r.error && r.error.message) || r.error || 'error')}`);
        shellInstance.print('');
        return { handled: true, shouldContinue: true };
      }

      if (!r.shouldContinue) {
        return { handled: true, shouldContinue: false };
      }
    }

    return { handled: true, shouldContinue: true };
  }

  // Main terminal loop
  async function mainLoop() {
    if (shouldBootstrapInit) {
      // Bootstrap init automatically on true first boot.
      await executeInitProgram(shell, 'init', []);
      shouldBootstrapInit = false;
    }

    // ASCII JsShell logo header (monospace friendly)
    if (config.showWelcomeLogo !== false) {
      shell.print('      _      ____ _          _ _ ');
      shell.print('     | | __ / ___| |__   ___| | |');
      shell.print('  _  | |/ _|\\___ \\  _ \\ / _ \\ | |');
      shell.print(' | |_| |\\_ \\ ___)| | | |  __/ | |');
      shell.print('  \\___/ |__/|____/_| |_|\\___|_|_|');
      shell.print('');
    }
    shell.printHTML('Welcome to <a href="www.aldrian.cc">jsshell@aldrian.cc</a>!');
    shell.printHTML('Based on <a href="https://github.com/francoisburdy/js-shell-emulator">francoisburdy/js-shell-emulator</a>, extended in <a href="https://github.com/oaldrian/js-shell-emulator">oaldrian/js-shell-emulator</a>');
    shell.print('Hit Tab for available commands, or just explore...');
    shell.print('');

    await maybePrintUpdateBanner(shell);

    while (true) {
      try {
        // Update prompt to reflect current virtual working directory
        const cwdPath = vfs.getCwdPath();
        shell.setPrompt(buildPromptHtml(config, cwdPath));

        // Update browser tab title to reflect user, host and virtual cwd
        if (typeof document !== 'undefined') {
          const user = config.promptUser || DEFAULT_CONFIG.promptUser;
          const host = config.promptHost || DEFAULT_CONFIG.promptHost;
          document.title = `${user}@${host}:${cwdPath}`;
        }

        const input = await shell.input('');
        const trimmedInput = input.trim();
        const parsedInput = parseCommandLine(trimmedInput);
        let command = parsedInput.command || '';
        let args = parsedInput.args || [];

        // Alias expansion happens early so aliases can point to built-ins,
        // or PATH-resolved scripts.
        ({ command, args } = expandAliases(command, args));

        // Add to history if not empty and not duplicate
        if (input.trim() && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== input.trim())) {
          commandHistory.push(input.trim());
          persistHistory();
        }
        state.historyIndex = -1; // Reset history index
        state.searchMode = false; // Exit search mode
        state.searchQuery = '';
        state.completionSession = null; // Reset completion session
        shell.hideHint(); // Hide any active hints

        // Blank line: do nothing.
        // This used to be handled by programs/empty.js, but keeping it here
        // avoids an extra command module whose only purpose is no-op.
        if (!trimmedInput) {
          continue;
        }

        // Dispatch command to all registered command handlers
        let handled = false;
        let shouldContinue = true;

        // .jsh scripts: one command per line.
        // They must be invoked explicitly (e.g. ./demo.jsh) and are intentionally
        // NOT discovered via PATH fallback.
        // Inside a .jsh script, each line is dispatched strictly (no alias/PATH
        // resolution) and execution stops on the first error.
        if (command.startsWith('./') && command.endsWith('.jsh')) {
          const res = await runJshScript(shell, command);
          handled = true;
          shouldContinue = res.shouldContinue !== false;
        }

        if (handled) {
          if (!shouldContinue) {
            return;
          }
          continue;
        }

        for (const { handler } of commandModules) {
          const result = await handler(shell, command, args);
          if (!result) {
            continue;
          }

          if (result.handled) {
            handled = true;
            shouldContinue = result.shouldContinue !== false;
            break;
          }
        }

        // PATH script fallback
        //
        // If nothing handled the command, try resolving it as a script name on
        // env.PATH. For example, if /bin is on PATH and /bin/sample.js exists,
        // typing `sample` will run /bin/sample.js.
        //
        // Execution uses the same program convention as ./file.js (see
        // programs/runScript.js). The script receives the original token
        // (e.g. "sample") as its `command` argument.
        if (!handled && command) {
          const scriptPath = resolveScriptOnPath(command);
          if (scriptPath) {
            const result = await executeVfsScript(shell, scriptPath, args, command);
            if (result && result.handled) {
              handled = true;
              shouldContinue = result.shouldContinue !== false;
            }
          }
        }

        // If no handler processed the command and it's not empty, show a default message
        if (!handled && command) {
          shell.print(`Command not found: ${command}`);
          shell.print('Hit Tab for available commands.');
          shell.print('');
        }

        if (!shouldContinue) {
          return;
        }
      } catch (error) {
        shell.print(`Error: ${error.message}`);
        shell.print('');
      }
    }
  }

  mainLoop();

  return shell;
}
