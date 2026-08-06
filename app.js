'use strict';

// -----------------------------------------------------------------------------
// 地図・地点定義
// -----------------------------------------------------------------------------
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
      ['vault-p3', 22.4, 63.5], ['vault-p4', 76.3, 67.1],
      ['vault-truck', 83.0, 22.0]
    ]
  }
};

// -----------------------------------------------------------------------------
// 回収品の表示分類
// -----------------------------------------------------------------------------
const TYPE_INFO = {
  none: { label: 'なし', weight: 0 },
  painting: { label: '絵画', weight: 50 },
  reinforced: { label: '強化', weight: 30 },
  medium: { label: '中型', weight: 25 },
  small: { label: '小型', weight: 10 },
  skull: { label: 'スカル', weight: 30 },
  cargo: { label: '搬入トラック略奪品', weight: 30 },
  main: { label: 'メインターゲット', weight: 0 }
};

// 現行データ専用。旧バージョンの localStorage は意図的に読み込みません。
const STORAGE_KEY = 'koltz-helper-v43';

// 公式資料の No.05〜11（内部ID 2f-05〜11）はソロでは回収できないため除外する。
const SOLO_UNAVAILABLE_SPOT_IDS = new Set([
  '2f-05', '2f-06', '2f-07', '2f-08', '2f-09', '2f-10', '2f-11'
]);
// アプリ全体の状態。永続化するのはこのオブジェクトだけです。
let state = { currentFloor: '1F', selectedSpot: null, players: 2, alphaMailDisguise: false, spots: {} };
let latestOptimization = null;
let highlightedPlayer = null;
let mapDisplayMode = 'all-targets'; // all-targets | optimized-all | player

const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);

// -----------------------------------------------------------------------------
// 地点定義の正規化
// -----------------------------------------------------------------------------
function allSpotDefs() {
  return Object.entries(FLOORS).flatMap(([floor, cfg]) => {
    return cfg.spots.map(([id, x, y]) => {
      const type = SPOT_TYPES[id];
      if (!type) throw new Error(`SPOT_TYPES に ${id} の設定がありません`);
      const isMain = type === 'main';
      const isTransportTruck = id === 'vault-truck';
      const referenceNo = SPOT_REFERENCE_NUMBERS[id];
      const referenceFloor = SPOT_REFERENCE_FLOORS[id] || floor;
      const noLabel = Number.isInteger(referenceNo) ? `No.${String(referenceNo).padStart(2, '0')}` : '';
      const name = isMain
        ? `${referenceFloor} ${noLabel} メインターゲット`
        : isTransportTruck
          ? `${referenceFloor} ${noLabel}`
          : `${referenceFloor} ${noLabel}`;
      return { id, x, y, type, isMain, isTransportTruck, floor, referenceFloor, referenceNo, name };
    });
  });
}
const SPOT_DEFS = Object.fromEntries(allSpotDefs().map(s => [s.id, s]));

function blankSpot(def) {
  return {
    value: '',
    exists: def.isMain,
    bonus: false,
    itemId: def.isMain ? '' : '',
    priceExplicit: false,
    firstTimeWeek: false,
    hardMode: false
  };
}

/**
 * 地点データを現行形式へ整形します。
 * 旧形式からの移行は行わず、現在の設定に存在しない itemId は破棄します。
 */
function normalizeSpot(def, data = {}) {
  const spot = { ...blankSpot(def), ...data };

  if (def.isMain) {
    spot.exists = true;
    spot.bonus = false;
    spot.itemId = SHARE_MAIN_ORDER.includes(spot.itemId) ? spot.itemId : '';
    spot.firstTimeWeek = Boolean(spot.firstTimeWeek);
    spot.hardMode = Boolean(spot.hardMode);
    spot.priceExplicit = false;
    return spot;
  }

  const options = SPOT_LOOT_OPTIONS[def.id] || [];
  spot.itemId = options.includes(spot.itemId) ? spot.itemId : '';
  spot.exists = Boolean(spot.exists && spot.itemId);
  spot.bonus = Boolean(spot.exists && spot.bonus);
  spot.priceExplicit = Boolean(spot.priceExplicit);
  spot.value = spot.exists && Number(spot.value) > 0 ? String(Math.trunc(Number(spot.value))) : '';
  return spot;
}

// -----------------------------------------------------------------------------
// 金額候補と回収品情報
// -----------------------------------------------------------------------------
function priceValuesFor(item) {
  if (!item) return [];
  if (Array.isArray(item.priceValues)) return [...item.priceValues];
  const values = [];
  const min = Number(item.min) || 0;
  const max = Number(item.max) || min;
  const step = Math.max(1, Number(item.step) || 2500);
  for (let value = min; value <= max; value += step) values.push(value);
  if (values.at(-1) !== max) values.push(max);
  return values;
}
function defaultPrice(item) { return priceValuesFor(item)[0] || 0; }
function selectedLoot(def, data) {
  if (def.isMain) return MAIN_TARGETS.find(item => item.id === data.itemId) || null;
  return LOOT_CATALOG[data.itemId] || null;
}
function effectiveType(def, data) {
  if (def.isMain) return 'main';
  return selectedLoot(def, data)?.iconType || def.type;
}
function effectiveIcon(def, data) {
  if (def.isMain) return 'main';
  const item = selectedLoot(def, data);
  return item?.icon || item?.iconType || def.type;
}
function effectiveWeight(def, data) {
  if (def.isMain) return 0;
  const item = selectedLoot(def, data);
  return item ? Number(item.weight) || 0 : currentWeight(def.type);
}
function mainDisplayValues(target, data = {}) {
  if (!target) return null;
  const base = data.hardMode ? target.hardBase : target.easyBase;
  return {
    modeLabel: data.hardMode ? 'HARD' : 'EASY',
    base,
    noAlarm: Math.round(base * (data.firstTimeWeek ? 4 : 1)),
    alarm: Math.round(base * (data.firstTimeWeek ? 3 : 0.75))
  };
}
function effectiveValue(def, data) {
  if (!def.isMain) return Number(data.value) || 0;
  const target = selectedLoot(def, data);
  return mainDisplayValues(target, data)?.noAlarm || 0;
}


// -----------------------------------------------------------------------------
// アイコン解決
// -----------------------------------------------------------------------------
const TYPE_ICONS = {
  painting: 'assets/icons/painting.webp',
  medium: 'assets/icons/egg.webp',
  reinforced: 'assets/icons/diamond.webp',
  small: 'assets/icons/ring.webp',
  skull: 'assets/icons/skull.webp',
  cargo: 'assets/icons/cargo.webp',
  meteor: 'assets/icons/meteor.webp',
  goddess: 'assets/icons/goddess.webp',
  venus: 'assets/icons/venus.webp',
  horse: 'assets/icons/horse.webp',
  main: 'assets/icons/painting.webp',
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

  // ユーザーが価格を明示選択した地点だけは、誤操作防止のためダブルクリックで消さない。
  if (data.priceExplicit) {
    toast('価格を選択済みの地点は、チェック欄か「この地点を消去」で解除できます');
    return;
  }

  const nextExists = !data.exists;
  const firstItemId = data.itemId || (SPOT_LOOT_OPTIONS[id] || [])[0] || '';
  const item = LOOT_CATALOG[firstItemId];
  setSpot(id, {
    exists: nextExists,
    bonus: nextExists ? data.bonus : false,
    itemId: nextExists ? firstItemId : data.itemId,
    value: nextExists && item && !data.value ? String(defaultPrice(item)) : data.value,
    priceExplicit: nextExists ? data.priceExplicit : false
  });
  toast(nextExists ? 'アイコンを表示しました' : 'アイコンを非表示にしました');
}

// -----------------------------------------------------------------------------
// 保存・共有リンク
// -----------------------------------------------------------------------------
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
// 共有リンク形式。旧形式との互換性は持たせず、現行形式だけを受け付けます。
const SHARE_FORMAT_VERSION = 1;
const SHARE_ITEM_ORDER = Object.keys(LOOT_CATALOG);
const SHARE_MAIN_ORDER = MAIN_TARGETS.map(item => item.id);
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
    const itemIndex = def.isMain ? SHARE_MAIN_ORDER.indexOf(spot.itemId) : SHARE_ITEM_ORDER.indexOf(spot.itemId);
    const differsFromDefault = spot.exists !== defaultSpot.exists || spot.bonus !== defaultSpot.bonus ||
      value > 0 || itemIndex >= 0 || spot.priceExplicit || spot.firstTimeWeek || spot.hardMode;
    if (!differsFromDefault) return;
    let flags = 0;
    if (spot.exists) flags |= 0x01;
    if (spot.bonus) flags |= 0x02;
    if (value > 0) flags |= 0x04;
    if (itemIndex >= 0) flags |= 0x08;
    if (spot.priceExplicit) flags |= 0x10;
    if (spot.firstTimeWeek) flags |= 0x20;
    if (spot.hardMode) flags |= 0x40;
    records.push({ index, flags, value, itemIndex });
  });
  const settingsFlags = state.alphaMailDisguise ? 0x01 : 0;
  const bytes = [SHARE_FORMAT_VERSION, Math.max(1, Math.min(4, Number(state.players) || 2)), settingsFlags, records.length];
  for (const record of records) {
    bytes.push(record.index, record.flags);
    if (record.flags & 0x08) pushVarUint(bytes, record.itemIndex);
    if (record.flags & 0x04) pushVarUint(bytes, record.value);
  }
  return bytesToBase64Url(Uint8Array.from(bytes));
}

function decodeCompactPayload(bytes) {
  const cursor = { index: 0 };
  const version = bytes[cursor.index++];
  if (version !== SHARE_FORMAT_VERSION) throw new Error(`未対応の共有形式です: ${version}`);
  const players = bytes[cursor.index++];
  const settingsFlags = bytes[cursor.index++];
  const recordCount = bytes[cursor.index++];
  const spots = {};
  for (let i = 0; i < recordCount; i++) {
    if (cursor.index + 1 >= bytes.length) throw new Error('共有データが途中で切れています');
    const spotIndex = bytes[cursor.index++];
    const flags = bytes[cursor.index++];
    const id = SHARE_SPOT_ORDER[spotIndex];
    if (!id) throw new Error(`共有データに不明な地点番号があります: ${spotIndex}`);
    const def = SPOT_DEFS[id];
    let itemId = '';
    if (flags & 0x08) {
      const itemIndex = readVarUint(bytes, cursor);
      itemId = def.isMain ? (SHARE_MAIN_ORDER[itemIndex] || '') : (SHARE_ITEM_ORDER[itemIndex] || '');
    }
    const value = flags & 0x04 ? readVarUint(bytes, cursor) : 0;
    spots[id] = {
      exists: Boolean(flags & 0x01), bonus: Boolean(flags & 0x02),
      value: value > 0 ? String(value) : '', itemId,
      priceExplicit: Boolean(flags & 0x10),
      firstTimeWeek: Boolean(flags & 0x20),
      hardMode: Boolean(flags & 0x40)
    };
  }
  return { players: Math.max(1, Math.min(4, players || 2)), alphaMailDisguise: Boolean(settingsFlags & 0x01), spots };
}

function decodePayload(str) {
  return decodeCompactPayload(base64UrlToBytes(str));
}

// -----------------------------------------------------------------------------
// 最適化結果と地図ハイライト
// -----------------------------------------------------------------------------
function optimizationSignature() {
  return JSON.stringify({
    players: Number(state.players),
    alphaMailDisguise: Boolean(state.alphaMailDisguise),
    items: activeItems().map(item => [item.def.id, item.exists, item.bonus, item.itemId || '', item.firstTimeWeek || false, item.hardMode || false, Number(item.value) || 0])
  });
}

function optimizationIsCurrent() {
  return Boolean(latestOptimization && latestOptimization.signature === optimizationSignature());
}
function activeMapAssignment() {
  if (!optimizationIsCurrent() || mapDisplayMode === 'all-targets') return null;
  if (mapDisplayMode === 'optimized-all') return latestOptimization.assignments.flat();
  if (mapDisplayMode === 'player' && highlightedPlayer !== null) {
    return latestOptimization.assignments[highlightedPlayer] || [];
  }
  return null;
}
function setMapDisplayMode(mode, playerIndex = null, jumpToFirstFloor = true) {
  mapDisplayMode = mode;
  highlightedPlayer = mode === 'player' ? playerIndex : null;
  const assignment = activeMapAssignment();
  if (jumpToFirstFloor && assignment && assignment.length) {
    state.currentFloor = assignment[0].def.floor;
    state.selectedSpot = null;
    persist();
  }
  renderAll();
  renderPlayerSelector();
}
function setHighlightedPlayer(playerIndex, jumpToFirstFloor = true) {
  setMapDisplayMode('player', playerIndex, jumpToFirstFloor);
}
function renderPlayerSelector() {
  const host = el('playerHighlightControls');
  if (!host) return;
  if (!optimizationIsCurrent()) {
    host.classList.add('hidden');
    host.innerHTML = '';
    highlightedPlayer = null;
    mapDisplayMode = 'all-targets';
    return;
  }
  host.classList.remove('hidden');
  const buttons = [
    `<button type="button" class="player-filter ${mapDisplayMode === 'all-targets' ? 'active' : ''}" data-mode="all-targets">全ターゲット</button>`,
    `<button type="button" class="player-filter ${mapDisplayMode === 'optimized-all' ? 'active' : ''}" data-mode="optimized-all">全員</button>`,
    ...latestOptimization.assignments.map((_, i) => `<button type="button" class="player-filter ${mapDisplayMode === 'player' && highlightedPlayer === i ? 'active' : ''}" data-mode="player" data-player="${i}">P${i + 1}</button>`)
  ];
  host.innerHTML = `<span>地図表示</span>${buttons.join('')}`;
  host.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      setMapDisplayMode(mode, mode === 'player' ? Number(button.dataset.player) : null);
    });
  });
}
// -----------------------------------------------------------------------------
// UI描画
// -----------------------------------------------------------------------------
/**
 * 現在の地図表示モードで回収対象になっているアイテムを、階層ごとに集計します。
 *
 * - 「全ターゲット」表示では担当ルートを表示していないため、階層ハイライトもしません。
 * - 「全員」では最適化で選ばれた全アイテムを対象にします。
 * - 「P1～P4」では選択中プレイヤーの担当アイテムだけを対象にします。
 *
 * 戻り値は Map<階層名, 回収物数> です。
 */
function assignmentCountByFloor() {
  const assignment = activeMapAssignment();
  const counts = new Map();
  if (!assignment) return counts;

  for (const item of assignment) {
    const floor = item?.def?.floor;
    if (!floor) continue;
    counts.set(floor, (counts.get(floor) || 0) + 1);
  }
  return counts;
}

/**
 * 上部の階層切り替えタブを描画します。
 *
 * 最適化結果の「全員」または「P1～P4」を表示中は、回収物が存在する階層を
 * 青色で強調し、右側の小さなバッジにその階層の回収物数を表示します。
 */
function renderTabs() {
  const assignmentCounts = assignmentCountByFloor();

  el('floorTabs').innerHTML = Object.keys(FLOORS).map(floor => {
    const count = assignmentCounts.get(floor) || 0;
    const classes = [
      'tab',
      floor === state.currentFloor ? 'active' : '',
      count > 0 ? 'has-route-loot' : ''
    ].filter(Boolean).join(' ');
    const countBadge = count > 0
      ? `<span class="tab-route-count" aria-label="回収物${count}個">${count}</span>`
      : '';

    return `<button class="${classes}" data-floor="${floor}">` +
      `<span class="tab-label">${floor}</span>${countBadge}</button>`;
  }).join('');

  el('floorTabs').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    state.currentFloor = btn.dataset.floor;
    state.selectedSpot = null;
    persist();
    renderAll();
  }));
}

function markerSizeForStage(stageWidth) {
  if (stageWidth <= 420) return 36;
  if (stageWidth <= 560) return 40;
  if (stageWidth <= 760) return 44;
  if (stageWidth <= 980) return 48;
  return 52;
}

function rectsOverlap(a, b, gap = 0) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function labelRectFor(side, cx, cy, markerSize, width, height, gap) {
  const half = markerSize / 2;
  switch (side) {
    case 'top':
      return { left: cx - width / 2, top: cy - half - gap - height, right: cx + width / 2, bottom: cy - half - gap };
    case 'left':
      return { left: cx - half - gap - width, top: cy - height / 2, right: cx - half - gap, bottom: cy + height / 2 };
    case 'right':
      return { left: cx + half + gap, top: cy - height / 2, right: cx + half + gap + width, bottom: cy + height / 2 };
    case 'bottom-left':
      return { left: cx - width, top: cy + half + gap, right: cx, bottom: cy + half + gap + height };
    case 'bottom-right':
      return { left: cx, top: cy + half + gap, right: cx + width, bottom: cy + half + gap + height };
    case 'top-left':
      return { left: cx - width, top: cy - half - gap - height, right: cx, bottom: cy - half - gap };
    case 'top-right':
      return { left: cx, top: cy - half - gap - height, right: cx + width, bottom: cy - half - gap };
    default:
      return { left: cx - width / 2, top: cy + half + gap, right: cx + width / 2, bottom: cy + half + gap + height };
  }
}

function applyMarkerCollisionLayout() {
  const stage = document.querySelector('.map-stage');
  const markerLayer = el('markers');
  if (!stage || !markerLayer) return;
  const stageRect = stage.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return;

  const size = markerSizeForStage(stageRect.width);
  stage.style.setProperty('--marker-size', `${size}px`);
  const buttons = [...markerLayer.querySelectorAll('.marker')];
  const nodes = buttons.map((button, index) => ({
    button,
    index,
    baseX: Number.parseFloat(button.style.left) * stageRect.width / 100,
    baseY: Number.parseFloat(button.style.top) * stageRect.height / 100,
    x: Number.parseFloat(button.style.left) * stageRect.width / 100,
    y: Number.parseFloat(button.style.top) * stageRect.height / 100,
  }));

  // アイコン同士を先に分離する。元地点からの移動量は抑えつつ、密集部では少し強めに押し分ける。
  const minDistance = size * 1.12;
  const maxShift = Math.min(52, size * 1.08);
  const edge = size / 2 + 3;
  for (let pass = 0; pass < 28; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDistance) continue;
        if (dist < 0.01) {
          const angle = ((i * 37 + j * 71) % 360) * Math.PI / 180;
          dx = Math.cos(angle); dy = Math.sin(angle); dist = 1;
        }
        const push = (minDistance - dist) * 0.54;
        const ux = dx / dist, uy = dy / dist;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
    for (const node of nodes) {
      const dx = node.x - node.baseX, dy = node.y - node.baseY;
      const d = Math.hypot(dx, dy);
      if (d > maxShift) {
        node.x = node.baseX + dx / d * maxShift;
        node.y = node.baseY + dy / d * maxShift;
      }
      node.x = Math.max(edge, Math.min(stageRect.width - edge, node.x));
      node.y = Math.max(edge, Math.min(stageRect.height - edge, node.y));
    }
  }

  nodes.forEach(node => {
    node.button.style.setProperty('--marker-offset-x', `${Math.round(node.x - node.baseX)}px`);
    node.button.style.setProperty('--marker-offset-y', `${Math.round(node.y - node.baseY)}px`);
    node.button.classList.remove(
      'amount-top', 'amount-left', 'amount-right',
      'amount-bottom-left', 'amount-bottom-right', 'amount-top-left', 'amount-top-right'
    );
  });

  // 価格ラベルを「アイコン＋既に配置済みのラベル」と矩形衝突判定して配置する。
  const markerRects = nodes.map(node => ({
    left: node.x - size / 2,
    top: node.y - size / 2,
    right: node.x + size / 2,
    bottom: node.y + size / 2,
    owner: node,
  }));
  const placedLabels = [];
  const sideClass = {
    top: 'amount-top', left: 'amount-left', right: 'amount-right',
    'bottom-left': 'amount-bottom-left', 'bottom-right': 'amount-bottom-right',
    'top-left': 'amount-top-left', 'top-right': 'amount-top-right',
  };
  const sideOrders = [
    ['bottom', 'left', 'right', 'top', 'bottom-left', 'bottom-right', 'top-left', 'top-right'],
    ['right', 'top', 'bottom', 'left', 'top-right', 'bottom-right', 'top-left', 'bottom-left'],
    ['left', 'bottom', 'top', 'right', 'bottom-left', 'top-left', 'bottom-right', 'top-right'],
    ['top', 'right', 'left', 'bottom', 'top-right', 'top-left', 'bottom-right', 'bottom-left'],
  ];

  const labelNodes = nodes
    .filter(node => node.button.querySelector('.marker-amount'))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  labelNodes.forEach((node, orderIndex) => {
    const amount = node.button.querySelector('.marker-amount');
    const width = Math.max(52, amount.offsetWidth || 62);
    const height = Math.max(20, amount.offsetHeight || 20);
    const gap = 6;
    const sides = sideOrders[(node.index + orderIndex) % sideOrders.length];
    let best = null;

    for (const side of sides) {
      const rect = labelRectFor(side, node.x, node.y, size, width, height, gap);
      const out = Math.max(0, -rect.left) + Math.max(0, -rect.top)
        + Math.max(0, rect.right - stageRect.width) + Math.max(0, rect.bottom - stageRect.height);
      let collisions = 0;
      for (const markerRect of markerRects) {
        if (markerRect.owner === node) continue;
        if (rectsOverlap(rect, markerRect, 3)) collisions += 4;
      }
      for (const other of placedLabels) {
        if (rectsOverlap(rect, other, 5)) collisions += 7;
      }
      const score = collisions * 1000 + out * 25;
      if (!best || score < best.score) best = { side, rect, score };
      if (score === 0) break;
    }

    if (best && best.side !== 'bottom') node.button.classList.add(sideClass[best.side]);
    if (best) placedLabels.push(best.rect);
  });
}

function renderMap() {
  const cfg = FLOORS[state.currentFloor];
  el('mapImage').src = cfg.image;
  el('mapImage').alt = `${state.currentFloor} マップ`;
  const mapAssignment = activeMapAssignment();
  const highlightedIds = new Set((mapAssignment || []).map(item => item.def.id));
  const shouldFilter = optimizationIsCurrent() && mapDisplayMode !== 'all-targets';
  el('markers').innerHTML = cfg.spots.map((raw, idx) => {
    const def = SPOT_DEFS[raw[0]], data = getSpot(def.id);
    const filled = data.exists;
    const isBonus = !def.isMain && data.bonus;
    const classes = [
      'marker', `type-${filled ? def.type : 'none'}`, 
      !filled ? 'empty' : '', filled ? 'filled' : '', isBonus ? 'bonus' : '',
      def.isMain ? 'main' : '', state.selectedSpot === def.id ? 'selected' : '',
      shouldFilter && highlightedIds.has(def.id) ? 'player-highlight' : '',
      shouldFilter && !highlightedIds.has(def.id) ? 'player-dimmed' : '',
      def.y >= 84 ? 'near-bottom' : '', def.x <= 10 ? 'near-left' : '', def.x >= 90 ? 'near-right' : ''
    ].filter(Boolean).join(' ');
    const visibleType = filled ? effectiveIcon(def, data) : 'none';
    const symbol = `<span class="marker-icon"><img src="${iconFor(visibleType)}" alt="" draggable="false"></span>`;
    const playerBadge = mapDisplayMode === 'player' && highlightedIds.has(def.id) ? `<span class="player-marker-badge">P${highlightedPlayer + 1}</span>` : '';
    const loot = selectedLoot(def, data);
    const shownValue = effectiveValue(def, data);
    const label = `${def.name}${filled && loot ? `・${loot.name}` : ''}${shownValue > 0 ? `・${money(shownValue)}` : ''}`;
    const amount = shownValue > 0
      ? `<span class="marker-amount">${money(shownValue)}</span>`
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
  requestAnimationFrame(applyMarkerCollisionLayout);
  const mapImage = el('mapImage');
  if (!mapImage.dataset.collisionBound) {
    mapImage.addEventListener('load', () => requestAnimationFrame(applyMarkerCollisionLayout));
    mapImage.dataset.collisionBound = '1';
  }
  const floorDefs = cfg.spots.map(s => SPOT_DEFS[s[0]]);
  const completed = floorDefs.filter(d => getSpot(d.id).exists || d.isMain).length;
  el('floorProgress').textContent = `${completed} / ${floorDefs.length} 地点入力`;
}


function updateVisualViewportVars() {
  const viewport = window.visualViewport;
  const scale = viewport && Number.isFinite(viewport.scale) ? Math.max(1, viewport.scale) : 1;
  const inverse = 1 / scale;

  const offsetLeft = viewport ? viewport.offsetLeft : 0;
  const offsetTop = viewport ? viewport.offsetTop : 0;
  const visibleWidth = viewport ? viewport.width : window.innerWidth;
  const visibleHeight = viewport ? viewport.height : window.innerHeight;

  // Desired sizes are expressed in unzoomed visual pixels. The outer shell is
  // sized in visualViewport CSS coordinates, while the inner card is inverse-
  // scaled. This keeps both the sheet outline and its typography stable.
  const marginVisual = 8;
  const availableVisualWidth = Math.max(240, visibleWidth * scale - marginVisual * 2);
  const availableVisualHeight = Math.max(220, visibleHeight * scale - marginVisual * 2);
  const editorVisualWidth = Math.min(420, availableVisualWidth);
  const editorVisualHeight = Math.min(620, availableVisualHeight);
  const shellWidth = editorVisualWidth / scale;
  const shellHeight = editorVisualHeight / scale;

  document.documentElement.style.setProperty('--visual-zoom-inverse', String(inverse));
  document.documentElement.style.setProperty('--visual-center-x', `${offsetLeft + visibleWidth / 2}px`);
  document.documentElement.style.setProperty('--visual-bottom-y', `${offsetTop + visibleHeight - marginVisual / scale}px`);
  document.documentElement.style.setProperty('--mobile-shell-width', `${shellWidth}px`);
  document.documentElement.style.setProperty('--mobile-shell-height', `${shellHeight}px`);
  document.documentElement.style.setProperty('--mobile-editor-width', `${editorVisualWidth}px`);
  document.documentElement.style.setProperty('--mobile-editor-max-height', `${editorVisualHeight}px`);
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
  el('targetBonus').checked = def.isMain ? false : data.bonus;
  el('targetExistsField').classList.toggle('hidden', def.isMain);
  el('bonusField').classList.toggle('hidden', def.isMain);
  el('mainTargetFields').classList.toggle('hidden', !def.isMain);

  const itemSelect = el('lootItem');
  if (def.isMain) {
    itemSelect.innerHTML = `<option value="">メインターゲットを選択</option>` + MAIN_TARGETS.map(item =>
      `<option value="${item.id}">${item.name}</option>`).join('');
  } else {
    const options = SPOT_LOOT_OPTIONS[id] || [];
    itemSelect.innerHTML = `<option value="">アイテムを選択</option>` + options.map(itemId =>
      `<option value="${itemId}">${LOOT_CATALOG[itemId]?.name || itemId}</option>`).join('');
  }
  itemSelect.value = data.itemId || '';

  const priceSelect = el('targetPrice');
  const item = selectedLoot(def, data);
  if (def.isMain) {
    el('targetPriceField').classList.add('hidden');
    el('mainFirstTime').checked = Boolean(data.firstTimeWeek);
    el('mainHardMode').checked = Boolean(data.hardMode);
    const values = mainDisplayValues(item, data);
    el('mainPriceTable').innerHTML = values ? `<section class="main-price-mode">
      <h3>${values.modeLabel}${data.firstTimeWeek ? '・週内初回' : ''}</h3>
      <div class="main-price-grid">
        <span>未発覚</span><span>${money(values.noAlarm)}</span>
        <span>発覚</span><span>${money(values.alarm)}</span>
      </div>
    </section>` : '<span class="field-hint">絵画を選択すると価格を表示します。</span>';
  } else {
    el('targetPriceField').classList.remove('hidden');
    const prices = priceValuesFor(item);
    priceSelect.innerHTML = item ? prices.map(value => `<option value="${value}">${money(value)}</option>`).join('') : '<option value="">先にアイテムを選択</option>';
    const value = Number(data.value) || defaultPrice(item);
    if (item && value) priceSelect.value = String(value);
    priceSelect.disabled = !item;
    priceSelect.classList.toggle('is-default', Boolean(item && !data.priceExplicit));
    el('priceHint').textContent = item ? `価格幅：${money(prices[0])} ～ ${money(prices.at(-1))}${data.priceExplicit ? '' : '（最低額を仮設定）'}` : '';
  }
  requestAnimationFrame(positionFloatingEditor);
}

function currentWeight(type) { return TYPE_INFO[type]?.weight || 0; }
function activeItems() {
  return allSpotDefs().map(def => {
    const data = getSpot(def.id);
    return { def, ...data, type: effectiveType(def, data), weight: effectiveWeight(def, data), value: effectiveValue(def, data), loot: selectedLoot(def, data) };
  }).filter(x => x.exists && (x.def.isMain ? Boolean(x.loot) : Boolean(x.loot)));
}

function optimizationValue(item) {
  // 金額未入力の地点は同価値として扱い、バッグに多く収まる組み合わせを選ぶ。
  return Number(item.value) > 0 ? Number(item.value) : 1;
}

function renderSummary() {
  const items = activeItems();
  const mainItem = items.find(item => item.def.isMain);
  const secondaryTotal = items.filter(item => !item.def.isMain).reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const mainValues = mainItem ? mainDisplayValues(mainItem.loot, mainItem) : null;
  el('noAlarmTotalValue').textContent = money(secondaryTotal + (mainValues?.noAlarm || 0));
  el('alarmTotalValue').textContent = money(secondaryTotal + (mainValues?.alarm || 0));
  el('totalWeight').textContent = `${items.reduce((a,b) => a + b.weight, 0)}%`;
}

// -----------------------------------------------------------------------------
// 回収ルート最適化（容量5%単位の数値DP）
// -----------------------------------------------------------------------------
function optimize() {
  const players = Number(state.players);
  const capUnits = 20; // 5%単位。100% = 20
  const base = capUnits + 1;
  const allBagItems = activeItems().filter(x => x.weight > 0);
  const truckExcludedItems = state.alphaMailDisguise ? [] : allBagItems.filter(x => x.def.isTransportTruck);
  const bagItems = state.alphaMailDisguise ? allBagItems : allBagItems.filter(x => !x.def.isTransportTruck);
  const soloExcludedItems = players === 1
    ? bagItems.filter(x => SOLO_UNAVAILABLE_SPOT_IDS.has(x.def.id))
    : [];
  const items = players === 1
    ? bagItems.filter(x => !SOLO_UNAVAILABLE_SPOT_IDS.has(x.def.id))
    : bagItems;

  if (!items.length) {
    el('optimizerResult').className = 'optimizer-result muted';
    el('optimizerResult').textContent = 'バッグ対象を入力してください。';
    return;
  }

  const ordered = items
    .map(item => ({
      ...item,
      required: !item.def.isMain && item.bonus,
      weightUnits: item.weight / 5
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
  const bestBins = bestAssign.map(list => list.reduce((sum, item) => sum + item.weight, 0));
  const plans = bestAssign.map((list, i) => {
    const used = bestBins[i];
    const text = list.length
      ? list.map(x => `${x.bonus ? '★' : ''}${x.def.name}・${x.loot?.name || TYPE_INFO[x.type].label} ${Number(x.value) > 0 ? money(x.value) : '（金額未入力）'}`).join('<br>')
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
  mapDisplayMode = 'optimized-all';
  const truckExcludedNote = truckExcludedItems.length
    ? `<br><span class="muted-note">アルファメールの変装で侵入が未選択のため、搬入トラックの略奪品を計算から除外しました。</span>`
    : '';
  const soloExcludedNote = soloExcludedItems.length
    ? `<br><span class="muted-note">ソロでは取得できないため、No.05〜11の入力済みアイテム${soloExcludedItems.length}個を計算から除外しました。</span>`
    : '';
  el('optimizerResult').innerHTML = `${heading}<br>バッグ使用量：${bestBins.reduce((a, b) => a + b, 0)}% / ${players * 100}%${soloExcludedNote}${truckExcludedNote}${plans}`;
  el('optimizerResult').querySelectorAll('[data-highlight-player]').forEach(button => {
    button.addEventListener('click', () => setHighlightedPlayer(Number(button.dataset.highlightPlayer)));
  });
  // 最適化直後は「全員」表示へ切り替わるため、階層タブの青ハイライトも更新します。
  renderTabs();
  renderPlayerSelector();
}
function renderAll() { renderTabs(); renderMap(); renderEditor(); renderSummary(); renderPlayerSelector(); }

// -----------------------------------------------------------------------------
// イベント登録と初期化
// -----------------------------------------------------------------------------
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
    const def = SPOT_DEFS[state.selectedSpot];
    const firstItem = !def.isMain && e.target.checked && !data.itemId ? (SPOT_LOOT_OPTIONS[def.id] || [])[0] : data.itemId;
    const item = firstItem ? LOOT_CATALOG[firstItem] : null;
    setSpot(state.selectedSpot, {
      exists: e.target.checked,
      bonus: e.target.checked ? data.bonus : false,
      itemId: firstItem || '',
      value: e.target.checked && item && !data.value ? String(defaultPrice(item)) : data.value,
      priceExplicit: e.target.checked ? data.priceExplicit : false
    });
  });
  el('lootItem').addEventListener('change', e => {
    const id = state.selectedSpot;
    const def = SPOT_DEFS[id];
    const itemId = e.target.value;
    if (def.isMain) {
      setSpot(id, { itemId, exists: true, firstTimeWeek: getSpot(id).firstTimeWeek, hardMode: getSpot(id).hardMode });
      return;
    }
    const item = LOOT_CATALOG[itemId];
    setSpot(id, { itemId, value: item ? String(defaultPrice(item)) : '', priceExplicit: false, exists: Boolean(itemId) });
  });
  el('targetPrice').addEventListener('change', e => {
    const value = e.target.value;
    setSpot(state.selectedSpot, { value, priceExplicit: true, exists: Number(value) > 0 });
  });
  el('mainFirstTime').addEventListener('change', e => {
    setSpot(state.selectedSpot, { firstTimeWeek: e.target.checked });
  });
  el('mainHardMode').addEventListener('change', e => {
    setSpot(state.selectedSpot, { hardMode: e.target.checked });
  });
  el('targetBonus').addEventListener('change', e => {
    const def = SPOT_DEFS[state.selectedSpot];
    if (!def || def.isMain) return;
    setSpot(state.selectedSpot, { bonus: e.target.checked });
  });
  el('clearSpotButton').addEventListener('click', () => { state.spots[state.selectedSpot] = blankSpot(SPOT_DEFS[state.selectedSpot]); persist(); renderAll(); });
  el('playerCount').addEventListener('change', e => { state.players = Number(e.target.value); latestOptimization = null; highlightedPlayer = null; mapDisplayMode = 'all-targets'; persist(); renderAll(); el('optimizerResult').textContent = '人数を変更しました。もう一度計算してください。'; });
  el('alphaMailDisguise').addEventListener('change', e => { state.alphaMailDisguise = e.target.checked; latestOptimization = null; highlightedPlayer = null; mapDisplayMode = 'all-targets'; persist(); renderAll(); el('optimizerResult').textContent = '侵入方法を変更しました。もう一度計算してください。'; });
  el('optimizeButton').addEventListener('click', optimize);
  el('shareButton').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?d=${encodePayload()}`;
    try { await navigator.clipboard.writeText(url); toast('共有リンクをコピーしました'); }
    catch { prompt('このリンクをコピーしてください', url); }
  });
  el('resetButton').addEventListener('click', () => {
    if (!confirm('入力内容をすべて消去しますか？')) return;
    state.spots = {}; state.alphaMailDisguise = false; el('alphaMailDisguise').checked = false; state.selectedSpot = null; latestOptimization = null; highlightedPlayer = null; mapDisplayMode = 'all-targets'; persist(); renderAll(); el('optimizerResult').textContent = '入力後に計算できます。'; toast('全消去しました');
  });
}
function toast(msg) { const t=el('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),2200); }

load();
el('playerCount').value = String(state.players);
el('alphaMailDisguise').checked = Boolean(state.alphaMailDisguise);
bind();
updateVisualViewportVars();
renderAll();

window.addEventListener('resize', () => requestAnimationFrame(applyMarkerCollisionLayout), { passive: true });
