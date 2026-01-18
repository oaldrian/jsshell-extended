/* 2048.js (VFS) | ASCII 2048 */

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

function fmtCell(n, w) {
  const s = n === 0 ? '' : String(n);
  const pad = Math.max(0, w - s.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

function rotateGrid(grid) {
  const N = grid.length;
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      out[c][N - 1 - r] = grid[r][c];
    }
  }
  return out;
}

function slideRowLeft(row) {
  const nonZero = row.filter((x) => x !== 0);
  const out = [];
  let scoreDelta = 0;
  for (let i = 0; i < nonZero.length; i += 1) {
    const a = nonZero[i];
    const b = nonZero[i + 1];
    if (b != null && a === b) {
      const v = a + b;
      out.push(v);
      scoreDelta += v;
      i += 1;
    } else {
      out.push(a);
    }
  }
  while (out.length < row.length) out.push(0);
  return { row: out, scoreDelta };
}

function gridsEqual(a, b) {
  for (let r = 0; r < a.length; r += 1) {
    for (let c = 0; c < a[r].length; c += 1) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function move(grid, dir) {
  // dir: 0=left,1=up,2=right,3=down using rotation
  let g = grid;
  for (let i = 0; i < dir; i += 1) {
    g = rotateGrid(g);
  }

  let scoreDelta = 0;
  const N = g.length;
  const next = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let r = 0; r < N; r += 1) {
    const { row, scoreDelta: d } = slideRowLeft(g[r]);
    scoreDelta += d;
    next[r] = row;
  }

  let out = next;
  for (let i = 0; i < (4 - dir) % 4; i += 1) {
    out = rotateGrid(out);
  }

  return { grid: out, scoreDelta };
}

function listEmptyCells(grid) {
  const out = [];
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (grid[r][c] === 0) out.push({ r, c });
    }
  }
  return out;
}

function addRandomTile(grid) {
  const empty = listEmptyCells(grid);
  if (!empty.length) return false;
  const idx = Math.floor(Math.random() * empty.length);
  const { r, c } = empty[idx];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function hasMoves(grid) {
  if (listEmptyCells(grid).length) return true;
  const N = grid.length;
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const v = grid[r][c];
      if (r + 1 < N && grid[r + 1][c] === v) return true;
      if (c + 1 < N && grid[r][c + 1] === v) return true;
    }
  }
  return false;
}

function newGame() {
  const grid = Array.from({ length: 4 }, () => new Array(4).fill(0));
  addRandomTile(grid);
  addRandomTile(grid);
  return { grid, score: 0 };
}

function render(shell, state) {
  shell.clear();
  shell.print(`2048  |  Score: ${state.score}  |  Best: ${state.best}`);
  shell.print('');

  const cellW = 6;
  const hbar = '┼' + Array.from({ length: 4 }, () => '─'.repeat(cellW)).join('┼') + '┼';
  shell.print(hbar.replace(/┼/g, '┌').replace(/┌/g, '┌'));

  for (let r = 0; r < 4; r += 1) {
    let row = '│';
    for (let c = 0; c < 4; c += 1) {
      row += fmtCell(state.grid[r][c], cellW) + '│';
    }
    shell.print(row);
    if (r !== 3) shell.print(hbar);
  }

  const bottom = hbar.replace(/┼/g, '└').replace(/└/g, '└');
  shell.print(bottom);

  if (state.gameOver) {
    shell.print('');
    shell.print('Game Over. Press r to restart.');
  }
}

function status(shell) {
  shell.setStatusLine('<span style="opacity:0.9;">Arrows move | r restart | Esc/q quit</span>');
}

async function main(shell) {
  const BEST_PATH = '/etc/2048.txt';

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  let state = {
    ...newGame(),
    best: Math.max(0, loadNumber(BEST_PATH, 0)),
    gameOver: false
  };

  const restart = () => {
    state = { ...newGame(), best: Math.max(0, loadNumber(BEST_PATH, 0)), gameOver: false };
  };

  try {
    let running = true;
    while (running) {
      render(shell, state);
      status(shell);

      const keyEvent = await shell.readKey({ timeout: 200 });
      if (!keyEvent) continue;

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') {
        running = false;
        continue;
      }

      if (keyEvent.key === 'r') {
        restart();
        continue;
      }

      if (state.gameOver) {
        continue;
      }

      let dir = null;
      if (keyEvent.code === 'ArrowLeft') dir = 0;
      // The rotation-based move mapping in this game expects up/down swapped here.
      if (keyEvent.code === 'ArrowUp') dir = 3;
      if (keyEvent.code === 'ArrowRight') dir = 2;
      if (keyEvent.code === 'ArrowDown') dir = 1;
      if (dir == null) continue;

      const before = state.grid;
      const { grid: nextGrid, scoreDelta } = move(before, dir);

      if (gridsEqual(before, nextGrid)) {
        continue;
      }

      state.grid = nextGrid;
      state.score += scoreDelta;
      addRandomTile(state.grid);

      if (state.score > state.best) {
        state.best = state.score;
        saveNumber(BEST_PATH, state.best);
      }

      if (!hasMoves(state.grid)) {
        state.gameOver = true;
      }
    }
  } finally {
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
