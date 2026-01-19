/* minesweeper.js (VFS) | ASCII minesweeper */

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function ensureEtcFolder() {
  try {
    vfs.list('/etc');
    return;
  } catch (_) {
    // create
  }
  const cwdSnapshot = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  try {
    vfs.changeDirectory('/');
    try { vfs.mkdir('etc'); } catch (_) { /* ignore */ }
  } finally {
    try { vfs.changeDirectory(cwdSnapshot); } catch (_) { /* ignore */ }
  }
}

function loadNumber(path, fallback) {
  try {
    ensureEtcFolder();
    const raw = vfs.readFile(path);
    const n = Number(String(raw || '').trim());
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveNumber(path, value) {
  try {
    ensureEtcFolder();
    vfs.writeFile(path, String(Math.floor(value)));
    return true;
  } catch (_) {
    return false;
  }
}

function parseArgs(args, viewport) {
  const w0 = Math.floor(Math.max(9, Math.min(30, (viewport.cols || 80) - 10)));
  const h0 = Math.floor(Math.max(9, Math.min(20, (viewport.rows || 24) - 8)));

  let w = w0;
  let h = h0;
  let mines = Math.floor((w * h) * 0.14);

  if (Array.isArray(args) && args.length) {
    const n1 = Number(args[0]);
    const n2 = Number(args[1]);
    const n3 = Number(args[2]);
    if (Number.isFinite(n1)) w = clamp(Math.floor(n1), 5, 60);
    if (Number.isFinite(n2)) h = clamp(Math.floor(n2), 5, 30);
    if (Number.isFinite(n3)) mines = clamp(Math.floor(n3), 1, w * h - 1);
  }

  mines = clamp(mines, 1, w * h - 1);
  return { w, h, mines };
}

function idx(x, y, w) {
  return y * w + x;
}

function neighbors(x, y, w, h) {
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function placeMines(state, avoidX, avoidY) {
  const { w, h, mines } = state;
  const total = w * h;
  state.minesArr = new Array(total).fill(false);

  const forbidden = new Set([idx(avoidX, avoidY, w)]);
  for (const n of neighbors(avoidX, avoidY, w, h)) {
    forbidden.add(idx(n.x, n.y, w));
  }

  let placed = 0;
  let tries = 0;
  while (placed < mines && tries < total * 50) {
    tries += 1;
    const i = Math.floor(Math.random() * total);
    if (forbidden.has(i)) continue;
    if (state.minesArr[i]) continue;
    state.minesArr[i] = true;
    placed += 1;
  }

  state.counts = new Array(total).fill(0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = idx(x, y, w);
      if (state.minesArr[i]) continue;
      let c = 0;
      for (const n of neighbors(x, y, w, h)) {
        if (state.minesArr[idx(n.x, n.y, w)]) c += 1;
      }
      state.counts[i] = c;
    }
  }
}

function floodReveal(state, startX, startY) {
  const { w, h } = state;
  const stack = [{ x: startX, y: startY }];
  const seen = new Set();

  while (stack.length) {
    const { x, y } = stack.pop();
    const k = idx(x, y, w);
    if (seen.has(k)) continue;
    seen.add(k);

    if (state.flags[k]) continue;
    if (state.revealed[k]) continue;

    state.revealed[k] = true;

    if (state.counts[k] === 0) {
      for (const n of neighbors(x, y, w, h)) {
        stack.push(n);
      }
    }
  }
}

function checkWin(state) {
  const total = state.w * state.h;
  let revealedCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (state.revealed[i]) revealedCount += 1;
  }
  return revealedCount === (total - state.mines);
}

function render(shell, state) {
  shell.clear();

  const best = state.bestSeconds > 0 ? `${state.bestSeconds}s` : '-';
  const t = state.startedAt ? `${Math.floor((Date.now() - state.startedAt) / 1000)}s` : '0s';
  shell.print(`Minesweeper  |  Mines: ${state.mines}  |  Flags: ${state.flagsUsed}/${state.mines}  |  Time: ${t}  |  Best: ${best}`);
  shell.print('');

  const { w, h } = state;
  const top = '┌' + '─'.repeat(w) + '┐';
  const bot = '└' + '─'.repeat(w) + '┘';

  shell.print(top);
  for (let y = 0; y < h; y += 1) {
    let line = '│';
    for (let x = 0; x < w; x += 1) {
      const i = idx(x, y, w);
      let ch = '·';
      if (state.gameOver) {
        if (state.minesArr[i]) ch = '*';
      }
      if (state.revealed[i]) {
        if (state.minesArr[i]) {
          ch = '*';
        } else {
          const c = state.counts[i];
          ch = c === 0 ? ' ' : String(c);
        }
      } else if (state.flags[i]) {
        ch = '⚑';
      }

      if (x === state.cursorX && y === state.cursorY) {
        if (state.gameOver && state.minesArr[i]) {
          line += '*';
        } else if (state.flags[i]) {
          line += '⚑';
        } else if (state.revealed[i]) {
          line += ch === ' ' ? '▢' : ch;
        } else {
          line += '▢';
        }
      } else {
        line += ch;
      }
    }
    line += '│';
    shell.print(line);
  }
  shell.print(bot);

  if (state.gameOver) {
    shell.print('');
    shell.print('Game Over. Press r to restart.');
  } else if (state.won) {
    shell.print('');
    shell.print('You win! Press r to restart.');
  }
}

function status(shell) {
  shell.setStatusLine('<span style="opacity:0.9;">Arrows move | Space reveal | f flag | r restart | Esc/q quit</span>');
}

function newState(w, h, mines) {
  const total = w * h;
  return {
    w,
    h,
    mines,
    cursorX: 0,
    cursorY: 0,
    minesArr: new Array(total).fill(false),
    counts: new Array(total).fill(0),
    revealed: new Array(total).fill(false),
    flags: new Array(total).fill(false),
    flagsUsed: 0,
    seeded: false,
    gameOver: false,
    won: false,
    startedAt: null,
    bestSeconds: Math.max(0, Math.floor(loadNumber('/etc/minesweeper-best-seconds.txt', 0)))
  };
}

async function main(shell, command, args) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const { w, h, mines } = parseArgs(args, viewport);

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  let state = newState(w, h, mines);
  const restart = () => { state = newState(w, h, mines); };

  try {
    let running = true;
    while (running) {
      render(shell, state);
      status(shell);

      const keyEvent = await shell.readKey({ timeout: 250 });
      if (!keyEvent) continue;

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') {
        running = false;
        continue;
      }

      if (keyEvent.key === 'r') {
        restart();
        continue;
      }

      if (keyEvent.code === 'ArrowUp') state.cursorY = clamp(state.cursorY - 1, 0, state.h - 1);
      if (keyEvent.code === 'ArrowDown') state.cursorY = clamp(state.cursorY + 1, 0, state.h - 1);
      if (keyEvent.code === 'ArrowLeft') state.cursorX = clamp(state.cursorX - 1, 0, state.w - 1);
      if (keyEvent.code === 'ArrowRight') state.cursorX = clamp(state.cursorX + 1, 0, state.w - 1);

      if (state.gameOver || state.won) continue;

      const i = idx(state.cursorX, state.cursorY, state.w);

      if (keyEvent.key === 'f') {
        if (!state.revealed[i]) {
          state.flags[i] = !state.flags[i];
          state.flagsUsed += state.flags[i] ? 1 : -1;
          state.flagsUsed = Math.max(0, state.flagsUsed);
        }
        continue;
      }

      if (keyEvent.code === 'Space' || keyEvent.code === 'Enter') {
        if (!state.startedAt) state.startedAt = Date.now();

        if (!state.seeded) {
          placeMines(state, state.cursorX, state.cursorY);
          state.seeded = true;
        }

        if (state.flags[i] || state.revealed[i]) continue;

        if (state.minesArr[i]) {
          state.revealed[i] = true;
          state.gameOver = true;
          continue;
        }

        floodReveal(state, state.cursorX, state.cursorY);

        if (checkWin(state)) {
          state.won = true;
          const seconds = Math.floor((Date.now() - (state.startedAt || Date.now())) / 1000);
          if (seconds > 0 && (state.bestSeconds === 0 || seconds < state.bestSeconds)) {
            state.bestSeconds = seconds;
            saveNumber('/etc/minesweeper-best-seconds.txt', state.bestSeconds);
          }
        }
      }
    }
  } finally {
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
