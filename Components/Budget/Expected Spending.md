---
expected_total: 0
typical_spending: 0
forecast_spending: 0
---

```dataviewjs
const budget = dv.page("Budget");

const settings = dv.page("Settings");

const configuredTypes =
	Array.isArray(settings?.transaction_types)
		? settings.transaction_types
			.map(type => String(type).trim())
			.filter(Boolean)
		: [];

const selectedTypes =
	Array.isArray(budget?.tracked_types)
		? budget.tracked_types
			.map(type => String(type).trim())
			.filter(Boolean)
		: [];

const selectedTypeSet = new Set(selectedTypes);

const transactions = dv.pages('"Transactions"')
	.where(transaction => transaction.date);
const accounts = dv.pages('"Accounts"').values;

const accountHolderFor = transaction => {
	const accountId = transaction.account_id != null
		? String(transaction.account_id)
		: String(transaction.account || "");
	const account = accounts.find(candidate =>
		(candidate.account_id != null && String(candidate.account_id) === accountId) ||
		(candidate.account != null && String(candidate.account) === accountId)
	);
	return String(account?.account_holder || "Unassigned").trim() || "Unassigned";
};

const now = dv.luxon.DateTime.now();
const historyStart = now.minus({ months: 12 });

const formatCurrency = value =>
	`€ ${Number(value).toLocaleString("nl-NL", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;

const normalizeTypes = value =>
	Array.isArray(value)
		? value.map(type => String(type).trim()).filter(Boolean)
		: [String(value || "").trim()].filter(Boolean);

const median = values => {

	if (!values.length) return 0;

	const sorted = [...values].sort(
		(left, right) => left - right
	);

	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
};

// --------------------------------------------------
// Historical tracked spending
// --------------------------------------------------

const predictions = new Map();

for (const transaction of transactions) {

	const amount = Number(transaction.price);
	const date = transaction.date;
	const types = normalizeTypes(transaction.type);

	const matchingType =
		types.find(type => selectedTypeSet.has(type));

	if (
		!Number.isFinite(amount) ||
		amount >= 0 ||
		!date ||
		!matchingType
	) {
		continue;
	}

	if (
		date.toMillis() < historyStart.toMillis() ||
		date.toMillis() > now.toMillis()
	) {
		continue;
	}

	const reason =
		String(transaction.reason || "").trim() ||
		matchingType;

	const holder = accountHolderFor(transaction);
	const key = `${holder}\u0000${matchingType}\u0000${reason}`;

	const current =
		predictions.get(key) || {
			type: matchingType,
			holder,
			reason,
			monthly: new Map(),
			lastSeen: date,
			fixed: false
		};

	const month = date.toFormat("yyyy-MM");

	current.monthly.set(
		month,
		(current.monthly.get(month) || 0) +
			Math.abs(amount)
	);

	if (date.toMillis() > current.lastSeen.toMillis()) {
		current.lastSeen = date;
	}

	predictions.set(key, current);
}

// --------------------------------------------------
// Scheduled recurring Budget/Items
// --------------------------------------------------

const recurringItems = dv.pages('"Budget/Items"')
	.where(item =>
		item.active !== false &&
		String(item.active).toLowerCase() !== "false"
	)
	.where(item =>
		Number(item.price) > 0 &&
		item.next_payment &&
		Number(item.interval_days) > 0
	);

const nextMonthStart =
	now.plus({ months: 1 }).startOf("month");

const nextMonthEnd =
	nextMonthStart.endOf("month");

const scheduledPaymentCount = item => {

	let payment =
		dv.luxon.DateTime.fromISO(
			String(item.next_payment).slice(0, 10)
		);

	const intervalDays = Number(item.interval_days);

	if (
		!payment.isValid ||
		!Number.isFinite(intervalDays) ||
		intervalDays <= 0
	) {
		return 0;
	}

	while (payment < nextMonthStart) {
		payment = payment.plus({
			days: intervalDays
		});
	}

	let count = 0;

	while (payment <= nextMonthEnd) {
		count += 1;

		payment = payment.plus({
			days: intervalDays
		});
	}

	return count;
};

for (const item of recurringItems) {

	const type =
		String(item.type || "Subscription").trim();

	if (!selectedTypeSet.has(type)) continue;

	const paymentCount =
		scheduledPaymentCount(item);

	if (!paymentCount) continue;

	const reason =
		String(
			item.name ||
			item.category ||
			item.file.name
		).trim() || type;

	const holder = "Unassigned";
	const key = `${holder}\u0000${type}\u0000${reason}`;

	const amount =
		(Number(item.price) || 0) * paymentCount;

	predictions.set(key, {
		type,
		holder,
		reason,
		monthly: new Map(),
		lastSeen: nextMonthStart,
		typical: amount,
		expected: amount,
		frequency: 1,
		monthCount: 12,
		fixed: true
	});
}

// --------------------------------------------------
// Final predictions
// --------------------------------------------------

const allPredictions = Array
	.from(predictions.values())
	.map(entry => ({
		...entry,
		monthCount: entry.fixed
			? entry.monthCount
			: entry.monthly.size,

		typical: entry.fixed
			? entry.typical
			: median(
				Array.from(entry.monthly.values())
			)
	}))
	.map(entry => ({
		...entry,

		frequency:
			entry.monthCount / 12,

		expected:
			entry.fixed
				? entry.expected
				: entry.typical *
					(entry.monthCount / 12)
	}));

const predictedEntries = [
	...allPredictions.filter(entry => entry.fixed),

	...allPredictions
		.filter(entry => !entry.fixed)
		.sort(
			(left, right) =>
				right.monthCount - left.monthCount ||
				right.lastSeen.toMillis() -
					left.lastSeen.toMillis() ||
				right.typical - left.typical ||
				left.reason.localeCompare(right.reason)
		)
		.slice(0, 10)
];

const predictedTotal =
	Math.round(
		predictedEntries.reduce(
			(sum, entry) => sum + entry.expected,
			0
		) * 100
	) / 100;

const typicalSpendingTotal =
	Math.round(
		predictedEntries.reduce(
			(sum, entry) => sum + entry.typical,
			0
		) * 100
	) / 100;

const propertyPrefix = holder => String(holder)
	.trim()
	.replace(/[^A-Za-z0-9]+/g, "_")
	.replace(/^_+|_+$/g, "") || "Unassigned";
const spendingByHolder = new Map();
for (const entry of predictedEntries) {
	const current = spendingByHolder.get(entry.holder) || { typical: 0, expected: 0 };
	current.typical += entry.typical;
	current.expected += entry.expected;
	spendingByHolder.set(entry.holder, current);
}
for (const account of accounts) {
	const holder = String(account.account_holder || "Unassigned").trim() || "Unassigned";
	if (!spendingByHolder.has(holder)) spendingByHolder.set(holder, { typical: 0, expected: 0 });
}
const holderSpendingNeedsUpdate = Array.from(spendingByHolder.entries()).some(([holder, entry]) => {
	const prefix = propertyPrefix(holder);
	return Number(budget?.[`${prefix}_typical_spending`]) !== entry.typical ||
		Number(budget?.[`${prefix}_forecast_spending`]) !== entry.expected;
});

// --------------------------------------------------
// Persist Budget values
// --------------------------------------------------

const budgetFile = app.vault.getAbstractFileByPath("Budget.md");

if (
	budgetFile &&
	(
		Number(budget?.expected_total) !== predictedTotal ||
		Number(budget?.typical_spending) !== typicalSpendingTotal ||
		Number(budget?.forecast_spending) !== predictedTotal ||
		holderSpendingNeedsUpdate
	)
) {
	await app.fileManager.processFrontMatter(
		budgetFile,
		frontmatter => {
			frontmatter.expected_total = predictedTotal;
			frontmatter.typical_spending = typicalSpendingTotal;
			frontmatter.forecast_spending = predictedTotal;
			for (const [holder, entry] of spendingByHolder) {
				const prefix = propertyPrefix(holder);
				frontmatter[`${prefix}_expected_total`] = entry.expected;
				frontmatter[`${prefix}_typical_spending`] = entry.typical;
				frontmatter[`${prefix}_forecast_spending`] = entry.expected;
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
header.innerHTML = `<div><div class="finance-eyebrow">Expected spending for ${nextMonthStart.toFormat("MMMM yyyy")}</div><div class="finance-insights__title">Spending by account holder</div></div>`;
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
	if (!selectedTypes.length) {
		content.textContent = "Select tracked transaction types to generate a prediction.";
		return;
	}
	const entries = predictedEntries.filter((entry) => entry.holder === holder);
	if (!entries.length) {
		content.textContent = "There is not enough tracked spending history to make a prediction.";
		return;
	}
	const table = document.createElement("table");
	table.className = "finance-table";
	const headerRow = table.insertRow();
	for (const heading of ["Type", "Reason", "Typical", "Forecast", "Frequency"]) headerRow.insertCell().textContent = heading;
	for (const entry of entries) {
		const row = table.insertRow();
		row.insertCell().textContent = entry.type;
		row.insertCell().textContent = entry.reason;
		row.insertCell().textContent = formatCurrency(entry.typical);
		row.insertCell().textContent = formatCurrency(entry.expected);
		row.insertCell().textContent = entry.fixed ? "Scheduled" : `${entry.monthCount} / 12 months`;
	}
	content.appendChild(table);
};
const holders = [...new Set(predictedEntries.map((entry) => entry.holder))];
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
