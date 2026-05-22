# 📊 QuantSpread: Hyperscaler vs. SaaS Pairs-Trading Monitor

An advanced, high-performance, and visually stunning **quantitative pairs-trading spread monitor dashboard** designed to track relative intraday and historical performance spreads between major Tech Hyperscalers (`MSFT`, `GOOGL`, `AMZN`) and leading SaaS companies (`NOW`, `SAP`, `TEAM`, `PATH`, etc.).

Live Demo: **[https://nboitout.github.io/trading-/](https://nboitout.github.io/trading-/)**

---

## ✨ Features

- **🚀 Real-Time Time-Series Alignment:** Parallel asynchronous data fetches from Polygon.io with an advanced forward-fill engine that eliminates asynchronous trading execution gaps.
- **📈 Fully Synchronized Interactive Charts:** Uses TradingView Lightweight Charts (v4) with crosshair scale synchronization (zooming and panning on one chart automatically updates the other).
- **🔬 Advanced Quantitative Analytics:**
  - **Pearson Correlation ($r$):** Real-time linear correlation tracking over custom periods.
  - **Spread Bollinger Bands & Z-Scores:** Dynamic moving standard deviation bands ($\pm 2$ StdDev by default) and rolling Z-score anomaly tracking.
  - **Four Spread Math Methodologies:**
    - Price Ratio: $Price_A / Price_B$
    - Log Spread: $\ln(Price_A) - \ln(Price_B)$ (percentage-based relative tracking)
    - Price Difference: $Price_A - Price_B$ (nominal spread)
    - Normalized Return Spread: $Return_{A,\%} - Return_{B,\%}$ (normalized to 100% since period open)
- **🌓 Premium Dark Theme:** Sleek modern interface utilizing responsive HSL variables, glassmorphic panels, glowing accents, and a hidden raw data matrix inspector.

---

## 🛠️ Setup & Security

Because this repository is **public**, this application has been carefully designed to preserve API key security:

1. **No Hardcoded Keys:** The codebase contains no embedded API keys.
2. **Client-Side Caching:** Simply paste your free [Polygon.io](https://polygon.io/) API key into the input field in the top-right header and click the **Save (💾)** icon.
3. **Local Privacy:** Your API key is stored securely in your browser's private `localStorage`. It never leaves your machine and is completely isolated from other visitors.

---

## 🚀 How to Run Locally

Since the project is built using vanilla web technologies, you don't need `npm` or complex installation pipelines:

1. Clone this repository:
   ```bash
   git clone https://github.com/nboitout/trading-.git
   ```
2. Open `index.html` directly in any web browser, or spin up a simple local server:
   ```bash
   python -m http.server 8080
   ```
3. Open `http://localhost:8080` and enter your Polygon API key!

---

## 📚 Technologies Used

- **Styling:** Custom Vanilla CSS Grid & Flexbox with HSL variables.
- **Charts:** [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) via CDN.
- **Data Source:** [Polygon.io](https://polygon.io/) Free Tier Market Aggregates API.