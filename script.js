/*
 * script.js
 *
 * このファイルはフロントエンドのみで動作するトレード判定・ノートアプリのロジックを実装します。
 */

(() => {
  // 定数
  const STORAGE_KEY = 'tradeRecords_v1';
  // 現在編集中のレコードID
  let editingEntryId = null;
  let editingResultId = null;
  // 画像データ一時格納
  let entryImageData = null;
  // Chart.js インスタンス保持
  let chartCumulative = null;
  let chartDirection = null;
  let chartTimeframe = null;

  /**
   * localStorage からレコード一覧を取得
   * @returns {Array}
   */
  function loadRecords() {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    try {
      const records = JSON.parse(json);
      if (Array.isArray(records)) return records;
      return [];
    } catch (err) {
      console.error('Failed to parse localStorage data', err);
      return [];
    }
  }

  /**
   * レコード配列を保存
   * @param {Array} records
   */
  function saveRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.error('Failed to save records', err);
    }
  }

  /**
   * UUID生成
   * @returns {string}
   */
  function generateId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).substring(2)
    );
  }

  /**
   * 日付を日本ローカル形式で表示
   * @param {string|Date} iso
   * @returns {string}
   */
  function formatDate(iso) {
    if (!iso) return '';
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  }

  /**
   * Profit計算
   * @param {Object} record
   * @returns {number}
   */
  function calculateProfit(record) {
    const direction = record.directionTaken;
    const entryPrice = parseFloat(record.entryPrice);
    const exitPrice = parseFloat(record.exitPrice);
    const fee = parseFloat(record.feePerUnit) || 0;
    const size = parseFloat(record.size) || 0;
    if (!direction || isNaN(entryPrice) || isNaN(exitPrice) || isNaN(size)) return 0;
    let profit = 0;
    if (direction === 'long') {
      profit = (exitPrice - entryPrice - fee) * size;
    } else if (direction === 'short') {
      profit = (entryPrice - exitPrice - fee) * size;
    } else {
      profit = 0;
    }
    return profit;
  }

  /**
   * 類似ケースを用いた判定ロジック
   * @param {Object} newRecord 入力されたエントリー情報
   * @param {Array} records 過去レコード
   */
  function computeJudgement(newRecord, records) {
    // 対象指標キー
    const keys = [
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
    // 過去の結果ありレコードのみ考慮
    const completed = records.filter((r) => r.hasResult);
    if (completed.length === 0) {
      return {
        recommendation: 'flat',
        expectedMove: 0,
        expectedMoveUnit: '円',
        confidence: 0,
        reason: '過去データがありません'
      };
    }
    // 方向別集計
    const stats = {
      long: { weight: 0, wins: 0, profitSum: 0, moveSum: 0 },
      short: { weight: 0, wins: 0, profitSum: 0, moveSum: 0 },
      flat: { weight: 0, wins: 0, profitSum: 0, moveSum: 0 }
    };
    let totalWeight = 0;
    completed.forEach((r) => {
      // 類似度計算：一致する指標数/総数
      let matches = 0;
      keys.forEach((k) => {
        if (r[k] && newRecord[k] && r[k] === newRecord[k]) matches++;
      });
      const weight = matches / keys.length;
      if (weight === 0) return;
      totalWeight += weight;
      const dir = r.directionTaken || 'flat';
      const st = stats[dir];
      st.weight += weight;
      const profit = calculateProfit(r);
      if (profit > 0) st.wins += weight;
      st.profitSum += profit * weight;
      // 最大伸びの推定値：longなら高値-entryPrice、shortならentryPrice-低値
      let move = 0;
      const entryPrice = parseFloat(r.entryPrice);
      const high = parseFloat(r.highDuringTrade);
      const low = parseFloat(r.lowDuringTrade);
      if (dir === 'long' && !isNaN(high) && !isNaN(entryPrice)) {
        move = high - entryPrice;
      } else if (dir === 'short' && !isNaN(low) && !isNaN(entryPrice)) {
        move = entryPrice - low;
      }
      st.moveSum += move * weight;
    });
    // 方向ごとのスコア計算
    const results = {};
    ['long', 'short', 'flat'].forEach((dir) => {
      const st = stats[dir];
      if (st.weight > 0) {
        const winRate = st.wins / st.weight; // 0-1
        const avgProfit = st.profitSum / st.weight;
        const avgMove = st.moveSum / st.weight;
        results[dir] = { winRate, avgProfit, avgMove, count: st.weight };
      } else {
        results[dir] = { winRate: 0, avgProfit: 0, avgMove: 0, count: 0 };
      }
    });
    // 推奨方向は平均損益が最も高いもの。ただし閾値以下ならflat
    let recommendation = 'flat';
    let bestProfit = -Infinity;
    ['long', 'short', 'flat'].forEach((dir) => {
      const avgProfit = results[dir].avgProfit;
      if (avgProfit > bestProfit) {
        bestProfit = avgProfit;
        recommendation = dir;
      }
    });
    // expectedMove: 推奨方向の平均伸び
    const expectedMove = Math.max(0, results[recommendation].avgMove || 0);
    // 信頼度: サンプル数の比率 + 勝率
    const sampleCount = results[recommendation].count;
    const winRate = results[recommendation].winRate;
    let confidence = 0;
    // サンプルが多いほど50点満点、勝率は50点満点
    const sampleFactor = Math.min(sampleCount, 20) / 20; // 0〜1
    confidence = Math.round((sampleFactor * 50 + winRate * 50));
    // 理由テキスト生成
    const winPct = Math.round(winRate * 100);
    const avgProfit = results[recommendation].avgProfit.toFixed(2);
    const reason = `類似ケースは${sampleCount.toFixed(1)}件、勝率は${winPct}%、平均損益は${avgProfit}円と算出されました。`;
    return {
      recommendation,
      expectedMove: Math.round(expectedMove),
      expectedMoveUnit: '円',
      confidence,
      reason
    };
  }

  /**
   * 入力フォームからレコードオブジェクトを構築（エントリー情報のみ）
   * @returns {Object}
   */
  function collectEntryForm() {
    return {
      datetimeEntry: document.getElementById('entry-datetime').value || null,
      symbol: document.getElementById('entry-symbol').value || '',
      timeframe: document.getElementById('entry-timeframe').value,
      tradeType: document.getElementById('entry-tradeType').value,
      directionPlanned: document.getElementById('entry-directionPlanned').value,
      entryPrice: parseFloat(document.getElementById('entry-price').value) || null,
      size: parseFloat(document.getElementById('entry-size').value) || null,
      feePerUnit: parseFloat(document.getElementById('entry-feePerUnit').value) || null,
      plannedStopPrice: parseFloat(document.getElementById('entry-plannedStopPrice').value) || null,
      plannedLimitPrice: parseFloat(document.getElementById('entry-plannedLimitPrice').value) || null,
      cutLossPrice: parseFloat(document.getElementById('entry-cutLossPrice').value) || null,
      trend_5_20_40: document.getElementById('entry-trend').value,
      price_vs_ema200: document.getElementById('entry-priceVsEma200').value,
      ema_band_color: document.getElementById('entry-emaBand').value,
      zone: document.getElementById('entry-zone').value,
      cmf_sign: document.getElementById('entry-cmfSign').value,
      cmf_sma_dir: document.getElementById('entry-cmfSmaDir').value,
      macd_state: document.getElementById('entry-macdState').value,
      roc_sign: document.getElementById('entry-rocSign').value,
      roc_sma_dir: document.getElementById('entry-rocSmaDir').value,
      rsi_zone: document.getElementById('entry-rsiZone').value,
      marketMemo: document.getElementById('entry-marketMemo').value,
      notionUrl: document.getElementById('entry-notionUrl').value,
      imageData: entryImageData || null
    };
  }

  /**
   * エントリー入力フォームをクリア
   */
  function clearEntryForm() {
    document.getElementById('entry-datetime').value = '';
    document.getElementById('entry-symbol').value = 'nk225mc';
    document.getElementById('entry-timeframe').value = '1分';
    document.getElementById('entry-tradeType').value = 'real';
    document.getElementById('entry-directionPlanned').value = 'long';
    document.getElementById('entry-price').value = '';
    document.getElementById('entry-size').value = '';
    document.getElementById('entry-feePerUnit').value = '';
    document.getElementById('entry-plannedStopPrice').value = '';
    document.getElementById('entry-plannedLimitPrice').value = '';
    document.getElementById('entry-cutLossPrice').value = '';
    document.getElementById('entry-trend').value = 'Stage1';
    document.getElementById('entry-priceVsEma200').value = 'above';
    document.getElementById('entry-emaBand').value = 'dark_green';
    document.getElementById('entry-zone').value = 'pivot';
    document.getElementById('entry-cmfSign').value = 'positive';
    document.getElementById('entry-cmfSmaDir').value = 'gc';
    document.getElementById('entry-macdState').value = 'post_gc';
    document.getElementById('entry-rocSign').value = 'positive';
    document.getElementById('entry-rocSmaDir').value = 'up';
    document.getElementById('entry-rsiZone').value = 'over70';
    document.getElementById('entry-marketMemo').value = '';
    document.getElementById('entry-notionUrl').value = '';
    document.getElementById('entry-imageData').value = '';
    document.getElementById('entry-imagePreview').innerHTML = '';
    entryImageData = null;
    editingEntryId = null;
    document.getElementById('judgeResult').style.display = 'none';
  }

  /**
   * 指定レコードのエントリー情報をフォームに読み込む
   * @param {Object} record
   */
  function loadEntryForm(record) {
    editingEntryId = record.id;
    document.getElementById('entry-datetime').value = record.datetimeEntry || '';
    document.getElementById('entry-symbol').value = record.symbol || 'nk225mc';
    document.getElementById('entry-timeframe').value = record.timeframe;
    document.getElementById('entry-tradeType').value = record.tradeType;
    document.getElementById('entry-directionPlanned').value = record.directionPlanned;
    document.getElementById('entry-price').value = record.entryPrice ?? '';
    document.getElementById('entry-size').value = record.size ?? '';
    document.getElementById('entry-feePerUnit').value = record.feePerUnit ?? '';
    document.getElementById('entry-plannedStopPrice').value = record.plannedStopPrice ?? '';
    document.getElementById('entry-plannedLimitPrice').value = record.plannedLimitPrice ?? '';
    document.getElementById('entry-cutLossPrice').value = record.cutLossPrice ?? '';
    document.getElementById('entry-trend').value = record.trend_5_20_40;
    document.getElementById('entry-priceVsEma200').value = record.price_vs_ema200;
    document.getElementById('entry-emaBand').value = record.ema_band_color;
    document.getElementById('entry-zone').value = record.zone;
    document.getElementById('entry-cmfSign').value = record.cmf_sign;
    document.getElementById('entry-cmfSmaDir').value = record.cmf_sma_dir;
    document.getElementById('entry-macdState').value = record.macd_state;
    document.getElementById('entry-rocSign').value = record.roc_sign;
    document.getElementById('entry-rocSmaDir').value = record.roc_sma_dir;
    document.getElementById('entry-rsiZone').value = record.rsi_zone;
    document.getElementById('entry-marketMemo').value = record.marketMemo || '';
    document.getElementById('entry-notionUrl').value = record.notionUrl || '';
    if (record.imageData) {
      document.getElementById('entry-imagePreview').innerHTML = `<img src="${record.imageData}" alt="preview" style="max-width:100%; max-height:100px;">`;
      entryImageData = record.imageData;
    } else {
      document.getElementById('entry-imagePreview').innerHTML = '';
      entryImageData = null;
    }
    document.getElementById('judgeResult').style.display = 'none';
  }

  /**
   * 保存済みレコードを結果フォームに読み込む
   * @param {Object} record
   */
  function loadResultForm(record) {
    editingResultId = record.id;
    document.getElementById('result-exitDatetime').value = record.datetimeExit || '';
    document.getElementById('result-exitPrice').value = record.exitPrice ?? '';
    document.getElementById('result-directionTaken').value = record.directionTaken || 'long';
    document.getElementById('result-size').value = record.size ?? '';
    document.getElementById('result-feePerUnit').value = record.feePerUnit ?? '';
    document.getElementById('result-highDuringTrade').value = record.highDuringTrade ?? '';
    document.getElementById('result-lowDuringTrade').value = record.lowDuringTrade ?? '';
    document.getElementById('result-memo').value = record.resultMemo || '';
    // Update profit display
    const profit = record.hasResult ? calculateProfit(record) : 0;
    document.getElementById('result-profit-display').textContent = profit.toFixed(2);
  }

  /**
   * タブ切り替え
   */
  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tabName = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach((sec) => {
          if (sec.id === 'tab-' + tabName) {
            sec.classList.add('active');
          } else {
            sec.classList.remove('active');
          }
        });
      });
    });
  }

  /**
   * エントリー判定ボタン処理
   * @param {boolean} save 保存する場合はtrue
   */
  function handleJudge(save) {
    const records = loadRecords();
    const entryData = collectEntryForm();
    const judge = computeJudgement(entryData, records);
    displayJudgeResult(judge);
    if (save) {
      // 保存モード
      let rec;
      if (editingEntryId) {
        // 既存レコード更新
        const idx = records.findIndex((r) => r.id === editingEntryId);
        if (idx >= 0) {
          rec = records[idx];
          // 更新対象の基本情報を上書き
          Object.assign(rec, entryData);
          rec.updatedAt = new Date().toISOString();
          rec.recommendation = judge.recommendation;
          rec.expectedMove = judge.expectedMove;
          rec.expectedMoveUnit = judge.expectedMoveUnit;
          rec.confidence = judge.confidence;
          rec.reason = judge.reason;
          records[idx] = rec;
        }
      } else {
        // 新規レコード作成
        rec = {
          id: generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hasResult: false,
          datetimeExit: null,
          exitPrice: null,
          directionTaken: null,
          highDuringTrade: null,
          lowDuringTrade: null,
          profit: null,
          resultMemo: ''
        };
        Object.assign(rec, entryData);
        // 判定結果を記録
        rec.recommendation = judge.recommendation;
        rec.expectedMove = judge.expectedMove;
        rec.expectedMoveUnit = judge.expectedMoveUnit;
        rec.confidence = judge.confidence;
        rec.reason = judge.reason;
        records.push(rec);
        editingEntryId = rec.id;
      }
      saveRecords(records);
      populateResultSelect();
      updateAnalysis();
      // 保存完了後メッセージ表示
      alert('エントリーを保存しました');
    }
  }

  /**
   * 判定結果表示
   * @param {Object} result
   */
  function displayJudgeResult(result) {
    const container = document.getElementById('judgeResult');
    container.innerHTML = '';
    // バッジ
    const badge = document.createElement('span');
    badge.classList.add('badge', result.recommendation);
    let label;
    switch (result.recommendation) {
      case 'long':
        label = 'ロング推奨';
        break;
      case 'short':
        label = 'ショート推奨';
        break;
      default:
        label = 'ノーポジ推奨';
    }
    badge.textContent = label;
    container.appendChild(badge);
    // 想定値幅と信頼度
    const moveP = document.createElement('p');
    moveP.textContent = `想定値幅：${result.expectedMove}${result.expectedMoveUnit}`;
    container.appendChild(moveP);
    const confP = document.createElement('p');
    confP.textContent = `信頼度：${result.confidence}%`;
    container.appendChild(confP);
    // 信頼度バー
    const bar = document.createElement('div');
    bar.classList.add('confidence-bar');
    const inner = document.createElement('div');
    inner.classList.add('confidence-bar-inner');
    inner.style.width = result.confidence + '%';
    bar.appendChild(inner);
    container.appendChild(bar);
    // 理由
    const reasonP = document.createElement('p');
    reasonP.textContent = result.reason;
    container.appendChild(reasonP);
    container.style.display = 'block';
  }

  /**
   * 結果選択リストを更新
   */
  function populateResultSelect() {
    const select = document.getElementById('result-record-select');
    const records = loadRecords();
    // store current selected id
    const prev = select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '選択してください';
    select.appendChild(placeholder);
    records.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      const status = r.hasResult ? '済' : '未';
      opt.textContent = `${formatDate(r.datetimeEntry || r.createdAt)} ${r.symbol} (${status})`;
      select.appendChild(opt);
    });
    // restore previous selection if exists
    if (prev) {
      select.value = prev;
    }
  }

  /**
   * 結果フォームの入力フィールドで損益を更新
   */
  function updateProfitDisplay() {
    const records = loadRecords();
    const record = records.find((r) => r.id === editingResultId);
    if (!record) return;
    // 更新対象だけフィールドの値で一時的にprofit計算
    const temp = Object.assign({}, record);
    temp.exitPrice = parseFloat(document.getElementById('result-exitPrice').value) || null;
    temp.directionTaken = document.getElementById('result-directionTaken').value;
    temp.size = parseFloat(document.getElementById('result-size').value) || null;
    temp.feePerUnit = parseFloat(document.getElementById('result-feePerUnit').value) || null;
    const p = calculateProfit(temp);
    document.getElementById('result-profit-display').textContent = p.toFixed(2);
  }

  /**
   * 結果保存ボタン処理
   */
  function handleSaveResult() {
    if (!editingResultId) {
      alert('編集対象が選択されていません');
      return;
    }
    const records = loadRecords();
    const idx = records.findIndex((r) => r.id === editingResultId);
    if (idx < 0) {
      alert('対象レコードが見つかりません');
      return;
    }
    const r = records[idx];
    // update result fields
    r.datetimeExit = document.getElementById('result-exitDatetime').value || null;
    r.exitPrice = parseFloat(document.getElementById('result-exitPrice').value) || null;
    r.directionTaken = document.getElementById('result-directionTaken').value;
    r.size = parseFloat(document.getElementById('result-size').value) || null;
    r.feePerUnit = parseFloat(document.getElementById('result-feePerUnit').value) || null;
    r.highDuringTrade = parseFloat(document.getElementById('result-highDuringTrade').value) || null;
    r.lowDuringTrade = parseFloat(document.getElementById('result-lowDuringTrade').value) || null;
    r.resultMemo = document.getElementById('result-memo').value;
    r.profit = calculateProfit(r);
    r.hasResult = true;
    r.updatedAt = new Date().toISOString();
    records[idx] = r;
    saveRecords(records);
    document.getElementById('result-profit-display').textContent = r.profit.toFixed(2);
    populateResultSelect();
    updateAnalysis();
    alert('結果を保存しました');
  }

  /**
   * 分析タブのフィルタ条件に基づいてレコードを取得
   * @returns {Array}
   */
  function getFilteredRecords() {
    const records = loadRecords();
    const symbolFilter = document.getElementById('filter-symbol').value.trim();
    const tradeTypeFilter = document.getElementById('filter-tradeType').value;
    const directionFilter = document.getElementById('filter-directionTaken').value;
    const startDate = document.getElementById('filter-startDate').value;
    const endDate = document.getElementById('filter-endDate').value;
    return records.filter((r) => {
      // Symbol filter (if substring matches)
      if (symbolFilter) {
        if (!r.symbol || !r.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) {
          return false;
        }
      }
      // Trade type filter
      if (tradeTypeFilter !== 'all' && r.tradeType !== tradeTypeFilter) {
        return false;
      }
      // Direction filter
      const dir = r.directionTaken || 'none';
      if (directionFilter !== 'all') {
        if (!r.hasResult) {
          return false;
        }
        if (dir !== directionFilter) {
          return false;
        }
      }
      // Date filters (use entry datetime)
      if (startDate) {
        const sd = new Date(startDate);
        const d = r.datetimeEntry ? new Date(r.datetimeEntry) : new Date(r.createdAt);
        if (d < sd) {
          return false;
        }
      }
      if (endDate) {
        const ed = new Date(endDate);
        // inclusive: set to end of day
        ed.setHours(23, 59, 59, 999);
        const d = r.datetimeEntry ? new Date(r.datetimeEntry) : new Date(r.createdAt);
        if (d > ed) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * 分析タブのテーブルを描画
   */
  function renderRecordsTable() {
    const tbody = document.getElementById('recordsTable').querySelector('tbody');
    tbody.innerHTML = '';
    const records = getFilteredRecords();
    // Sort by createdAt descending
    records.sort((a, b) => {
      const da = new Date(a.datetimeEntry || a.createdAt);
      const db = new Date(b.datetimeEntry || b.createdAt);
      return db - da;
    });
    records.forEach((r) => {
      const tr = document.createElement('tr');
      const created = r.datetimeEntry || r.createdAt;
      // 実際に取った方向を日本語表記
      let dirLabel = '-';
      if (r.hasResult && r.directionTaken) {
        if (r.directionTaken === 'long') dirLabel = 'ロング';
        else if (r.directionTaken === 'short') dirLabel = 'ショート';
        else if (r.directionTaken === 'flat') dirLabel = 'ノーポジ';
      }
      const profitDisplay = r.hasResult ? (r.profit ?? calculateProfit(r)).toFixed(2) : '-';
      // 推奨方向を日本語表記
      let recommendation;
      if (r.recommendation === 'long') recommendation = 'ロング';
      else if (r.recommendation === 'short') recommendation = 'ショート';
      else if (r.recommendation === 'flat') recommendation = 'ノーポジ';
      else recommendation = '-';
      const hasResultText = r.hasResult ? '済' : '未';
      tr.innerHTML = `
        <td>${formatDate(created)}</td>
        <td>${r.symbol}</td>
        <td>${r.timeframe}</td>
        <td>${r.tradeType}</td>
        <td>${dirLabel}</td>
        <td>${profitDisplay}</td>
        <td>${recommendation}</td>
        <td>${hasResultText}</td>
        <td>
          <button class="edit-btn entry-edit" data-id="${r.id}">エントリ編集</button>
          <button class="edit-btn result-edit" data-id="${r.id}">結果編集</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * グラフ描画
   */
  function renderCharts() {
    const records = getFilteredRecords().filter((r) => r.hasResult);
    // ----- Cumulative Profit -----
    // sort by exit date ascending
    const sorted = records
      .slice()
      .sort((a, b) => {
        const da = new Date(a.datetimeExit || a.updatedAt);
        const db = new Date(b.datetimeExit || b.updatedAt);
        return da - db;
      });
    let cumSum = 0;
    const labelsC = [];
    const dataC = [];
    sorted.forEach((r) => {
      const profit = r.profit != null ? r.profit : calculateProfit(r);
      cumSum += profit;
      labelsC.push(formatDate(r.datetimeExit || r.updatedAt));
      dataC.push(cumSum);
    });
    // chart destroy if exists
    if (chartCumulative) chartCumulative.destroy();
    const ctx1 = document.getElementById('chartCumulative').getContext('2d');
    chartCumulative = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labelsC,
        datasets: [
          {
            label: '累積損益',
            data: dataC,
            borderColor: '#00ffc8',
            backgroundColor: 'rgba(0,255,200,0.2)',
            fill: true,
            tension: 0.1
          }
        ]
      },
      options: {
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
        },
        plugins: {
          legend: {
            labels: { color: '#e4e9f0' }
          }
        }
      }
    });
    // ----- Direction Chart (Win rate & Average profit) -----
    const directions = ['long', 'short', 'flat'];
    const dirNames = { long: 'ロング', short: 'ショート', flat: 'ノーポジ' };
    const winRates = [];
    const avgProfits = [];
    directions.forEach((dir) => {
      const subset = records.filter((r) => r.directionTaken === dir);
      if (subset.length > 0) {
        const wins = subset.filter((r) => (r.profit ?? calculateProfit(r)) > 0).length;
        const winRate = (wins / subset.length) * 100;
        winRates.push(winRate);
        const avgProfit = subset.reduce((sum, r) => sum + (r.profit ?? calculateProfit(r)), 0) / subset.length;
        avgProfits.push(avgProfit);
      } else {
        winRates.push(0);
        avgProfits.push(0);
      }
    });
    if (chartDirection) chartDirection.destroy();
    const ctx2 = document.getElementById('chartDirection').getContext('2d');
    chartDirection = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: directions.map((d) => dirNames[d]),
        datasets: [
          {
            label: '勝率 (%)',
            data: winRates,
            backgroundColor: '#00b3a6',
            borderColor: '#00ffc8',
            borderWidth: 1,
            yAxisID: 'y1'
          },
          {
            label: '平均損益',
            data: avgProfits,
            backgroundColor: '#0071c1',
            borderColor: '#00aaff',
            borderWidth: 1,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        scales: {
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: '#252c38' }
          },
          y1: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: '#9aa4b5',
              beginAtZero: true,
              max: 100
            },
            grid: { color: '#252c38' }
          },
          y2: {
            type: 'linear',
            position: 'right',
            ticks: {
              color: '#9aa4b5'
            },
            grid: {
              color: '#252c38'
            }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#e4e9f0' }
          }
        }
      }
    });
    // ----- Timeframe Chart -----
    // Unique timeframes
    const timeframes = ['1分', '5分', '15分', '30分', '1時間', '日足'];
    const tfWinRates = [];
    timeframes.forEach((tf) => {
      const subset = records.filter((r) => r.timeframe === tf);
      if (subset.length > 0) {
        const wins = subset.filter((r) => (r.profit ?? calculateProfit(r)) > 0).length;
        const winRate = (wins / subset.length) * 100;
        tfWinRates.push(winRate);
      } else {
        tfWinRates.push(0);
      }
    });
    if (chartTimeframe) chartTimeframe.destroy();
    const ctx3 = document.getElementById('chartTimeframe').getContext('2d');
    chartTimeframe = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: timeframes,
        datasets: [
          {
            label: '勝率 (%)',
            data: tfWinRates,
            backgroundColor: '#815ac0',
            borderColor: '#a381e8',
            borderWidth: 1
          }
        ]
      },
      options: {
        scales: {
          x: {
            ticks: { color: '#9aa4b5' },
            grid: { color: '#252c38' }
          },
          y: {
            ticks: {
              color: '#9aa4b5',
              beginAtZero: true,
              max: 100
            },
            grid: { color: '#252c38' }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#e4e9f0' }
          }
        }
      }
    });
  }

  /**
   * 分析タブ更新
   */
  function updateAnalysis() {
    renderRecordsTable();
    renderCharts();
  }

  /**
   * JSONエクスポート処理
   */
  function handleExport() {
    const records = loadRecords();
    const data = { version: 1, records };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
   * JSONインポート処理
   * @param {File} file
   */
  function handleImport(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.version !== 1 || !Array.isArray(obj.records)) {
          alert('インポート形式が正しくありません');
          return;
        }
        const current = loadRecords();
        let added = 0;
        let updated = 0;
        obj.records.forEach((rec) => {
          const idx = current.findIndex((r) => r.id === rec.id);
          if (idx < 0) {
            current.push(rec);
            added++;
          } else {
            // 比較updatedAt
            const oldDate = new Date(current[idx].updatedAt);
            const newDate = new Date(rec.updatedAt);
            if (newDate > oldDate) {
              current[idx] = rec;
              updated++;
            }
          }
        });
        saveRecords(current);
        populateResultSelect();
        updateAnalysis();
        alert(`インポート完了: 追加 ${added} 件, 更新 ${updated} 件`);
      } catch (err) {
        console.error(err);
        alert('JSONファイルの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  }

  /**
   * 音声入力開始
   */
  function startVoiceInput() {
    const memoField = document.getElementById('entry-marketMemo');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('このブラウザは音声認識に対応していません');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.start();
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      memoField.value += (memoField.value ? '\n' : '') + transcript;
    };
    recognition.onerror = (event) => {
      console.error('Speech recognition error', event);
      alert('音声入力中にエラーが発生しました');
    };
  }

  /**
   * 初期化
   */
  function init() {
    setupTabs();
    // 画像プレビュー
    document.getElementById('entry-imageData').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) {
        entryImageData = null;
        document.getElementById('entry-imagePreview').innerHTML = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function (evt) {
        entryImageData = evt.target.result;
        const preview = document.getElementById('entry-imagePreview');
        preview.innerHTML = `<img src="${entryImageData}" alt="preview" style="max-width:100%; max-height:100px;">`;
      };
      reader.readAsDataURL(file);
    });
    // 音声入力
    document.getElementById('btnVoiceInput').addEventListener('click', startVoiceInput);
    // 判定ボタン
    document.getElementById('btnJudge').addEventListener('click', () => handleJudge(false));
    document.getElementById('btnJudgeSave').addEventListener('click', () => handleJudge(true));
    // 結果選択
    populateResultSelect();
    document.getElementById('result-record-select').addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) {
        editingResultId = null;
        clearResultFormFields();
        return;
      }
      const records = loadRecords();
      const rec = records.find((r) => r.id === id);
      if (rec) {
        loadResultForm(rec);
      }
    });
    // 結果保存
    document.getElementById('btnSaveResult').addEventListener('click', handleSaveResult);
    // 結果フォームの入力でprofit更新
    ['result-exitPrice', 'result-directionTaken', 'result-size', 'result-feePerUnit'].forEach((id) => {
      document.getElementById(id).addEventListener('input', updateProfitDisplay);
    });
    // フィルタ適用ボタン
    document.getElementById('btnApplyFilter').addEventListener('click', updateAnalysis);
    // 編集ボタンをテーブルに委任
    document.getElementById('recordsTable').addEventListener('click', (e) => {
      const target = e.target;
      if (target.classList.contains('entry-edit')) {
        const id = target.dataset.id;
        const records = loadRecords();
        const rec = records.find((r) => r.id === id);
        if (rec) {
          // タブ切替
          document.querySelector('button[data-tab="entry"]').click();
          loadEntryForm(rec);
        }
      } else if (target.classList.contains('result-edit')) {
        const id = target.dataset.id;
        const records = loadRecords();
        const rec = records.find((r) => r.id === id);
        if (rec) {
          document.querySelector('button[data-tab="result"]').click();
          const select = document.getElementById('result-record-select');
          select.value = id;
          loadResultForm(rec);
        }
      }
    });
    // JSONエクスポート
    document.getElementById('btnExport').addEventListener('click', handleExport);
    // JSONインポート
    document.getElementById('jsonImportInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleImport(file);
        // reset input to allow re-importing same file
        e.target.value = '';
      }
    });
    // 最初に分析を描画
    updateAnalysis();
  }

  /**
   * 結果フォームをクリア
   */
  function clearResultFormFields() {
    document.getElementById('result-exitDatetime').value = '';
    document.getElementById('result-exitPrice').value = '';
    document.getElementById('result-directionTaken').value = 'long';
    document.getElementById('result-size').value = '';
    document.getElementById('result-feePerUnit').value = '';
    document.getElementById('result-highDuringTrade').value = '';
    document.getElementById('result-lowDuringTrade').value = '';
    document.getElementById('result-memo').value = '';
    document.getElementById('result-profit-display').textContent = '0';
  }

  // DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);
})();