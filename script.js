// EdgeScope Trade Judge & Note script

(() => {
  /**
   * Utility functions
   */
  const LS_KEY = 'tradeRecords_v1';
  let records = [];
  let currentEditId = null; // for editing existing entry
  let currentExitEditId = null; // for editing existing exit
  let charts = {};

  // load records from localStorage
  function loadRecords() {
    try {
      const json = localStorage.getItem(LS_KEY);
      if (json) {
        records = JSON.parse(json);
      } else {
        records = [];
      }
    } catch (e) {
      console.error('Failed to parse records', e);
      records = [];
    }
  }

  // save records to localStorage
  function saveRecords() {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  }

  // generate UUID (fallback if crypto.randomUUID unavailable)
  function generateId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // convert file to base64
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Tab switching
   */
  function initTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(sec => sec.classList.remove('active'));
        const section = document.querySelector('#tab-' + tab);
        if (section) section.classList.add('active');
        // if switching to exit or stats, update selects or tables
        if (tab === 'exit') {
          populateExitSelect();
        } else if (tab === 'stats') {
          applyFilters();
        }
      });
    });
  }

  /**
   * Validate required entry fields. Returns {ok:boolean, missing:string[]}
   */
  function validateEntryRequired() {
    const missing = [];
    const requiredIds = ['datetimeEntry', 'entryPrice', 'size', 'feePerUnit'];
    requiredIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el.value) {
        missing.push(id);
        el.classList.add('input-error');
      } else {
        el.classList.remove('input-error');
      }
    });
    return { ok: missing.length === 0, missing };
  }

  /**
   * Gather current entry form values into object
   */
  async function gatherEntryData() {
    const form = {};
    form.datetimeEntry = document.getElementById('datetimeEntry').value;
    form.symbol = document.getElementById('symbol').value;
    form.timeframe = document.getElementById('timeframe').value;
    form.tradeType = document.getElementById('tradeType').value;
    form.directionPlanned = document.getElementById('directionPlanned').value;
    form.entryPrice = parseFloat(document.getElementById('entryPrice').value);
    form.size = parseFloat(document.getElementById('size').value);
    form.feePerUnit = parseFloat(document.getElementById('feePerUnit').value);
    form.plannedStopPrice = parseFloat(document.getElementById('plannedStopPrice').value) || null;
    form.plannedLimitPrice = parseFloat(document.getElementById('plannedLimitPrice').value) || null;
    form.cutLossPrice = parseFloat(document.getElementById('cutLossPrice').value) || null;
    form.prevWave = document.getElementById('prevWave').value;
    form.trend_5_20_40 = document.getElementById('trend_5_20_40').value;
    form.price_vs_ema200 = document.getElementById('price_vs_ema200').value;
    form.ema_band_color = document.getElementById('ema_band_color').value;
    form.zone = document.getElementById('zone').value;
    form.cmf_sign = document.getElementById('cmf_sign').value;
    form.cmf_sma_dir = document.getElementById('cmf_sma_dir').value;
    form.macd_state = document.getElementById('macd_state').value;
    form.roc_sign = document.getElementById('roc_sign').value;
    form.roc_sma_dir = document.getElementById('roc_sma_dir').value;
    form.rsi_zone = document.getElementById('rsi_zone').value;
    form.minWinRate = parseFloat(document.getElementById('minWinRate').value) || 30;
    form.marketMemo = document.getElementById('marketMemo').value;
    form.notionUrl = document.getElementById('notionUrl').value;
    // file
    const imgInput = document.getElementById('imageData');
    if (imgInput.files && imgInput.files[0]) {
      form.imageData = await readFileAsDataURL(imgInput.files[0]);
    } else {
      form.imageData = null;
    }
    return form;
  }

  /**
   * Compute pseudo-case judgement
   */
  function judgeTrade(current) {
    // filter candidates
    const candidates = records.filter(r => r.hasResult && r.symbol === current.symbol && r.timeframe === current.timeframe);
    const features = ['prevWave','trend_5_20_40','price_vs_ema200','ema_band_color','zone','cmf_sign','cmf_sma_dir','macd_state','roc_sign','roc_sma_dir','rsi_zone','directionPlanned'];
    const threshold = Math.ceil(features.length * 0.4); // 40% match threshold
    const pseudoCases = [];
    candidates.forEach(rec => {
      let matchCount = 0;
      features.forEach(f => {
        if (rec[f] && rec[f] === current[f]) matchCount++;
      });
      if (matchCount >= threshold) {
        pseudoCases.push(rec);
      }
    });
    const pseudoCaseCount = pseudoCases.length;
    // compute stats for recommendations
    const directionStats = { long: { count:0, wins:0, profits: [], losses: [], moves: [] }, short: { count:0, wins:0, profits: [], losses: [], moves: [] }, flat: { count:0, wins:0, profits: [], losses: [], moves: [] } };
    pseudoCases.forEach(rec => {
      const dir = rec.directionPlanned || 'flat';
      const stats = directionStats[dir];
      stats.count++;
      const profit = rec.profit || 0;
      if (profit > 0) {
        stats.wins++;
        stats.profits.push(profit);
      } else if (profit < 0) {
        stats.losses.push(profit);
      }
      // expected move
      if (rec.highDuringTrade != null && rec.lowDuringTrade != null && rec.entryPrice != null) {
        let move = 0;
        if (dir === 'long') move = rec.highDuringTrade - rec.entryPrice;
        else if (dir === 'short') move = rec.entryPrice - rec.lowDuringTrade;
        stats.moves.push(move);
      }
    });
    // compute metrics for each direction
    function calcMetrics(stats) {
      const {count,wins,profits,losses,moves} = stats;
      const winRate = count ? (wins / count) * 100 : 0;
      const avgProfit = profits.length ? (profits.reduce((a,b)=>a+b,0)/profits.length) : 0;
      const avgLoss = losses.length ? (losses.reduce((a,b)=>a+b,0)/losses.length) : 0;
      const avgMove = moves.length ? (moves.reduce((a,b)=>a+b,0)/moves.length) : null;
      return {count,winRate,avgProfit,avgLoss,avgMove};
    }
    const metricsLong = calcMetrics(directionStats.long);
    const metricsShort = calcMetrics(directionStats.short);
    const metricsFlat = calcMetrics(directionStats.flat);
    // Determine recommendation: choose direction with highest winRate
    let bestDir = 'flat';
    let bestRate = 0;
    const options = { long: metricsLong.winRate, short: metricsShort.winRate, flat: 0 };
    for (const d of ['long','short']) {
      if (options[d] > bestRate) {
        bestRate = options[d];
        bestDir = d;
      }
    }
    // threshold; if below minWinRate or not enough cases, choose flat
    if (bestRate < current.minWinRate || pseudoCaseCount === 0) {
      bestDir = 'flat';
    }
    // Determine expected move and average profit/loss based on selected direction
    let expectedMove = '—';
    let avgProfit = '—';
    let avgLoss = '—';
    let winRate = 0;
    if (bestDir === 'long') {
      expectedMove = metricsLong.avgMove != null ? metricsLong.avgMove.toFixed(1) : '—';
      avgProfit = metricsLong.avgProfit > 0 ? metricsLong.avgProfit.toFixed(1) : '—';
      avgLoss = metricsLong.avgLoss < 0 ? metricsLong.avgLoss.toFixed(1) : '—';
      winRate = metricsLong.winRate;
    } else if (bestDir === 'short') {
      expectedMove = metricsShort.avgMove != null ? metricsShort.avgMove.toFixed(1) : '—';
      avgProfit = metricsShort.avgProfit > 0 ? metricsShort.avgProfit.toFixed(1) : '—';
      avgLoss = metricsShort.avgLoss < 0 ? metricsShort.avgLoss.toFixed(1) : '—';
      winRate = metricsShort.winRate;
    } else {
      winRate = 0;
    }
    // confidence: combine pseudoCaseCount and winRate
    let confidence = 0;
    if (pseudoCaseCount > 0) {
      const caseFactor = Math.min(1, pseudoCaseCount / 20); // saturate at 20
      const rateFactor = winRate / 100;
      confidence = Math.round((caseFactor * 0.4 + rateFactor * 0.6) * 100);
    }
    return { pseudoCaseCount, recommendation: bestDir, winRate: winRate.toFixed(1), confidence, expectedMove, avgProfit, avgLoss };
  }

  /**
   * Render judgement result card
   */
  function showJudgement(result, symbol) {
    const card = document.getElementById('judgeResult');
    card.innerHTML = '';
    const dirLabel = result.recommendation === 'long' ? 'ロング' : result.recommendation === 'short' ? 'ショート' : 'ノーポジ';
    card.style.display = 'block';
    const html = `
      <h3>判定結果</h3>
      <p>判定銘柄: <strong>${symbol}</strong></p>
      <p>疑似ケース: <strong>${result.pseudoCaseCount}</strong> 件</p>
      <p>推奨方向: <strong>${dirLabel}</strong></p>
      <p>勝率: <strong>${result.winRate}%</strong></p>
      <p>信頼度: <strong>${result.confidence}%</strong></p>
      <div class="confidence-bar" style="width:100%;height:8px;background:#333;border-radius:4px;overflow:hidden;margin:6px 0;">
        <div style="width:${result.confidence}%;background:var(--accent);height:100%;"></div>
      </div>
      <p>推定値幅: <strong>${result.expectedMove}</strong></p>
      <p>平均利益: <strong>${result.avgProfit}</strong></p>
      <p>平均損失: <strong>${result.avgLoss}</strong></p>
    `;
    card.innerHTML = html;
  }

  /**
   * Clear entry form
   */
  function clearEntryForm() {
    currentEditId = null;
    const ids = ['datetimeEntry','entryPrice','size','feePerUnit','plannedStopPrice','plannedLimitPrice','cutLossPrice'];
    ids.forEach(id => document.getElementById(id).value = '');
    document.getElementById('symbol').value = 'nk225mc';
    document.getElementById('timeframe').value = '1時間';
    document.getElementById('tradeType').value = 'real';
    document.getElementById('directionPlanned').value = 'long';
    document.getElementById('prevWave').value = 'HH';
    document.getElementById('trend_5_20_40').value = 'Stage1';
    document.getElementById('price_vs_ema200').value = 'above';
    document.getElementById('ema_band_color').value = '濃緑';
    document.getElementById('zone').value = 'pivot';
    document.getElementById('cmf_sign').value = 'positive';
    document.getElementById('cmf_sma_dir').value = 'gc';
    document.getElementById('macd_state').value = 'post_gc';
    document.getElementById('roc_sign').value = 'positive';
    document.getElementById('roc_sma_dir').value = 'up';
    document.getElementById('rsi_zone').value = '70〜';
    document.getElementById('minWinRate').value = 30;
    document.getElementById('marketMemo').value = '';
    document.getElementById('notionUrl').value = '';
    document.getElementById('imageData').value = '';
    document.getElementById('judgeResult').style.display = 'none';
    document.getElementById('entryError').innerText = '';
  }

  /**
   * Save entry to records
   */
  async function saveEntry(withJudge) {
    const validation = validateEntryRequired();
    if (!validation.ok) {
      document.getElementById('entryError').innerText = '必須：エントリー日時/エントリー価格/枚数/手数料';
      return;
    }
    const data = await gatherEntryData();
    let result;
    if (withJudge) {
      result = judgeTrade(data);
      showJudgement(result, data.symbol);
    }
    // prepare record object
    let rec;
    if (currentEditId) {
      // update existing record
      rec = records.find(r => r.id === currentEditId);
      if (!rec) return;
      Object.assign(rec, data);
      rec.updatedAt = new Date().toISOString();
    } else {
      rec = Object.assign({}, data);
      rec.id = generateId();
      rec.createdAt = new Date().toISOString();
      rec.updatedAt = rec.createdAt;
      rec.hasResult = false;
    }
    if (withJudge) {
      // we only save when explicit '判定してエントリーを保存'
      if (!currentEditId) records.push(rec);
      saveRecords();
      // refresh exit select and stats
      populateExitSelect();
      applyFilters();
      currentEditId = null;
      // message
    }
  }

  /**
   * Populate exit select with open records
   */
  function populateExitSelect() {
    const select = document.getElementById('exitRecordSelect');
    select.innerHTML = '';
    const openRecords = records.filter(r => !r.hasResult);
    if (openRecords.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '保存済みエントリーなし';
      select.appendChild(opt);
    } else {
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '選択してください';
      select.appendChild(defaultOpt);
      openRecords.forEach(rec => {
        const option = document.createElement('option');
        option.value = rec.id;
        const dateStr = new Date(rec.datetimeEntry).toLocaleString();
        option.textContent = `${dateStr} / ${rec.symbol} / ${rec.timeframe}`;
        select.appendChild(option);
      });
    }
    // clear displayed info
    clearExitForm();
  }

  /**
   * Clear exit form fields
   */
  function clearExitForm() {
    currentExitEditId = null;
    document.getElementById('datetimeExit').value = '';
    document.getElementById('exitPrice').value = '';
    document.getElementById('highDuringTrade').value = '';
    document.getElementById('lowDuringTrade').value = '';
    document.getElementById('resultMemo').value = '';
    document.getElementById('exitDirectionDisp').innerText = '';
    document.getElementById('exitSizeDisp').innerText = '';
    document.getElementById('exitFeeDisp').innerText = '';
    document.getElementById('exitProfitDisp').innerText = '';
  }

  /**
   * When record selected in exit tab
   */
  function handleExitSelect() {
    const select = document.getElementById('exitRecordSelect');
    const id = select.value;
    if (!id) {
      clearExitForm();
      return;
    }
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    currentExitEditId = rec.id;
    // display values
    document.getElementById('exitDirectionDisp').innerText = rec.directionPlanned === 'long' ? 'ロング' : rec.directionPlanned === 'short' ? 'ショート' : 'ノーポジ';
    document.getElementById('exitSizeDisp').innerText = rec.size;
    document.getElementById('exitFeeDisp').innerText = rec.feePerUnit;
    // if editing existing exit (should not happen for open), populate fields
    if (rec.hasResult) {
      document.getElementById('datetimeExit').value = rec.datetimeExit || '';
      document.getElementById('exitPrice').value = rec.exitPrice || '';
      document.getElementById('highDuringTrade').value = rec.highDuringTrade || '';
      document.getElementById('lowDuringTrade').value = rec.lowDuringTrade || '';
      document.getElementById('resultMemo').value = rec.resultMemo || '';
      document.getElementById('exitProfitDisp').innerText = rec.profit != null ? rec.profit.toFixed(1) : '';
    }
  }

  /**
   * Save exit result to record
   */
  function saveExitResult() {
    if (!currentExitEditId) return;
    const rec = records.find(r => r.id === currentExitEditId);
    if (!rec) return;
    rec.datetimeExit = document.getElementById('datetimeExit').value;
    rec.exitPrice = parseFloat(document.getElementById('exitPrice').value);
    rec.highDuringTrade = parseFloat(document.getElementById('highDuringTrade').value) || null;
    rec.lowDuringTrade = parseFloat(document.getElementById('lowDuringTrade').value) || null;
    rec.resultMemo = document.getElementById('resultMemo').value;
    // calculate profit
    let baseProfit = 0;
    if (rec.directionPlanned === 'long') {
      baseProfit = (rec.exitPrice - rec.entryPrice - rec.feePerUnit) * rec.size;
    } else if (rec.directionPlanned === 'short') {
      baseProfit = (rec.entryPrice - rec.exitPrice - rec.feePerUnit) * rec.size;
    } else {
      baseProfit = 0;
    }
    let multiplier = 1;
    if (rec.symbol === 'nk225mc') multiplier = 10;
    else if (rec.symbol === 'nk225m') multiplier = 100;
    else if (rec.symbol === 'nk225') multiplier = 1000;
    rec.profit = baseProfit * multiplier;
    // mark result
    rec.hasResult = true;
    rec.updatedAt = new Date().toISOString();
    document.getElementById('exitProfitDisp').innerText = rec.profit.toFixed(1);
    saveRecords();
    // update select and stats
    populateExitSelect();
    applyFilters();
    // reset current edit
    currentExitEditId = null;
  }

  /**
   * Apply filters and update stats
   */
  function applyFilters() {
    // read filters
    const fsymbol = document.getElementById('filterSymbol').value;
    const ftype = document.getElementById('filterType').value;
    const fdir = document.getElementById('filterDirection').value;
    const fresult = document.getElementById('filterResult').value;
    const fstart = document.getElementById('filterStart').value;
    const fend = document.getElementById('filterEnd').value;
    let filtered = records.slice();
    filtered = filtered.filter(r => {
      // symbol
      if (fsymbol !== 'all' && r.symbol !== fsymbol) return false;
      if (ftype !== 'all' && r.tradeType !== ftype) return false;
      if (fdir !== 'all' && r.directionPlanned !== fdir) return false;
      if (fresult === 'with' && !r.hasResult) return false;
      if (fresult === 'without' && r.hasResult) return false;
      if (fstart) {
        if (!r.datetimeEntry || new Date(r.datetimeEntry) < new Date(fstart)) return false;
      }
      if (fend) {
        if (!r.datetimeEntry || new Date(r.datetimeEntry) > new Date(fend)) return false;
      }
      return true;
    });
    renderStatsSummary(filtered);
    renderCharts(filtered);
    renderRecordsTable(filtered);
  }

  /**
   * Render stats summary table
   */
  function renderStatsSummary(list) {
    // compute metrics for overall and directions
    const categories = {
      全体: list,
      ロング: list.filter(r => r.directionPlanned === 'long'),
      ショート: list.filter(r => r.directionPlanned === 'short')
    };
    let html = '<table><thead><tr><th></th><th>件数</th><th>勝率(%)</th><th>平均利益</th><th>平均損失</th></tr></thead><tbody>';
    for (const key in categories) {
      const arr = categories[key];
      const count = arr.length;
      const profits = arr.filter(r => r.hasResult && r.profit > 0).map(r => r.profit);
      const losses = arr.filter(r => r.hasResult && r.profit < 0).map(r => r.profit);
      const wins = arr.filter(r => r.hasResult && r.profit > 0).length;
      const resolved = arr.filter(r => r.hasResult).length;
      const winRate = resolved ? (wins / resolved) * 100 : 0;
      const avgProfit = profits.length ? (profits.reduce((a,b)=>a+b,0) / profits.length) : 0;
      const avgLoss = losses.length ? (losses.reduce((a,b)=>a+b,0) / losses.length) : 0;
      html += `<tr><th>${key}</th><td>${count}</td><td>${winRate.toFixed(1)}</td><td>${avgProfit.toFixed(1)}</td><td>${avgLoss.toFixed(1)}</td></tr>`;
    }
    html += '</tbody></table>';
    document.getElementById('statsSummaryTable').innerHTML = html;
  }

  /**
   * Render charts using Chart.js
   */
  function renderCharts(list) {
    // destroy existing charts
    if (charts.cumulative) charts.cumulative.destroy();
    if (charts.direction) charts.direction.destroy();
    if (charts.timeframe) charts.timeframe.destroy();
    // Chart1: cumulative profit over time
    const sorted = list.filter(r => r.hasResult).sort((a,b) => new Date(a.datetimeEntry) - new Date(b.datetimeEntry));
    let cumSum = 0;
    const labels1 = [];
    const data1 = [];
    sorted.forEach(r => {
      cumSum += r.profit;
      labels1.push(new Date(r.datetimeEntry).toLocaleDateString());
      data1.push(cumSum);
    });
    const ctx1 = document.getElementById('chartCumulative').getContext('2d');
    charts.cumulative = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labels1,
        datasets: [{ label: '累積損益', data: data1, borderColor: '#00ffc8', backgroundColor: 'rgba(0,255,200,0.2)', tension: 0.2 }]
      },
      options: { scales: { x: { ticks: { color: '#e4e9f0' } }, y: { ticks: { color: '#e4e9f0' } } }, plugins: { legend: { labels: { color: '#e4e9f0' } } } }
    });
    // Chart2: direction-specific win rate & average profits/losses
    const dirs = ['ロング','ショート'];
    const winRates = [];
    const avgProfits = [];
    const avgLosses = [];
    dirs.forEach(label => {
      const dirKey = label === 'ロング' ? 'long' : 'short';
      const subset = list.filter(r => r.directionPlanned === dirKey && r.hasResult);
      const wins = subset.filter(r => r.profit > 0).length;
      const total = subset.length;
      const wr = total ? (wins/total)*100 : 0;
      winRates.push(wr);
      const profits = subset.filter(r => r.profit > 0).map(r => r.profit);
      const losses = subset.filter(r => r.profit < 0).map(r => r.profit);
      avgProfits.push(profits.length ? (profits.reduce((a,b)=>a+b,0)/profits.length) : 0);
      avgLosses.push(losses.length ? (losses.reduce((a,b)=>a+b,0)/losses.length) : 0);
    });
    const ctx2 = document.getElementById('chartDirection').getContext('2d');
    charts.direction = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: dirs,
        datasets: [
          { label: '勝率(%)', data: winRates, backgroundColor: '#00ffc8' },
          { label: '平均利益', data: avgProfits, backgroundColor: '#009688' },
          { label: '平均損失', data: avgLosses, backgroundColor: '#ff6b6b' }
        ]
      },
      options: {
        scales: { x: { ticks: { color: '#e4e9f0' } }, y: { ticks: { color: '#e4e9f0' } } },
        plugins: { legend: { labels: { color: '#e4e9f0' } } }
      }
    });
    // Chart3: timeframe-specific win rate
    const frames = [...new Set(list.map(r => r.timeframe))];
    const frameWinRates = frames.map(tf => {
      const subset = list.filter(r => r.timeframe === tf && r.hasResult);
      const total = subset.length;
      const wins = subset.filter(r => r.profit > 0).length;
      return total ? (wins/total)*100 : 0;
    });
    const ctx3 = document.getElementById('chartTimeframe').getContext('2d');
    charts.timeframe = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: frames,
        datasets: [{ label: '勝率(%)', data: frameWinRates, backgroundColor: '#00ffc8' }]
      },
      options: { scales: { x: { ticks: { color: '#e4e9f0' } }, y: { ticks: { color: '#e4e9f0' } } }, plugins: { legend: { labels: { color: '#e4e9f0' } } } }
    });
  }

  /**
   * Render records table
   */
  function renderRecordsTable(list) {
    const wrapper = document.getElementById('recordsTableWrapper');
    let html = '<table><thead><tr>' +
      '<th>日時</th><th>銘柄</th><th>時間足</th><th>方向</th><th>価格</th><th>枚数</th><th>利益</th><th>アクション</th></tr></thead><tbody>';
    list.forEach(rec => {
      const dateStr = rec.datetimeEntry ? new Date(rec.datetimeEntry).toLocaleString() : '';
      const dirStr = rec.directionPlanned === 'long' ? 'ロング' : rec.directionPlanned === 'short' ? 'ショート' : 'ノーポジ';
      const profitStr = rec.hasResult ? rec.profit.toFixed(1) : '';
      html += `<tr><td>${dateStr}</td><td>${rec.symbol}</td><td>${rec.timeframe}</td><td>${dirStr}</td><td>${rec.entryPrice}</td><td>${rec.size}</td><td>${profitStr}</td>`;
      html += '<td>';
      html += `<button data-action="edit-entry" data-id="${rec.id}">エントリー編集</button> `;
      html += `<button data-action="edit-exit" data-id="${rec.id}">結果編集</button> `;
      html += `<button data-action="delete" data-id="${rec.id}">削除</button>`;
      html += '</td></tr>';
    });
    html += '</tbody></table>';
    wrapper.innerHTML = html;
    // Add event listeners for actions
    wrapper.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', handleRecordAction);
    });
  }

  /**
   * Handle record action buttons
   */
  function handleRecordAction(ev) {
    const id = ev.target.getAttribute('data-id');
    const action = ev.target.getAttribute('data-action');
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    if (action === 'delete') {
      if (confirm('削除しますか？')) {
        records = records.filter(r => r.id !== id);
        saveRecords();
        populateExitSelect();
        applyFilters();
      }
    } else if (action === 'edit-entry') {
      // populate entry form with record data and switch tab
      currentEditId = id;
      document.getElementById('datetimeEntry').value = rec.datetimeEntry;
      document.getElementById('symbol').value = rec.symbol;
      document.getElementById('timeframe').value = rec.timeframe;
      document.getElementById('tradeType').value = rec.tradeType;
      document.getElementById('directionPlanned').value = rec.directionPlanned;
      document.getElementById('entryPrice').value = rec.entryPrice;
      document.getElementById('size').value = rec.size;
      document.getElementById('feePerUnit').value = rec.feePerUnit;
      document.getElementById('plannedStopPrice').value = rec.plannedStopPrice ?? '';
      document.getElementById('plannedLimitPrice').value = rec.plannedLimitPrice ?? '';
      document.getElementById('cutLossPrice').value = rec.cutLossPrice ?? '';
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
      document.getElementById('minWinRate').value = rec.minWinRate ?? 30;
      document.getElementById('marketMemo').value = rec.marketMemo || '';
      document.getElementById('notionUrl').value = rec.notionUrl || '';
      document.querySelector('.tab-button[data-tab="entry"]').click();
    } else if (action === 'edit-exit') {
      currentExitEditId = id;
      document.querySelector('.tab-button[data-tab="exit"]').click();
      // set select to record id
      const select = document.getElementById('exitRecordSelect');
      select.value = id;
      handleExitSelect();
    }
  }

  /**
   * Export records to JSON
   */
  function exportJSON() {
    const data = { version: 1, records };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edgeScope_records.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import JSON file and merge records
   */
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj.version !== 1 || !Array.isArray(obj.records)) {
          alert('不正なJSON形式です');
          return;
        }
        let importedCount = 0;
        obj.records.forEach(rec => {
          const existing = records.find(r => r.id === rec.id);
          if (existing) {
            // compare updatedAt
            if (new Date(rec.updatedAt) > new Date(existing.updatedAt)) {
              Object.assign(existing, rec);
            }
          } else {
            records.push(rec);
          }
          importedCount++;
        });
        saveRecords();
        populateExitSelect();
        applyFilters();
        alert(`インポートしました (${importedCount} 件)`);
      } catch (e) {
        alert('JSON読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  }

  /**
   * Initialize event listeners and load data
   */
  function init() {
    loadRecords();
    initTabs();
    // Entry actions
    document.getElementById('btnJudge').addEventListener('click', async () => {
      const validation = validateEntryRequired();
      if (!validation.ok) {
        document.getElementById('entryError').innerText = '必須：エントリー日時/エントリー価格/枚数/手数料';
        return;
      }
      const data = await gatherEntryData();
      const result = judgeTrade(data);
      showJudgement(result, data.symbol);
    });
    document.getElementById('btnJudgeAndSave').addEventListener('click', async () => {
      await saveEntry(true);
    });
    document.getElementById('btnClearEntry').addEventListener('click', () => {
      clearEntryForm();
    });
    // Exit actions
    document.getElementById('exitRecordSelect').addEventListener('change', handleExitSelect);
    document.getElementById('btnSaveExit').addEventListener('click', saveExitResult);
    document.getElementById('btnClearExit').addEventListener('click', () => {
      clearExitForm();
      document.getElementById('exitRecordSelect').value = '';
    });
    // Stats filters
    document.getElementById('btnApplyFilters').addEventListener('click', applyFilters);
    document.getElementById('btnResetFilters').addEventListener('click', () => {
      document.getElementById('filterSymbol').value = 'all';
      document.getElementById('filterType').value = 'all';
      document.getElementById('filterDirection').value = 'all';
      document.getElementById('filterResult').value = 'all';
      document.getElementById('filterStart').value = '';
      document.getElementById('filterEnd').value = '';
      applyFilters();
    });
    // Export & import
    document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
    document.getElementById('importJsonInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importJSON(file);
      // reset input so same file can be imported again later
      e.target.value = '';
    });
    // initial UI refresh
    populateExitSelect();
    applyFilters();
  }

  // run init on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();