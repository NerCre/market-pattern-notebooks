// Main JavaScript for EdgeScope SPA

(function () {
    const STORAGE_KEY = 'tradeRecords_v1';
    let tradeRecords = [];
    let editingEntryId = null;
    let editingExitId = null;
    let currentImageData = null;
    let recognition = null;
    let isRecording = false;
    let profitChart = null;

    document.addEventListener('DOMContentLoaded', () => {
        // Initialize data from localStorage
        tradeRecords = loadTradeRecords();
        // Setup UI events
        setupTabs();
        setupEntryTab();
        setupExitTab();
        setupStatsTab();
        // Initial renders
        renderExitOptions();
        renderStats();
        renderRecordsTable();
    });

    /**
     * Load trade records from localStorage. If corrupted, return empty array.
     */
    function loadTradeRecords() {
        try {
            const json = localStorage.getItem(STORAGE_KEY);
            if (!json) return [];
            const arr = JSON.parse(json);
            if (Array.isArray(arr)) {
                return arr;
            }
        } catch (e) {
            console.error('Failed to parse trade records from localStorage:', e);
        }
        // If parsing fails, reset storage
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        return [];
    }

    /**
     * Save trade records to localStorage
     */
    function saveTradeRecords(records) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            console.error('Failed to save trade records:', e);
        }
    }

    /**
     * Generate a UUID (v4) using crypto API if available
     */
    function generateUUID() {
        if (crypto && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Set up tab navigation buttons
     */
    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                // Remove active classes
                tabButtons.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(sec => sec.classList.remove('active'));
                // Activate selected
                btn.classList.add('active');
                const section = document.getElementById('tab-' + tabName);
                if (section) section.classList.add('active');
                // When switching to stats, redraw chart to ensure sizing is correct
                if (tabName === 'stats') {
                    renderProfitChart();
                }
            });
        });
    }

    /**
     * Set up entry tab event handlers
     */
    function setupEntryTab() {
        // Buttons
        const btnJudge = document.getElementById('btnJudge');
        const btnJudgeAndSave = document.getElementById('btnJudgeAndSave');
        const btnClearEntry = document.getElementById('btnClearEntry');
        btnJudge.addEventListener('click', () => {
            const entry = collectEntryValues();
            const result = judgeTrade(entry);
            showJudgeResult(result, entry);
        });
        btnJudgeAndSave.addEventListener('click', () => {
            const entry = collectEntryValues();
            const result = judgeTrade(entry);
            showJudgeResult(result, entry);
            if (editingEntryId) {
                // Update existing record
                updateExistingEntry(editingEntryId, entry, result);
            } else {
                saveNewTrade(entry, result);
            }
            // After saving, clear editing state and refresh
            editingEntryId = null;
            clearEntryForm();
            renderExitOptions();
            renderStats();
            renderRecordsTable();
        });
        btnClearEntry.addEventListener('click', () => {
            editingEntryId = null;
            clearEntryForm();
            hideJudgeResult();
        });
        // Image file input
        const imageInput = document.getElementById('imageData');
        imageInput.addEventListener('change', async (ev) => {
            const file = ev.target.files[0];
            if (file) {
                const dataUrl = await readImageFile(file);
                currentImageData = dataUrl;
                const preview = document.getElementById('previewImage');
                preview.src = dataUrl;
                preview.style.display = 'block';
            } else {
                currentImageData = null;
                const preview = document.getElementById('previewImage');
                preview.src = '';
                preview.style.display = 'none';
            }
        });
        // Audio recording
        const recordBtn = document.getElementById('recordAudio');
        const recordingStatus = document.getElementById('recordingStatus');
        recordBtn.addEventListener('click', () => {
            if (!isRecording) {
                startRecording();
                recordBtn.textContent = '■ 停止';
                recordingStatus.textContent = '録音中...';
            } else {
                stopRecording();
                recordBtn.textContent = '🎙 音声入力';
                recordingStatus.textContent = '';
            }
        });
    }

    /**
     * Set up exit tab
     */
    function setupExitTab() {
        const exitSelect = document.getElementById('exitRecordSelect');
        exitSelect.addEventListener('change', () => {
            const id = exitSelect.value;
            if (id) {
                loadExitRecord(id);
            }
        });
        const btnSaveExit = document.getElementById('btnSaveExit');
        btnSaveExit.addEventListener('click', () => {
            if (editingExitId) {
                saveExitResult(editingExitId);
            }
        });
        const btnClearExit = document.getElementById('btnClearExit');
        btnClearExit.addEventListener('click', () => {
            clearExitForm();
        });
    }

    /**
     * Set up stats tab
     */
    function setupStatsTab() {
        // Export JSON
        document.getElementById('btnExportJSON').addEventListener('click', () => {
            exportJSON();
        });
        // Import JSON
        document.getElementById('importFile').addEventListener('change', (ev) => {
            const file = ev.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        const imported = JSON.parse(e.target.result);
                        if (!Array.isArray(imported)) throw new Error('Invalid JSON data');
                        if (!confirm('現在のデータをインポートしたデータで上書きします。よろしいですか？')) return;
                        tradeRecords = imported;
                        saveTradeRecords(tradeRecords);
                        renderExitOptions();
                        renderStats();
                        renderRecordsTable();
                        alert('データのインポートが完了しました。');
                    } catch (err) {
                        alert('インポートに失敗しました: ' + err.message);
                    } finally {
                        // Reset file input
                        ev.target.value = '';
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    /**
     * Collect values from entry form and return a partially complete TradeRecord (without id/createdAt/updatedAt)
     */
    function collectEntryValues() {
        const val = id => document.getElementById(id).value;
        const numVal = id => {
            const v = document.getElementById(id).value;
            return v !== '' ? Number(v) : null;
        };
        return {
            datetimeEntry: val('datetimeEntry') || null,
            symbol: val('symbol'),
            timeframe: val('timeframe'),
            tradeType: val('tradeType'),
            directionPlanned: val('directionPlanned'),
            entryPrice: numVal('entryPrice'),
            size: numVal('size'),
            feePerUnit: numVal('feePerUnit'),
            plannedStopPrice: numVal('plannedStopPrice'),
            plannedLimitPrice: numVal('plannedLimitPrice'),
            cutLossPrice: numVal('cutLossPrice'),
            // Indicators
            prevWave: val('prevWave'),
            trend_5_20_40: val('trend_5_20_40'),
            price_vs_ema200: val('price_vs_ema200'),
            ema_band_color: val('ema_band_color'),
            zone: val('zone'),
            cmf_sign: val('cmf_sign'),
            cmf_sma_dir: val('cmf_sma_dir'),
            macd_state: val('macd_state'),
            roc_sign: val('roc_sign'),
            roc_sma_dir: val('roc_sma_dir'),
            rsi_zone: val('rsi_zone'),
            // Conditions
            minWinRate: numVal('minWinRate'),
            // Memo & attachments
            marketMemo: document.getElementById('marketMemo').value || '',
            notionUrl: document.getElementById('notionUrl').value || '',
            imageData: currentImageData || null,
            // judgement placeholders (will be filled later)
            recommendation: null,
            expectedMove: null,
            expectedMoveUnit: null,
            confidence: null,
            winRate: null,
            avgProfit: null,
            avgLoss: null,
            pseudoCaseCount: null,
            // result placeholders
            hasResult: false,
            datetimeExit: null,
            exitPrice: null,
            directionTaken: null,
            highDuringTrade: null,
            lowDuringTrade: null,
            profit: null,
            resultMemo: ''
        };
    }

    /**
     * Clear entry form
     */
    function clearEntryForm() {
        const idsToClear = [
            'datetimeEntry', 'entryPrice', 'size', 'feePerUnit', 'plannedStopPrice', 'plannedLimitPrice', 'cutLossPrice', 'marketMemo', 'notionUrl'
        ];
        idsToClear.forEach(id => {
            const el = document.getElementById(id);
            el.value = '';
        });
        // Reset selects to default values
        document.getElementById('symbol').value = 'nk225mc';
        document.getElementById('timeframe').value = '1分';
        document.getElementById('tradeType').value = 'real';
        document.getElementById('directionPlanned').value = 'long';
        document.getElementById('prevWave').value = 'HH';
        document.getElementById('trend_5_20_40').value = 'Stage1';
        document.getElementById('price_vs_ema200').value = 'above';
        document.getElementById('ema_band_color').value = 'dark_green';
        document.getElementById('zone').value = 'pivot';
        document.getElementById('cmf_sign').value = 'positive';
        document.getElementById('cmf_sma_dir').value = 'gc';
        document.getElementById('macd_state').value = 'neutral';
        document.getElementById('roc_sign').value = 'positive';
        document.getElementById('roc_sma_dir').value = 'up';
        document.getElementById('rsi_zone').value = 'over70';
        // Reset minWinRate
        document.getElementById('minWinRate').value = 30;
        // Clear image data
        currentImageData = null;
        const preview = document.getElementById('previewImage');
        preview.src = '';
        preview.style.display = 'none';
        // Reset recording status
        const recordBtn = document.getElementById('recordAudio');
        recordBtn.textContent = '🎙 音声入力';
        document.getElementById('recordingStatus').textContent = '';
    }

    /**
     * Hide judge result panel
     */
    function hideJudgeResult() {
        const resultDiv = document.getElementById('judgeResult');
        resultDiv.style.display = 'none';
        resultDiv.innerHTML = '';
    }

    /**
     * Read image file and return data URL
     */
    function readImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    /**
     * Start audio recording using Web Speech API
     */
    function startRecording() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('このブラウザでは音声認識がサポートされていません。');
            return;
        }
        recognition = new SpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;
            const memoEl = document.getElementById('marketMemo');
            memoEl.value = memoEl.value + (memoEl.value ? '\n' : '') + transcript;
        };
        recognition.onerror = function (event) {
            console.error('Speech recognition error', event.error);
        };
        recognition.onend = function () {
            // Stop when finished
            isRecording = false;
            const recordBtn = document.getElementById('recordAudio');
            const status = document.getElementById('recordingStatus');
            recordBtn.textContent = '🎙 音声入力';
            status.textContent = '';
        };
        recognition.start();
        isRecording = true;
    }

    /**
     * Stop audio recording
     */
    function stopRecording() {
        if (recognition) {
            recognition.stop();
        }
        isRecording = false;
    }

    /**
     * Compute judgement based on entry data and existing records.
     * Returns an object with recommendation, winRate, confidence, expectedMove, avgProfit, avgLoss, pseudoCaseCount.
     */
    function judgeTrade(entry) {
        // Filter only same symbol and with result
        const candidates = tradeRecords.filter(rec => rec.symbol === entry.symbol && rec.hasResult);
        // Determine similar cases
        const features = [
            'prevWave', 'trend_5_20_40', 'price_vs_ema200', 'ema_band_color', 'zone',
            'cmf_sign', 'cmf_sma_dir', 'macd_state', 'roc_sign', 'roc_sma_dir', 'rsi_zone'
        ];
        const similarCases = [];
        candidates.forEach(rec => {
            let matches = 0;
            features.forEach(key => {
                if (entry[key] && rec[key] && entry[key] === rec[key]) matches++;
            });
            const ratio = matches / features.length;
            if (ratio >= 0.5) {
                similarCases.push(rec);
            }
        });
        const pseudoCaseCount = similarCases.length;
        if (pseudoCaseCount === 0) {
            return {
                recommendation: 'flat',
                winRate: 0,
                confidence: 0,
                expectedMove: null,
                expectedMoveUnit: null,
                avgProfit: null,
                avgLoss: null,
                pseudoCaseCount
            };
        }
        // Group by directionTaken
        const statsByDir = {};
        ['long', 'short'].forEach(dir => {
            statsByDir[dir] = {
                count: 0,
                winCount: 0,
                profitSum: 0,
                profitCount: 0,
                lossSum: 0,
                lossCount: 0,
                moveSum: 0,
                moveCount: 0,
                avgProfit: 0,
                avgLoss: 0,
                winRate: 0
            };
        });
        similarCases.forEach(rec => {
            const dir = rec.directionTaken;
            if (dir === 'long' || dir === 'short') {
                const s = statsByDir[dir];
                s.count++;
                const p = rec.profit || 0;
                if (p > 0) {
                    s.winCount++;
                    s.profitSum += p;
                    s.profitCount++;
                } else if (p < 0) {
                    s.lossSum += p;
                    s.lossCount++;
                }
                // expected move (price difference)
                if (rec.entryPrice != null) {
                    if (dir === 'long' && rec.highDuringTrade != null) {
                        const diff = Math.max(0, rec.highDuringTrade - rec.entryPrice);
                        s.moveSum += diff;
                        s.moveCount++;
                    } else if (dir === 'short' && rec.lowDuringTrade != null) {
                        const diff = Math.max(0, rec.entryPrice - rec.lowDuringTrade);
                        s.moveSum += diff;
                        s.moveCount++;
                    }
                }
            }
        });
        ['long', 'short'].forEach(dir => {
            const s = statsByDir[dir];
            if (s.count > 0) {
                s.winRate = s.winCount / s.count * 100;
                s.avgProfit = s.profitCount > 0 ? s.profitSum / s.profitCount : 0;
                s.avgLoss = s.lossCount > 0 ? s.lossSum / s.lossCount : 0;
                s.expectedMove = s.moveCount > 0 ? s.moveSum / s.moveCount : 0;
            }
        });
        // Determine candidate direction with highest winRate
        let candidateDirection = null;
        let bestWinRate = -1;
        ['long', 'short'].forEach(dir => {
            const s = statsByDir[dir];
            if (s.count > 0 && s.winRate > bestWinRate) {
                bestWinRate = s.winRate;
                candidateDirection = dir;
            } else if (s.count > 0 && s.winRate === bestWinRate) {
                // tie-breaker: higher avgProfit minus absolute avgLoss
                const currentScore = statsByDir[candidateDirection] ? (statsByDir[candidateDirection].avgProfit + statsByDir[candidateDirection].avgLoss) : -Infinity;
                const newScore = s.avgProfit + s.avgLoss;
                if (newScore > currentScore) {
                    candidateDirection = dir;
                }
            }
        });
        // Determine minWinRate threshold
        const threshold = entry.minWinRate != null ? entry.minWinRate : 0;
        let recommendation = 'flat';
        let winRate = 0;
        let avgProfit = null;
        let avgLoss = null;
        let expectedMove = null;
        let expectedMoveUnit = null;
        if (candidateDirection) {
            const s = statsByDir[candidateDirection];
            winRate = s.winRate;
            avgProfit = s.avgProfit;
            avgLoss = s.avgLoss;
            if (winRate >= threshold && s.count > 0) {
                recommendation = candidateDirection;
                expectedMove = s.expectedMove;
                expectedMoveUnit = '円';
            } else {
                recommendation = 'flat';
            }
        }
        // Confidence: combine case count and winRate
        const confScore = (pseudoCaseCount / (pseudoCaseCount + 5)) * winRate;
        const confidence = Math.round(Math.min(100, confScore));
        return {
            recommendation,
            winRate: Math.round(winRate * 10) / 10, // one decimal
            confidence,
            expectedMove: expectedMove != null ? Math.round(expectedMove * 10) / 10 : null,
            expectedMoveUnit,
            avgProfit: avgProfit != null ? Math.round(avgProfit * 10) / 10 : null,
            avgLoss: avgLoss != null ? Math.round(avgLoss * 10) / 10 : null,
            pseudoCaseCount
        };
    }

    /**
     * Show judgement result in UI
     */
    function showJudgeResult(result, entry) {
        const resultDiv = document.getElementById('judgeResult');
        resultDiv.innerHTML = '';
        const createRow = (label, value) => {
            const row = document.createElement('div');
            row.className = 'judge-row';
            const lbl = document.createElement('span');
            lbl.className = 'judge-label';
            lbl.textContent = label;
            const val = document.createElement('span');
            val.className = 'judge-value';
            val.textContent = value;
            row.appendChild(lbl);
            row.appendChild(val);
            return row;
        };
        // Symbol
        resultDiv.appendChild(createRow('判定銘柄', entry.symbol));
        resultDiv.appendChild(createRow('疑似ケース', result.pseudoCaseCount + ' 件'));
        // Recommendation
        let recText;
        if (result.recommendation === 'long') recText = 'ロング推奨';
        else if (result.recommendation === 'short') recText = 'ショート推奨';
        else recText = 'ノーポジ推奨';
        resultDiv.appendChild(createRow('推奨方向', recText));
        // Win rate
        resultDiv.appendChild(createRow('勝率', (result.winRate != null ? result.winRate + ' %' : '—')));
        // Confidence with bar
        const confidenceRow = document.createElement('div');
        confidenceRow.className = 'judge-row';
        const confLabel = document.createElement('span');
        confLabel.className = 'judge-label';
        confLabel.textContent = '信頼度';
        const confValue = document.createElement('span');
        confValue.className = 'judge-value';
        confValue.textContent = result.confidence + ' %';
        confidenceRow.appendChild(confLabel);
        confidenceRow.appendChild(confValue);
        const barContainer = document.createElement('div');
        barContainer.className = 'confidence-bar';
        const barInner = document.createElement('div');
        barInner.className = 'confidence-bar-inner';
        barInner.style.width = result.confidence + '%';
        barContainer.appendChild(barInner);
        confidenceRow.appendChild(barContainer);
        resultDiv.appendChild(confidenceRow);
        // Expected move
        resultDiv.appendChild(createRow('推定値幅', (result.expectedMove != null ? (result.recommendation !== 'flat' ? (result.expectedMove > 0 ? '+' : '') + result.expectedMove + (result.expectedMoveUnit || '') : '—') : '—')));
        // Avg profit/loss
        resultDiv.appendChild(createRow('平均利益', (result.avgProfit != null ? Math.round(result.avgProfit) + ' 円' : '—')));
        resultDiv.appendChild(createRow('平均損失', (result.avgLoss != null ? Math.round(result.avgLoss) + ' 円' : '—')));
        resultDiv.style.display = 'block';
    }

    /**
     * Save a new trade with judgement result
     */
    function saveNewTrade(entry, result) {
        const id = generateUUID();
        const now = new Date().toISOString();
        const record = Object.assign({}, entry, result, {
            id,
            createdAt: now,
            updatedAt: now,
            directionTaken: entry.directionPlanned,
            hasResult: false
        });
        tradeRecords.push(record);
        saveTradeRecords(tradeRecords);
    }

    /**
     * Update an existing entry (for editing) and store result
     */
    function updateExistingEntry(id, entry, result) {
        const index = tradeRecords.findIndex(r => r.id === id);
        if (index < 0) return;
        const rec = tradeRecords[index];
        const now = new Date().toISOString();
        // preserve id and createdAt
        const updated = Object.assign({}, rec, entry, result, {
            id: rec.id,
            createdAt: rec.createdAt,
            updatedAt: now,
            directionTaken: entry.directionPlanned,
            // If record already has result, keep the exit fields and profit untouched
            datetimeExit: rec.datetimeExit,
            exitPrice: rec.exitPrice,
            highDuringTrade: rec.highDuringTrade,
            lowDuringTrade: rec.lowDuringTrade,
            profit: rec.profit,
            resultMemo: rec.resultMemo,
            hasResult: rec.hasResult
        });
        tradeRecords[index] = updated;
        saveTradeRecords(tradeRecords);
    }

    /**
     * Render exit record select options
     */
    function renderExitOptions() {
        const select = document.getElementById('exitRecordSelect');
        select.innerHTML = '';
        // sort by datetimeEntry descending
        const sorted = tradeRecords.slice().sort((a, b) => {
            return (b.datetimeEntry || b.createdAt || '').localeCompare(a.datetimeEntry || a.createdAt || '');
        });
        // Add default option
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '選択してください';
        select.appendChild(defaultOpt);
        sorted.forEach(rec => {
            const opt = document.createElement('option');
            opt.value = rec.id;
            const dateStr = rec.datetimeEntry ? rec.datetimeEntry.replace('T', ' ') : (rec.createdAt || '').replace('T', ' ').substring(0, 19);
            const dirText = rec.directionPlanned === 'long' ? 'ロング' : rec.directionPlanned === 'short' ? 'ショート' : 'ノーポジ';
            const status = rec.hasResult ? '済' : '未';
            opt.textContent = `${dateStr} - ${rec.symbol} - ${dirText} - ${status}`;
            select.appendChild(opt);
        });
        // Clear exit form when refreshing options
        clearExitForm();
    }

    /**
     * Load selected record into exit form
     */
    function loadExitRecord(id) {
        const rec = tradeRecords.find(r => r.id === id);
        if (!rec) return;
        editingExitId = rec.id;
        // summary
        const summary = document.getElementById('exitRecordSummary');
        const dirText = rec.directionPlanned === 'long' ? 'ロング' : rec.directionPlanned === 'short' ? 'ショート' : 'ノーポジ';
        summary.innerHTML = `エントリー日時: ${rec.datetimeEntry ? rec.datetimeEntry.replace('T', ' ') : ''}<br>` +
            `銘柄: ${rec.symbol}<br>` +
            `エントリー方向: ${dirText}`;
        // fill form fields
        document.getElementById('datetimeExit').value = rec.datetimeExit || '';
        document.getElementById('exitPrice').value = rec.exitPrice != null ? rec.exitPrice : '';
        document.getElementById('highDuringTrade').value = rec.highDuringTrade != null ? rec.highDuringTrade : '';
        document.getElementById('lowDuringTrade').value = rec.lowDuringTrade != null ? rec.lowDuringTrade : '';
        document.getElementById('resultMemo').value = rec.resultMemo || '';
    }

    /**
     * Save exit result for record
     */
    function saveExitResult(id) {
        const recIndex = tradeRecords.findIndex(r => r.id === id);
        if (recIndex < 0) return;
        const rec = tradeRecords[recIndex];
        // Collect exit values
        const datetimeExit = document.getElementById('datetimeExit').value || null;
        const exitPriceStr = document.getElementById('exitPrice').value;
        const exitPrice = exitPriceStr !== '' ? Number(exitPriceStr) : null;
        const highStr = document.getElementById('highDuringTrade').value;
        const highDuringTrade = highStr !== '' ? Number(highStr) : null;
        const lowStr = document.getElementById('lowDuringTrade').value;
        const lowDuringTrade = lowStr !== '' ? Number(lowStr) : null;
        const resultMemo = document.getElementById('resultMemo').value || '';
        // Compute profit
        let baseProfit = 0;
        if (rec.directionTaken === 'long' && rec.entryPrice != null && exitPrice != null && rec.size != null && rec.feePerUnit != null) {
            baseProfit = (exitPrice - rec.entryPrice - rec.feePerUnit) * rec.size;
        } else if (rec.directionTaken === 'short' && rec.entryPrice != null && exitPrice != null && rec.size != null && rec.feePerUnit != null) {
            baseProfit = (rec.entryPrice - exitPrice - rec.feePerUnit) * rec.size;
        } else {
            baseProfit = 0;
        }
        // Multiplier by symbol
        let multiplier = 1;
        if (rec.symbol === 'nk225mc') multiplier = 10;
        else if (rec.symbol === 'nk225m') multiplier = 100;
        else if (rec.symbol === 'nk225') multiplier = 1000;
        const profit = baseProfit * multiplier;
        // Update record
        const now = new Date().toISOString();
        tradeRecords[recIndex] = Object.assign({}, rec, {
            datetimeExit,
            exitPrice,
            highDuringTrade,
            lowDuringTrade,
            resultMemo,
            profit,
            hasResult: true,
            updatedAt: now
        });
        saveTradeRecords(tradeRecords);
        editingExitId = null;
        renderStats();
        renderRecordsTable();
        renderExitOptions();
        alert(`損益を保存しました。損益: ${Math.round(profit)} 円`);
    }

    /**
     * Clear exit form fields
     */
    function clearExitForm() {
        editingExitId = null;
        document.getElementById('exitRecordSummary').innerHTML = '';
        ['datetimeExit', 'exitPrice', 'highDuringTrade', 'lowDuringTrade', 'resultMemo'].forEach(id => {
            const el = document.getElementById(id);
            el.value = '';
        });
    }

    /**
     * Render statistics summary and chart
     */
    function renderStats() {
        const summaryDiv = document.querySelector('.stats-summary');
        summaryDiv.innerHTML = '';
        const records = tradeRecords.filter(() => true);
        const total = records.length;
        const completed = records.filter(r => r.hasResult).length;
        const wins = records.filter(r => r.hasResult && r.profit > 0).length;
        const losses = records.filter(r => r.hasResult && r.profit < 0).length;
        const winRate = completed > 0 ? (wins / completed * 100).toFixed(1) : '0.0';
        // Long and Short stats
        function computeDirStats(dir) {
            const dirRecords = records.filter(r => r.hasResult && r.directionTaken === dir);
            const count = dirRecords.length;
            if (count === 0) return { count: 0, winRate: 0, avgProfit: 0, avgLoss: 0 };
            const winCount = dirRecords.filter(r => r.profit > 0).length;
            const lossList = dirRecords.filter(r => r.profit < 0).map(r => r.profit);
            const profitList = dirRecords.filter(r => r.profit > 0).map(r => r.profit);
            const avgProfit = profitList.length > 0 ? profitList.reduce((a, b) => a + b, 0) / profitList.length : 0;
            const avgLoss = lossList.length > 0 ? lossList.reduce((a, b) => a + b, 0) / lossList.length : 0;
            return { count, winRate: (winCount / count * 100).toFixed(1), avgProfit, avgLoss };
        }
        const longStats = computeDirStats('long');
        const shortStats = computeDirStats('short');
        const items = [
            { label: '総トレード数', value: total },
            { label: '完了トレード数', value: completed },
            { label: '総勝率', value: winRate + ' %' },
            { label: 'ロング数', value: longStats.count },
            { label: 'ロング勝率', value: longStats.winRate + ' %' },
            { label: 'ロング平均利益', value: Math.round(longStats.avgProfit) + ' 円' },
            { label: 'ロング平均損失', value: Math.round(longStats.avgLoss) + ' 円' },
            { label: 'ショート数', value: shortStats.count },
            { label: 'ショート勝率', value: shortStats.winRate + ' %' },
            { label: 'ショート平均利益', value: Math.round(shortStats.avgProfit) + ' 円' },
            { label: 'ショート平均損失', value: Math.round(shortStats.avgLoss) + ' 円' }
        ];
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'stat-item';
            div.innerHTML = `<strong>${item.label}</strong><br>${item.value}`;
            summaryDiv.appendChild(div);
        });
        // Render or update chart
        renderProfitChart();
    }

    /**
     * Render profit chart using Chart.js
     */
    function renderProfitChart() {
        const ctxEl = document.getElementById('profitChart');
        if (!ctxEl) return;
        const ctx = ctxEl.getContext('2d');
        const completed = tradeRecords.filter(r => r.hasResult);
        const labels = completed.map((_, idx) => idx + 1);
        const profits = completed.map(r => r.profit);
        let cumulative = [];
        let sum = 0;
        for (let i = 0; i < profits.length; i++) {
            sum += profits[i];
            cumulative.push(sum);
        }
        const barColors = profits.map(p => p >= 0 ? '#00ffc8' : '#ff6b6b');
        if (profitChart) {
            profitChart.destroy();
        }
        profitChart = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: '損益',
                        data: profits,
                        backgroundColor: barColors,
                    },
                    {
                        type: 'line',
                        label: '累積損益',
                        data: cumulative,
                        borderColor: '#4fc3f7',
                        backgroundColor: 'transparent',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { color: '#9aa4b5' },
                        grid: { color: '#252c38' }
                    },
                    y: {
                        ticks: { color: '#9aa4b5' },
                        grid: { color: '#252c38' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#e4e9f0' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ${Math.round(context.parsed.y)} 円`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Render records table with actions
     */
    function renderRecordsTable() {
        const tbody = document.querySelector('#recordsTable tbody');
        tbody.innerHTML = '';
        const sorted = tradeRecords.slice().sort((a, b) => {
            return (b.datetimeEntry || b.createdAt || '').localeCompare(a.datetimeEntry || a.createdAt || '');
        });
        sorted.forEach(rec => {
            const tr = document.createElement('tr');
            // Date/time
            const dt = rec.datetimeEntry ? rec.datetimeEntry.replace('T', ' ') : '';
            addCell(tr, dt);
            // Symbol
            addCell(tr, rec.symbol);
            // Direction planned
            const dirText = rec.directionPlanned === 'long' ? 'ロング' : rec.directionPlanned === 'short' ? 'ショート' : 'ノーポジ';
            addCell(tr, dirText);
            // entry price
            addCell(tr, rec.entryPrice != null ? rec.entryPrice : '');
            // size
            addCell(tr, rec.size != null ? rec.size : '');
            // profit
            addCell(tr, rec.hasResult && rec.profit != null ? Math.round(rec.profit) + ' 円' : '');
            // Actions
            const actCell = document.createElement('td');
            // Edit entry button
            const editEntryBtn = document.createElement('button');
            editEntryBtn.className = 'btn-small';
            editEntryBtn.textContent = 'エントリー編集';
            editEntryBtn.addEventListener('click', () => {
                editEntry(rec.id);
            });
            actCell.appendChild(editEntryBtn);
            // Edit result button
            const editExitBtn = document.createElement('button');
            editExitBtn.className = 'btn-small';
            editExitBtn.textContent = '結果編集';
            editExitBtn.style.marginLeft = '4px';
            editExitBtn.addEventListener('click', () => {
                editExit(rec.id);
            });
            actCell.appendChild(editExitBtn);
            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-small';
            delBtn.textContent = '削除';
            delBtn.style.marginLeft = '4px';
            delBtn.addEventListener('click', () => {
                deleteRecord(rec.id);
            });
            actCell.appendChild(delBtn);
            tr.appendChild(actCell);
            tbody.appendChild(tr);
        });
    }

    function addCell(tr, text) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
    }

    /**
     * Edit entry by id: load record into entry form for editing
     */
    function editEntry(id) {
        const rec = tradeRecords.find(r => r.id === id);
        if (!rec) return;
        // Switch to entry tab
        document.querySelectorAll('.tab-button').forEach(btn => {
            if (btn.dataset.tab === 'entry') btn.click();
        });
        // Load data into form
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
        // Conditions
        document.getElementById('minWinRate').value = rec.minWinRate != null ? rec.minWinRate : 30;
        // Memo & attachments
        document.getElementById('marketMemo').value = rec.marketMemo || '';
        document.getElementById('notionUrl').value = rec.notionUrl || '';
        currentImageData = rec.imageData || null;
        const preview = document.getElementById('previewImage');
        if (currentImageData) {
            preview.src = currentImageData;
            preview.style.display = 'block';
        } else {
            preview.src = '';
            preview.style.display = 'none';
        }
        // Show judge result based on stored result
        const result = {
            recommendation: rec.recommendation,
            winRate: rec.winRate,
            confidence: rec.confidence,
            expectedMove: rec.expectedMove,
            expectedMoveUnit: rec.expectedMoveUnit,
            avgProfit: rec.avgProfit,
            avgLoss: rec.avgLoss,
            pseudoCaseCount: rec.pseudoCaseCount
        };
        showJudgeResult(result, rec);
    }

    /**
     * Edit exit record by id: load record into exit tab for editing result
     */
    function editExit(id) {
        // Switch to exit tab
        document.querySelectorAll('.tab-button').forEach(btn => {
            if (btn.dataset.tab === 'exit') btn.click();
        });
        document.getElementById('exitRecordSelect').value = id;
        loadExitRecord(id);
    }

    /**
     * Delete a record by id
     */
    function deleteRecord(id) {
        if (!confirm('このレコードを削除しますか？')) return;
        const idx = tradeRecords.findIndex(r => r.id === id);
        if (idx >= 0) {
            tradeRecords.splice(idx, 1);
            saveTradeRecords(tradeRecords);
            renderExitOptions();
            renderStats();
            renderRecordsTable();
        }
    }

    /**
     * Export data as JSON file
     */
    function exportJSON() {
        const dataStr = JSON.stringify(tradeRecords, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `tradeRecords_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

})();