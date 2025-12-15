/*
 * Main JavaScript for trade judge and note app.
 * Handles tab switching, form submission, localStorage data management,
 * simple judgement logic, result recording, filtering and chart rendering.
 */

(() => {
  // In-memory representation of trades loaded from localStorage
  let trades = [];
  // Chart instances for analysis; reused to update data
  let cumProfitChart, longShortChart, timeframeChart;

  /**
   * Generate a UUID for trade ID. Use crypto.randomUUID if available,
   * otherwise fallback to custom generation.
   */
  function generateUUID() {
    if (crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: simple random string
    return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Read trades from localStorage. If none, returns empty array.
   */
  function loadTrades() {
    try {
      const stored = localStorage.getItem('trades');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse stored trades:', e);
    }
    return [];
  }

  /**
   * Save trades array to localStorage.
   * @param {Array} arr
   */
  function saveTrades(arr) {
    try {
      localStorage.setItem('trades', JSON.stringify(arr));
    } catch (e) {
      console.error('Failed to save trades:', e);
    }
  }

  /**
   * Tab switching logic: toggles active classes based on button click.
   */
  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active from all buttons and contents
        buttons.forEach(b => b.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        // Activate clicked
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        const content = document.getElementById('tab-' + tab);
        if (content) {
          content.classList.add('active');
        }
        // If analysis tab selected, update charts and table
        if (tab === 'analysis') {
          refreshSymbolFilterOptions();
          applyFilterAndRender();
        } else if (tab === 'result') {
          refreshEntryList();
        }
      });
    });
  }

  /**
   * Simple judgement logic. Given form values, returns an object with
   * predicted win rate, price range and confidence. This is a placeholder
   * algorithm for demonstration purposes.
   */
  function judgeEntry(formData) {
    // Example heuristics: if RSI oversold and MACD bullish, high win rate
    let winRate = 0.5;
    let confidence = 0.5;
    let range = 0;
    // Determine risk range based on difference between entryPrice and stopLoss
    const entry = parseFloat(formData.entryPrice || 0);
    const stop = parseFloat(formData.stopLoss || 0);
    if (!isNaN(entry) && !isNaN(stop) && stop !== 0) {
      range = Math.abs(entry - stop);
    }
    // Adjust winRate and confidence based on indicators
    if (formData.indicatorRSI === 'oversold' && formData.indicatorMACD === 'bullish') {
      winRate += 0.2;
      confidence += 0.3;
    }
    if (formData.indicatorRSI === 'overbought' && formData.indicatorMACD === 'bearish') {
      winRate += 0.2;
      confidence += 0.3;
    }
    if (formData.indicatorBB === 'upper' || formData.indicatorBB === 'lower') {
      confidence += 0.1;
    }
    if (formData.indicatorMA === 'golden') {
      winRate += 0.1;
    } else if (formData.indicatorMA === 'dead') {
      winRate += 0.1;
    }
    // Clamp to valid ranges
    winRate = Math.max(0, Math.min(1, winRate));
    confidence = Math.max(0, Math.min(1, confidence));
    return {
      winRate: winRate,
      range: range,
      confidence: confidence
    };
  }

  /**
   * Create a trade object from the entry form data and judgement result.
   * Handles reading attachments as base64 asynchronously.
   * @param {Object} formData
   * @param {Object} judgeResult
   */
  async function createTrade(formData, judgeResult) {
    const id = generateUUID();
    const now = new Date().toISOString();
    // Function to convert file to base64 string
    const fileToBase64 = file => {
      return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          resolve(reader.result);
        };
        reader.onerror = () => {
          console.error('File read error');
          resolve(null);
        };
        reader.readAsDataURL(file);
      });
    };
    // Read attachments
    const screenshotFile = document.getElementById('entry-screenshot').files[0];
    const audioFile = document.getElementById('entry-audio').files[0];
    const screenshotBase64 = await fileToBase64(screenshotFile);
    const audioBase64 = await fileToBase64(audioFile);
    return {
      id,
      createdAt: now,
      updatedAt: now,
      symbol: formData.symbol,
      timeframe: formData.timeframe,
      direction: formData.direction,
      entryPrice: parseFloat(formData.entryPrice || 0),
      stopLoss: parseFloat(formData.stopLoss || 0),
      takeProfit: parseFloat(formData.takeProfit || 0),
      entryTime: formData.entryTime,
      pattern: formData.pattern,
      indicators: {
        ma: formData.indicatorMA,
        rsi: formData.indicatorRSI,
        macd: formData.indicatorMACD,
        bb: formData.indicatorBB
      },
      memo: formData.memo,
      attachments: {
        screenshot: screenshotBase64,
        audio: audioBase64
      },
      judge: judgeResult,
      // Result fields will be added later
      exitTime: null,
      exitPrice: null,
      profit: null,
      resultMemo: ''
    };
  }

  /**
   * Gather entry form data into an object.
   */
  function getEntryFormData() {
    return {
      symbol: document.getElementById('entry-symbol').value.trim(),
      timeframe: document.getElementById('entry-timeframe').value,
      direction: document.getElementById('entry-direction').value,
      entryPrice: document.getElementById('entry-price').value,
      stopLoss: document.getElementById('entry-stop').value,
      takeProfit: document.getElementById('entry-target').value,
      entryTime: document.getElementById('entry-time').value,
      pattern: document.getElementById('entry-pattern').value.trim(),
      indicatorMA: document.getElementById('indicator-ma').value,
      indicatorRSI: document.getElementById('indicator-rsi').value,
      indicatorMACD: document.getElementById('indicator-macd').value,
      indicatorBB: document.getElementById('indicator-bb').value,
      memo: document.getElementById('entry-memo-text').value.trim()
    };
  }

  /**
   * Display the judgement results in the entry tab.
   * @param {Object} result
   */
  function displayJudgeResult(result) {
    const panel = document.getElementById('judge-result-panel');
    const content = document.getElementById('judge-content');
    content.innerHTML = '';
    const rate = (result.winRate * 100).toFixed(1);
    const confidence = (result.confidence * 100).toFixed(1);
    const range = result.range.toFixed(4);
    const html = `
      <p>予測勝率: <strong>${rate}%</strong></p>
      <p>想定値幅: <strong>${range}</strong></p>
      <p>自信度: <strong>${confidence}%</strong></p>
    `;
    content.innerHTML = html;
    panel.style.display = 'block';
  }

  /**
   * Reset entry form fields.
   */
  function resetEntryForm() {
    document.getElementById('entry-symbol').value = '';
    document.getElementById('entry-timeframe').value = '1m';
    document.getElementById('entry-direction').value = 'long';
    document.getElementById('entry-price').value = '';
    document.getElementById('entry-stop').value = '';
    document.getElementById('entry-target').value = '';
    document.getElementById('entry-time').value = '';
    document.getElementById('entry-pattern').value = '';
    document.getElementById('indicator-ma').value = 'none';
    document.getElementById('indicator-rsi').value = 'normal';
    document.getElementById('indicator-macd').value = 'none';
    document.getElementById('indicator-bb').value = 'center';
    document.getElementById('entry-memo-text').value = '';
    document.getElementById('entry-screenshot').value = '';
    document.getElementById('entry-audio').value = '';
    document.getElementById('judge-result-panel').style.display = 'none';
  }

  /**
   * Render the entry list on the result tab.
   */
  function refreshEntryList() {
    const list = document.getElementById('entry-list');
    const noDataMsg = document.getElementById('no-entry-message');
    list.innerHTML = '';
    if (!trades || trades.length === 0) {
      noDataMsg.style.display = 'block';
      return;
    }
    noDataMsg.style.display = 'none';
    // Sort entries by createdAt descending
    const sorted = trades.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    sorted.forEach((trade, index) => {
      const li = document.createElement('li');
      li.textContent = `${trade.symbol} / ${trade.timeframe} / ${trade.direction} (${new Date(trade.createdAt).toLocaleString()})`;
      li.dataset.id = trade.id;
      // highlight if selected
      if (selectedEntryId === trade.id) {
        li.classList.add('active');
      }
      li.addEventListener('click', () => {
        selectedEntryId = trade.id;
        // Remove active from all li
        list.querySelectorAll('li').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
        showSelectedEntryInfo(trade);
      });
      list.appendChild(li);
    });
  }

  // Currently selected entry id on result page
  let selectedEntryId = null;

  /**
   * Show selected entry information in the result form area.
   * @param {Object} trade
   */
  function showSelectedEntryInfo(trade) {
    const infoEl = document.getElementById('selected-entry-info');
    infoEl.textContent = `${trade.symbol} ${trade.timeframe} ${trade.direction} エントリー価格: ${trade.entryPrice}`;
    // Pre-fill exitPrice with current price as placeholder
    document.getElementById('result-exit-price').value = trade.exitPrice != null ? trade.exitPrice : '';
    document.getElementById('result-exit-time').value = trade.exitTime != null ? trade.exitTime : '';
    document.getElementById('result-notes').value = trade.resultMemo || '';
    // Calculate and display profit if available
    if (trade.profit != null) {
      const profitEl = document.getElementById('profit-display');
      profitEl.textContent = `損益: ${trade.profit.toFixed(2)}`;
    } else {
      document.getElementById('profit-display').textContent = '損益: 0';
    }
  }

  /**
   * Calculate profit based on entry and exit price and direction.
   */
  function calculateProfit(trade, exitPrice) {
    if (trade.direction === 'long') {
      return parseFloat(exitPrice) - parseFloat(trade.entryPrice);
    }
    return parseFloat(trade.entryPrice) - parseFloat(exitPrice);
  }

  /**
   * Update the profit display when exit price changes.
   */
  function setupProfitDisplay() {
    const exitPriceInput = document.getElementById('result-exit-price');
    exitPriceInput.addEventListener('input', () => {
      if (!selectedEntryId) return;
      const trade = trades.find(t => t.id === selectedEntryId);
      if (!trade) return;
      const exitPrice = parseFloat(exitPriceInput.value || 0);
      if (isNaN(exitPrice)) {
        document.getElementById('profit-display').textContent = '損益: 0';
        return;
      }
      const p = calculateProfit(trade, exitPrice);
      document.getElementById('profit-display').textContent = `損益: ${p.toFixed(2)}`;
    });
  }

  /**
   * Refresh options for symbol filter based on existing trades.
   */
  function refreshSymbolFilterOptions() {
    const select = document.getElementById('filter-symbol');
    // Remember previously selected value
    const prev = select.value;
    // Clear existing options except first
    while (select.options.length > 1) {
      select.remove(1);
    }
    const symbols = Array.from(new Set(trades.map(t => t.symbol).filter(s => s)));
    symbols.sort();
    symbols.forEach(symbol => {
      const opt = document.createElement('option');
      opt.value = symbol;
      opt.textContent = symbol;
      select.appendChild(opt);
    });
    // Restore previous value if still exists
    if (prev) {
      select.value = prev;
    }
  }

  /**
   * Apply current filter selections to the trades and render table and charts.
   */
  function applyFilterAndRender() {
    const symbol = document.getElementById('filter-symbol').value;
    const timeframe = document.getElementById('filter-timeframe').value;
    const direction = document.getElementById('filter-direction').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    let filtered = trades.slice();
    if (symbol) {
      filtered = filtered.filter(t => t.symbol === symbol);
    }
    if (timeframe) {
      filtered = filtered.filter(t => t.timeframe === timeframe);
    }
    if (direction) {
      filtered = filtered.filter(t => t.direction === direction);
    }
    if (dateFrom) {
      const df = new Date(dateFrom);
      filtered = filtered.filter(t => new Date(t.createdAt) >= df);
    }
    if (dateTo) {
      const dt = new Date(dateTo);
      // include full day
      dt.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.createdAt) <= dt);
    }
    renderTradeTable(filtered);
    updateCharts(filtered);
  }

  /**
   * Render the trade table body using supplied trades.
   * @param {Array} list
   */
  function renderTradeTable(list) {
    const tbody = document.querySelector('#trade-table tbody');
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.style.textAlign = 'center';
      td.textContent = 'データがありません';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    list.forEach(item => {
      const tr = document.createElement('tr');
      const idTd = document.createElement('td');
      idTd.textContent = item.id.substring(0, 8);
      const dateTd = document.createElement('td');
      dateTd.textContent = new Date(item.createdAt).toLocaleString();
      const symTd = document.createElement('td');
      symTd.textContent = item.symbol;
      const tfTd = document.createElement('td');
      tfTd.textContent = item.timeframe;
      const dirTd = document.createElement('td');
      dirTd.textContent = item.direction === 'long' ? 'ロング' : 'ショート';
      const resTd = document.createElement('td');
      if (item.profit != null) {
        resTd.textContent = item.profit >= 0 ? '勝ち' : '負け';
      } else {
        resTd.textContent = '未決済';
      }
      const profitTd = document.createElement('td');
      profitTd.textContent = item.profit != null ? item.profit.toFixed(2) : '-';
      tr.appendChild(idTd);
      tr.appendChild(dateTd);
      tr.appendChild(symTd);
      tr.appendChild(tfTd);
      tr.appendChild(dirTd);
      tr.appendChild(resTd);
      tr.appendChild(profitTd);
      tbody.appendChild(tr);
    });
  }

  /**
   * Create or update charts based on filtered trades.
   * @param {Array} list
   */
  function updateCharts(list) {
    // Data for cumulative profit chart
    const sorted = list.slice().filter(t => t.profit != null).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const labels1 = sorted.map(t => new Date(t.createdAt).toLocaleDateString());
    let cumulative = 0;
    const data1 = sorted.map(t => {
      cumulative += t.profit;
      return cumulative;
    });
    // Long/Short win rate and average profit
    const longTrades = list.filter(t => t.direction === 'long' && t.profit != null);
    const shortTrades = list.filter(t => t.direction === 'short' && t.profit != null);
    function calcStats(arr) {
      const count = arr.length;
      if (count === 0) return { winRate: 0, avg: 0 };
      const wins = arr.filter(t => t.profit > 0).length;
      const avg = arr.reduce((acc, t) => acc + t.profit, 0) / count;
      return { winRate: wins / count * 100, avg: avg };
    }
    const longStats = calcStats(longTrades);
    const shortStats = calcStats(shortTrades);
    // Timeframe win rate
    const timeframes = {};
    list.forEach(t => {
      if (t.profit == null) return;
      if (!timeframes[t.timeframe]) timeframes[t.timeframe] = { total: 0, wins: 0 };
      timeframes[t.timeframe].total += 1;
      if (t.profit > 0) timeframes[t.timeframe].wins += 1;
    });
    const tfLabels = Object.keys(timeframes);
    const tfRates = tfLabels.map(tf => {
      const obj = timeframes[tf];
      return obj.total === 0 ? 0 : (obj.wins / obj.total * 100);
    });
    // Render or update cumulative profit chart
    const ctx1 = document.getElementById('cum-profit-chart').getContext('2d');
    if (!cumProfitChart) {
      cumProfitChart = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: labels1,
          datasets: [{
            label: '累積損益',
            data: data1,
            borderColor: '#00ffc8',
            backgroundColor: 'rgba(0, 255, 200, 0.1)',
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { display: true },
            y: { display: true, beginAtZero: true }
          }
        }
      });
    } else {
      cumProfitChart.data.labels = labels1;
      cumProfitChart.data.datasets[0].data = data1;
      cumProfitChart.update();
    }
    // Long/Short chart
    const ctx2 = document.getElementById('long-short-chart').getContext('2d');
    if (!longShortChart) {
      longShortChart = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: ['ロング', 'ショート'],
          datasets: [
            {
              label: '勝率 (%)',
              data: [longStats.winRate.toFixed(1), shortStats.winRate.toFixed(1)],
              backgroundColor: ['#00ffc8', '#00ffc8'],
              yAxisID: 'y1'
            },
            {
              label: '平均損益',
              data: [longStats.avg.toFixed(2), shortStats.avg.toFixed(2)],
              backgroundColor: ['#1f7a8c', '#1f7a8c'],
              yAxisID: 'y'
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              ticks: { color: '#00ffc8' },
              title: { display: true, text: '平均損益' }
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              ticks: { color: '#1f7a8c' },
              grid: { drawOnChartArea: false },
              title: { display: true, text: '勝率 (%)' },
              suggestedMax: 100
            }
          },
          plugins: {
            legend: { display: true }
          }
        }
      });
    } else {
      longShortChart.data.datasets[0].data = [longStats.winRate.toFixed(1), shortStats.winRate.toFixed(1)];
      longShortChart.data.datasets[1].data = [longStats.avg.toFixed(2), shortStats.avg.toFixed(2)];
      longShortChart.update();
    }
    // Timeframe chart
    const ctx3 = document.getElementById('timeframe-chart').getContext('2d');
    if (!timeframeChart) {
      timeframeChart = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: tfLabels,
          datasets: [{
            label: '勝率 (%)',
            data: tfRates,
            backgroundColor: '#00ffc8'
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: 100
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    } else {
      timeframeChart.data.labels = tfLabels;
      timeframeChart.data.datasets[0].data = tfRates;
      timeframeChart.update();
    }
  }

  /**
   * Export current trades to JSON file for download.
   */
  function exportJson() {
    const dataStr = JSON.stringify(trades, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trades.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import trades from selected JSON file, merging with existing trades.
   */
  function importJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          imported.forEach(item => {
            // Basic validation
            if (!item.id) return;
            const existing = trades.find(t => t.id === item.id);
            if (!existing) {
              trades.push(item);
            } else {
              const importedUpdated = new Date(item.updatedAt || item.createdAt);
              const existingUpdated = new Date(existing.updatedAt || existing.createdAt);
              if (importedUpdated > existingUpdated) {
                // Replace existing
                const index = trades.findIndex(t => t.id === item.id);
                trades[index] = item;
              }
            }
          });
          saveTrades(trades);
          refreshEntryList();
          refreshSymbolFilterOptions();
          applyFilterAndRender();
        }
      } catch (err) {
        console.error('Failed to import JSON:', err);
      }
    };
    reader.readAsText(file);
  }

  /**
   * Initialize event listeners and load existing data.
   */
  function init() {
    trades = loadTrades();
    setupTabs();
    setupProfitDisplay();
    document.getElementById('judge-only').addEventListener('click', async () => {
      const formData = getEntryFormData();
      const result = judgeEntry(formData);
      displayJudgeResult(result);
    });
    document.getElementById('judge-and-save').addEventListener('click', async () => {
      const formData = getEntryFormData();
      const result = judgeEntry(formData);
      displayJudgeResult(result);
      // Create trade object and save
      const trade = await createTrade(formData, result);
      trades.push(trade);
      saveTrades(trades);
      resetEntryForm();
      refreshSymbolFilterOptions();
    });
    document.getElementById('save-result').addEventListener('click', () => {
      // Save result for the selected entry. Exit time is optional; if missing,
      // current timestamp will be used. Exit price must be a valid number.
      if (!selectedEntryId) return;
      const trade = trades.find(t => t.id === selectedEntryId);
      if (!trade) return;
      const exitTimeInput = document.getElementById('result-exit-time').value;
      const exitPriceVal = document.getElementById('result-exit-price').value;
      const exitPrice = parseFloat(exitPriceVal);
      const notes = document.getElementById('result-notes').value;
      if (isNaN(exitPrice)) {
        alert('決済価格を入力してください');
        return;
      }
      const profit = calculateProfit(trade, exitPrice);
      // If exitTime not provided, use current date/time
      trade.exitTime = exitTimeInput && exitTimeInput !== '' ? exitTimeInput : new Date().toISOString();
      trade.exitPrice = exitPrice;
      trade.profit = profit;
      trade.resultMemo = notes;
      trade.updatedAt = new Date().toISOString();
      saveTrades(trades);
      refreshEntryList();
      refreshSymbolFilterOptions();
      applyFilterAndRender();
      // Reset selected entry details
      selectedEntryId = null;
      document.getElementById('selected-entry-info').textContent = '';
      document.getElementById('result-exit-time').value = '';
      document.getElementById('result-exit-price').value = '';
      document.getElementById('result-notes').value = '';
      document.getElementById('profit-display').textContent = '損益: 0';
    });
    document.getElementById('apply-filter').addEventListener('click', () => {
      applyFilterAndRender();
    });
    document.getElementById('export-json').addEventListener('click', exportJson);
    document.getElementById('import-json').addEventListener('change', importJson);
    // Populate filters and table on initial load
    refreshSymbolFilterOptions();
    applyFilterAndRender();
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);
})();