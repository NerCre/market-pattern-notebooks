/*
 * トレード判定・ノートアプリ
 * 完全フロントエンド（HTML/CSS/JavaScript）のみで動作します。
 * localStorage に記録を保存し、JSON のインポート・エクスポートに対応しています。
 */

// ストレージキー
const STORAGE_KEY = 'tradeRecords_v1';

// 現在のレコード一覧
let records = [];

// グラフインスタンス保持
let cumulativeChart = null;
let directionChart = null;
let timeframeChart = null;

// 音声認識インスタンス
let recognition = null;

// DOMContentLoaded イベントで初期化
document.addEventListener('DOMContentLoaded', () => {
  // レコード読み込み
  records = loadRecords();
  // タブ初期化
  initTabs();
  // エントリータブ初期化
  initEntryTab();
  // 結果タブ初期化
  initResultTab();
  // 分析タブ初期化
  initAnalysisTab();
  // 初期表示更新
  updateResultSelect();
  updateAnalysis();
});

/**
 * localStorage からレコードを読み込む
 * 保存データがない場合は空配列を返す
 */
function loadRecords() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (e) {
    console.error('保存データの読み込みに失敗しました', e);
    alert('保存データが壊れています。初期化します。');
    return [];
  }
}

/**
 * localStorage にレコードを保存する
 */
function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('保存に失敗しました', e);
  }
}

/**
 * UUID 生成（crypto.randomUUID が存在しない場合に fallback）
 */
function generateId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 10)
  );
}

/**
 * ISO文字列を datetime-local 用の文字列に変換
 * @param {string|null} iso
 */
function toDatetimeLocal(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

/**
 * datetime-local の値を ISO 文字列に変換
 * @param {string} value
 */
function fromDatetimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString();
}

/**
 * タブ切り替え機能
 */
function initTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // ボタンの active クラスを更新
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // コンテンツの表示切替
      const tabName = btn.dataset.tab;
      document
        .querySelectorAll('.tab-content')
        .forEach((section) => section.classList.remove('active'));
      const target = document.getElementById(`tab-${tabName}`);
      if (target) target.classList.add('active');
      // タブ切り替え時に内容を更新
      if (tabName === 'result') {
        updateResultSelect();
      } else if (tabName === 'analysis') {
        updateAnalysis();
      }
    });
  });
}

/**
 * エントリータブの初期化
 */
function initEntryTab() {
  // 判定ボタン
  document
    .getElementById('entry-judgeBtn')
    .addEventListener('click', () => handleEntryJudge(false));
  // 判定＋保存ボタン
  document
    .getElementById('entry-saveBtn')
    .addEventListener('click', () => handleEntryJudge(true));
  // 画像読み込み
  document
    .getElementById('entry-imageData')
    .addEventListener('change', handleImageSelected);
  // 音声入力ボタン
  document
    .getElementById('entry-voiceBtn')
    .addEventListener('click', toggleVoiceInput);
}

// 画像データ保持用
let entryImageData = null;

/**
 * 画像ファイルが選択された時に Base64 へ変換
 */
function handleImageSelected(event) {
  const file = event.target.files[0];
  if (!file) {
    entryImageData = null;
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    entryImageData = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * 音声入力の開始・停止トグル
 */
function toggleVoiceInput() {
  const statusElem = document.getElementById('voice-status');
  // API 対応確認
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusElem.textContent = 'ブラウザが音声入力に対応していません';
    return;
  }
  if (recognition && recognition.recognizing) {
    recognition.stop();
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.recognizing = true;
  statusElem.textContent = '音声入力中...';
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const memoElem = document.getElementById('entry-marketMemo');
    if (memoElem.value) {
      memoElem.value += '\n' + transcript;
    } else {
      memoElem.value = transcript;
    }
  };
  recognition.onerror = (event) => {
    console.error('音声認識エラー', event);
    statusElem.textContent = '音声認識エラー: ' + event.error;
  };
  recognition.onend = () => {
    recognition.recognizing = false;
    statusElem.textContent = '';
  };
  recognition.start();
}

/**
 * エントリーフォームからデータを収集し、判定ロジックを実行する
 * @param {boolean} save 保存する場合は true
 */
function handleEntryJudge(save) {
  // 入力値取得
  const entry = gatherEntryInput();
  // インジケータが設定されていない場合でも処理できるようにする
  // 判定ロジック実行
  const result = computeRecommendation(entry);
  showJudgeResult(result);
  if (save) {
    // レコード作成
    const newRecord = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // エントリー情報
      datetimeEntry: entry.datetimeEntry,
      symbol: entry.symbol,
      timeframe: entry.timeframe,
      tradeType: entry.tradeType,
      directionPlanned: entry.directionPlanned,
      entryPrice: entry.entryPrice,
      size: entry.size,
      feePerUnit: entry.feePerUnit,
      plannedStopPrice: entry.plannedStopPrice,
      plannedLimitPrice: entry.plannedLimitPrice,
      cutLossPrice: entry.cutLossPrice,
      methodTag: entry.methodTag,
      // インジケーター特徴量
      trend_5_20_40: entry.trend_5_20_40,
      price_vs_ema200: entry.price_vs_ema200,
      ema_band_color: entry.ema_band_color,
      zone: entry.zone,
      cmf_sign: entry.cmf_sign,
      cmf_sma_dir: entry.cmf_sma_dir,
      roc_sign: entry.roc_sign,
      roc_sma_dir: entry.roc_sma_dir,
      macd_state: entry.macd_state,
      rsi_zone: entry.rsi_zone,
      // メモ等
      marketMemo: entry.marketMemo,
      notionUrl: entry.notionUrl,
      imageData: entry.imageData,
      // 判定結果
      recommendation: result.recommendation,
      expectedMove: result.expectedMove,
      expectedMoveUnit: result.expectedMoveUnit,
      confidence: result.confidence,
      reason: result.reason,
      // 決済結果（初期は空）
      hasResult: false,
      datetimeExit: null,
      exitPrice: null,
      directionTaken: null,
      highDuringTrade: null,
      lowDuringTrade: null,
      profit: null,
      resultMemo: ''
    };
    records.push(newRecord);
    saveRecords();
    // 入力フォームをリセット
    resetEntryForm();
    // 更新
    updateResultSelect();
    updateAnalysis();
    alert('エントリーを保存しました');
  }
}

/**
 * エントリー情報をフォームから取得
 */
function gatherEntryInput() {
  return {
    datetimeEntry: fromDatetimeLocal(
      document.getElementById('entry-datetime').value
    ),
    symbol: document.getElementById('entry-symbol').value.trim(),
    timeframe: document.getElementById('entry-timeframe').value,
    tradeType: document.getElementById('entry-tradeType').value,
    directionPlanned: document.getElementById('entry-directionPlanned').value,
    entryPrice: parseFloat(document.getElementById('entry-price').value) || null,
    size: parseFloat(document.getElementById('entry-size').value) || null,
    feePerUnit:
      parseFloat(document.getElementById('entry-feePerUnit').value) || null,
    plannedStopPrice:
      parseFloat(document.getElementById('entry-plannedStopPrice').value) || null,
    plannedLimitPrice:
      parseFloat(
        document.getElementById('entry-plannedLimitPrice').value
      ) || null,
    cutLossPrice:
      parseFloat(document.getElementById('entry-cutLossPrice').value) || null,
    methodTag: document.getElementById('entry-methodTag').value.trim(),
    trend_5_20_40: document.getElementById('entry-trend_5_20_40').value,
    price_vs_ema200: document.getElementById('entry-price_vs_ema200').value,
    ema_band_color: document.getElementById('entry-ema_band_color').value,
    zone: document.getElementById('entry-zone').value,
    cmf_sign: document.getElementById('entry-cmf_sign').value,
    cmf_sma_dir: document.getElementById('entry-cmf_sma_dir').value,
    roc_sign: document.getElementById('entry-roc_sign').value,
    roc_sma_dir: document.getElementById('entry-roc_sma_dir').value,
    macd_state: document.getElementById('entry-macd_state').value,
    rsi_zone: document.getElementById('entry-rsi_zone').value,
    marketMemo: document.getElementById('entry-marketMemo').value.trim(),
    notionUrl: document.getElementById('entry-notionUrl').value.trim(),
    imageData: entryImageData
  };
}

/**
 * エントリーフォームをリセット
 */
function resetEntryForm() {
  document.getElementById('entry-datetime').value = '';
  document.getElementById('entry-price').value = '';
  document.getElementById('entry-size').value = '';
  document.getElementById('entry-feePerUnit').value = '';
  document.getElementById('entry-plannedStopPrice').value = '';
  document.getElementById('entry-plannedLimitPrice').value = '';
  document.getElementById('entry-cutLossPrice').value = '';
  document.getElementById('entry-methodTag').value = '';
  document.getElementById('entry-marketMemo').value = '';
  document.getElementById('entry-notionUrl').value = '';
  document.getElementById('entry-imageData').value = '';
  entryImageData = null;
  // メモの状態をクリア
  document.getElementById('voice-status').textContent = '';
  // 判定結果非表示
  const judgeCard = document.getElementById('judge-result');
  judgeCard.style.display = 'none';
}

/**
 * 判定結果を画面に表示
 */
function showJudgeResult(result) {
  const card = document.getElementById('judge-result');
  // 推奨方向を日本語へ変換
  let directionDisplay = '-';
  if (result.recommendation === 'long') directionDisplay = 'ロング';
  else if (result.recommendation === 'short') directionDisplay = 'ショート';
  else if (result.recommendation === 'flat') directionDisplay = 'ノーポジ';
  else directionDisplay = 'なし';
  let expectedMoveDisplay = '-';
  if (typeof result.expectedMove === 'number') {
    expectedMoveDisplay = `${result.expectedMove}${result.expectedMoveUnit || ''}`;
  }
  let confidenceDisplay = '-';
  if (typeof result.confidence === 'number') {
    confidenceDisplay = `${result.confidence}%`;
  }
  card.innerHTML = `
    <h3>判定結果</h3>
    <p>推奨方向: <strong>${directionDisplay}</strong></p>
    <p>想定値幅: <strong>${expectedMoveDisplay}</strong></p>
    <p>信頼度: <strong>${confidenceDisplay}</strong></p>
    <p class="small-text">${result.reason || ''}</p>
  `;
  card.style.display = 'block';
}

/**
 * 判定ロジック：類似パターン検索と統計による推奨
 * @param {Object} entry エントリーの入力オブジェクト
 */
function computeRecommendation(entry) {
  // 類似度評価に用いるインジケーター項目
  const fields = [
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
  ];
  // 類似レコード抽出
  const similar = [];
  records.forEach((rec) => {
    let matches = 0;
    fields.forEach((f) => {
      if (rec[f] && entry[f] && rec[f] === entry[f]) matches++;
    });
    const score = matches / fields.length;
    if (score >= 0.5) {
      similar.push({ record: rec, matches });
    }
  });
  // 決済があるもののみ学習対象
  const learnSet = similar.filter((item) => item.record.hasResult);
  if (learnSet.length === 0) {
    return {
      recommendation: null,
      expectedMove: null,
      expectedMoveUnit: null,
      confidence: null,
      reason: '過去データがありません。'
    };
  }
  // 統計計算用オブジェクト
  const stats = {
    long: { count: 0, win: 0, profitSum: 0, moves: [] },
    short: { count: 0, win: 0, profitSum: 0, moves: [] },
    flat: { count: 0, win: 0, profitSum: 0, moves: [] }
  };
  learnSet.forEach(({ record }) => {
    const dir = record.directionTaken || 'flat';
    if (!stats[dir]) return;
    const profit = typeof record.profit === 'number' ? record.profit : 0;
    stats[dir].count++;
    if (profit > 0) stats[dir].win++;
    stats[dir].profitSum += profit;
    // 値幅計算
    if (
      record.entryPrice != null &&
      record.highDuringTrade != null &&
      record.lowDuringTrade != null
    ) {
      let move = 0;
      if (dir === 'long') {
        move = record.highDuringTrade - record.entryPrice;
      } else if (dir === 'short') {
        move = record.entryPrice - record.lowDuringTrade;
      }
      if (!isNaN(move) && move > 0) {
        stats[dir].moves.push(move);
      }
    }
  });
  // 最も良い方向を決定
  let bestDir = null;
  let bestMetric = -Infinity;
  ['long', 'short', 'flat'].forEach((dir) => {
    if (stats[dir].count > 0) {
      const winRate = stats[dir].win / stats[dir].count;
      const avgProfit = stats[dir].profitSum / stats[dir].count;
      // メトリック: 勝率に 100 を掛け平均損益を加算
      const metric = winRate * 100 + avgProfit;
      if (metric > bestMetric) {
        bestMetric = metric;
        bestDir = dir;
      }
    }
  });
  // 推奨方向
  let recommendation = bestDir;
  // 全ての方向で平均損益がマイナスの場合ノーポジ推奨
  const allNegative = ['long', 'short'].every(
    (dir) => stats[dir].count > 0 && stats[dir].profitSum / stats[dir].count <= 0
  );
  if (allNegative) {
    recommendation = 'flat';
  }
  // 想定値幅計算
  let moves = [];
  if (recommendation && stats[recommendation].moves.length > 0) {
    moves = stats[recommendation].moves;
  } else {
    // どの方向でも値幅がない場合は全体から平均
    moves = [].concat(
      stats.long.moves,
      stats.short.moves,
      stats.flat.moves
    );
  }
  let expectedMove = null;
  if (moves.length > 0) {
    const sum = moves.reduce((a, b) => a + b, 0);
    expectedMove = Math.round((sum / moves.length) * 100) / 100;
  }
  // 信頼度計算: 類似件数とベスト方向の勝率を組み合わせる
  let confidence = null;
  if (recommendation) {
    const count = stats[recommendation].count;
    const winRate =
      stats[recommendation].count > 0
        ? stats[recommendation].win / stats[recommendation].count
        : 0;
    // 類似件数が多いほど log スケールで重み付け
    const factor = Math.log10(count + 1) / 1.2; // 調整
    confidence = Math.min(100, Math.round(winRate * 100 * factor));
  }
  // 理由メッセージ生成
  const parts = [];
  ['long', 'short', 'flat'].forEach((dir) => {
    if (stats[dir].count > 0) {
      const winRate = (stats[dir].win / stats[dir].count) * 100;
      const avgProfit = stats[dir].profitSum / stats[dir].count;
      const dirLabel = dir === 'long' ? 'ロング' : dir === 'short' ? 'ショート' : 'ノーポジ';
      parts.push(
        `${dirLabel}: 勝率${winRate.toFixed(1)}% 平均損益${avgProfit.toFixed(2)}`
      );
    }
  });
  const reason = `過去${learnSet.length}件の類似パターン。${parts.join(' / ')}。`;
  return {
    recommendation,
    expectedMove,
    expectedMoveUnit: expectedMove != null ? '円' : null,
    confidence,
    reason
  };
}

/**
 * 結果タブの初期化
 */
function initResultTab() {
  // セレクト変更時
  document
    .getElementById('result-select')
    .addEventListener('change', () => {
      const id = document.getElementById('result-select').value;
      loadResultForm(id);
    });
  // 入力値変更時に損益表示更新
  ['result-exitPrice', 'result-size', 'result-feePerUnit', 'result-directionTaken'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateResultProfitDisplay);
    document.getElementById(id).addEventListener('change', updateResultProfitDisplay);
  });
  // 保存ボタン
  document
    .getElementById('result-saveBtn')
    .addEventListener('click', saveResult);
}

/**
 * 結果タブのセレクトボックスを更新
 */
function updateResultSelect() {
  const select = document.getElementById('result-select');
  const message = document.getElementById('result-select-message');
  // すべてのオプションをクリア
  select.innerHTML = '';
  // 未完了レコードを優先表示
  const sorted = [...records].sort((a, b) => {
    // hasResult false を優先
    if (a.hasResult !== b.hasResult) {
      return a.hasResult ? 1 : -1;
    }
    // createdAt の新しい順
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  if (sorted.length === 0) {
    message.textContent = 'エントリーデータがありません';
    return;
  }
  message.textContent = '';
  // デフォルト空オプション
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '選択してください';
  select.appendChild(defaultOpt);
  sorted.forEach((rec) => {
    const opt = document.createElement('option');
    opt.value = rec.id;
    const entryDate = rec.datetimeEntry ? new Date(rec.datetimeEntry) : new Date(rec.createdAt);
    const dateStr = entryDate
      .toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
      .replace(/\//g, '-');
    const status = rec.hasResult ? '済' : '未';
    opt.textContent = `${dateStr} ${rec.symbol} ${rec.timeframe} (${status})`;
    select.appendChild(opt);
  });
}

/**
 * 選択されたレコードの結果フォームを読み込む
 */
function loadResultForm(id) {
  if (!id) {
    clearResultForm();
    return;
  }
  const rec = records.find((r) => r.id === id);
  if (!rec) {
    clearResultForm();
    return;
  }
  // 日時
  document.getElementById('result-datetimeExit').value = toDatetimeLocal(
    rec.datetimeExit
  );
  // 価格
  document.getElementById('result-exitPrice').value = rec.exitPrice ?? '';
  // 方向
  document.getElementById('result-directionTaken').value = rec.directionTaken || '';
  // 枚数（エントリー時のサイズ初期値）
  document.getElementById('result-size').value = rec.size ?? '';
  // 1枚あたりの手数料（エントリー時の値）
  document.getElementById('result-feePerUnit').value = rec.feePerUnit ?? '';
  // 最高値/最安値
  document.getElementById('result-highDuringTrade').value = rec.highDuringTrade ?? '';
  document.getElementById('result-lowDuringTrade').value = rec.lowDuringTrade ?? '';
  // メモ
  document.getElementById('result-resultMemo').value = rec.resultMemo || '';
  // 損益表示
  updateResultProfitDisplay();
}

/**
 * 結果フォームのフィールドをクリア
 */
function clearResultForm() {
  document.getElementById('result-datetimeExit').value = '';
  document.getElementById('result-exitPrice').value = '';
  document.getElementById('result-directionTaken').value = '';
  document.getElementById('result-size').value = '';
  document.getElementById('result-feePerUnit').value = '';
  document.getElementById('result-highDuringTrade').value = '';
  document.getElementById('result-lowDuringTrade').value = '';
  document.getElementById('result-resultMemo').value = '';
  document.getElementById('result-profit').textContent = '0';
}

/**
 * 現在のフォーム値から損益を計算し表示
 */
function updateResultProfitDisplay() {
  const selectId = document.getElementById('result-select').value;
  const rec = records.find((r) => r.id === selectId);
  if (!rec) {
    document.getElementById('result-profit').textContent = '0';
    return;
  }
  const exitPrice = parseFloat(document.getElementById('result-exitPrice').value);
  const size = parseFloat(document.getElementById('result-size').value);
  const fee = parseFloat(document.getElementById('result-feePerUnit').value);
  const direction = document.getElementById('result-directionTaken').value;
  let profit = 0;
  if (
    !isNaN(exitPrice) &&
    !isNaN(size) &&
    !isNaN(fee) &&
    direction &&
    rec.entryPrice != null
  ) {
    if (direction === 'long') {
      profit = (exitPrice - rec.entryPrice - fee) * size;
    } else if (direction === 'short') {
      profit = (rec.entryPrice - exitPrice - fee) * size;
    } else {
      profit = 0;
    }
  }
  document.getElementById('result-profit').textContent = profit.toFixed(2);
}

/**
 * 結果を保存
 */
function saveResult() {
  const id = document.getElementById('result-select').value;
  if (!id) {
    alert('レコードを選択してください');
    return;
  }
  const recIndex = records.findIndex((r) => r.id === id);
  if (recIndex === -1) {
    alert('レコードが見つかりません');
    return;
  }
  const rec = records[recIndex];
  const datetimeExit = fromDatetimeLocal(
    document.getElementById('result-datetimeExit').value
  );
  const exitPrice = parseFloat(
    document.getElementById('result-exitPrice').value
  );
  const direction = document.getElementById('result-directionTaken').value;
  const size = parseFloat(document.getElementById('result-size').value);
  const feePerUnit = parseFloat(
    document.getElementById('result-feePerUnit').value
  );
  const highDuringTrade = parseFloat(
    document.getElementById('result-highDuringTrade').value
  );
  const lowDuringTrade = parseFloat(
    document.getElementById('result-lowDuringTrade').value
  );
  const memo = document.getElementById('result-resultMemo').value.trim();
  // 更新
  rec.datetimeExit = datetimeExit;
  rec.exitPrice = isNaN(exitPrice) ? null : exitPrice;
  rec.directionTaken = direction || null;
  rec.size = isNaN(size) ? rec.size : size;
  rec.feePerUnit = isNaN(feePerUnit) ? rec.feePerUnit : feePerUnit;
  rec.highDuringTrade = isNaN(highDuringTrade) ? null : highDuringTrade;
  rec.lowDuringTrade = isNaN(lowDuringTrade) ? null : lowDuringTrade;
  rec.resultMemo = memo;
  // 損益計算
  let profit = 0;
  if (
    rec.entryPrice != null &&
    rec.exitPrice != null &&
    rec.directionTaken &&
    rec.size != null &&
    rec.feePerUnit != null
  ) {
    if (rec.directionTaken === 'long') {
      profit = (rec.exitPrice - rec.entryPrice - rec.feePerUnit) * rec.size;
    } else if (rec.directionTaken === 'short') {
      profit = (rec.entryPrice - rec.exitPrice - rec.feePerUnit) * rec.size;
    } else {
      profit = 0;
    }
  }
  rec.profit = Math.round(profit * 100) / 100;
  rec.hasResult = true;
  rec.updatedAt = new Date().toISOString();
  // 保存
  records[recIndex] = rec;
  saveRecords();
  // 更新
  updateResultSelect();
  updateAnalysis();
  alert('結果を保存しました');
}

/**
 * 分析タブ初期化
 */
function initAnalysisTab() {
  // フィルタ適用
  document
    .getElementById('filter-applyBtn')
    .addEventListener('click', () => {
      updateAnalysis();
    });
  // フィルタリセット
  document
    .getElementById('filter-resetBtn')
    .addEventListener('click', () => {
      document.getElementById('filter-symbol').value = '';
      document.getElementById('filter-tradeType').value = '';
      document.getElementById('filter-direction').value = '';
      document.getElementById('filter-startDate').value = '';
      document.getElementById('filter-endDate').value = '';
      updateAnalysis();
    });
  // エクスポート
  document
    .getElementById('json-exportBtn')
    .addEventListener('click', exportJSON);
  // インポート入力
  document
    .getElementById('json-importBtn')
    .addEventListener('click', () => {
      document.getElementById('json-importInput').click();
    });
  document
    .getElementById('json-importInput')
    .addEventListener('change', handleImportJSON);
  // 編集ボタン（テーブル）は委任で設定 later in updateAnalysis
}

/**
 * 分析タブの表示更新
 */
function updateAnalysis() {
  const filtered = applyFilters(records);
  updateAnalysisTable(filtered);
  updateCharts(filtered);
}

/**
 * フィルタ条件に基づいてレコードを絞り込む
 */
function applyFilters(dataset) {
  const symbol = document.getElementById('filter-symbol').value.trim();
  const tradeType = document.getElementById('filter-tradeType').value;
  const direction = document.getElementById('filter-direction').value;
  const startDateStr = document.getElementById('filter-startDate').value;
  const endDateStr = document.getElementById('filter-endDate').value;
  let startDate = null;
  let endDate = null;
  if (startDateStr) startDate = new Date(startDateStr);
  if (endDateStr) {
    endDate = new Date(endDateStr);
    // 終了日の最終時刻まで含める
    endDate.setHours(23, 59, 59, 999);
  }
  return dataset.filter((rec) => {
    // 銘柄フィルタ
    if (symbol && rec.symbol && !rec.symbol.includes(symbol)) return false;
    // 取引区分
    if (tradeType && rec.tradeType !== tradeType) return false;
    // 方向（結果方向があれば directionTaken、なければ recommendation）
    if (direction) {
      const dir = rec.hasResult ? rec.directionTaken : rec.recommendation;
      if (dir !== direction) return false;
    }
    // 日付範囲: エントリー日時または作成日時
    const entryDate = rec.datetimeEntry
      ? new Date(rec.datetimeEntry)
      : new Date(rec.createdAt);
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });
}

/**
 * 分析用テーブルを更新
 */
function updateAnalysisTable(data) {
  const tbody = document.getElementById('analysis-table').querySelector('tbody');
  // 既存行削除
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  data.forEach((rec) => {
    const tr = document.createElement('tr');
    // エントリー日時
    const entryDate = rec.datetimeEntry
      ? new Date(rec.datetimeEntry)
      : new Date(rec.createdAt);
    const dateStr = entryDate
      .toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
      .replace(/\//g, '-');
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${rec.symbol}</td>
      <td>${rec.timeframe}</td>
      <td>${translateTradeType(rec.tradeType)}</td>
      <td>${rec.hasResult ? translateDirection(rec.directionTaken) : '-'}</td>
      <td>${rec.hasResult && rec.profit != null ? rec.profit.toFixed(2) : '-'}</td>
      <td>${rec.recommendation ? translateDirection(rec.recommendation) : '-'}</td>
      <td>${rec.hasResult ? '完了' : '未完'}</td>
      <td><button class="edit-btn" data-id="${rec.id}">編集</button></td>
    `;
    tbody.appendChild(tr);
  });
  // 編集ボタンイベントを委任
  tbody.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      // 結果タブに読み込み
      document.querySelector('.tab-button[data-tab="result"]').click();
      document.getElementById('result-select').value = id;
      loadResultForm(id);
    });
  });
}

/**
 * 日本語への方向変換
 */
function translateDirection(dir) {
  if (dir === 'long') return 'ロング';
  if (dir === 'short') return 'ショート';
  if (dir === 'flat') return 'ノーポジ';
  return '-';
}

/**
 * 日本語への取引区分変換
 */
function translateTradeType(type) {
  if (type === 'real') return 'リアル';
  if (type === 'virtual') return 'バーチャル';
  if (type === 'practice') return 'プラクティス';
  return type || '-';
}

/**
 * チャート更新
 */
function updateCharts(data) {
  // 累積損益チャート
  const profitRecords = data
    .filter((rec) => rec.hasResult && typeof rec.profit === 'number')
    .sort((a, b) => {
      // 終了日時があればそれを基準
      const aDate = recDate(a);
      const bDate = recDate(b);
      return aDate - bDate;
    });
  const labels1 = [];
  const cumData = [];
  let cum = 0;
  profitRecords.forEach((rec) => {
    cum += rec.profit;
    cum = Math.round(cum * 100) / 100;
    labels1.push(formatDateShort(recDate(rec)));
    cumData.push(cum);
  });
  const ctx1 = document.getElementById('chart-cumulativeProfit').getContext('2d');
  if (cumulativeChart) {
    cumulativeChart.data.labels = labels1;
    cumulativeChart.data.datasets[0].data = cumData;
    cumulativeChart.update();
  } else {
    cumulativeChart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labels1,
        datasets: [
          {
            label: '累積損益',
            data: cumData,
            borderColor: '#00ffc8',
            backgroundColor: 'rgba(0, 255, 200, 0.2)',
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#9aa4b5'
            },
            grid: {
              color: '#252c38'
            }
          },
          y: {
            ticks: {
              color: '#9aa4b5'
            },
            grid: {
              color: '#252c38'
            }
          }
        }
      }
    });
  }
  // 方向別勝率＆平均損益チャート
  const dirStats = { long: { win: 0, count: 0, profitSum: 0 }, short: { win: 0, count: 0, profitSum: 0 } };
  data.forEach((rec) => {
    if (rec.hasResult && (rec.directionTaken === 'long' || rec.directionTaken === 'short')) {
      const dir = rec.directionTaken;
      dirStats[dir].count++;
      if (rec.profit > 0) dirStats[dir].win++;
      dirStats[dir].profitSum += rec.profit;
    }
  });
  const dirLabels = ['ロング', 'ショート'];
  const winRates = dirLabels.map((lbl, i) => {
    const dir = i === 0 ? 'long' : 'short';
    const stat = dirStats[dir];
    return stat.count > 0 ? Math.round((stat.win / stat.count) * 1000) / 10 : 0;
  });
  const avgProfits = dirLabels.map((lbl, i) => {
    const dir = i === 0 ? 'long' : 'short';
    const stat = dirStats[dir];
    return stat.count > 0 ? Math.round((stat.profitSum / stat.count) * 100) / 100 : 0;
  });
  const ctx2 = document.getElementById('chart-directionStats').getContext('2d');
  if (directionChart) {
    directionChart.data.labels = dirLabels;
    directionChart.data.datasets[0].data = winRates;
    directionChart.data.datasets[1].data = avgProfits;
    directionChart.update();
  } else {
    directionChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: dirLabels,
        datasets: [
          {
            label: '勝率 (%)',
            data: winRates,
            backgroundColor: 'rgba(0, 255, 200, 0.5)',
            borderColor: '#00ffc8',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: '平均損益',
            data: avgProfits,
            backgroundColor: 'rgba(255, 206, 86, 0.5)',
            borderColor: '#ffce56',
            borderWidth: 1,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#e4e9f0'
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: '#9aa4b5',
              callback: (value) => `${value}%`
            },
            grid: {
              color: '#252c38'
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            ticks: {
              color: '#9aa4b5'
            },
            grid: {
              drawOnChartArea: false
            }
          },
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: '#252c38' }
          }
        }
      }
    });
  }
  // 時間足別勝率チャート
  const timeframeStats = {};
  data.forEach((rec) => {
    if (!rec.hasResult || !rec.timeframe) return;
    const tf = rec.timeframe;
    if (!timeframeStats[tf]) timeframeStats[tf] = { win: 0, count: 0 };
    timeframeStats[tf].count++;
    if (rec.profit > 0) timeframeStats[tf].win++;
  });
  const tfLabels = Object.keys(timeframeStats);
  const tfWinRates = tfLabels.map((tf) => {
    const stat = timeframeStats[tf];
    return stat.count > 0 ? Math.round((stat.win / stat.count) * 1000) / 10 : 0;
  });
  const ctx3 = document.getElementById('chart-timeframeStats').getContext('2d');
  if (timeframeChart) {
    timeframeChart.data.labels = tfLabels;
    timeframeChart.data.datasets[0].data = tfWinRates;
    timeframeChart.update();
  } else {
    timeframeChart = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: tfLabels,
        datasets: [
          {
            label: '勝率 (%)',
            data: tfWinRates,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: '#36a2eb',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            ticks: {
              color: '#9aa4b5',
              callback: (value) => `${value}%`
            },
            grid: { color: '#252c38' }
          },
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: '#252c38' }
          }
        }
      }
    });
  }
}

/**
 * レコードから日付を取得 (終了日時またはエントリー日時)
 */
function recDate(rec) {
  if (rec.datetimeExit) return new Date(rec.datetimeExit);
  if (rec.datetimeEntry) return new Date(rec.datetimeEntry);
  return new Date(rec.createdAt);
}

/**
 * 日付を短い表記にフォーマット (YYYY-MM-DD)
 */
function formatDateShort(date) {
  return date
    .toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\//g, '-');
}

/**
 * JSON エクスポート
 */
function exportJSON() {
  const data = { version: 1, records: records };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tradeRecords.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * JSON インポート処理
 */
function handleImportJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!obj || obj.version !== 1 || !Array.isArray(obj.records)) {
        alert('JSONの形式またはバージョンが正しくありません');
        return;
      }
      let added = 0;
      let updated = 0;
      obj.records.forEach((importRec) => {
        const index = records.findIndex((r) => r.id === importRec.id);
        if (index === -1) {
          // 新規追加
          records.push(importRec);
          added++;
        } else {
          // 更新日時比較
          const existing = records[index];
          const importUpdated = new Date(importRec.updatedAt);
          const existingUpdated = new Date(existing.updatedAt);
          if (importUpdated > existingUpdated) {
            records[index] = importRec;
            updated++;
          }
        }
      });
      if (added > 0 || updated > 0) {
        saveRecords();
        updateResultSelect();
        updateAnalysis();
      }
      alert(`インポート完了: 新規${added}件, 更新${updated}件`);
    } catch (err) {
      alert('JSON読み込みに失敗しました: ' + err.message);
    } finally {
      // 入力をリセット
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}