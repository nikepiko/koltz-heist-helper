'use strict';

const FLOORS = {
  '2F': {
    image: 'assets/2F.png',
    spots: [
      ['2f-01', 77.27, 40.21], ['2f-02', 76.99, 53.13], ['2f-03', 77.06, 65.50],
      ['2f-04', 77.17, 79.07], ['2f-05', 76.22, 85.29], ['2f-06', 91.66, 91.08],
      ['2f-07', 81.99, 95.43], ['2f-08', 67.53, 95.63], ['2f-09', 54.41, 95.44],
      ['2f-10', 54.36, 86.33], ['2f-11', 47.07, 86.47], ['2f-12', 26.21, 82.50],
      ['2f-13', 26.21, 72.50]
    ]
  },
  '1F': {
    image: 'assets/1F.png',
    // 左端から近い地点を順にたどり、上側のまとまりから下側へ抜ける一筆書き順。
    spots: [
      ['1f-01', 13.13, 63.25], ['1f-02', 37.54, 43.01], ['1f-03', 55.27, 46.39],
      ['1f-04', 55.29, 50.00], ['1f-05', 61.82, 52.07], ['1f-06', 71.14, 44.62],
      ['1f-07', 65.86, 40.72], ['1f-08', 62.09, 76.46], ['1f-09', 55.25, 80.32],
      ['1f-10', 66.21, 87.58], ['1f-11', 71.47, 83.72], ['1f-12', 74.54, 96.50]
    ]
  },
  'B1': {
    image: 'assets/B1.png',
    spots: [
      ['b1-01', 23.9, 83.5], ['b1-02', 27.6, 83.5], ['b1-03', 31.2, 83.5]
    ]
  },
  '金庫室': {
    image: 'assets/vault.png',
    spots: [
      ['vault-main', 49.5, 88.0],
      ['vault-p1', 22.4, 44.5], ['vault-p2', 76.3, 48.0],
      ['vault-p3', 22.4, 63.5], ['vault-p4', 76.3, 67.1]
    ]
  }
};

const TYPE_INFO = {
  none: { label: 'なし', weight: 0 },
  painting: { label: '絵画', weight: 50 },
  reinforced: { label: '強化', weight: 30 },
  medium: { label: '中型', weight: 25 },
  small: { label: '小型', weight: 10 },
  main: { label: 'メインターゲット', weight: 0 }
};

const STORAGE_KEY = 'koltz-helper-v1';
let state = { version: 1, currentFloor: '1F', selectedSpot: null, players: 2, spots: {} };

const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);

function allSpotDefs() {
  return Object.entries(FLOORS).flatMap(([floor, cfg]) => {
    let regularIndex = 0;
    return cfg.spots.map(([id, x, y]) => {
      const type = SPOT_TYPES[id];
      if (!type) throw new Error(`SPOT_TYPES に ${id} の設定がありません`);
      const isMain = type === 'main';
      const name = isMain ? 'メインターゲット' : `${floor} 地点${++regularIndex}`;
      return { id, x, y, type, isMain, floor, name };
    });
  });
}
const SPOT_DEFS = Object.fromEntries(allSpotDefs().map(s => [s.id, s]));

function blankSpot(def) {
  return {
    value: '',
    exists: def.isMain,
    bonus: false
  };
}

function normalizeSpot(def, data) {
  const spot = { ...blankSpot(def), ...(data || {}) };
  // 旧版データからの移行。通常地点は金額がある場合だけ自動で「あり」にする。
  if (typeof data?.exists !== 'boolean') {
    spot.exists = def.isMain || Number(spot.value) > 0;
  }
  if (def.isMain) {
    spot.exists = true;
    spot.bonus = false;
  }
  return spot;
}


const TYPE_ICONS = {
  painting: 'assets/icons/painting.svg',
  medium: 'assets/icons/egg.svg',
  reinforced: 'assets/icons/diamond.svg',
  small: 'assets/icons/ring.svg',
  main: 'assets/icons/main-painting.svg',
  none: 'assets/icons/none.svg'
};

function iconFor(type) { return TYPE_ICONS[type] || TYPE_ICONS.none; }

function getSpot(id) { return normalizeSpot(SPOT_DEFS[id], state.spots[id]); }
function setSpot(id, patch) {
  const def = SPOT_DEFS[id];
  if (!def) return;
  state.spots[id] = normalizeSpot(def, { ...getSpot(id), ...patch });
  persist();
  renderAll();
}

function toggleQuickMark(id) {
  const def = SPOT_DEFS[id];
  const data = getSpot(id);
  if (!def || def.isMain) return;

  // 金額入力済みの地点はダブルクリックでは消せない。
  if (Number(data.value) > 0) {
    toast('金額入力済みの地点は「この地点を消去」から解除できます');
    return;
  }

  const nextExists = !data.exists;
  setSpot(id, {
    exists: nextExists,
    bonus: nextExists ? data.bonus : false
  });
  toast(nextExists ? 'アイコンを表示しました' : 'アイコンを非表示にしました');
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load() {
  try {
    const params = new URLSearchParams(location.search);
    const shared = params.get('d');
    if (shared) {
      state = { ...state, ...decodePayload(shared) };
      history.replaceState(null, '', location.pathname);
      toast('共有データを読み込みました');
      return;
    }
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) state = { ...state, ...JSON.parse(local) };
  } catch (e) { console.warn('データの読み込みに失敗', e); }
}
// 共有リンク用の圧縮形式。
// 地点IDや空欄をJSONに含めず、固定された地点順と数値だけをバイナリ化する。
const SHARE_FORMAT_VERSION = 2;
const SHARE_SPOT_ORDER = allSpotDefs().map(def => def.id);

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(str) {
  str = str.replaceAll('-', '+').replaceAll('_', '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function pushVarUint(bytes, value) {
  let remaining = Math.max(0, Math.trunc(Number(value) || 0));
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
}

function readVarUint(bytes, cursor) {
  let value = 0;
  let multiplier = 1;
  let byte;
  do {
    if (cursor.index >= bytes.length) throw new Error('共有データが途中で切れています');
    byte = bytes[cursor.index++];
    value += (byte & 0x7f) * multiplier;
    multiplier *= 128;
    if (multiplier > Number.MAX_SAFE_INTEGER) throw new Error('共有データの数値が大きすぎます');
  } while (byte & 0x80);
  return value;
}

function encodePayload() {
  const records = [];

  SHARE_SPOT_ORDER.forEach((id, index) => {
    const def = SPOT_DEFS[id];
    const spot = getSpot(id);
    const defaultSpot = blankSpot(def);
    const value = Math.max(0, Math.trunc(Number(spot.value) || 0));

    const differsFromDefault =
      spot.exists !== defaultSpot.exists ||
      spot.bonus !== defaultSpot.bonus ||
      value > 0;

    if (!differsFromDefault) return;

    let flags = 0;
    if (spot.exists) flags |= 0x01;
    if (spot.bonus) flags |= 0x02;
    if (value > 0) flags |= 0x04;

    records.push({ index, flags, value });
  });

  const bytes = [SHARE_FORMAT_VERSION, Math.max(1, Math.min(4, Number(state.players) || 2)), records.length];
  for (const record of records) {
    bytes.push(record.index, record.flags);
    if (record.flags & 0x04) pushVarUint(bytes, record.value);
  }
  return bytesToBase64Url(Uint8Array.from(bytes));
}

function decodeCompactPayload(bytes) {
  const cursor = { index: 0 };
  const version = bytes[cursor.index++];
  if (version !== SHARE_FORMAT_VERSION) throw new Error(`未対応の共有形式です: ${version}`);

  const players = bytes[cursor.index++];
  const recordCount = bytes[cursor.index++];
  const spots = {};

  for (let i = 0; i < recordCount; i++) {
    if (cursor.index + 1 >= bytes.length) throw new Error('共有データが途中で切れています');
    const spotIndex = bytes[cursor.index++];
    const flags = bytes[cursor.index++];
    const id = SHARE_SPOT_ORDER[spotIndex];
    if (!id) throw new Error(`共有データに不明な地点番号があります: ${spotIndex}`);

    const value = flags & 0x04 ? readVarUint(bytes, cursor) : 0;
    spots[id] = {
      exists: Boolean(flags & 0x01),
      bonus: Boolean(flags & 0x02),
      value: value > 0 ? String(value) : ''
    };
  }

  return { version: 1, players: Math.max(1, Math.min(4, players || 2)), spots };
}

function decodePayload(str) {
  const bytes = base64UrlToBytes(str);

  // v13以前のJSON形式も読み込み可能にしておく。
  if (bytes[0] === 0x7b) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return decodeCompactPayload(bytes);
}

function renderTabs() {
  el('floorTabs').innerHTML = Object.keys(FLOORS).map(f => `<button class="tab ${f === state.currentFloor ? 'active' : ''}" data-floor="${f}">${f}</button>`).join('');
  el('floorTabs').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    state.currentFloor = btn.dataset.floor; state.selectedSpot = null; persist(); renderAll();
  }));
}

function renderMap() {
  const cfg = FLOORS[state.currentFloor];
  el('mapImage').src = cfg.image;
  el('mapImage').alt = `${state.currentFloor} マップ`;
  el('markers').innerHTML = cfg.spots.map((raw, idx) => {
    const def = SPOT_DEFS[raw[0]], data = getSpot(def.id);
    const filled = data.exists;
    const isBonus = !def.isMain && data.bonus;
    const classes = [
      'marker', `type-${filled ? def.type : 'none'}`, 
      !filled ? 'empty' : '', filled ? 'filled' : '', isBonus ? 'bonus' : '',
      def.isMain ? 'main' : '', state.selectedSpot === def.id ? 'selected' : '',
      def.y >= 84 ? 'near-bottom' : '', def.x <= 10 ? 'near-left' : '', def.x >= 90 ? 'near-right' : ''
    ].filter(Boolean).join(' ');
    const visibleType = filled ? def.type : 'none';
    const symbol = `<span class="marker-icon"><img src="${iconFor(visibleType)}" alt="" draggable="false"></span>`;
    const label = `${def.name}${filled ? `・${TYPE_INFO[def.type].label}` : ''}${Number(data.value) > 0 ? `・${money(data.value)}` : ''}`;
    const amount = Number(data.value) > 0
      ? `<span class="marker-amount">${money(data.value)}</span>`
      : '';
    return `<button class="${classes}" style="left:${def.x}%;top:${def.y}%" data-id="${def.id}" aria-label="${label}">${symbol}${amount}<span class="marker-label">${label}</span></button>`;
  }).join('');
  el('markers').querySelectorAll('.marker').forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      state.selectedSpot = btn.dataset.id; persist(); renderAll();
    });
    btn.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleQuickMark(btn.dataset.id);
    });
  });
  const floorDefs = cfg.spots.map(s => SPOT_DEFS[s[0]]);
  const completed = floorDefs.filter(d => getSpot(d.id).exists || d.isMain).length;
  el('floorProgress').textContent = `${completed} / ${floorDefs.length} 地点入力`;
}

function positionFloatingEditor() {
  const card = el('floatingEditorCard');
  const id = state.selectedSpot;
  if (!id) { card.classList.add('hidden'); return; }

  const marker = el('markers').querySelector(`[data-id="${CSS.escape(id)}"]`);
  const panel = document.querySelector('.map-panel');
  if (!marker || !panel) return;

  card.classList.remove('hidden', 'open-left');
  const panelRect = panel.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const cardWidth = card.offsetWidth || 320;
  const cardHeight = card.offsetHeight || 420;
  const gap = 14;
  const edge = 12;

  let left = markerRect.right - panelRect.left + gap;
  let openLeft = false;
  if (left + cardWidth > panelRect.width - edge) {
    left = markerRect.left - panelRect.left - cardWidth - gap;
    openLeft = true;
  }
  left = Math.max(edge, Math.min(left, panelRect.width - cardWidth - edge));

  let top = markerRect.top - panelRect.top - 18;
  top = Math.max(112, Math.min(top, panelRect.height - cardHeight - edge));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.classList.toggle('open-left', openLeft);
}

function renderEditor() {
  const id = state.selectedSpot;
  el('floatingEditorCard').classList.toggle('hidden', !id);
  if (!id) return;
  const def = SPOT_DEFS[id], data = getSpot(id);
  el('spotName').textContent = def.name;
  el('spotFloor').textContent = def.floor;
  el('targetExists').checked = data.exists;
  el('targetValue').value = data.value;
  el('targetBonus').checked = def.isMain ? false : data.bonus;
  el('targetExistsField').classList.toggle('hidden', def.isMain);
  el('bonusField').classList.toggle('hidden', def.isMain);
  requestAnimationFrame(positionFloatingEditor);
}

function currentWeight(type) { return type === 'medium' ? MEDIUM_WEIGHT : TYPE_INFO[type].weight; }
function activeItems() {
  return allSpotDefs().map(def => ({ def, ...getSpot(def.id) }))
    .filter(x => x.exists)
    .map(x => ({ ...x, type: x.def.type }));
}

function optimizationValue(item) {
  // 金額未入力の地点は同価値として扱い、バッグに多く収まる組み合わせを選ぶ。
  return Number(item.value) > 0 ? Number(item.value) : 1;
}

function renderSummary() {
  const items = activeItems();
  el('filledCount').textContent = items.length;
  el('bonusCount').textContent = items.filter(x => !x.def.isMain && x.bonus).length;
  el('totalValue').textContent = money(items.reduce((a,b) => a + (Number(b.value) > 0 ? Number(b.value) : 0), 0));
  el('totalWeight').textContent = `${items.reduce((a,b) => a + currentWeight(b.type), 0)}%`;
}

function optimize() {
  const players = Number(state.players), cap = 100;
  const items = activeItems().filter(x => currentWeight(x.type) > 0);
  if (!items.length) {
    el('optimizerResult').className = 'optimizer-result muted';
    el('optimizerResult').textContent = 'バッグ対象を入力してください。';
    return;
  }

  const ordered = items
    .map(item => ({ ...item, required: !item.def.isMain && item.bonus }))
    .sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return (optimizationValue(b) / currentWeight(b.type)) -
             (optimizationValue(a) / currentWeight(a.type));
    });

  // 同じ容量のバッグは区別しない。容量配列を常に昇順にそろえてメモ化することで、
  // 4人時に爆発していた「各アイテムを各プレイヤーへ置く全探索」を大幅に削減する。
  const memo = new Map();
  const choices = new Map();
  const impossible = Number.NEGATIVE_INFINITY;

  function keyOf(i, loads) {
    return `${i}|${loads.join(',')}`;
  }

  function solve(i, loads) {
    if (i >= ordered.length) return 0;
    const key = keyOf(i, loads);
    if (memo.has(key)) return memo.get(key);

    const item = ordered[i];
    const weight = currentWeight(item.type);
    const value = optimizationValue(item);
    let best = impossible;
    let bestChoice = null;

    // 任意対象だけは回収しない選択を許可する。
    if (!item.required) {
      best = solve(i + 1, loads);
      bestChoice = { take: false };
    }

    // 容量が同じバッグへの配置は結果が同一なので1回だけ試す。
    const seenLoads = new Set();
    for (let p = 0; p < loads.length; p++) {
      if (seenLoads.has(loads[p])) continue;
      seenLoads.add(loads[p]);
      if (loads[p] + weight > cap) continue;

      const nextLoads = loads.slice();
      nextLoads[p] += weight;
      nextLoads.sort((a, b) => a - b);
      const tail = solve(i + 1, nextLoads);
      if (tail === impossible) continue;

      const candidate = value + tail;
      if (candidate > best) {
        best = candidate;
        bestChoice = { take: true, loadIndex: p };
      }
    }

    memo.set(key, best);
    choices.set(key, bestChoice);
    return best;
  }

  const initialLoads = Array(players).fill(0);
  const bestValue = solve(0, initialLoads);
  if (bestValue === impossible) {
    el('optimizerResult').className = 'optimizer-result';
    el('optimizerResult').innerHTML = '<span class="warning">ボーナス対象を全員のバッグに収められません。</span><br>人数か対象設定を確認してください。';
    return;
  }

  // メモ化探索の選択を実際のプレイヤー別リストへ復元する。
  const playerBins = Array.from({ length: players }, (_, id) => ({ id, load: 0, items: [] }));
  let loads = initialLoads.slice();
  for (let i = 0; i < ordered.length; i++) {
    const choice = choices.get(keyOf(i, loads));
    if (!choice) break;
    if (choice.take) {
      playerBins.sort((a, b) => a.load - b.load || a.id - b.id);
      const bin = playerBins[choice.loadIndex];
      const item = ordered[i];
      bin.load += currentWeight(item.type);
      bin.items.push(item);
      loads = playerBins.map(x => x.load).sort((a, b) => a - b);
    }
  }
  playerBins.sort((a, b) => a.id - b.id);

  const bestBins = playerBins.map(x => x.load);
  const bestAssign = playerBins.map(x => x.items);
  const plans = bestAssign.map((list, i) => {
    const used = bestBins[i];
    const text = list.length
      ? list.map(x => `${x.bonus ? '★' : ''}${x.def.floor} ${TYPE_INFO[x.type].label} ${Number(x.value) > 0 ? money(x.value) : '（金額未入力）'}`).join('<br>')
      : '回収なし';
    return `<div class="player-plan"><b>プレイヤー${i + 1}：${used}% / 100%</b>${text}</div>`;
  }).join('');

  el('optimizerResult').className = 'optimizer-result';
  const selectedItems = bestAssign.flat();
  const hasUnknownValues = selectedItems.some(x => Number(x.value) <= 0);
  const knownTotal = selectedItems.reduce((sum, x) => sum + (Number(x.value) > 0 ? Number(x.value) : 0), 0);
  const heading = hasUnknownValues
    ? `<strong>推奨回収：${selectedItems.length}個</strong><br><span class="muted-note">金額未入力を含むため、同価値として容量効率を優先しています。入力済み金額の合計：${money(knownTotal)}</span>`
    : `<strong>推奨回収額：${money(knownTotal)}</strong>`;
  el('optimizerResult').innerHTML = `${heading}<br>バッグ使用量：${bestBins.reduce((a, b) => a + b, 0)}% / ${players * 100}%${plans}`;
}

function renderAll() { renderTabs(); renderMap(); renderEditor(); renderSummary(); }

function bind() {
  el('closeEditorButton').addEventListener('click', () => {
    state.selectedSpot = null; persist(); renderAll();
  });
  el('mapViewport').addEventListener('scroll', () => requestAnimationFrame(positionFloatingEditor), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(positionFloatingEditor));
  el('mapStage').addEventListener('click', event => {
    if (event.target.closest('.marker')) return;
    if (state.selectedSpot === null) return;
    state.selectedSpot = null;
    persist();
    renderAll();
  });
  el('targetExists').addEventListener('change', e => {
    const data = getSpot(state.selectedSpot);
    if (!e.target.checked && Number(data.value) > 0) {
      e.target.checked = true;
      toast('金額入力済みの地点はターゲットなしにできません');
      return;
    }
    setSpot(state.selectedSpot, { exists: e.target.checked, bonus: e.target.checked ? data.bonus : false });
  });
  el('targetValue').addEventListener('input', e => {
    const value = e.target.value;
    const data = getSpot(state.selectedSpot);
    setSpot(state.selectedSpot, { value, exists: Number(value) > 0 ? true : data.exists });
  });
  el('targetBonus').addEventListener('change', e => {
    const def = SPOT_DEFS[state.selectedSpot];
    if (!def || def.isMain) return;
    setSpot(state.selectedSpot, { bonus: e.target.checked });
  });
  el('clearSpotButton').addEventListener('click', () => { state.spots[state.selectedSpot] = blankSpot(SPOT_DEFS[state.selectedSpot]); persist(); renderAll(); });
  el('playerCount').addEventListener('change', e => { state.players = Number(e.target.value); persist(); });
  el('optimizeButton').addEventListener('click', optimize);
  el('shareButton').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?d=${encodePayload()}`;
    try { await navigator.clipboard.writeText(url); toast('共有リンクをコピーしました'); }
    catch { prompt('このリンクをコピーしてください', url); }
  });
  el('resetButton').addEventListener('click', () => {
    if (!confirm('入力内容をすべて消去しますか？')) return;
    state.spots = {}; state.selectedSpot = null; persist(); renderAll(); el('optimizerResult').textContent = '入力後に計算できます。'; toast('全消去しました');
  });
}
function toast(msg) { const t=el('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2200); }

load();
el('playerCount').value = String(state.players);
bind();
renderAll();
