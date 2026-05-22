// ----------------------------------------------------
// APPLICATION GLOBAL STATE
// ----------------------------------------------------
const state = {
    apiKey: "",
    assetAData: [],
    assetBData: [],
    alignedData: [], // Array of { time, priceA, priceB, spread, ma, upper, lower, zscore }
    charts: {
        priceChart: null,
        spreadChart: null,
        series: {}
    },
    chartMode: "normalized", // "normalized" or "raw"
};

// ----------------------------------------------------
// INITIALIZATION AND DOM LISTENERS
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    initAccordion();
    loadKeyFromLocalStorage();
    
    // Automatically trigger initial analysis on load with default variables
    setTimeout(runAnalysis, 300);
});

function initUI() {
    // Buttons
    document.getElementById("fetch-btn").addEventListener("click", runAnalysis);
    document.getElementById("update-key-btn").addEventListener("click", saveApiKey);
    
    // Chart toggle controls
    document.getElementById("toggle-chart-mode").addEventListener("click", () => {
        setChartMode("normalized");
    });
    document.getElementById("toggle-chart-raw").addEventListener("click", () => {
        setChartMode("raw");
    });

    // Expandable table toggle
    const tableHeader = document.getElementById("table-toggle-header");
    const tablePanel = document.getElementById("data-table-section");
    tableHeader.addEventListener("click", () => {
        tablePanel.classList.toggle("collapsed");
    });
}

function initAccordion() {
    const toggle = document.getElementById("tech-tuning-toggle");
    const content = document.getElementById("tech-tuning-content");
    const chevron = toggle.querySelector(".chevron");
    
    toggle.addEventListener("click", () => {
        const isActive = content.classList.toggle("active");
        if (isActive) {
            content.style.maxHeight = "200px";
            chevron.style.transform = "rotate(180deg)";
        } else {
            content.style.maxHeight = "0";
            chevron.style.transform = "rotate(0deg)";
        }
    });
    
    // Trigger initial state
    content.style.maxHeight = "200px";
    chevron.style.transform = "rotate(180deg)";
}

// ----------------------------------------------------
// API KEY MANAGEMENT
// ----------------------------------------------------
function loadKeyFromLocalStorage() {
    const savedKey = localStorage.getItem("quantspread_polygon_key");
    if (savedKey) {
        state.apiKey = savedKey;
        document.getElementById("api-key-input").value = savedKey;
        updateApiStatusIndicator(true);
    }
}

function saveApiKey() {
    const keyInput = document.getElementById("api-key-input").value.trim();
    if (keyInput) {
        state.apiKey = keyInput;
        localStorage.setItem("quantspread_polygon_key", keyInput);
        updateApiStatusIndicator(true);
        showToast("API Key Saved Successfully!", "success");
    } else {
        showToast("Please enter a valid API key.", "error");
    }
}

function updateApiStatusIndicator(isConnected) {
    const indicator = document.getElementById("api-status");
    if (isConnected) {
        indicator.classList.add("connected");
        indicator.querySelector(".status-label").textContent = "Polygon.io API Connected";
    } else {
        indicator.classList.remove("connected");
        indicator.querySelector(".status-label").textContent = "API Key Error";
    }
}

// ----------------------------------------------------
// SMART DATE VALIDATOR FOR ERROR DIAGNOSTICS
// ----------------------------------------------------
function validateDateChoice(startDateStr, endDateStr) {
    const start = new Date(startDateStr + "T00:00:00");
    const end = new Date(endDateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const startDay = start.getDay();
    const isSingleDay = startDateStr === endDateStr;
    
    if (isSingleDay && (startDay === 0 || startDay === 6)) {
        return "The selected date falls on a weekend (Saturday/Sunday). Stock markets are closed on weekends. Please pick a weekday.";
    }

    if (start > today) {
        return "The selected Start Date is in the future. Trading data is only available for past market days.";
    }

    // Check lookback limit (2 years = 730 days)
    const diffTime = today - start;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    if (diffDays > 730) {
        return "The selected start date is more than 2 years in the past. Your Polygon.io free tier API key has a strict 2-year historical lookback limit. Please select a start date within the last 2 years (after May 2024).";
    }

    return "No trading data returned. Please verify the market was open during the selected range (weekends and holidays are closed), or that these tickers were active. Recommended test range: 2026-05-15 to 2026-05-20.";
}

// ----------------------------------------------------
// CORE RUN ANALYSIS PIPELINE
// ----------------------------------------------------
async function runAnalysis() {
    const fetchBtn = document.getElementById("fetch-btn");
    const btnText = fetchBtn.querySelector(".btn-text");
    const btnLoader = fetchBtn.querySelector(".btn-loader");
    
    // UI Loading state
    fetchBtn.disabled = true;
    btnText.textContent = "Loading Market Data...";
    btnLoader.classList.remove("hidden");

    try {
        const params = getAnalysisParams();
        
        // Parallel fetching
        const [dataA, dataB] = await Promise.all([
            fetchIntradayData(params.tickerA, params.startDate, params.endDate, params.interval),
            fetchIntradayData(params.tickerB, params.startDate, params.endDate, params.interval)
        ]);

        if (!dataA || dataA.length === 0 || !dataB || dataB.length === 0) {
            const dateErrorMsg = validateDateChoice(params.startDate, params.endDate);
            throw new Error(dateErrorMsg);
        }

        state.assetAData = dataA;
        state.assetBData = dataB;
        
        // Processing
        alignTimeSeries();
        calculateSpreadAndIndicators(params);
        
        // Calculations
        computeQuantitativeMetrics(params);
        
        // UI Renderings
        renderCharts(params);
        renderDataTable(params);
        updateApiStatusIndicator(true);

        showToast("Analysis calculated successfully!", "success");
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        clearDashboardOnFailure(error.message);
    } finally {
        // Restore button state
        fetchBtn.disabled = false;
        btnText.textContent = "Run Intraday Analysis";
        btnLoader.classList.add("hidden");
    }
}

function getAnalysisParams() {
    // Asset A Ticker resolving (Dropdown vs Custom input)
    let tickerA = document.getElementById("asset-a-select").value;
    const customA = document.getElementById("asset-a-custom").value.trim().toUpperCase();
    if (customA) tickerA = customA;

    // Asset B Ticker resolving
    let tickerB = document.getElementById("asset-b-select").value;
    const customB = document.getElementById("asset-b-custom").value.trim().toUpperCase();
    if (customB) tickerB = customB;

    if (tickerA === tickerB) {
        throw new Error("Assets A and B must be different tickers to perform spread analysis.");
    }

    const startDate = document.getElementById("start-date-input").value;
    const endDate = document.getElementById("end-date-input").value;

    if (!startDate || !endDate) {
        throw new Error("Please select both a Start Date and an End Date.");
    }

    if (new Date(startDate) > new Date(endDate)) {
        throw new Error("Start Date cannot be after End Date.");
    }

    return {
        tickerA,
        tickerB,
        startDate,
        endDate,
        interval: document.getElementById("interval-select").value,
        spreadModel: document.getElementById("spread-model").value,
        bbPeriod: parseInt(document.getElementById("bb-period").value) || 20,
        bbStdDev: parseFloat(document.getElementById("bb-stddev").value) || 2.0
    };
}

// ----------------------------------------------------
// POLYGON API DATA FETCHING
// ----------------------------------------------------
async function fetchIntradayData(ticker, startDate, endDate, intervalMinutes) {
    if (!state.apiKey) {
        throw new Error("Polygon.io API Key is missing. Please enter it in the header.");
    }

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${intervalMinutes}/minute/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${state.apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
        if (response.status === 403) {
            throw new Error("Invalid API key or insufficient permissions for this ticker.");
        }
        if (response.status === 429) {
            throw new Error("Polygon API Rate Limit Exceeded (Free tier limit is 5 calls per minute). Please wait 15-30 seconds.");
        }
        throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.status === "ERROR") {
        throw new Error(`Polygon API Error: ${data.error}`);
    }

    return data.results || [];
}

// ----------------------------------------------------
// TIME-SERIES ALIGNMENT ENGINE (FORWARD FILLING)
// ----------------------------------------------------
// Shift the timestamp so it displays exactly in Eastern Time (New York time)
function convertUTCToESTTimestamp(utcMillis) {
    const nyString = new Date(utcMillis).toLocaleString("en-US", { timeZone: "America/New_York" });
    const nyDateObj = new Date(nyString);
    return nyDateObj.getTime() / 1000;
}

function alignTimeSeries() {
    // Maps to track fast access
    const mapA = new Map();
    const mapB = new Map();
    
    const allTimestampsSet = new Set();

    state.assetAData.forEach(bar => {
        mapA.set(bar.t, bar);
        allTimestampsSet.add(bar.t);
    });

    state.assetBData.forEach(bar => {
        mapB.set(bar.t, bar);
        allTimestampsSet.add(bar.t);
    });

    // Sort timestamps ascendingly
    const sortedTimestamps = Array.from(allTimestampsSet).sort((a, b) => a - b);
    
    const aligned = [];
    
    // Keep track of last known closes for forward-filling gaps
    let lastCloseA = null;
    let lastCloseB = null;

    // First, find the first valid prices to initiate baseline if needed
    for (let i = 0; i < sortedTimestamps.length; i++) {
        const t = sortedTimestamps[i];
        const barA = mapA.get(t);
        const barB = mapB.get(t);
        if (barA && lastCloseA === null) lastCloseA = barA.c;
        if (barB && lastCloseB === null) lastCloseB = barB.c;
        if (lastCloseA !== null && lastCloseB !== null) break;
    }

    // Main forward fill alignment loop
    sortedTimestamps.forEach(t => {
        const barA = mapA.get(t);
        const barB = mapB.get(t);

        const priceA = barA ? barA.c : lastCloseA;
        const priceB = barB ? barB.c : lastCloseB;

        aligned.push({
            time: convertUTCToESTTimestamp(t), // TV lightweight charts will render nominal New York Time
            priceA: priceA,
            priceB: priceB,
            volumeA: barA ? barA.v : 0,
            volumeB: barB ? barB.v : 0
        });

        // Store active values for next gap
        if (priceA !== null) lastCloseA = priceA;
        if (priceB !== null) lastCloseB = priceB;
    });

    state.alignedData = aligned;
}

// ----------------------------------------------------
// SPREAD AND TECHNICAL INDICATOR QUANT MATH ENGINE
// ----------------------------------------------------
function calculateSpreadAndIndicators(params) {
    if (state.alignedData.length === 0) return;

    const baseA = state.alignedData[0].priceA;
    const baseB = state.alignedData[0].priceB;
    
    // 1. Calculate base spread
    state.alignedData.forEach(bar => {
        let spreadVal = 0;

        switch (params.spreadModel) {
            case "ratio":
                spreadVal = bar.priceA / bar.priceB;
                break;
            case "log":
                spreadVal = Math.log(bar.priceA) - Math.log(bar.priceB);
                break;
            case "diff":
                spreadVal = bar.priceA - bar.priceB;
                break;
            case "normalized":
                const retA = ((bar.priceA - baseA) / baseA) * 100;
                const retB = ((bar.priceB - baseB) / baseB) * 100;
                spreadVal = retA - retB;
                break;
        }
        bar.spread = spreadVal;
    });

    // 2. Calculate rolling Bollinger Bands & Z-Scores
    const N = params.bbPeriod;
    const K = params.bbStdDev;

    for (let i = 0; i < state.alignedData.length; i++) {
        // Window calculations (adapt for beginning to avoid cutting chart start)
        const startIdx = Math.max(0, i - N + 1);
        const windowSize = i - startIdx + 1;
        
        let sum = 0;
        for (let j = startIdx; j <= i; j++) {
            sum += state.alignedData[j].spread;
        }
        const mean = sum / windowSize;

        let varianceSum = 0;
        for (let j = startIdx; j <= i; j++) {
            varianceSum += Math.pow(state.alignedData[j].spread - mean, 2);
        }
        const stdDev = Math.sqrt(varianceSum / windowSize);

        const upper = mean + (K * stdDev);
        const lower = mean - (K * stdDev);
        const zscore = stdDev === 0 ? 0 : (state.alignedData[i].spread - mean) / stdDev;

        // Inject computed quantitative columns
        state.alignedData[i].ma = mean;
        state.alignedData[i].upper = upper;
        state.alignedData[i].lower = lower;
        state.alignedData[i].zscore = zscore;
    }
}

// ----------------------------------------------------
// QUANTITATIVE METRICS & ANOMALIES CALCULATOR
// ----------------------------------------------------
function computeQuantitativeMetrics(params) {
    const data = state.alignedData;
    if (data.length === 0) return;

    // 1. Pearson Correlation (r)
    const n = data.length;
    let sumA = 0, sumB = 0;
    data.forEach(bar => {
        sumA += bar.priceA;
        sumB += bar.priceB;
    });
    const meanA = sumA / n;
    const meanB = sumB / n;

    let num = 0;
    let denA = 0;
    let denB = 0;

    data.forEach(bar => {
        const diffA = bar.priceA - meanA;
        const diffB = bar.priceB - meanB;
        num += diffA * diffB;
        denA += diffA * diffA;
        denB += diffB * diffB;
    });

    const r = denA === 0 || denB === 0 ? 0 : num / Math.sqrt(denA * denB);
    
    // Set UI elements
    const corrVal = document.getElementById("val-correlation");
    const corrDesc = document.getElementById("desc-correlation");
    corrVal.textContent = r.toFixed(3);
    
    if (r > 0.7) {
        corrDesc.innerHTML = `<span class="positive-badge">High Positive Correlation</span>`;
    } else if (r > 0.3) {
        corrDesc.innerHTML = `<span class="neutral-badge">Moderate Positive Correlation</span>`;
    } else if (r > -0.3 && r < 0.3) {
        corrDesc.innerHTML = `<span class="neutral-badge">No/Weak Linear Relationship</span>`;
    } else if (r < -0.7) {
        corrDesc.innerHTML = `<span class="negative-badge">High Inverse Correlation</span>`;
    } else {
        corrDesc.innerHTML = `<span class="negative-badge">Moderate Inverse Correlation</span>`;
    }

    // 2. Spread Z-Score
    const lastBar = data[data.length - 1];
    const zscoreVal = document.getElementById("val-zscore");
    const zscoreDesc = document.getElementById("desc-zscore");
    
    zscoreVal.textContent = lastBar.zscore.toFixed(2);
    
    if (lastBar.zscore >= 2.0) {
        zscoreDesc.className = "negative-badge";
        zscoreDesc.textContent = "Sell Spread (Asset A Rich)";
        zscoreDesc.title = `The spread is +${lastBar.zscore.toFixed(1)} standard deviations above daily mean. Asset A is structurally overvalued vs B.`;
    } else if (lastBar.zscore <= -2.0) {
        zscoreDesc.className = "positive-badge";
        zscoreDesc.textContent = "Buy Spread (Asset B Rich)";
        zscoreDesc.title = `The spread is ${lastBar.zscore.toFixed(1)} standard deviations below daily mean. Asset B is structurally overvalued vs A.`;
    } else {
        zscoreDesc.className = "neutral-badge";
        zscoreDesc.textContent = "Neutral / Fair Value";
        zscoreDesc.title = "Spread is trading within normal statistical ranges.";
    }

    // 3. Last Spread Value
    const spreadValEl = document.getElementById("val-spread");
    const spreadDescEl = document.getElementById("desc-spread");
    const spreadUnit = params.spreadModel === "ratio" ? "x" : params.spreadModel === "normalized" ? "%" : "$";
    
    spreadValEl.textContent = `${lastBar.spread.toFixed(4)}${spreadUnit}`;
    
    // Calculate Change from open
    const firstSpread = data[0].spread;
    const spreadDelta = lastBar.spread - firstSpread;
    const spreadDeltaPct = firstSpread === 0 ? 0 : (spreadDelta / firstSpread) * 100;
    
    const isMultiDay = params.startDate !== params.endDate;
    const rangeLabel = isMultiDay ? "Range" : "Intraday";
    
    if (spreadDelta > 0) {
        spreadDescEl.innerHTML = `${rangeLabel} Expansion: <span style="color:var(--success); font-weight:600;">+${spreadDelta.toFixed(4)} (+${spreadDeltaPct.toFixed(2)}%)</span>`;
    } else {
        spreadDescEl.innerHTML = `${rangeLabel} Compression: <span style="color:var(--danger); font-weight:600;">${spreadDelta.toFixed(4)} (${spreadDeltaPct.toFixed(2)}%)</span>`;
    }

    // 4. Spread Stats Table
    const spreadValues = data.map(b => b.spread);
    const minSpread = Math.min(...spreadValues);
    const maxSpread = Math.max(...spreadValues);
    
    let sumSpread = 0;
    spreadValues.forEach(v => sumSpread += v);
    const meanSpread = sumSpread / n;
    
    // Spread Volatility (StdDev of daily spread)
    let sumSquaredDiff = 0;
    spreadValues.forEach(v => sumSquaredDiff += Math.pow(v - meanSpread, 2));
    const volatility = Math.sqrt(sumSquaredDiff / n);

    document.getElementById("val-volatility").textContent = volatility.toFixed(4);
    document.getElementById("val-mean").textContent = meanSpread.toFixed(4);
    document.getElementById("val-range").textContent = `${minSpread.toFixed(3)} - ${maxSpread.toFixed(3)}`;
}

// ----------------------------------------------------
// PROFESSIONAL VISUALIZATION ENGINE
// ----------------------------------------------------
function renderCharts(params) {
    const data = state.alignedData;
    if (data.length === 0) return;

    // Destructure container DOM elements
    const priceContainer = document.getElementById("performance-chart-container");
    const spreadContainer = document.getElementById("spread-chart-container");
    
    // Clear previous charts
    priceContainer.innerHTML = "";
    spreadContainer.innerHTML = "";

    // Global Chart Theme Options
    const chartOptions = {
        layout: {
            background: { type: 'solid', color: 'rgba(20, 24, 43, 0.4)' },
            textColor: '#d1d4dc',
            fontSize: 11,
            fontFamily: 'Inter, sans-serif'
        },
        grid: {
            vertLines: { color: 'rgba(43, 49, 73, 0.2)' },
            horzLines: { color: 'rgba(43, 49, 73, 0.2)' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#6366f1',
                width: 1,
                style: 2, // dashed
                labelBackgroundColor: '#6366f1',
            },
            horzLine: {
                color: '#6366f1',
                width: 1,
                style: 2,
                labelBackgroundColor: '#6366f1',
            }
        },
        timeScale: {
            borderColor: 'rgba(43, 49, 73, 0.5)',
            timeVisible: true,
            secondsVisible: false
        },
        rightPriceScale: {
            borderColor: 'rgba(43, 49, 73, 0.5)'
        }
    };

    // -----------------------------------------
    // CHART 1: COMPARATIVE PRICE/PERFORMANCE
    // -----------------------------------------
    const priceChart = LightweightCharts.createChart(priceContainer, {
        ...chartOptions,
        rightPriceScale: {
            ...chartOptions.rightPriceScale,
            mode: state.chartMode === "normalized" ? LightweightCharts.PriceScaleMode.Normal : LightweightCharts.PriceScaleMode.Normal
        }
    });

    const seriesColorA = '#818cf8'; // Electric indigo
    const seriesColorB = '#fbbf24'; // Warm amber

    let seriesDataA = [];
    let seriesDataB = [];

    const baseA = data[0].priceA;
    const baseB = data[0].priceB;

    data.forEach(bar => {
        if (state.chartMode === "normalized") {
            // Normalized starting at 100
            seriesDataA.push({ time: bar.time, value: (bar.priceA / baseA) * 100 });
            seriesDataB.push({ time: bar.time, value: (bar.priceB / baseB) * 100 });
        } else {
            // Raw actual stock prices
            seriesDataA.push({ time: bar.time, value: bar.priceA });
            seriesDataB.push({ time: bar.time, value: bar.priceB });
        }
    });

    // Create line series
    const lineSeriesA = priceChart.addSeries(LightweightCharts.LineSeries, {
        color: seriesColorA,
        lineWidth: 2,
        title: params.tickerA,
        priceFormat: {
            type: 'custom',
            formatter: value => state.chartMode === "normalized" ? `${value.toFixed(1)}%` : `$${value.toFixed(2)}`
        }
    });

    const lineSeriesB = priceChart.addSeries(LightweightCharts.LineSeries, {
        color: seriesColorB,
        lineWidth: 2,
        title: params.tickerB,
        priceFormat: {
            type: 'custom',
            formatter: value => state.chartMode === "normalized" ? `${value.toFixed(1)}%` : `$${value.toFixed(2)}`
        }
    });

    lineSeriesA.setData(seriesDataA);
    lineSeriesB.setData(seriesDataB);

    // Dynamic Title and Header updates
    const isMultiDay = params.startDate !== params.endDate;
    
    const chart1Header = priceContainer.closest(".charts-panel").querySelector(".panel-titles h2");
    chart1Header.textContent = isMultiDay ? "Relative Historical Performance" : "Relative Intraday Performance";

    const chart1Title = priceContainer.closest(".charts-panel").querySelector(".panel-titles p");
    chart1Title.textContent = state.chartMode === "normalized" 
        ? `${params.tickerA} vs. ${params.tickerB} Cumulative ${isMultiDay ? 'Range' : 'Daily'} Returns (Normalized to 100)`
        : `${params.tickerA} vs. ${params.tickerB} Nominal Share Prices ($)`;

    const chart2Header = spreadContainer.closest(".charts-panel").querySelector(".panel-titles h2");
    chart2Header.textContent = isMultiDay ? "Historical Spread Dynamics" : "Intraday Spread Dynamics";

    // -----------------------------------------
    // CHART 2: QUANTITATIVE SPREAD DYNAMICS
    // -----------------------------------------
    const spreadChart = LightweightCharts.createChart(spreadContainer, chartOptions);
    const spreadUnit = params.spreadModel === "ratio" ? "x" : params.spreadModel === "normalized" ? "%" : "$";

    // Setup visual components
    const spreadSeries = spreadChart.addSeries(LightweightCharts.LineSeries, {
        color: '#22d3ee', // Cyan neon
        lineWidth: 2.5,
        title: `Spread (${params.spreadModel.toUpperCase()})`,
        priceFormat: {
            type: 'custom',
            formatter: value => `${value.toFixed(4)}${spreadUnit}`
        }
    });

    const maSeries = spreadChart.addSeries(LightweightCharts.LineSeries, {
        color: 'hsla(45, 90%, 50%, 0.75)',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: `MA (${params.bbPeriod})`
    });

    const upperSeries = spreadChart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(239, 68, 68, 0.45)', // Soft Red
        lineWidth: 1,
        title: 'Upper Band'
    });

    const lowerSeries = spreadChart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(34, 197, 94, 0.45)', // Soft Green
        lineWidth: 1,
        title: 'Lower Band'
    });

    // Populate data
    const spreadArr = [];
    const maArr = [];
    const upperArr = [];
    const lowerArr = [];

    data.forEach(bar => {
        spreadArr.push({ time: bar.time, value: bar.spread });
        maArr.push({ time: bar.time, value: bar.ma });
        upperArr.push({ time: bar.time, value: bar.upper });
        lowerArr.push({ time: bar.time, value: bar.lower });
    });

    spreadSeries.setData(spreadArr);
    maSeries.setData(maArr);
    upperSeries.setData(upperArr);
    lowerSeries.setData(lowerArr);

    // Update Subtitles
    const spreadTitles = {
        ratio: "Price Ratio Model (A / B)",
        log: "Log Price Differential [ln(A) - ln(B)]",
        diff: "Absolute Nominal Difference (A - B)",
        normalized: "Intraday Normalized Outperformance (A% - B%)"
    };
    document.getElementById("spread-chart-subtitle").textContent = `${spreadTitles[params.spreadModel]} with Bollinger Bands (Period: ${params.bbPeriod}, StDev: ${params.bbStdDev})`;

    // Fit both ranges
    priceChart.timeScale().fitContent();
    spreadChart.timeScale().fitContent();

    // -----------------------------------------
    // DOUBLE CHART LOGICAL SCALE SYNCHRONIZATION
    // -----------------------------------------
    let isSyncing = false;
    
    priceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (isSyncing) return;
        isSyncing = true;
        spreadChart.timeScale().setVisibleLogicalRange(range);
        isSyncing = false;
    });

    spreadChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (isSyncing) return;
        isSyncing = true;
        priceChart.timeScale().setVisibleLogicalRange(range);
        isSyncing = false;
    });

    // Keep references in global state
    state.charts.priceChart = priceChart;
    state.charts.spreadChart = spreadChart;
    state.charts.series = {
        lineSeriesA,
        lineSeriesB,
        spreadSeries,
        maSeries,
        upperSeries,
        lowerSeries
    };

    // Auto-resize listener
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const width = entry.contentRect.width;
            if (entry.target.id === "performance-chart-container") {
                priceChart.resize(width, 380);
            } else if (entry.target.id === "spread-chart-container") {
                spreadChart.resize(width, 380);
            }
        }
    });
    resizeObserver.observe(priceContainer);
    resizeObserver.observe(spreadContainer);
}

function setChartMode(mode) {
    if (state.chartMode === mode) return;
    
    state.chartMode = mode;
    
    // Toggle active classes
    const normBtn = document.getElementById("toggle-chart-mode");
    const rawBtn = document.getElementById("toggle-chart-raw");
    
    if (mode === "normalized") {
        normBtn.classList.add("active");
        rawBtn.classList.remove("active");
    } else {
        rawBtn.classList.add("active");
        normBtn.classList.remove("active");
    }

    // Redraw
    try {
        const params = getAnalysisParams();
        renderCharts(params);
    } catch (e) {
        console.error(e);
    }
}

// ----------------------------------------------------
// DATA TABLE RENDERING
// ----------------------------------------------------
function renderDataTable(params) {
    const tableBody = document.getElementById("table-body");
    const thA = document.getElementById("th-asset-a");
    const thB = document.getElementById("th-asset-b");
    const thSpread = document.getElementById("th-spread");

    // Headers
    thA.textContent = `${params.tickerA} ($)`;
    thB.textContent = `${params.tickerB} ($)`;
    thSpread.textContent = `Spread (${params.spreadModel.toUpperCase()})`;

    tableBody.innerHTML = "";

    // For huge lists (like 1m interval), slice or lazy render to prevent lag.
    // Intraday charts are typically 100 - 400 bars depending on interval.
    // Render all elements, but if count > 500, cap it.
    const maxRows = 500;
    const renderData = state.alignedData.slice(0, maxRows);

    if (renderData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="empty-table-msg">No aligned records found.</td></tr>`;
        return;
    }

    const isMultiDay = params.startDate !== params.endDate;

    const rowsHTML = renderData.map(bar => {
        const dateObj = new Date(bar.time * 1000);
        
        // Clean timestamp formatting (includes Date for multi-day ranges)
        let timeStr = "";
        if (isMultiDay) {
            const dateStr = dateObj.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
            const clockStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeStr = `${dateStr} ${clockStr}`;
        } else {
            timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
        let zBadge = "neutral-badge";
        if (bar.zscore >= 2.0) zBadge = "negative-badge";
        else if (bar.zscore <= -2.0) zBadge = "positive-badge";

        return `
            <tr>
                <td>${timeStr}</td>
                <td>$${bar.priceA.toFixed(2)}</td>
                <td>$${bar.priceB.toFixed(2)}</td>
                <td>${bar.spread.toFixed(4)}</td>
                <td>${bar.upper.toFixed(4)}</td>
                <td>${bar.lower.toFixed(4)}</td>
                <td><span class="${zBadge}">${bar.zscore.toFixed(2)}</span></td>
            </tr>
        `;
    }).join("");

    tableBody.innerHTML = rowsHTML;

    // Append warning if truncated
    if (state.alignedData.length > maxRows) {
        const extraRows = state.alignedData.length - maxRows;
        tableBody.innerHTML += `
            <tr>
                <td colspan="7" class="empty-table-msg" style="padding:15px; background:rgba(0,0,0,0.3);">
                    Showing top ${maxRows} records. Truncated ${extraRows} older entries to optimize rendering.
                </td>
            </tr>
        `;
    }
}

// ----------------------------------------------------
// UI FALLBACK ON SYSTEM FAILURE
// ----------------------------------------------------
function clearDashboardOnFailure(errorMsg) {
    document.getElementById("val-correlation").textContent = "ERR";
    document.getElementById("desc-correlation").innerHTML = `<span class="negative-badge">Analysis Interrupted</span>`;
    
    document.getElementById("val-zscore").textContent = "ERR";
    document.getElementById("desc-zscore").className = "negative-badge";
    document.getElementById("desc-zscore").textContent = "Market Offline";

    document.getElementById("val-spread").textContent = "ERR";
    document.getElementById("desc-spread").textContent = errorMsg;

    document.getElementById("val-volatility").textContent = "--";
    document.getElementById("val-mean").textContent = "--";
    document.getElementById("val-range").textContent = "--";

    document.getElementById("performance-chart-container").innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:13px; color:var(--text-muted); padding:30px; text-align:center;">${errorMsg}</div>`;
    document.getElementById("spread-chart-container").innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:13px; color:var(--text-muted); padding:30px; text-align:center;">Failed to resolve time-series data.</div>`;
    
    document.getElementById("table-body").innerHTML = `<tr><td colspan="7" class="empty-table-msg" style="color:var(--danger)">${errorMsg}</td></tr>`;
}

// ----------------------------------------------------
// NOTIFICATIONS UTILITY (TOAST)
// ----------------------------------------------------
function showToast(message, type = "success") {
    // Check if toast container exists
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toast-container";
        toastContainer.style.position = "fixed";
        toastContainer.style.bottom = "24px";
        toastContainer.style.right = "24px";
        toastContainer.style.zIndex = "9999";
        toastContainer.style.display = "flex";
        toastContainer.style.flexDirection = "column";
        toastContainer.style.gap = "8px";
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    toast.className = `glass-panel`;
    toast.style.padding = "12px 20px";
    toast.style.fontSize = "13px";
    toast.style.fontWeight = "500";
    toast.style.minWidth = "280px";
    toast.style.maxWidth = "400px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 10px 25px -5px rgba(0,0,0,0.5)";
    toast.style.transform = "translateY(20px)";
    toast.style.opacity = "0";
    toast.style.transition = "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    
    // Icon and borders depending on type
    if (type === "success") {
        toast.style.borderLeft = "4px solid var(--success)";
        toast.innerHTML = `🟢 &nbsp; ${message}`;
    } else {
        toast.style.borderLeft = "4px solid var(--danger)";
        toast.innerHTML = `🔴 &nbsp; ${message}`;
    }

    toastContainer.appendChild(toast);
    
    // Trigger entrance transition
    setTimeout(() => {
        toast.style.transform = "translateY(0)";
        toast.style.opacity = "1";
    }, 10);

    // Remove toast after delay
    setTimeout(() => {
        toast.style.transform = "translateY(-20px)";
        toast.style.opacity = "0";
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4500);
}
