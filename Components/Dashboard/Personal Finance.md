```dataviewjs
const transactions = dv.pages('"Transactions"');
const netWorth = transactions.values.reduce((total, transaction) => {
    const amount = Number(transaction.price);
    return Number.isFinite(amount) ? total + amount : total;
}, 0);
const formatted = netWorth.toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const panel = document.createElement("div");
panel.className = "finance-panel finance-panel--hero";
panel.innerHTML = `<div class="finance-panel__header"><div><div class="finance-eyebrow">Personal finance</div><div class="finance-value finance-value--hero">€ ${formatted}</div></div><div class="finance-badge">Net worth</div></div>`;
dv.container.appendChild(panel);
```
