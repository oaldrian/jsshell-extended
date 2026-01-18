/* edit.js (VFS) | Fancy fullscreen editor program for the virtual filesystem */

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function snapshotForUndo(state) {
  return {
    lines: state.lines.slice(),
    cursorRow: state.cursorRow,
    cursorCol: state.cursorCol,
    path: state.path,
    dirty: state.dirty
  };
}

function restoreFromUndo(state, snap) {
  state.lines = snap.lines.slice();
  state.cursorRow = snap.cursorRow;
  state.cursorCol = snap.cursorCol;
  state.path = snap.path;
  state.dirty = snap.dirty;
}

function ensureCursorInBounds(state) {
  if (!state.lines.length) {
    state.lines = [''];
  }
  state.cursorRow = clamp(state.cursorRow, 0, state.lines.length - 1);
  const rowText = state.lines[state.cursorRow] || '';
  state.cursorCol = clamp(state.cursorCol, 0, rowText.length);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render(shell, state) {
  const viewport = typeof shell.getViewportSize === 'function'
    ? shell.getViewportSize()
    : { cols: 80, rows: 24 };

  const usableRows = Math.max(6, (viewport.rows || 24) - 3);
  const gutterWidth = 4;
  const usableCols = Math.max(20, (viewport.cols || 80) - 1);
  const textCols = Math.max(10, usableCols - gutterWidth - 1);

  ensureCursorInBounds(state);

  const { cursorRow, cursorCol } = state;

  // Scroll to keep cursor visible
  if (cursorRow < state.scrollRow) state.scrollRow = cursorRow;
  if (cursorRow >= state.scrollRow + usableRows) state.scrollRow = cursorRow - usableRows + 1;

  const currentLine = state.lines[cursorRow] || '';
  if (cursorCol < state.scrollCol) state.scrollCol = cursorCol;
  if (cursorCol >= state.scrollCol + textCols) state.scrollCol = cursorCol - textCols + 1;

  shell.clear();

  const header = `${state.exists ? 'Editing' : 'New file'}: ${state.path}`;
  shell.print(header);
  shell.print('');

  const start = state.scrollRow;
  const end = Math.min(state.lines.length, start + usableRows);

  for (let row = start; row < end; row += 1) {
    const lineNo = String(row + 1).padStart(gutterWidth, ' ');
    const raw = state.lines[row] || '';
    const visible = raw.slice(state.scrollCol, state.scrollCol + textCols);

    if (row === cursorRow) {
      const relCol = clamp(cursorCol - state.scrollCol, 0, visible.length);
      const before = visible.slice(0, relCol);
      const under = (cursorCol < raw.length) ? raw.charAt(cursorCol) : ' ';
      const after = visible.slice(relCol + (cursorCol < raw.length ? 1 : 0));

      shell.printHTML(
        `<span style="opacity:0.7;">${lineNo}</span> ` +
        `${escapeHtml(before)}` +
        `<span style="background: rgba(255,255,255,0.35); color: #000;">${escapeHtml(under === ' ' ? '\u00a0' : under)}</span>` +
        `${escapeHtml(after)}`
      );
    } else {
      shell.printHTML(`<span style="opacity:0.7;">${lineNo}</span> ${escapeHtml(visible)}`);
    }
  }

  const dirty = state.dirty ? ' [+]' : '';
  const modeLabel = state.mode === 'insert'
    ? '-- INSERT --'
    : state.mode === 'command'
      ? '-- COMMAND --'
      : '-- NORMAL --';

  const pos = `Ln ${cursorRow + 1}, Col ${cursorCol + 1}`;
  const right = `${pos}${dirty}`;

  let extra = '';
  if (state.mode === 'command') {
    extra = `:${state.commandLine}`;
  } else if (state.mode === 'normal') {
    extra = 'i insert | Esc normal | : command | Ctrl+S save | Ctrl+Q quit';
  } else {
    extra = 'Esc normal | Ctrl+S save | Ctrl+Q quit';
  }

  shell.setStatusLine(
    `<span style="opacity:0.9;">${modeLabel}</span> ` +
    `<span style="opacity:0.8;">${escapeHtml(extra)}</span>` +
    `<span style="float:right; opacity:0.8;">${escapeHtml(right)}</span>`
  );
}

function pushUndo(state) {
  state.undoStack.push(snapshotForUndo(state));
  if (state.undoStack.length > state.undoLimit) {
    state.undoStack.splice(0, state.undoStack.length - state.undoLimit);
  }
  state.redoStack = [];
}

function insertChar(state, ch) {
  pushUndo(state);
  ensureCursorInBounds(state);
  const rowText = state.lines[state.cursorRow] || '';
  state.lines[state.cursorRow] = rowText.slice(0, state.cursorCol) + ch + rowText.slice(state.cursorCol);
  state.cursorCol += ch.length;
  state.dirty = true;
}

function insertNewline(state) {
  pushUndo(state);
  ensureCursorInBounds(state);
  const rowText = state.lines[state.cursorRow] || '';
  const left = rowText.slice(0, state.cursorCol);
  const right = rowText.slice(state.cursorCol);
  state.lines[state.cursorRow] = left;
  state.lines.splice(state.cursorRow + 1, 0, right);
  state.cursorRow += 1;
  state.cursorCol = 0;
  state.dirty = true;
}

function backspace(state) {
  ensureCursorInBounds(state);
  if (state.cursorCol > 0) {
    pushUndo(state);
    const rowText = state.lines[state.cursorRow] || '';
    state.lines[state.cursorRow] = rowText.slice(0, state.cursorCol - 1) + rowText.slice(state.cursorCol);
    state.cursorCol -= 1;
    state.dirty = true;
    return;
  }

  if (state.cursorRow > 0) {
    pushUndo(state);
    const prev = state.lines[state.cursorRow - 1] || '';
    const cur = state.lines[state.cursorRow] || '';
    state.cursorCol = prev.length;
    state.lines[state.cursorRow - 1] = prev + cur;
    state.lines.splice(state.cursorRow, 1);
    state.cursorRow -= 1;
    state.dirty = true;
  }
}

function del(state) {
  ensureCursorInBounds(state);
  const rowText = state.lines[state.cursorRow] || '';
  if (state.cursorCol < rowText.length) {
    pushUndo(state);
    state.lines[state.cursorRow] = rowText.slice(0, state.cursorCol) + rowText.slice(state.cursorCol + 1);
    state.dirty = true;
    return;
  }

  if (state.cursorRow < state.lines.length - 1) {
    pushUndo(state);
    const next = state.lines[state.cursorRow + 1] || '';
    state.lines[state.cursorRow] = rowText + next;
    state.lines.splice(state.cursorRow + 1, 1);
    state.dirty = true;
  }
}

function deleteLine(state) {
  pushUndo(state);
  ensureCursorInBounds(state);
  state.lines.splice(state.cursorRow, 1);
  if (!state.lines.length) state.lines.push('');
  state.cursorRow = clamp(state.cursorRow, 0, state.lines.length - 1);
  const rowText = state.lines[state.cursorRow] || '';
  state.cursorCol = clamp(state.cursorCol, 0, rowText.length);
  state.dirty = true;
}

function moveCursor(state, dRow, dCol) {
  ensureCursorInBounds(state);
  state.cursorRow = clamp(state.cursorRow + dRow, 0, state.lines.length - 1);
  const rowText = state.lines[state.cursorRow] || '';
  state.cursorCol = clamp(state.cursorCol + dCol, 0, rowText.length);
}

function setCursor(state, row, col) {
  ensureCursorInBounds(state);
  state.cursorRow = clamp(row, 0, state.lines.length - 1);
  const rowText = state.lines[state.cursorRow] || '';
  state.cursorCol = clamp(col, 0, rowText.length);
}

function undo(state) {
  if (!state.undoStack.length) return;
  const snap = state.undoStack.pop();
  state.redoStack.push(snapshotForUndo(state));
  restoreFromUndo(state, snap);
}

function redo(state) {
  if (!state.redoStack.length) return;
  const snap = state.redoStack.pop();
  state.undoStack.push(snapshotForUndo(state));
  restoreFromUndo(state, snap);
}

async function saveToVfs(shell, state) {
  try {
    vfs.writeFile(state.path, state.lines.join('\n'));
    state.dirty = false;
    state.exists = true;
    shell.setStatusLine(`<span style="color:#90ee90;">Saved</span> ${escapeHtml(state.path)}`);
  } catch (err) {
    shell.setStatusLine(`<span style="color:#ff6b6b;">Save failed:</span> ${escapeHtml(String(err.message || err))}`);
  }
}

function isPrintableKey(keyEvent) {
  if (!keyEvent || typeof keyEvent.key !== 'string') return false;
  if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey) return false;
  return keyEvent.key.length === 1;
}

function parseExCommand(text) {
  const src = String(text || '').trim();
  if (!src) return { name: '', args: [] };

  const parts = [];
  let buf = '';
  let quote = null;
  let escaping = false;

  const flush = () => {
    if (buf.length) parts.push(buf);
    buf = '';
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (escaping) {
      buf += ch;
      escaping = false;
      continue;
    }

    if (ch === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      flush();
      while (i + 1 < src.length && (src[i + 1] === ' ' || src[i + 1] === '\t')) i += 1;
      continue;
    }

    buf += ch;
  }

  if (escaping) buf += '\\';
  flush();

  return { name: (parts[0] || '').toLowerCase(), args: parts.slice(1) };
}

async function main(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'edit' && normalized !== './edit.js') {
    // Running via PATH: command will be 'edit'. Running explicitly via ./edit.js is also fine.
  }

  const tokens = Array.isArray(args) ? args.filter((a) => a != null && String(a).length > 0) : [];
  if (tokens.length > 1) {
    shell.print('edit: too many arguments (quote paths with spaces)');
    shell.print('Usage: edit <filename>');
    shell.print('Tip: edit "My Notes.txt"');
    shell.print('');
    return;
  }
  const pathArg = tokens[0] ? String(tokens[0]) : '';

  if (!pathArg) {
    shell.print('edit: missing file operand');
    shell.print('Usage: edit <filename>');
    shell.print('');
    return;
  }

  let exists = true;
  let original = '';
  try {
    original = vfs.readFile(pathArg);
  } catch (_) {
    exists = false;
    original = '';
  }

  const state = {
    path: pathArg,
    exists,
    lines: String(original).split('\n'),
    cursorRow: 0,
    cursorCol: 0,
    scrollRow: 0,
    scrollCol: 0,
    mode: 'normal',
    commandLine: '',
    dirty: false,
    undoStack: [],
    redoStack: [],
    undoLimit: 100,
    pendingD: false
  };

  shell.enterProgramMode();
  shell.enterFullscreenMode();

  const exitRaw = typeof shell.enterRawMode === 'function'
    ? shell.enterRawMode({ hideInput: true })
    : null;

  try {
    let running = true;

    render(shell, state);

    while (running) {
      const keyEvent = await shell.readKey();
      if (!keyEvent) continue;

      if (keyEvent.ctrlKey && keyEvent.code === 'KeyS') {
        await saveToVfs(shell, state);
        render(shell, state);
        continue;
      }
      if (keyEvent.ctrlKey && keyEvent.code === 'KeyQ') {
        if (state.dirty) {
          shell.setStatusLine('<span style="color:#ffcc00;">Unsaved changes</span> (use :q! to quit)');
          render(shell, state);
          continue;
        }
        running = false;
        continue;
      }

      if (keyEvent.code === 'ArrowUp') {
        moveCursor(state, -1, 0);
        state.pendingD = false;
        render(shell, state);
        continue;
      }
      if (keyEvent.code === 'ArrowDown') {
        moveCursor(state, 1, 0);
        state.pendingD = false;
        render(shell, state);
        continue;
      }
      if (keyEvent.code === 'ArrowLeft') {
        moveCursor(state, 0, -1);
        state.pendingD = false;
        render(shell, state);
        continue;
      }
      if (keyEvent.code === 'ArrowRight') {
        moveCursor(state, 0, 1);
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (state.mode === 'insert') {
        if (keyEvent.code === 'Escape') {
          state.mode = 'normal';
          render(shell, state);
          continue;
        }

        if (keyEvent.code === 'Enter') {
          insertNewline(state);
          render(shell, state);
          continue;
        }

        if (keyEvent.code === 'Backspace') {
          backspace(state);
          render(shell, state);
          continue;
        }

        if (keyEvent.code === 'Delete') {
          del(state);
          render(shell, state);
          continue;
        }

        if (keyEvent.code === 'Tab') {
          insertChar(state, '  ');
          render(shell, state);
          continue;
        }

        if (isPrintableKey(keyEvent)) {
          insertChar(state, keyEvent.key);
          render(shell, state);
          continue;
        }

        continue;
      }

      if (state.mode === 'command') {
        if (keyEvent.code === 'Escape') {
          state.mode = 'normal';
          state.commandLine = '';
          render(shell, state);
          continue;
        }

        if (keyEvent.code === 'Backspace') {
          state.commandLine = state.commandLine.slice(0, -1);
          render(shell, state);
          continue;
        }

        if (keyEvent.code === 'Enter') {
          const ex = parseExCommand(state.commandLine);

          if (ex.name === 'w') {
            if (ex.args.length > 1) {
              shell.setStatusLine('<span style="color:#ffcc00;">:w takes at most one path</span> (quote spaces)');
              state.mode = 'normal';
              state.commandLine = '';
              render(shell, state);
              continue;
            }
            if (ex.args.length === 1) {
              state.path = String(ex.args[0]);
            }
            await saveToVfs(shell, state);
            state.mode = 'normal';
            state.commandLine = '';
            render(shell, state);
            continue;
          }

          if (ex.name === 'q') {
            if (state.dirty) {
              shell.setStatusLine('<span style="color:#ffcc00;">No write since last change</span> (use :q! to override)');
              render(shell, state);
              continue;
            }
            running = false;
            continue;
          }

          if (ex.name === 'q!') {
            running = false;
            continue;
          }

          if (ex.name === 'wq') {
            await saveToVfs(shell, state);
            running = false;
            continue;
          }

          shell.setStatusLine(`<span style="color:#ff6b6b;">Unknown command:</span> :${escapeHtml(state.commandLine)}`);
          state.mode = 'normal';
          state.commandLine = '';
          render(shell, state);
          continue;
        }

        if (isPrintableKey(keyEvent)) {
          state.commandLine += keyEvent.key;
          render(shell, state);
          continue;
        }

        continue;
      }

      if (keyEvent.code === 'Escape') {
        state.mode = 'normal';
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (keyEvent.ctrlKey && keyEvent.code === 'KeyZ') {
        undo(state);
        render(shell, state);
        continue;
      }

      if (keyEvent.ctrlKey && (keyEvent.code === 'KeyY' || keyEvent.code === 'KeyR')) {
        redo(state);
        render(shell, state);
        continue;
      }

      if (keyEvent.key === ':') {
        state.mode = 'command';
        state.commandLine = '';
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (keyEvent.key === 'i') {
        state.mode = 'insert';
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (keyEvent.key === 'a') {
        moveCursor(state, 0, 1);
        state.mode = 'insert';
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (keyEvent.key === 'o') {
        pushUndo(state);
        state.lines.splice(state.cursorRow + 1, 0, '');
        state.cursorRow += 1;
        state.cursorCol = 0;
        state.dirty = true;
        state.mode = 'insert';
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (keyEvent.key === 'x') {
        del(state);
        state.pendingD = false;
        render(shell, state);
        continue;
      }

      if (keyEvent.key === 'd') {
        if (state.pendingD) {
          deleteLine(state);
          state.pendingD = false;
          render(shell, state);
          continue;
        }
        state.pendingD = true;
        shell.setStatusLine('<span style="opacity:0.8;">d</span> (press d again for dd)');
        continue;
      }

      if (isPrintableKey(keyEvent)) {
        state.pendingD = false;
      }

      if (keyEvent.code === 'Home') {
        setCursor(state, state.cursorRow, 0);
        render(shell, state);
        continue;
      }

      if (keyEvent.code === 'End') {
        const rowText = state.lines[state.cursorRow] || '';
        setCursor(state, state.cursorRow, rowText.length);
        render(shell, state);
        continue;
      }
    }
  } finally {
    if (typeof exitRaw === 'function') {
      exitRaw();
    }
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
