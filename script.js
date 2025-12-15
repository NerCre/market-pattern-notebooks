// EdgeScope - Trade Judge & Note
// All logic for the single page application lives here.

(() => {
  const STORAGE_KEY = 'tradeRecords_v1';
  let records = [];
  let editingEntryId = null;
  let editingResultId = null;
  let currentImageData = null;
  let recognition = null; // Speech recognition instance
  // Chart instances
  let chartCumulative = null;
  let chartLongShort = null;
  let chartTimeframe = null;

  // Initialise app after DOM load
  document.addEventListener('DOMContentLoaded', () => {
    initStorage();
    initTabs();
    initEntryForm();
    initResultForm();
    initAnalysis();
    initImportExport();
    initSpeechRecognition();
    updateAllViews();
  });

  /**
   * Initialise and load records from localStorage.
   */
  function initStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          records = parsed;
        } else if (parsed && Array.isArray(parsed.records)) {
          // in case of wrapped object
          records = parsed.records;
        } else {
          console.warn('Unexpected storage format');
          records = [];
        }
      } else {
        records = [];
      }
    } catch (e) {
      alert('保存データが破損している可能性があります。新規に初期化しました。');
      records = [];
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Save records to localStorage.
   */
  function saveStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  /**
   * Generate a UUID string.
   */
  function generateUUID() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  /**
   * Initialise tab switching.
   */
  function initTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });
  }

  /**
   * Switch to a specific tab.
   */
  function switchTab(tab) {
    // Deactivate all
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.remove('active'));
    // Activate selected
    const btn = document.querySelector(`.tab-button[data-tab="${tab}"]`);
    const sec = document.getElementById(`tab-${tab}`);
    if (btn && sec) {
      btn.classList.add('active');
      sec.classList.add('active');
      // When switching to result or analysis, refresh the view
      if (tab === 'result') {
        populateResultSelect();
      } else if (tab === 'analysis') {
        updateAnalysisView();
      }
    }
  }

  /**
   * Initialise entry form events and defaults.
   */
  function initEntryForm() {
    // Image preview & convert
    const imageInput = document.getElementById('imageInput');
    imageInput.addEventListener('change', handleImageUpload);

    // Voice input
    const voiceBtn = document.getElementById('voiceInputBtn');
    voiceBtn.addEventListener('click', startVoiceInput);

    // Buttons
    document.getElementById('judgeBtn').addEventListener('click', handleJudgeOnly);
    document.getElementById('judgeSaveBtn').addEventListener('click', handleJudgeAndSave);
    document.getElementById('clearEntryBtn').addEventListener('click', clearEntryForm);

    // Clear form initially
    clearEntryForm();
  }

  /**
   * Handle file image upload and convert to base64 for storage.
   */
  function handleImageUpload(event) {
    const file = event.target.files[0];
    const previewContainer = document.getElementById('imagePreview');
    previewContainer.innerHTML = '';
    currentImageData = null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      currentImageData = e.target.result;
      const img = document.createElement('img');
      img.src = currentImageData;
      previewContainer.appendChild(img);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Start voice input using Web Speech API.
   */
  function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('お使いのブラウザは音声入力に対応していません。');
      return;
    }
    // Cancel existing recognition if in progress
    if (recognition) {
      recognition.stop();
    }
    // Use vendor prefixed if necessary
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      const memoArea = document.getElementById('marketMemo');
      memoArea.value = memoArea.value ? memoArea.value + ' ' + transcript : transcript;
    };
    recognition.onend = function () {
      recognition = null;
    };
    recognition.start();
  }

  /**
   * Gather entry form values into an object representing part of TradeRecord.
   */
  function getEntryFormValues() {
    const getValue = id => document.getElementById(id).value;
    const numeric = id => {
      const v = getValue(id);
      return v === '' ? null : parseFloat(v);
    };
    return {
      datetimeEntry: getValue('datetimeEntry') || null,
      symbol: getValue('symbol') || 'nk225mc',
      timeframe: getValue('timeframe'),
      tradeType: getValue('tradeType'),
      directionPlanned: getValue('directionPlanned'),
      entryPrice: numeric('entryPrice'),
      size: numeric('size'),
      feePerUnit: numeric('feePerUnit'),
      plannedStopPrice: numeric('plannedStopPrice'),
      plannedLimitPrice: numeric('plannedLimitPrice'),
      cutLossPrice: numeric('cutLossPrice'),
      trend_5_20_40: getValue('trend_5_20_40'),
      price_vs_ema200: getValue('price_vs_ema200'),
      ema_band_color: getValue('ema_band_color'),
      zone: getValue('zone'),
      cmf_sign: getValue('cmf_sign'),
      cmf_sma_dir: getValue('cmf_sma_dir'),
      macd_state: getValue('macd_state'),
      roc_sign: getValue('roc_sign'),
      roc_sma_dir: getValue('roc_sma_dir'),
      rsi_zone: getValue('rsi_zone'),
      marketMemo: document.getElementById('marketMemo').value,
      notionUrl: document.getElementById('notionUrl').value,
      imageData: currentImageData || null
    };
  }

  /**
   * Clear entry form to defaults.
   */
  function clearEntryForm() {
    editingEntryId = null;
    // Reset form fields
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
    document.getElementById('marketMemo').value = '';
    document.getElementById('notionUrl').value = '';
    document.getElementById('imageInput').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    currentImageData = null;
    // Hide judge result
    const judgeCard = document.getElementById('judgeResult');
    judgeCard.style.display = 'none';
  }

  /**
   * Show judgement result in the entry tab.
   */
  function displayJudgement(result) {
    const card = document.getElementById('judgeResult');
    const badge = document.getElementById('recommendationBadge');
    const move = document.getElementById('expectedMove');
    const confidenceBar = document.querySelector('#confidenceBar');
    const reasonEl = document.getElementById('judgeReason');
    // Set recommendation badge
    badge.textContent = result.recommendation === 'long' ? 'ロング推奨' : result.recommendation === 'short' ? 'ショート推奨' : 'ノーポジ推奨';
    // Change background color depending on recommendation
    badge.style.backgroundColor = result.recommendation === 'long' ? 'var(--success)' : result.recommendation === 'short' ? 'var(--danger)' : 'var(--border-color)';
    badge.style.color = result.recommendation === 'flat' ? 'var(--text-main)' : '#000';
    // Expected move
    move.textContent = result.expectedMove !== null ? `想定値幅: ${result.expectedMove}${result.expectedMoveUnit || ''}` : '';
    // Confidence bar
    const barInner = confidenceBar.querySelector('::after');
    // Instead manipulate style via CSS variable or set width via dataset; we will set width via style on pseudo element, but not accessible; so we'll insert dynamic bar
    confidenceBar.innerHTML = '';
    const barFill = document.createElement('div');
    barFill.style.backgroundColor = 'var(--accent)';
    barFill.style.height = '100%';
    barFill.style.width = Math.min(100, Math.round(result.confidence)).toString() + '%';
    confidenceBar.appendChild(barFill);
    // Reason
    reasonEl.textContent = result.reason;
    // Show card
    card.style.display = 'block';
  }

  /**
   * Handle clicking of Judge button (no save).
   */
  function handleJudgeOnly() {
    const entryVals = getEntryFormValues();
    const judgement = computeRecommendation(entryVals);
    displayJudgement(judgement);
  }

  /**
   * Handle clicking of Judge and Save button. Creates or updates a record.
   */
  function handleJudgeAndSave() {
    const entryVals = getEntryFormValues();
    const judgement = computeRecommendation(entryVals);
    displayJudgement(judgement);
    // Build record
    const nowIso = new Date().toISOString();
    if (editingEntryId) {
      // Update existing record
      const record = records.find(r => r.id === editingEntryId);
      if (record) {
        // Update entry fields
        Object.assign(record, entryVals);
        // When editing entry, also update directionTaken to match planned
        record.directionTaken = entryVals.directionPlanned;
        record.updatedAt = nowIso;
        // Update recommendation values
        record.recommendation = judgement.recommendation;
        record.expectedMove = judgement.expectedMove;
        record.expectedMoveUnit = judgement.expectedMoveUnit;
        record.confidence = judgement.confidence;
        record.reason = judgement.reason;
        // If result exists and profit depends on entry price, recalc profit
        if (record.hasResult && record.exitPrice != null && record.size != null && record.feePerUnit != null && record.entryPrice != null) {
          record.profit = calculateProfit(record);
        }
      }
    } else {
      // Create new record
      const newRecord = {
        id: generateUUID(),
        createdAt: nowIso,
        updatedAt: nowIso,
        ...entryVals,
        recommendation: judgement.recommendation,
        expectedMove: judgement.expectedMove,
        expectedMoveUnit: judgement.expectedMoveUnit,
        confidence: judgement.confidence,
        reason: judgement.reason,
        // Result fields
        hasResult: false,
        datetimeExit: null,
        exitPrice: null,
        directionTaken: entryVals.directionPlanned,
        highDuringTrade: null,
        lowDuringTrade: null,
        profit: null,
        resultMemo: ''
      };
      records.push(newRecord);
    }
    saveStorage();
    updateAllViews();
    clearEntryForm();
    alert('エントリーを保存しました。');
  }

  /**
   * Calculate profit for a record based on entry & exit prices and fee.
   */
  function calculateProfit(record) {
    const size = record.size || 0;
    const fee = record.feePerUnit || 0;
    const entry = record.entryPrice || 0;
    const exit = record.exitPrice || 0;
    let profit = 0;
    if (record.directionTaken === 'long') {
      profit = (exit - entry - fee) * size;
    } else if (record.directionTaken === 'short') {
      profit = (entry - exit - fee) * size;
    } else {
      profit = 0;
    }
    return profit;
  }

  /**
   * Initialise result tab events.
   */
  function initResultForm() {
    document.getElementById('filterPending').addEventListener('change', populateResultSelect);
    document.getElementById('resultSelect').addEventListener('change', () => {
      const id = document.getElementById('resultSelect').value;
      loadResultForm(id);
    });
    document.getElementById('saveResultBtn').addEventListener('click', saveResult); 
    document.getElementById('clearResultBtn').addEventListener('click', clearResultForm);
    // Initially populate select
    populateResultSelect();
    clearResultForm();
  }

  /**
   * Populate the select dropdown in result tab based on records and filter.
   */
  function populateResultSelect() {
    const select = document.getElementById('resultSelect');
    const filterPending = document.getElementById('filterPending').checked;
    select.innerHTML = '';
    // Sort records by datetimeEntry descending for convenience
    const sorted = [...records].sort((a, b) => {
      const da = a.datetimeEntry || a.createdAt;
      const db = b.datetimeEntry || b.createdAt;
      return (db || '').localeCompare(da || '');
    });
    sorted.forEach(rec => {
      if (filterPending && rec.hasResult) return;
      const option = document.createElement('option');
      option.value = rec.id;
      const entryDate = rec.datetimeEntry ? rec.datetimeEntry.replace('T', ' ') : '';
      option.textContent = `${entryDate} ${rec.symbol} (${rec.directionPlanned}) ${rec.hasResult ? '✓' : ''}`;
      select.appendChild(option);
    });
    // If no selection, clear form
    if (!select.value) {
      clearResultForm();
    }
  }

  /**
   * Load selected record into result form for editing.
   */
  function loadResultForm(recordId) {
    clearResultForm();
    if (!recordId) return;
    const rec = records.find(r => r.id === recordId);
    if (!rec) return;
    editingResultId = rec.id;
    // Populate read-only fields
    document.getElementById('directionTaken').value = rec.directionTaken || '';
    document.getElementById('resultSize').value = rec.size != null ? rec.size : '';
    document.getElementById('resultFeePerUnit').value = rec.feePerUnit != null ? rec.feePerUnit : '';
    // Editable fields
    document.getElementById('datetimeExit').value = rec.datetimeExit || '';
    document.getElementById('exitPrice').value = rec.exitPrice != null ? rec.exitPrice : '';
    document.getElementById('highDuringTrade').value = rec.highDuringTrade != null ? rec.highDuringTrade : '';
    document.getElementById('lowDuringTrade').value = rec.lowDuringTrade != null ? rec.lowDuringTrade : '';
    document.getElementById('resultMemo').value = rec.resultMemo || '';
    // Display profit if available
    if (rec.profit != null) {
      document.getElementById('profitDisplay').value = rec.profit;
    } else {
      document.getElementById('profitDisplay').value = '';
    }
  }

  /**
   * Clear result form (not altering records).
   */
  function clearResultForm() {
    editingResultId = null;
    document.getElementById('datetimeExit').value = '';
    document.getElementById('exitPrice').value = '';
    document.getElementById('directionTaken').value = '';
    document.getElementById('resultSize').value = '';
    document.getElementById('resultFeePerUnit').value = '';
    document.getElementById('highDuringTrade').value = '';
    document.getElementById('lowDuringTrade').value = '';
    document.getElementById('resultMemo').value = '';
    document.getElementById('profitDisplay').value = '';
  }

  /**
   * Save result to selected record.
   */
  function saveResult() {
    if (!editingResultId) {
      alert('編集するエントリーを選択してください。');
      return;
    }
    const rec = records.find(r => r.id === editingResultId);
    if (!rec) return;
    // Get values
    const datetimeExit = document.getElementById('datetimeExit').value || null;
    const exitPriceStr = document.getElementById('exitPrice').value;
    const exitPrice = exitPriceStr === '' ? null : parseFloat(exitPriceStr);
    const highStr = document.getElementById('highDuringTrade').value;
    const highDuringTrade = highStr === '' ? null : parseFloat(highStr);
    const lowStr = document.getElementById('lowDuringTrade').value;
    const lowDuringTrade = lowStr === '' ? null : parseFloat(lowStr);
    const resultMemo = document.getElementById('resultMemo').value;
    // Update record
    rec.datetimeExit = datetimeExit;
    rec.exitPrice = exitPrice;
    rec.highDuringTrade = highDuringTrade;
    rec.lowDuringTrade = lowDuringTrade;
    rec.resultMemo = resultMemo;
    rec.hasResult = true;
    rec.updatedAt = new Date().toISOString();
    // Calculate profit
    rec.profit = calculateProfit(rec);
    // Save
    saveStorage();
    updateAllViews();
    clearResultForm();
    alert('結果を保存しました。');
  }

  /**
   * Initialise analysis tab events.
   */
  function initAnalysis() {
    document.getElementById('applyFilterBtn').addEventListener('click', updateAnalysisView);
    document.getElementById('resetFilterBtn').addEventListener('click', resetAnalysisFilters);
    // Table event delegation for edit/delete
    document.getElementById('recordsTbody').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit-entry') {
        handleEditEntry(id);
      } else if (action === 'edit-result') {
        handleEditResult(id);
      } else if (action === 'delete') {
        handleDeleteRecord(id);
      }
    });
    // Initialize charts (empty)
    const ctx1 = document.getElementById('chartCumulative').getContext('2d');
    const ctx2 = document.getElementById('chartLongShort').getContext('2d');
    const ctx3 = document.getElementById('chartTimeframe').getContext('2d');
    chartCumulative = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '累積損益',
          data: [],
          borderColor: '#00ffc8',
          backgroundColor: 'rgba(0,255,200,0.2)',
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            ticks: { color: '#9aa4b5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
    chartLongShort = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['ロング', 'ショート'],
        datasets: [
          {
            label: '勝率 (%)',
            data: [0, 0],
            backgroundColor: '#00ffc8',
            yAxisID: 'y'
          },
          {
            label: '平均損益',
            data: [0, 0],
            backgroundColor: '#3399ff',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            ticks: { color: '#9aa4b5' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            title: { display: true, text: '勝率(%)', color: '#9aa4b5' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            ticks: { color: '#9aa4b5' },
            grid: { drawOnChartArea: false },
            title: { display: true, text: '平均損益', color: '#9aa4b5' }
          },
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#9aa4b5' } }
        }
      }
    });
    chartTimeframe = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: '勝率 (%)',
          data: [],
          backgroundColor: '#00ffc8'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            ticks: { color: '#9aa4b5' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            max: 100
          },
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  /**
   * Reset analysis filters to default values.
   */
  function resetAnalysisFilters() {
    document.getElementById('filterSymbol').value = '';
    document.getElementById('filterTradeType').value = '';
    document.getElementById('filterDirection').value = '';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    updateAnalysisView();
  }

  /**
   * Update analysis view: table and charts according to filters.
   */
  function updateAnalysisView() {
    const filterSymbol = document.getElementById('filterSymbol').value.trim();
    const filterTradeType = document.getElementById('filterTradeType').value;
    const filterDir = document.getElementById('filterDirection').value;
    const startDateStr = document.getElementById('filterStartDate').value;
    const endDateStr = document.getElementById('filterEndDate').value;
    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;
    // Filter records
    const filtered = records.filter(rec => {
      // Symbol filter (contains)
      if (filterSymbol && (!rec.symbol || !rec.symbol.includes(filterSymbol))) return false;
      // Trade type
      if (filterTradeType && rec.tradeType !== filterTradeType) return false;
      // DirectionTaken filter
      if (filterDir && rec.directionTaken !== filterDir) return false;
      // Date range filter on datetimeEntry
      if (startDate || endDate) {
        if (!rec.datetimeEntry) return false;
        const dt = new Date(rec.datetimeEntry);
        if (startDate && dt < startDate) return false;
        if (endDate) {
          // Include end date entire day
          const end = new Date(endDate);
          end.setDate(end.getDate() + 1);
          if (dt >= end) return false;
        }
      }
      return true;
    });
    populateAnalysisTable(filtered);
    updateCharts(filtered);
  }

  /**
   * Populate the analysis table with given records.
   */
  function populateAnalysisTable(list) {
    const tbody = document.getElementById('recordsTbody');
    tbody.innerHTML = '';
    list.forEach(rec => {
      const tr = document.createElement('tr');
      const cells = [];
      // Entry datetime
      cells.push(rec.datetimeEntry ? rec.datetimeEntry.replace('T', ' ') : '');
      cells.push(rec.symbol);
      cells.push(rec.timeframe);
      cells.push(rec.tradeType);
      cells.push(rec.directionPlanned);
      cells.push(rec.directionTaken || '');
      cells.push(rec.profit != null ? rec.profit.toFixed(2) : '');
      cells.push(rec.recommendation || '');
      cells.push(rec.hasResult ? '✓' : '');
      cells.forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      // Operation buttons
      const opTd = document.createElement('td');
      const editEntryBtn = document.createElement('button');
      editEntryBtn.textContent = 'エントリー編集';
      editEntryBtn.dataset.id = rec.id;
      editEntryBtn.dataset.action = 'edit-entry';
      const editResultBtn = document.createElement('button');
      editResultBtn.textContent = '結果編集';
      editResultBtn.dataset.id = rec.id;
      editResultBtn.dataset.action = 'edit-result';
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.dataset.id = rec.id;
      deleteBtn.dataset.action = 'delete';
      opTd.appendChild(editEntryBtn);
      opTd.appendChild(editResultBtn);
      opTd.appendChild(deleteBtn);
      tr.appendChild(opTd);
      tbody.appendChild(tr);
    });
  }

  /**
   * Update chart data given filtered records.
   */
  function updateCharts(list) {
    // Sort by entry datetime for cumulative
    const sorted = list.filter(r => r.hasResult && r.profit != null).sort((a, b) => {
      const da = a.datetimeExit || a.datetimeEntry || a.createdAt;
      const db = b.datetimeExit || b.datetimeEntry || b.createdAt;
      return (da || '').localeCompare(db || '');
    });
    // Cumulative profit
    let cum = 0;
    const labels = [];
    const data = [];
    sorted.forEach(rec => {
      const label = rec.datetimeExit ? rec.datetimeExit.replace('T', ' ') : (rec.datetimeEntry || '').replace('T', ' ');
      cum += rec.profit || 0;
      labels.push(label);
      data.push(cum);
    });
    chartCumulative.data.labels = labels;
    chartCumulative.data.datasets[0].data = data;
    chartCumulative.update();
    // Long/short win rate and avg profit
    const dirs = { long: { count: 0, wins: 0, profitSum: 0 }, short: { count: 0, wins: 0, profitSum: 0 } };
    list.forEach(rec => {
      if (!rec.hasResult || rec.profit == null) return;
      if (rec.directionTaken === 'long' || rec.directionTaken === 'short') {
        const d = dirs[rec.directionTaken];
        d.count++;
        if (rec.profit > 0) d.wins++;
        d.profitSum += rec.profit;
      }
    });
    const winRates = [0, 0];
    const avgProfits = [0, 0];
    ['long', 'short'].forEach((dir, idx) => {
      const d = dirs[dir];
      if (d.count > 0) {
        winRates[idx] = (d.wins / d.count) * 100;
        avgProfits[idx] = d.profitSum / d.count;
      } else {
        winRates[idx] = 0;
        avgProfits[idx] = 0;
      }
    });
    chartLongShort.data.datasets[0].data = winRates.map(v => parseFloat(v.toFixed(1)));
    chartLongShort.data.datasets[1].data = avgProfits.map(v => parseFloat(v.toFixed(2)));
    chartLongShort.update();
    // Timeframe win rate
    const tfMap = {};
    list.forEach(rec => {
      if (!rec.hasResult || rec.profit == null || !rec.timeframe) return;
      if (!tfMap[rec.timeframe]) tfMap[rec.timeframe] = { count: 0, wins: 0 };
      const t = tfMap[rec.timeframe];
      t.count++;
      if (rec.profit > 0) t.wins++;
    });
    const tfLabels = Object.keys(tfMap);
    const tfData = tfLabels.map(tf => {
      const t = tfMap[tf];
      return t.count > 0 ? (t.wins / t.count) * 100 : 0;
    });
    chartTimeframe.data.labels = tfLabels;
    chartTimeframe.data.datasets[0].data = tfData.map(v => parseFloat(v.toFixed(1)));
    chartTimeframe.update();
  }

  /**
   * Handle editing of entry from analysis table.
   */
  function handleEditEntry(id) {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    // Populate entry form
    editingEntryId = id;
    document.getElementById('datetimeEntry').value = rec.datetimeEntry || '';
    document.getElementById('symbol').value = rec.symbol || '';
    document.getElementById('timeframe').value = rec.timeframe || '1分';
    document.getElementById('tradeType').value = rec.tradeType || 'real';
    document.getElementById('directionPlanned').value = rec.directionPlanned || 'long';
    document.getElementById('entryPrice').value = rec.entryPrice != null ? rec.entryPrice : '';
    document.getElementById('size').value = rec.size != null ? rec.size : '';
    document.getElementById('feePerUnit').value = rec.feePerUnit != null ? rec.feePerUnit : '';
    document.getElementById('plannedStopPrice').value = rec.plannedStopPrice != null ? rec.plannedStopPrice : '';
    document.getElementById('plannedLimitPrice').value = rec.plannedLimitPrice != null ? rec.plannedLimitPrice : '';
    document.getElementById('cutLossPrice').value = rec.cutLossPrice != null ? rec.cutLossPrice : '';
    document.getElementById('trend_5_20_40').value = rec.trend_5_20_40 || 'Stage1';
    document.getElementById('price_vs_ema200').value = rec.price_vs_ema200 || 'above';
    document.getElementById('ema_band_color').value = rec.ema_band_color || 'dark_green';
    document.getElementById('zone').value = rec.zone || 'pivot';
    document.getElementById('cmf_sign').value = rec.cmf_sign || 'positive';
    document.getElementById('cmf_sma_dir').value = rec.cmf_sma_dir || 'gc';
    document.getElementById('macd_state').value = rec.macd_state || 'post_gc';
    document.getElementById('roc_sign').value = rec.roc_sign || 'positive';
    document.getElementById('roc_sma_dir').value = rec.roc_sma_dir || 'up';
    document.getElementById('rsi_zone').value = rec.rsi_zone || 'over70';
    document.getElementById('marketMemo').value = rec.marketMemo || '';
    document.getElementById('notionUrl').value = rec.notionUrl || '';
    // Image preview
    currentImageData = rec.imageData || null;
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    if (currentImageData) {
      const img = document.createElement('img');
      img.src = currentImageData;
      preview.appendChild(img);
    }
    document.getElementById('imageInput').value = '';
    // Hide old judgement
    document.getElementById('judgeResult').style.display = 'none';
    // Switch to entry tab
    switchTab('entry');
  }

  /**
   * Handle editing of result from analysis table.
   */
  function handleEditResult(id) {
    editingResultId = id;
    // Select record in result select
    const select = document.getElementById('resultSelect');
    // Ensure filter is disabled to show record if necessary
    document.getElementById('filterPending').checked = false;
    populateResultSelect();
    select.value = id;
    loadResultForm(id);
    switchTab('result');
  }

  /**
   * Handle deletion of record.
   */
  function handleDeleteRecord(id) {
    const recIndex = records.findIndex(r => r.id === id);
    if (recIndex < 0) return;
    const confirmed = window.confirm('このトレード記録を削除しますか？（元に戻せません）');
    if (!confirmed) return;
    // Remove record
    records.splice(recIndex, 1);
    saveStorage();
    // If editing same record, clear forms
    if (editingEntryId === id) {
      clearEntryForm();
    }
    if (editingResultId === id) {
      clearResultForm();
    }
    updateAllViews();
  }

  /**
   * Compute recommendation, expected move and confidence based on similarity to historical records.
   */
  function computeRecommendation(entry) {
    // Features list to compare
    const featureKeys = ['trend_5_20_40', 'price_vs_ema200', 'ema_band_color', 'zone', 'cmf_sign', 'cmf_sma_dir', 'macd_state', 'roc_sign', 'roc_sma_dir', 'rsi_zone'];
    // Collect records with results
    const candidates = records.filter(r => r.hasResult && r.directionTaken && r.profit != null);
    // If no history, return flat
    if (candidates.length === 0) {
      return {
        recommendation: 'flat',
        expectedMove: null,
        expectedMoveUnit: '円',
        confidence: 0,
        reason: '過去データがありません。'
      };
    }
    // Compute similarity scores
    let maxScore = 0;
    const scores = candidates.map(rec => {
      let score = 0;
      featureKeys.forEach(key => {
        if (entry[key] != null && rec[key] === entry[key]) {
          score++;
        }
      });
      if (score > maxScore) maxScore = score;
      return { rec, score };
    });
    // Determine threshold: top 50% of max or at least 4 matches
    const threshold = Math.max(maxScore * 0.6, 4);
    const similar = scores.filter(s => s.score >= threshold).map(s => s.rec);
    // If similar set is empty, relax threshold
    let similarSet = similar;
    if (similarSet.length === 0) {
      similarSet = scores.filter(s => s.score >= 3).map(s => s.rec);
    }
    if (similarSet.length === 0) {
      // fallback: all
      similarSet = candidates;
    }
    // Group by direction
    const groups = {};
    similarSet.forEach(rec => {
      const dir = rec.directionTaken;
      if (!groups[dir]) groups[dir] = { count: 0, wins: 0, profits: [], moveSamples: [] };
      const g = groups[dir];
      g.count++;
      if (rec.profit > 0) g.wins++;
      g.profits.push(rec.profit);
      // Estimate move sample based on direction and high/low fields
      if (rec.entryPrice != null) {
        if (dir === 'long' && rec.highDuringTrade != null) {
          g.moveSamples.push(rec.highDuringTrade - rec.entryPrice);
        } else if (dir === 'short' && rec.lowDuringTrade != null) {
          g.moveSamples.push(rec.entryPrice - rec.lowDuringTrade);
        }
      }
    });
    // Determine best direction
    const directions = Object.keys(groups);
    // Compute metrics
    let bestDir = 'flat';
    let bestScore = -Infinity;
    directions.forEach(dir => {
      const g = groups[dir];
      const winRate = g.count > 0 ? g.wins / g.count : 0;
      const avgProfit = g.count > 0 ? g.profits.reduce((a, b) => a + b, 0) / g.count : 0;
      const combinedScore = winRate + Math.sign(avgProfit) * 0.1; // weighting profit slightly
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestDir = dir;
      }
    });
    // Determine expected move
    let expectedMove = null;
    const unit = '円';
    if (bestDir !== 'flat' && groups[bestDir] && groups[bestDir].moveSamples.length > 0) {
      const moves = groups[bestDir].moveSamples;
      const avg = moves.reduce((a, b) => a + b, 0) / moves.length;
      expectedMove = Math.round(avg);
    }
    // Confidence: based on sample size and win rate of best direction
    let confidence = 0;
    if (bestDir !== 'flat') {
      const g = groups[bestDir];
      const winRate = g.count > 0 ? g.wins / g.count : 0;
      // scale sample size (up to 30) and winRate to 0-100
      const sizeFactor = Math.min(1, g.count / 30);
      confidence = (winRate * 70 + sizeFactor * 30) * 100;
      if (confidence > 100) confidence = 100;
    } else {
      confidence = 20;
    }
    // Build reason string
    let reason = '';
    if (similarSet.length > 0) {
      const g = groups[bestDir];
      const winRatePerc = g ? Math.round((g.wins / g.count) * 100) : 0;
      reason += `類似ケース${similarSet.length}件中 ${g ? g.wins : 0}件でプラス（勝率${winRatePerc}%）。`;
      if (expectedMove != null) {
        reason += `平均伸び ${expectedMove}${unit} 程度。`;
      }
    }
    return {
      recommendation: bestDir,
      expectedMove: expectedMove,
      expectedMoveUnit: unit,
      confidence: confidence,
      reason: reason || 'データが少ないため推定が困難です。'
    };
  }

  /**
   * Initialise import/export JSON handlers.
   */
  function initImportExport() {
    document.getElementById('exportBtn').addEventListener('click', () => {
      const data = { version: 1, records: records };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trade_records.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (event) {
        try {
          const data = JSON.parse(event.target.result);
          if (!data || data.version !== 1 || !Array.isArray(data.records)) {
            alert('ファイルの形式が正しくありません。');
            return;
          }
          let added = 0;
          let updated = 0;
          data.records.forEach(rec => {
            const existing = records.find(r => r.id === rec.id);
            if (!existing) {
              records.push(rec);
              added++;
            } else {
              // Compare updatedAt
              const importedUpdated = new Date(rec.updatedAt || 0);
              const currentUpdated = new Date(existing.updatedAt || 0);
              if (importedUpdated > currentUpdated) {
                Object.assign(existing, rec);
                updated++;
              }
            }
          });
          saveStorage();
          updateAllViews();
          alert(`インポート完了: ${added}件追加、${updated}件更新しました。`);
        } catch (err) {
          alert('JSONの読み込みに失敗しました。');
        }
      };
      reader.readAsText(file);
      // Reset file input
      e.target.value = '';
    });
  }

  /**
   * After any change, update all dependent views.
   */
  function updateAllViews() {
    populateResultSelect();
    updateAnalysisView();
  }
})();