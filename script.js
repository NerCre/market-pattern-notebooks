/*
 * EdgeScope Trade Judge & Note
 *
 * This script implements all front-end logic for the EdgeScope application.
 * It manages tabs, forms, localStorage CRUD, evaluation logic, statistics,
 * chart rendering with Chart.js, and JSON import/export. The goal is to
 * provide a complete trading journal and recommendation tool entirely in
 * the browser without any backend.
 */

(() => {
  // localStorage key
  const STORAGE_KEY = 'tradeRecords_v1';

  /**
   * In-memory array of trade records. Each record matches the TradeRecord
   * structure described in the specification.
   * @type {Array<any>}
   */
  let tradeRecords = [];

  // Currently editing entry ID (null when creating new)
  let editingEntryId = null;
  // Currently editing result ID (null when none selected)
  let editingResultId = null;

  // Chart instances
  let chartProfit = null;
  let chartLongShort = null;
  let chartTimeframe = null;

  // Initialize the application
  function init() {
    // Load existing records from localStorage
    tradeRecords = loadRecords();

    // Tab navigation setup
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Entry tab buttons
    document.getElementById('btnClearEntry').addEventListener('click', clearEntryForm);
    document.getElementById('btnEvaluate').addEventListener('click', () => evaluateCurrentEntry(false));
    document.getElementById('btnEvaluateAndSave').addEventListener('click', () => evaluateCurrentEntry(true));

    // Exit tab buttons
    document.getElementById('btnClearResult').addEventListener('click', clearResultForm);
    document.getElementById('btnSaveResult').addEventListener('click', saveResultRecord);
    document.getElementById('selectExitRecord').addEventListener('change', onSelectExitRecord);
    document.getElementById('filterUnclosed').addEventListener('change', renderExitList);

    // Stats tab filters and actions
    document.getElementById('btnApplyFilters').addEventListener('click', applyStatsFilters);
    document.getElementById('btnExportJson').addEventListener('click', exportJson);
    document.getElementById('btnImportJson').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('btnDeleteAll').addEventListener('click', deleteAllRecords);
    document.getElementById('importFile').addEventListener('change', handleImportJson);

    // Stats table actions (delegated)
    document.getElementById('recordsTableBody').addEventListener('click', tableActionHandler);

    // Voice recording (optional)
    const voiceBtn = document.getElementById('voiceRecordButton');
    if (voiceBtn) {
      setupVoiceRecognition(voiceBtn);
    }

    // Initial renders
    renderExitList();
    applyStatsFilters();
    // Render judge result placeholder
    updateJudgeResult(null);
  }

  /**
   * Switch to a given tab by name.
   * @param {string} tabName
   */
  function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(sec => {
      sec.classList.toggle('active', sec.id === `tab-${tabName}`);
    });
  }

  /**
   * Load records from localStorage. If storage is corrupted, return empty array.
   * @returns {Array<any>}
   */
  function loadRecords() {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return [];
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) return arr;
      return [];
    } catch (e) {
      console.error('Failed to load records from localStorage:', e);
      return [];
    }
  }

  /**
   * Save records to localStorage.
   */
  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tradeRecords));
  }

  /**
   * Clear all inputs in the entry form and reset defaults. Also clears editingEntryId.
   */
  function clearEntryForm() {
    editingEntryId = null;
    document.getElementById('datetimeEntry').value = '';
    document.getElementById('symbol').value = 'nk225mc';
    document.getElementById('timeframe').value = '1分';
    document.getElementById('tradeType').value = 'real';
    document.getElementById('directionPlanned').value = 'long';
    document.getElementById('entryPrice').value = '';
    document.getElementById('size').value = '';
    document.getElementById('feePerUnit').value = '';
    document.getElementById('plannedStopPrice').value = '';
    document.getElementById('plannedLimitPrice').value = '';
    document.getElementById('cutLossPrice').value = '';
    document.getElementById('minWinRate').value = '30';
    // Indicators
    document.getElementById('prevWave').value = 'HH';
    document.getElementById('trend_5_20_40').value = 'Stage1';
    document.getElementById('price_vs_ema200').value = 'above';
    document.getElementById('ema_band_color').value = 'dark_green';
    document.getElementById('zone').value = 'pivot';
    document.getElementById('cmf_sign').value = 'positive';
    document.getElementById('cmf_sma_dir').value = 'gc';
    document.getElementById('macd_state').value = 'post_gc';
    document.getElementById('roc_sign').value = 'positive';
    document.getElementById('roc_sma_dir').value = 'up';
    document.getElementById('rsi_zone').value = 'over70';
    // Memo and attachments
    document.getElementById('marketMemo').value = '';
    document.getElementById('notionUrl').value = '';
    document.getElementById('imageData').value = '';
    document.getElementById('voiceStatus').textContent = '';
    // Reset judge result
    updateJudgeResult(null);
  }

  /**
   * Clear result form and reset editingResultId.
   */
  function clearResultForm() {
    editingResultId = null;
    document.getElementById('selectExitRecord').value = '';
    document.getElementById('datetimeExit').value = '';
    document.getElementById('exitPrice').value = '';
    document.getElementById('highDuringTrade').value = '';
    document.getElementById('lowDuringTrade').value = '';
    document.getElementById('resultMemo').value = '';
    document.getElementById('directionTakenDisplay').textContent = '—';
    document.getElementById('sizeDisplay').textContent = '—';
    document.getElementById('feePerUnitDisplay').textContent = '—';
    document.getElementById('profitDisplay').textContent = '—';
  }

  /**
   * Called when a record is selected in the exit list. Loads the record into the result form.
   */
  function onSelectExitRecord() {
    const select = document.getElementById('selectExitRecord');
    const id = select.value;
    if (!id) {
      clearResultForm();
      return;
    }
    const record = tradeRecords.find(r => r.id === id);
    if (!record) return;
    editingResultId = id;
    // Populate form
    document.getElementById('datetimeExit').value = record.datetimeExit || '';
    document.getElementById('exitPrice').value = record.exitPrice ?? '';
    document.getElementById('highDuringTrade').value = record.highDuringTrade ?? '';
    document.getElementById('lowDuringTrade').value = record.lowDuringTrade ?? '';
    document.getElementById('resultMemo').value = record.resultMemo || '';
    // Display-only fields
    const dirDisplay = { long: 'ロング', short: 'ショート', flat: 'ノーポジ' };
    document.getElementById('directionTakenDisplay').textContent = dirDisplay[record.directionTaken] || '—';
    document.getElementById('sizeDisplay').textContent = record.size != null ? record.size : '—';
    document.getElementById('feePerUnitDisplay').textContent = record.feePerUnit != null ? record.feePerUnit : '—';
    document.getElementById('profitDisplay').textContent = record.profit != null ? record.profit.toFixed(2) : '—';
  }

  /**
   * Render the exit list from tradeRecords into the select element.
   */
  function renderExitList() {
    const select = document.getElementById('selectExitRecord');
    // Clear options
    select.innerHTML = '<option value="">-- 選択してください --</option>';
    const showUnclosedOnly = document.getElementById('filterUnclosed').checked;
    // Sort records by createdAt descending to show recent first
    const sorted = [...tradeRecords].sort((a, b) => {
      return (b.datetimeEntry || b.createdAt || '').localeCompare(a.datetimeEntry || a.createdAt || '');
    });
    sorted.forEach(record => {
      if (showUnclosedOnly && record.hasResult) return;
      const option = document.createElement('option');
      option.value = record.id;
      const dt = record.datetimeEntry || record.createdAt;
      const symbol = record.symbol;
      const tf = record.timeframe;
      const direction = { long: 'ロング', short: 'ショート', flat: 'ノーポジ' }[record.directionTaken || record.directionPlanned] || '';
      const status = record.hasResult ? '完了' : '未決済';
      option.textContent = `${dt} ${symbol} ${tf} ${direction} (${status})`;
      select.appendChild(option);
    });
    // Reset form if current selection not exists
    onSelectExitRecord();
  }

  /**
   * Evaluate the current entry form and optionally save as a new or edited record.
   * @param {boolean} saveAfterEvaluation
   */
  async function evaluateCurrentEntry(saveAfterEvaluation) {
    // Gather form data
    const entry = getEntryFormData();
    // Perform evaluation using existing records
    const evaluation = performEvaluation(entry);
    // Update UI with evaluation results
    updateJudgeResult(evaluation);
    if (saveAfterEvaluation) {
      // Save record (possibly update existing one)
      const imageData = await getImageFileData();
      saveEntryRecord(entry, evaluation, imageData);
      clearEntryForm();
      renderExitList();
      applyStatsFilters();
    }
  }

  /**
   * Retrieve all form values for the entry form.
   * @returns {Object}
   */
  function getEntryFormData() {
    const entry = {};
    entry.id = editingEntryId || null;
    entry.datetimeEntry = document.getElementById('datetimeEntry').value || null;
    entry.symbol = document.getElementById('symbol').value;
    entry.timeframe = document.getElementById('timeframe').value;
    entry.tradeType = document.getElementById('tradeType').value;
    entry.directionPlanned = document.getElementById('directionPlanned').value;
    entry.entryPrice = parseFloatOrNull(document.getElementById('entryPrice').value);
    entry.size = parseFloatOrNull(document.getElementById('size').value);
    entry.feePerUnit = parseFloatOrNull(document.getElementById('feePerUnit').value);
    entry.plannedStopPrice = parseFloatOrNull(document.getElementById('plannedStopPrice').value);
    entry.plannedLimitPrice = parseFloatOrNull(document.getElementById('plannedLimitPrice').value);
    entry.cutLossPrice = parseFloatOrNull(document.getElementById('cutLossPrice').value);
    entry.prevWave = document.getElementById('prevWave').value;
    entry.trend_5_20_40 = document.getElementById('trend_5_20_40').value;
    entry.price_vs_ema200 = document.getElementById('price_vs_ema200').value;
    entry.ema_band_color = document.getElementById('ema_band_color').value;
    entry.zone = document.getElementById('zone').value;
    entry.cmf_sign = document.getElementById('cmf_sign').value;
    entry.cmf_sma_dir = document.getElementById('cmf_sma_dir').value;
    entry.macd_state = document.getElementById('macd_state').value;
    entry.roc_sign = document.getElementById('roc_sign').value;
    entry.roc_sma_dir = document.getElementById('roc_sma_dir').value;
    entry.rsi_zone = document.getElementById('rsi_zone').value;
    entry.minWinRate = parseFloatOrNull(document.getElementById('minWinRate').value);
    entry.marketMemo = document.getElementById('marketMemo').value.trim();
    entry.notionUrl = document.getElementById('notionUrl').value.trim();
    // imageData handled separately
    return entry;
  }

  /**
   * Parse a string to float or return null if empty or invalid.
   * @param {string} str
   * @returns {number|null}
   */
  function parseFloatOrNull(str) {
    const v = parseFloat(str);
    return isNaN(v) ? null : v;
  }

  /**
   * Perform evaluation based on current entry and past records.
   * Returns evaluation results used to update judge result and saved record.
   * @param {Object} entry
   * @returns {Object}
   */
  function performEvaluation(entry) {
    const results = {
      recommendation: 'flat',
      expectedMove: null,
      expectedMoveUnit: null,
      confidence: null,
      winRate: null,
      avgProfit: null,
      avgLoss: null,
      pseudoCaseCount: 0
    };
    // Filter candidate records: same symbol and timeframe and hasResult
    const candidates = tradeRecords.filter(r => r.hasResult && r.symbol === entry.symbol && r.timeframe === entry.timeframe);
    if (candidates.length === 0) {
      // No historical data; return default results
      results.confidence = 0;
      return results;
    }
    // Compute similarity scores and select pseudo cases
    const featureKeys = [
      'prevWave',
      'trend_5_20_40',
      'price_vs_ema200',
      'ema_band_color',
      'zone',
      'cmf_sign',
      'cmf_sma_dir',
      'macd_state',
      'roc_sign',
      'roc_sma_dir',
      'rsi_zone'
    ];
    const scored = candidates.map(rec => {
      let score = 0;
      featureKeys.forEach(key => {
        if (rec[key] === entry[key]) score++;
      });
      return { rec, score };
    });
    // Determine threshold: at least half of features matching
    const threshold = Math.floor(featureKeys.length * 0.5);
    const pseudoCases = scored.filter(s => s.score >= threshold).map(s => s.rec);
    results.pseudoCaseCount = pseudoCases.length;
    // If no pseudo cases, fallback to all candidates
    const analysisSet = pseudoCases.length > 0 ? pseudoCases : candidates;
    // Group by directionTaken
    const groups = { long: [], short: [], flat: [] };
    analysisSet.forEach(r => {
      const dir = r.directionTaken || 'flat';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(r);
    });
    // Compute statistics per direction
    const stats = {};
    ['long', 'short', 'flat'].forEach(dir => {
      const arr = groups[dir] || [];
      if (arr.length === 0) {
        stats[dir] = {
          count: 0,
          winRate: 0,
          avgProfit: 0,
          avgLoss: 0,
          expectedMove: 0
        };
        return;
      }
      const count = arr.length;
      const profits = arr.map(r => r.profit);
      const wins = profits.filter(p => p > 0);
      const losses = profits.filter(p => p < 0);
      const winRate = count === 0 ? 0 : (wins.length / count) * 100;
      const avgProfit = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
      // Expected move (price-based, not multiplied by multiplier)
      let moves = [];
      arr.forEach(r => {
        let move = 0;
        if (dir === 'long') {
          const h = r.highDuringTrade;
          const ePrice = r.entryPrice;
          if (h != null && ePrice != null) move = Math.max(0, h - ePrice);
        } else if (dir === 'short') {
          const l = r.lowDuringTrade;
          const ePrice = r.entryPrice;
          if (l != null && ePrice != null) move = Math.max(0, ePrice - l);
        }
        moves.push(move);
      });
      const expectedMove = moves.length > 0 ? moves.reduce((a, b) => a + b, 0) / moves.length : 0;
      stats[dir] = { count, winRate, avgProfit, avgLoss, expectedMove };
    });
    // Determine candidate direction based on winRate and expected move
    let candidateDir = 'flat';
    let bestScore = -Infinity;
    ['long', 'short'].forEach(dir => {
      const s = stats[dir];
      // Compute a simple score using win rate and expected move
      const score = s.winRate + s.expectedMove; // simple weighting
      if (s.count > 0 && score > bestScore) {
        bestScore = score;
        candidateDir = dir;
      }
    });
    const minWinRate = entry.minWinRate != null ? entry.minWinRate : 30;
    // Check win rate threshold
    if (stats[candidateDir] && stats[candidateDir].winRate < minWinRate) {
      results.recommendation = 'flat';
      results.expectedMove = null;
      results.expectedMoveUnit = null;
      results.winRate = stats[candidateDir].winRate;
      results.avgProfit = stats[candidateDir].avgProfit;
      results.avgLoss = stats[candidateDir].avgLoss;
    } else {
      results.recommendation = candidateDir;
      results.expectedMove = stats[candidateDir].expectedMove;
      results.expectedMoveUnit = '円';
      results.winRate = stats[candidateDir].winRate;
      results.avgProfit = stats[candidateDir].avgProfit;
      results.avgLoss = stats[candidateDir].avgLoss;
    }
    // Confidence calculation: combine pseudoCaseCount and winRate
    const totalCandidates = candidates.length;
    const caseScore = totalCandidates > 0 ? Math.min(results.pseudoCaseCount / totalCandidates, 1) : 0;
    const winScore = results.winRate != null ? (results.winRate / 100) : 0;
    let confidence = Math.round((caseScore * 0.5 + winScore * 0.5) * 100);
    if (isNaN(confidence)) confidence = 0;
    results.confidence = confidence;
    return results;
  }

  /**
   * Update the judge result UI with evaluation results. If null passed, clear the output.
   * @param {Object|null} evalResult
   */
  function updateJudgeResult(evalResult) {
    const container = document.getElementById('judgeResultContent');
    if (!evalResult) {
      container.innerHTML = '<p>判定がここに表示されます。</p>';
      return;
    }
    const jpDir = { long: 'ロング推奨', short: 'ショート推奨', flat: 'ノーポジ推奨' };
    const expectedMoveDisplay = (evalResult.expectedMove != null && evalResult.recommendation !== 'flat')
      ? `${evalResult.expectedMove.toFixed(2)}${evalResult.expectedMoveUnit || ''}`
      : '—';
    const html = `
      <div class="result-row"><strong>判定銘柄:</strong> ${document.getElementById('symbol').value}</div>
      <div class="result-row"><strong>疑似ケース:</strong> ${evalResult.pseudoCaseCount} 件</div>
      <div class="result-row"><strong>推奨方向:</strong> ${jpDir[evalResult.recommendation]}</div>
      <div class="result-row"><strong>勝率:</strong> ${evalResult.winRate != null ? evalResult.winRate.toFixed(2) : '--'}%</div>
      <div class="result-row"><strong>信頼度:</strong> ${evalResult.confidence}%
        <div class="confidence-bar"><div style="width:${evalResult.confidence}%"></div></div>
      </div>
      <div class="result-row"><strong>推定値幅:</strong> ${expectedMoveDisplay}</div>
      <div class="result-row"><strong>平均利益:</strong> ${evalResult.avgProfit != null ? evalResult.avgProfit.toFixed(2) : '--'} 円</div>
      <div class="result-row"><strong>平均損失:</strong> ${evalResult.avgLoss != null ? evalResult.avgLoss.toFixed(2) : '--'} 円</div>
    `;
    container.innerHTML = html;
  }

  /**
   * Read selected image file (if any) and return data URL. Returns null if no file selected.
   * @returns {Promise<string|null>}
   */
  function getImageFileData() {
    return new Promise((resolve) => {
      const fileInput = document.getElementById('imageData');
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        resolve(e.target.result);
      };
      reader.onerror = function () {
        console.warn('画像の読み込みに失敗しました');
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Save entry record. If editingEntryId is set, update existing record, otherwise create new.
   * @param {Object} entry
   * @param {Object} evalResult
   * @param {string|null} imageData
   */
  function saveEntryRecord(entry, evalResult, imageData) {
    const nowIso = new Date().toISOString();
    if (editingEntryId) {
      // Update existing record
      const idx = tradeRecords.findIndex(r => r.id === editingEntryId);
      if (idx !== -1) {
        const rec = tradeRecords[idx];
        // Preserve fields that should not be overwritten by entry editing (results)
        const preserved = {
          datetimeExit: rec.datetimeExit,
          exitPrice: rec.exitPrice,
          directionTaken: rec.directionTaken,
          highDuringTrade: rec.highDuringTrade,
          lowDuringTrade: rec.lowDuringTrade,
          profit: rec.profit,
          hasResult: rec.hasResult,
          resultMemo: rec.resultMemo
        };
        // Copy entry fields
        const updated = {
          ...rec,
          ...entry,
          imageData: imageData != null ? imageData : rec.imageData,
          updatedAt: nowIso,
          // Copy over evaluation results
          recommendation: evalResult.recommendation,
          expectedMove: evalResult.expectedMove,
          expectedMoveUnit: evalResult.expectedMoveUnit,
          confidence: evalResult.confidence,
          winRate: evalResult.winRate,
          avgProfit: evalResult.avgProfit,
          avgLoss: evalResult.avgLoss,
          pseudoCaseCount: evalResult.pseudoCaseCount,
          // Sync directionTaken to directionPlanned for consistency
          directionTaken: entry.directionPlanned
        };
        // Reapply preserved fields for result if record already has result
        if (preserved.hasResult) {
          updated.datetimeExit = preserved.datetimeExit;
          updated.exitPrice = preserved.exitPrice;
          updated.highDuringTrade = preserved.highDuringTrade;
          updated.lowDuringTrade = preserved.lowDuringTrade;
          updated.profit = preserved.profit;
          updated.resultMemo = preserved.resultMemo;
          updated.hasResult = true;
        }
        tradeRecords[idx] = updated;
      }
    } else {
      // Create new record
      const id = generateUUID();
      const newRecord = {
        id: id,
        createdAt: nowIso,
        updatedAt: nowIso,
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
        prevWave: entry.prevWave,
        trend_5_20_40: entry.trend_5_20_40,
        price_vs_ema200: entry.price_vs_ema200,
        ema_band_color: entry.ema_band_color,
        zone: entry.zone,
        cmf_sign: entry.cmf_sign,
        cmf_sma_dir: entry.cmf_sma_dir,
        macd_state: entry.macd_state,
        roc_sign: entry.roc_sign,
        roc_sma_dir: entry.roc_sma_dir,
        rsi_zone: entry.rsi_zone,
        minWinRate: entry.minWinRate,
        marketMemo: entry.marketMemo,
        notionUrl: entry.notionUrl,
        imageData: imageData,
        // Evaluation results
        recommendation: evalResult.recommendation,
        expectedMove: evalResult.expectedMove,
        expectedMoveUnit: evalResult.expectedMoveUnit,
        confidence: evalResult.confidence,
        winRate: evalResult.winRate,
        avgProfit: evalResult.avgProfit,
        avgLoss: evalResult.avgLoss,
        pseudoCaseCount: evalResult.pseudoCaseCount,
        // Result fields
        hasResult: false,
        datetimeExit: null,
        exitPrice: null,
        directionTaken: entry.directionPlanned,
        highDuringTrade: null,
        lowDuringTrade: null,
        profit: null,
        resultMemo: ''
      };
      tradeRecords.push(newRecord);
    }
    saveRecords();
  }

  /**
   * Save result for selected record.
   */
  function saveResultRecord() {
    if (!editingResultId) {
      alert('結果を保存するトレードを選択してください。');
      return;
    }
    const record = tradeRecords.find(r => r.id === editingResultId);
    if (!record) return;
    // Get result form values
    const datetimeExit = document.getElementById('datetimeExit').value || null;
    const exitPrice = parseFloatOrNull(document.getElementById('exitPrice').value);
    const highDuring = parseFloatOrNull(document.getElementById('highDuringTrade').value);
    const lowDuring = parseFloatOrNull(document.getElementById('lowDuringTrade').value);
    const resultMemo = document.getElementById('resultMemo').value.trim();
    // Compute profit
    const dir = record.directionTaken;
    let baseProfit = 0;
    if (dir === 'long') {
      baseProfit = ((exitPrice ?? 0) - (record.entryPrice ?? 0) - (record.feePerUnit ?? 0)) * (record.size ?? 0);
    } else if (dir === 'short') {
      baseProfit = ((record.entryPrice ?? 0) - (exitPrice ?? 0) - (record.feePerUnit ?? 0)) * (record.size ?? 0);
    } else {
      baseProfit = 0;
    }
    const multiplier = record.symbol === 'nk225mc' ? 10 : record.symbol === 'nk225m' ? 100 : record.symbol === 'nk225' ? 1000 : 1;
    const profit = baseProfit * multiplier;
    // Update record
    record.datetimeExit = datetimeExit;
    record.exitPrice = exitPrice;
    record.highDuringTrade = highDuring;
    record.lowDuringTrade = lowDuring;
    record.resultMemo = resultMemo;
    record.profit = profit;
    record.hasResult = true;
    record.updatedAt = new Date().toISOString();
    // Save and refresh
    saveRecords();
    clearResultForm();
    renderExitList();
    applyStatsFilters();
    alert('結果を保存しました。');
  }

  /**
   * Generate a UUID using crypto API if available.
   * @returns {string}
   */
  function generateUUID() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: simple random string
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Apply filters from stats tab and render table & charts.
   */
  function applyStatsFilters() {
    // Retrieve filter values
    const symbol = document.getElementById('filterSymbol').value;
    const tradeType = document.getElementById('filterTradeType').value;
    const direction = document.getElementById('filterDirection').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    // Filter records
    let filtered = [...tradeRecords];
    if (symbol !== 'all') {
      filtered = filtered.filter(r => r.symbol === symbol);
    }
    if (tradeType !== 'all') {
      filtered = filtered.filter(r => r.tradeType === tradeType);
    }
    if (direction !== 'all') {
      filtered = filtered.filter(r => {
        const dirTaken = r.hasResult ? r.directionTaken : 'flat';
        return dirTaken === direction;
      });
    }
    if (fromDate) {
      filtered = filtered.filter(r => {
        const dtStr = r.datetimeEntry || r.createdAt;
        return dtStr && new Date(dtStr) >= fromDate;
      });
    }
    if (toDate) {
      filtered = filtered.filter(r => {
        const dtStr = r.datetimeEntry || r.createdAt;
        return dtStr && new Date(dtStr) <= toDate;
      });
    }
    renderStatsTable(filtered);
    updateCharts(filtered);
  }

  /**
   * Render the stats table based on provided records.
   * @param {Array<any>} records
   */
  function renderStatsTable(records) {
    const tbody = document.getElementById('recordsTableBody');
    tbody.innerHTML = '';
    records.forEach(rec => {
      const tr = document.createElement('tr');
      // Entry date/time
      tr.appendChild(createTd(rec.datetimeEntry || rec.createdAt || ''));
      tr.appendChild(createTd(rec.symbol));
      tr.appendChild(createTd(rec.timeframe));
      tr.appendChild(createTd(rec.tradeType));
      tr.appendChild(createTd(directionLabel(rec.directionPlanned)));
      tr.appendChild(createTd(rec.hasResult ? directionLabel(rec.directionTaken) : '—'));
      tr.appendChild(createTd(rec.hasResult && rec.profit != null ? rec.profit.toFixed(2) : '—'));
      tr.appendChild(createTd(rec.recommendation || '—'));
      tr.appendChild(createTd(rec.hasResult ? '✓' : '')); // completed flag
      // Actions
      const actionsTd = document.createElement('td');
      actionsTd.classList.add('table-actions');
      // Edit entry
      const editEntryBtn = document.createElement('button');
      editEntryBtn.textContent = 'エントリー編集';
      editEntryBtn.classList.add('secondary-button');
      editEntryBtn.dataset.action = 'edit-entry';
      editEntryBtn.dataset.id = rec.id;
      actionsTd.appendChild(editEntryBtn);
      // Edit result
      const editResultBtn = document.createElement('button');
      editResultBtn.textContent = '結果編集';
      editResultBtn.classList.add('secondary-button');
      editResultBtn.dataset.action = 'edit-result';
      editResultBtn.dataset.id = rec.id;
      actionsTd.appendChild(editResultBtn);
      // Delete
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.classList.add('secondary-button');
      deleteBtn.dataset.action = 'delete';
      deleteBtn.dataset.id = rec.id;
      actionsTd.appendChild(deleteBtn);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
  }

  function createTd(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  /**
   * Convert direction value to Japanese label
   * @param {string} dir
   * @returns {string}
   */
  function directionLabel(dir) {
    return dir === 'long' ? 'ロング' : dir === 'short' ? 'ショート' : dir === 'flat' ? 'ノーポジ' : '';
  }

  /**
   * Handle clicks on the stats table actions (edit entry, edit result, delete).
   * @param {MouseEvent} e
   */
  function tableActionHandler(e) {
    const target = e.target;
    if (target.tagName !== 'BUTTON') return;
    const id = target.dataset.id;
    const action = target.dataset.action;
    if (!id || !action) return;
    const rec = tradeRecords.find(r => r.id === id);
    if (!rec) return;
    if (action === 'edit-entry') {
      // Load record into entry form and switch tab
      loadEntryIntoForm(rec);
      switchTab('entry');
    } else if (action === 'edit-result') {
      // Load record into exit form and switch tab
      loadResultIntoForm(rec);
      switchTab('exit');
    } else if (action === 'delete') {
      // Delete record
      if (confirm('このトレード記録を削除しますか？（元に戻せません）')) {
        deleteRecord(id);
      }
    }
  }

  /**
   * Load entry data into form for editing.
   * @param {Object} rec
   */
  function loadEntryIntoForm(rec) {
    editingEntryId = rec.id;
    document.getElementById('datetimeEntry').value = rec.datetimeEntry || '';
    document.getElementById('symbol').value = rec.symbol;
    document.getElementById('timeframe').value = rec.timeframe;
    document.getElementById('tradeType').value = rec.tradeType;
    document.getElementById('directionPlanned').value = rec.directionPlanned;
    document.getElementById('entryPrice').value = rec.entryPrice != null ? rec.entryPrice : '';
    document.getElementById('size').value = rec.size != null ? rec.size : '';
    document.getElementById('feePerUnit').value = rec.feePerUnit != null ? rec.feePerUnit : '';
    document.getElementById('plannedStopPrice').value = rec.plannedStopPrice != null ? rec.plannedStopPrice : '';
    document.getElementById('plannedLimitPrice').value = rec.plannedLimitPrice != null ? rec.plannedLimitPrice : '';
    document.getElementById('cutLossPrice').value = rec.cutLossPrice != null ? rec.cutLossPrice : '';
    document.getElementById('minWinRate').value = rec.minWinRate != null ? rec.minWinRate : '30';
    // Indicators
    document.getElementById('prevWave').value = rec.prevWave;
    document.getElementById('trend_5_20_40').value = rec.trend_5_20_40;
    document.getElementById('price_vs_ema200').value = rec.price_vs_ema200;
    document.getElementById('ema_band_color').value = rec.ema_band_color;
    document.getElementById('zone').value = rec.zone;
    document.getElementById('cmf_sign').value = rec.cmf_sign;
    document.getElementById('cmf_sma_dir').value = rec.cmf_sma_dir;
    document.getElementById('macd_state').value = rec.macd_state;
    document.getElementById('roc_sign').value = rec.roc_sign;
    document.getElementById('roc_sma_dir').value = rec.roc_sma_dir;
    document.getElementById('rsi_zone').value = rec.rsi_zone;
    document.getElementById('marketMemo').value = rec.marketMemo || '';
    document.getElementById('notionUrl').value = rec.notionUrl || '';
    document.getElementById('imageData').value = '';
    document.getElementById('voiceStatus').textContent = '';
    // Evaluate again with updated fields? Show previous evaluation as default
    const evalRes = {
      recommendation: rec.recommendation,
      expectedMove: rec.expectedMove,
      expectedMoveUnit: rec.expectedMoveUnit,
      confidence: rec.confidence,
      winRate: rec.winRate,
      avgProfit: rec.avgProfit,
      avgLoss: rec.avgLoss,
      pseudoCaseCount: rec.pseudoCaseCount
    };
    updateJudgeResult(evalRes);
  }

  /**
   * Load result data into form for editing.
   * @param {Object} rec
   */
  function loadResultIntoForm(rec) {
    editingResultId = rec.id;
    // Set select
    document.getElementById('selectExitRecord').value = rec.id;
    // Populate result fields
    document.getElementById('datetimeExit').value = rec.datetimeExit || '';
    document.getElementById('exitPrice').value = rec.exitPrice != null ? rec.exitPrice : '';
    document.getElementById('highDuringTrade').value = rec.highDuringTrade != null ? rec.highDuringTrade : '';
    document.getElementById('lowDuringTrade').value = rec.lowDuringTrade != null ? rec.lowDuringTrade : '';
    document.getElementById('resultMemo').value = rec.resultMemo || '';
    const dirDisplay = { long: 'ロング', short: 'ショート', flat: 'ノーポジ' };
    document.getElementById('directionTakenDisplay').textContent = dirDisplay[rec.directionTaken] || '—';
    document.getElementById('sizeDisplay').textContent = rec.size != null ? rec.size : '—';
    document.getElementById('feePerUnitDisplay').textContent = rec.feePerUnit != null ? rec.feePerUnit : '—';
    document.getElementById('profitDisplay').textContent = rec.profit != null ? rec.profit.toFixed(2) : '—';
  }

  /**
   * Delete a record by id, update localStorage and re-render.
   * @param {string} id
   */
  function deleteRecord(id) {
    const index = tradeRecords.findIndex(r => r.id === id);
    if (index !== -1) {
      tradeRecords.splice(index, 1);
      saveRecords();
      // If the deleted record was being edited, clear forms
      if (editingEntryId === id) {
        clearEntryForm();
      }
      if (editingResultId === id) {
        clearResultForm();
      }
      renderExitList();
      applyStatsFilters();
    }
  }

  /**
   * Update all charts based on given filtered records.
   * @param {Array<any>} records
   */
  function updateCharts(records) {
    // Chart 1: cumulative profit
    const sorted = records.filter(r => r.hasResult).sort((a, b) => {
      const dtA = rDate(a.datetimeExit || a.datetimeEntry || a.createdAt);
      const dtB = rDate(b.datetimeExit || b.datetimeEntry || b.createdAt);
      return dtA - dtB;
    });
    let cumulative = 0;
    const labels1 = [];
    const data1 = [];
    sorted.forEach(r => {
      cumulative += r.profit != null ? r.profit : 0;
      const dt = r.datetimeExit || r.datetimeEntry || r.createdAt;
      labels1.push(formatDateLabel(dt));
      data1.push(parseFloat(cumulative.toFixed(2)));
    });
    // Create or update chartProfit
    if (!chartProfit) {
      const ctx1 = document.getElementById('chartProfit').getContext('2d');
      chartProfit = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: labels1,
          datasets: [
            {
              label: '累積損益 (円)',
              data: data1,
              borderColor: '#00ffc8',
              backgroundColor: 'rgba(0, 255, 200, 0.2)',
              tension: 0.2,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              ticks: { color: '#e4e9f0' },
              grid: { color: '#252c38' }
            },
            x: {
              ticks: { color: '#e4e9f0' },
              grid: { color: '#252c38' }
            }
          },
          plugins: {
            legend: { labels: { color: '#e4e9f0' } }
          }
        }
      });
    } else {
      chartProfit.data.labels = labels1;
      chartProfit.data.datasets[0].data = data1;
      chartProfit.update();
    }
    // Chart 2: long/short stats
    const groups = { long: [], short: [] };
    records.filter(r => r.hasResult).forEach(r => {
      if (r.directionTaken === 'long') groups.long.push(r);
      else if (r.directionTaken === 'short') groups.short.push(r);
    });
    const dirs = ['long', 'short'];
    const winRates = [];
    const avgProfits = [];
    const avgLosses = [];
    dirs.forEach(dir => {
      const arr = groups[dir];
      if (!arr || arr.length === 0) {
        winRates.push(0);
        avgProfits.push(0);
        avgLosses.push(0);
        return;
      }
      const profits = arr.map(r => r.profit);
      const wins = profits.filter(p => p > 0);
      const losses = profits.filter(p => p < 0);
      const winRate = arr.length > 0 ? (wins.length / arr.length) * 100 : 0;
      const avgProfit = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
      winRates.push(parseFloat(winRate.toFixed(2)));
      avgProfits.push(parseFloat(avgProfit.toFixed(2)));
      avgLosses.push(parseFloat(avgLoss.toFixed(2)));
    });
    // Create or update chartLongShort
    if (!chartLongShort) {
      const ctx2 = document.getElementById('chartLongShort').getContext('2d');
      chartLongShort = new Chart(ctx2, {
        data: {
          labels: ['ロング', 'ショート'],
          datasets: [
            {
              type: 'bar',
              label: '平均利益 (円)',
              data: avgProfits,
              backgroundColor: '#00ffc8'
            },
            {
              type: 'bar',
              label: '平均損失 (円)',
              data: avgLosses,
              backgroundColor: '#ff5555'
            },
            {
              type: 'line',
              label: '勝率 (%)',
              data: winRates,
              borderColor: '#ffaa00',
              backgroundColor: '#ffaa00',
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              ticks: { color: '#e4e9f0' },
              grid: { color: '#252c38' }
            },
            y: {
              position: 'left',
              ticks: { color: '#e4e9f0' },
              grid: { color: '#252c38' },
              title: {
                display: true,
                text: '金額 (円)',
                color: '#e4e9f0'
              }
            },
            y1: {
              position: 'right',
              ticks: { color: '#e4e9f0' },
              grid: { drawOnChartArea: false },
              title: {
                display: true,
                text: '勝率 (%)',
                color: '#e4e9f0'
              }
            }
          },
          plugins: {
            legend: { labels: { color: '#e4e9f0' } }
          }
        }
      });
    } else {
      chartLongShort.data.datasets[0].data = avgProfits;
      chartLongShort.data.datasets[1].data = avgLosses;
      chartLongShort.data.datasets[2].data = winRates;
      chartLongShort.update();
    }
    // Chart 3: timeframe win rate
    const tfGroups = {};
    records.filter(r => r.hasResult).forEach(r => {
      if (!tfGroups[r.timeframe]) tfGroups[r.timeframe] = [];
      tfGroups[r.timeframe].push(r);
    });
    const tfLabels = Object.keys(tfGroups);
    const tfWinRates = tfLabels.map(tf => {
      const arr = tfGroups[tf];
      if (!arr || arr.length === 0) return 0;
      const wins = arr.filter(r => r.profit > 0);
      return parseFloat(((wins.length / arr.length) * 100).toFixed(2));
    });
    if (!chartTimeframe) {
      const ctx3 = document.getElementById('chartTimeframe').getContext('2d');
      chartTimeframe = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: tfLabels,
          datasets: [
            {
              label: '勝率 (%)',
              data: tfWinRates,
              backgroundColor: '#00bfff'
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              ticks: { color: '#e4e9f0' },
              grid: { color: '#252c38' }
            },
            y: {
              ticks: { color: '#e4e9f0' },
              grid: { color: '#252c38' },
              title: {
                display: true,
                text: '勝率 (%)',
                color: '#e4e9f0'
              },
              min: 0,
              max: 100
            }
          },
          plugins: {
            legend: { labels: { color: '#e4e9f0' } }
          }
        }
      });
    } else {
      chartTimeframe.data.labels = tfLabels;
      chartTimeframe.data.datasets[0].data = tfWinRates;
      chartTimeframe.update();
    }
  }

  /**
   * Helper to parse ISO date string safely. Returns Date instance or null.
   */
  function rDate(str) {
    if (!str) return new Date(0);
    return new Date(str);
  }
  /**
   * Format date string to a shorter label (YYYY-MM-DD or YYYY/MM/DD HH:MM).
   */
  function formatDateLabel(str) {
    if (!str) return '';
    const d = new Date(str);
    if (isNaN(d)) return str;
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  /**
   * Export records to a JSON file.
   */
  function exportJson() {
    const data = { version: 1, records: tradeRecords };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradeRecords_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Handle JSON import when file selected.
   * @param {Event} e
   */
  function handleImportJson(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const obj = JSON.parse(ev.target.result);
        if (obj.version !== 1 || !Array.isArray(obj.records)) {
          alert('インポートファイルのバージョンが異なります。');
          return;
        }
        let added = 0;
        let updated = 0;
        obj.records.forEach(rec => {
          const existingIndex = tradeRecords.findIndex(r => r.id === rec.id);
          if (existingIndex === -1) {
            tradeRecords.push(rec);
            added++;
          } else {
            // Compare updatedAt
            const existing = tradeRecords[existingIndex];
            if (!existing.updatedAt || !rec.updatedAt || rec.updatedAt > existing.updatedAt) {
              tradeRecords[existingIndex] = rec;
              updated++;
            }
          }
        });
        saveRecords();
        renderExitList();
        applyStatsFilters();
        alert(`インポート完了：追加 ${added} 件、更新 ${updated} 件`);
      } catch (err) {
        console.error('JSON parse error', err);
        alert('JSONファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  }

  /**
   * Delete all records with confirmation.
   */
  function deleteAllRecords() {
    if (!confirm('すべてのトレード記録を削除しますか？（元に戻せません）')) return;
    tradeRecords = [];
    saveRecords();
    clearEntryForm();
    clearResultForm();
    renderExitList();
    applyStatsFilters();
    alert('全件削除しました。');
  }

  /**
   * Set up voice recognition for market memo. Uses Web Speech API if available.
   * @param {HTMLButtonElement} button
   */
  function setupVoiceRecognition(button) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      button.disabled = true;
      document.getElementById('voiceStatus').textContent = '音声入力はサポートされていません';
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;
    let recording = false;
    button.addEventListener('click', () => {
      if (!recording) {
        try {
          recognition.start();
          recording = true;
          button.textContent = '録音停止';
          document.getElementById('voiceStatus').textContent = '録音中...';
        } catch (err) {
          console.error(err);
        }
      } else {
        recognition.stop();
      }
    });
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      const memoEl = document.getElementById('marketMemo');
      memoEl.value = (memoEl.value ? memoEl.value + '\n' : '') + transcript;
    };
    recognition.onend = () => {
      recording = false;
      button.textContent = '🎤 音声入力';
      document.getElementById('voiceStatus').textContent = '';
    };
    recognition.onerror = (e) => {
      console.error('Voice recognition error', e);
      recording = false;
      button.textContent = '🎤 音声入力';
      document.getElementById('voiceStatus').textContent = 'エラーが発生しました';
    };
  }

  // Initialize when DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();