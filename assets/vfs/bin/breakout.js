/* breakout.js (VFS) | ASCII breakout */

function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

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

function loadNumber(path, fallback) {
  try { ensureEtcFolder(); const raw = vfs.readFile(path); const n = Number(String(raw||'').trim()); return Number.isFinite(n) ? Math.floor(n) : fallback; } catch (_) { return fallback; }
}

function saveNumber(path, value) {
  try { ensureEtcFolder(); vfs.writeFile(path, String(Math.floor(value))); return true; } catch (_) { return false; }
}

function computeDims(shell) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = viewport.cols || 80;
  const rows = viewport.rows || 24;
  const w = clamp(cols - 6, 30, 120);
  const h = clamp(rows - 6, 16, 50);
  return { w, h };
}

function newState(w, h) {
  const brickRows = 6;
  const brickCols = clamp(Math.floor((w - 10) / 4), 8, 22);
  const bricks = Array.from({ length: brickRows }, () => new Array(brickCols).fill(1));

  const paddleW = clamp(Math.floor(w / 8), 6, 18);
  const best = Math.max(0, Math.floor(loadNumber('/etc/breakout-best.txt', 0)));

  return {
    w,
    h,
    bricks,
    brickRows,
    brickCols,
    paddleW,
    paddleX: Math.floor((w - paddleW) / 2),
    ballX: Math.floor(w / 2),
    ballY: h - 6,
    vx: 1,
    vy: -1,
    score: 0,
    best,
    lives: 3,
    paused: false,
    gameOver: false,
    win: false,
    lastTickAt: Date.now(),
    tickMs: 60
  };
}

function status(shell) { shell.setStatusLine('<span style="opacity:0.9;">Left/Right move | p pause | r restart | Esc/q quit</span>'); }

function render(shell, s) {
  shell.clear();
  shell.print(`Breakout  |  Score: ${s.score}  |  Best: ${s.best}  |  Lives: ${s.lives}  |  ${s.paused ? 'PAUSE' : 'RUN'}`);
  shell.print('');

  const top = '┌' + '─'.repeat(s.w) + '┐';
  const bot = '└' + '─'.repeat(s.w) + '┘';
  shell.print(top);

  for (let y = 0; y < s.h; y += 1) {
    let line = '│';
    for (let x = 0; x < s.w; x += 1) {
      let ch = ' ';

      const brickAreaTop = 2;
      const brickAreaHeight = s.brickRows;
      if (y >= brickAreaTop && y < brickAreaTop + brickAreaHeight) {
        const by = y - brickAreaTop;
        const bw = Math.floor(s.w / s.brickCols);
        const bx = Math.floor(x / bw);
        if (bx >= 0 && bx < s.brickCols && s.bricks[by][bx]) ch = '#';
      }

      const paddleY = s.h - 2;
      if (y === paddleY && x >= s.paddleX && x < s.paddleX + s.paddleW) ch = '=';

      if (x === s.ballX && y === s.ballY) ch = 'o';

      line += ch;
    }
    line += '│';
    shell.print(line);
  }

  shell.print(bot);

  if (s.gameOver) {
    shell.print('');
    shell.print(s.win ? 'You win! Press r to restart.' : 'Game Over. Press r to restart.');
  } else if (s.paused) {
    shell.print('');
    shell.print('Paused. Press p to resume.');
  }
}

function remainingBricks(s) {
  let c = 0;
  for (let y = 0; y < s.bricks.length; y += 1) for (let x = 0; x < s.bricks[y].length; x += 1) c += s.bricks[y][x] ? 1 : 0;
  return c;
}

function bounceOffPaddle(s) {
  const paddleY = s.h - 2;
  if (s.ballY !== paddleY - 1) return false;
  if (s.ballX < s.paddleX || s.ballX >= s.paddleX + s.paddleW) return false;

  const rel = (s.ballX - s.paddleX) / Math.max(1, (s.paddleW - 1));
  const dir = rel < 0.5 ? -1 : 1;
  s.vx = dir;
  s.vy = -1;
  return true;
}

function bounceOffBricks(s) {
  const brickAreaTop = 2;
  const brickAreaHeight = s.brickRows;
  if (s.ballY < brickAreaTop || s.ballY >= brickAreaTop + brickAreaHeight) return false;

  const by = s.ballY - brickAreaTop;
  const bw = Math.floor(s.w / s.brickCols);
  const bx = Math.floor(s.ballX / bw);
  if (bx < 0 || bx >= s.brickCols) return false;

  if (s.bricks[by][bx]) {
    s.bricks[by][bx] = 0;
    s.score += 10;
    if (s.score > s.best) { s.best = s.score; saveNumber('/etc/breakout-best.txt', s.best); }
    s.vy *= -1;
    return true;
  }
  return false;
}

function resetBall(s) {
  s.ballX = Math.floor(s.w / 2);
  s.ballY = s.h - 6;
  s.vx = Math.random() < 0.5 ? -1 : 1;
  s.vy = -1;
}

async function main(shell, command, args) {
  const { w, h } = computeDims(shell);

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  let s = newState(w, h);

  try {
    let running = true;
    while (running) {
      render(shell, s);
      status(shell);

      const now = Date.now();
      if (!s.paused && !s.gameOver && (now - s.lastTickAt >= s.tickMs)) {
        s.lastTickAt = now;

        s.ballX += s.vx;
        s.ballY += s.vy;

        if (s.ballX <= 0) { s.ballX = 0; s.vx = 1; }
        if (s.ballX >= s.w - 1) { s.ballX = s.w - 1; s.vx = -1; }
        if (s.ballY <= 0) { s.ballY = 0; s.vy = 1; }

        bounceOffPaddle(s);
        bounceOffBricks(s);

        if (s.ballY >= s.h - 1) {
          s.lives -= 1;
          if (s.lives <= 0) s.gameOver = true;
          else resetBall(s);
        }

        if (!s.gameOver && remainingBricks(s) === 0) { s.gameOver = true; s.win = true; }
      }

      const keyEvent = await shell.readKey({ timeout: 30 });
      if (!keyEvent) continue;

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') { running = false; continue; }
      if (keyEvent.key === 'r') { s = newState(w, h); continue; }
      if (keyEvent.key === 'p') { s.paused = !s.paused; continue; }

      if (s.paused || s.gameOver) continue;

      if (keyEvent.code === 'ArrowLeft') s.paddleX = clamp(s.paddleX - 2, 0, s.w - s.paddleW);
      if (keyEvent.code === 'ArrowRight') s.paddleX = clamp(s.paddleX + 2, 0, s.w - s.paddleW);
    }
  } finally {
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
