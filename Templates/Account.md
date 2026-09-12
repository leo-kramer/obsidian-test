---
template_id: 1
account: %%account%%
account_holder: %%account_holder%%
account_id: %%account_id%%
---

# %%account%%

```dataviewjs
const fmt = (n) => `€ ${Number(n).toLocaleString('nl-NL', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
})}`;
const transactions = dv.pages('"Transactions"')
	.where((transaction) =>
		transaction.account_id === dv.current().account_id ||
		transaction.account === dv.current().account,
	);
const balance = transactions.values.reduce((sum, transaction) => sum + (Number(transaction.price) || 0), 0);

const panel = document.createElement("div");
panel.className = "finance-panel";
panel.innerHTML = `<div class="finance-eyebrow">Account balance</div><div class="finance-value finance-value--hero">${fmt(balance)}</div><div class="finance-meta">Holder: <strong>${dv.current().account_holder || "Unassigned"}</strong> · ID: ${dv.current().account_id}</div>`;
dv.container.appendChild(panel);
dv.table(
	["Transaction", "Type", "Price"],
	transactions
		.sort((transaction) => transaction.date, "desc")
		.map((transaction) => [transaction.reason, transaction.type, fmt(transaction.price)])
);
dv.container.querySelectorAll("table").forEach((table) => {
	table.classList.add("finance-table");
});
```
