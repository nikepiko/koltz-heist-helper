'use strict';

const FLOORS = {
  '2F': {
    image: 'assets/2F.png',
    spots: [
      ['2f-01', 77.27, 40.21], ['2f-02', 76.99, 53.13], ['2f-03', 77.06, 65.50],
      ['2f-04', 77.17, 79.07], ['2f-05', 76.22, 85.29], ['2f-06', 91.66, 91.08],
      ['2f-7', 81.99, 95.43], ['2f-8', 67.53, 95.63], ['2f-9', 54.41, 95.44],
      ['2f-10', 54.36, 86.33], ['2f-11', 47.07, 86.47], ['2f-12', 26.21, 82.50],
      ['2f-13', 26.21, 72.50]
    ]
  },
  '1F': {
    image: 'assets/1F.png',
    // 左端から近い地点を順にたどり、上側のまとまりから下側へ抜ける一筆書き順。
    spots: [
      ['1f-07', 13.13, 63.25], ['1f-02', 37.54, 43.01], ['1f-04', 55.27, 46.39],
      ['1f-05', 55.29, 50.00], ['1f-06', 61.82, 52.07], ['1f-03', 71.14, 44.62],
      ['1f-01', 65.86, 40.72], ['1f-08', 62.09, 76.46], ['1f-09', 55.25, 80.32],
      ['1f-11', 66.21, 87.58], ['1f-10', 71.47, 83.72], ['1f-12', 74.54, 96.50]
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
      ['vault-main', 49.5, 88.0, 'main'],
      ['vault-p1', 22.4, 44.5, 'paintingOnly'], ['vault-p2', 76.3, 48.0, 'paintingOnly'],
      ['vault-p3', 22.4, 63.5, 'paintingOnly'], ['vault-p4', 76.3, 67.1, 'paintingOnly']
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
const CONFIG = { mediumWeight: 25 };
let state = { version: 1, currentFloor: '1F', selectedSpot: null, players: 2, spots: {} };

const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);

function allSpotDefs() {
  return Object.entries(FLOORS).flatMap(([floor, cfg]) => {
    let regularIndex = 0;
    return cfg.spots.map(s => {
      const fixed = s[3] || null;
      const name = fixed === 'main' ? 'メインターゲット' : `${floor} 地点${++regularIndex}`;
      return { id: s[0], x: s[1], y: s[2], fixed, floor, name };
    });
  });
}
const SPOT_DEFS = Object.fromEntries(allSpotDefs().map(s => [s.id, s]));

function blankSpot(def) {
  return { type: def.fixed === 'main' ? 'main' : 'none', value: '', bonus: false, memo: '' };
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

function getSpot(id) { return state.spots[id] || blankSpot(SPOT_DEFS[id]); }
function setSpot(id, patch) { state.spots[id] = { ...getSpot(id), ...patch }; persist(); renderAll(); }

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load() {
  try {
    const params = new URLSearchParams(location.search);
    const shared = params.get('d');
    if (shared) {
      state = { ...state, ...JSON.parse(decodePayload(shared)) };
      history.replaceState(null, '', location.pathname);
      toast('共有データを読み込みました');
      return;
    }
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) state = { ...state, ...JSON.parse(local) };
  } catch (e) { console.warn('データの読み込みに失敗', e); }
}
function encodePayload(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = ''; bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
function decodePayload(str) {
  str = str.replaceAll('-','+').replaceAll('_','/');
  while (str.length % 4) str += '=';
  const binary = atob(str); const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
    const filled = data.type !== 'none' && (Number(data.value) > 0 || data.type === 'main');
    const isBonus = def.fixed !== 'main' && data.bonus;
    const classes = [
      'marker', `type-${data.type}`,
      data.type === 'none' ? 'empty' : '', filled ? 'filled' : '', isBonus ? 'bonus' : '',
      def.fixed === 'main' ? 'main' : '', state.selectedSpot === def.id ? 'selected' : '',
      def.y >= 84 ? 'near-bottom' : '', def.x <= 10 ? 'near-left' : '', def.x >= 90 ? 'near-right' : ''
    ].filter(Boolean).join(' ');
    const symbol = `<span class="marker-icon"><img src="${iconFor(data.type)}" alt="" draggable="false"></span>`;
    const label = `${def.name}${data.type !== 'none' ? `・${TYPE_INFO[data.type].label}` : ''}${data.value ? `・${money(data.value)}` : ''}`;
    const amount = Number(data.value) > 0 ? `<span class="marker-amount">${money(data.value)}</span>` : '';
    return `<button class="${classes}" style="left:${def.x}%;top:${def.y}%" data-id="${def.id}" aria-label="${label}">${symbol}${amount}<span class="marker-label">${label}</span></button>`;
  }).join('');
  el('markers').querySelectorAll('.marker').forEach(btn => btn.addEventListener('click', event => {
    event.stopPropagation();
    state.selectedSpot = btn.dataset.id; persist(); renderAll();
  }));
  const floorDefs = cfg.spots.map(s => SPOT_DEFS[s[0]]);
  const completed = floorDefs.filter(d => getSpot(d.id).type !== 'none' && Number(getSpot(d.id).value) > 0).length;
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
  el('targetType').value = data.type;
  el('targetValue').value = data.value;
  el('targetBonus').checked = def.fixed === 'main' ? false : data.bonus;
  el('targetMemo').value = data.memo;
  const fixed = def.fixed;
  const typeSelect = el('targetType');
  [...typeSelect.options].forEach(option => {
    option.hidden = fixed === 'paintingOnly' && !['none', 'painting'].includes(option.value);
    option.disabled = option.hidden;
  });
  el('typeField').classList.toggle('hidden', fixed === 'main');
  el('bonusField').classList.toggle('hidden', fixed === 'main');
  requestAnimationFrame(positionFloatingEditor);
}

function currentWeight(type) { return type === 'medium' ? CONFIG.mediumWeight : TYPE_INFO[type].weight; }
function activeItems() {
  return allSpotDefs().map(def => ({ def, ...getSpot(def.id) }))
    .filter(x => x.type !== 'none' && Number(x.value) > 0);
}
function renderSummary() {
  const items = activeItems();
  el('filledCount').textContent = items.length;
  el('bonusCount').textContent = items.filter(x => x.def.fixed !== 'main' && x.bonus).length;
  el('totalValue').textContent = money(items.reduce((a,b) => a + Number(b.value), 0));
  el('totalWeight').textContent = `${items.reduce((a,b) => a + currentWeight(b.type), 0)}%`;
}

function optimize() {
  const players = Number(state.players), cap = 100;
  const items = activeItems().filter(x => currentWeight(x.type) > 0);
  if (!items.length) { el('optimizerResult').className = 'optimizer-result muted'; el('optimizerResult').textContent = 'バッグ対象を入力してください。'; return; }

  const required = items.filter(x => x.def.fixed !== 'main' && x.bonus);
  const optional = items.filter(x => x.def.fixed === 'main' || !x.bonus);
  const bins = Array(players).fill(0);
  const assignments = Array.from({length: players}, () => []);

  function placeRequired(i) {
    if (i >= required.length) return true;
    const item = required[i], w = currentWeight(item.type);
    for (let p=0; p<players; p++) {
      if (bins[p] + w <= cap) {
        bins[p] += w; assignments[p].push(item);
        if (placeRequired(i+1)) return true;
        assignments[p].pop(); bins[p] -= w;
      }
      if (bins[p] === 0) break;
    }
    return false;
  }
  if (!placeRequired(0)) {
    el('optimizerResult').className = 'optimizer-result';
    el('optimizerResult').innerHTML = '<span class="warning">ボーナス対象を全員のバッグに収められません。</span><br>人数か対象設定を確認してください。';
    return;
  }

  let bestValue = required.reduce((s,x)=>s+Number(x.value),0);
  let bestBins = bins.slice();
  let bestAssign = assignments.map(a=>a.slice());
  optional.sort((a,b) => (Number(b.value)/currentWeight(b.type)) - (Number(a.value)/currentWeight(a.type)));

  function dfs(i, value) {
    if (i >= optional.length) {
      if (value > bestValue) { bestValue = value; bestBins = bins.slice(); bestAssign = assignments.map(a=>a.slice()); }
      return;
    }
    const optimistic = value + optional.slice(i).reduce((s,x)=>s+Number(x.value),0);
    if (optimistic <= bestValue) return;
    const item = optional[i], w = currentWeight(item.type);
    const seenLoads = new Set();
    for (let p=0; p<players; p++) {
      if (bins[p] + w <= cap && !seenLoads.has(bins[p])) {
        seenLoads.add(bins[p]); bins[p] += w; assignments[p].push(item);
        dfs(i+1, value + Number(item.value));
        assignments[p].pop(); bins[p] -= w;
      }
    }
    dfs(i+1, value);
  }
  dfs(0, bestValue);

  const plans = bestAssign.map((list, i) => {
    const used = bestBins[i];
    const text = list.length ? list.map(x => `${x.bonus ? '★' : ''}${x.def.floor} ${TYPE_INFO[x.type].label} ${money(x.value)}`).join('<br>') : '回収なし';
    return `<div class="player-plan"><b>プレイヤー${i+1}：${used}% / 100%</b>${text}</div>`;
  }).join('');
  el('optimizerResult').className = 'optimizer-result';
  el('optimizerResult').innerHTML = `<strong>推奨回収額：${money(bestValue)}</strong><br>バッグ使用量：${bestBins.reduce((a,b)=>a+b,0)}% / ${players*100}%${plans}`;
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
  el('targetType').addEventListener('change', e => setSpot(state.selectedSpot, { type: e.target.value }));
  el('targetValue').addEventListener('input', e => setSpot(state.selectedSpot, { value: e.target.value }));
  el('targetBonus').addEventListener('change', e => {
    const def = SPOT_DEFS[state.selectedSpot];
    if (!def || def.fixed === 'main') return;
    setSpot(state.selectedSpot, { bonus: e.target.checked });
  });
  el('targetMemo').addEventListener('input', e => setSpot(state.selectedSpot, { memo: e.target.value }));
  el('clearSpotButton').addEventListener('click', () => { state.spots[state.selectedSpot] = blankSpot(SPOT_DEFS[state.selectedSpot]); persist(); renderAll(); });
  el('playerCount').addEventListener('change', e => { state.players = Number(e.target.value); persist(); });
  el('optimizeButton').addEventListener('click', optimize);
  el('shareButton').addEventListener('click', async () => {
    const payload = { version: 1, spots: state.spots, players: state.players };
    const url = `${location.origin}${location.pathname}?d=${encodePayload(payload)}`;
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
