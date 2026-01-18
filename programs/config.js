/*! config.js | Shell configuration program for JsShell */

import { vfs } from '../fs/virtualFileSystem.js';

// Default shell configuration values
const DEFAULT_CONFIG = {
  promptUser: 'jsshell',
  promptHost: 'aldrian.cc',
  promptUserColor: '#859900',
  promptPathColor: '#268BD2',
  showWelcomeLogo: true,
  textColor: '#2AA198',
  backgroundColor: '#002B36',
  linkColor: '#268BD2'
};

const configCommands = ['config'];

/**
 * Build the HTML prompt based on config and current working directory.
 * @param {Object} config
 * @param {string} cwdPath
 * @returns {string}
 */
function buildPromptHtml(config, cwdPath) {
  const user = config.promptUser || DEFAULT_CONFIG.promptUser;
  const host = config.promptHost || DEFAULT_CONFIG.promptHost;
  const userColor = config.promptUserColor || DEFAULT_CONFIG.promptUserColor;
  const pathColor = config.promptPathColor || DEFAULT_CONFIG.promptPathColor;
  const path = cwdPath || '/';

  return (
    `<span style="color: ${userColor};">${user}@${host}</span>:` +
    `<span style="color: ${pathColor};">${path}</span>$ `
  );
}

/**
 * Apply visual aspects of the configuration to the shell: text/background
 * colors and the prompt HTML (based on the current virtual cwd).
 * Central helper so startup, config changes, and resets all go through
 * the same path.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {Object} config
 */
function applyConfigVisuals(shell, config) {
  if (config.backgroundColor) {
    shell.setBackgroundColor(config.backgroundColor);
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.backgroundColor = config.backgroundColor;
    }
  }
  if (config.textColor) {
    shell.setTextColor(config.textColor);
  }

  // Hyperlink color (affects printHTML() output containing <a> tags)
  if (typeof document !== 'undefined') {
    const linkColor = config.linkColor || DEFAULT_CONFIG.linkColor;
    const styleId = 'jsshell-link-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      .jsShell a { color: ${linkColor}; }
      .jsShell a:visited { color: ${linkColor}; }
      .jsShell a:hover { filter: brightness(1.15); }
    `;
  }

  const cwdPath = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  shell.setPrompt(buildPromptHtml(config, cwdPath));
}

/**
 * Create a handler function for the `config` command that operates on
 * the provided config object and persists changes via persistConfig.
 * @param {Object} config
 * @param {Function} persistConfig
 * @returns {(shell: import('../jsShell.js').JsShell, command: string, args: string[]) => Promise<{handled: boolean, shouldContinue: boolean}>}
 */
function createConfigHandler(config, persistConfig) {
  return async function executeConfigProgram(shell, command, args) {
    if (command !== 'config') {
      return { handled: false, shouldContinue: true };
    }

    const sub = (args[0] || 'show').toLowerCase();

    const printConfig = () => {
      shell.print('Current shell configuration:');
      shell.print(JSON.stringify(config, null, 2));
      shell.print('');
    };

    const printHelp = () => {
      shell.print('Usage:');
      shell.print('  config                 # show config and basic help');
      shell.print('  config show            # show config');
      shell.print('  config get <key>       # show value of a key');
      shell.print('  config set <key> <val> # set a key (strings, colors, booleans)');
      shell.print('  config reset           # reset to defaults');
      shell.print('');
      shell.print('Common keys: promptUser, promptHost, promptUserColor, promptPathColor,');
      shell.print('             textColor, backgroundColor, linkColor, showWelcomeLogo');
      shell.print('');
    };

    if (sub === 'show' || sub === 'help') {
      printConfig();
      printHelp();
      return { handled: true, shouldContinue: true };
    }

    if (sub === 'get') {
      const key = args[1];
      if (!key) {
        shell.print('config get: missing <key>');
        return { handled: true, shouldContinue: true };
      }
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        shell.print(`${key} = ${JSON.stringify(config[key])}`);
      } else {
        shell.print(`config: unknown key "${key}"`);
      }
      return { handled: true, shouldContinue: true };
    }

    if (sub === 'set') {
      const key = args[1];
      const rawValue = args.slice(2).join(' ');
      if (!key || !rawValue) {
        shell.print('config set: usage: config set <key> <value>');
        return { handled: true, shouldContinue: true };
      }

      let newValue = rawValue;
      const current = config[key];

      // Basic type inference based on current value or common boolean keys
      const lower = rawValue.toLowerCase();
      if (typeof current === 'boolean' || key === 'showWelcomeLogo') {
        newValue = (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on');
      } else if (typeof current === 'number') {
        const num = Number(rawValue);
        newValue = Number.isNaN(num) ? rawValue : num;
      }

      config[key] = newValue;
      persistConfig();
      applyConfigVisuals(shell, config);
      shell.print(`config: set ${key} = ${JSON.stringify(newValue)}`);
      return { handled: true, shouldContinue: true };
    }

    if (sub === 'reset') {
      Object.keys(config).forEach((k) => { delete config[k]; });
      Object.assign(config, DEFAULT_CONFIG);
      persistConfig();
      applyConfigVisuals(shell, config);
      shell.print('config: reset to defaults');
      return { handled: true, shouldContinue: true };
    }

    // Unknown subcommand: show help
    shell.print(`config: unknown subcommand "${sub}"`);
    shell.print('');
    printHelp();
    return { handled: true, shouldContinue: true };
  };
}

export { DEFAULT_CONFIG, configCommands, buildPromptHtml, applyConfigVisuals, createConfigHandler };
