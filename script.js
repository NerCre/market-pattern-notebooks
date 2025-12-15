// script.js
// 完全フロントエンドで動作するトレード判定＋学習＆トレードノートアプリ

document.addEventListener('DOMContentLoaded', () => {
  // グローバル状態
  let records = loadRecords();
  let charts = {};
  let recognition;
  let recognizing = false;

  // タブ切り替え
  const tabNew = document.getElementById('tab-new');
  const tabList = document.getElementById('tab-list');
  const newSection = document.getElementById('new-record');
  const listSection = document.getElementById('list-analysis');

  tabNew.addEventListener('click', () => {
    switchTab('new');
  });
  tabList.addEventListener('click', () => {
    switchTab('list');
    // 表示を更新
    refreshTable();
    refreshCharts();
  });

  function switchTab(name) {
    if (name === 'new') {
      tabNew.classList.add('active');
      tabList.classList.remove('active');
      newSection.classList.remove('hidden');
      listSection.classList.add('hidden');
    } else {
      tabList.classList.add('active');
      tabNew.classList.remove('active');
      listSection.classList.remove('hidden');
      newSection.classList.add('hidden');
    }
  }

  // ローカルストレージから読み込み
  function loadRecords() {
    try {
      const data = localStorage.getItem('tradesRecords');
      if (data) {
        const arr = JSON.parse(data);
        if (Array.isArray(arr)) {
          return arr;
        }
      }
    } catch (e) {
      console.error('Failed to parse localStorage data', e);
    }
    return [];
  }

  function saveRecords() {
    localStorage.setItem('tradesRecords', JSON.stringify(records));
  }

  // ユニークID生成
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  // 現在フォームから特徴量オブジェクトを生成
  function getFeatureData() {
    const form = document.getElementById('record-form');
    const features = {};
    // トレンド
    features.trend_5_20_40 = form.trend_5_20_40.value;
    features.price_vs_ema200 = form.price_vs_ema200.value;
    features.ema_band_color = form.ema_band_color.value;
    // ボラティリティ/価格位置
    features.zone = form.zone.value;
    // フロー系
    features.cmf_sign = form.cmf_sign.value;
    features.cmf_sma_dir = form.cmf_sma_dir.value;
    // モメンタム系
    features.macd_state = form.macd_state.value;
    features.roc_sign = form.roc_sign.value;
    features.roc_sma_dir = form.roc_sma_dir.value;
    // RSI
    features.rsi_zone = form.rsi_zone.value;
    return features;
  }

  // フォームからレコードを構築
  function buildRecord(prediction) {
    const form = document.getElementById('record-form');
    const datetime = form.datetime.value;
    const symbol = form.symbol.value.trim();
    const timeframe = form.timeframe.value;
    const tradeType = form.tradeType.value;
    const direction_planned = form.direction_planned.value;
    const expected_move_value = form.expected_move_value.value ? Number(form.expected_move_value.value) : null;
    const expected_move_unit = form.expected_move_unit.value;
    const entryPrice = form.entry_price.value ? Number(form.entry_price.value) : null;
    const stopPrice = form.stop_price.value ? Number(form.stop_price.value) : null;
    const takePrice = form.take_price.value ? Number(form.take_price.value) : null;
    const exitPrice = form.exit_price.value ? Number(form.exit_price.value) : null;
    const profit = form.profit.value ? Number(form.profit.value) : null;
    const direction_taken = form.direction_taken.value;
    const note = form.note.value.trim();
    const market_memo = form.market_memo.value.trim();
    const imageData = currentImageData;
    // 計算 move
    let move = null;
    if (entryPrice != null && exitPrice != null && direction_taken) {
      if (direction_taken === 'long') {
        move = exitPrice - entryPrice;
      } else if (direction_taken === 'short') {
        move = entryPrice - exitPrice;
      } else {
        move = 0;
      }
    }
    // R倍率計算
    let rRatio = null;
    if (profit != null && entryPrice != null && stopPrice != null && direction_taken && direction_taken !== 'flat') {
      const risk = direction_taken === 'long' ? entryPrice - stopPrice : stopPrice - entryPrice;
      if (risk > 0) {
        rRatio = profit / risk;
      }
    }
    const features = getFeatureData();
    const record = {
      id: generateId(),
      datetime,
      symbol,
      timeframe,
      tradeType,
      direction_planned,
      expected_move_value,
      expected_move_unit,
      ...features,
      entry_price: entryPrice,
      stop_price: stopPrice,
      take_price: takePrice,
      exit_price: exitPrice,
      direction_taken,
      move,
      profit,
      rRatio,
      note,
      market_memo,
      imageData,
      recommendation: prediction.recommendation,
      confidence: prediction.confidence,
      predicted_move: prediction.expectedMove,
      predicted_move_unit: expected_move_unit,
      reason: prediction.reason
    };
    return record;
  }

  // 画像読み込み
  let currentImageData = null;
  const imageInput = document.getElementById('image-input');
  const imagePreview = document.getElementById('image-preview');
  imageInput.addEventListener('change', function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        currentImageData = e.target.result;
        imagePreview.src = currentImageData;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      currentImageData = null;
      imagePreview.src = '';
      imagePreview.style.display = 'none';
    }
  });

  // 音声入力
  const voiceBtn = document.getElementById('voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  const noteArea = document.getElementById('note');
  // SpeechRecognition API
  function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceStatus.textContent = 'このブラウザでは音声入力は使用できません';
      voiceBtn.disabled = true;
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = function (event) {
      let interim_transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          noteArea.value += transcript;
        } else {
          interim_transcript += transcript;
        }
      }
      if (interim_transcript) {
        voiceStatus.textContent = '認識中…';
      }
    };
    recognition.onstart = function () {
      voiceStatus.textContent = '録音中…';
    };
    recognition.onend = function () {
      if (recognizing) {
        // recognition should continue if still pressed, but we handle manually
      } else {
        voiceStatus.textContent = '';
      }
    };
    recognition.onerror = function (event) {
      console.error('Speech recognition error', event);
      voiceStatus.textContent = '音声認識エラー';
    };
    voiceBtn.disabled = false;
    // 按下中に録音
    voiceBtn.addEventListener('mousedown', startSpeech);
    voiceBtn.addEventListener('touchstart', startSpeech);
    document.addEventListener('mouseup', stopSpeech);
    document.addEventListener('touchend', stopSpeech);
  }
  function startSpeech() {
    if (!recognizing && recognition) {
      recognizing = true;
      recognition.start();
    }
  }
  function stopSpeech() {
    if (recognizing && recognition) {
      recognizing = false;
      recognition.stop();
    }
  }
  initSpeech();

  // 判定ロジック
  function predictTrade(features) {
    // 過去データをコピー
    const all = records;
    const levels = [
      ['trend_5_20_40','price_vs_ema200','ema_band_color','zone','cmf_sign','cmf_sma_dir','roc_sign','roc_sma_dir','macd_state','rsi_zone'],
      ['trend_5_20_40','price_vs_ema200','zone','cmf_sign','cmf_sma_dir','roc_sign','roc_sma_dir','macd_state','rsi_zone'],
      ['trend_5_20_40','price_vs_ema200','zone','cmf_sign','roc_sign','macd_state','rsi_zone'],
      ['trend_5_20_40','zone','cmf_sign','macd_state','rsi_zone'],
      ['trend_5_20_40','zone']
    ];
    let similar = [];
    let levelUsed = 0;
    for (let i = 0; i < levels.length; i++) {
      const keys = levels[i];
      similar = all.filter(rec => keys.every(key => rec[key] === features[key]));
      // 要件: ある程度サンプル数確保するため、5件以上になったら終了
      if (similar.length >= 5 || i === levels.length - 1) {
        levelUsed = i + 1;
        break;
      }
    }
    const longRecords = similar.filter(r => r.direction_taken === 'long');
    const shortRecords = similar.filter(r => r.direction_taken === 'short');
    let longAvg = 0;
    let shortAvg = 0;
    if (longRecords.length > 0) {
      longAvg = longRecords.reduce((sum, r) => sum + (typeof r.move === 'number' ? r.move : 0), 0) / longRecords.length;
    }
    if (shortRecords.length > 0) {
      shortAvg = shortRecords.reduce((sum, r) => sum + (typeof r.move === 'number' ? r.move : 0), 0) / shortRecords.length;
    }
    let recommendation = 'flat';
    let expectedMove = 0;
    // 自信度
    let confidence;
    let reason;
    if (similar.length < 3) {
      recommendation = 'flat';
      expectedMove = 0;
      confidence = Math.max(0, 5 * similar.length - levelUsed * 5);
      reason = `類似パターンが少ないため、ポジションを取らない方が良いと判断しました。`;
    } else {
      if (longAvg > 0 && longAvg > shortAvg) {
        recommendation = 'long';
        expectedMove = longAvg;
      } else if (shortAvg > 0 && shortAvg > longAvg) {
        recommendation = 'short';
        expectedMove = shortAvg;
      } else {
        recommendation = 'flat';
        expectedMove = 0;
      }
      // confidence: base 30 + 5 per sample - 10 per level
      confidence = 30 + similar.length * 5 - levelUsed * 10;
      // cap between 0 and 100
      confidence = Math.max(0, Math.min(100, confidence));
      // reason comment
      reason = `過去の類似パターン${similar.length}件の平均値幅を比較すると、ロング平均=${longAvg.toFixed(2)}, ショート平均=${shortAvg.toFixed(2)}。`;
      if (recommendation === 'long') {
        reason += 'ロング側の平均値幅が大きいためロングを推奨します。';
      } else if (recommendation === 'short') {
        reason += 'ショート側の平均値幅が大きいためショートを推奨します。';
      } else {
        reason += '有効な優位性が見つからないためノーポジを推奨します。';
      }
    }
    // 値幅は端数を丸める
    let roundedMove = expectedMove;
    if (Math.abs(expectedMove) >= 20) {
      roundedMove = Math.round(expectedMove / 10) * 10;
    } else {
      roundedMove = Math.round(expectedMove);
    }
    return {
      recommendation,
      expectedMove: roundedMove,
      confidence: Math.round(confidence),
      reason
    };
  }

  // 判定ボタン
  const predictOnlyBtn = document.getElementById('predict-only');
  const predictSaveBtn = document.getElementById('predict-save');
  const predictionResultEl = document.getElementById('prediction-result');

  predictOnlyBtn.addEventListener('click', () => {
    if (!validateBasicInputs()) return;
    const features = getFeatureData();
    const pred = predictTrade(features);
    displayPrediction(pred);
  });

  predictSaveBtn.addEventListener('click', () => {
    if (!validateBasicInputs()) return;
    const features = getFeatureData();
    const pred = predictTrade(features);
    displayPrediction(pred);
    const record = buildRecord(pred);
    records.push(record);
    saveRecords();
    // reset image data for next entry
    currentImageData = null;
    imageInput.value = '';
    imagePreview.style.display = 'none';
    // reset form (except default symbol)
    document.getElementById('record-form').reset();
    document.getElementById('symbol').value = 'nk225mc';
    // update table/charts if in list tab
    refreshTable();
    refreshCharts();
    alert('記録が保存されました');
  });

  // 入力チェック
  function validateBasicInputs() {
    const form = document.getElementById('record-form');
    if (!form.datetime.value || !form.symbol.value || !form.timeframe.value || !form.tradeType.value || !form.direction_planned.value) {
      alert('必須項目が入力されているか確認してください');
      return false;
    }
    return true;
  }

  // 予測結果表示
  function displayPrediction(pred) {
    const dirMap = { long: 'ロング', short: 'ショート', flat: 'ノーポジ' };
    const resultLines = [];
    resultLines.push(`推奨方向: <strong>${dirMap[pred.recommendation]}</strong>`);
    // ユニットを表示（フォームの単位を使用）
    const unitSelect = document.getElementById('expected-move-unit');
    const unit = unitSelect ? unitSelect.value : '';
    resultLines.push(`想定値幅: ${pred.expectedMove}${unit}`);
    resultLines.push(`自信度: ${pred.confidence}%`);
    resultLines.push(`理由: ${pred.reason}`);
    predictionResultEl.innerHTML = resultLines.map(line => `<div>${line}</div>`).join('');
  }

  // テーブルとグラフの更新
  const filterSymbolEl = document.getElementById('filter-symbol');
  const filterTimeframeEl = document.getElementById('filter-timeframe');
  const filterTradeTypeEl = document.getElementById('filter-trade-type');
  const filterDateFromEl = document.getElementById('filter-date-from');
  const filterDateToEl = document.getElementById('filter-date-to');
  const sortProfitEl = document.getElementById('sort-profit');
  const applyFilterBtn = document.getElementById('apply-filter');
  const resetFilterBtn = document.getElementById('reset-filter');
  const tableBody = document.querySelector('#record-table tbody');

  applyFilterBtn.addEventListener('click', () => {
    refreshTable();
    refreshCharts();
  });
  resetFilterBtn.addEventListener('click', () => {
    filterSymbolEl.value = '';
    filterTimeframeEl.value = '';
    filterTradeTypeEl.value = '';
    filterDateFromEl.value = '';
    filterDateToEl.value = '';
    sortProfitEl.value = '';
    refreshTable();
    refreshCharts();
  });

  // フィルタリング処理
  function applyFilters(recs) {
    let filtered = recs.slice();
    const sym = filterSymbolEl.value.trim();
    const tf = filterTimeframeEl.value;
    const tt = filterTradeTypeEl.value;
    const dateFrom = filterDateFromEl.value;
    const dateTo = filterDateToEl.value;
    const sortMode = sortProfitEl.value;
    if (sym) {
      filtered = filtered.filter(r => r.symbol && r.symbol.toLowerCase().includes(sym.toLowerCase()));
    }
    if (tf) {
      filtered = filtered.filter(r => r.timeframe === tf);
    }
    if (tt) {
      filtered = filtered.filter(r => r.tradeType === tt);
    }
    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime();
      filtered = filtered.filter(r => new Date(r.datetime).getTime() >= fromTs);
    }
    if (dateTo) {
      const toTs = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      filtered = filtered.filter(r => new Date(r.datetime).getTime() <= toTs);
    }
    if (sortMode === 'asc') {
      filtered.sort((a, b) => (a.profit || 0) - (b.profit || 0));
    } else if (sortMode === 'desc') {
      filtered.sort((a, b) => (b.profit || 0) - (a.profit || 0));
    }
    return filtered;
  }

  function refreshTable() {
    const recs = applyFilters(records);
    // clear existing rows
    tableBody.innerHTML = '';
    recs.forEach(rec => {
      const tr = document.createElement('tr');
      tr.classList.add('data-row');
      tr.dataset.id = rec.id;
      // cells
      const dateCell = document.createElement('td');
      const dt = rec.datetime ? new Date(rec.datetime) : null;
      dateCell.textContent = dt ? formatDateTime(dt) : '';
      tr.appendChild(dateCell);
      const symbolCell = document.createElement('td');
      symbolCell.textContent = rec.symbol;
      tr.appendChild(symbolCell);
      const timeframeCell = document.createElement('td');
      timeframeCell.textContent = rec.timeframe;
      tr.appendChild(timeframeCell);
      const ttCell = document.createElement('td');
      ttCell.textContent = tradeTypeLabel(rec.tradeType);
      tr.appendChild(ttCell);
      const dirCell = document.createElement('td');
      dirCell.textContent = directionLabel(rec.direction_taken);
      tr.appendChild(dirCell);
      const profitCell = document.createElement('td');
      profitCell.textContent = rec.profit != null ? rec.profit.toFixed(2) : '';
      tr.appendChild(profitCell);
      const rCell = document.createElement('td');
      rCell.textContent = rec.rRatio != null ? rec.rRatio.toFixed(2) : '';
      tr.appendChild(rCell);
      const recCell = document.createElement('td');
      recCell.textContent = directionLabel(rec.recommendation);
      tr.appendChild(recCell);
      // details row
      const detailsTr = document.createElement('tr');
      detailsTr.classList.add('details-row', 'hidden');
      const detailsTd = document.createElement('td');
      detailsTd.colSpan = 8;
      detailsTd.innerHTML = generateDetailsHTML(rec);
      detailsTr.appendChild(detailsTd);
      // click to toggle details
      tr.addEventListener('click', () => {
        const isHidden = detailsTr.classList.contains('hidden');
        detailsTr.classList.toggle('hidden', !isHidden);
      });
      tableBody.appendChild(tr);
      tableBody.appendChild(detailsTr);
    });
  }

  function tradeTypeLabel(v) {
    const map = { real: 'リアル', virtual: 'バーチャル', practice: 'プラクティス' };
    return map[v] || v;
  }

  function directionLabel(v) {
    const map = { long: 'ロング', short: 'ショート', flat: 'ノーポジ' };
    return map[v] || '';
  }

  function formatDateTime(date) {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    const hh = ('0' + date.getHours()).slice(-2);
    const mm = ('0' + date.getMinutes()).slice(-2);
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  function generateDetailsHTML(rec) {
    let html = '<div class="detail-content">';
    html += '<strong>特徴量</strong><br>';
    html += `<span>EMA5-20-40: ${rec.trend_5_20_40}</span>, `;
    html += `<span>EMA200位置: ${rec.price_vs_ema200}</span>, `;
    html += `<span>EMA band: ${rec.ema_band_color || '-'}</span>, `;
    html += `<span>Zone: ${rec.zone}</span>, `;
    html += `<span>CMF圏域: ${rec.cmf_sign || '-'}</span>, `;
    html += `<span>CMF SMA向き: ${rec.cmf_sma_dir || '-'}</span>, `;
    html += `<span>ROC圏域: ${rec.roc_sign || '-'}</span>, `;
    html += `<span>ROC SMA向き: ${rec.roc_sma_dir || '-'}</span>, `;
    html += `<span>MACD状態: ${rec.macd_state || '-'}</span>, `;
    html += `<span>RSIゾーン: ${rec.rsi_zone || '-'}</span><br>`;
    html += '<strong>相場状況メモ:</strong><br>' + (rec.market_memo ? rec.market_memo.replace(/\n/g, '<br>') : '-') + '<br>';
    html += '<strong>メモ:</strong><br>' + (rec.note ? rec.note.replace(/\n/g, '<br>') : '-') + '<br>';
    // 判定結果
    html += `<strong>判定結果:</strong><br>推奨方向: ${directionLabel(rec.recommendation)}<br>`;
    const predictedWidth = rec.predicted_move != null ? `${rec.predicted_move}${rec.predicted_move_unit || ''}` : '-';
    html += `想定値幅: ${predictedWidth}<br>`;
    html += `自信度: ${rec.confidence != null ? rec.confidence : '-'}%<br>`;
    html += `理由: ${rec.reason || '-'}<br>`;
    // 画像
    if (rec.imageData) {
      html += '<strong>画像:</strong><br><img src="' + rec.imageData + '" alt="記録画像" style="max-width:150px;max-height:150px;border:1px solid #2a3140;border-radius:4px;"/><br>';
    }
    html += '</div>';
    return html;
  }

  // グラフの作成と更新
  function refreshCharts() {
    const recs = applyFilters(records);
    // Chart1: 日付ごとの累積損益
    const sorted = recs.slice().sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
    const dates = [];
    const cumProfits = [];
    let cumulative = 0;
    sorted.forEach(r => {
      dates.push(formatDate(new Date(r.datetime)));
      const p = r.profit != null ? r.profit : 0;
      cumulative += p;
      cumProfits.push(cumulative);
    });
    if (!charts.cumProfit) {
      const ctx = document.getElementById('cum-profit-chart').getContext('2d');
      charts.cumProfit = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: '累積損益',
            data: cumProfits,
            borderColor: '#00ffc8',
            backgroundColor: 'rgba(0,255,200,0.2)',
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#e4e9f0' } }
          },
          scales: {
            x: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3140' } },
            y: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3140' } }
          }
        }
      });
    } else {
      charts.cumProfit.data.labels = dates;
      charts.cumProfit.data.datasets[0].data = cumProfits;
      charts.cumProfit.update();
    }
    // Chart2: ロング vs ショート勝率・平均損益
    const longRecs = recs.filter(r => r.direction_taken === 'long');
    const shortRecs = recs.filter(r => r.direction_taken === 'short');
    function calcStats(group) {
      const total = group.length;
      if (total === 0) return { winRate: 0, avgProfit: 0 };
      let wins = 0;
      let sumProfit = 0;
      group.forEach(r => {
        const p = r.profit != null ? r.profit : 0;
        if (p > 0) wins++;
        sumProfit += p;
      });
      return { winRate: (wins / total) * 100, avgProfit: sumProfit / total };
    }
    const longStats = calcStats(longRecs);
    const shortStats = calcStats(shortRecs);
    const dirLabels = ['ロング', 'ショート'];
    const winRates = [longStats.winRate, shortStats.winRate];
    const avgProfits = [longStats.avgProfit, shortStats.avgProfit];
    if (!charts.dirStats) {
      const ctx2 = document.getElementById('direction-stats-chart').getContext('2d');
      charts.dirStats = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: dirLabels,
          datasets: [
            {
              label: '平均損益',
              data: avgProfits,
              backgroundColor: 'rgba(0,255,200,0.5)',
              borderColor: '#00ffc8',
              borderWidth: 1,
              yAxisID: 'y'
            },
            {
              label: '勝率(%)',
              data: winRates,
              backgroundColor: 'rgba(255,255,0,0.5)',
              borderColor: '#ffff80',
              borderWidth: 1,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#e4e9f0' } }
          },
          scales: {
            x: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3140' } },
            y: {
              position: 'left',
              ticks: { color: '#e4e9f0' },
              grid: { color: '#2a3140' }
            },
            y1: {
              position: 'right',
              ticks: { color: '#e4e9f0' },
              grid: { drawOnChartArea: false }
            }
          }
        }
      });
    } else {
      charts.dirStats.data.labels = dirLabels;
      charts.dirStats.data.datasets[0].data = avgProfits;
      charts.dirStats.data.datasets[1].data = winRates;
      charts.dirStats.update();
    }
    // Chart3: 時間足別勝率
    const tfLabels = ['1m','5m','15m','30m','1h','1d'];
    const tfWinRates = [];
    tfLabels.forEach(tf => {
      const group = recs.filter(r => r.timeframe === tf);
      const stats = calcStats(group);
      tfWinRates.push(stats.winRate);
    });
    if (!charts.tfStats) {
      const ctx3 = document.getElementById('timeframe-stats-chart').getContext('2d');
      charts.tfStats = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: tfLabels,
          datasets: [{
            label: '勝率(%)',
            data: tfWinRates,
            backgroundColor: 'rgba(0,255,200,0.5)',
            borderColor: '#00ffc8',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#e4e9f0' } }
          },
          scales: {
            x: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3140' } },
            y: { ticks: { color: '#e4e9f0' }, grid: { color: '#2a3140' } }
          }
        }
      });
    } else {
      charts.tfStats.data.labels = tfLabels;
      charts.tfStats.data.datasets[0].data = tfWinRates;
      charts.tfStats.update();
    }
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const da = ('0' + d.getDate()).slice(-2);
    return `${y}-${m}-${da}`;
  }

  // エクスポート／インポート
  const exportBtn = document.getElementById('export-json');
  const importBtn = document.getElementById('import-json-btn');
  const importFileInput = document.getElementById('import-json-file');
  const importMsgEl = document.getElementById('import-msg');

  exportBtn.addEventListener('click', () => {
    const data = { version: 1, records };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date();
    const fileName = `trades_${formatFileDate(timestamp)}.json`;
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.version !== 1 || !Array.isArray(obj.records)) {
          importMsgEl.textContent = 'インポートするJSONの形式が不正です';
          return;
        }
        const beforeCount = records.length;
        obj.records.forEach(rec => {
          // id重複チェック
          const exists = records.some(r => r.id === rec.id);
          if (!exists) {
            records.push(rec);
          }
        });
        const added = records.length - beforeCount;
        saveRecords();
        importMsgEl.textContent = `${added}件のレコードをインポートしました`;
        // 更新
        refreshTable();
        refreshCharts();
        // reset input
        importFileInput.value = '';
        setTimeout(() => { importMsgEl.textContent = ''; }, 5000);
      } catch (err) {
        console.error('Import error:', err);
        importMsgEl.textContent = 'インポートに失敗しました';
      }
    };
    reader.readAsText(file);
  });

  function formatFileDate(date) {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    const hh = ('0' + date.getHours()).slice(-2);
    const mm = ('0' + date.getMinutes()).slice(-2);
    return `${y}${m}${d}_${hh}${mm}`;
  }

  // 初期表示
  refreshTable();
  refreshCharts();
});