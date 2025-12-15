/*
 * トレード判定＋学習＆トレードノート アプリ
 * 完全フロントエンド。localStorage でデータ保存。
 */

(function() {
    const STORAGE_KEY = 'trade_records_v1';
    let records = [];
    let chartProfit, chartDirection, chartTimeframe;

    // ロード時
    document.addEventListener('DOMContentLoaded', () => {
        // タブ切り替え
        setupTabs();
        // データロード
        loadRecords();
        // 初期描画
        renderRecordsTable();
        updateSelectEntry();
        renderCharts();
        // エントリーフォーム
        setupEntryForm();
        // 結果フォーム
        setupResultForm();
        // JSONエクスポート/インポート
        setupJsonImportExport();
        // 編集モーダル
        setupEditModal();
    });

    /** タブ切り替えのセットアップ */
    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // hide all contents
                document.querySelectorAll('.tab-content').forEach(sec => sec.classList.remove('active'));
                const tabName = btn.dataset.tab;
                document.getElementById('tab-' + tabName).classList.add('active');
            });
        });
    }

    /** localStorageからレコードを読み込み */
    function loadRecords() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                records = JSON.parse(saved);
            } catch (e) {
                console.error('保存データの読み込みに失敗しました', e);
                records = [];
            }
        }
    }

    /** localStorageにレコードを保存 */
    function saveRecords() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

    /** ユニークID生成 */
    function generateId() {
        if (window.crypto && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(16).substring(2);
        return `${ts}-${rand}`;
    }

    /** エントリーフォーム設定 */
    function setupEntryForm() {
        const form = document.getElementById('entry-form');
        const predictBtn = document.getElementById('btn-predict');
        const predictionResult = document.getElementById('prediction-result');
        let lastPrediction = null;

        predictBtn.addEventListener('click', () => {
            const formData = new FormData(form);
            const entry = formDataToEntryObject(formData);
            const prediction = recommendationAlgorithm(entry);
            lastPrediction = prediction;
            predictionResult.style.display = 'block';
            predictionResult.innerHTML = `<strong>推奨:</strong> ${translateDirection(prediction.recommendation)} / <strong>想定値幅:</strong> ${prediction.expectedMove} (${prediction.expectedMoveUnit}) / <strong>自信度:</strong> ${prediction.confidence.toFixed(0)}% <br>${prediction.reason}`;
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const entry = formDataToEntryObject(formData);
            // まだ予測していなければ計算
            if (!lastPrediction) {
                lastPrediction = recommendationAlgorithm(entry);
            }
            // 新規レコード生成
            const now = new Date().toISOString();
            const record = {
                id: generateId(),
                createdAt: now,
                updatedAt: now,
                hasResult: false,
                // エントリー関連
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
                // 特徴量
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
                marketMemo: entry.marketMemo,
                // 判定結果
                recommendation: lastPrediction.recommendation,
                expectedMove: lastPrediction.expectedMove,
                expectedMoveUnit: lastPrediction.expectedMoveUnit,
                confidence: lastPrediction.confidence,
                reason: lastPrediction.reason,
                // 結果情報
                datetimeExit: null,
                exitPrice: null,
                directionTaken: null,
                highDuringTrade: null,
                lowDuringTrade: null,
                profit: null,
                note: '',
                imageData: null
            };
            records.push(record);
            saveRecords();
            renderRecordsTable();
            updateSelectEntry();
            renderCharts();
            // reset form
            form.reset();
            lastPrediction = null;
            predictionResult.style.display = 'none';
            alert('エントリーが保存されました。');
        });
    }

    /** フォームデータをオブジェクトに変換 */
    function formDataToEntryObject(formData) {
        const obj = {};
        for (const [key, value] of formData.entries()) {
            obj[key] = value;
        }
        // 型変換
        obj.entryPrice = parseFloat(obj.entryPrice) || null;
        obj.size = parseInt(obj.size) || null;
        obj.feePerUnit = obj.feePerUnit ? parseFloat(obj.feePerUnit) : 0;
        obj.plannedStopPrice = obj.plannedStopPrice ? parseFloat(obj.plannedStopPrice) : null;
        obj.plannedLimitPrice = obj.plannedLimitPrice ? parseFloat(obj.plannedLimitPrice) : null;
        obj.cutLossPrice = obj.cutLossPrice ? parseFloat(obj.cutLossPrice) : null;
        obj.marketMemo = obj.marketMemo || '';
        return obj;
    }

    /** 結果入力フォームのセットアップ */
    function setupResultForm() {
        const select = document.getElementById('selectEntry');
        const resultFields = document.getElementById('result-fields');
        const form = document.getElementById('result-form');

        // 選択が変更されたとき
        select.addEventListener('change', () => {
            const id = select.value;
            if (!id) {
                resultFields.style.display = 'none';
                return;
            }
            const rec = records.find(r => r.id === id);
            if (!rec) return;
            resultFields.style.display = 'block';
            // fill default values
            form.datetimeExit.value = rec.datetimeExit ? rec.datetimeExit.substring(0,16) : '';
            form.exitPrice.value = rec.exitPrice ?? '';
            form.directionTaken.value = rec.directionTaken ?? '';
            form.highDuringTrade.value = rec.highDuringTrade ?? '';
            form.lowDuringTrade.value = rec.lowDuringTrade ?? '';
            form.profit.value = rec.profit ?? '';
            form.note.value = rec.note ?? '';
        });

        // 利益計算
        ['exitPrice','directionTaken','highDuringTrade','lowDuringTrade'].forEach(name => {
            form.elements[name].addEventListener('input', () => {
                calculateProfit();
            });
        });

        function calculateProfit() {
            const id = select.value;
            const rec = records.find(r => r.id === id);
            if (!rec) return;
            const exitPrice = parseFloat(form.exitPrice.value);
            const direction = form.directionTaken.value;
            if (!exitPrice || !direction) {
                form.profit.value = '';
                return;
            }
            let profit = 0;
            const size = rec.size;
            const fee = rec.feePerUnit;
            const entryPrice = rec.entryPrice;
            if (direction === 'long') {
                profit = (exitPrice - entryPrice - fee) * size;
            } else if (direction === 'short') {
                profit = (entryPrice - exitPrice - fee) * size;
            } else {
                profit = 0;
            }
            form.profit.value = profit.toFixed(2);
        }

        // 保存
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = select.value;
            const recIndex = records.findIndex(r => r.id === id);
            if (recIndex === -1) return;
            const rec = records[recIndex];
            // 更新
            rec.datetimeExit = form.datetimeExit.value;
            rec.exitPrice = form.exitPrice.value ? parseFloat(form.exitPrice.value) : null;
            rec.directionTaken = form.directionTaken.value;
            rec.highDuringTrade = form.highDuringTrade.value ? parseFloat(form.highDuringTrade.value) : null;
            rec.lowDuringTrade = form.lowDuringTrade.value ? parseFloat(form.lowDuringTrade.value) : null;
            rec.profit = form.profit.value ? parseFloat(form.profit.value) : null;
            rec.note = form.note.value;
            // image
            const fileInput = form.querySelector('input[name="image"]');
            if (fileInput.files && fileInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    rec.imageData = evt.target.result;
                    finishUpdate();
                };
                reader.readAsDataURL(fileInput.files[0]);
            } else {
                finishUpdate();
            }
            function finishUpdate() {
                rec.hasResult = true;
                rec.updatedAt = new Date().toISOString();
                records[recIndex] = rec;
                saveRecords();
                renderRecordsTable();
                updateSelectEntry();
                renderCharts();
                form.reset();
                resultFields.style.display = 'none';
                alert('結果が保存されました。');
            }
        });
    }

    /** エントリーセレクトの更新 */
    function updateSelectEntry() {
        const select = document.getElementById('selectEntry');
        if (!select) return;
        // remove all options
        select.innerHTML = '<option value="">選択してください</option>';
        const pending = records.filter(r => !r.hasResult);
        pending.forEach(rec => {
            const opt = document.createElement('option');
            const dt = rec.datetimeEntry ? rec.datetimeEntry.replace('T',' ') : '';
            opt.value = rec.id;
            opt.textContent = `${dt} (${rec.symbol})`;
            select.appendChild(opt);
        });
    }

    /** テーブル描画 */
    function renderRecordsTable() {
        const tbody = document.querySelector('#records-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        // sort by datetimeEntry desc
        const sorted = [...records].sort((a,b) => {
            const da = a.datetimeEntry || '';
            const db = b.datetimeEntry || '';
            return db.localeCompare(da);
        });
        sorted.forEach(rec => {
            const tr = document.createElement('tr');
            // ID
            const tdId = document.createElement('td');
            tdId.textContent = rec.id;
            tr.appendChild(tdId);
            // datetimeEntry
            const tdDate = document.createElement('td');
            tdDate.textContent = rec.datetimeEntry ? rec.datetimeEntry.replace('T',' ') : '';
            tr.appendChild(tdDate);
            // symbol
            const tdSym = document.createElement('td');
            tdSym.textContent = rec.symbol;
            tr.appendChild(tdSym);
            // planned direction
            const tdDir = document.createElement('td');
            tdDir.textContent = translateDirection(rec.directionPlanned);
            tr.appendChild(tdDir);
            // hasResult
            const tdHas = document.createElement('td');
            tdHas.textContent = rec.hasResult ? '済' : '未';
            tr.appendChild(tdHas);
            // profit
            const tdProfit = document.createElement('td');
            tdProfit.textContent = (rec.hasResult && rec.profit !== null) ? rec.profit.toFixed(2) : '-';
            tr.appendChild(tdProfit);
            // edit button
            const tdEdit = document.createElement('td');
            const btn = document.createElement('button');
            btn.textContent = '編集';
            btn.addEventListener('click', () => openEditModal(rec.id));
            tdEdit.appendChild(btn);
            tr.appendChild(tdEdit);
            tbody.appendChild(tr);
        });
    }

    /** 分析用グラフの描画 */
    function renderCharts() {
        // 破棄
        if (chartProfit) { chartProfit.destroy(); }
        if (chartDirection) { chartDirection.destroy(); }
        if (chartTimeframe) { chartTimeframe.destroy(); }

        // 利益累積
        const completed = records.filter(r => r.hasResult && r.profit !== null);
        const sortedByExit = completed.slice().sort((a,b) => {
            const da = a.datetimeExit || a.updatedAt;
            const db = b.datetimeExit || b.updatedAt;
            return new Date(da) - new Date(db);
        });
        let cumProfit = 0;
        const labelsProfit = [];
        const dataProfit = [];
        sortedByExit.forEach(rec => {
            cumProfit += rec.profit;
            labelsProfit.push(rec.datetimeExit ? rec.datetimeExit.replace('T',' ').substring(0,16) : rec.updatedAt.substring(0,16));
            dataProfit.push(cumProfit);
        });
        const ctxProfit = document.getElementById('chart-profit').getContext('2d');
        chartProfit = new Chart(ctxProfit, {
            type: 'line',
            data: {
                labels: labelsProfit,
                datasets: [{
                    label: '累積損益',
                    data: dataProfit,
                    borderColor: '#00ffc8',
                    backgroundColor: 'rgba(0,255,200,0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        ticks: { color: '#9aa4b5' },
                        grid: { color: '#2a3240' }
                    },
                    y: {
                        ticks: { color: '#9aa4b5' },
                        grid: { color: '#2a3240' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#e4e9f0' } }
                }
            }
        });

        // 方向別勝率・平均損益
        const directions = ['long','short','flat'];
        const winRate = {};
        const avgProfit = {};
        directions.forEach(d => {
            const recs = completed.filter(r => r.directionTaken === d);
            if (recs.length) {
                const wins = recs.filter(r => r.profit > 0).length;
                const avg = recs.reduce((sum,r) => sum + r.profit, 0) / recs.length;
                winRate[d] = wins / recs.length * 100;
                avgProfit[d] = avg;
            } else {
                winRate[d] = 0;
                avgProfit[d] = 0;
            }
        });
        const ctxDir = document.getElementById('chart-direction').getContext('2d');
        chartDirection = new Chart(ctxDir, {
            type: 'bar',
            data: {
                labels: directions.map(translateDirection),
                datasets: [
                    {
                        label: '勝率(%)',
                        data: directions.map(d => winRate[d]),
                        backgroundColor: '#00ffc8',
                        yAxisID: 'y',
                    },
                    {
                        label: '平均損益',
                        data: directions.map(d => avgProfit[d]),
                        backgroundColor: '#0088ff',
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        ticks: { color: '#e4e9f0' },
                        grid: { color: '#2a3240' }
                    },
                    y: {
                        position: 'left',
                        ticks: { color: '#00ffc8' },
                        grid: { color: '#2a3240' }
                    },
                    y1: {
                        position: 'right',
                        ticks: { color: '#0088ff' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#e4e9f0' } }
                }
            }
        });

        // 時間足別勝率
        const timeframeGroups = {};
        completed.forEach(r => {
            const tf = r.timeframe || 'その他';
            if (!timeframeGroups[tf]) timeframeGroups[tf] = [];
            timeframeGroups[tf].push(r);
        });
        const tfLabels = [];
        const tfWinRates = [];
        Object.keys(timeframeGroups).forEach(tf => {
            const recs = timeframeGroups[tf];
            const wins = recs.filter(r => r.profit > 0).length;
            const rate = recs.length ? wins / recs.length * 100 : 0;
            tfLabels.push(tf);
            tfWinRates.push(rate);
        });
        const ctxTf = document.getElementById('chart-timeframe').getContext('2d');
        chartTimeframe = new Chart(ctxTf, {
            type: 'bar',
            data: {
                labels: tfLabels,
                datasets: [
                    {
                        label: '勝率(%)',
                        data: tfWinRates,
                        backgroundColor: '#ff8c00'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        ticks: { color: '#e4e9f0' },
                        grid: { color: '#2a3240' }
                    },
                    y: {
                        ticks: { color: '#e4e9f0' },
                        grid: { color: '#2a3240' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#e4e9f0' } }
                }
            }
        });
    }

    /** 方向を日本語に変換 */
    function translateDirection(dir) {
        if (dir === 'long') return 'ロング';
        if (dir === 'short') return 'ショート';
        if (dir === 'flat') return 'ノーポジ';
        return dir || '';
    }

    /** シンプルな判定アルゴリズム
     *   過去の実績から方向の勝率と平均伸び幅を算出
     */
    function recommendationAlgorithm(entry) {
        // 結果ありのデータのみ
        const hist = records.filter(r => r.hasResult && r.highDuringTrade !== null && r.lowDuringTrade !== null);
        // 方向別統計
        const dirStats = { long:{win:0,total:0,moves:[]}, short:{win:0,total:0,moves:[]}, flat:{win:0,total:0,moves:[]} };
        hist.forEach(rec => {
            const dir = rec.directionTaken || 'flat';
            if (!dirStats[dir]) return;
            dirStats[dir].total++;
            if (rec.profit > 0) dirStats[dir].win++;
            let move = 0;
            if (dir === 'long') {
                move = rec.highDuringTrade - rec.entryPrice;
            } else if (dir === 'short') {
                move = rec.entryPrice - rec.lowDuringTrade;
            } else {
                move = 0;
            }
            dirStats[dir].moves.push(move);
        });
        // 勝率計算
        const dirWinRate = {};
        const dirAvgMove = {};
        Object.keys(dirStats).forEach(dir => {
            const s = dirStats[dir];
            dirWinRate[dir] = s.total ? (s.win / s.total) : 0;
            dirAvgMove[dir] = s.moves.length ? (s.moves.reduce((a,b) => a+b,0) / s.moves.length) : 0;
        });
        // ベスト方向
        let bestDir = 'flat';
        let bestRate = 0;
        ['long','short'].forEach(d => {
            if (dirWinRate[d] > bestRate) {
                bestDir = d;
                bestRate = dirWinRate[d];
            }
        });
        // 信頼度を0-100範囲
        const confidence = bestRate * 100;
        // 想定値幅: ベスト方向の平均最大伸び
        const expectedMove = Math.abs(dirAvgMove[bestDir] || 0).toFixed(1);
        // 理由文章
        const reason = `過去データから ${translateDirection(bestDir)} の勝率は ${(bestRate*100).toFixed(1)}%`; 
        return {
            recommendation: bestDir,
            expectedMove: expectedMove,
            expectedMoveUnit: 'ポイント',
            confidence: confidence,
            reason: reason
        };
    }

    /** JSONエクスポート/インポート設定 */
    function setupJsonImportExport() {
        const exportBtn = document.getElementById('export-json');
        const importInput = document.getElementById('import-json');
        const importInfo = document.getElementById('import-info');
        exportBtn.addEventListener('click', () => {
            const data = { version: 1, records: records };
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const filename = `trade_records_${now.toISOString().replace(/[:.]/g,'-')}.json`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        // インポート
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    if (json.version !== 1) {
                        alert('バージョンが対応していません');
                        return;
                    }
                        const result = mergeImportedRecords(json.records);
                        saveRecords();
                        renderRecordsTable();
                        updateSelectEntry();
                        renderCharts();
                        importInfo.textContent = `${result.added}件追加、${result.updated}件更新しました。`;
                } catch(err) {
                    alert('インポートに失敗しました: ' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }

    /** インポート時にマージ */
    function mergeImportedRecords(imported) {
        let added = 0;
        let updated = 0;
        imported.forEach(imp => {
            const idx = records.findIndex(r => r.id === imp.id);
            if (idx === -1) {
                // 新規追加
                records.push(imp);
                added++;
            } else {
                // 更新判定
                const existing = records[idx];
                const newDate = imp.updatedAt || imp.createdAt;
                const oldDate = existing.updatedAt || existing.createdAt;
                if (new Date(newDate) > new Date(oldDate)) {
                    records[idx] = imp;
                    updated++;
                }
            }
        });
        return {added, updated};
    }

    /** 編集モーダル */
    function setupEditModal() {
        const modal = document.getElementById('edit-modal');
        const closeBtn = document.getElementById('close-modal');
        const editForm = document.getElementById('edit-form');
        // close
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        // toggle result section
        editForm.elements['hasResult'].addEventListener('change', () => {
            const chk = editForm.elements['hasResult'].checked;
            editForm.querySelector('.result-edit-section').style.display = chk ? 'block' : 'none';
        });
        // update profit automatically
        ['exitPrice','directionTaken','highDuringTrade','lowDuringTrade','entryPrice','size','feePerUnit'].forEach(name => {
            const el = editForm.elements[name];
            if (el) el.addEventListener('input', () => computeEditProfit());
        });
        function computeEditProfit() {
            if (!editForm.elements['hasResult'].checked) return;
            const entryPrice = parseFloat(editForm.elements['entryPrice'].value);
            const size = parseInt(editForm.elements['size'].value);
            const fee = parseFloat(editForm.elements['feePerUnit'].value) || 0;
            const exitPrice = parseFloat(editForm.elements['exitPrice'].value);
            const dir = editForm.elements['directionTaken'].value;
            if (!entryPrice || !size || !exitPrice || !dir) {
                editForm.elements['profit'].value = '';
                return;
            }
            let profit;
            if (dir === 'long') {
                profit = (exitPrice - entryPrice - fee) * size;
            } else if (dir === 'short') {
                profit = (entryPrice - exitPrice - fee) * size;
            } else {
                profit = 0;
            }
            editForm.elements['profit'].value = profit.toFixed(2);
        }
        // submit update
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = editForm.elements['id'].value;
            const idx = records.findIndex(r => r.id === id);
            if (idx === -1) return;
            const rec = records[idx];
            // update entry fields
            rec.datetimeEntry = editForm.elements['datetimeEntry'].value;
            rec.symbol = editForm.elements['symbol'].value;
            rec.timeframe = editForm.elements['timeframe'].value;
            rec.tradeType = editForm.elements['tradeType'].value;
            rec.directionPlanned = editForm.elements['directionPlanned'].value;
            rec.entryPrice = parseFloat(editForm.elements['entryPrice'].value);
            rec.size = parseInt(editForm.elements['size'].value);
            rec.feePerUnit = parseFloat(editForm.elements['feePerUnit'].value) || 0;
            rec.plannedStopPrice = editForm.elements['plannedStopPrice'].value ? parseFloat(editForm.elements['plannedStopPrice'].value) : null;
            rec.plannedLimitPrice = editForm.elements['plannedLimitPrice'].value ? parseFloat(editForm.elements['plannedLimitPrice'].value) : null;
            rec.cutLossPrice = editForm.elements['cutLossPrice'].value ? parseFloat(editForm.elements['cutLossPrice'].value) : null;
            rec.trend_5_20_40 = editForm.elements['trend_5_20_40'].value;
            rec.price_vs_ema200 = editForm.elements['price_vs_ema200'].value;
            rec.ema_band_color = editForm.elements['ema_band_color'].value;
            rec.zone = editForm.elements['zone'].value;
            rec.cmf_sign = editForm.elements['cmf_sign'].value;
            rec.cmf_sma_dir = editForm.elements['cmf_sma_dir'].value;
            rec.roc_sign = editForm.elements['roc_sign'].value;
            rec.roc_sma_dir = editForm.elements['roc_sma_dir'].value;
            rec.macd_state = editForm.elements['macd_state'].value;
            rec.rsi_zone = editForm.elements['rsi_zone'].value;
            rec.marketMemo = editForm.elements['marketMemo'].value;
            // hasResult
            const hasRes = editForm.elements['hasResult'].checked;
            rec.hasResult = hasRes;
            if (hasRes) {
                rec.datetimeExit = editForm.elements['datetimeExit'].value;
                rec.exitPrice = editForm.elements['exitPrice'].value ? parseFloat(editForm.elements['exitPrice'].value) : null;
                rec.directionTaken = editForm.elements['directionTaken'].value;
                rec.highDuringTrade = editForm.elements['highDuringTrade'].value ? parseFloat(editForm.elements['highDuringTrade'].value) : null;
                rec.lowDuringTrade = editForm.elements['lowDuringTrade'].value ? parseFloat(editForm.elements['lowDuringTrade'].value) : null;
                rec.profit = editForm.elements['profit'].value ? parseFloat(editForm.elements['profit'].value) : null;
                rec.note = editForm.elements['note'].value;
                // Chart image not editable in modal for simplicity
            } else {
                rec.datetimeExit = null;
                rec.exitPrice = null;
                rec.directionTaken = null;
                rec.highDuringTrade = null;
                rec.lowDuringTrade = null;
                rec.profit = null;
                rec.note = '';
            }
            rec.updatedAt = new Date().toISOString();
            records[idx] = rec;
            saveRecords();
            renderRecordsTable();
            updateSelectEntry();
            renderCharts();
            modal.style.display = 'none';
            alert('レコードを更新しました');
        });
    }

    /** 編集モーダル表示 */
    function openEditModal(id) {
        const rec = records.find(r => r.id === id);
        if (!rec) return;
        const modal = document.getElementById('edit-modal');
        const form = document.getElementById('edit-form');
        // fill values
        form.elements['id'].value = rec.id;
        form.elements['datetimeEntry'].value = rec.datetimeEntry ? rec.datetimeEntry.substring(0,16) : '';
        form.elements['symbol'].value = rec.symbol;
        form.elements['timeframe'].value = rec.timeframe;
        form.elements['tradeType'].value = rec.tradeType;
        form.elements['directionPlanned'].value = rec.directionPlanned;
        form.elements['entryPrice'].value = rec.entryPrice;
        form.elements['size'].value = rec.size;
        form.elements['feePerUnit'].value = rec.feePerUnit;
        form.elements['plannedStopPrice'].value = rec.plannedStopPrice ?? '';
        form.elements['plannedLimitPrice'].value = rec.plannedLimitPrice ?? '';
        form.elements['cutLossPrice'].value = rec.cutLossPrice ?? '';
        form.elements['trend_5_20_40'].value = rec.trend_5_20_40;
        form.elements['price_vs_ema200'].value = rec.price_vs_ema200;
        form.elements['ema_band_color'].value = rec.ema_band_color;
        form.elements['zone'].value = rec.zone;
        form.elements['cmf_sign'].value = rec.cmf_sign;
        form.elements['cmf_sma_dir'].value = rec.cmf_sma_dir;
        form.elements['roc_sign'].value = rec.roc_sign;
        form.elements['roc_sma_dir'].value = rec.roc_sma_dir;
        form.elements['macd_state'].value = rec.macd_state;
        form.elements['rsi_zone'].value = rec.rsi_zone;
        form.elements['marketMemo'].value = rec.marketMemo;
        form.elements['hasResult'].checked = rec.hasResult;
        const resultSection = form.querySelector('.result-edit-section');
        resultSection.style.display = rec.hasResult ? 'block' : 'none';
        if (rec.hasResult) {
            form.elements['datetimeExit'].value = rec.datetimeExit ? rec.datetimeExit.substring(0,16) : '';
            form.elements['exitPrice'].value = rec.exitPrice ?? '';
            form.elements['directionTaken'].value = rec.directionTaken ?? '';
            form.elements['highDuringTrade'].value = rec.highDuringTrade ?? '';
            form.elements['lowDuringTrade'].value = rec.lowDuringTrade ?? '';
            form.elements['profit'].value = rec.profit ?? '';
            form.elements['note'].value = rec.note ?? '';
        } else {
            form.elements['datetimeExit'].value = '';
            form.elements['exitPrice'].value = '';
            form.elements['directionTaken'].value = '';
            form.elements['highDuringTrade'].value = '';
            form.elements['lowDuringTrade'].value = '';
            form.elements['profit'].value = '';
            form.elements['note'].value = '';
        }
        modal.style.display = 'flex';
    }
})();