```dataviewjs
const fallbackColors = ["#2f6f8f", "#b85c38", "#628b6f", "#8a6f9b", "#c28b36", "#5f7d8a"];
const chartPlugin = app.plugins.plugins["obsidian-charts"];
const chartColors = Array.isArray(chartPlugin?.settings?.colors) && chartPlugin.settings.colors.length >= 6 ? chartPlugin.settings.colors : fallbackColors;
const renderChart = typeof window.renderChart === "function" ? window.renderChart : (_chart, container) => container?.createEl("p", { text: "Charts are unavailable. Enable the Obsidian Charts plugin to view them." });
const transactions = dv.pages('"Transactions"');
const now = dv.date("today");
const months = [];
for (let index = 11; index >= 0; index -= 1) {
    const date = now.minus({ months: index });
    months.push({ year: date.year, month: date.month, label: date.toFormat("MMM") });
}
const monthTotals = months.map((target) => transactions.values.reduce((total, transaction) => {
    const amount = Number(transaction.price);
    const date = transaction.date;
    if (!Number.isFinite(amount) || !date) return total;
    const included = date.year < target.year || (date.year === target.year && date.month <= target.month);
    return included ? total + amount : total;
}, 0));
this.container.classList.add("finance-chart-card");
renderChart({
    type: "line",
    data: { labels: months.map((month) => month.label), datasets: [{ label: "Net Worth", data: monthTotals, borderColor: chartColors[0], backgroundColor: `${chartColors[0]}33`, fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: chartColors[0] }] },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `€ ${Number(context.raw).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(127, 127, 127, 0.14)" } } } },
}, this.container);
```
