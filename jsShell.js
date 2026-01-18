/*! jsShell.js | https://github.com/francoisburdy/js-shell-emulator */

class JsShell {
  // Prompt types
  static PROMPT_INPUT = 1;
  static PROMPT_PASSWORD = 2;
  static PROMPT_CONFIRM = 3;
  static PROMPT_PAUSE = 4;

  constructor(container, options = {}) {
    if (typeof container === 'string') {
      if (container.charAt(0) === '#') {
        container = container.substring(1);
      }
      this.containerNode = document.getElementById(container);
      if (!this.containerNode) {
        throw new Error(`Failed instantiating JsShell object: dom node with id "${container}" not found in document.`);
      }
    } else if (container instanceof Element) {
      this.containerNode = container;
    } else {
      throw new Error('JsShell constructor requires parameter "container" to be a dom Element or node string ID');
    }

    this.html = document.createElement('div');
    this.html.setAttribute('tabindex', 0);
    this.html.className = options.className || 'jsShell';
    this._innerWindow = document.createElement('div');
    this._output = document.createElement('p');
    this._promptPS1 = document.createElement('span');
    this._inputLine = document.createElement('span'); // the span element where the users input is put
    this.cursorType = options.cursorType || 'large';
    this.cursorSpeed = options.cursorSpeed || 500;
    this.makeCursor();
    this._input = document.createElement('div'); // the full element administering the user input, including cursor
    this._shouldBlinkCursor = true;
    this.cursorTimer = null;
    this._input.style.position = 'relative';
    this._input.appendChild(this._promptPS1);
    this._input.appendChild(this._inputLine);
    this._input.appendChild(this._cursor);

    // Hidden measurement span used to position the cursor according to caret
    this._cursorMeasure = document.createElement('span');
    this._cursorMeasure.style.visibility = 'hidden';
    this._cursorMeasure.style.position = 'absolute';
    this._cursorMeasure.style.whiteSpace = 'pre';
    this._input.appendChild(this._cursorMeasure);

    // Overlay span to recolor the character under the cursor when visible
    this._cursorCharOverlay = document.createElement('span');
    this._cursorCharOverlay.style.position = 'absolute';
    this._cursorCharOverlay.style.whiteSpace = 'pre';
    this._cursorCharOverlay.style.pointerEvents = 'none';
    this._cursorCharOverlay.style.color = '#000';
    this._cursorCharOverlay.style.display = 'none';
    this._input.appendChild(this._cursorCharOverlay);

    // Create temporary hint area below input line
    this._hintArea = document.createElement('div');
    this._hintArea.className = 'hint-area';
    this._hintArea.style.display = 'none';
    this._hintArea.style.marginTop = '5px';
    this._hintArea.style.marginLeft = '0px';
    this._hintArea.style.fontSize = '0.9em';
    this._hintArea.style.opacity = '0.7';
    this._hintArea.style.whiteSpace = 'pre-wrap';

    this._innerWindow.appendChild(this._output);
    this._innerWindow.appendChild(this._input);
    this._innerWindow.appendChild(this._hintArea);
    this.html.appendChild(this._innerWindow);

    // Persistent status line area at the bottom of the shell, for
    // programs to show controls or state. It is separate from the
    // transient hint area used by completions and help.
    this._statusLine = document.createElement('div');
    this._statusLine.className = 'status-line';
    this._statusLine.style.display = 'none';
    this._statusLine.style.marginTop = '4px';
    this._statusLine.style.paddingTop = '2px';
    this._statusLine.style.borderTop = '1px solid rgba(255,255,255,0.2)';
    this._statusLine.style.fontSize = '0.85em';
    this._statusLine.style.opacity = '0.8';
    this._statusLine.style.position = 'sticky';
    this._statusLine.style.bottom = '0';
    this._statusLine.style.background = 'inherit';
    this.html.appendChild(this._statusLine);

    // Universal callback for key handling (base handler plus stack)
    this.onKeyHandler = null;
    this._baseKeyHandler = null;
    this._keyHandlerStack = [];
    this._pendingKeyReads = [];

    this.setBackgroundColor(options.backgroundColor || '#000')
      .setFontFamily(options.fontFamily || 'Ubuntu Mono, Monaco, Courier, monospace')
      .setTextColor(options.textColor || '#fff')
      .setTextSize(options.textSize || '1em')
      .setForceFocus(options.forceFocus !== false)
      .setPrompt(options.promptPS || '')
      .setWidth(options.width || '100%')
      .setHeight(options.height || '300px')
      .setMargin(options.margin || '0');

    this.html.style.overflowY = options.overflow || 'auto';
    this.html.style.whiteSpace = options.whiteSpace || 'break-spaces';
    this._innerWindow.style.padding = options.padding || '10px';
    this._input.style.margin = '0';
    this._output.style.margin = '0';
    this._input.style.display = 'none';

    this.containerNode.innerHTML = '';
    this.containerNode.appendChild(this.html);

    // Stack used for screen control helpers (fullscreen/line mode)
    this._screenStack = [];

    // Stack used for program lifecycle hooks (enter/exit) so programs can
    // temporarily override prompt and colors and then restore them.
    this._programStack = [];

    // Hidden measurement cell used to compute character cell size for
    // viewport rows/columns helpers.
    this._measureCell = document.createElement('span');
    this._measureCell.textContent = 'M';
    this._measureCell.style.visibility = 'hidden';
    this._measureCell.style.position = 'absolute';
    this._measureCell.style.whiteSpace = 'pre';
    this._innerWindow.appendChild(this._measureCell);
  }

  makeCursor() {
    if (this.cursorType === 'large') {
      this._cursor = document.createElement('span');
      this._cursor.innerHTML = 'O'; // put something in the cursor...
    } else {
      this._cursor = document.createElement('div');
      this._cursor.style.borderRightStyle = 'solid';
      this._cursor.style.borderRightColor = 'white';
      this._cursor.style.height = '1em';
      this._cursor.style.borderRightWidth = '3px';
      this._cursor.style.paddingTop = '0.15em';
      this._cursor.style.paddingBottom = '0.15em';
      this._cursor.style.position = 'absolute';
      this._cursor.style.zIndex = '1';
      this._cursor.style.marginTop = '-0.15em';
    }
    this._cursor.className = 'cursor';
    this._cursor.style.display = 'none'; // then hide it
  }

  print(message) {
    const newLine = document.createElement('div');
    newLine.textContent = message;
    this._output.appendChild(newLine);
    this.scrollBottom();
    return this;
  }

  newLine() {
    const newLine = document.createElement('br');
    this._output.appendChild(newLine);
    this.scrollBottom();
    return this;
  }

  write(message) {
    const newLine = document.createElement('span');
    newLine.innerHTML = `${message}`;
    this._output.appendChild(newLine);
    this.scrollBottom();
    return this;
  }

  async type(message, speed = 50) {
    const newLine = document.createElement('span');
    newLine.style.borderRight = `${this.cursorType === 'large' ? '9px' : '3px'} solid ${this._cursor.style.color}`;
    this._output.appendChild(newLine);
    const timeout = (ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    };
    for await (const char of message) {
      await timeout(speed);
      newLine.textContent += char;
      this.scrollBottom();
    }
    newLine.style.borderRight = 'none';
  }

  printHTML(content) {
    const newLine = document.createElement('div');
    newLine.innerHTML = `${content}`;
    this._output.appendChild(newLine);
    this.scrollBottom();
    return this;
  }

  fireCursorInterval() {
    if (this.cursorTimer) {
      clearTimeout(this.cursorTimer);
    }
    this.cursorTimer = setTimeout(() => {
      if (this._shouldBlinkCursor) {
        const nextVisibility = this._cursor.style.visibility === 'visible' ? 'hidden' : 'visible';
        this._cursor.style.visibility = nextVisibility;
        if (this._cursorCharOverlay) {
          // Only show overlay when there is a character under the cursor
          if (this._cursorCharOverlay.dataset.hasChar === 'true') {
            this._cursorCharOverlay.style.visibility = nextVisibility;
          } else {
            this._cursorCharOverlay.style.visibility = 'hidden';
          }
        }
        this.fireCursorInterval();
      } else {
        this._cursor.style.visibility = 'visible';
        if (this._cursorCharOverlay) {
          if (this._cursorCharOverlay.dataset.hasChar === 'true') {
            this._cursorCharOverlay.style.visibility = 'visible';
          } else {
            this._cursorCharOverlay.style.visibility = 'hidden';
          }
        }
      }
    }, this.cursorSpeed);
  };

  scrollBottom() {
    this.html.scrollTop = this.html.scrollHeight;
    return this;
  }

  // Method to show temporary hint below input line
  showHint(message, style = {}) {
    this._hintArea.innerHTML = message;
    this._hintArea.style.display = 'block';

    // Apply custom styles
    Object.keys(style).forEach(key => {
      this._hintArea.style[key] = style[key];
    });

    this.scrollBottom();
    return this;
  }

  // Method to hide hint area
  hideHint() {
    this._hintArea.style.display = 'none';
    return this;
  }

  // Method to update hint content without showing/hiding
  updateHint(message) {
    this._hintArea.innerHTML = message;
    return this;
  }

  // Check if hint is currently visible
  isHintVisible() {
    return this._hintArea.style.display !== 'none';
  }

  // Method to update current input (used in key handler)
  updateInput(newValue, inputField) {
    this._inputLine.textContent = newValue;
    inputField.value = newValue;
    this._updateCursorPosition(inputField);
    return this;
  }

  // Update visual cursor position to match the actual caret
  _updateCursorPosition(inputField) {
    if (!inputField || !this._cursor || !this._cursorMeasure) {
      return;
    }

    const value = inputField.value || '';
    const caretIndex = typeof inputField.selectionStart === 'number'
      ? inputField.selectionStart
      : value.length;

    // Mirror text up to caret, keeping spaces visible
    const beforeCaret = value.slice(0, caretIndex).replace(/ /g, '\u00a0');
    this._cursorMeasure.textContent = beforeCaret;

    const promptWidth = this._promptPS1.offsetWidth || 0;
    const textWidth = this._cursorMeasure.offsetWidth || 0;

    const left = promptWidth + textWidth;
    this._cursor.style.position = 'absolute';
    this._cursor.style.left = `${left}px`;
    this._cursor.style.top = `${this._promptPS1.offsetTop || 0}px`;

    // Position and configure character overlay under the cursor
    if (this._cursorCharOverlay) {
      if (caretIndex < value.length) {
        const ch = value.charAt(caretIndex) === ' ' ? '\u00a0' : value.charAt(caretIndex);
        this._cursorCharOverlay.textContent = ch;
        this._cursorCharOverlay.style.left = `${left}px`;
        this._cursorCharOverlay.style.top = `${this._promptPS1.offsetTop || 0}px`;
        this._cursorCharOverlay.dataset.hasChar = 'true';
        this._cursorCharOverlay.style.display = 'block';

        // Sync overlay visibility with current cursor visibility
        this._cursorCharOverlay.style.visibility = this._cursor.style.visibility === 'hidden'
          ? 'hidden'
          : 'visible';
      } else {
        this._cursorCharOverlay.dataset.hasChar = 'false';
        this._cursorCharOverlay.style.display = 'none';
      }
    }
  }

  async _prompt(message = '', promptType) {
    return new Promise(async(resolve) => {
      const shouldDisplayInput = (promptType === JsShell.PROMPT_INPUT || promptType === JsShell.PROMPT_CONFIRM);
      const inputField = document.createElement('input');
      inputField.setAttribute('autocapitalize', 'none');
      inputField.style.position = 'relative';
      inputField.style.zIndex = '-100';
      inputField.style.outline = 'none';
      inputField.style.border = 'none';
      inputField.style.opacity = '0';
      inputField.style.top = '0'; // prevents from viewport scroll moves

      this._inputLine.textContent = '';
      this._input.style.display = 'block';
      this.html.appendChild(inputField);
      this.fireCursorInterval();

      // Show input message
      if (message.length) {
        if (promptType !== JsShell.PROMPT_PAUSE) {
          this.printHTML(promptType === JsShell.PROMPT_CONFIRM ? `${message} (y/n)` : message);
        }
      }

      inputField.onblur = () => {
        this._cursor.style.display = 'none';
      };

      inputField.onfocus = () => {
        inputField.value = this._inputLine.textContent;
        this._cursor.style.display = 'inline-block';
        this._updateCursorPosition(inputField);
      };

      this.html.onclick = () => {
        if (this.shouldFocus()) {
          inputField.focus();
        }
      };

      inputField.onkeydown = async (e) => {
        // Universal key handler
        if (this.onKeyHandler) {
          const keyEvent = {
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            currentInput: inputField.value,
            promptType: promptType,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation()
          };

          let result = this.onKeyHandler(keyEvent, this);
          // check if this pomise await it
          if (result instanceof Promise) {
            result = await result;
          }

          // If handler returns a string, update input
          if (typeof result === 'string') {
            this.updateInput(result, inputField);
            e.preventDefault();
            return;
          }

          // If handler returns true, the event is handled
          if (result === true) {
            e.preventDefault();
            return;
          }

          // Notify any pending readKey listeners
          this._notifyReadKeyListeners(keyEvent);
        }

        // Default behavior: let arrow keys move the caret, but
        // prevent Tab from leaving the input so we can use it
        // exclusively for completions in the key handler.
        if (e.code === 'Tab') {
          e.preventDefault();
        }

        // Keep cursor visible while active typing
        this._cursor.style.visibility = 'visible';

        // Update visual cursor position on keydown (for arrows, Home/End, etc.)
        this._updateCursorPosition(inputField);
      };

      inputField.onkeyup = (e) => {
        this.fireCursorInterval();
        const inputValue = inputField.value;
        if (shouldDisplayInput && !this.isKeyEnter(e)) {
          this._inputLine.textContent = inputField.value;
        }

         // Reflect caret position after keyup as well
        this._updateCursorPosition(inputField);

        if (promptType === JsShell.PROMPT_CONFIRM && !this.isKeyEnter(e)) {
          if (!this.isKeyYorN(e)) { // PROMPT_CONFIRM accept only "Y" and "N"
            this._inputLine.textContent = inputField.value = '';
            return;
          }
          if (this._inputLine.textContent.length > 1) { // PROMPT_CONFIRM accept only one character
            this._inputLine.textContent = inputField.value = this._inputLine.textContent.substr(-1);
          }
        }

        if (promptType === JsShell.PROMPT_PAUSE) {
          inputField.blur();
          this.html.removeChild(inputField);
          this.scrollBottom();
          resolve();
          return;
        }

        if (this.isKeyEnter(e)) {
          if (promptType === JsShell.PROMPT_CONFIRM) {
            if (!inputValue.length) { // PROMPT_CONFIRM doesn't accept empty string. It requires answer.
              return;
            }
          }
          this._input.style.display = 'none';
          this.hideHint(); // Hide hint when submitting
          if (shouldDisplayInput) {
            this.printHTML(this._promptPS1.innerHTML + inputValue);
          }
          if (promptType === JsShell.PROMPT_CONFIRM) {
            const confirmChar = inputValue.toUpperCase()[0];
            if (confirmChar === 'Y') {
              resolve(true);
            } else if (confirmChar === 'N') {
              resolve(false);
            } else {
              throw new Error(`PROMPT_CONFIRM failed: Invalid input (${confirmChar}})`);
            }
          } else {
            resolve(inputValue);
          }
          this.html.removeChild(inputField); // remove input field in the end of each callback
          this.scrollBottom(); // scroll to the bottom of the terminal
        }
      };
      if (this.shouldFocus()) {
        inputField.focus();
      }
    });
  }

  async expect(cmdList, inputMessage, notFoundMessage) {
    let cmd = await this.input(inputMessage);
    while (!cmdList.includes(cmd)) {
      cmd = await this.input(notFoundMessage);
    }
    return cmd;
  }

  async input(message) {
    return await this._prompt(message, JsShell.PROMPT_INPUT);
  }

  async pause(message) {
    this._promptPS1_backup = this._promptPS1.innerHTML;
    this.setPrompt(message);

    await this._prompt(message, JsShell.PROMPT_PAUSE);

    this.setPrompt(this._promptPS1_backup);
    this._promptPS1_backup = '';
  }

  async password(message) {
    return await this._prompt(message, JsShell.PROMPT_PASSWORD);
  }

  async confirm(message) {
    return await this._prompt(message, JsShell.PROMPT_CONFIRM);
  }

  clear() {
    this._output.innerHTML = '';
    return this;
  }

  // Program lifecycle & key handling patterns --------------------------------

  // Recommended pattern for long-running "programs" that temporarily take
  // over the shell (full-screen ASCII UIs, editors, dashboards, etc.):
  //
  //   async function runMyProgram(shell) {
  //     // 1) Enter program mode to snapshot prompt/colors and optionally
  //     //    set program-specific visuals.
  //     shell.enterProgramMode({
  //       prompt: 'myprog> ',
  //       textColor: '#00ff00',
  //       backgroundColor: '#000000'
  //     });
  //
  //     // 2) Optionally take over the screen. This snapshots the current
  //     //    output, hint area, and status line so they can be restored.
  //     shell.enterFullscreenMode();
  //
  //     // 3) Install a temporary key handler on top of the universal
  //     //    handler. Always keep a reference so you can pop it safely.
  //     const handler = (keyEvent, shellInstance) => {
  //       // Return: false to fall back to base handler,
  //       //          true to indicate "handled with no input change",
  //       //          string to replace the current input line.
  //       return false;
  //     };
  //     shell.pushKeyHandler(handler);
  //
  //     try {
  //       // 4) Run your main loop here (draw UI, use readKey(), etc.).
  //       //    Use "await shell.readKey(...)" for ad-hoc key reads
  //       //    instead of installing more handlers when possible.
  //     } finally {
  //       // 5) ALWAYS unwind in reverse order, even on error:
  //       //    - remove your temporary key handler
  //       //    - exit fullscreen (restore previous screen)
  //       //    - exit program mode (restore prompt/colors)
  //       shell.popKeyHandler(handler);
  //       shell.exitFullscreenMode();
  //       shell.exitProgramMode();
  //     }
  //   }

  // Program lifecycle helpers ------------------------------------------------

  // Enter program mode by snapshotting prompt and colors so they can be
  // restored later. Optional overrides allow programs to set up a custom
  // prompt or colors for their duration.
  enterProgramMode({ prompt, textColor, backgroundColor } = {}) {
    const snapshot = {
      promptHTML: this._promptPS1.innerHTML,
      textColor: this.html.style.color,
      backgroundColor: this.html.style.background
    };
    this._programStack.push(snapshot);

    if (typeof prompt === 'string') {
      this.setPrompt(prompt);
    }
    if (typeof textColor === 'string') {
      this.setTextColor(textColor);
    }
    if (typeof backgroundColor === 'string') {
      this.setBackgroundColor(backgroundColor);
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.backgroundColor = backgroundColor;
      }
    }
    return this;
  }

  // Exit program mode and restore the most recently saved prompt and colors.
  exitProgramMode() {
    if (!this._programStack || this._programStack.length === 0) {
      return this;
    }
    const snapshot = this._programStack.pop();
    if (snapshot.promptHTML !== undefined) {
      this._promptPS1.innerHTML = snapshot.promptHTML;
    }
    if (snapshot.textColor !== undefined) {
      this.setTextColor(snapshot.textColor);
    }
    if (snapshot.backgroundColor !== undefined) {
      this.setBackgroundColor(snapshot.backgroundColor);
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.backgroundColor = snapshot.backgroundColor;
      }
    }
    return this;
  }

  // Save the current screen (output, hint area, status line, prompt) so
  // programs can take over the screen (e.g. fullscreen ASCII UIs) and
  // later restore it. If clear is true, the visible output is cleared
  // after saving.
  pushScreen({ clear = true } = {}) {
    const snapshot = {
      outputHTML: this._output.innerHTML,
      hintHTML: this._hintArea ? this._hintArea.innerHTML : '',
      hintVisible: this._hintArea ? this._hintArea.style.display !== 'none' : false,
      statusHTML: this._statusLine ? this._statusLine.innerHTML : '',
      statusVisible: this._statusLine ? this._statusLine.style.display !== 'none' : false,
      promptHTML: this._promptPS1.innerHTML
    };
    this._screenStack.push(snapshot);

    if (clear) {
      this.clear();
      if (this._hintArea) {
        this._hintArea.innerHTML = '';
        this._hintArea.style.display = 'none';
      }
      if (this._statusLine) {
        this._statusLine.innerHTML = '';
        this._statusLine.style.display = 'none';
      }
    }
    return this;
  }

  // Restore the most recently saved screen snapshot created by pushScreen.
  popScreen() {
    if (!this._screenStack || this._screenStack.length === 0) {
      return this;
    }
    const snapshot = this._screenStack.pop();
    this._output.innerHTML = snapshot.outputHTML;
    if (this._hintArea) {
      this._hintArea.innerHTML = snapshot.hintHTML;
      this._hintArea.style.display = snapshot.hintVisible && snapshot.hintHTML ? 'block' : 'none';
    }
    if (this._statusLine) {
      this._statusLine.innerHTML = snapshot.statusHTML || '';
      this._statusLine.style.display = snapshot.statusVisible && snapshot.statusHTML ? 'block' : 'none';
    }
    this._promptPS1.innerHTML = snapshot.promptHTML;
    this.scrollBottom();
    return this;
  }

  // Convenience helpers for programs that want a "fullscreen" takeover:
  // call enterFullscreenMode() before drawing, and exitFullscreenMode()
  // when done to restore the previous shell content.
  enterFullscreenMode() {
    return this.pushScreen({ clear: true });
  }

  exitFullscreenMode() {
    return this.popScreen();
  }

  // Public instance helper for programs/scripts: `await shell.sleep(250)`.
  // (There is also a static variant: `await JsShell.sleep(250)`.)
  async sleep(milliseconds) {
    await JsShell.sleep(milliseconds);
  }

  static async sleep(milliseconds) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  setTextSize(size) {
    this._output.style.fontSize = size;
    this._input.style.fontSize = size;
    return this;
  }

  setForceFocus(focus) {
    this._forceFocus = !!focus;
    return this;
  }

  setTextColor(col) {
    this.html.style.color = col;
    this._cursor.style.background = col;
    this._cursor.style.color = col;
    this._cursor.style.borderRightColor = col;
    return this;
  }

  setFontFamily(font) {
    this.html.style.fontFamily = font;
    return this;
  }

  setBackgroundColor(col) {
    this.html.style.background = col;
    return this;
  }

  setWidth(width) {
    this.html.style.width = width;
    return this;
  }

  setHeight(height) {
    this.html.style.height = height;
    return this;
  }

  setMargin(margin) {
    this.html.style.margin = margin;
    return this;
  }

  setBlinking(bool) {
    bool = bool.toString().toUpperCase();
    this._shouldBlinkCursor = (bool === 'TRUE' || bool === '1' || bool === 'YES');
    return this;
  }

  setPrompt(promptPS) {
    this._promptPS1.innerHTML = promptPS;
    return this;
  }

  // Method to set universal key handler (base handler). Programs can install
  // temporary handlers on top using pushKeyHandler / popKeyHandler.
  setKeyHandler(callback) {
    this._baseKeyHandler = callback;
    this._updateKeyHandlerDispatch();
    return this;
  }

  // Install a temporary key handler on top of the base handler. The topmost
  // handler is invoked first; if it does not handle the event, the base
  // handler (installed via setKeyHandler) runs as usual.
  pushKeyHandler(handler) {
    if (!this._keyHandlerStack) {
      this._keyHandlerStack = [];
    }
    this._keyHandlerStack.push(handler);
    this._updateKeyHandlerDispatch();
    return this;
  }

  // Remove the most recently installed temporary key handler. If an expected
  // handler is provided and does not match the current top handler, nothing
  // happens.
  popKeyHandler(expectedHandler) {
    if (!this._keyHandlerStack || this._keyHandlerStack.length === 0) {
      return this;
    }
    const top = this._keyHandlerStack[this._keyHandlerStack.length - 1];
    if (expectedHandler && top !== expectedHandler) {
      return this;
    }
    this._keyHandlerStack.pop();
    this._updateKeyHandlerDispatch();
    return this;
  }

  // Internal: update the dispatching onKeyHandler to consult the key handler
  // stack first, then fall back to the base key handler.
  _updateKeyHandlerDispatch() {
    const self = this;
    this.onKeyHandler = function dispatchedKeyHandler(keyEvent, shellInstance) {
      const stack = self._keyHandlerStack || [];
      if (stack.length > 0) {
        const topHandler = stack[stack.length - 1];
        if (typeof topHandler === 'function') {
          return topHandler(keyEvent, shellInstance);
        }
      }
      if (typeof self._baseKeyHandler === 'function') {
        return self._baseKeyHandler(keyEvent, shellInstance);
      }
      return false;
    };
  }

  // Non-blocking helper for programs that want to observe the next key press
  // without installing their own handler. Returns a Promise that resolves
  // with the next keyEvent object matching the optional filter, or null on
  // timeout.
  readKey({ filter, timeout } = {}) {
    return new Promise((resolve) => {
      const entry = { filter, resolve, timeoutId: null };
      if (typeof timeout === 'number' && timeout > 0) {
        entry.timeoutId = setTimeout(() => {
          const idx = this._pendingKeyReads.indexOf(entry);
          if (idx !== -1) {
            this._pendingKeyReads.splice(idx, 1);
          }
          resolve(null);
        }, timeout);
      }
      this._pendingKeyReads.push(entry);
    });
  }

  _notifyReadKeyListeners(keyEvent) {
    if (!this._pendingKeyReads || this._pendingKeyReads.length === 0) {
      return;
    }
    for (let i = 0; i < this._pendingKeyReads.length; i += 1) {
      const entry = this._pendingKeyReads[i];
      if (entry.filter && !entry.filter(keyEvent)) {
        continue;
      }
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      this._pendingKeyReads.splice(i, 1);
      entry.resolve(keyEvent);
      break;
    }
  }

  // Status-line API so programs can show a persistent line of text or
  // controls at the bottom of the shell without interfering with
  // transient hints.
  setStatusLine(message, style = {}) {
    if (!this._statusLine) {
      return this;
    }
    this._statusLine.innerHTML = message;
    this._statusLine.style.display = 'block';

    Object.keys(style).forEach((key) => {
      this._statusLine.style[key] = style[key];
    });

    this.scrollBottom();
    return this;
  }

  clearStatusLine() {
    if (!this._statusLine) {
      return this;
    }
    this._statusLine.innerHTML = '';
    this._statusLine.style.display = 'none';
    return this;
  }

  // Raw key capture -----------------------------------------------------------

  // Some programs (editors, games) want to capture keys continuously (arrow
  // keys, Esc, etc.) without going through the normal "press Enter to submit"
  // prompt lifecycle. This helper installs a hidden input that captures
  // keydown events and forwards them through the normal key handler stack and
  // the readKey() listeners.
  //
  // Returns a cleanup function that MUST be called to restore normal input.
  enterRawMode({ hideInput = true } = {}) {
    const inputField = document.createElement('input');
    inputField.setAttribute('autocapitalize', 'none');
    inputField.style.position = 'relative';
    inputField.style.zIndex = '-100';
    inputField.style.outline = 'none';
    inputField.style.border = 'none';
    inputField.style.opacity = '0';
    inputField.style.top = '0';

    const prevInputDisplay = this._input ? this._input.style.display : undefined;
    if (hideInput && this._input) {
      this._input.style.display = 'none';
    }

    this.html.appendChild(inputField);

    const clickBackup = this.html.onclick;
    this.html.onclick = () => {
      if (this.shouldFocus()) {
        inputField.focus();
      }
    };

    inputField.onkeydown = async (e) => {
      const keyEvent = {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        currentInput: inputField.value,
        promptType: 'RAW',
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation()
      };

      // Forward to key handler stack if present.
      if (this.onKeyHandler) {
        let result = this.onKeyHandler(keyEvent, this);
        if (result instanceof Promise) {
          result = await result;
        }

        if (typeof result === 'string') {
          this.updateInput(result, inputField);
        }
      }

      // Always prevent default in raw mode to avoid browser navigation
      // (Backspace) and to keep keys fully under program control.
      e.preventDefault();

      // Always notify readKey listeners, even if a handler "handled" it.
      this._notifyReadKeyListeners(keyEvent);
    };

    inputField.onkeyup = () => {
      // Keep cursor timer alive so the shell stays responsive.
      this.fireCursorInterval();
    };

    if (this.shouldFocus()) {
      inputField.focus();
    }

    return () => {
      try {
        inputField.onkeydown = null;
        inputField.onkeyup = null;
        if (this.html && inputField.parentNode === this.html) {
          this.html.removeChild(inputField);
        }
      } finally {
        this.html.onclick = clickBackup;
        if (this._input && prevInputDisplay !== undefined) {
          this._input.style.display = prevInputDisplay;
        }
      }
    };
  }

  isKeyEnter(event) {
    return event.keyCode === 13 || event.code === 'Enter';
  }

  isKeyYorN(event) {
    if (event.code) {
      return event.code === 'KeyY' || event.code === 'KeyN';
    }

    // fix for Chrome Android
    let kCd = event.keyCode || event.which;
    if (event.srcElement && (kCd === 0 || kCd === 229)) {
      const val = event.srcElement.value;
      kCd = val.charCodeAt(val.length - 1);
    }
    // Y and N lowercase & uppercase char codes
    return [121, 89, 78, 110].includes(kCd);
  }

  setVisible(visible) {
    this.html.style.display = visible ? 'block' : 'none';
    return this;
  }

  shouldFocus() {
    return this._forceFocus ||
      this.html.matches(':focus-within') ||
      this.html.matches(':hover');
  }

  focus(force = false) {
    const lastChild = this.html.lastElementChild;
    if (lastChild && (this.shouldFocus() || force)) {
      lastChild.focus();
    }
    return this;
  }

  // Approximate single character cell size based on the current font.
  _getCharCellSize() {
    if (!this._measureCell) {
      return { width: 8, height: 16 };
    }
    const width = this._measureCell.offsetWidth || 8;
    const height = this._measureCell.offsetHeight || 16;
    return { width, height };
  }

  // Get the current viewport size in character columns and rows so ASCII
  // programs can layout grids.
  getViewportSize() {
    const { width: cellW, height: cellH } = this._getCharCellSize();
    if (!cellW || !cellH) {
      return { cols: 0, rows: 0 };
    }
    const viewW = this.html.clientWidth || this.html.offsetWidth || 0;
    const viewH = this.html.clientHeight || this.html.offsetHeight || 0;
    return {
      cols: Math.max(0, Math.floor(viewW / cellW)),
      rows: Math.max(0, Math.floor(viewH / cellH))
    };
  }

  getViewportColumns() {
    return this.getViewportSize().cols;
  }

  getViewportRows() {
    return this.getViewportSize().rows;
  }
}

export { JsShell };
