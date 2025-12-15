/*
 * トレード判定＋学習＆トレードノート
 * このスクリプトでは、localStorage に保存されたトレードデータを利用して
 * エントリー時の判定およびトレードの記録・分析を行います。
 */

// localStorage キー
const STORAGE_KEY = 'tradeRecords';

// グローバル変数
let records = [];
let cumulativeProfitChart = null;
let winRateChart = null;
let timeframeChart = null;

// DOMが準備できたら初期化
document.addEventListener('DOMContentLoaded', () => {
    // タブ切り替え設定
    initTabs();
    // データ読み込み
    records = loadRecords();
    // 音声入力の有無を確認
    initVoiceRecognition();
    // 初期表示更新
    updateResultEntryOptions();
    updateRecordsTable();
    updateCharts();
    // フォームイベント設定
    initEntryForm();
    initResultForm();
    initAnalysisFilters();
    initExportImport();
});

/**
 * localStorage からデータを読み込む
 * @returns {Array}
 */
function loadRecords() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
        const arr = JSON.parse(data);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        console.error('データの読み込みに失敗しました。', e);
        return [];
    }
}

/**
 * データを localStorage に保存
 * @param {Array} recs
 */
function saveRecords(recs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recs));
}

/**
 * ユニークID生成
 * @returns {string}
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * タブ初期化
 */
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // コンテンツ切り替え
            const idMap = {
                'tab-entry': 'entry-section',
                'tab-result': 'result-section',
                'tab-analysis': 'analysis-section'
            };
            Object.values(idMap).forEach(secId => {
                document.getElementById(secId).classList.add('hidden');
            });
            document.getElementById(idMap[tab.id]).classList.remove('hidden');
            if (tab.id === 'tab-result') {
                updateResultEntryOptions();
            }
            if (tab.id === 'tab-analysis') {
                updateRecordsTable();
                updateCharts();
            }
        });
    });
}

/**
 * 音声認識の初期化
 */
function initVoiceRecognition() {
    const voiceBtn = document.getElementById('voiceBtn');
    const voiceGroup = document.getElementById('voiceGroup');
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        // 音声認識が使えない場合は非表示
        voiceGroup.style.display = 'none';
        return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognizer = new SpeechRecognition();
    recognizer.lang = 'ja-JP';
    recognizer.continuous = false;
    recognizer.interimResults = false;
    voiceBtn.addEventListener('click', () => {
        try {
            recognizer.start();
            voiceBtn.textContent = '🎤 聞き取り中...';
        } catch (e) {
            console.error(e);
        }
    });
    recognizer.addEventListener('result', (event) => {
        const transcript = Array.from(event.results)
            .map(res => res[0].transcript)
            .join('');
        const memo = document.getElementById('marketMemo');
        memo.value = memo.value + (memo.value ? '\n' : '') + transcript;
    });
    recognizer.addEventListener('end', () => {
        voiceBtn.textContent = '🎤 音声入力';
    });
}

/**
 * エントリーフォームイベントの初期化
 */
function initEntryForm() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const saveEntryBtn = document.getElementById('saveEntryBtn');
    analyzeBtn.addEventListener('click', () => {
        const formValues = getEntryFormValues();
        if (!formValues) return;
        const recommendation = computeRecommendation(formValues.features, records);
        displayRecommendation(recommendation);
    });
    saveEntryBtn.addEventListener('click', () => {
        const formValues = getEntryFormValues();
        if (!formValues) return;
        // 判定済みか確認
        let recommendation = null;
        if (document.getElementById('result-recommendation').textContent === '---') {
            recommendation = computeRecommendation(formValues.features, records);
            displayRecommendation(recommendation);
        } else {
            // 既に表示されている内容を取得
            recommendation = {
                recommendation: document.getElementById('result-recommendation').dataset.value,
                expectedMove: Number(document.getElementById('result-expectedMove').dataset.value) || 0,
                expectedMoveUnit: document.getElementById('result-expectedMove').dataset.unit,
                confidence: Number(document.getElementById('result-confidence').dataset.value) || 0,
                reason: document.getElementById('result-reason').textContent
            };
        }
        saveEntry(formValues, recommendation);
    });
    // 画像プレビュー
    const imageInput = document.getElementById('imageInput');
    imageInput.addEventListener('change', handleImagePreview);
}

/**
 * 結果入力フォームの初期化
 */
function initResultForm() {
    const selectResultEntry = document.getElementById('selectResultEntry');
    selectResultEntry.addEventListener('change', handleResultEntrySelection);
    const exitDatetime = document.getElementById('exitDatetime');
    const exitPrice = document.getElementById('exitPrice');
    const directionTaken = document.getElementById('directionTaken');
    const exitSize = document.getElementById('exitSize');
    const exitFeePerUnit = document.getElementById('exitFeePerUnit');
    const highDuringTrade = document.getElementById('highDuringTrade');
    const lowDuringTrade = document.getElementById('lowDuringTrade');
    [exitDatetime, exitPrice, directionTaken, exitSize, exitFeePerUnit, highDuringTrade, lowDuringTrade].forEach(el => {
        el.addEventListener('input', () => {
            recalcProfit();
        });
    });
    document.getElementById('recalcProfitBtn').addEventListener('click', recalcProfit);
    document.getElementById('saveResultBtn').addEventListener('click', saveResult);
}

/**
 * 分析フィルタの初期化
 */
function initAnalysisFilters() {
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        updateRecordsTable();
        updateCharts();
    });
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
        // reset filter inputs
        document.getElementById('filterSymbol').value = '';
        document.getElementById('filterTimeframe').value = '';
        document.getElementById('filterTradeType').value = '';
        document.getElementById('filterHasResult').value = '';
        document.getElementById('filterStartDate').value = '';
        document.getElementById('filterEndDate').value = '';
        document.getElementById('filterSort').value = '';
        updateRecordsTable();
        updateCharts();
    });
}

/**
 * エクスポート・インポートボタンの初期化
 */
function initExportImport() {
    document.getElementById('exportJsonBtn').addEventListener('click', exportToJson);
    document.getElementById('importJsonInput').addEventListener('change', importFromJson);
}

/**
 * エントリーフォームの入力値を取得
 * @returns {Object|null}
 */
function getEntryFormValues() {
    // 基本項目
    const entryDatetimeEl = document.getElementById('entryDatetime');
    const symbolEl = document.getElementById('symbol');
    const timeframeEl = document.getElementById('timeframe');
    const tradeTypeEl = document.getElementById('tradeType');
    const directionPlannedEl = document.getElementById('directionPlanned');
    const entryPriceEl = document.getElementById('entryPrice');
    const sizeEl = document.getElementById('size');
    const feePerUnitEl = document.getElementById('feePerUnit');
    const plannedStopPriceEl = document.getElementById('plannedStopPrice');
    const plannedLimitPriceEl = document.getElementById('plannedLimitPrice');
    const cutLossPriceEl = document.getElementById('cutLossPrice');
    // インジケーター
    const trend = document.getElementById('trend_5_20_40').value;
    const priceVsEma200 = document.getElementById('price_vs_ema200').value;
    const emaBand = document.getElementById('ema_band_color').value;
    const zone = document.getElementById('zone').value;
    const cmfSign = document.getElementById('cmf_sign').value;
    const cmfSmaDir = document.getElementById('cmf_sma_dir').value;
    const rocSign = document.getElementById('roc_sign').value;
    const rocSmaDir = document.getElementById('roc_sma_dir').value;
    const macdState = document.getElementById('macd_state').value;
    const rsiZone = document.getElementById('rsi_zone').value;
    // 相場メモ
    const marketMemo = document.getElementById('marketMemo').value;
    // 画像データは handleImagePreview で previewImg.dataset.imageData に保持
    const imageData = document.getElementById('preview-img').dataset.imageData || null;
    // 入力チェック
    if (!entryDatetimeEl.value || !symbolEl.value || !timeframeEl.value || !tradeTypeEl.value || !directionPlannedEl.value || !entryPriceEl.value || !sizeEl.value || !feePerUnitEl.value) {
        alert('必須項目が入力されていません。');
        return null;
    }
    // インジケーターのチェック
    if (!trend || !priceVsEma200 || !emaBand || !zone || !cmfSign || !cmfSmaDir || !rocSign || !rocSmaDir || !macdState || !rsiZone) {
        alert('インジケーターをすべて選択してください。');
        return null;
    }
    const features = {
        trend_5_20_40: trend,
        price_vs_ema200: priceVsEma200,
        ema_band_color: emaBand,
        zone: zone,
        cmf_sign: cmfSign,
        cmf_sma_dir: cmfSmaDir,
        roc_sign: rocSign,
        roc_sma_dir: rocSmaDir,
        macd_state: macdState,
        rsi_zone: rsiZone
    };
    return {
        datetimeEntry: entryDatetimeEl.value,
        symbol: symbolEl.value,
        timeframe: timeframeEl.value,
        tradeType: tradeTypeEl.value,
        directionPlanned: directionPlannedEl.value,
        entryPrice: parseFloat(entryPriceEl.value),
        size: parseFloat(sizeEl.value),
        feePerUnit: parseFloat(feePerUnitEl.value),
        plannedStopPrice: plannedStopPriceEl.value ? parseFloat(plannedStopPriceEl.value) : null,
        plannedLimitPrice: plannedLimitPriceEl.value ? parseFloat(plannedLimitPriceEl.value) : null,
        cutLossPrice: cutLossPriceEl.value ? parseFloat(cutLossPriceEl.value) : null,
        marketMemo: marketMemo,
        imageData: imageData,
        features: features
    };
}

/**
 * 判定結果を表示
 * @param {Object} rec
 */
function displayRecommendation(rec) {
    const recEl = document.getElementById('result-recommendation');
    const moveEl = document.getElementById('result-expectedMove');
    const confEl = document.getElementById('result-confidence');
    const reasonEl = document.getElementById('result-reason');
    if (!rec) {
        recEl.textContent = '---';
        moveEl.textContent = '---';
        confEl.textContent = '---';
        reasonEl.textContent = '---';
        return;
    }
    recEl.textContent = `推奨方向: ${rec.recommendation === 'long' ? 'ロング' : rec.recommendation === 'short' ? 'ショート' : 'ノーポジ'}`;
    recEl.dataset.value = rec.recommendation;
    const moveStr = rec.expectedMove != null ? `${rec.expectedMove}${rec.expectedMoveUnit || ''}` : 'N/A';
    moveEl.textContent = `想定値幅: ${moveStr}`;
    moveEl.dataset.value = rec.expectedMove;
    moveEl.dataset.unit = rec.expectedMoveUnit;
    confEl.textContent = `自信度: ${Math.round(rec.confidence)} / 100`;
    confEl.dataset.value = rec.confidence;
    reasonEl.textContent = rec.reason || '';
}

/**
 * エントリー保存
 * @param {Object} formValues
 * @param {Object} recommendation
 */
function saveEntry(formValues, recommendation) {
    const editingId = document.getElementById('editingEntryId').value;
    const now = new Date().toISOString();
    if (editingId) {
        // 更新
        records = records.map(r => {
            if (r.id === editingId) {
                return {
                    ...r,
                    ...formValues,
                    ...formValues.features,
                    recommendation: recommendation.recommendation,
                    expectedMove: recommendation.expectedMove,
                    expectedMoveUnit: recommendation.expectedMoveUnit,
                    confidence: recommendation.confidence,
                    reason: recommendation.reason,
                    updatedAt: now
                };
            }
            return r;
        });
        alert('エントリーを更新しました。');
        document.getElementById('editingEntryId').value = '';
    } else {
        // 新規登録
        const newRec = {
            id: generateId(),
            createdAt: now,
            updatedAt: now,
            // 基本項目とfeaturesをフラットに展開
            ...formValues,
            ...formValues.features,
            hasResult: false,
            recommendation: recommendation.recommendation,
            expectedMove: recommendation.expectedMove,
            expectedMoveUnit: recommendation.expectedMoveUnit,
            confidence: recommendation.confidence,
            reason: recommendation.reason
        };
        records.push(newRec);
        alert('エントリーを保存しました。');
    }
    saveRecords(records);
    // フォームリセット
    document.getElementById('entry-form').reset();
    document.getElementById('result-recommendation').textContent = '---';
    document.getElementById('result-expectedMove').textContent = '---';
    document.getElementById('result-confidence').textContent = '---';
    document.getElementById('result-reason').textContent = '---';
    document.getElementById('preview-img').src = '';
    document.getElementById('preview-img').style.display = 'none';
    document.getElementById('preview-img').dataset.imageData = '';
    // 更新
    updateResultEntryOptions();
    updateRecordsTable();
    updateCharts();
}

/**
 * 画像プレビュー処理
 * @param {Event} event
 */
function handleImagePreview(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('preview-img');
    if (!file) {
        preview.src = '';
        preview.style.display = 'none';
        preview.dataset.imageData = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = 'block';
        preview.dataset.imageData = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * 類似パターンの抽出と推奨方向の計算
 * @param {Object} currentFeatures
 * @param {Array} recs
 * @returns {Object|null}
 */
function computeRecommendation(currentFeatures, recs) {
    // 学習用データは hasResult === true のみ
    const dataset = recs.filter(r => r.hasResult && r.directionTaken);
    if (dataset.length === 0) {
        return {
            recommendation: 'flat',
            expectedMove: 0,
            expectedMoveUnit: '',
            confidence: 10,
            reason: '過去データが存在しないため、様子見を推奨します。'
        };
    }
    // 条件レベル定義（プロパティ名の配列）
    const levels = [
        ['trend_5_20_40','price_vs_ema200','ema_band_color','zone','cmf_sign','cmf_sma_dir','roc_sign','roc_sma_dir','macd_state','rsi_zone'],
        ['trend_5_20_40','price_vs_ema200','zone','cmf_sign','cmf_sma_dir','roc_sign','roc_sma_dir','macd_state','rsi_zone'],
        ['trend_5_20_40','zone','cmf_sign','macd_state','rsi_zone'],
        ['trend_5_20_40','zone']
    ];
    let candidates = [];
    let usedLevel = levels.length; // default high number if none found
    for (let i = 0; i < levels.length; i++) {
        const lvlProps = levels[i];
        candidates = dataset.filter(item => {
            return lvlProps.every(prop => item[prop] === currentFeatures[prop]);
        });
        if (candidates.length >= 3) { // 一定件数以上見つかったらそこで採用
            usedLevel = i + 1;
            break;
        }
    }
    if (candidates.length === 0) {
        // 最終的に条件を外してもサンプルがない場合は全体で計算
        candidates = dataset;
        usedLevel = levels.length + 1;
    }
    // グループ分け
    const longRecords = candidates.filter(r => r.directionTaken === 'long');
    const shortRecords = candidates.filter(r => r.directionTaken === 'short');
    // 勝敗判定
    const winLong = longRecords.filter(r => r.profit > 0).length;
    const winShort = shortRecords.filter(r => r.profit > 0).length;
    const countLong = longRecords.length;
    const countShort = shortRecords.length;
    const winRateLong = countLong > 0 ? winLong / countLong : 0;
    const winRateShort = countShort > 0 ? winShort / countShort : 0;
    // 平均値幅計算
    const avgMoveLong = countLong > 0 ? longRecords.reduce((acc, r) => acc + ((r.highDuringTrade ?? r.exitPrice) - r.entryPrice), 0) / countLong : 0;
    const avgMoveShort = countShort > 0 ? shortRecords.reduce((acc, r) => acc + ((r.entryPrice - (r.lowDuringTrade ?? r.exitPrice))), 0) / countShort : 0;
    // 推奨方向決定
    let recommendation = 'flat';
    let expectedMove = 0;
    let expectedUnit = 'ポイント';
    // Determine by win rate and average move
    if (winRateLong > winRateShort && winRateLong > 0.5) {
        recommendation = 'long';
        expectedMove = Math.round(avgMoveLong);
    } else if (winRateShort > winRateLong && winRateShort > 0.5) {
        recommendation = 'short';
        expectedMove = Math.round(avgMoveShort);
    } else {
        // win rates close or low; decide by average move
        if (avgMoveLong > avgMoveShort && avgMoveLong > 0) {
            recommendation = 'long';
            expectedMove = Math.round(avgMoveLong);
        } else if (avgMoveShort > avgMoveLong && avgMoveShort > 0) {
            recommendation = 'short';
            expectedMove = Math.round(avgMoveShort);
        } else {
            recommendation = 'flat';
            expectedMove = 0;
        }
    }
    // 自信度計算
    let confidence = 30; // ベース
    // レベル重み: レベル1が最も高い（小さい数値）
    const levelWeight = {1: 20, 2: 15, 3: 10, 4: 5, 5: 0};
    confidence += levelWeight[usedLevel] || 0;
    // サンプル数による加点（最大20）
    const sampleCount = candidates.length;
    confidence += Math.min(sampleCount, 10) * 2;
    // 勝率による調整
    const chosenWinRate = recommendation === 'long' ? winRateLong : recommendation === 'short' ? winRateShort : 0.5;
    confidence += Math.max(0, (chosenWinRate - 0.5)) * 100 * 0.4; // 40点分
    confidence = Math.min(95, Math.max(10, confidence));
    // 理由文生成
    const toPercent = (v) => (v * 100).toFixed(1) + '%';
    let reason = '';
    reason += `過去${candidates.length}件の類似パターンより、`;
    reason += `ロング勝率 ${toPercent(winRateLong)} (平均 +${Math.round(avgMoveLong)}), `;
    reason += `ショート勝率 ${toPercent(winRateShort)} (平均 +${Math.round(avgMoveShort)}).`;
    if (recommendation === 'flat') {
        reason += ' 勝率や値幅が拮抗しているため、ポジションを取らず様子見を推奨します。';
    } else if (recommendation === 'long') {
        reason += ' ロング優勢と判断しました。';
    } else if (recommendation === 'short') {
        reason += ' ショート優勢と判断しました。';
    }
    return {
        recommendation,
        expectedMove,
        expectedMoveUnit: expectedUnit,
        confidence,
        reason
    };
}

/**
 * 結果入力対象エントリーの選択肢を更新
 */
function updateResultEntryOptions() {
    const selectEl = document.getElementById('selectResultEntry');
    // 現在選択されている値を保持
    const currentVal = selectEl.value;
    // 一旦クリア
    selectEl.innerHTML = '';
    // 編集中のレコードも含め、hasResult=false あるいは編集用idあり
    const options = [];
    records.forEach(r => {
        const text = `${r.datetimeEntry} | ${r.symbol} | 想定:${r.directionPlanned}`;
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = text + (r.hasResult ? ' (完了)' : '');
        selectEl.appendChild(opt);
    });
    // プロンプト挿入
    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = '選択してください';
    firstOption.selected = true;
    selectEl.insertBefore(firstOption, selectEl.firstChild);
    // 保持していた値があれば再選択
    if (currentVal) selectEl.value = currentVal;
}

/**
 * 結果入力用に選択されたエントリーを処理
 */
function handleResultEntrySelection() {
    const selectEl = document.getElementById('selectResultEntry');
    const form = document.getElementById('result-form');
    const infoDiv = document.getElementById('resultEntryInfo');
    const notePreview = document.getElementById('result-note-preview');
    if (!selectEl.value) {
        form.classList.add('hidden');
        infoDiv.innerHTML = '';
        notePreview.innerHTML = '';
        return;
    }
    const rec = records.find(r => r.id === selectEl.value);
    if (!rec) return;
    // エントリー情報表示
    infoDiv.innerHTML = '';
    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';
    const fields = [
        {label:'エントリー日時', value: rec.datetimeEntry},
        {label:'銘柄', value: rec.symbol},
        {label:'時間足', value: rec.timeframe},
        {label:'取引区分', value: rec.tradeType},
        {label:'想定方向', value: rec.directionPlanned},
        {label:'エントリー価格', value: rec.entryPrice},
        {label:'枚数', value: rec.size},
        {label:'手数料/枚', value: rec.feePerUnit}
    ];
    fields.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.label}: ${item.value}`;
        list.appendChild(li);
    });
    infoDiv.appendChild(list);
    // ノートプレビュー
    notePreview.innerHTML = '';
    if (rec.marketMemo) {
        const p = document.createElement('p');
        p.textContent = rec.marketMemo;
        notePreview.appendChild(p);
    }
    if (rec.imageData) {
        const img = document.createElement('img');
        img.src = rec.imageData;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        notePreview.appendChild(img);
    }
    // フォーム表示
    form.classList.remove('hidden');
    // 入力値の初期化
    document.getElementById('exitDatetime').value = rec.datetimeExit || '';
    document.getElementById('exitPrice').value = rec.exitPrice != null ? rec.exitPrice : '';
    document.getElementById('directionTaken').value = rec.directionTaken || rec.directionPlanned || 'long';
    document.getElementById('exitSize').value = rec.size;
    document.getElementById('exitFeePerUnit').value = rec.feePerUnit;
    document.getElementById('highDuringTrade').value = rec.highDuringTrade != null ? rec.highDuringTrade : '';
    document.getElementById('lowDuringTrade').value = rec.lowDuringTrade != null ? rec.lowDuringTrade : '';
    document.getElementById('resultNote').value = rec.note || '';
    document.getElementById('profitDisplay').textContent = rec.profit != null ? rec.profit.toFixed(2) : '0';
    // hidden id
    document.getElementById('editingResultId').value = rec.id;
    // 再計算
    recalcProfit();
}

/**
 * 損益再計算
 */
function recalcProfit() {
    const exitPriceEl = document.getElementById('exitPrice');
    const directionEl = document.getElementById('directionTaken');
    const sizeEl = document.getElementById('exitSize');
    const feeEl = document.getElementById('exitFeePerUnit');
    const entryId = document.getElementById('editingResultId').value;
    const rec = records.find(r => r.id === entryId);
    if (!rec) return;
    const exitPrice = parseFloat(exitPriceEl.value);
    const size = parseFloat(sizeEl.value);
    const fee = parseFloat(feeEl.value);
    const dir = directionEl.value;
    let profit = 0;
    if (!isNaN(exitPrice) && !isNaN(size) && !isNaN(fee) && rec.entryPrice != null) {
        if (dir === 'long') {
            profit = (exitPrice - rec.entryPrice - fee) * size;
        } else if (dir === 'short') {
            profit = (rec.entryPrice - exitPrice - fee) * size;
        } else {
            profit = 0;
        }
    }
    document.getElementById('profitDisplay').textContent = profit.toFixed(2);
}

/**
 * 結果保存
 */
function saveResult() {
    const entryId = document.getElementById('editingResultId').value;
    if (!entryId) return;
    const recIndex = records.findIndex(r => r.id === entryId);
    if (recIndex < 0) return;
    // 入力値取得
    const exitDatetime = document.getElementById('exitDatetime').value;
    const exitPrice = parseFloat(document.getElementById('exitPrice').value);
    const directionTaken = document.getElementById('directionTaken').value;
    const size = parseFloat(document.getElementById('exitSize').value);
    const fee = parseFloat(document.getElementById('exitFeePerUnit').value);
    const high = document.getElementById('highDuringTrade').value;
    const low = document.getElementById('lowDuringTrade').value;
    const note = document.getElementById('resultNote').value;
    // 計算済み profit
    const profit = parseFloat(document.getElementById('profitDisplay').textContent);
    if (!exitDatetime || isNaN(exitPrice) || isNaN(size) || isNaN(fee)) {
        alert('決済日時、決済価格、枚数、手数料は必須です。');
        return;
    }
    const updated = {
        hasResult: true,
        datetimeExit: exitDatetime,
        exitPrice: exitPrice,
        directionTaken: directionTaken,
        size: size,
        feePerUnit: fee,
        highDuringTrade: high ? parseFloat(high) : null,
        lowDuringTrade: low ? parseFloat(low) : null,
        profit: profit,
        note: note,
        updatedAt: new Date().toISOString()
    };
    records[recIndex] = { ...records[recIndex], ...updated };
    saveRecords(records);
    alert('結果を保存しました。');
    // 入力フォームリセット
    document.getElementById('result-form').reset();
    document.getElementById('result-form').classList.add('hidden');
    document.getElementById('resultEntryInfo').innerHTML = '';
    document.getElementById('result-note-preview').innerHTML = '';
    document.getElementById('selectResultEntry').value = '';
    document.getElementById('profitDisplay').textContent = '0';
    // 更新
    updateRecordsTable();
    updateCharts();
}

/**
 * レコードテーブル更新
 */
function updateRecordsTable() {
    const container = document.getElementById('records-table-container');
    // フィルタ取得
    const symbolFilter = document.getElementById('filterSymbol').value.trim().toLowerCase();
    const timeframeFilter = document.getElementById('filterTimeframe').value;
    const tradeTypeFilter = document.getElementById('filterTradeType').value;
    const hasResultFilter = document.getElementById('filterHasResult').value;
    const startDateStr = document.getElementById('filterStartDate').value;
    const endDateStr = document.getElementById('filterEndDate').value;
    const sortOrder = document.getElementById('filterSort').value;
    let filtered = records.slice();
    if (symbolFilter) {
        filtered = filtered.filter(r => r.symbol && r.symbol.toLowerCase().includes(symbolFilter));
    }
    if (timeframeFilter) {
        filtered = filtered.filter(r => r.timeframe === timeframeFilter);
    }
    if (tradeTypeFilter) {
        filtered = filtered.filter(r => r.tradeType === tradeTypeFilter);
    }
    if (hasResultFilter) {
        const val = hasResultFilter === 'true';
        filtered = filtered.filter(r => !!r.hasResult === val);
    }
    if (startDateStr) {
        const startDate = new Date(startDateStr);
        filtered = filtered.filter(r => {
            const dt = new Date(r.datetimeEntry);
            return dt >= startDate;
        });
    }
    if (endDateStr) {
        const endDate = new Date(endDateStr);
        filtered = filtered.filter(r => {
            const dt = new Date(r.datetimeEntry);
            return dt <= endDate;
        });
    }
    if (sortOrder) {
        filtered.sort((a,b) => {
            const aProfit = a.hasResult && typeof a.profit === 'number' ? a.profit : -Infinity;
            const bProfit = b.hasResult && typeof b.profit === 'number' ? b.profit : -Infinity;
            if (sortOrder === 'asc') {
                return aProfit - bProfit;
            } else {
                return bProfit - aProfit;
            }
        });
    }
    // テーブル生成
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['エントリー日時','銘柄','時間足','取引区分','取った方向','損益','推奨方向','完了状態','編集'];
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    filtered.forEach(rec => {
        const tr = document.createElement('tr');
        // エントリー日時
        const tdDate = document.createElement('td');
        tdDate.textContent = rec.datetimeEntry;
        tr.appendChild(tdDate);
        // 銘柄
        const tdSym = document.createElement('td');
        tdSym.textContent = rec.symbol;
        tr.appendChild(tdSym);
        // 時間足
        const tdTf = document.createElement('td');
        tdTf.textContent = rec.timeframe;
        tr.appendChild(tdTf);
        // 取引区分
        const tdType = document.createElement('td');
        tdType.textContent = rec.tradeType;
        tr.appendChild(tdType);
        // 実際に取った方向
        const tdDir = document.createElement('td');
        tdDir.textContent = rec.hasResult ? (rec.directionTaken || '') : '';
        tr.appendChild(tdDir);
        // 損益
        const tdProfit = document.createElement('td');
        tdProfit.textContent = rec.hasResult && typeof rec.profit === 'number' ? rec.profit.toFixed(2) : '';
        tr.appendChild(tdProfit);
        // 判定時推奨方向
        const tdRec = document.createElement('td');
        tdRec.textContent = rec.recommendation ? (rec.recommendation === 'long' ? 'ロング' : rec.recommendation === 'short' ? 'ショート' : 'ノーポジ') : '';
        tr.appendChild(tdRec);
        // 完了状態
        const tdHas = document.createElement('td');
        tdHas.textContent = rec.hasResult ? '完了' : '未完';
        tr.appendChild(tdHas);
        // 編集ボタン
        const tdEdit = document.createElement('td');
        const editEntryBtn = document.createElement('button');
        editEntryBtn.textContent = 'エントリー編集';
        editEntryBtn.className = 'edit-button';
        editEntryBtn.addEventListener('click', () => {
            // エントリー編集
            populateEntryForEdit(rec.id);
        });
        const editResultBtn = document.createElement('button');
        editResultBtn.textContent = '結果編集';
        editResultBtn.className = 'edit-button';
        editResultBtn.addEventListener('click', () => {
            // 結果編集
            document.getElementById('tab-result').click();
            setTimeout(() => {
                document.getElementById('selectResultEntry').value = rec.id;
                handleResultEntrySelection();
            }, 50);
        });
        tdEdit.appendChild(editEntryBtn);
        tdEdit.appendChild(document.createTextNode(' '));
        tdEdit.appendChild(editResultBtn);
        tr.appendChild(tdEdit);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
}

/**
 * エントリー編集用にフォームへ読み込み
 * @param {string} id
 */
function populateEntryForEdit(id) {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    // エントリータブへ切り替え
    document.getElementById('tab-entry').click();
    // フォームに値をセット
    document.getElementById('entryDatetime').value = rec.datetimeEntry;
    document.getElementById('symbol').value = rec.symbol;
    document.getElementById('timeframe').value = rec.timeframe;
    document.getElementById('tradeType').value = rec.tradeType;
    document.getElementById('directionPlanned').value = rec.directionPlanned;
    document.getElementById('entryPrice').value = rec.entryPrice;
    document.getElementById('size').value = rec.size;
    document.getElementById('feePerUnit').value = rec.feePerUnit;
    document.getElementById('plannedStopPrice').value = rec.plannedStopPrice != null ? rec.plannedStopPrice : '';
    document.getElementById('plannedLimitPrice').value = rec.plannedLimitPrice != null ? rec.plannedLimitPrice : '';
    document.getElementById('cutLossPrice').value = rec.cutLossPrice != null ? rec.cutLossPrice : '';
    // インジケーター
    document.getElementById('trend_5_20_40').value = rec.trend_5_20_40 || '';
    document.getElementById('price_vs_ema200').value = rec.price_vs_ema200 || '';
    document.getElementById('ema_band_color').value = rec.ema_band_color || '';
    document.getElementById('zone').value = rec.zone || '';
    document.getElementById('cmf_sign').value = rec.cmf_sign || '';
    document.getElementById('cmf_sma_dir').value = rec.cmf_sma_dir || '';
    document.getElementById('roc_sign').value = rec.roc_sign || '';
    document.getElementById('roc_sma_dir').value = rec.roc_sma_dir || '';
    document.getElementById('macd_state').value = rec.macd_state || '';
    document.getElementById('rsi_zone').value = rec.rsi_zone || '';
    document.getElementById('marketMemo').value = rec.marketMemo || '';
    // 画像
    const previewImg = document.getElementById('preview-img');
    if (rec.imageData) {
        previewImg.src = rec.imageData;
        previewImg.style.display = 'block';
        previewImg.dataset.imageData = rec.imageData;
    } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
        previewImg.dataset.imageData = '';
    }
    // 判定結果を表示（必要なら）
    if (rec.recommendation) {
        displayRecommendation({
            recommendation: rec.recommendation,
            expectedMove: rec.expectedMove,
            expectedMoveUnit: rec.expectedMoveUnit,
            confidence: rec.confidence,
            reason: rec.reason
        });
    } else {
        displayRecommendation(null);
    }
    // 編集中ID保存
    document.getElementById('editingEntryId').value = rec.id;
}

/**
 * グラフ更新
 */
function updateCharts() {
    // フィルタ適用後のデータを使用
    // ここでは updateRecordsTable() のフィルタと同じ条件を適用
    const symbolFilter = document.getElementById('filterSymbol').value.trim().toLowerCase();
    const timeframeFilter = document.getElementById('filterTimeframe').value;
    const tradeTypeFilter = document.getElementById('filterTradeType').value;
    const hasResultFilter = document.getElementById('filterHasResult').value;
    const startDateStr = document.getElementById('filterStartDate').value;
    const endDateStr = document.getElementById('filterEndDate').value;
    let filtered = records.filter(r => true);
    if (symbolFilter) {
        filtered = filtered.filter(r => r.symbol && r.symbol.toLowerCase().includes(symbolFilter));
    }
    if (timeframeFilter) {
        filtered = filtered.filter(r => r.timeframe === timeframeFilter);
    }
    if (tradeTypeFilter) {
        filtered = filtered.filter(r => r.tradeType === tradeTypeFilter);
    }
    if (hasResultFilter) {
        const val = hasResultFilter === 'true';
        filtered = filtered.filter(r => !!r.hasResult === val);
    }
    if (startDateStr) {
        const startDate = new Date(startDateStr);
        filtered = filtered.filter(r => new Date(r.datetimeEntry) >= startDate);
    }
    if (endDateStr) {
        const endDate = new Date(endDateStr);
        filtered = filtered.filter(r => new Date(r.datetimeEntry) <= endDate);
    }
    // グラフ1: 累積損益
    const cumulativeData = [];
    let cumProfit = 0;
    // 日付ごとに集計（exitDatetimeがあればそれ、なければentryDatetime）
    const dateMap = {};
    filtered.forEach(r => {
        if (r.hasResult && typeof r.profit === 'number') {
            const dateKey = (r.datetimeExit || r.datetimeEntry).split('T')[0];
            if (!dateMap[dateKey]) {
                dateMap[dateKey] = 0;
            }
            dateMap[dateKey] += r.profit;
        }
    });
    const sortedDates = Object.keys(dateMap).sort();
    const cumLabels = [];
    const cumValues = [];
    sortedDates.forEach(date => {
        cumProfit += dateMap[date];
        cumLabels.push(date);
        cumValues.push(cumProfit);
    });
    const ctx1 = document.getElementById('cumulativeProfitChart').getContext('2d');
    if (cumulativeProfitChart) cumulativeProfitChart.destroy();
    cumulativeProfitChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: cumLabels,
            datasets: [{
                label: '累積損益',
                data: cumValues,
                borderColor: '#00ffc8',
                backgroundColor: 'rgba(0,255,200,0.1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            scales: {
                x: {
                    ticks: { color: '#e4e9f0' },
                    grid: { color: '#404a60' }
                },
                y: {
                    ticks: { color: '#e4e9f0' },
                    grid: { color: '#404a60' }
                }
            },
            plugins: {
                legend: { labels: { color: '#e4e9f0' } }
            }
        }
    });
    // グラフ2: ロング vs ショートの勝率・平均損益
    const longRecs = filtered.filter(r => r.hasResult && r.directionTaken === 'long');
    const shortRecs = filtered.filter(r => r.hasResult && r.directionTaken === 'short');
    const winLong = longRecs.filter(r => r.profit > 0).length;
    const winShort = shortRecs.filter(r => r.profit > 0).length;
    const countLong = longRecs.length;
    const countShort = shortRecs.length;
    const winRateLong = countLong > 0 ? winLong / countLong * 100 : 0;
    const winRateShort = countShort > 0 ? winShort / countShort * 100 : 0;
    const avgProfitLong = countLong > 0 ? longRecs.reduce((acc, r) => acc + r.profit, 0) / countLong : 0;
    const avgProfitShort = countShort > 0 ? shortRecs.reduce((acc, r) => acc + r.profit, 0) / countShort : 0;
    const ctx2 = document.getElementById('winRateChart').getContext('2d');
    if (winRateChart) winRateChart.destroy();
    winRateChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: ['ロング', 'ショート'],
            datasets: [
                {
                    label: '勝率 (%)',
                    data: [winRateLong, winRateShort],
                    backgroundColor: 'rgba(0,255,200,0.5)',
                    borderColor: '#00ffc8',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: '平均損益',
                    data: [avgProfitLong, avgProfitShort],
                    backgroundColor: 'rgba(0,150,255,0.5)',
                    borderColor: '#0096ff',
                    borderWidth: 1,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            scales: {
                x: {
                    ticks: { color: '#e4e9f0' },
                    grid: { color: '#404a60' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    ticks: { color: '#e4e9f0' },
                    grid: { color: '#404a60' },
                    title: { display: true, text: '勝率 (%)', color: '#e4e9f0' },
                    min: 0,
                    max: 100
                },
                y2: {
                    type: 'linear',
                    position: 'right',
                    ticks: { color: '#e4e9f0' },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: '平均損益', color: '#e4e9f0' }
                }
            },
            plugins: {
                legend: { labels: { color: '#e4e9f0' } }
            }
        }
    });
    // グラフ3: 時間足別勝率
    const timeframes = {};
    filtered.forEach(r => {
        if (r.hasResult) {
            const tf = r.timeframe;
            if (!timeframes[tf]) {
                timeframes[tf] = { total: 0, wins: 0 };
            }
            timeframes[tf].total++;
            if (r.profit > 0) timeframes[tf].wins++;
        }
    });
    const tfLabels = Object.keys(timeframes);
    const tfWinRates = tfLabels.map(tf => {
        const data = timeframes[tf];
        return data.total > 0 ? (data.wins / data.total) * 100 : 0;
    });
    const ctx3 = document.getElementById('timeframeChart').getContext('2d');
    if (timeframeChart) timeframeChart.destroy();
    timeframeChart = new Chart(ctx3, {
        type: 'bar',
        data: {
            labels: tfLabels,
            datasets: [{
                label: '勝率 (%)',
                data: tfWinRates,
                backgroundColor: 'rgba(150,100,255,0.5)',
                borderColor: '#9466ff',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                x: {
                    ticks: { color: '#e4e9f0' },
                    grid: { color: '#404a60' }
                },
                y: {
                    ticks: { color: '#e4e9f0' },
                    grid: { color: '#404a60' },
                    min: 0,
                    max: 100
                }
            },
            plugins: {
                legend: { labels: { color: '#e4e9f0' } }
            }
        }
    });
}

/**
 * JSONエクスポート
 */
function exportToJson() {
    const obj = {
        version: 1,
        records: records
    };
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const filename = `trades_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.json`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * JSONインポート
 * @param {Event} event
 */
function importFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const obj = JSON.parse(e.target.result);
            if (obj.version !== 1 || !Array.isArray(obj.records)) {
                alert('バージョン不一致または形式が不正です。');
                event.target.value = '';
                return;
            }
            let importedCount = 0;
            obj.records.forEach(importRec => {
                if (!records.find(r => r.id === importRec.id)) {
                    records.push(importRec);
                    importedCount++;
                }
            });
            if (importedCount > 0) {
                saveRecords(records);
                alert(`${importedCount} 件のレコードをインポートしました。`);
            } else {
                alert('新規レコードはありませんでした。');
            }
            updateResultEntryOptions();
            updateRecordsTable();
            updateCharts();
        } catch (err) {
            alert('JSONの読み込みに失敗しました。');
            console.error(err);
        } finally {
            // ファイル選択状態をリセット
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}