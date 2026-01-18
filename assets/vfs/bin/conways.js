/* conways.js (VFS) | Conway's Game of Life */

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function ensureEtcFolder() {
  try { vfs.list('/etc'); return; } catch (_) { /* create */ }
  const cwdSnapshot = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';
  try {
    vfs.changeDirectory('/');
    try { vfs.mkdir('etc'); } catch (_) { /* ignore */ }
  } finally {
    try { vfs.changeDirectory(cwdSnapshot); } catch (_) { /* ignore */ }
  }
}

function loadJson(path, fallback) {
  try {
    ensureEtcFolder();
    const raw = vfs.readFile(path);
    return JSON.parse(String(raw || ''));
  } catch (_) {
    return fallback;
  }
}

function saveJson(path, value) {
  try {
    ensureEtcFolder();
    vfs.writeFile(path, JSON.stringify(value, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

function emptyGrid(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(0));
}

function randomizeGrid(grid, density) {
  const d = typeof density === 'number' ? density : 0.22;
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      grid[y][x] = Math.random() < d ? 1 : 0;
    }
  }
}

function stepGrid(grid) {
  const h = grid.length;
  const w = grid[0]?.length || 0;
  const next = emptyGrid(w, h);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          n += grid[ny][nx] ? 1 : 0;
        }
      }

      const alive = grid[y][x] ? 1 : 0;
      if (alive) next[y][x] = (n === 2 || n === 3) ? 1 : 0;
      else next[y][x] = (n === 3) ? 1 : 0;
    }
  }

  return next;
}

function countAlive(grid) {
  let c = 0;
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) c += grid[y][x] ? 1 : 0;
  }
  return c;
}

function computeBoardSize(shell) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = Math.max(40, viewport.cols || 80);
  const rows = Math.max(18, viewport.rows || 24);
  const w = clamp(cols - 6, 10, 120);
  const h = clamp(rows - 8, 8, 60);
  return { w, h };
}

function loadSavedOrEmpty(w, h) {
  const saved = loadJson('/etc/conways.json', null);
  if (saved && typeof saved === 'object' && saved.w === w && saved.h === h && Array.isArray(saved.grid)) {
    const g = saved.grid;
    if (g.length === h && g.every((row) => Array.isArray(row) && row.length === w)) {
      const out = emptyGrid(w, h);
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[y][x] = g[y][x] ? 1 : 0;
      return out;
    }
  }
  return emptyGrid(w, h);
}

function render(shell, s) {
  shell.clear();
  const alive = countAlive(s.grid);
  shell.print(`Conway's Life  |  Gen: ${s.generation}  |  Alive: ${alive}  |  Speed: ${s.stepMs}ms  |  ${s.running ? 'RUN' : 'PAUSE'}`);
  shell.print('');

  const top = '┌' + '─'.repeat(s.w) + '┐';
  const bot = '└' + '─'.repeat(s.w) + '┘';
  shell.print(top);

  for (let y = 0; y < s.h; y += 1) {
    let line = '│';
    for (let x = 0; x < s.w; x += 1) {
      const aliveCell = s.grid[y][x] ? '█' : ' ';
      if (x === s.cursorX && y === s.cursorY) {
        line += aliveCell === '█' ? '▓' : '·';
      } else {
        line += aliveCell;
      }
    }
    line += '│';
    shell.print(line);
  }

  shell.print(bot);
}

function status(shell) {
  shell.setStatusLine('<span style="opacity:0.9;">Arrows move | Space toggle | p run/pause | n step | r random | c clear | +/- speed | s save | Esc/q quit</span>');
}

async function main(shell, command, args) {
  const { w, h } = computeBoardSize(shell);

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  const s = {
    w,
    h,
    grid: loadSavedOrEmpty(w, h),
    cursorX: 0,
    cursorY: 0,
    generation: 0,
    running: false,
    stepMs: 150
  };

  if (Array.isArray(args) && args[0]) {
    const a0 = String(args[0]).toLowerCase();
    if (a0 === 'random') randomizeGrid(s.grid);
    if (a0 === 'clear') s.grid = emptyGrid(w, h);
  }

  try {
    let running = true;
    while (running) {
      render(shell, s);
      status(shell);

      const timeout = s.running ? Math.max(20, s.stepMs) : 250;
      const keyEvent = await shell.readKey({ timeout });

      if (!keyEvent) {
        if (s.running) {
          s.grid = stepGrid(s.grid);
          s.generation += 1;
        }
        continue;
      }

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') {
        running = false;
        continue;
      }

      if (keyEvent.code === 'ArrowUp') s.cursorY = clamp(s.cursorY - 1, 0, s.h - 1);
      if (keyEvent.code === 'ArrowDown') s.cursorY = clamp(s.cursorY + 1, 0, s.h - 1);
      if (keyEvent.code === 'ArrowLeft') s.cursorX = clamp(s.cursorX - 1, 0, s.w - 1);
      if (keyEvent.code === 'ArrowRight') s.cursorX = clamp(s.cursorX + 1, 0, s.w - 1);

      if (keyEvent.code === 'Space' || keyEvent.code === 'Enter') {
        s.grid[s.cursorY][s.cursorX] = s.grid[s.cursorY][s.cursorX] ? 0 : 1;
        continue;
      }

      if (keyEvent.key === 'p') { s.running = !s.running; continue; }
      if (keyEvent.key === 'n') { s.grid = stepGrid(s.grid); s.generation += 1; continue; }
      if (keyEvent.key === 'r') { randomizeGrid(s.grid); s.generation = 0; continue; }
      if (keyEvent.key === 'c') { s.grid = emptyGrid(s.w, s.h); s.generation = 0; continue; }
      if (keyEvent.key === '+' || keyEvent.key === '=') { s.stepMs = clamp(s.stepMs - 10, 20, 1000); continue; }
      if (keyEvent.key === '-' || keyEvent.key === '_') { s.stepMs = clamp(s.stepMs + 10, 20, 1000); continue; }
      if (keyEvent.key === 's') { saveJson('/etc/conways.json', { w: s.w, h: s.h, grid: s.grid }); continue; }
    }
  } finally {
    try { saveJson('/etc/conways.json', { w: s.w, h: s.h, grid: s.grid }); } catch (_) { /* ignore */ }
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
