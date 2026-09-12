```dataviewjs
const groups = Object.create(null);
for (const transaction of dv.pages('"Transactions"')) {
    const amount = Number(transaction.price);
    if (!Number.isFinite(amount) || !transaction.account) continue;
    groups[transaction.account] = (groups[transaction.account] || 0) + amount;
}
const rows = Object.entries(groups).map(([account, total]) => [account, `€ ${total.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
dv.table(["Account", "Balance"], rows);
const table = dv.container.querySelector("table");
if (table) table.classList.add("finance-table");
```
