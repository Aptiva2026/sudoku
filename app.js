/* ============================================================
   数独 · Sudoku
   生成器 / 求解器 / 游戏逻辑 / 交互
   ============================================================ */

'use strict';

/* ---------------- 基础工具 ---------------- */
const ALL = 0x1ff;                        // 9 位全 1
const BIT = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];
const BIT2DIGIT = new Uint8Array(512);
for (let d = 1; d <= 9; d++) BIT2DIGIT[BIT[d]] = d;

const boxOf = i => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
const rowOf = i => (i / 9) | 0;
const colOf = i => i % 9;

function bitCount(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const $ = id => document.getElementById(id);

/* ---------------- 求解器 ---------------- */

/** 统计解的个数，最多数到 limit（用于唯一解校验） */
function countSolutions(grid, limit = 2) {
  const g = Uint8Array.from(grid);
  const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);

  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = BIT[v], r = rowOf(i), c = colOf(i), bi = boxOf(i);
    if ((rows[r] | cols[c] | boxes[bi]) & b) return 0;   // 初始盘面就冲突
    rows[r] |= b; cols[c] |= b; boxes[bi] |= b;
  }

  let count = 0;

  function rec() {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & ALL;
      const n = bitCount(mask);
      if (n === 0) return;                 // 死路，剪枝
      if (n < bestN) { bestN = n; best = i; bestMask = mask; if (n === 1) break; }
    }
    if (best === -1) { count++; return; }  // 填满 = 一个解

    const r = rowOf(best), c = colOf(best), bi = boxOf(best);
    let m = bestMask;
    while (m) {
      const bit = m & -m;
      m ^= bit;
      g[best] = BIT2DIGIT[bit];
      rows[r] |= bit; cols[c] |= bit; boxes[bi] |= bit;
      rec();
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[bi] &= ~bit;
      g[best] = 0;
      if (count >= limit) return;
    }
  }

  rec();
  return count;
}

/** 随机生成一个完整解 */
function fullSolution() {
  const g = new Uint8Array(81);
  const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);

  function rec() {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & ALL;
      const n = bitCount(mask);
      if (n === 0) return false;
      if (n < bestN) { bestN = n; best = i; bestMask = mask; if (n === 1) break; }
    }
    if (best === -1) return true;

    const r = rowOf(best), c = colOf(best), bi = boxOf(best);
    const bits = [];
    let m = bestMask;
    while (m) { const bit = m & -m; m ^= bit; bits.push(bit); }
    shuffle(bits);

    for (const bit of bits) {
      g[best] = BIT2DIGIT[bit];
      rows[r] |= bit; cols[c] |= bit; boxes[bi] |= bit;
      if (rec()) return true;
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[bi] &= ~bit;
      g[best] = 0;
    }
    return false;
  }

  rec();
  return g;
}

/* ---------------- 难度评估：只用人可用的技巧能否解出 ---------------- */

function buildMasks(g) {
  const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const b = BIT[v];
    rows[rowOf(i)] |= b; cols[colOf(i)] |= b; boxes[boxOf(i)] |= b;
  }
  return { rows, cols, boxes };
}

function candMask(g, masks, i) {
  return ~(masks.rows[rowOf(i)] | masks.cols[colOf(i)] | masks.boxes[boxOf(i)]) & ALL;
}

/** 找出一个「隐性唯一」：某数字在某行/列/宫内只剩一个可放位置 */
function findHiddenSingle(g, masks) {
  const { rows, cols, boxes } = masks;

  for (let d = 1; d <= 9; d++) {
    const bit = BIT[d];

    for (let u = 0; u < 9; u++) {
      // 行
      if (!(rows[u] & bit)) {
        let pos = -1, n = 0;
        for (let k = 0; k < 9 && n < 2; k++) {
          const i = u * 9 + k;
          if (g[i]) continue;
          if (!(candMask(g, masks, i) & bit)) { pos = i; n++; }
        }
        if (n === 1) return { i: pos, d };
      }
      // 列
      if (!(cols[u] & bit)) {
        let pos = -1, n = 0;
        for (let k = 0; k < 9 && n < 2; k++) {
          const i = k * 9 + u;
          if (g[i]) continue;
          if (!(candMask(g, masks, i) & bit)) { pos = i; n++; }
        }
        if (n === 1) return { i: pos, d };
      }
      // 宫
      if (!(boxes[u] & bit)) {
        const br = ((u / 3) | 0) * 3, bc = (u % 3) * 3;
        let pos = -1, n = 0;
        for (let k = 0; k < 9 && n < 2; k++) {
          const i = (br + ((k / 3) | 0)) * 9 + bc + (k % 3);
          if (g[i]) continue;
          if (!(candMask(g, masks, i) & bit)) { pos = i; n++; }
        }
        if (n === 1) return { i: pos, d };
      }
    }
  }
  return null;
}

/** 只用「唯一候选 + 隐性唯一」反复推进，能解完返回 true */
function solvableBySingles(grid) {
  const g = Uint8Array.from(grid);
  const masks = buildMasks(g);
  const place = (i, d) => {
    g[i] = d;
    const b = BIT[d];
    masks.rows[rowOf(i)] |= b; masks.cols[colOf(i)] |= b; masks.boxes[boxOf(i)] |= b;
  };

  for (;;) {
    let progress = false;

    // 1. 唯一候选
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = candMask(g, masks, i);
      if (mask === 0) return false;
      if (bitCount(mask) === 1) { place(i, BIT2DIGIT[mask]); progress = true; }
    }
    if (progress) continue;

    // 2. 隐性唯一
    const hs = findHiddenSingle(g, masks);
    if (hs) { place(hs.i, hs.d); continue; }

    break;
  }

  for (let i = 0; i < 81; i++) if (!g[i]) return false;
  return true;
}

/* ---------------- 谜题生成 ---------------- */

const DIFFICULTIES = [
  { key: 'easy',   name: '简单', desc: '基础排除法即可，适合热身', clues: 42, needSingles: true },
  { key: 'medium', name: '中等', desc: '需要一点候选数推理',       clues: 35, needSingles: true },
  { key: 'hard',   name: '困难', desc: '用到区块排除等进阶技巧',   clues: 29, needSingles: false },
  { key: 'expert', name: '专家', desc: '空格极多，考验耐心与逻辑', clues: 24, needSingles: false }
];

function digHoles(solution, targetClues) {
  const puzzle = Uint8Array.from(solution);
  const order = shuffle(Array.from({ length: 81 }, (_, i) => i));
  let clues = 81;

  for (const i of order) {
    if (clues <= targetClues) break;
    const backup = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = backup;  // 必须保持唯一解
    else clues--;
  }
  return { puzzle, clues };
}

function generatePuzzle(diffKey) {
  const cfg = DIFFICULTIES.find(d => d.key === diffKey) || DIFFICULTIES[0];

  for (let attempt = 0; attempt < 14; attempt++) {
    const solution = fullSolution();
    const { puzzle, clues } = digHoles(solution, cfg.clues);
    const easy = solvableBySingles(puzzle);

    // 难度校验：简单/中等必须能纯逻辑单值推出；困难/专家必须不能
    if (cfg.needSingles && !easy) continue;
    if (!cfg.needSingles && easy && clues > cfg.clues + 2) continue;

    return { puzzle, solution, clues, difficulty: cfg.key };
  }

  // 兜底：放宽难度校验
  const solution = fullSolution();
  const { puzzle, clues } = digHoles(solution, cfg.clues);
  return { puzzle, solution, clues, difficulty: cfg.key };
}

/* ---------------- 游戏状态 ---------------- */

const STORAGE_KEY = 'sudoku.save.v1';

const state = {
  difficulty: 'easy',
  puzzle: new Uint8Array(81),
  solution: new Uint8Array(81),
  board: new Uint8Array(81),
  notes: new Uint16Array(81),
  selected: -1,
  notesMode: false,
  mistakes: 0,
  elapsed: 0,
  running: false,
  paused: false,
  finished: false,
  history: [],
  hinted: -1
};

let cellEls = [];
let timerId = null;

/* ---------------- 渲染 ---------------- */

function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  cellEls = [];

  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = i;
    el.setAttribute('role', 'gridcell');

    const r = rowOf(i), c = colOf(i);
    if ((Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1) el.classList.add('box-alt');

    const val = document.createElement('span');
    val.className = 'val';

    const notes = document.createElement('div');
    notes.className = 'notes';
    for (let d = 1; d <= 9; d++) {
      const s = document.createElement('span');
      s.textContent = '';
      notes.appendChild(s);
    }

    el.append(val, notes);
    board.appendChild(el);
    cellEls.push({ el, val, notes, noteSpans: Array.from(notes.children) });
  }

  board.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    selectCell(Number(cell.dataset.i));
  });
}

function render() {
  const sel = state.selected;
  const selVal = sel >= 0 ? state.board[sel] : 0;
  const selR = sel >= 0 ? rowOf(sel) : -1;
  const selC = sel >= 0 ? colOf(sel) : -1;
  const selB = sel >= 0 ? boxOf(sel) : -1;

  for (let i = 0; i < 81; i++) {
    const { el, val, notes, noteSpans } = cellEls[i];
    const v = state.board[i];
    const given = state.puzzle[i] !== 0;

    el.className = 'cell';
    const r = rowOf(i), c = colOf(i);
    if ((Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1) el.classList.add('box-alt');

    if (sel >= 0) {
      if (r === selR || c === selC || boxOf(i) === selB) el.classList.add('peer');
      if (selVal && v === selVal && i !== sel) el.classList.add('same');
      if (i === sel) el.classList.add('sel');
    }

    if (given) el.classList.add('given');
    else if (v) {
      el.classList.add('user');
      if (v !== state.solution[i]) el.classList.add('wrong');
    }

    if (i === state.hinted) el.classList.add('hinted');

    // 数值
    if (v) {
      val.textContent = v;
      notes.style.display = 'none';
    } else {
      val.textContent = '';
      const n = state.notes[i];
      if (n) {
        notes.style.display = '';
        for (let d = 1; d <= 9; d++) {
          const s = noteSpans[d - 1];
          s.textContent = (n & BIT[d]) ? d : '';
          s.className = selVal && selVal === d ? 'hi' : '';
        }
      } else {
        notes.style.display = 'none';
      }
    }
  }

  // 数字键剩余数量
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (state.board[i]) counts[state.board[i]]++;
  for (let d = 1; d <= 9; d++) {
    const key = keyEls[d - 1];
    if (!key) continue;
    const left = 9 - counts[d];
    key.querySelector('.left').textContent = left > 0 ? left : '';
    key.classList.toggle('done', left <= 0);
  }

  $('mistakes').textContent = state.mistakes;
  $('mistakes').classList.toggle('danger', state.mistakes > 0);
  $('btnUndo').classList.toggle('dim', state.history.length === 0);
  $('diffLabel').textContent = currentDiff().name;
}

function currentDiff() {
  return DIFFICULTIES.find(d => d.key === state.difficulty) || DIFFICULTIES[0];
}

/* ---------------- 操作 ---------------- */

function snapshot() {
  state.history.push({
    board: Uint8Array.from(state.board),
    notes: Uint16Array.from(state.notes),
    mistakes: state.mistakes
  });
  if (state.history.length > 300) state.history.shift();
}

function selectCell(i) {
  if (state.paused || state.finished) return;
  state.selected = state.selected === i ? -1 : i;
  state.hinted = -1;
  render();
}

function inputDigit(d) {
  if (state.paused || state.finished) return;
  const i = state.selected;
  if (i < 0 || state.puzzle[i]) return;

  state.hinted = -1;

  if (state.notesMode) {
    if (state.board[i]) return;                 // 已填数字不记笔记
    snapshot();
    state.notes[i] ^= BIT[d];
    render();
    save();
    return;
  }

  if (state.board[i] === d) {                   // 再按一次 → 清除
    snapshot();
    state.board[i] = 0;
    render(); save();
    return;
  }

  snapshot();
  state.board[i] = d;

  if (d !== state.solution[i]) {
    state.mistakes++;
    // 错误答案：清空该格笔记
    state.notes[i] = 0;
  } else {
    // 正确 → 清除同行列宫的该数字笔记
    state.notes[i] = 0;
    clearPeerNotes(i, d);
  }

  render();
  save();

  if (d === state.solution[i]) {
    cellEls[i].el.classList.add('justSet');
    setTimeout(() => cellEls[i] && cellEls[i].el.classList.remove('justSet'), 220);
    vibrate(8);
  } else {
    vibrate([12, 40, 12]);
  }

  checkWin();
}

function clearPeerNotes(i, d) {
  const r = rowOf(i), c = colOf(i), b = boxOf(i);
  for (let k = 0; k < 81; k++) {
    if (rowOf(k) === r || colOf(k) === c || boxOf(k) === b) {
      state.notes[k] &= ~BIT[d];
    }
  }
}

function eraseCell() {
  const i = state.selected;
  if (state.paused || state.finished || i < 0 || state.puzzle[i]) return;
  if (!state.board[i] && !state.notes[i]) return;
  snapshot();
  state.board[i] = 0;
  state.notes[i] = 0;
  state.hinted = -1;
  render(); save();
}

function undo() {
  if (state.paused || state.finished) return;
  const prev = state.history.pop();
  if (!prev) return;
  state.board = prev.board;
  state.notes = prev.notes;
  state.mistakes = prev.mistakes;
  state.hinted = -1;
  render(); save();
}

function toggleNotes() {
  state.notesMode = !state.notesMode;
  $('btnNotes').classList.toggle('active', state.notesMode);
}

/** 提示：优先给一个「逻辑上可推出」的格子 */
function hint() {
  if (state.paused || state.finished) return;

  const g = Uint8Array.from(state.board);
  const masks = buildMasks(g);

  // 先找唯一候选
  for (let i = 0; i < 81; i++) {
    if (g[i] || state.puzzle[i]) continue;
    const mask = candMask(g, masks, i);
    if (bitCount(mask) === 1) { applyHint(i, BIT2DIGIT[mask]); return; }
  }
  // 再找隐性唯一
  const hs = findHiddenSingle(g, masks);
  if (hs) { applyHint(hs.i, hs.d); return; }

  // 兜底：从答案里挑一个空格
  const empties = [];
  for (let i = 0; i < 81; i++) if (!state.board[i]) empties.push(i);
  if (!empties.length) return;
  const pick = empties[(Math.random() * empties.length) | 0];
  applyHint(pick, state.solution[pick]);
}

function applyHint(i, d) {
  snapshot();
  state.board[i] = d;
  state.notes[i] = 0;
  clearPeerNotes(i, d);
  state.selected = i;
  state.hinted = i;
  render(); save();
  vibrate(6);
  checkWin();
}

function checkWin() {
  for (let i = 0; i < 81; i++) if (state.board[i] !== state.solution[i]) return;
  state.finished = true;
  state.running = false;
  stopTimer();
  save();

  // 波浪动画
  const order = Array.from({ length: 81 }, (_, i) => i)
    .sort((a, b) => (rowOf(a) + colOf(a)) - (rowOf(b) + colOf(b)));
  order.forEach((idx, n) => {
    setTimeout(() => {
      if (!cellEls[idx]) return;
      cellEls[idx].el.classList.add('win');
      setTimeout(() => cellEls[idx] && cellEls[idx].el.classList.remove('win'), 520);
    }, n * 11);
  });

  setTimeout(() => {
    burstConfetti();
    showVeil('完成！', `${currentDiff().name} · 用时 ${fmt(state.elapsed)} · 错误 ${state.mistakes} 次`, '再来一局');
  }, 620);
}

function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
}

/* ---------------- 计时 ---------------- */

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  if (state.paused || state.finished) return;
  state.running = true;
  timerId = setInterval(() => {
    state.elapsed++;
    $('timer').textContent = fmt(state.elapsed);
    if (state.elapsed % 10 === 0) save();
  }, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  state.running = false;
}

/* ---------------- 暂停 ---------------- */

function togglePause() {
  if (state.finished) return;
  state.paused = !state.paused;
  if (state.paused) {
    stopTimer();
    showVeil('已暂停', '进度已保存', '继续');
  } else {
    hideVeil();
    startTimer();
  }
  setPauseIcon(state.paused);
  $('btnPause').classList.toggle('active', state.paused);
}

function setPauseIcon(paused) {
  $('pauseIcon').innerHTML = paused
    ? '<path d="M8 5.2l10.5 6.8L8 18.8z"/>'
    : '<rect x="7" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2"/>';
}

function showVeil(title, sub, btnText) {
  $('veilTitle').textContent = title;
  $('veilSub').textContent = sub;
  $('veilBtn').textContent = btnText;
  $('veil').classList.add('on');
}

function hideVeil() {
  $('veil').classList.remove('on');
}

/* ---------------- 彩带 ---------------- */

function burstConfetti() {
  const cv = $('confetti');
  const shell = document.querySelector('.board-shell');
  const w = shell.clientWidth * 1.4, h = shell.clientHeight * 1.4;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const colors = ['#2f6df6', '#12a150', '#f5a524', '#e5484d', '#8b5cf6', '#0ea5e9'];
  const parts = [];
  for (let i = 0; i < 90; i++) {
    parts.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 9 - 2,
      g: 0.26 + Math.random() * 0.12,
      s: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
      life: 1
    });
  }

  let raf = null;
  function tick() {
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.995;
      p.rot += p.vr;
      p.life -= 0.008;
      if (p.life <= 0) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, w, h); raf = null; }
  }
  if (raf) cancelAnimationFrame(raf);
  tick();
}

/* ---------------- 新游戏 ---------------- */

let busyTimer = null;

function newGame(diffKey) {
  const diff = DIFFICULTIES.find(d => d.key === diffKey) || DIFFICULTIES[0];

  $('busy').classList.add('on');
  hideVeil();
  stopTimer();

  // 让浏览器先画出 loading，再跑生成（避免卡白屏）
  setTimeout(() => {
    const { puzzle, solution } = generatePuzzle(diff.key);

    state.difficulty = diff.key;
    state.puzzle = puzzle;
    state.solution = solution;
    state.board = Uint8Array.from(puzzle);
    state.notes = new Uint16Array(81);
    state.selected = -1;
    state.mistakes = 0;
    state.elapsed = 0;
    state.finished = false;
    state.paused = false;
    state.history = [];
    state.hinted = -1;

    $('timer').textContent = '00:00';
    $('diffLabel').textContent = diff.name;
    $('btnPause').classList.remove('active');
    $('busy').classList.remove('on');

    render();
    save();
    startTimer();
  }, 40);
}

/* ---------------- 持久化 ---------------- */

function save() {
  try {
    const data = {
      difficulty: state.difficulty,
      puzzle: Array.from(state.puzzle),
      solution: Array.from(state.solution),
      board: Array.from(state.board),
      notes: Array.from(state.notes),
      mistakes: state.mistakes,
      elapsed: state.elapsed,
      finished: state.finished,
      paused: state.paused
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* 隐私模式可能不可用 */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.puzzle) || d.puzzle.length !== 81) return false;

    state.difficulty = d.difficulty || 'easy';
    state.puzzle = Uint8Array.from(d.puzzle);
    state.solution = Uint8Array.from(d.solution);
    state.board = Uint8Array.from(d.board);
    state.notes = Uint16Array.from(d.notes);
    state.mistakes = d.mistakes || 0;
    state.elapsed = d.elapsed || 0;
    state.finished = !!d.finished;
    state.paused = !!d.paused;
    state.selected = -1;
    state.hinted = -1;
    state.history = [];

    $('timer').textContent = fmt(state.elapsed);
    return true;
  } catch (e) { return false; }
}

/* ---------------- 难度弹层 ---------------- */

function buildDiffList() {
  const list = $('diffList');
  list.innerHTML = '';
  for (const d of DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.className = 'diff-item';
    btn.dataset.key = d.key;
    btn.innerHTML = `
      <div class="di-main">
        <span class="di-name">${d.name}</span>
        <span class="di-desc">${d.desc}</span>
      </div>
      <span class="di-tag">${d.clues}+ 给定数字</span>`;
    btn.addEventListener('click', () => {
      closeSheet();
      newGame(d.key);
    });
    list.appendChild(btn);
  }
}

function openSheet() {
  for (const btn of $('diffList').children) {
    btn.classList.toggle('current', btn.dataset.key === state.difficulty);
  }
  $('sheetBackdrop').classList.add('on');
  $('sheet').classList.add('on');
}

function closeSheet() {
  $('sheetBackdrop').classList.remove('on');
  $('sheet').classList.remove('on');
}

/* ---------------- 数字键盘 ---------------- */

let keyEls = [];

function buildNumpad() {
  const pad = $('numpad');
  pad.innerHTML = '';
  keyEls = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.className = 'key';
    b.setAttribute('aria-label', String(d));
    b.innerHTML = `<span class="num">${d}</span><span class="left"></span>`;
    b.addEventListener('click', () => inputDigit(d));
    pad.appendChild(b);
    keyEls.push(b);
  }
}

/* ---------------- 初始化 ---------------- */

function bindUI() {
  $('btnUndo').addEventListener('click', undo);
  $('btnErase').addEventListener('click', eraseCell);
  $('btnNotes').addEventListener('click', toggleNotes);
  $('btnHint').addEventListener('click', hint);
  $('btnPause').addEventListener('click', togglePause);
  $('btnNew').addEventListener('click', openSheet);
  $('veilBtn').addEventListener('click', () => {
    if (state.finished) newGame(state.difficulty);
    else togglePause();
  });
  $('sheetBackdrop').addEventListener('click', closeSheet);

  // 下滑关闭弹层
  let startY = null;
  const sheet = $('sheet');
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (startY === null) return;
    const dy = (e.changedTouches[0].clientY - startY);
    sheet.style.transform = '';
    if (dy > 70) closeSheet();
    startY = null;
  });

  // 物理键盘（桌面预览用）
  document.addEventListener('keydown', e => {
    if (state.paused && e.key !== 'Escape') return;
    if (e.key >= '1' && e.key <= '9') { inputDigit(Number(e.key)); e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { eraseCell(); e.preventDefault(); }
    else if (e.key === 'n' || e.key === 'N') toggleNotes();
    else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) undo();
    else if (e.key === 'Escape') closeSheet();
    else if (e.key === ' ') { togglePause(); e.preventDefault(); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      let i = state.selected < 0 ? 40 : state.selected;
      const r = rowOf(i), c = colOf(i);
      if (e.key === 'ArrowUp' && r > 0) i -= 9;
      if (e.key === 'ArrowDown' && r < 8) i += 9;
      if (e.key === 'ArrowLeft' && c > 0) i -= 1;
      if (e.key === 'ArrowRight' && c < 8) i += 1;
      state.selected = i;
      render();
    }
  });

  // 切到后台自动暂停
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !state.finished && !state.paused && state.elapsed > 0) togglePause();
  });

  // 离开页面保存
  window.addEventListener('pagehide', save);
  document.addEventListener('touchstart', () => {}, { passive: true });
}

function boot() {
  buildBoard();
  buildNumpad();
  buildDiffList();
  bindUI();

  const restored = load();

  if (!restored) {
    // 首次进入直接生成一局简单题
    $('busy').classList.add('on');
    setTimeout(() => {
      const { puzzle, solution } = generatePuzzle('easy');
      state.difficulty = 'easy';
      state.puzzle = puzzle;
      state.solution = solution;
      state.board = Uint8Array.from(puzzle);
      state.notes = new Uint16Array(81);
      state.elapsed = 0;
      $('busy').classList.remove('on');
      render();
      save();
      startTimer();
    }, 30);
  } else {
    render();
    if (state.finished) {
      render();
      showVeil('上一局已完成', `${currentDiff().name} · 用时 ${fmt(state.elapsed)}`, '再来一局');
    } else if (state.paused) {
      showVeil('已暂停', '进度已保存', '继续');
      $('btnPause').classList.add('active');
    } else {
      startTimer();
    }
  }

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // 防止 iOS 双击缩放
  let lastTouch = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
}

document.addEventListener('DOMContentLoaded', boot);
