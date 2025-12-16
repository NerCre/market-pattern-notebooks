// Main script handling trade entry, exit and statistics

(() => {
    const STORAGE_KEY = 'tradeRecords_v1';
    let records = [];
    let editingEntryId = null;
    let editingExitId = null;
    let statsChart = null;

    document.addEventListener('DOMContentLoaded', () => {
        // Load existing records
        records = loadRecords();
        // Setup tabs
        initTabs();
        // Populate exit select
        updateExitSelect();
        // Render stats at start
        updateStats();
        // Hook up entry buttons
        document.getElementById('btn-analyze').addEventListener('click', onAnalyze);
        document.getElementById('btn-analyze-save').addEventListener('click', onAnalyzeAndSave);
        document.getElementById('btn-entry-clear').addEventListener('click', clearEntryForm);
        // Exit tab events
        document.getElementById('exit-select').addEventListener('change', onExitSelectChange);
        document.getElementById('btn-exit-save').addEventListener('click', onExitSave);
        document.getElementById('btn-exit-clear').addEventListener('click', clearExitForm);
        // Stats tab events
        document.getElementById('btn-apply-filter').addEventListener('click', applyFilter);
        document.getElementById('btn-clear-filter').addEventListener('click', clearFilter);
        document.getElementById('btn-export-json').addEventListener('click', exportJSON);
        document.getElementById('btn-import-json').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', importJSON);
    });

    /**
     * Initialize tab navigation by attaching click listeners to tab buttons.
     */
    function initTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons and contents
                tabButtons.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(section => section.classList.remove('active'));
                // Activate selected
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-target');
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.classList.add('active');
                }
                // When switching to exit tab, refresh list of open trades
                if (targetId === 'exit-tab') {
                    updateExitSelect();
                }
                // When switching to stats tab, refresh stats
                if (targetId === 'stats-tab') {
                    updateStats();
                }
            });
        });
    }

    /**
     * Load records from localStorage. Returns empty array if none.
     */
    function loadRecords() {
        try {
            const json = localStorage.getItem(STORAGE_KEY);
            if (json) {
                return JSON.parse(json);
            }
            return [];
        } catch (e) {
            console.error('Failed to load records', e);
            return [];
        }
    }

    /**
     * Save records array back to localStorage.
     */
    function saveRecords() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

    /**
     * Generate a UUID string using crypto.randomUUID() if available.
     */
    function generateId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        // Fallback: simple pseudo-random UUID
        return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Collect values from entry form and return a record object. Does not assign id or timestamps.
     */
    function collectEntryValues() {
        return {
            symbol: document.getElementById('entry-symbol').value,
            timeframe: document.getElementById('entry-timeframe').value,
            direction: document.getElementById('entry-direction').value,
            datetimeEntry: document.getElementById('entry-datetime').value,
            entryPrice: parseFloat(document.getElementById('entry-price').value),
            size: parseFloat(document.getElementById('entry-size').value),
            feePerUnit: parseFloat(document.getElementById('entry-fee').value),
            prevWave: document.getElementById('ind-prevWave').value !== '' ? parseFloat(document.getElementById('ind-prevWave').value) : null,
            trend_5_20_40: document.getElementById('ind-trend').value,
            price_vs_ema200: document.getElementById('ind-priceVsEma200').value,
            ema_band_color: document.getElementById('ind-emaColor').value,
            zone: document.getElementById('ind-zone').value,
            cmf_sign: document.getElementById('ind-cmfSign').value,
            cmf_sma_dir: document.getElementById('ind-cmfSmaDir').value,
            macd_state: document.getElementById('ind-macdState').value,
            roc_sign: document.getElementById('ind-rocSign').value,
            roc_sma_dir: document.getElementById('ind-rocSmaDir').value,
            rsi_zone: document.getElementById('ind-rsiZone').value,
            minWinRate: parseFloat(document.getElementById('entry-minWinRate').value) || 0
        };
    }

    /**
     * Validate entry form. Returns {ok: boolean, message: string, field: element|null}
     */
    function validateEntryForm() {
        const datetime = document.getElementById('entry-datetime');
        const price = document.getElementById('entry-price');
        const size = document.getElementById('entry-size');
        const fee = document.getElementById('entry-fee');
        if (!datetime.value) return { ok: false, message: 'エントリー日時を入力してください。', field: datetime };
        if (!price.value) return { ok: false, message: 'エントリー価格を入力してください。', field: price };
        if (!size.value) return { ok: false, message: '枚数を入力してください。', field: size };
        if (!fee.value) return { ok: false, message: '手数料を入力してください。', field: fee };
        return { ok: true };
    }

    /**
     * Perform analysis on the provided entry values. Computes statistics based on past records.
     * @param {Object} entryData The current entry values
     * @returns {Object} result with pseudoCaseCount, recommendation, winRate, confidence, expectedMove, avgProfit, avgLoss
     */
    function performAnalysis(entryData) {
        // Filter candidate records with same symbol and timeframe and that have results
        const candidates = records.filter(r => r.symbol === entryData.symbol && r.timeframe === entryData.timeframe && r.hasResult);
        const featureKeys = [
            'prevWave', 'trend_5_20_40', 'price_vs_ema200', 'ema_band_color', 'zone',
            'cmf_sign', 'cmf_sma_dir', 'macd_state', 'roc_sign', 'roc_sma_dir', 'rsi_zone'
        ];
        const threshold = Math.ceil(featureKeys.length / 2); // minimum number of matches to count as similar
        let pseudoCases = [];
        // Determine pseudo cases based on feature similarity
        for (const rec of candidates) {
            let matchCount = 0;
            for (const key of featureKeys) {
                const a = entryData[key];
                const b = rec[key];
                if (a === b) {
                    matchCount++;
                }
            }
            if (matchCount >= threshold) {
                pseudoCases.push(rec);
            }
        }
        const pseudoCaseCount = pseudoCases.length;
        // If no pseudo cases, return zeros
        if (pseudoCaseCount === 0) {
            return {
                pseudoCaseCount,
                recommendation: 'flat',
                winRate: 0,
                confidence: 0,
                expectedMove: null,
                avgProfit: 0,
                avgLoss: 0
            };
        }
        // Aggregate stats by direction
        const statsByDir = {
            long: { count: 0, win: 0, profitSum: 0, profitCount: 0, lossSum: 0, lossCount: 0, expectedMoveSum: 0, expectedCount: 0 },
            short: { count: 0, win: 0, profitSum: 0, profitCount: 0, lossSum: 0, lossCount: 0, expectedMoveSum: 0, expectedCount: 0 },
            flat: { count: 0, win: 0, profitSum: 0, profitCount: 0, lossSum: 0, lossCount: 0, expectedMoveSum: 0, expectedCount: 0 }
        };
        let totalProfitSumPos = 0;
        let totalProfitCountPos = 0;
        let totalLossSum = 0;
        let totalLossCount = 0;
        for (const rec of pseudoCases) {
            const dir = rec.direction || 'flat';
            const s = statsByDir[dir];
            s.count++;
            if (rec.profit > 0) {
                s.win++;
                s.profitSum += rec.profit;
                s.profitCount++;
                totalProfitSumPos += rec.profit;
                totalProfitCountPos++;
            } else if (rec.profit < 0) {
                s.lossSum += rec.profit;
                s.lossCount++;
                totalLossSum += rec.profit;
                totalLossCount++;
            }
            // Compute expected move (price based) using highDuringTrade / lowDuringTrade and entry price
            if (dir === 'long') {
                if (typeof rec.highDuringTrade === 'number') {
                    let move = rec.highDuringTrade - rec.entryPrice;
                    if (move < 0) move = 0;
                    s.expectedMoveSum += move;
                    s.expectedCount++;
                }
            } else if (dir === 'short') {
                if (typeof rec.lowDuringTrade === 'number') {
                    let move = rec.entryPrice - rec.lowDuringTrade;
                    if (move < 0) move = 0;
                    s.expectedMoveSum += move;
                    s.expectedCount++;
                }
            } else {
                // flat direction: expected move is zero
                s.expectedCount++;
            }
        }
        // Compute win rates per direction
        const dirWinRates = {};
        ['long','short','flat'].forEach(dir => {
            const s = statsByDir[dir];
            if (s.count > 0) {
                dirWinRates[dir] = (s.win / s.count) * 100;
            } else {
                dirWinRates[dir] = 0;
            }
        });
        // Determine recommended direction: highest win rate
        let recommended = 'flat';
        let maxWinRate = 0;
        for (const dir of ['long','short','flat']) {
            if (dirWinRates[dir] > maxWinRate) {
                maxWinRate = dirWinRates[dir];
                recommended = dir;
            }
        }
        // If max win rate below threshold, recommend flat
        if (maxWinRate < entryData.minWinRate) {
            recommended = 'flat';
        }
        // Compute expected move for recommended direction
        let expectedMove = null;
        if (recommended !== 'flat') {
            const s = statsByDir[recommended];
            if (s.expectedCount > 0) {
                expectedMove = s.expectedMoveSum / s.expectedCount;
            }
        }
        // Compute confidence: proportion of pseudo cases to all candidate cases (0-100)
        const confidence = Math.min(100, (pseudoCaseCount / candidates.length) * 100);
        // Average profit and average loss across pseudo cases
        const avgProfit = totalProfitCountPos > 0 ? totalProfitSumPos / totalProfitCountPos : 0;
        const avgLoss = totalLossCount > 0 ? totalLossSum / totalLossCount : 0;
        return {
            pseudoCaseCount,
            recommendation: recommended,
            winRate: maxWinRate,
            confidence,
            expectedMove,
            avgProfit,
            avgLoss
        };
    }

    /**
     * Display analysis result in the UI.
     */
    function showAnalysisResult(entryData, analysis) {
        const resCard = document.getElementById('analysis-result');
        document.getElementById('res-symbol').textContent = entryData.symbol;
        document.getElementById('res-caseCount').textContent = analysis.pseudoCaseCount;
        let recLabel = analysis.recommendation;
        if (recLabel === 'long') recLabel = 'ロング';
        if (recLabel === 'short') recLabel = 'ショート';
        if (recLabel === 'flat') recLabel = 'フラット';
        document.getElementById('res-recommendation').textContent = recLabel;
        document.getElementById('res-winRate').textContent = analysis.winRate.toFixed(1) + '%';
        document.getElementById('res-confidence').textContent = analysis.confidence.toFixed(1) + '%';
        // Update confidence bar
        const bar = document.getElementById('confidence-bar');
        bar.style.width = analysis.confidence + '%';
        if (analysis.expectedMove == null) {
            document.getElementById('res-expectedMove').textContent = '—';
        } else {
            document.getElementById('res-expectedMove').textContent = analysis.expectedMove.toFixed(2);
        }
        document.getElementById('res-avgProfit').textContent = analysis.avgProfit.toFixed(2);
        document.getElementById('res-avgLoss').textContent = analysis.avgLoss.toFixed(2);
        resCard.hidden = false;
    }

    /**
     * Handler for the "判定する" button.
     */
    function onAnalyze() {
        const validation = validateEntryForm();
        const errorDiv = document.getElementById('entry-error');
        if (!validation.ok) {
            errorDiv.textContent = validation.message;
            validation.field.focus();
            return;
        }
        errorDiv.textContent = '';
        const entryData = collectEntryValues();
        const analysis = performAnalysis(entryData);
        showAnalysisResult(entryData, analysis);
    }

    /**
     * Handler for "判定してエントリーを保存" button.
     */
    function onAnalyzeAndSave() {
        const validation = validateEntryForm();
        const errorDiv = document.getElementById('entry-error');
        if (!validation.ok) {
            errorDiv.textContent = validation.message;
            validation.field.focus();
            return;
        }
        errorDiv.textContent = '';
        const entryData = collectEntryValues();
        const analysis = performAnalysis(entryData);
        showAnalysisResult(entryData, analysis);
        // Save entry (new or existing)
        saveEntryRecord(entryData, analysis);
        // After saving, clear form
        clearEntryForm();
        // Refresh exit and stats lists
        updateExitSelect();
        updateStats();
    }

    /**
     * Save entry record to records array and localStorage. Handles both new and edit.
     */
    function saveEntryRecord(entryData, analysis) {
        const nowISO = new Date().toISOString();
        if (editingEntryId) {
            // Editing existing record
            const index = records.findIndex(r => r.id === editingEntryId);
            if (index !== -1) {
                const existing = records[index];
                // Preserve result fields
                const updated = Object.assign({}, existing, entryData, {
                    updatedAt: nowISO,
                    // Keep createdAt, id, hasResult, and exit related fields
                });
                // Save analysis snapshot
                updated.pseudoCaseCount = analysis.pseudoCaseCount;
                updated.analysisWinRate = analysis.winRate;
                updated.analysisRecommendation = analysis.recommendation;
                updated.analysisExpectedMove = analysis.expectedMove;
                updated.analysisConfidence = analysis.confidence;
                updated.analysisAvgProfit = analysis.avgProfit;
                updated.analysisAvgLoss = analysis.avgLoss;
                records[index] = updated;
            }
            editingEntryId = null;
        } else {
            // Create new record
            const rec = Object.assign({}, entryData, {
                id: generateId(),
                createdAt: nowISO,
                updatedAt: nowISO,
                hasResult: false,
                // store analysis metrics at entry time for reference
                pseudoCaseCount: analysis.pseudoCaseCount,
                analysisWinRate: analysis.winRate,
                analysisRecommendation: analysis.recommendation,
                analysisExpectedMove: analysis.expectedMove,
                analysisConfidence: analysis.confidence,
                analysisAvgProfit: analysis.avgProfit,
                analysisAvgLoss: analysis.avgLoss
            });
            records.push(rec);
        }
        saveRecords();
    }

    /**
     * Clear the entry form and hide analysis result. Resets editing state.
     */
    function clearEntryForm() {
        editingEntryId = null;
        document.getElementById('entry-form').reset();
        // Reset minWinRate to 30
        document.getElementById('entry-minWinRate').value = 30;
        document.getElementById('analysis-result').hidden = true;
        document.getElementById('entry-error').textContent = '';
    }

    /**
     * Update the select dropdown in exit tab with trades that have hasResult=false
     */
    function updateExitSelect() {
        const select = document.getElementById('exit-select');
        // Clear current options
        while (select.firstChild) select.removeChild(select.firstChild);
        // Add default option
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '選択してください';
        select.appendChild(defaultOpt);
        // Populate
        records.filter(r => !r.hasResult).forEach(rec => {
            const opt = document.createElement('option');
            opt.value = rec.id;
            const dt = rec.datetimeEntry ? rec.datetimeEntry.replace('T', ' ') : '';
            opt.textContent = `${dt} / ${rec.symbol} / ${rec.direction}`;
            select.appendChild(opt);
        });
        // Reset selection and details
        document.getElementById('exit-details').hidden = true;
        editingExitId = null;
        document.getElementById('exit-error').textContent = '';
    }

    /**
     * Handler when user selects a record in exit tab.
     */
    function onExitSelectChange() {
        const id = document.getElementById('exit-select').value;
        if (!id) {
            document.getElementById('exit-details').hidden = true;
            editingExitId = null;
            return;
        }
        const rec = records.find(r => r.id === id);
        if (!rec) return;
        editingExitId = id;
        // Display details
        document.getElementById('exit-direction-display').textContent = rec.direction === 'long' ? 'ロング' : rec.direction === 'short' ? 'ショート' : 'フラット';
        document.getElementById('exit-entryPrice-display').textContent = rec.entryPrice;
        document.getElementById('exit-size-display').textContent = rec.size;
        document.getElementById('exit-fee-display').textContent = rec.feePerUnit;
        // Prefill if values exist
        document.getElementById('exit-datetime').value = rec.datetimeExit || '';
        document.getElementById('exit-price').value = rec.exitPrice != null ? rec.exitPrice : '';
        document.getElementById('exit-high').value = rec.highDuringTrade != null ? rec.highDuringTrade : '';
        document.getElementById('exit-low').value = rec.lowDuringTrade != null ? rec.lowDuringTrade : '';
        document.getElementById('exit-details').hidden = false;
    }

    /**
     * Validate exit form. Returns {ok, message, field}
     */
    function validateExitForm() {
        const dt = document.getElementById('exit-datetime');
        const price = document.getElementById('exit-price');
        const high = document.getElementById('exit-high');
        const low = document.getElementById('exit-low');
        if (!dt.value) return { ok: false, message: '決済日時を入力してください。', field: dt };
        if (!price.value) return { ok: false, message: '決済価格を入力してください。', field: price };
        if (!high.value) return { ok: false, message: 'トレード中高値を入力してください。', field: high };
        if (!low.value) return { ok: false, message: 'トレード中安値を入力してください。', field: low };
        return { ok: true };
    }

    /**
     * Handler for exit save button. Updates selected record with exit data and profit.
     */
    function onExitSave() {
        if (!editingExitId) return;
        const validation = validateExitForm();
        const errDiv = document.getElementById('exit-error');
        if (!validation.ok) {
            errDiv.textContent = validation.message;
            validation.field.focus();
            return;
        }
        errDiv.textContent = '';
        const recIndex = records.findIndex(r => r.id === editingExitId);
        if (recIndex === -1) return;
        const rec = records[recIndex];
        const exitDatetime = document.getElementById('exit-datetime').value;
        const exitPrice = parseFloat(document.getElementById('exit-price').value);
        const high = parseFloat(document.getElementById('exit-high').value);
        const low = parseFloat(document.getElementById('exit-low').value);
        // Compute profit (points) before multiplier
        let pointProfit = 0;
        if (rec.direction === 'long') {
            pointProfit = (exitPrice - rec.entryPrice - rec.feePerUnit) * rec.size;
        } else if (rec.direction === 'short') {
            pointProfit = (rec.entryPrice - exitPrice - rec.feePerUnit) * rec.size;
        } else {
            pointProfit = 0;
        }
        // Apply multiplier based on symbol
        let multiplier = 1;
        if (rec.symbol === 'nk225mc') multiplier = 10;
        else if (rec.symbol === 'nk225m') multiplier = 100;
        else if (rec.symbol === 'nk225') multiplier = 1000;
        const profit = pointProfit * multiplier;
        // Update record
        rec.datetimeExit = exitDatetime;
        rec.exitPrice = exitPrice;
        rec.highDuringTrade = high;
        rec.lowDuringTrade = low;
        rec.profit = profit;
        rec.hasResult = true;
        rec.updatedAt = new Date().toISOString();
        records[recIndex] = rec;
        saveRecords();
        // Reset exit form
        editingExitId = null;
        document.getElementById('exit-details').hidden = true;
        document.getElementById('exit-select').value = '';
        // Refresh exit select and stats
        updateExitSelect();
        updateStats();
    }

    /**
     * Clear exit form and reset editing state
     */
    function clearExitForm() {
        editingExitId = null;
        document.getElementById('exit-form').reset();
        document.getElementById('exit-details').hidden = true;
        document.getElementById('exit-error').textContent = '';
        document.getElementById('exit-select').value = '';
    }

    /**
     * Apply current filters to records and refresh stats table and chart
     */
    function applyFilter() {
        updateStats();
    }

    /**
     * Clear filter selections and refresh stats
     */
    function clearFilter() {
        document.getElementById('filter-symbol').value = 'all';
        document.getElementById('filter-timeframe').value = 'all';
        document.getElementById('filter-direction').value = 'all';
        document.getElementById('filter-start').value = '';
        document.getElementById('filter-end').value = '';
        updateStats();
    }

    /**
     * Update stats table, summary and chart based on current filters
     */
    function updateStats() {
        const symbolFilter = document.getElementById('filter-symbol').value;
        const timeframeFilter = document.getElementById('filter-timeframe').value;
        const directionFilter = document.getElementById('filter-direction').value;
        const startDate = document.getElementById('filter-start').value;
        const endDate = document.getElementById('filter-end').value;
        // Filter records
        let filtered = records.slice();
        if (symbolFilter && symbolFilter !== 'all') {
            filtered = filtered.filter(r => r.symbol === symbolFilter);
        }
        if (timeframeFilter && timeframeFilter !== 'all') {
            filtered = filtered.filter(r => r.timeframe === timeframeFilter);
        }
        if (directionFilter && directionFilter !== 'all') {
            filtered = filtered.filter(r => r.direction === directionFilter);
        }
        if (startDate) {
            const startTime = new Date(startDate).getTime();
            filtered = filtered.filter(r => {
                const t = new Date(r.datetimeEntry).getTime();
                return !isNaN(t) && t >= startTime;
            });
        }
        if (endDate) {
            const endTime = new Date(endDate).getTime();
            filtered = filtered.filter(r => {
                const t = new Date(r.datetimeEntry).getTime();
                return !isNaN(t) && t <= endTime + 24 * 60 * 60 * 1000 - 1; // include end day
            });
        }
        // Sort by createdAt descending
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        // Populate table
        const tbody = document.getElementById('stats-table').querySelector('tbody');
        tbody.innerHTML = '';
        filtered.forEach(rec => {
            const tr = document.createElement('tr');
            const createCell = (text) => {
                const td = document.createElement('td');
                td.textContent = text;
                return td;
            };
            tr.appendChild(createCell(formatDate(rec.createdAt)));
            tr.appendChild(createCell(rec.symbol));
            tr.appendChild(createCell(rec.timeframe));
            tr.appendChild(createCell(rec.direction));
            tr.appendChild(createCell(rec.entryPrice));
            tr.appendChild(createCell(rec.hasResult ? rec.exitPrice : '—'));
            tr.appendChild(createCell(rec.size));
            tr.appendChild(createCell(rec.feePerUnit));
            tr.appendChild(createCell(rec.hasResult ? rec.profit.toFixed(2) : '—'));
            tr.appendChild(createCell(rec.pseudoCaseCount || 0));
            tr.appendChild(createCell(rec.analysisWinRate != null ? rec.analysisWinRate.toFixed(1) + '%' : '—'));
            tr.appendChild(createCell(rec.analysisExpectedMove != null ? rec.analysisExpectedMove.toFixed(2) : '—'));
            // Actions
            const actionTd = document.createElement('td');
            // Edit entry button
            const editEntryBtn = document.createElement('button');
            editEntryBtn.textContent = 'エントリー編集';
            editEntryBtn.addEventListener('click', () => {
                editEntry(rec.id);
            });
            actionTd.appendChild(editEntryBtn);
            // Edit result button
            const editExitBtn = document.createElement('button');
            editExitBtn.textContent = '結果編集';
            editExitBtn.addEventListener('click', () => {
                editExit(rec.id);
            });
            actionTd.appendChild(editExitBtn);
            // Delete button
            const delBtn = document.createElement('button');
            delBtn.textContent = '削除';
            delBtn.addEventListener('click', () => {
                deleteRecord(rec.id);
            });
            actionTd.appendChild(delBtn);
            // Style buttons inside table
            actionTd.querySelectorAll('button').forEach(btn => {
                btn.style.marginRight = '0.25rem';
                btn.style.padding = '0.3rem 0.5rem';
                btn.style.fontSize = '0.75rem';
                btn.style.border = '1px solid #00ffc8';
                btn.style.background = 'transparent';
                btn.style.color = '#00ffc8';
                btn.style.borderRadius = '4px';
                btn.style.cursor = 'pointer';
            });
            tr.appendChild(actionTd);
            tbody.appendChild(tr);
        });
        // Compute summary statistics
        let closedTrades = filtered.filter(r => r.hasResult);
        let totalProfit = 0;
        let wins = 0;
        let losses = 0;
        let positiveCount = 0;
        let negativeCount = 0;
        closedTrades.forEach(rec => {
            totalProfit += rec.profit;
            if (rec.profit > 0) {
                wins++;
                positiveCount++;
            } else if (rec.profit < 0) {
                losses++;
                negativeCount++;
            }
        });
        const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
        const avgProfit = positiveCount > 0 ? closedTrades.filter(r => r.profit > 0).reduce((sum, r) => sum + r.profit, 0) / positiveCount : 0;
        const avgLoss = negativeCount > 0 ? closedTrades.filter(r => r.profit < 0).reduce((sum, r) => sum + r.profit, 0) / negativeCount : 0;
        const summaryDiv = document.getElementById('stats-summary');
        summaryDiv.innerHTML = `総件数: ${filtered.length}　/　決済済み: ${closedTrades.length}　/　合計損益: ${totalProfit.toFixed(2)}　/　勝率: ${winRate.toFixed(1)}%　/　平均利益: ${avgProfit.toFixed(2)}　/　平均損失: ${avgLoss.toFixed(2)}`;
        // Draw chart of profits for closed trades
        drawChart(closedTrades);
    }

    /**
     * Format ISO date string into human readable date time string
     */
    function formatDate(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }

    /**
     * Draw a bar chart of profits using Chart.js
     */
    function drawChart(closedTrades) {
        const ctx = document.getElementById('stats-chart').getContext('2d');
        // Destroy previous chart if exists
        if (statsChart) {
            statsChart.destroy();
        }
        // Prepare data
        const labels = closedTrades.map((rec, idx) => `#${closedTrades.length - idx}`);
        const data = closedTrades.map(rec => rec.profit);
        statsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '損益',
                        data: data,
                        backgroundColor: data.map(v => v >= 0 ? 'rgba(0,255,200,0.6)' : 'rgba(255,80,80,0.6)'),
                        borderColor: data.map(v => v >= 0 ? 'rgba(0,255,200,1)' : 'rgba(255,80,80,1)'),
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `損益: ${context.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#e0e0e0'
                        },
                        grid: {
                            color: '#333'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#e0e0e0'
                        },
                        grid: {
                            color: '#333'
                        }
                    }
                }
            }
        });
    }

    /**
     * Edit entry: prefill entry form with record data and switch to entry tab
     */
    function editEntry(id) {
        const rec = records.find(r => r.id === id);
        if (!rec) return;
        // Switch to entry tab
        document.querySelector('.tab-button[data-target="entry-tab"]').click();
        // Populate form
        editingEntryId = id;
        document.getElementById('entry-symbol').value = rec.symbol;
        document.getElementById('entry-timeframe').value = rec.timeframe;
        document.getElementById('entry-direction').value = rec.direction;
        document.getElementById('entry-datetime').value = rec.datetimeEntry;
        document.getElementById('entry-price').value = rec.entryPrice;
        document.getElementById('entry-size').value = rec.size;
        document.getElementById('entry-fee').value = rec.feePerUnit;
        document.getElementById('ind-prevWave').value = rec.prevWave != null ? rec.prevWave : '';
        document.getElementById('ind-trend').value = rec.trend_5_20_40;
        document.getElementById('ind-priceVsEma200').value = rec.price_vs_ema200;
        document.getElementById('ind-emaColor').value = rec.ema_band_color;
        document.getElementById('ind-zone').value = rec.zone;
        document.getElementById('ind-cmfSign').value = rec.cmf_sign;
        document.getElementById('ind-cmfSmaDir').value = rec.cmf_sma_dir;
        document.getElementById('ind-macdState').value = rec.macd_state;
        document.getElementById('ind-rocSign').value = rec.roc_sign;
        document.getElementById('ind-rocSmaDir').value = rec.roc_sma_dir;
        document.getElementById('ind-rsiZone').value = rec.rsi_zone;
        document.getElementById('entry-minWinRate').value = rec.minWinRate || 30;
        // Hide previous analysis result and error
        document.getElementById('analysis-result').hidden = true;
        document.getElementById('entry-error').textContent = '';
    }

    /**
     * Edit exit: prefill exit form with record data and switch to exit tab
     */
    function editExit(id) {
        const rec = records.find(r => r.id === id);
        if (!rec) return;
        document.querySelector('.tab-button[data-target="exit-tab"]').click();
        // Set select value and trigger change to populate
        const select = document.getElementById('exit-select');
        select.value = rec.id;
        select.dispatchEvent(new Event('change'));
    }

    /**
     * Delete a record after user confirms
     */
    function deleteRecord(id) {
        if (!confirm('本当に削除しますか？')) return;
        const index = records.findIndex(r => r.id === id);
        if (index !== -1) {
            records.splice(index, 1);
            saveRecords();
            updateExitSelect();
            updateStats();
        }
    }

    /**
     * Export all records as JSON file
     */
    function exportJSON() {
        const data = {
            version: 1,
            records: records
        };
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const filename = `tradeRecords_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.json`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Import JSON records from selected file
     */
    function importJSON(evt) {
        const file = evt.target.files[0];
        evt.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data || data.version !== 1 || !Array.isArray(data.records)) {
                    displayImportResult('不正なJSON形式です。');
                    return;
                }
                let added = 0;
                let updated = 0;
                data.records.forEach(importRec => {
                    const idx = records.findIndex(r => r.id === importRec.id);
                    if (idx === -1) {
                        records.push(importRec);
                        added++;
                    } else {
                        // Compare updatedAt
                        const existing = records[idx];
                        if (existing.updatedAt < importRec.updatedAt) {
                            records[idx] = importRec;
                            updated++;
                        }
                    }
                });
                saveRecords();
                updateExitSelect();
                updateStats();
                displayImportResult(`追加: ${added}件 / 更新: ${updated}件`);
            } catch (e) {
                console.error(e);
                displayImportResult('インポート中にエラーが発生しました。');
            }
        };
        reader.readAsText(file);
    }

    /**
     * Display import result message
     */
    function displayImportResult(msg) {
        const div = document.getElementById('import-result');
        div.textContent = msg;
        setTimeout(() => { div.textContent = ''; }, 5000);
    }
})();