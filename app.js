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
let latestOptimization = null;
let highlightedPlayer = null;

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

function optimizationSignature() {
  return JSON.stringify({
    players: Number(state.players),
    items: activeItems().map(item => [item.def.id, item.exists, item.bonus, Number(item.value) || 0])
  });
}

function activePlayerAssignment() {
  if (highlightedPlayer === null || !latestOptimization) return null;
  if (latestOptimization.signature !== optimizationSignature()) return null;
  return latestOptimization.assignments[highlightedPlayer] || null;
}

function setHighlightedPlayer(playerIndex, jumpToFirstFloor = true) {
  highlightedPlayer = playerIndex;
  const assignment = activePlayerAssignment();
  if (jumpToFirstFloor && assignment && assignment.length) {
    state.currentFloor = assignment[0].def.floor;
    state.selectedSpot = null;
    persist();
  }
  renderAll();
  renderPlayerSelector();
}

function renderPlayerSelector() {
  const host = el('playerHighlightControls');
  if (!host) return;
  if (!latestOptimization || latestOptimization.signature !== optimizationSignature()) {
    host.classList.add('hidden');
    host.innerHTML = '';
    highlightedPlayer = null;
    return;
  }
  host.classList.remove('hidden');
  const buttons = [
    `<button type="button" class="player-filter ${highlightedPlayer === null ? 'active' : ''}" data-player="all">全員</button>`,
    ...latestOptimization.assignments.map((_, i) => `<button type="button" class="player-filter ${highlightedPlayer === i ? 'active' : ''}" data-player="${i}">P${i + 1}</button>`)
  ];
  host.innerHTML = `<span>地図表示</span>${buttons.join('')}`;
  host.querySelectorAll('[data-player]').forEach(button => {
    button.addEventListener('click', () => {
      const value = button.dataset.player;
      setHighlightedPlayer(value === 'all' ? null : Number(value));
    });
  });
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
  const playerAssignment = activePlayerAssignment();
  const highlightedIds = new Set((playerAssignment || []).map(item => item.def.id));
  el('markers').innerHTML = cfg.spots.map((raw, idx) => {
    const def = SPOT_DEFS[raw[0]], data = getSpot(def.id);
    const filled = data.exists;
    const isBonus = !def.isMain && data.bonus;
    const classes = [
      'marker', `type-${filled ? def.type : 'none'}`, 
      !filled ? 'empty' : '', filled ? 'filled' : '', isBonus ? 'bonus' : '',
      def.isMain ? 'main' : '', state.selectedSpot === def.id ? 'selected' : '',
      playerAssignment && highlightedIds.has(def.id) ? 'player-highlight' : '',
      playerAssignment && !highlightedIds.has(def.id) ? 'player-dimmed' : '',
      def.y >= 84 ? 'near-bottom' : '', def.x <= 10 ? 'near-left' : '', def.x >= 90 ? 'near-right' : ''
    ].filter(Boolean).join(' ');
    const visibleType = filled ? def.type : 'none';
    const symbol = `<span class="marker-icon"><img src="${iconFor(visibleType)}" alt="" draggable="false"></span>`;
    const playerBadge = playerAssignment && highlightedIds.has(def.id) ? `<span class="player-marker-badge">P${highlightedPlayer + 1}</span>` : '';
    const label = `${def.name}${filled ? `・${TYPE_INFO[def.type].label}` : ''}${Number(data.value) > 0 ? `・${money(data.value)}` : ''}`;
    const amount = Number(data.value) > 0
      ? `<span class="marker-amount">${money(data.value)}</span>`
      : '';
    return `<button class="${classes}" style="left:${def.x}%;top:${def.y}%" data-id="${def.id}" aria-label="${label}">${symbol}${playerBadge}${amount}<span class="marker-label">${label}</span></button>`;
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


function updateVisualViewportVars() {
  const viewport = window.visualViewport;
  const scale = viewport && Number.isFinite(viewport.scale) ? Math.max(1, viewport.scale) : 1;
  const inverse = 1 / scale;
  const keyboardOffset = viewport
    ? Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height))
    : 0;
  document.documentElement.style.setProperty('--visual-zoom-inverse', String(inverse));
  document.documentElement.style.setProperty('--visual-keyboard-offset', `${keyboardOffset}px`);
}

function usesMobileEditor() {
  return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

function positionFloatingEditor() {
  const card = el('floatingEditorCard');
  const id = state.selectedSpot;
  if (!id) { card.classList.add('hidden'); document.body.classList.remove('editor-open-mobile'); return; }

  card.classList.remove('hidden', 'open-left');
  document.body.classList.toggle('editor-open-mobile', usesMobileEditor());
  if (usesMobileEditor()) {
    card.style.left = '';
    card.style.top = '';
    return;
  }

  const marker = el('markers').querySelector(`[data-id="${CSS.escape(id)}"]`);
  const panel = document.querySelector('.map-panel');
  if (!marker || !panel) return;

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
  const players = Number(state.players);
  const capUnits = 20; // 5%単位。100% = 20
  const base = capUnits + 1;
  const items = activeItems().filter(x => currentWeight(x.type) > 0);

  if (!items.length) {
    el('optimizerResult').className = 'optimizer-result muted';
    el('optimizerResult').textContent = 'バッグ対象を入力してください。';
    return;
  }

  const ordered = items
    .map(item => ({
      ...item,
      required: !item.def.isMain && item.bonus,
      weightUnits: currentWeight(item.type) / 5
    }))
    .sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return (optimizationValue(b) / b.weightUnits) -
             (optimizationValue(a) / a.weightUnits);
    });

  // 各バッグの使用量は5%刻みなので、昇順の容量配列を1つの整数に詰める。
  // 例: 4人でも状態数は最大 C(24,4)=10,626 程度に収まる。
  function encodeLoads(loads) {
    let key = 0;
    for (let i = 0; i < loads.length; i++) key = key * base + loads[i];
    return key;
  }

  function decodeLoads(key) {
    const loads = Array(players);
    for (let i = players - 1; i >= 0; i--) {
      loads[i] = key % base;
      key = Math.floor(key / base);
    }
    return loads;
  }

  const initialKey = encodeLoads(Array(players).fill(0));
  let states = new Map([[initialKey, 0]]);
  const parents = [];

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const nextStates = new Map();
    const nextParents = new Map();

    function update(nextKey, score, prevKey, took) {
      const old = nextStates.get(nextKey);
      if (old === undefined || score > old) {
        nextStates.set(nextKey, score);
        nextParents.set(nextKey, { prevKey, took });
      }
    }

    for (const [key, score] of states) {
      if (!item.required) update(key, score, key, false);

      const loads = decodeLoads(key);
      let previousLoad = -1;
      for (let p = 0; p < players; p++) {
        // 同じ使用量のバッグは区別しない。
        if (loads[p] === previousLoad) continue;
        previousLoad = loads[p];
        if (loads[p] + item.weightUnits > capUnits) continue;

        const nextLoads = loads.slice();
        nextLoads[p] += item.weightUnits;
        nextLoads.sort((a, b) => a - b);
        const nextKey = encodeLoads(nextLoads);
        update(nextKey, score + optimizationValue(item), key, true);
      }
    }

    if (!nextStates.size) {
      el('optimizerResult').className = 'optimizer-result';
      el('optimizerResult').innerHTML = '<span class="warning">ボーナス対象を全員のバッグに収められません。</span><br>人数か対象設定を確認してください。';
      return;
    }

    states = nextStates;
    parents.push(nextParents);
  }

  let bestKey = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [key, score] of states) {
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  // 選ばれたアイテムを後ろから復元し、その時点のバッグ容量へ割り当てる。
  const finalLoads = decodeLoads(bestKey);
  let bins = finalLoads.map((load, id) => ({ id, load, items: [] }));
  let key = bestKey;

  for (let i = ordered.length - 1; i >= 0; i--) {
    const parent = parents[i].get(key);
    if (!parent) break;

    if (parent.took) {
      const item = ordered[i];
      const prevLoads = decodeLoads(parent.prevKey);

      // 現在のどのバッグからこのアイテムを戻せば直前状態になるかを照合する。
      let matched = false;
      for (let b = 0; b < bins.length; b++) {
        if (bins[b].load < item.weightUnits) continue;
        const candidate = bins.map((bin, index) => bin.load - (index === b ? item.weightUnits : 0))
          .sort((a, z) => a - z);
        if (candidate.every((load, index) => load === prevLoads[index])) {
          bins[b].load -= item.weightUnits;
          bins[b].items.push(item);
          bins.sort((a, z) => a.load - z.load || a.id - z.id);
          matched = true;
          break;
        }
      }
      if (!matched) console.warn('最適化結果の復元に失敗しました:', item.def.id);
    }

    key = parent.prevKey;
  }

  // 復元後のloadは0へ戻るため、実際の使用量をアイテムから再計算する。
  bins.sort((a, b) => a.id - b.id);
  const bestAssign = bins.map(bin => bin.items.reverse());
  const bestBins = bestAssign.map(list => list.reduce((sum, item) => sum + currentWeight(item.type), 0));
  const plans = bestAssign.map((list, i) => {
    const used = bestBins[i];
    const text = list.length
      ? list.map(x => `${x.bonus ? '★' : ''}${x.def.name}・${TYPE_INFO[x.type].label} ${Number(x.value) > 0 ? money(x.value) : '（金額未入力）'}`).join('<br>')
      : '回収なし';
    return `<button type="button" class="player-plan ${highlightedPlayer === i ? 'active' : ''}" data-highlight-player="${i}"><b>プレイヤー${i + 1}：${used}% / 100%</b><span>${text}</span></button>`;
  }).join('');

  el('optimizerResult').className = 'optimizer-result';
  const selectedItems = bestAssign.flat();
  const hasUnknownValues = selectedItems.some(x => Number(x.value) <= 0);
  const knownTotal = selectedItems.reduce((sum, x) => sum + (Number(x.value) > 0 ? Number(x.value) : 0), 0);
  const heading = hasUnknownValues
    ? `<strong>推奨回収：${selectedItems.length}個</strong><br><span class="muted-note">金額未入力を含むため、同価値として容量効率を優先しています。入力済み金額の合計：${money(knownTotal)}</span>`
    : `<strong>推奨回収額：${money(knownTotal)}</strong>`;
  latestOptimization = {
    signature: optimizationSignature(),
    assignments: bestAssign,
    loads: bestBins
  };
  highlightedPlayer = null;
  el('optimizerResult').innerHTML = `${heading}<br>バッグ使用量：${bestBins.reduce((a, b) => a + b, 0)}% / ${players * 100}%${plans}`;
  el('optimizerResult').querySelectorAll('[data-highlight-player]').forEach(button => {
    button.addEventListener('click', () => setHighlightedPlayer(Number(button.dataset.highlightPlayer)));
  });
  renderPlayerSelector();
}
function renderAll() { renderTabs(); renderMap(); renderEditor(); renderSummary(); renderPlayerSelector(); }

function bind() {
  el('closeEditorButton').addEventListener('click', () => {
    state.selectedSpot = null; persist(); renderAll();
  });
  el('mapViewport').addEventListener('scroll', () => requestAnimationFrame(positionFloatingEditor), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(positionFloatingEditor));
  window.addEventListener('resize', updateVisualViewportVars, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateVisualViewportVars, { passive: true });
    window.visualViewport.addEventListener('scroll', updateVisualViewportVars, { passive: true });
  }
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
  el('playerCount').addEventListener('change', e => { state.players = Number(e.target.value); latestOptimization = null; highlightedPlayer = null; persist(); renderAll(); el('optimizerResult').textContent = '人数を変更しました。もう一度計算してください。'; });
  el('optimizeButton').addEventListener('click', optimize);
  el('shareButton').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?d=${encodePayload()}`;
    try { await navigator.clipboard.writeText(url); toast('共有リンクをコピーしました'); }
    catch { prompt('このリンクをコピーしてください', url); }
  });
  el('resetButton').addEventListener('click', () => {
    if (!confirm('入力内容をすべて消去しますか？')) return;
    state.spots = {}; state.selectedSpot = null; latestOptimization = null; highlightedPlayer = null; persist(); renderAll(); el('optimizerResult').textContent = '入力後に計算できます。'; toast('全消去しました');
  });
}
function toast(msg) { const t=el('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2200); }

load();
el('playerCount').value = String(state.players);
bind();
updateVisualViewportVars();
renderAll();
