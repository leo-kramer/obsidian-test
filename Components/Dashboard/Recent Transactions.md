```dataviewjs
const transactions = dv.pages('"Transactions"').where((transaction) => Number.isFinite(Number(transaction.price))).sort((transaction) => transaction.date, "desc").limit(5);
const rows = transactions.map((transaction) => [transaction.file.link, transaction.type, `€ ${Number(transaction.price).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
dv.table(["File", "Type", "Price"], rows);
const table = dv.container.querySelector("table");
if (table) table.classList.add("finance-table");
```
