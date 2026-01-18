/* roguelike.js (VFS) | Tiny ASCII roguelike (expanded) */

function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }
function randInt(maxExclusive) { return Math.floor(Math.random() * maxExclusive); }
function key(x, y) { return `${x},${y}`; }
function distManhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

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

function loadJson(path, fallback) {
  try {
    ensureEtcFolder();
    const raw = vfs.readFile(path);
    if (raw == null) return fallback;
    return JSON.parse(String(raw));
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

function computeDims(shell) {
  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = viewport.cols || 80;
  const rows = viewport.rows || 24;
  const w = clamp(cols - 6, 30, 120);
  const h = clamp(rows - 10, 16, 60);
  return { w, h };
}

function emptyMap(w, h) { return Array.from({ length: h }, () => new Array(w).fill('#')); }

function carveRoom(map, x, y, rw, rh) {
  for (let yy = y; yy < y + rh; yy += 1) {
    for (let xx = x; xx < x + rw; xx += 1) {
      if (yy > 0 && yy < map.length - 1 && xx > 0 && xx < map[0].length - 1) map[yy][xx] = '.';
    }
  }
}

function carveCorridor(map, x1, y1, x2, y2) {
  let x = x1;
  let y = y1;
  while (x !== x2) { map[y][x] = '.'; x += x < x2 ? 1 : -1; }
  while (y !== y2) { map[y][x] = '.'; y += y < y2 ? 1 : -1; }
  map[y][x] = '.';
}

function generateDungeon(w, h) {
  const map = emptyMap(w, h);
  const rooms = [];
  const roomCount = clamp(Math.floor((w * h) / 800), 6, 14);
  for (let i = 0; i < roomCount; i += 1) {
    const rw = clamp(6 + randInt(10), 6, 18);
    const rh = clamp(4 + randInt(8), 4, 12);
    const x = 2 + randInt(Math.max(1, w - rw - 4));
    const y = 2 + randInt(Math.max(1, h - rh - 4));
    carveRoom(map, x, y, rw, rh);
    rooms.push({ x, y, rw, rh, cx: x + Math.floor(rw / 2), cy: y + Math.floor(rh / 2) });
  }
  for (let i = 1; i < rooms.length; i += 1) {
    carveCorridor(map, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
  }
  return { map, rooms };
}

function findWalkable(map) {
  for (let y = 1; y < map.length - 1; y += 1) {
    for (let x = 1; x < map[0].length - 1; x += 1) {
      if (map[y][x] === '.') return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

function isWalkable(map, x, y) {
  if (x < 0 || y < 0 || y >= map.length || x >= map[0].length) return false;
  return map[y][x] === '.';
}

function addLog(s, msg) {
  if (!msg) return;
  if (!Array.isArray(s.log)) s.log = [];
  s.log.unshift(String(msg));
  s.log = s.log.slice(0, 3);
}

function status(shell) {
  shell.setStatusLine('<span style="opacity:0.9;">Arrows move | h heal | b shop | &gt; descend | r restart | Esc/q quit</span>');
}

function getDifficultyByName(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'easy') {
    return {
      name: 'easy',
      enemyCountMul: 0.85,
      enemyHpMul: 0.9,
      enemyDmgMul: 0.9,
      goldMul: 1.15,
      shopCostMul: 0.9,
      playerHpMul: 1.15,
      startPotions: 1
    };
  }
  if (n === 'hard') {
    return {
      name: 'hard',
      enemyCountMul: 1.2,
      enemyHpMul: 1.15,
      enemyDmgMul: 1.15,
      goldMul: 0.9,
      shopCostMul: 1.15,
      playerHpMul: 0.9,
      startPotions: 0
    };
  }
  return {
    name: 'normal',
    enemyCountMul: 1,
    enemyHpMul: 1,
    enemyDmgMul: 1,
    goldMul: 1,
    shopCostMul: 1,
    playerHpMul: 1,
    startPotions: 0
  };
}

function parseDifficultyFromArgs(args) {
  const a = Array.isArray(args) ? args.map((x) => String(x)) : [];
  if (!a.length) return null;
  const first = a[0].toLowerCase();
  if (first === 'easy' || first === 'normal' || first === 'hard') return first;

  for (let i = 0; i < a.length; i += 1) {
    const tok = a[i].toLowerCase();
    if (tok === '--difficulty' || tok === '-d') {
      const next = (a[i + 1] || '').toLowerCase();
      if (next === 'easy' || next === 'normal' || next === 'hard') return next;
    }
  }

  return null;
}

function computeVisibility(s) {
  const vis = new Set();
  const seen = s.seen || (s.seen = new Set());
  const r = typeof s.fovRadius === 'number' ? s.fovRadius : 7;
  const px = s.player.x;
  const py = s.player.y;

  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || y >= s.h || x >= s.w) continue;
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const k = key(x, y);
      vis.add(k);
      seen.add(k);
    }
  }

  s.visible = vis;
  s.seen = seen;
}

function padRight(s, w) {
  const str = String(s == null ? '' : s);
  if (w <= 0) return '';
  const cut = str.length > w ? str.slice(0, w) : str;
  return cut + ' '.repeat(Math.max(0, w - cut.length));
}

function buildSidebarLines(s, width, lineCount) {
  if (width < 18) return null;

  const lines = [];
  lines.push('Controls');
  lines.push('Arrows: move/atk');
  lines.push('h: potion');
  lines.push('>: descend');
  lines.push('b: shop');
  lines.push('1/2/3: buy');
  lines.push('r: restart');
  lines.push('q/Esc: quit');
  lines.push('');
  lines.push('Legend');
  lines.push('@ you  g/o/b/O foes');
  lines.push('! weapon  + potion');
  lines.push('$ gold    & shop');
  lines.push('> stairs');

  const diff = s.difficulty?.name || 'normal';
  lines.push('');
  lines.push(`Mode: ${diff}`);
  lines.push('Dungeon: random');

  const onShop = itemAt(s, s.player.x, s.player.y)?.type === 'shop';
  if (onShop) {
    const prices = shopPrices(s);
    lines.push('');
    lines.push('Shop prices');
    lines.push(`1) potion  ${prices.potion}g`);
    lines.push(`2) maxHP   ${prices.maxHp}g`);
    lines.push(`3) sharpen ${prices.sharpen}g`);
  }

  // Fit to the available height (map area + borders)
  const out = Array.from({ length: lineCount }, (_, i) => padRight(lines[i] || '', width));
  return out;
}

function render(shell, s) {
  computeVisibility(s);
  shell.clear();

  const weaponName = s.weapon?.name || 'None';
  const atk = (s.attackBase || 1) + (s.weapon?.bonus || 0);
  shell.print(
    `Roguelike  L${s.level}/${s.maxLevels}  |  HP: ${s.hp}/${s.maxHp}  |  ATK: ${atk} (${weaponName})  |  Gold: ${s.gold}  |  Potions: ${s.potions}  |  Score: ${s.score}  |  Best: ${s.best}`
  );
  shell.print('');

  const viewport = typeof shell.getViewportSize === 'function' ? shell.getViewportSize() : { cols: 80, rows: 24 };
  const cols = viewport.cols || 80;

  const top = '┌' + '─'.repeat(s.w) + '┐';
  const bot = '└' + '─'.repeat(s.w) + '┘';

  const gameLineLen = s.w + 2;
  const gap = 2;
  const sidebarWidth = Math.min(34, Math.max(0, cols - (gameLineLen + gap)));
  const sidebar = buildSidebarLines(s, sidebarWidth, s.h + 2);
  const withSidebar = (line, idx) => {
    if (!sidebar) return line;
    return line + ' '.repeat(gap) + sidebar[idx];
  };

  shell.print(withSidebar(top, 0));

  const enemyPos = new Map();
  for (const e of s.enemies) {
    const k = key(e.x, e.y);
    if (s.visible.has(k)) enemyPos.set(k, e);
  }

  const itemPos = new Map();
  if (s.items) {
    for (const [k, it] of s.items.entries()) {
      if (s.visible.has(k)) itemPos.set(k, it);
    }
  }

  const stairsKey = s.stairs ? key(s.stairs.x, s.stairs.y) : null;

  for (let y = 0; y < s.h; y += 1) {
    let line = '│';
    for (let x = 0; x < s.w; x += 1) {
      const k = key(x, y);
      if (!s.seen.has(k)) {
        line += ' ';
        continue;
      }

      let ch = s.map[y][x];
      if (!s.visible.has(k)) {
        // dim out non-visible explored tiles
        ch = (ch === '.') ? '·' : ch;
      } else {
        if (stairsKey && k === stairsKey) ch = '>';
        const it = itemPos.get(k);
        if (it) ch = it.ch;
        const e = enemyPos.get(k);
        if (e) ch = e.ch;
      }

      if (x === s.player.x && y === s.player.y) ch = '@';
      line += ch;
    }
    line += '│';
    shell.print(withSidebar(line, 1 + y));
  }

  shell.print(withSidebar(bot, s.h + 1));

  if (Array.isArray(s.log) && s.log.length) {
    shell.print('');
    for (let i = Math.min(2, s.log.length - 1); i >= 0; i -= 1) {
      shell.print(s.log[i]);
    }
  }

  // Shop info is shown in the right panel when available.

  if (s.dead) {
    shell.print('');
    shell.print('You died. Press r to restart.');
  } else if (s.win) {
    shell.print('');
    shell.print('You escaped the dungeon! Press r to restart.');
  }
}

function rollLoot(s, x, y) {
  if (!s.items) s.items = new Map();
  const k = key(x, y);
  if (s.items.has(k)) return;
  if (s.stairs && s.stairs.x === x && s.stairs.y === y) return;

  // Gold is common, potions are rarer
  if (Math.random() < 0.55) {
    const mul = s.difficulty?.goldMul || 1;
    const amount = clamp(Math.floor((4 + randInt(10) + (s.level * 2)) * mul), 3, 60);
    s.items.set(k, { type: 'gold', amount, ch: '$', name: `${amount} gold` });
    return;
  }

  if (Math.random() < 0.25) {
    s.items.set(k, { type: 'potion', heal: 6, ch: '+', name: 'Healing potion' });
  }
}

function moveEnemies(s) {
  const occupied = new Set([key(s.player.x, s.player.y)]);
  for (const e of s.enemies) occupied.add(key(e.x, e.y));

  let didHit = false;

  for (const e of s.enemies) {
    if (s.dead || s.win) break;

    if (distManhattan(e, s.player) <= 1) {
      const dmg = Math.max(1, e.dmg || 1);
      s.hp -= dmg;
      didHit = true;
      if (s.hp <= 0) {
        s.hp = 0;
        s.dead = true;
      }
      continue;
    }

    const candidates = [
      { x: e.x + 1, y: e.y },
      { x: e.x - 1, y: e.y },
      { x: e.x, y: e.y + 1 },
      { x: e.x, y: e.y - 1 }
    ].filter((p) => isWalkable(s.map, p.x, p.y) && !occupied.has(key(p.x, p.y)));

    if (!candidates.length) continue;

    // Greedy chase; random tie-break for a bit more variety
    let bestD = Infinity;
    let best = [];
    for (const c of candidates) {
      const d = distManhattan(c, s.player);
      if (d < bestD) { bestD = d; best = [c]; }
      else if (d === bestD) best.push(c);
    }

    const pick = best[randInt(best.length)];
    occupied.delete(key(e.x, e.y));
    e.x = pick.x;
    e.y = pick.y;
    occupied.add(key(e.x, e.y));
  }

  if (didHit) addLog(s, 'An enemy hits you.');
}

function enemyTemplate(level, kind) {
  const L = Math.max(1, level);
  if (kind === 'orc') return { name: 'Orc', ch: 'o', hp: 4 + Math.floor(L / 2), dmg: 2 + Math.floor(L / 3), score: 25 };
  if (kind === 'bat') return { name: 'Bat', ch: 'b', hp: 1 + Math.floor(L / 4), dmg: 1, score: 8 };
  if (kind === 'ogre') return { name: 'Ogre', ch: 'O', hp: 12 + (L * 2), dmg: 3 + Math.floor(L / 2), score: 120 };
  return { name: 'Goblin', ch: 'g', hp: 2 + Math.floor(L / 3), dmg: 1 + Math.floor(L / 4), score: 12 };
}

function pickEnemyKind(level) {
  const r = Math.random();
  if (level >= 3 && r < 0.35) return 'orc';
  if (r < 0.15) return 'bat';
  return 'goblin';
}

function randomWalkableFarFrom(map, w, h, from, minDist, blocked) {
  const tries = 2000;
  for (let i = 0; i < tries; i += 1) {
    const x = randInt(w);
    const y = randInt(h);
    if (!isWalkable(map, x, y)) continue;
    if (from && (Math.abs(x - from.x) + Math.abs(y - from.y) < minDist)) continue;
    const k = key(x, y);
    if (blocked && blocked.has(k)) continue;
    return { x, y };
  }
  return null;
}

function placeItemsForLevel(s, start) {
  if (!s.items) s.items = new Map();
  const blocked = new Set([key(start.x, start.y)]);

  // Shop (place one per level)
  const shopPos = randomWalkableFarFrom(s.map, s.w, s.h, start, 10, blocked);
  if (shopPos) {
    s.items.set(key(shopPos.x, shopPos.y), { type: 'shop', ch: '&', name: 'Merchant' });
    blocked.add(key(shopPos.x, shopPos.y));
  }

  // Weapon upgrades (hero gets a sword!)
  const currentBonus = s.weapon?.bonus || 0;
  if (s.level === 1 && currentBonus < 1) {
    const pos = randomWalkableFarFrom(s.map, s.w, s.h, start, 10, blocked);
    if (pos) {
      s.items.set(key(pos.x, pos.y), { type: 'weapon', ch: '!', weapon: { name: 'Rusty Sword', bonus: 1 } });
      blocked.add(key(pos.x, pos.y));
    }
  }
  if (s.level === 3 && currentBonus < 2) {
    const pos = randomWalkableFarFrom(s.map, s.w, s.h, start, 10, blocked);
    if (pos) {
      s.items.set(key(pos.x, pos.y), { type: 'weapon', ch: '!', weapon: { name: 'Steel Sword', bonus: 2 } });
      blocked.add(key(pos.x, pos.y));
    }
  }
  if (s.level === 5 && currentBonus < 3) {
    const pos = randomWalkableFarFrom(s.map, s.w, s.h, start, 12, blocked);
    if (pos) {
      s.items.set(key(pos.x, pos.y), { type: 'weapon', ch: '!', weapon: { name: 'Knight Sword', bonus: 3 } });
      blocked.add(key(pos.x, pos.y));
    }
  }

  // Potions
  const potionCount = clamp(1 + Math.floor(s.level / 2) + randInt(2), 1, 5);
  for (let i = 0; i < potionCount; i += 1) {
    const pos = randomWalkableFarFrom(s.map, s.w, s.h, start, 6, blocked);
    if (!pos) break;
    s.items.set(key(pos.x, pos.y), { type: 'potion', heal: 6, ch: '+', name: 'Healing potion' });
    blocked.add(key(pos.x, pos.y));
  }

  // Gold piles
  const goldCount = clamp(3 + Math.floor(s.level / 2) + randInt(3), 3, 10);
  for (let i = 0; i < goldCount; i += 1) {
    const pos = randomWalkableFarFrom(s.map, s.w, s.h, start, 4, blocked);
    if (!pos) break;
    const mul = s.difficulty?.goldMul || 1;
    const amount = clamp(Math.floor((3 + randInt(12) + (s.level * 2)) * mul), 2, 70);
    s.items.set(key(pos.x, pos.y), { type: 'gold', amount, ch: '$', name: `${amount} gold` });
    blocked.add(key(pos.x, pos.y));
  }
}

function generateLevel(s, w, h, level, freshRun) {
  const { map, rooms } = generateDungeon(w, h);
  const start = rooms[0] ? { x: rooms[0].cx, y: rooms[0].cy } : findWalkable(map);

  const blocked = new Set([key(start.x, start.y)]);

  // Stairs to the next level
  const stairsPos = randomWalkableFarFrom(map, w, h, start, 14, blocked) || findWalkable(map);
  blocked.add(key(stairsPos.x, stairsPos.y));

  // Enemies scale with level
  const enemies = [];
  // Slightly lower overall density for a calmer pace
  const base = clamp(Math.floor((w * h) / 520), 5, 14);
  const diff = s.difficulty || getDifficultyByName('normal');
  const enemyCount = clamp(Math.floor((base + (level * 2)) * (diff.enemyCountMul || 1)), 5, 45);
  let tries = 0;
  while (enemies.length < enemyCount && tries < enemyCount * 80) {
    tries += 1;
    const pos = randomWalkableFarFrom(map, w, h, start, 8, blocked);
    if (!pos) break;
    const kind = pickEnemyKind(level);
    const tpl = enemyTemplate(level, kind);
    enemies.push({
      x: pos.x,
      y: pos.y,
      name: tpl.name,
      ch: tpl.ch,
      hp: Math.max(1, Math.floor((tpl.hp || 1) * (diff.enemyHpMul || 1))),
      dmg: Math.max(1, Math.floor((tpl.dmg || 1) * (diff.enemyDmgMul || 1))),
      score: tpl.score
    });
    blocked.add(key(pos.x, pos.y));
  }

  // Boss on final level
  if (level === s.maxLevels) {
    const bossPos = randomWalkableFarFrom(map, w, h, start, 16, blocked);
    if (bossPos) {
      const tpl = enemyTemplate(level, 'ogre');
      const diff2 = s.difficulty || getDifficultyByName('normal');
      enemies.push({
        x: bossPos.x,
        y: bossPos.y,
        name: tpl.name,
        ch: tpl.ch,
        hp: Math.max(1, Math.floor((tpl.hp || 1) * (diff2.enemyHpMul || 1))),
        dmg: Math.max(1, Math.floor((tpl.dmg || 1) * (diff2.enemyDmgMul || 1))),
        score: tpl.score
      });
      blocked.add(key(bossPos.x, bossPos.y));
    }
  }

  s.w = w;
  s.h = h;
  s.level = level;
  s.map = map;
  s.player = { ...start };
  s.enemies = enemies;
  s.items = new Map();
  s.stairs = stairsPos;
  s.seen = new Set();
  s.visible = new Set();
  s.log = [];

  if (freshRun) {
    addLog(s, `You enter the dungeon (${s.difficulty?.name || 'normal'}).`);
    addLog(s, 'Find a sword (!) and reach the stairs (>).');
  } else {
    addLog(s, `You descend to level ${level}.`);
  }

  placeItemsForLevel(s, start);
}

function itemAt(s, x, y) {
  if (!s.items) return null;
  return s.items.get(key(x, y)) || null;
}

function takeItem(s, x, y) {
  if (!s.items) return null;
  const k = key(x, y);
  const it = s.items.get(k) || null;
  if (it) s.items.delete(k);
  return it;
}

function playerAttackDamage(s) {
  return (s.attackBase || 1) + (s.weapon?.bonus || 0);
}

function tryPickupHere(s) {
  const it = itemAt(s, s.player.x, s.player.y);
  if (!it) return;

  if (it.type === 'shop') {
    if (!s._sawShop) {
      s._sawShop = true;
      addLog(s, 'A merchant greets you. Press b to shop.');
    }
    return;
  }

  takeItem(s, s.player.x, s.player.y);

  if (it.type === 'gold') {
    const amount = Math.max(1, Math.floor(it.amount || 1));
    s.gold += amount;
    s.score += Math.floor(amount / 2);
    addLog(s, `You pick up ${amount} gold.`);
    return;
  }

  if (it.type === 'potion') {
    s.potions = clamp((s.potions || 0) + 1, 0, 9);
    addLog(s, 'You pick up a healing potion (+).');
    return;
  }

  if (it.type === 'weapon' && it.weapon) {
    const w = it.weapon;
    const curBonus = s.weapon?.bonus || 0;
    if (!s.weapon || (w.bonus || 0) > curBonus) {
      s.weapon = { name: String(w.name || 'Sword'), bonus: Math.max(0, Math.floor(w.bonus || 0)) };
      addLog(s, `You equip: ${s.weapon.name}.`);
    } else {
      addLog(s, `You find a ${String(w.name || 'sword')}, but keep your current weapon.`);
    }
  }
}

function shopPrices(s) {
  const diff = s.difficulty || getDifficultyByName('normal');
  const mul = diff.shopCostMul || 1;
  const L = Math.max(1, s.level || 1);
  return {
    potion: Math.max(1, Math.floor((10 + (L * 2)) * mul)),
    maxHp: Math.max(1, Math.floor((25 + (L * 5)) * mul)),
    sharpen: Math.max(1, Math.floor((30 + (L * 6)) * mul))
  };
}

function tryBuy(s, which) {
  const onShop = itemAt(s, s.player.x, s.player.y)?.type === 'shop';
  if (!onShop) {
    addLog(s, 'No shop here.');
    return false;
  }

  const prices = shopPrices(s);
  const spend = (cost) => {
    if ((s.gold || 0) < cost) {
      addLog(s, `Not enough gold (${cost}g).`);
      return false;
    }
    s.gold -= cost;
    return true;
  };

  if (which === '1') {
    if ((s.potions || 0) >= 9) { addLog(s, 'You cannot carry more potions.'); return false; }
    if (!spend(prices.potion)) return false;
    s.potions = clamp((s.potions || 0) + 1, 0, 9);
    addLog(s, 'Bought: potion.');
    return true;
  }

  if (which === '2') {
    if (!spend(prices.maxHp)) return false;
    s.maxHp = clamp((s.maxHp || 10) + 1, 6, 80);
    s.hp = clamp((s.hp || 0) + 1, 0, s.maxHp);
    addLog(s, 'Bought: max HP +1.');
    return true;
  }

  if (which === '3') {
    if (!spend(prices.sharpen)) return false;
    s.attackBase = clamp((s.attackBase || 1) + 1, 1, 20);
    addLog(s, 'Bought: sharpen (+1 ATK).');
    return true;
  }

  return false;
}

function usePotion(s) {
  if ((s.potions || 0) <= 0) {
    addLog(s, 'No potions left.');
    return false;
  }
  if (s.hp >= s.maxHp) {
    addLog(s, 'You are already at full health.');
    return false;
  }
  s.potions -= 1;
  const heal = 6;
  s.hp = clamp(s.hp + heal, 0, s.maxHp);
  addLog(s, `You drink a potion and heal ${heal} HP.`);
  return true;
}

function tryDescend(s, w, h) {
  if (!s.stairs || s.player.x !== s.stairs.x || s.player.y !== s.stairs.y) {
    addLog(s, 'No stairs here.');
    return false;
  }

  if (s.level >= s.maxLevels) {
    s.win = true;
    addLog(s, 'You climb out into the sunlight.');
    return true;
  }

  // Small reward for progressing
  s.maxHp = clamp((s.maxHp || 10) + 1, 6, 60);
  s.hp = clamp((s.hp || 0) + 2, 0, s.maxHp);
  generateLevel(s, w, h, s.level + 1, false);
  return true;
}

function attackEnemyAt(s, x, y) {
  for (let i = 0; i < s.enemies.length; i += 1) {
    const e = s.enemies[i];
    if (e.x !== x || e.y !== y) continue;

    const dmg = playerAttackDamage(s);
    e.hp -= dmg;
    addLog(s, `You hit the ${e.name} for ${dmg}.`);
    if (e.hp <= 0) {
      s.enemies.splice(i, 1);
      s.score += Math.max(1, Math.floor(e.score || 10));
      addLog(s, `You slay the ${e.name}.`);
      rollLoot(s, x, y);
    }
    return true;
  }
  return false;
}

function tryMovePlayer(s, dx, dy) {
  const nx = s.player.x + dx;
  const ny = s.player.y + dy;
  if (!isWalkable(s.map, nx, ny)) {
    addLog(s, 'You bump into a wall.');
    return false;
  }

  // Attack if enemy is present
  for (const e of s.enemies) {
    if (e.x === nx && e.y === ny) {
      return attackEnemyAt(s, nx, ny);
    }
  }

  s.player.x = nx;
  s.player.y = ny;
  tryPickupHere(s);
  return true;
}

async function main(shell, command, args) {
  const BEST_PATH_JSON = '/etc/roguelike-best.json';
  const SETTINGS_PATH = '/etc/roguelike-settings.json';
  const { w, h } = computeDims(shell);

  const stored = loadJson(SETTINGS_PATH, { difficulty: 'normal' }) || { difficulty: 'normal' };
  const fromArgs = parseDifficultyFromArgs(args);
  const difficultyName = fromArgs || stored.difficulty || 'normal';
  const difficulty = getDifficultyByName(difficultyName);
  if (fromArgs) saveJson(SETTINGS_PATH, { ...(stored || {}), difficulty: difficulty.name });

  // High scores are tracked per difficulty.
  let bestByDifficulty = loadJson(BEST_PATH_JSON, null);
  if (!bestByDifficulty || typeof bestByDifficulty !== 'object') {
    bestByDifficulty = { easy: 0, normal: 0, hard: 0 };
    saveJson(BEST_PATH_JSON, bestByDifficulty);
  }
  const getBestFor = (diffName) => Math.max(0, Math.floor(Number(bestByDifficulty?.[diffName] || 0)));

  shell.enterProgramMode();
  shell.enterFullscreenMode();
  const exitRaw = typeof shell.enterRawMode === 'function' ? shell.enterRawMode({ hideInput: true }) : null;

  const makeRun = () => {
    const best = getBestFor(difficulty.name);
    const startMaxHp = clamp(Math.floor(10 * (difficulty.playerHpMul || 1)), 6, 60);
    const s = {
      w,
      h,
      difficulty,
      maxLevels: 5,
      level: 1,
      map: null,
      player: { x: 1, y: 1 },
      enemies: [],
      items: new Map(),
      stairs: null,
      seen: new Set(),
      visible: new Set(),
      fovRadius: 7,
      attackBase: 1,
      weapon: null,
      maxHp: startMaxHp,
      hp: startMaxHp,
      potions: difficulty.startPotions || 0,
      gold: 0,
      score: 0,
      best,
      dead: false,
      win: false,
      log: [],
      _sawShop: false
    };

    generateLevel(s, w, h, 1, true);
    return s;
  };

  let s = makeRun();

  function saveBest() {
    if (s.score > s.best) {
      s.best = s.score;
      bestByDifficulty[difficulty.name] = s.best;
      saveJson(BEST_PATH_JSON, bestByDifficulty);
    }
  }

  try {
    let running = true;
    while (running) {
      saveBest();
      render(shell, s);
      status(shell);

      const keyEvent = await shell.readKey({ timeout: 250 });
      if (!keyEvent) continue;

      if (keyEvent.code === 'Escape' || keyEvent.key === 'q') { running = false; continue; }
      if (keyEvent.key === 'r') { s = makeRun(); continue; }

      if (s.dead || s.win) continue;

      if (keyEvent.key === 'h') {
        usePotion(s);
        continue;
      }

      if (keyEvent.key === '>') {
        tryDescend(s, w, h);
        continue;
      }

      if (keyEvent.key === 'b') {
        const onShop = itemAt(s, s.player.x, s.player.y)?.type === 'shop';
        if (onShop) addLog(s, 'Shop: press 1 (potion), 2 (max HP), 3 (sharpen).');
        else addLog(s, 'No shop here.');
        continue;
      }

      if (keyEvent.key === '1' || keyEvent.key === '2' || keyEvent.key === '3') {
        tryBuy(s, keyEvent.key);
        continue;
      }

      let acted = false;
      if (keyEvent.code === 'ArrowUp') acted = tryMovePlayer(s, 0, -1);
      if (keyEvent.code === 'ArrowDown') acted = tryMovePlayer(s, 0, 1);
      if (keyEvent.code === 'ArrowLeft') acted = tryMovePlayer(s, -1, 0);
      if (keyEvent.code === 'ArrowRight') acted = tryMovePlayer(s, 1, 0);

      if (acted) {
        moveEnemies(s);
        tryPickupHere(s);
      }

      // death check
      if (s.hp <= 0) {
        s.hp = 0;
        s.dead = true;
      }
    }
  } finally {
    if (typeof exitRaw === 'function') exitRaw();
    shell.clearStatusLine();
    shell.exitFullscreenMode();
    shell.exitProgramMode();
  }
}
