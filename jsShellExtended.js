/*! JsShellExtended.js | Universal key handler extension for JsShell */

import { JsShell } from './jsShell.js';
import { vfs } from './fs/virtualFileSystem.js';
import { tokenizeCommandLine, quoteArgIfNeeded } from './utils/commandLine.js';

const SYS_ENV_PATH = '/sys/env.json';

class JsShellExtended extends JsShell {
  _getEnvFromStorage() {
    try {
      const raw = vfs.readFile(SYS_ENV_PATH);
      if (!raw) return {};
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  _getPathScriptCommands() {
    const now = Date.now();
    if (this._pathCommandCache && (now - this._pathCommandCache.at) < 1000) {
      return this._pathCommandCache.items;
    }

    const env = this._getEnvFromStorage();
    const dirs = Array.isArray(env.PATH) ? env.PATH : ['/bin'];
    const out = new Set();

    for (const dir of dirs) {
      if (typeof dir !== 'string') continue;
      try {
        const listing = vfs.list(dir);
        const files = listing && Array.isArray(listing.files) ? listing.files : [];
        for (const file of files) {
          if (typeof file !== 'string') continue;
          if (!file.endsWith('.js')) continue;
          out.add(file.slice(0, -3));
        }
      } catch (_) {
        // Ignore missing/unreadable PATH dirs
      }
    }

    const items = Array.from(out).sort((a, b) => a.localeCompare(b));
    this._pathCommandCache = { at: now, items };
    return items;
  }

  /**
   * Initialize the universal key handler for a shell instance.
   * @param {Object} options
   * @param {string[]} options.commands - List of available built-in commands.
   *   Note: command completion also includes scripts discoverable on env.PATH.
   * @param {string[]} options.commandHistory - Shared command history array.
    * @param {{historyIndex: number, searchMode: boolean, searchQuery: string, completionSession?: Object}} options.state - Shared state object.
   */
  initUniversalKeyHandler({ commands, commandHistory, state }) {
    this.setKeyHandler((keyEvent, shellInstance) => {
      const { code, ctrlKey, currentInput } = keyEvent;


      // Ctrl+D - quick exit (only when input is empty)
      if (ctrlKey && code === 'KeyD') {
        if (currentInput.trim() === '') {
          shellInstance.print('exit');
          shellInstance.print('Goodbye! 👋');
          return true;
        }
      }

      // Esc - hide/cancel hint UI; if nothing is active, clear the input.
      // This lets users dismiss Tab completion hints without losing what they typed.
      if (code === 'Escape') {
        const hadTransientUi = Boolean(state.searchMode || state.completionSession);

        state.searchMode = false;
        state.searchQuery = '';
        state.completionSession = null;
        shellInstance.hideHint();

        if (hadTransientUi) {
          return true;
        }
        return '';
      }

      // History navigation with arrow keys
      if (code === 'ArrowUp') {
        if (commandHistory.length > 0) {
          state.historyIndex = Math.min(state.historyIndex + 1, commandHistory.length - 1);
          const command = commandHistory[commandHistory.length - 1 - state.historyIndex];
          return command || currentInput;
        }
        return true;
      }

      if (code === 'ArrowDown') {
        if (state.historyIndex > -1) {
          state.historyIndex = Math.max(state.historyIndex - 1, -1);
          if (state.historyIndex === -1) {
            return '';
          }
          const command = commandHistory[commandHistory.length - 1 - state.historyIndex];
          return command || currentInput;
        }
        return true;
      }

      // Tab completion
      if (code === 'Tab') {
        const direction = (keyEvent.altKey || keyEvent.shiftKey) ? -1 : 1;
        const cycled = this._cycleCompletionSession({ keyEvent, shellInstance, state, direction });
        if (typeof cycled === 'string') {
          return cycled;
        }

        const tokenized = tokenizeCommandLine(currentInput);
        const words = tokenized.tokens.map((t) => t.value);

        // If the user ended with whitespace, they're starting a new argument.
        if (tokenized.endsWithSpace) words.push('');

        // Compute raw span for the current word (used to replace it on completion).
        const lastToken = tokenized.tokens.length ? tokenized.tokens[tokenized.tokens.length - 1] : null;
        const currentWord = words.length ? words[words.length - 1] : '';
        const currentWordRawStart = tokenized.endsWithSpace
          ? currentInput.length
          : (lastToken ? lastToken.rawStart : 0);
        const currentWordRawEnd = tokenized.endsWithSpace
          ? currentInput.length
          : (lastToken ? lastToken.rawEnd : currentInput.length);
        const currentQuote = tokenized.endsWithSpace ? null : (lastToken ? lastToken.quoteChar : null);

        // Complete first word (command)
        if (words.length <= 1) {
          // Special case: ./script.js execution — complete as a path in the cwd
          // when the user starts typing "./".
          if (currentWord.startsWith('./')) {
            return this._startPathCompletionSession({
              shellInstance,
              state,
              currentInput,
              currentWord,
              currentWordRawStart,
              currentWordRawEnd,
              currentQuote
            });
          }
          return this._startCommandCompletionSession({
            shellInstance,
            commands,
            state,
            currentWord
          });
        } else if (words.length === 2 && words[0] === 'hello') {
          // Example of contextual completion with HTML
          const names = ['world', 'user', 'admin', 'guest'];
          const nameMatches = names.filter(name => name.startsWith(currentWord.toLowerCase()));

          if (nameMatches.length > 0) {
            const namesHtml = nameMatches.map(name =>
              `<span style="color: #87ceeb; cursor: pointer;">👤 ${name}</span>`
            ).join('  ');
            shellInstance.showHint(`🎯 <em>Suggested names:</em><br>${namesHtml}`, {
              color: '#ffffff',
              background: 'rgba(135,206,235,0.1)',
              padding: '5px',
              borderRadius: '3px'
            });

            if (nameMatches.length === 1) {
              return words[0] + ' ' + nameMatches[0];
            }
          }
          return currentInput;
        }

        // Path completion for arguments (files and folders)
        if (words.length >= 2) {
          return this._startPathCompletionSession({
            shellInstance,
            state,
            currentInput,
            currentWord,
            currentWordRawStart,
            currentWordRawEnd,
            currentQuote
          });
        }

        return currentInput;
      }

      // Handle typing in search mode
      if (state.searchMode && keyEvent.key.length === 1) {
        state.searchQuery += keyEvent.key;
        const matches = commandHistory.filter(cmd =>
          cmd.toLowerCase().includes(state.searchQuery.toLowerCase())
        );

        if (matches.length > 0) {
          const matchHtml = matches[matches.length - 1];
          const regex = new RegExp(`(${state.searchQuery})`, 'gi');
          const highlightedMatch = matchHtml.replace(regex, '<mark style="background: yellow; color: black; padding: 1px 2px;">$1</mark>');

          shellInstance.updateHint(`
            🔍 <strong style="color: #00ffff;">Found ${matches.length} match${matches.length > 1 ? 'es' : ''}:</strong><br>
            <span style="color: #90ee90; font-family: monospace; background: rgba(0,0,0,0.2); padding: 2px 5px; border-radius: 3px;">${highlightedMatch}</span>
          `);
          return matches[matches.length - 1];
        } else {
          shellInstance.updateHint(`
            🔍 <span style="color: #ff6b6b;">No matches for "<strong>${state.searchQuery}</strong>"</span>
          `);
        }
        return currentInput;
      }

      // Handle backspace in search mode
      if (state.searchMode && code === 'Backspace') {
        state.searchQuery = state.searchQuery.slice(0, -1);
        if (state.searchQuery.length === 0) {
          shellInstance.updateHint(`
            <span style="color: #00ffff; font-size: 1.1em;">🔍</span> 
            <strong style="color: #00ffff;">History Search Mode</strong> 
            <em style="color: #add8e6;">(type to search)</em>
          `);
          return '';
        }
        const matches = commandHistory.filter(cmd =>
          cmd.toLowerCase().includes(state.searchQuery.toLowerCase())
        );

        if (matches.length > 0) {
          const matchHtml = matches[matches.length - 1];
          const regex = new RegExp(`(${state.searchQuery})`, 'gi');
          const highlightedMatch = matchHtml.replace(regex, '<mark style="background: yellow; color: black; padding: 1px 2px;">$1</mark>');

          shellInstance.updateHint(`
            🔍 <strong style="color: #00ffff;">Found ${matches.length} match${matches.length > 1 ? 'es' : ''}:</strong><br>
            <span style="color: #90ee90; font-family: monospace; background: rgba(0,0,0,0.2); padding: 2px 5px; border-radius: 3px;">${highlightedMatch}</span>
          `);
          return matches[matches.length - 1];
        } else {
          shellInstance.updateHint(`
            🔍 <span style="color: #ff6b6b;">No matches for "<strong>${state.searchQuery}</strong>"</span>
          `);
        }
        return currentInput;
      }

      // Clear hints on normal typing (when not in special modes)
      if (!state.searchMode && keyEvent.key.length === 1) {
        shellInstance.hideHint();
        state.completionSession = null;
      }

      // Return false to use default behavior
      return false;
    });

    return this;
  }

  /**
   * Cycle through an existing completion session (command or path) when Tab
   * is pressed again and the input has not changed.
   * @param {{ keyEvent: Object, shellInstance: JsShell, state: Object }} ctx
   * @returns {string|null} New input string if cycled, otherwise null.
   */
  _cycleCompletionSession({ keyEvent, shellInstance, state, direction = 1 }) {
    const session = state.completionSession;
    if (
      !session ||
      !session.active ||
      !session.items ||
      session.items.length <= 1 ||
      keyEvent.currentInput !== session.lastInput
    ) {
      return null;
    }

    const len = session.items.length;
    const delta = direction === -1 ? -1 : 1;
    session.index = (session.index + delta + len) % len;

    if (session.type === 'command') {
      const cmd = session.items[session.index];
      const newInput = cmd + ' ';

      const hintHtml = session.items
        .map((c, idx) => {
          if (idx === session.index) {
            return `<span style="color: #ffff00; font-weight: bold;">[${c}]</span>`;
          }
          return `<span style="color: #90ee90;">${c}</span>`;
        })
        .join('  ');

      shellInstance.showHint(hintHtml, {
        color: '#ffffff',
        background: 'rgba(0,100,0,0.1)',
        padding: '5px',
        borderRadius: '3px'
      });

      session.lastInput = newInput;
      return newInput;
    }

    if (session.type === 'path') {
      const m = session.items[session.index];
      const completedName = m.name + (m.isFolder ? '/' : '');
      const beforeWord = session.beforeWord || '';
      const afterWord = session.afterWord || '';
      const dirPart = session.dirPart || '';
      const completedValue = dirPart + completedName;
      const preferredQuote = session.quoteChar || '"';
      const completedRaw = quoteArgIfNeeded(completedValue, preferredQuote);
      const newInput = beforeWord + completedRaw + afterWord;

      const hintHtml = session.items
        .map((item, idx) => {
          const displayName = item.name + (item.isFolder ? '/' : '');
          if (idx === session.index) {
            return `<span style="color: #ffff00; font-weight: bold;">[${displayName}]</span>`;
          }
          const color = item.isFolder ? '#87ceeb' : '#90ee90';
          return `<span style="color: ${color};">${displayName}</span>`;
        })
        .join('  ');

      shellInstance.showHint(hintHtml, {
        color: '#ffffff',
        background: 'rgba(0,100,0,0.1)',
        padding: '5px',
        borderRadius: '3px'
      });

      session.lastInput = newInput;
      return newInput;
    }

    return null;
  }

  /**
   * Start a completion session (or perform a one-shot completion) for the
   * first word, which is interpreted as a command name.
   * @param {{ shellInstance: JsShell, commands: string[], state: Object, currentWord: string }} ctx
   * @returns {string} New input string (or the original word if unchanged).
   */
  _startCommandCompletionSession({ shellInstance, commands, state, currentWord }) {
    // Merge built-ins with PATH-resolved VFS scripts (e.g. /bin/sample.js => sample)
    const allCommands = Array.from(
      new Set([...(commands || []), ...this._getPathScriptCommands()])
    ).sort((a, b) => a.localeCompare(b));

    const matches = allCommands.filter(cmd => cmd.startsWith(currentWord));

    if (matches.length === 1) {
      shellInstance.hideHint();
      state.completionSession = null;
      return matches[0] + ' ';
    }

    if (matches.length > 1) {
      const firstIndex = 0;
      const firstCommand = matches[firstIndex];
      const newInput = firstCommand + ' ';

      state.completionSession = {
        active: true,
        type: 'command',
        items: matches,
        index: firstIndex,
        lastInput: newInput
      };

      const hintHtml = matches
        .map((cmd, idx) => {
          if (idx === firstIndex) {
            return `<span style="color: #ffff00; font-weight: bold;">[${cmd}]</span>`;
          }
          return `<span style="color: #90ee90;">${cmd}</span>`;
        })
        .join('  ');

      shellInstance.showHint(hintHtml, {
        color: '#ffffff',
        background: 'rgba(0,100,0,0.1)',
        padding: '5px',
        borderRadius: '3px'
      });

      return newInput;
    }

    shellInstance.showHint('<span style="color: #ff6b6b;">❌ No matching commands found</span>', {
      background: 'rgba(255,0,0,0.1)',
      padding: '3px 8px',
      borderRadius: '3px'
    });
    state.completionSession = null;
    return currentWord;
  }

  /**
   * Start a completion session (or perform a one-shot completion) for a
   * path argument, using the virtual filesystem.
   * @param {{ shellInstance: JsShell, state: Object, currentInput: string, currentWord: string }} ctx
   * @returns {string} New input string after completion.
   */
  _startPathCompletionSession({ shellInstance, state, currentInput, currentWord, currentWordRawStart, currentWordRawEnd, currentQuote }) {
    const lastSlashIndex = currentWord.lastIndexOf('/');
    const dirPart = lastSlashIndex === -1 ? '' : currentWord.slice(0, lastSlashIndex + 1); // include '/'
    const namePart = lastSlashIndex === -1 ? currentWord : currentWord.slice(lastSlashIndex + 1);

    const listTarget = dirPart
      ? dirPart.slice(0, -1) || '/'
      : '.';

    try {
      const { folders, files } = vfs.list(listTarget);
      const candidates = [
        ...folders.map((name) => ({ name, isFolder: true })),
        ...files.map((name) => ({ name, isFolder: false }))
      ];

      const matches = candidates.filter((c) => c.name.startsWith(namePart));

      if (matches.length === 0) {
        shellInstance.showHint('<span style="color: #ff6b6b;">❌ No matching files or folders found</span>', {
          background: 'rgba(255,0,0,0.1)',
          padding: '3px 8px',
          borderRadius: '3px'
        });
        state.completionSession = null;
        return currentInput;
      }

      const beforeWord = currentInput.slice(0, currentWordRawStart);
      const afterWord = currentInput.slice(currentWordRawEnd);

      if (matches.length === 1) {
        shellInstance.hideHint();
        const m = matches[0];
        const completedName = m.name + (m.isFolder ? '/' : '');
        const newWordValue = dirPart + completedName;
        const preferredQuote = currentQuote || '"';
        const newWord = quoteArgIfNeeded(newWordValue, preferredQuote);
        state.completionSession = null;
        return beforeWord + newWord + afterWord;
      }

      const firstIndex = 0;
      const firstMatch = matches[firstIndex];
      const completedName = firstMatch.name + (firstMatch.isFolder ? '/' : '');
      const newWordValue = dirPart + completedName;
      const preferredQuote = currentQuote || '"';
      const newWord = quoteArgIfNeeded(newWordValue, preferredQuote);
      const newInput = beforeWord + newWord + afterWord;

      state.completionSession = {
        active: true,
        type: 'path',
        items: matches,
        index: firstIndex,
        beforeWord,
        afterWord,
        dirPart,
        quoteChar: currentQuote,
        lastInput: newInput
      };

      const hintHtml = matches
        .map((m, idx) => {
          const displayName = m.name + (m.isFolder ? '/' : '');
          if (idx === firstIndex) {
            return `<span style="color: #ffff00; font-weight: bold;">[${displayName}]</span>`;
          }
          const color = m.isFolder ? '#87ceeb' : '#90ee90';
          return `<span style="color: ${color};">${displayName}</span>`;
        })
        .join('  ');

      shellInstance.showHint(hintHtml, {
        color: '#ffffff',
        background: 'rgba(0,100,0,0.1)',
        padding: '5px',
        borderRadius: '3px'
      });

      return newInput;
    } catch (err) {
      shellInstance.showHint(
        `<span style="color: #ff6b6b;">❌ Completion error: ${String(err.message || err)}</span>`,
        { background: 'rgba(255,0,0,0.1)', padding: '3px 8px', borderRadius: '3px' }
      );
      state.completionSession = null;
      return currentInput;
    }
  }
}

export { JsShellExtended };
