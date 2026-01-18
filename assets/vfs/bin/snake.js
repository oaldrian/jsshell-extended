/* snake.js (VFS) | ASCII snake */

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

function loadHighScore() {
  try {
    ensureEtcFolder();
    const raw = vfs.readFile('/etc/snake.txt');
    const n = Number(String(raw || '').trim());
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch (_) {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    ensureEtcFolder();
    vfs.writeFile('/etc/snake.txt', String(Math.max(0, Math.floor(score))));
    return true;
  } catch (_) {
    return false;
  }
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function parseSpeedMs(args) {
  if (!Array.isArray(args) || args.length === 0) return 120;
  const raw = String(args[0]).trim();
  if (!raw) return 120;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return clamp(Math.round(n), 30, 1000);
}

function keyToDir(code) {
  if (code === 'ArrowUp') return { dx: 0, dy: -1 };
  if (code === 'ArrowDown') return { dx: 0, dy: 1 };
  if (code === 'ArrowLeft') return { dx: -1, dy: 0 };
  if (code === 'ArrowRight') return { dx: 1, dy: 0 };
  return null;
}

function isOpposite(a, b) {
  return a && b && (a.dx === -b.dx) && (a.dy === -b.dy);
}

function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function posKey(x, y) {
  return `${x},${y}`;
}

function placeFood(state) {
  const occupied = new Set(state.snake.map((p) => posKey(p.x, p.y)));
  const maxTries = state.width * state.height + 50;

  for (let i = 0; i < maxTries; i += 1) {
    const x = randInt(state.width);
    const y = randInt(state.height);
    if (!occupied.has(posKey(x, y))) {
      state.food = { x, y };
      return;
    }
  }

  state.food = null;
}

function buildGridLines(state) {
  const emptyRow = new Array(state.width).fill(' ');
  const grid = Array.from({ length: state.height }, () => emptyRow.slice());

  if (state.food) {
    grid[state.food.y][state.food.x] = '●';
  }

  for (let i = 0; i < state.snake.length; i += 1) {
    const p = state.snake[i];
    grid[p.y][p.x] = (i === 0) ? '█' : '▓';
  }

  const top = '┌' + '─'.repeat(state.width) + '┐';
  const bottom = '└' + '─'.repeat(state.width) + '┘';
  const lines = [top];

  for (let y = 0; y < state.height; y += 1) {
    lines.push('│' + grid[y].join('') + '│');
  }

  lines.push(bottom);
  return lines;
}

function computeBoardSize(shell) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = Math.max(20, viewport.cols || 80);
  const rows = Math.max(10, viewport.rows || 24);

  const width = clamp(cols - 6, 12, 80);
  const height = clamp(rows - 8, 8, 30);

  return { width, height };
}

function status(shell) {
  shell.setStatusLine('<span style="opacity:0.9;">Arrows move | p pause | r restart | Esc/q quit</span>');
}

async function main(shell, command, args) {
  const speedMs = parseSpeedMs(args);
  if (!Number.isFinite(speedMs)) {
    shell.print('snake: invalid speed (ms)');
    shell.print('');
    return;
  }

  const { width, height } = computeBoardSize(shell);

  const best = loadHighScore();

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  let state = {
    width,
    height,
    snake: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
    dir: { dx: 1, dy: 0 },
    nextDir: { dx: 1, dy: 0 },
    food: null,
    score: 0,
    best,
    gameOver: false,
    paused: false
  };

  placeFood(state);

  const restart = () => {
    state = {
      width,
      height,
      snake: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
      dir: { dx: 1, dy: 0 },
      nextDir: { dx: 1, dy: 0 },
      food: null,
      score: 0,
      best: loadHighScore(),
      gameOver: false,
      paused: false
    };
    placeFood(state);
  };

  try {
    let lastTick = Date.now();
    let running = true;

    while (running) {
      shell.clear();
      shell.print(`Snake  |  Score: ${state.score}  |  Best: ${state.best}`);
      shell.print('');
      for (const line of buildGridLines(state)) {
        shell.print(line);
      }
      if (state.gameOver) {
        shell.print('');
        shell.print('Game Over. Press r to restart.');
      } else if (state.paused) {
        shell.print('');
        shell.print('Paused. Press p to resume.');
      }
      status(shell);

      const now = Date.now();
      const keyEvent = await shell.readKey({ timeout: 30 });

      if (keyEvent) {
        if (keyEvent.code === 'Escape' || keyEvent.key === 'q') {
          running = false;
          continue;
        }
        if (keyEvent.key === 'r') {
          restart();
          continue;
        }
        if (keyEvent.key === 'p') {
          state.paused = !state.paused;
          continue;
        }

        const d = keyToDir(keyEvent.code);
        if (d && !isOpposite(d, state.dir)) {
          state.nextDir = d;
        }
      }

      if (state.paused || state.gameOver) {
        continue;
      }

      if (now - lastTick >= speedMs) {
        lastTick = now;
        state.dir = state.nextDir;

        const head = state.snake[0];
        const nx = head.x + state.dir.dx;
        const ny = head.y + state.dir.dy;

        // wall collision
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) {
          state.gameOver = true;
          continue;
        }

        // self collision
        if (state.snake.some((p) => p.x === nx && p.y === ny)) {
          state.gameOver = true;
          continue;
        }

        state.snake.unshift({ x: nx, y: ny });

        if (state.food && nx === state.food.x && ny === state.food.y) {
          state.score += 1;
          if (state.score > state.best) {
            state.best = state.score;
            saveHighScore(state.best);
          }
          placeFood(state);
        } else {
          state.snake.pop();
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
