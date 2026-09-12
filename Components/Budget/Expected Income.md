---
expected_income: 276.65
typical_income: 3319.77
forecast_income: 276.65
---

```dataviewjs
const budget = dv.page("Budget");

const transactions = dv.pages('"Transactions"')
	.where(transaction => transaction.date);

const accounts = dv.pages('"Accounts"').values;

const now = dv.luxon.DateTime.now();
const historyStart = now.minus({ months: 12 });

const formatCurrency = value =>
	`€ ${Number(value).toLocaleString("nl-NL", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;

const median = values => {
	if (!values.length) return 0;

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
};

const accountHolderFor = transaction => {
	const accountId =
		transaction.account_id != null
			? String(transaction.account_id)
			: String(transaction.account || "");

	const account = accounts.find(candidate =>
		(
			candidate.account_id != null &&
			String(candidate.account_id) === accountId
		) ||
		(
			candidate.account != null &&
			String(candidate.account) === accountId
		)
	);

	return String(
		account?.account_holder ||
		transaction.account ||
		"Unassigned"
	).trim() || "Unassigned";
};

// --------------------------------------------------
// Collect income by account holder
// --------------------------------------------------

const incomeByHolder = new Map();

for (const transaction of transactions) {

	const amount = Number(transaction.price);
	const date = transaction.date;

	if (
		!Number.isFinite(amount) ||
		amount <= 0 ||
		!date ||
		date.toMillis() < historyStart.toMillis() ||
		date.toMillis() > now.toMillis()
	) {
		continue;
	}

	const holder = accountHolderFor(transaction);

	const current =
		incomeByHolder.get(holder) || {
			holder,
			total: 0,
			monthly: new Map()
		};

	const month = date.toFormat("yyyy-MM");

	current.total += amount;

	current.monthly.set(
		month,
		(current.monthly.get(month) || 0) + amount
	);

	incomeByHolder.set(holder, current);
}
for (const account of accounts) {
	const holder = String(account.account_holder || "Unassigned").trim() || "Unassigned";
	if (!incomeByHolder.has(holder)) incomeByHolder.set(holder, { holder, total: 0, monthly: new Map() });
}

// --------------------------------------------------
// Calculate predictions
// --------------------------------------------------

const incomePredictions = Array
	.from(incomeByHolder.values())
	.map(entry => ({
		...entry,
		monthCount: entry.monthly.size,
		typical: median(Array.from(entry.monthly.values()))
	}))
	.map(entry => ({
		...entry,
		frequency: entry.monthCount / 12,
		expected: entry.typical * (entry.monthCount / 12)
	}))
	.sort(
		(left, right) =>
			right.frequency - left.frequency ||
			right.typical - left.typical ||
			left.holder.localeCompare(right.holder)
	);

const typicalIncomeTotal =
	Math.round(
		incomePredictions.reduce(
			(sum, entry) => sum + entry.typical,
			0
		) * 100
	) / 100;

const forecastIncomeTotal =
	Math.round(
		incomePredictions.reduce(
			(sum, entry) => sum + entry.expected,
			0
		) * 100
	) / 100;

const propertyPrefix = holder => String(holder)
	.trim()
	.replace(/[^A-Za-z0-9]+/g, "_")
	.replace(/^_+|_+$/g, "") || "Unassigned";
const holderIncomeNeedsUpdate = incomePredictions.some(entry => {
	const prefix = propertyPrefix(entry.holder);
	return Number(budget?.[`${prefix}_typical_income`]) !== entry.typical ||
		Number(budget?.[`${prefix}_forecast_income`]) !== entry.expected;
});

// --------------------------------------------------
// Persist Budget values
// --------------------------------------------------

const budgetFile = app.vault.getAbstractFileByPath("Budget.md");

if (
	budgetFile &&
	(
		Number(budget?.expected_income) !== forecastIncomeTotal ||
		Number(budget?.typical_income) !== typicalIncomeTotal ||
		Number(budget?.forecast_income) !== forecastIncomeTotal ||
		holderIncomeNeedsUpdate
	)
) {
	await app.fileManager.processFrontMatter(
		budgetFile,
		frontmatter => {
			frontmatter.expected_income = forecastIncomeTotal;
			frontmatter.typical_income = typicalIncomeTotal;
			frontmatter.forecast_income = forecastIncomeTotal;
			for (const entry of incomePredictions) {
				const prefix = propertyPrefix(entry.holder);
				frontmatter[`${prefix}_expected_income`] = entry.expected;
				frontmatter[`${prefix}_typical_income`] = entry.typical;
				frontmatter[`${prefix}_forecast_income`] = entry.expected;
			}
		}
	);
}

// --------------------------------------------------
// Render
// --------------------------------------------------

const root = document.createElement("div");
root.className = "finance-insights";
const header = document.createElement("div");
header.className = "finance-insights__header";
header.innerHTML = `<div><div class="finance-eyebrow">Expected income for ${now.plus({ months: 1 }).toFormat("MMMM yyyy")}</div><div class="finance-insights__title">Income by account holder</div></div>`;
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
	const entries = incomePredictions.filter((entry) => entry.holder === holder);
	if (!entries.length) {
		content.textContent = "There is not enough income history to make a prediction.";
		return;
	}
	const entry = entries[0];
	const grid = document.createElement("div");
	grid.className = "finance-prediction-grid";
	for (const [label, value] of [["Typical income", entry.typical], ["Forecast income", entry.expected], ["Active months", `${entry.monthCount} / 12 months`]]) {
		const item = document.createElement("div");
		item.innerHTML = `<div class="finance-meta">${label}</div><div class="finance-value">${typeof value === "number" ? formatCurrency(value) : value}</div>`;
		grid.appendChild(item);
	}
	content.appendChild(grid);
};
const holders = [...new Set(incomePredictions.map((entry) => entry.holder))];
for (const holder of holders) {
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
```
