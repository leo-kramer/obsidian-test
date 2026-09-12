```dataviewjs
const budget = dv.page("Budget");
const transactions = dv.pages('"Transactions"').where((transaction) => transaction.date);
const accounts = dv.pages('"Accounts"').values;
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
const result = new Map();
for (const [holder, entry] of monthly) {
    result.set(holder, { typicalIncome: median([...entry.income.values()]), typicalSpending: median([...entry.spending.values()]), allocation: 0 });
}
for (const account of accounts) {
    const holder = String(account.account_holder || "Unassigned").trim() || "Unassigned";
    if (!result.has(holder)) result.set(holder, { typicalIncome: 0, typicalSpending: 0, allocation: 0 });
}
for (const goal of goals) {
    const holders = Array.isArray(goal.account_holders) ? goal.account_holders : String(goal.account_holders || "Unassigned").split(/,\s*/);
    const raw = String(goal.allocate || "").trim();
    const isPercent = raw.endsWith("%");
    const amount = Number(isPercent ? raw.slice(0, -1).trim() : raw);
    if (!Number.isFinite(amount) || amount < 0 || isPercent && amount > 100) continue;
    for (const rawHolder of holders) {
        const holder = String(rawHolder).trim() || "Unassigned";
        const entry = result.get(holder) || { typicalIncome: 0, typicalSpending: 0, allocation: 0 };
        entry.allocation += isPercent ? entry.typicalIncome * amount / 100 : amount;
        result.set(holder, entry);
    }
}
const propertyPrefix = (holder) => String(holder)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Unassigned";
const readBudgetValue = (holder, property) => {
    const value = Number(budget?.[`${propertyPrefix(holder)}_${property}`]);
    return Number.isFinite(value) ? value : null;
};
for (const [holder, entry] of result) {
    const typicalIncome = readBudgetValue(holder, "typical_income");
    const typicalSpending = readBudgetValue(holder, "typical_spending");
    const allocations = readBudgetValue(holder, "goal_allocations");
    if (typicalIncome !== null) entry.typicalIncome = typicalIncome;
    if (typicalSpending !== null) entry.typicalSpending = typicalSpending;
    if (allocations !== null) entry.allocation = allocations;
}
const format = (value) => `€ ${Number(value).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const root = document.createElement("div");
root.className = "finance-insights";
const header = document.createElement("div");
header.className = "finance-insights__header";
header.innerHTML = '<div><div class="finance-eyebrow">Budget forecast</div><div class="finance-insights__title">Monthly outlook</div></div>';
const tabs = document.createElement("div");
tabs.className = "finance-tabs";
header.appendChild(tabs);
root.appendChild(header);
const content = document.createElement("div");
content.className = "finance-chart-card";
root.appendChild(content);
dv.container.appendChild(root);
const render = (holder) => {
    content.replaceChildren();
    const entry = result.get(holder);
    if (!entry) {
        content.textContent = "No budget data available.";
        return;
    }
    const grid = document.createElement("div");
    grid.className = "finance-prediction-grid";
    for (const [label, value] of [
        ["Typical income", entry.typicalIncome],
        ["Typical spending", entry.typicalSpending],
        ["Available after expenses", entry.typicalIncome - entry.typicalSpending],
        ["Goal allocations", entry.allocation],
        ["Disposable income", entry.typicalIncome - entry.typicalSpending - entry.allocation],
    ]) {
        const item = document.createElement("div");
        item.innerHTML = `<div class="finance-meta">${label}</div><div class="finance-value">${format(value)}</div>`;
        grid.appendChild(item);
    }
    content.appendChild(grid);
};
for (const holder of Array.from(result.keys()).sort((left, right) => left.localeCompare(right))) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "finance-tab";
    tab.textContent = holder;
    tab.addEventListener("click", () => {
        tabs.querySelectorAll("button").forEach((button) => button.classList.remove("is-active"));
        tab.classList.add("is-active");
        render(holder);
    });
    tabs.appendChild(tab);
    if (tabs.children.length === 1) tab.click();
}
if (!tabs.children.length) content.textContent = "No budget data available.";
```
