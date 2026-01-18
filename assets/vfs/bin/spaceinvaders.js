/* spaceinvaders.js (VFS) | ASCII Space Invaders */

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDims(shell) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = viewport.cols || 80;
  const rows = viewport.rows || 24;
  const w = clamp(cols - 6, 30, 110);
  const h = clamp(rows - 8, 18, 45);
  return { w, h };
}

function status(shell) {
  shell.setStatusLine('<span style="opacity:0.9;">Left/Right move | Space shoot | p pause | r restart | Esc/q quit</span>');
}

function makeInvaders(w) {
  const cols = clamp(Math.floor((w - 6) / 2), 8, 26);
  const rows = 5;
  const alive = Array.from({ length: rows }, () => new Array(cols).fill(1));
  return { rows, cols, alive };
}

function invaderCount(inv) {
  let c = 0;
  for (let y = 0; y < inv.rows; y += 1) for (let x = 0; x < inv.cols; x += 1) c += inv.alive[y][x] ? 1 : 0;
  return c;
}

function render(shell, s) {
  shell.clear();
  shell.print(`Space Invaders  |  Score: ${s.score}  |  Best: ${s.best}  |  Lives: ${s.lives}  |  Level: ${s.level}  |  ${s.paused ? 'PAUSE' : 'RUN'}`);
  shell.print('');

  const top = '┌' + '─'.repeat(s.w) + '┐';
  const bot = '└' + '─'.repeat(s.w) + '┘';
  shell.print(top);

  const inv = s.invaders;
  const invLeft = 3 + s.invOffsetX;
  const invTop = 2 + s.invOffsetY;

  const occupied = new Map();
  for (let ry = 0; ry < inv.rows; ry += 1) {
    for (let rx = 0; rx < inv.cols; rx += 1) {
      if (!inv.alive[ry][rx]) continue;
      const x = invLeft + (rx * 2);
      const y = invTop + ry;
      if (x >= 0 && x < s.w && y >= 0 && y < s.h) occupied.set(`${x},${y}`, (ry % 2 === 0) ? 'W' : 'M');
    }
  }

  const playerY = s.h - 2;

  const bulletMap = new Map();
  for (const b of s.playerBullets) bulletMap.set(`${b.x},${b.y}`, '|');
  for (const b of s.enemyBullets) bulletMap.set(`${b.x},${b.y}`, '!');

  for (let y = 0; y < s.h; y += 1) {
    let line = '│';
    for (let x = 0; x < s.w; x += 1) {
      let ch = ' ';
      const invCh = occupied.get(`${x},${y}`);
      if (invCh) ch = invCh;
      const bch = bulletMap.get(`${x},${y}`);
      if (bch) ch = bch;

      if (y === playerY) {
        if (x === s.playerX) ch = '^';
        if (x === s.playerX - 1 || x === s.playerX + 1) if (ch === ' ') ch = '-';
      }

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

function trySpawnEnemyBullet(s) {
  const inv = s.invaders;
  const aliveCount = invaderCount(inv);
  if (aliveCount <= 0) return;

  const p = Math.min(0.25, 0.015 + (s.level * 0.003) + ((1 / Math.max(1, aliveCount)) * 0.3));
  if (Math.random() > p) return;

  const candidates = [];
  for (let rx = 0; rx < inv.cols; rx += 1) {
    for (let ry = inv.rows - 1; ry >= 0; ry -= 1) {
      if (inv.alive[ry][rx]) { candidates.push({ rx, ry }); break; }
    }
  }
  if (!candidates.length) return;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const x = 3 + s.invOffsetX + (pick.rx * 2);
  const y = 2 + s.invOffsetY + pick.ry + 1;
  if (x < 0 || x >= s.w || y < 0 || y >= s.h) return;
  s.enemyBullets.push({ x, y, vy: 1 });
}

function moveInvaders(s) {
  const inv = s.invaders;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let ry = 0; ry < inv.rows; ry += 1) {
    for (let rx = 0; rx < inv.cols; rx += 1) {
      if (!inv.alive[ry][rx]) continue;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

  const nextOffset = s.invOffsetX + s.invDir;
  const nextLeft = 3 + nextOffset + (minX * 2);
  const nextRight = 3 + nextOffset + (maxX * 2);

  if (nextLeft <= 1 || nextRight >= (s.w - 2)) {
    s.invDir *= -1;
    s.invOffsetY += 1;
  } else {
    s.invOffsetX = nextOffset;
  }

  const invBottomY = 2 + s.invOffsetY + (inv.rows - 1);
  if (invBottomY >= s.h - 3) s.gameOver = true;
}

function collideBullets(s) {
  const inv = s.invaders;
  const invLeft = 3 + s.invOffsetX;
  const invTop = 2 + s.invOffsetY;

  const newPlayerBullets = [];
  for (const b of s.playerBullets) {
    let hit = false;
    for (let ry = 0; ry < inv.rows && !hit; ry += 1) {
      const y = invTop + ry;
      if (y !== b.y) continue;
      for (let rx = 0; rx < inv.cols && !hit; rx += 1) {
        if (!inv.alive[ry][rx]) continue;
        const x = invLeft + (rx * 2);
        if (x === b.x) {
          inv.alive[ry][rx] = 0;
          hit = true;
          s.score += 10;
        }
      }
    }
    if (!hit) newPlayerBullets.push(b);
  }
  s.playerBullets = newPlayerBullets;

  const playerY = s.h - 2;
  const newEnemyBullets = [];
  for (const b of s.enemyBullets) {
    const hitPlayer = (b.y === playerY && (b.x === s.playerX || b.x === s.playerX - 1 || b.x === s.playerX + 1));
    if (hitPlayer) {
      s.lives -= 1;
      if (s.lives <= 0) { s.lives = 0; s.gameOver = true; }
    } else {
      newEnemyBullets.push(b);
    }
  }
  s.enemyBullets = newEnemyBullets;

  if (s.score > s.best) { s.best = s.score; saveNumber('/etc/spaceinvaders-best.txt', s.best); }

  if (!s.gameOver && invaderCount(inv) === 0) { s.win = true; s.gameOver = true; }
}

function tick(s) {
  if (s.paused || s.gameOver) return;

  for (const b of s.playerBullets) b.y -= 1;
  s.playerBullets = s.playerBullets.filter((b) => b.y >= 0);

  for (const b of s.enemyBullets) b.y += 1;
  s.enemyBullets = s.enemyBullets.filter((b) => b.y < s.h);

  s.invStepCounter += 1;
  if (s.invStepCounter >= s.invStepEvery) { s.invStepCounter = 0; moveInvaders(s); }

  trySpawnEnemyBullet(s);
  collideBullets(s);
}

async function main(shell, command, args) {
  const { w, h } = computeDims(shell);

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  const makeState = () => {
    const best = Math.max(0, Math.floor(loadNumber('/etc/spaceinvaders-best.txt', 0)));
    const inv = makeInvaders(w);
    return {
      w,
      h,
      level: 1,
      invaders: inv,
      invOffsetX: 0,
      invOffsetY: 0,
      invDir: 1,
      invStepCounter: 0,
      invStepEvery: clamp(10 - Math.floor((1) / 2), 2, 10),
      playerX: Math.floor(w / 2),
      playerBullets: [],
      enemyBullets: [],
      score: 0,
      best,
      lives: 3,
      paused: false,
      gameOver: false,
      win: false,
      lastTickAt: Date.now(),
      tickMs: 50
    };
  };

  let s = makeState();

  function restart() { s = makeState(); }

  function nextLevel() {
    const best = s.best;
    const score = s.score;
    const lives = s.lives;
    const level = s.level + 1;

    s = makeState();
    s.best = best;
    s.score = score;
    s.lives = lives;
    s.level = level;

    s.invStepEvery = clamp(10 - Math.floor(level / 2), 2, 10);
    s.tickMs = clamp(55 - (level * 2), 25, 55);
  }

  try {
    let running = true;
    while (running) {
      render(shell, s);
      status(shell);

      const now = Date.now();
      if (now - s.lastTickAt >= s.tickMs) {
        s.lastTickAt = now;
        tick(s);

        if (s.gameOver && s.win) {
          await (shell && typeof shell.sleep === 'function' ? shell.sleep(250) : sleep(250));
          nextLevel();
        }
      }

      const keyEvent = await shell.readKey({ timeout: 25 });
      if (!keyEvent) continue;

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') { running = false; continue; }
      if (keyEvent.key === 'r') { restart(); continue; }
      if (keyEvent.key === 'p') { s.paused = !s.paused; continue; }
      if (s.paused || s.gameOver) continue;

      if (keyEvent.code === 'ArrowLeft') s.playerX = clamp(s.playerX - 2, 2, s.w - 3);
      if (keyEvent.code === 'ArrowRight') s.playerX = clamp(s.playerX + 2, 2, s.w - 3);

      if (keyEvent.code === 'Space' || keyEvent.code === 'Enter') {
        if (s.playerBullets.length < 2) s.playerBullets.push({ x: s.playerX, y: s.h - 3, vy: -1 });
      }
    }
  } finally {
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
