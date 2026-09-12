```dataviewjs
const transactions = dv.pages('"Transactions"').where((transaction) => transaction.date);
const accounts = dv.pages('"Accounts"').values;
const budget = dv.page("Budget");
const trackedTypes = new Set((Array.isArray(budget?.tracked_types) ? budget.tracked_types : [])
    .map((type) => String(type).trim()).filter(Boolean));
const now = dv.luxon.DateTime.now();
const historyStart = now.minus({ months: 12 });
const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const holderFor = (transaction) => {
    const accountId = transaction.account_id != null ? String(transaction.account_id) : String(transaction.account || "");
    const account = accounts.find((candidate) =>
        candidate.account_id != null && String(candidate.account_id) === accountId ||
        candidate.account != null && String(candidate.account) === accountId);
    return String(account?.account_holder || "Unassigned").trim() || "Unassigned";
};
const monthly = new Map();
for (const transaction of transactions) {
    const amount = Number(transaction.price);
    const date = transaction.date;
    if (!Number.isFinite(amount) || !date || date < historyStart || date > now) continue;
    const holder = holderFor(transaction);
    const month = date.toFormat("yyyy-MM");
    const entry = monthly.get(holder) || { income: new Map(), spending: new Map() };
    if (amount > 0) entry.income.set(month, (entry.income.get(month) || 0) + amount);
    if (amount < 0 && trackedTypes.size && String(transaction.type || "").split(",").some((type) => trackedTypes.has(type.trim()))) {
        entry.spending.set(month, (entry.spending.get(month) || 0) + Math.abs(amount));
    }
    monthly.set(holder, entry);
}
const goals = dv.pages('"Goals"').where((goal) => {
    const path = String(goal.file.path);
    return goal.isCompleted === false && (
        path.startsWith("Goals/Long Term/") && goal.file.name === "Overview" ||
        path.startsWith("Goals/Wishlist/") && goal.file.name === "Overview" ||
        /^Goals\/Short Term\/[^/]+\.md$/.test(path)
    );
});
const values = new Map();
for (const [holder, entry] of monthly) values.set(holder, { holder, income: median([...entry.income.values()]), spending: median([...entry.spending.values()]), allocation: 0 });
for (const goal of goals) {
    const holders = Array.isArray(goal.account_holders) ? goal.account_holders : String(goal.account_holders || "Unassigned").split(/,\s*/);
    const raw = String(goal.allocate || "").trim();
    const isPercent = raw.endsWith("%");
    const amount = Number(isPercent ? raw.slice(0, -1).trim() : raw);
    if (!Number.isFinite(amount) || amount < 0 || isPercent && amount > 100) continue;
    for (const rawHolder of holders) {
        const holder = String(rawHolder).trim() || "Unassigned";
        const entry = values.get(holder) || { holder, income: 0, spending: 0, allocation: 0 };
        entry.allocation += isPercent ? entry.income * amount / 100 : amount;
        values.set(holder, entry);
    }
}
const format = (value) => `€ ${Number(value).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const root = document.createElement("div");
root.className = "finance-insights";
const header = document.createElement("div");
header.className = "finance-insights__header";
header.innerHTML = '<div><div class="finance-eyebrow">Monthly estimate</div><div class="finance-insights__title">Expected disposable income</div></div>';
root.appendChild(header);
const table = document.createElement("table");
table.className = "finance-table";
const headerRow = table.insertRow();
for (const heading of ["Account holder", "Typical income", "Typical spending", "Goal allocations", "Disposable income"]) headerRow.insertCell().textContent = heading;
for (const entry of Array.from(values.values()).sort((left, right) => left.holder.localeCompare(right.holder))) {
    const row = table.insertRow();
    row.insertCell().textContent = entry.holder;
    row.insertCell().textContent = format(entry.income);
    row.insertCell().textContent = format(entry.spending);
    row.insertCell().textContent = format(entry.allocation);
    row.insertCell().textContent = format(entry.income - entry.spending - entry.allocation);
}
const panel = document.createElement("div");
panel.className = "finance-chart-card";
panel.appendChild(table);
root.appendChild(panel);
dv.container.appendChild(root);
```
