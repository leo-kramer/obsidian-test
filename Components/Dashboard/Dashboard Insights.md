```dataviewjs
const fallbackColors = ["#2f6f8f", "#b85c38", "#628b6f", "#8a6f9b", "#c28b36", "#5f7d8a"];
const chartPlugin = app.plugins.plugins["obsidian-charts"];
const chartColors = Array.isArray(chartPlugin?.settings?.colors) && chartPlugin.settings.colors.length >= 6 ? chartPlugin.settings.colors : fallbackColors;
const renderChart = typeof window.renderChart === "function" ? window.renderChart : (_chart, container) => container?.createEl("p", { text: "Charts are unavailable. Enable the Obsidian Charts plugin to view them." });
const transactions = dv.pages('"Transactions"').where((transaction) => transaction.date);
const now = dv.luxon.DateTime.now();
const periods = { month: { label: "This month", matches: (date) => date.year === now.year && date.month === now.month }, year: { label: "This year", matches: (date) => date.year === now.year }, all: { label: "All time", matches: () => true } };
const root = document.createElement("div"); root.className = "finance-insights";
const header = document.createElement("div"); header.className = "finance-insights__header";
const title = document.createElement("div"); title.innerHTML = `<div class="finance-eyebrow">Insights</div><div class="finance-insights__title">Income and spending</div>`; header.appendChild(title);
const tabs = document.createElement("div"); tabs.className = "finance-tabs"; header.appendChild(tabs); root.appendChild(header);
const chartGrid = document.createElement("div"); chartGrid.className = "finance-chart-grid"; root.appendChild(chartGrid); dv.container.appendChild(root);
const chartPanels = {};
for (const key of ["expenses", "income"]) { const panel = document.createElement("div"); panel.className = "finance-chart-card"; const label = document.createElement("div"); label.className = "finance-chart-card__label"; label.textContent = key === "expenses" ? "Expenses" : "Income"; panel.appendChild(label); const chart = document.createElement("div"); panel.appendChild(chart); chartGrid.appendChild(panel); chartPanels[key] = chart; }
const formatCurrency = (value) => `€ ${Number(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const totalsFor = (period, sign) => { const totals = Object.create(null); for (const transaction of transactions) { const amount = Number(transaction.price); if (!Number.isFinite(amount) || !periods[period].matches(transaction.date)) continue; if ((sign === "expense" && amount >= 0) || (sign === "income" && amount <= 0)) continue; const type = transaction.type ?? "Unknown"; totals[type] = (totals[type] ?? 0) + Math.abs(amount); } return totals; };
const renderPeriod = (period) => { for (const [key, sign] of [["expenses", "expense"], ["income", "income"]]) { const chart = chartPanels[key]; chart.replaceChildren(); const totals = totalsFor(period, sign); if (!Object.keys(totals).length) { chart.className = "finance-chart finance-chart--empty"; chart.textContent = `No ${key} recorded for ${periods[period].label.toLowerCase()}.`; continue; } chart.className = "finance-chart"; renderChart({ type: "pie", data: { labels: Object.keys(totals), datasets: [{ data: Object.values(totals), borderColor: "var(--background-primary)", borderWidth: 2, backgroundColor: chartColors }] }, options: { responsive: true, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 16 } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCurrency(context.raw)}` } } } } }, chart); } };
for (const [key, period] of Object.entries(periods)) { const tab = document.createElement("button"); tab.type = "button"; tab.textContent = period.label; tab.className = "finance-tab"; tab.addEventListener("click", () => { tabs.querySelectorAll("button").forEach((button) => button.classList.remove("is-active")); tab.classList.add("is-active"); renderPeriod(key); }); tabs.appendChild(tab); if (key === "month") tab.click(); }
```
