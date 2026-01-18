/* tetris.js (VFS) | ASCII tetris */

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

const PIECES = [
  { name: 'I', rotations: [ [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]] ] },
  { name: 'O', rotations: [ [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]] ] },
  { name: 'T', rotations: [ [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]] ] },
  { name: 'S', rotations: [ [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]] ] },
  { name: 'Z', rotations: [ [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]] ] },
  { name: 'J', rotations: [ [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]] ] },
  { name: 'L', rotations: [ [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]] ] }
];

function newBoard(w, h) { return Array.from({ length: h }, () => new Array(w).fill(0)); }

function collides(board, piece, px, py, rot) {
  const shape = piece.rotations[rot % 4];
  const h = board.length;
  const w = board[0].length;
  for (const [dx, dy] of shape) {
    const x = px + dx;
    const y = py + dy;
    if (x < 0 || x >= w || y >= h) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

function stamp(board, piece, px, py, rot) {
  const shape = piece.rotations[rot % 4];
  for (const [dx, dy] of shape) {
    const x = px + dx;
    const y = py + dy;
    if (y >= 0 && y < board.length && x >= 0 && x < board[0].length) board[y][x] = 1;
  }
}

function clearLines(board) {
  const w = board[0].length;
  let cleared = 0;
  for (let y = board.length - 1; y >= 0; y -= 1) {
    if (board[y].every((c) => c)) {
      board.splice(y, 1);
      board.unshift(new Array(w).fill(0));
      cleared += 1;
      y += 1;
    }
  }
  return cleared;
}

function scoreForLines(n) { if (n === 1) return 100; if (n === 2) return 300; if (n === 3) return 500; if (n === 4) return 800; return 0; }

function pickPiece() { return PIECES[Math.floor(Math.random() * PIECES.length)]; }

function computeDims(shell) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = viewport.cols || 80;
  const rows = viewport.rows || 24;
  const w = 10;
  let h = 20;
  if (rows < 26) h = clamp(rows - 6, 12, 20);
  const minCols = (w * 2) + 10;
  const minRows = h + 8;
  if (cols < minCols || rows < minRows) h = clamp(rows - 8, 10, h);
  return { w, h };
}

function computeDropMs(level) { return clamp(600 - (level * 50), 80, 600); }

function render(shell, s) {
  shell.clear();
  shell.print(`Tetris  |  Score: ${s.score}  |  Lines: ${s.lines}  |  Level: ${s.level}  |  Best: ${s.best}`);
  shell.print('');
  const top = '┌' + '─'.repeat(s.w * 2) + '┐';
  const bot = '└' + '─'.repeat(s.w * 2) + '┘';
  shell.print(top);

  for (let y = 0; y < s.h; y += 1) {
    let line = '│';
    for (let x = 0; x < s.w; x += 1) {
      let filled = s.board[y][x] ? 1 : 0;
      const shape = s.current.rotations[s.rot % 4];
      for (const [dx, dy] of shape) {
        const px = s.x + dx;
        const py = s.y + dy;
        if (px === x && py === y) filled = 1;
      }
      line += filled ? '██' : '  ';
    }
    line += '│';
    shell.print(line);
  }

  shell.print(bot);
  if (s.gameOver) { shell.print(''); shell.print('Game Over. Press r to restart.'); }
  else if (s.paused) { shell.print(''); shell.print('Paused. Press p to resume.'); }
}

function status(shell) { shell.setStatusLine('<span style="opacity:0.9;">Arrows move | Up rotate | Space hard drop | p pause | r restart | Esc/q quit</span>'); }

async function main(shell, command, args) {
  const BEST_PATH = '/etc/tetris-best.txt';
  const { w, h } = computeDims(shell);

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  const newState = () => ({
    w,
    h,
    board: newBoard(w, h),
    current: pickPiece(),
    next: pickPiece(),
    x: Math.floor((w - 4) / 2),
    y: -1,
    rot: 0,
    score: 0,
    lines: 0,
    level: 1,
    best: Math.max(0, Math.floor(loadNumber(BEST_PATH, 0))),
    paused: false,
    gameOver: false,
    lastDropAt: Date.now()
  });

  let s = newState();

  function tryMove(dx, dy) {
    const nx = s.x + dx;
    const ny = s.y + dy;
    if (!collides(s.board, s.current, nx, ny, s.rot)) {
      s.x = nx;
      s.y = ny;
      return true;
    }
    return false;
  }

  function tryRotate() {
    const nr = (s.rot + 1) % 4;
    if (!collides(s.board, s.current, s.x, s.y, nr)) { s.rot = nr; return true; }
    if (!collides(s.board, s.current, s.x - 1, s.y, nr)) { s.x -= 1; s.rot = nr; return true; }
    if (!collides(s.board, s.current, s.x + 1, s.y, nr)) { s.x += 1; s.rot = nr; return true; }
    return false;
  }

  function lockPiece() {
    stamp(s.board, s.current, s.x, s.y, s.rot);
    const cleared = clearLines(s.board);
    if (cleared) {
      s.lines += cleared;
      s.score += scoreForLines(cleared) * s.level;
      const nextLevel = 1 + Math.floor(s.lines / 10);
      s.level = clamp(nextLevel, 1, 20);
    }

    if (s.score > s.best) { s.best = s.score; saveNumber(BEST_PATH, s.best); }

    s.current = s.next;
    s.next = pickPiece();
    s.x = Math.floor((s.w - 4) / 2);
    s.y = -1;
    s.rot = 0;

    if (collides(s.board, s.current, s.x, s.y, s.rot)) s.gameOver = true;
  }

  try {
    let running = true;
    while (running) {
      render(shell, s);
      status(shell);

      const now = Date.now();
      if (!s.paused && !s.gameOver) {
        const dropMs = computeDropMs(s.level);
        if (now - s.lastDropAt >= dropMs) {
          if (!tryMove(0, 1)) lockPiece();
          s.lastDropAt = now;
        }
      }

      const keyEvent = await shell.readKey({ timeout: 50 });
      if (!keyEvent) continue;

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') { running = false; continue; }
      if (keyEvent.key === 'r') { s = newState(); continue; }
      if (keyEvent.key === 'p') { s.paused = !s.paused; continue; }
      if (s.paused || s.gameOver) continue;

      if (keyEvent.code === 'ArrowLeft') { tryMove(-1, 0); continue; }
      if (keyEvent.code === 'ArrowRight') { tryMove(1, 0); continue; }
      if (keyEvent.code === 'ArrowDown') {
        if (tryMove(0, 1)) {
          s.score += 1;
          if (s.score > s.best) { s.best = s.score; saveNumber(BEST_PATH, s.best); }
        } else {
          lockPiece();
        }
        s.lastDropAt = Date.now();
        continue;
      }
      if (keyEvent.code === 'ArrowUp') { tryRotate(); continue; }
      if (keyEvent.code === 'Space') {
        let dropped = 0;
        while (tryMove(0, 1)) dropped += 1;
        s.score += dropped * 2;
        lockPiece();
        s.lastDropAt = Date.now();
      }
    }
  } finally {
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
