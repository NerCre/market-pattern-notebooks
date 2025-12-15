// Utility functions for localStorage handling and unique ID generation
function getTrades() {
  const data = localStorage.getItem('trades');
  return data ? JSON.parse(data) : [];
}

function saveTrades(trades) {
  localStorage.setItem('trades', JSON.stringify(trades));
}

function addTrade(record) {
  const trades = getTrades();
  trades.push(record);
  saveTrades(trades);
}

function updateTrade(record) {
  const trades = getTrades();
  const idx = trades.findIndex((t) => t.id === record.id);
  if (idx !== -1) {
    trades[idx] = record;
    saveTrades(trades);
  }
}

function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'id-' + Math.random().toString(36).substr(2, 9);
}

// Tab switching
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.target;
    tabContents.forEach((section) => {
      section.classList.toggle('active', section.id === target);
    });
  });
});

// Entry form handlers
const entryForm = document.getElementById('entry-form');
const predictBtn = document.getElementById('predict-btn');
const predictSaveBtn = document.getElementById('predict-save-btn');
const predictionOutput = document.getElementById('prediction-output');
const entryError = document.getElementById('entry-error');

let editingRecordId = null;

// Image preview
const entryImageInput = document.getElementById('entry-image');
const entryImagePreview = document.getElementById('entry-image-preview');
entryImageInput.addEventListener('change', () => {
  const file = entryImageInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      entryImagePreview.src = e.target.result;
      entryImagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    entryImagePreview.src = '';
    entryImagePreview.style.display = 'none';
  }
});

// Voice input using Web Speech API
const voiceBtn = document.getElementById('entry-voice');
let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.continuous = false;
  voiceBtn.addEventListener('click', () => {
    recognition.start();
    voiceBtn.disabled = true;
    voiceBtn.textContent = '録音中...';
  });
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const memoEl = document.getElementById('entry-marketMemo');
    memoEl.value = memoEl.value + transcript;
  };
  recognition.onend = () => {
    voiceBtn.disabled = false;
    voiceBtn.textContent = '🎤 音声入力';
  };
} else {
  voiceBtn.style.display = 'none';
}

// Extract form data as object
function getEntryFormData() {
  const data = {
    id: editingRecordId || generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // If datetime is未入力の場合は現在時刻をISOで設定
    datetimeEntry: document.getElementById('entry-datetime').value || new Date().toISOString(),
    symbol: document.getElementById('entry-symbol').value.trim(),
    timeframe: document.getElementById('entry-timeframe').value,
    tradeType: document.getElementById('entry-tradeType').value,
    directionPlanned: document.getElementById('entry-directionPlanned').value,
    entryPrice: parseFloat(document.getElementById('entry-price').value),
    size: parseFloat(document.getElementById('entry-size').value),
    feePerUnit: parseFloat(document.getElementById('entry-fee').value),
    plannedStopPrice: parseFloat(document.getElementById('entry-stop').value) || null,
    plannedLimitPrice: parseFloat(document.getElementById('entry-limit').value) || null,
    cutLossPrice: parseFloat(document.getElementById('entry-cutloss').value) || null,
    trend_5_20_40: document.getElementById('entry-trend').value,
    price_vs_ema200: document.getElementById('entry-price-ema200').value,
    ema_band_color: document.getElementById('entry-ema-band').value,
    zone: document.getElementById('entry-zone').value,
    cmf_sign: document.getElementById('entry-cmf-sign').value,
    cmf_sma_dir: document.getElementById('entry-cmf-dir').value,
    roc_sign: document.getElementById('entry-roc-sign').value,
    roc_sma_dir: document.getElementById('entry-roc-dir').value,
    macd_state: document.getElementById('entry-macd').value,
    rsi_zone: document.getElementById('entry-rsi').value,
    marketMemo: document.getElementById('entry-marketMemo').value.trim(),
    imageData: null,
    // prediction fields to be filled later
    recommendation: null,
    expectedMove: null,
    expectedMoveUnit: null,
    confidence: null,
    reason: null,
    // result fields
    hasResult: false,
    datetimeExit: null,
    exitPrice: null,
    directionTaken: null,
    highDuringTrade: null,
    lowDuringTrade: null,
    profit: null,
    note: null
  };
  return data;
}

// Validate entry form required fields
function validateEntry() {
  const requiredIds = [
    // 日時はブラウザによって入力値取得が難しい場合があるため空でも許容し、保存時に警告なく進める
    // 'entry-datetime',
    'entry-symbol',
    'entry-timeframe',
    'entry-tradeType',
    'entry-directionPlanned',
    'entry-price',
    'entry-size',
    'entry-fee',
    'entry-trend',
    'entry-price-ema200',
    'entry-ema-band',
    'entry-zone',
    'entry-cmf-sign',
    'entry-cmf-dir',
    'entry-roc-sign',
    'entry-roc-dir',
    'entry-macd',
    'entry-rsi'
  ];
  for (const id of requiredIds) {
    const el = document.getElementById(id);
    if (!el.value) {
      return false;
    }
  }
  return true;
}

// Prediction logic based on past records
function computePrediction(entry) {
  const trades = getTrades().filter((t) => t.hasResult);
  const levels = [
    [
      'trend_5_20_40',
      'price_vs_ema200',
      'ema_band_color',
      'zone',
      'cmf_sign',
      'cmf_sma_dir',
      'roc_sign',
      'roc_sma_dir',
      'macd_state',
      'rsi_zone'
    ],
    [
      'trend_5_20_40',
      'price_vs_ema200',
      'zone',
      'cmf_sign',
      'cmf_sma_dir',
      'roc_sign',
      'roc_sma_dir',
      'macd_state',
      'rsi_zone'
    ],
    [
      'trend_5_20_40',
      'price_vs_ema200',
      'zone',
      'cmf_sign',
      'roc_sign',
      'macd_state',
      'rsi_zone'
    ],
    ['trend_5_20_40', 'zone', 'cmf_sign', 'macd_state', 'rsi_zone'],
    ['trend_5_20_40', 'zone']
  ];
  let matched = [];
  let usedLevel = levels.length; // default worst level
  for (let i = 0; i < levels.length; i++) {
    const fields = levels[i];
    matched = trades.filter((t) => {
      return fields.every((key) => t[key] === entry[key]);
    });
    if (matched.length >= 3 || i === levels.length - 1) {
      usedLevel = i + 1;
      break;
    }
  }
  // Group by directionTaken
  const groups = {
    long: [],
    short: []
  };
  matched.forEach((t) => {
    if (t.directionTaken === 'long') {
      groups.long.push(t);
    } else if (t.directionTaken === 'short') {
      groups.short.push(t);
    }
  });
  const results = {};
  ['long', 'short'].forEach((dir) => {
    const group = groups[dir];
    const count = group.length;
    let wins = 0;
    let moves = [];
    group.forEach((t) => {
      if (t.profit > 0) wins++;
      if (dir === 'long') {
        const move = (t.highDuringTrade || t.exitPrice) - t.entryPrice;
        if (!isNaN(move)) moves.push(move);
      } else {
        const move = t.entryPrice - (t.lowDuringTrade || t.exitPrice);
        if (!isNaN(move)) moves.push(move);
      }
    });
    const winRate = count > 0 ? wins / count : 0;
    const avgMove = moves.length > 0 ? moves.reduce((a, b) => a + b, 0) / moves.length : 0;
    results[dir] = { count, wins, winRate, avgMove };
  });
  // Determine recommendation
  let recommendation = 'flat';
  let expectedMove = 0;
  let confidence = 0;
  const longRes = results.long;
  const shortRes = results.short;
  if (longRes.count < 3 && shortRes.count < 3) {
    recommendation = 'flat';
  } else {
    if (longRes.winRate > shortRes.winRate + 0.05) {
      recommendation = 'long';
      expectedMove = longRes.avgMove;
    } else if (shortRes.winRate > longRes.winRate + 0.05) {
      recommendation = 'short';
      expectedMove = shortRes.avgMove;
    } else {
      // If win rates are close, pick the direction with bigger avg move
      if (longRes.avgMove > shortRes.avgMove) {
        recommendation = 'long';
        expectedMove = longRes.avgMove;
      } else if (shortRes.avgMove > longRes.avgMove) {
        recommendation = 'short';
        expectedMove = shortRes.avgMove;
      } else {
        recommendation = 'flat';
        expectedMove = 0;
      }
    }
  }
  // Round expected move to nearest 10
  if (expectedMove !== 0) {
    expectedMove = Math.round(expectedMove / 10) * 10;
  }
  // Compute confidence
  const usedSamples = matched.length;
  let base = 50;
  switch (usedLevel) {
    case 1:
      base += 20;
      break;
    case 2:
      base += 10;
      break;
    case 3:
      base += 0;
      break;
    case 4:
      base -= 10;
      break;
    default:
      base -= 20;
  }
  base += Math.min(usedSamples * 5, 20);
  const diffWinRate = Math.abs(longRes.winRate - shortRes.winRate);
  base += diffWinRate * 100; // emphasise difference
  confidence = Math.max(0, Math.min(100, Math.round(base)));
  // Build reason message
  let reason = '';
  if (recommendation === 'long' || recommendation === 'short') {
    const res = results[recommendation];
    reason = `同条件に近い過去${recommendation === 'long' ? 'ロング' : 'ショート'}の勝率${(res.winRate * 100).toFixed(1)}%・平均最大伸び約${Math.round(res.avgMove)}で${recommendation === 'long' ? 'ロング' : 'ショート'}優勢`;
  } else {
    reason = '類似データが少ないか勝率が拮抗しているためノーポジ推奨';
  }
  return { recommendation, expectedMove, expectedMoveUnit: 'ポイント', confidence, reason };
}

// Display prediction result
function displayPrediction(result) {
  const { recommendation, expectedMove, expectedMoveUnit, confidence, reason } = result;
  const dirLabel = recommendation === 'long' ? 'ロング' : recommendation === 'short' ? 'ショート' : 'ノーポジ';
  predictionOutput.innerHTML = `
    <p>推奨方向: <strong>${dirLabel}</strong></p>
    <p>想定値幅: <strong>${expectedMove}${expectedMoveUnit}</strong></p>
    <p>自信度: <strong>${confidence}</strong></p>
    <p>理由: ${reason}</p>
  `;
}

// Entry prediction handler
predictBtn.addEventListener('click', () => {
  entryError.textContent = '';
  if (!validateEntry()) {
    entryError.textContent = '必須項目が未入力です。';
    return;
  }
  const entry = getEntryFormData();
  // Use selected image if any
  if (entryImageInput.files[0]) {
    entry.imageData = entryImagePreview.src;
  }
  const prediction = computePrediction(entry);
  displayPrediction(prediction);
});

// Prediction and save handler
predictSaveBtn.addEventListener('click', () => {
  entryError.textContent = '';
  if (!validateEntry()) {
    entryError.textContent = '必須項目が未入力です。';
    return;
  }
  const entry = getEntryFormData();
  if (entryImageInput.files[0]) {
    entry.imageData = entryImagePreview.src;
  }
  const prediction = computePrediction(entry);
  Object.assign(entry, prediction);
  entry.expectedMoveUnit = prediction.expectedMoveUnit;
  // Save new or update existing record
  const trades = getTrades();
  if (editingRecordId) {
    // Preserve createdAt for existing record
    const existing = trades.find((t) => t.id === editingRecordId);
    if (existing) {
      entry.createdAt = existing.createdAt;
      entry.hasResult = existing.hasResult;
      entry.datetimeExit = existing.datetimeExit;
      entry.exitPrice = existing.exitPrice;
      entry.directionTaken = existing.directionTaken;
      entry.highDuringTrade = existing.highDuringTrade;
      entry.lowDuringTrade = existing.lowDuringTrade;
      entry.profit = existing.profit;
      entry.note = existing.note;
    }
    updateTrade(entry);
    editingRecordId = null;
    predictSaveBtn.textContent = '判定してエントリーを保存';
  } else {
    addTrade(entry);
  }
  displayPrediction(prediction);
  loadResultSelection();
  buildTable();
  updateCharts();
  // Reset form
  entryForm.reset();
  entryImagePreview.style.display = 'none';
});

// Result form handlers
const resultSelect = document.getElementById('result-entry-select');
const resultForm = document.getElementById('result-form');
const resultEntryInfo = document.getElementById('result-entry-info');
const resultProfitEl = document.getElementById('result-profit');
const resultError = document.getElementById('result-error');

function loadResultSelection() {
  const trades = getTrades();
  resultSelect.innerHTML = '';
  // List all trades for editing result; show id and datetime
  trades.forEach((t) => {
    const option = document.createElement('option');
    option.value = t.id;
    const label = `${t.datetimeEntry || ''} / ${t.symbol || ''}`;
    option.textContent = label;
    resultSelect.appendChild(option);
  });
  if (trades.length > 0) {
    resultSelect.value = trades[0].id;
    loadResultForm(trades[0]);
  } else {
    resultEntryInfo.innerHTML = 'エントリーデータがありません';
    resultForm.reset();
    resultProfitEl.textContent = '0';
  }
}

resultSelect.addEventListener('change', () => {
  const id = resultSelect.value;
  const trade = getTrades().find((t) => t.id === id);
  if (trade) loadResultForm(trade);
});

function loadResultForm(trade) {
  // Show entry info
  resultEntryInfo.innerHTML = `
    <h3>選択したエントリー</h3>
    <p>日時: ${trade.datetimeEntry}</p>
    <p>銘柄: ${trade.symbol}</p>
    <p>時間足: ${trade.timeframe}</p>
    <p>エントリー価格: ${trade.entryPrice}</p>
    <p>枚数: ${trade.size}</p>
    <p>手数料/枚: ${trade.feePerUnit}</p>
    <p>推奨: ${trade.recommendation ? (trade.recommendation === 'long' ? 'ロング' : trade.recommendation === 'short' ? 'ショート' : 'ノーポジ') : ''}</p>
    <p>想定値幅: ${trade.expectedMove !== null ? trade.expectedMove + trade.expectedMoveUnit : ''}</p>
  `;
  // Populate result form fields
  document.getElementById('result-datetimeExit').value = trade.datetimeExit || '';
  document.getElementById('result-exitPrice').value = trade.exitPrice || '';
  document.getElementById('result-directionTaken').value = trade.directionTaken || 'long';
  document.getElementById('result-size').value = trade.size || '';
  document.getElementById('result-fee').value = trade.feePerUnit || '';
  document.getElementById('result-high').value = trade.highDuringTrade || '';
  document.getElementById('result-low').value = trade.lowDuringTrade || '';
  document.getElementById('result-note').value = trade.note || '';
  // Display profit
  resultProfitEl.textContent = trade.profit !== null && trade.profit !== undefined ? trade.profit : 0;
  // Attach change listeners to recalc profit
  ['result-exitPrice','result-directionTaken','result-size','result-fee'].forEach((id) => {
    document.getElementById(id).oninput = () => {
      calculateProfit(trade);
    };
  });
}

function calculateProfit(trade) {
  const exitPrice = parseFloat(document.getElementById('result-exitPrice').value);
  const direction = document.getElementById('result-directionTaken').value;
  const size = parseFloat(document.getElementById('result-size').value);
  const fee = parseFloat(document.getElementById('result-fee').value);
  if (!exitPrice || !size || !fee) {
    resultProfitEl.textContent = '0';
    return;
  }
  let profit = 0;
  if (direction === 'long') {
    profit = (exitPrice - trade.entryPrice - fee) * size;
  } else if (direction === 'short') {
    profit = (trade.entryPrice - exitPrice - fee) * size;
  } else {
    profit = 0;
  }
  resultProfitEl.textContent = Math.round(profit * 100) / 100;
}

// Save result
document.getElementById('result-save-btn').addEventListener('click', () => {
  resultError.textContent = '';
  const id = resultSelect.value;
  const trades = getTrades();
  const idx = trades.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const trade = trades[idx];
  const datetimeExit = document.getElementById('result-datetimeExit').value;
  const exitPrice = parseFloat(document.getElementById('result-exitPrice').value);
  const direction = document.getElementById('result-directionTaken').value;
  const size = parseFloat(document.getElementById('result-size').value);
  const fee = parseFloat(document.getElementById('result-fee').value);
  const high = parseFloat(document.getElementById('result-high').value) || null;
  const low = parseFloat(document.getElementById('result-low').value) || null;
  const note = document.getElementById('result-note').value.trim();
  // Validate required
  if (!datetimeExit || isNaN(exitPrice) || isNaN(size) || isNaN(fee)) {
    resultError.textContent = '必須項目が未入力です。';
    return;
  }
  // Recalc profit
  let profit = 0;
  if (direction === 'long') {
    profit = (exitPrice - trade.entryPrice - fee) * size;
  } else if (direction === 'short') {
    profit = (trade.entryPrice - exitPrice - fee) * size;
  } else {
    profit = 0;
  }
  trade.datetimeExit = datetimeExit;
  trade.exitPrice = exitPrice;
  trade.directionTaken = direction;
  trade.size = size;
  trade.feePerUnit = fee;
  trade.highDuringTrade = high;
  trade.lowDuringTrade = low;
  trade.note = note;
  trade.profit = Math.round(profit * 100) / 100;
  trade.hasResult = true;
  trade.updatedAt = new Date().toISOString();
  trades[idx] = trade;
  saveTrades(trades);
  resultProfitEl.textContent = trade.profit;
  // refresh table and charts
  buildTable();
  updateCharts();
});

// Analysis tab: build table with sorting and filtering
const recordsTableBody = document.querySelector('#records-table tbody');
const filterSymbol = document.getElementById('filter-symbol');
const filterTimeframe = document.getElementById('filter-timeframe');
const filterTradeType = document.getElementById('filter-tradeType');
const filterHasResult = document.getElementById('filter-hasResult');
const filterStartDate = document.getElementById('filter-startDate');
const filterEndDate = document.getElementById('filter-endDate');
const filterResetBtn = document.getElementById('filter-reset');
let currentSortField = null;
let sortAsc = true;

function buildTable() {
  const trades = getTrades();
  // Apply filters
  let filtered = trades.filter((t) => {
    if (filterSymbol.value && !t.symbol.includes(filterSymbol.value.trim())) return false;
    if (filterTimeframe.value && t.timeframe !== filterTimeframe.value) return false;
    if (filterTradeType.value && t.tradeType !== filterTradeType.value) return false;
    if (filterHasResult.value) {
      const boolVal = filterHasResult.value === 'true';
      if (t.hasResult !== boolVal) return false;
    }
    if (filterStartDate.value) {
      const start = new Date(filterStartDate.value);
      const entryDate = new Date(t.datetimeEntry);
      if (entryDate < start) return false;
    }
    if (filterEndDate.value) {
      const end = new Date(filterEndDate.value);
      const entryDate = new Date(t.datetimeEntry);
      if (entryDate > end) return false;
    }
    return true;
  });
  // Apply sorting
  if (currentSortField) {
    filtered.sort((a, b) => {
      let valA = a[currentSortField];
      let valB = b[currentSortField];
      if (currentSortField === 'datetimeEntry') {
        valA = new Date(valA);
        valB = new Date(valB);
      }
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }
  // Build rows
  recordsTableBody.innerHTML = '';
  filtered.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.datetimeEntry || ''}</td>
      <td>${t.symbol}</td>
      <td>${t.timeframe}</td>
      <td>${t.tradeType}</td>
      <td>${t.hasResult ? (t.directionTaken === 'long' ? 'ロング' : t.directionTaken === 'short' ? 'ショート' : 'ノーポジ') : ''}</td>
      <td>${t.hasResult ? t.profit : ''}</td>
      <td>${t.recommendation ? (t.recommendation === 'long' ? 'ロング' : t.recommendation === 'short' ? 'ショート' : 'ノーポジ') : ''}</td>
      <td>${t.hasResult ? '完了' : '未完了'}</td>
      <td><button class="secondary edit-btn" data-id="${t.id}">編集</button></td>
    `;
    recordsTableBody.appendChild(tr);
  });
  attachEditHandlers();
}

// Attach sort handlers to headers
document.querySelectorAll('#records-table th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const field = th.getAttribute('data-sort');
    if (currentSortField === field) {
      sortAsc = !sortAsc;
    } else {
      currentSortField = field;
      sortAsc = true;
    }
    buildTable();
  });
});

// Filter change events
[
  filterSymbol,
  filterTimeframe,
  filterTradeType,
  filterHasResult,
  filterStartDate,
  filterEndDate
].forEach((el) => {
  el.addEventListener('input', () => {
    buildTable();
    updateCharts();
  });
});

filterResetBtn.addEventListener('click', () => {
  filterSymbol.value = '';
  filterTimeframe.value = '';
  filterTradeType.value = '';
  filterHasResult.value = '';
  filterStartDate.value = '';
  filterEndDate.value = '';
  buildTable();
  updateCharts();
});

// Editing from analysis table
function attachEditHandlers() {
  const editButtons = document.querySelectorAll('.edit-btn');
  editButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const trades = getTrades();
      const trade = trades.find((t) => t.id === id);
      if (!trade) return;
      editingRecordId = id;
      // populate entry form fields
      document.getElementById('entry-datetime').value = trade.datetimeEntry;
      document.getElementById('entry-symbol').value = trade.symbol;
      document.getElementById('entry-timeframe').value = trade.timeframe;
      document.getElementById('entry-tradeType').value = trade.tradeType;
      document.getElementById('entry-directionPlanned').value = trade.directionPlanned;
      document.getElementById('entry-price').value = trade.entryPrice;
      document.getElementById('entry-size').value = trade.size;
      document.getElementById('entry-fee').value = trade.feePerUnit;
      document.getElementById('entry-stop').value = trade.plannedStopPrice || '';
      document.getElementById('entry-limit').value = trade.plannedLimitPrice || '';
      document.getElementById('entry-cutloss').value = trade.cutLossPrice || '';
      document.getElementById('entry-trend').value = trade.trend_5_20_40;
      document.getElementById('entry-price-ema200').value = trade.price_vs_ema200;
      document.getElementById('entry-ema-band').value = trade.ema_band_color;
      document.getElementById('entry-zone').value = trade.zone;
      document.getElementById('entry-cmf-sign').value = trade.cmf_sign;
      document.getElementById('entry-cmf-dir').value = trade.cmf_sma_dir;
      document.getElementById('entry-roc-sign').value = trade.roc_sign;
      document.getElementById('entry-roc-dir').value = trade.roc_sma_dir;
      document.getElementById('entry-macd').value = trade.macd_state;
      document.getElementById('entry-rsi').value = trade.rsi_zone;
      document.getElementById('entry-marketMemo').value = trade.marketMemo;
      if (trade.imageData) {
        entryImagePreview.src = trade.imageData;
        entryImagePreview.style.display = 'block';
      } else {
        entryImagePreview.style.display = 'none';
      }
      // Show prediction details
      if (trade.recommendation) {
        displayPrediction({ recommendation: trade.recommendation, expectedMove: trade.expectedMove, expectedMoveUnit: trade.expectedMoveUnit, confidence: trade.confidence, reason: trade.reason });
      }
      // adjust button
      predictSaveBtn.textContent = '編集を保存';
      // Switch to entry tab
      document.querySelector('[data-target="entry-tab"]').click();
    };
  });
}

// Chart rendering
let chartCumulative;
let chartLongShort;
let chartTimeframe;

function updateCharts() {
  const trades = getTrades();
  // Apply same filters as table for charts
  let data = trades.filter((t) => {
    if (filterSymbol.value && !t.symbol.includes(filterSymbol.value.trim())) return false;
    if (filterTimeframe.value && t.timeframe !== filterTimeframe.value) return false;
    if (filterTradeType.value && t.tradeType !== filterTradeType.value) return false;
    if (filterHasResult.value) {
      const boolVal = filterHasResult.value === 'true';
      if (t.hasResult !== boolVal) return false;
    }
    if (filterStartDate.value) {
      const start = new Date(filterStartDate.value);
      if (new Date(t.datetimeEntry) < start) return false;
    }
    if (filterEndDate.value) {
      const end = new Date(filterEndDate.value);
      if (new Date(t.datetimeEntry) > end) return false;
    }
    return true;
  });
  // Sort by date for cumulative profit
  const cumData = data.filter((t) => t.hasResult).sort((a, b) => new Date(a.datetimeEntry) - new Date(b.datetimeEntry));
  let cumProfit = 0;
  const labels = [];
  const profits = [];
  cumData.forEach((t) => {
    cumProfit += t.profit;
    labels.push(t.datetimeEntry.split('T')[0]);
    profits.push(cumProfit);
  });
  // destroy existing charts
  if (chartCumulative) chartCumulative.destroy();
  if (chartLongShort) chartLongShort.destroy();
  if (chartTimeframe) chartTimeframe.destroy();
  const ctx1 = document.getElementById('chart-cumulative').getContext('2d');
  chartCumulative = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '累積損益',
          data: profits,
          borderColor: '#00ffc8',
          backgroundColor: 'rgba(0,255,200,0.2)',
          tension: 0.2
        }
      ]
    },
    options: {
      plugins: {
        legend: { labels: { color: '#e4e9f0' } }
      },
      scales: {
        x: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3240' } },
        y: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3240' } }
      }
    }
  });
  // Long vs short bar chart
  const longTrades = data.filter((t) => t.hasResult && t.directionTaken === 'long');
  const shortTrades = data.filter((t) => t.hasResult && t.directionTaken === 'short');
  const countLong = longTrades.length;
  const countShort = shortTrades.length;
  const winLong = longTrades.filter((t) => t.profit > 0).length;
  const winShort = shortTrades.filter((t) => t.profit > 0).length;
  const winRateLong = countLong > 0 ? winLong / countLong : 0;
  const winRateShort = countShort > 0 ? winShort / countShort : 0;
  const avgProfitLong = countLong > 0 ? longTrades.reduce((a, b) => a + b.profit, 0) / countLong : 0;
  const avgProfitShort = countShort > 0 ? shortTrades.reduce((a, b) => a + b.profit, 0) / countShort : 0;
  const ctx2 = document.getElementById('chart-longshort').getContext('2d');
  chartLongShort = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: ['ロング', 'ショート'],
      datasets: [
        {
          label: '勝率',
          data: [winRateLong * 100, winRateShort * 100],
          backgroundColor: ['#00ff90', '#ff9090']
        },
        {
          label: '平均損益',
          data: [avgProfitLong, avgProfitShort],
          backgroundColor: ['#0095ff', '#ff9500']
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#e4e9f0' } } },
      scales: {
        x: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3240' } },
        y: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3240' } }
      }
    }
  });
  // Timeframe chart
  const timeframeMap = {};
  data.filter((t) => t.hasResult).forEach((t) => {
    if (!timeframeMap[t.timeframe]) {
      timeframeMap[t.timeframe] = { count: 0, wins: 0 };
    }
    timeframeMap[t.timeframe].count++;
    if (t.profit > 0) timeframeMap[t.timeframe].wins++;
  });
  const timeframes = Object.keys(timeframeMap);
  const winRates = timeframes.map((tf) => {
    const obj = timeframeMap[tf];
    return obj.count > 0 ? (obj.wins / obj.count) * 100 : 0;
  });
  const ctx3 = document.getElementById('chart-timeframe').getContext('2d');
  chartTimeframe = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: timeframes,
      datasets: [
        {
          label: '勝率',
          data: winRates,
          backgroundColor: '#00b7ff'
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#e4e9f0' } } },
      scales: {
        x: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3240' } },
        y: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3240' } }
      }
    }
  });
}

// Export JSON
document.getElementById('export-json').addEventListener('click', () => {
  const trades = getTrades();
  const data = { version: 1, records: trades };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const fileName = `trades_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.json`;
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Import JSON
const importInput = document.getElementById('import-json');
importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const json = JSON.parse(ev.target.result);
      if (json.version !== 1 || !Array.isArray(json.records)) {
        document.getElementById('import-result').textContent = 'インポート失敗：バージョンが異なるか形式が不正です';
        return;
      }
      const imported = json.records;
      let added = 0;
      let updated = 0;
      const trades = getTrades();
      imported.forEach((rec) => {
        const idx = trades.findIndex((t) => t.id === rec.id);
        if (idx === -1) {
          trades.push(rec);
          added++;
        } else {
          const existing = trades[idx];
          if (new Date(rec.updatedAt) > new Date(existing.updatedAt)) {
            trades[idx] = rec;
            updated++;
          }
        }
      });
      saveTrades(trades);
      document.getElementById('import-result').textContent = `${added}件追加、${updated}件更新しました`;
      loadResultSelection();
      buildTable();
      updateCharts();
    } catch (err) {
      document.getElementById('import-result').textContent = 'インポート失敗：JSON解析エラー';
    }
  };
  reader.readAsText(file);
});

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  loadResultSelection();
  buildTable();
  updateCharts();
});