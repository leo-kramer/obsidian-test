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

const normalizeTypes = value =>
	Array.isArray(value)
		? value
			.map(type => String(type).trim())
			.filter(Boolean)
		: [String(value || "").trim()]
			.filter(Boolean);

const formatCurrency = value =>
	`€ ${Number(value).toLocaleString("nl-NL", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;

// --------------------------------------------------
// Periods
// --------------------------------------------------

const periods = {

	month: {
		label: "This month",

		matches: (date, current) =>
			date.year === current.year &&
			date.month === current.month
	},

	year: {
		label: "This year",

		matches: (date, current) =>
			date.year === current.year
	},

	all: {
		label: "All time",

		matches: () => true
	}
};

// --------------------------------------------------
// Chart setup
// --------------------------------------------------

const fallbackColors = [
	"#2f6f8f",
	"#b85c38",
	"#628b6f",
	"#8a6f9b",
	"#c28b36",
	"#5f7d8a"
];

const chartPlugin =
	app.plugins.plugins["obsidian-charts"];

const chartColors =
	Array.isArray(chartPlugin?.settings?.colors) &&
	chartPlugin.settings.colors.length >= 6
		? chartPlugin.settings.colors
		: fallbackColors;

const renderChart =
	typeof window.renderChart === "function"
		? window.renderChart
		: (_chart, container) =>
			container?.createEl("p", {
				text:
					"Charts are unavailable. Enable the Obsidian Charts plugin to view them."
			});

const colorForType = new Map(
	configuredTypes.map(
		(type, index) =>
			[
				type,
				chartColors[index % chartColors.length]
			]
	)
);

// --------------------------------------------------
// Calculate totals
// --------------------------------------------------

const totalsFor = (period, holder) => {

	const totals = new Map();
	const current = dv.luxon.DateTime.now();

	for (const transaction of transactions) {

		const amount = Number(transaction.price);
		const types = normalizeTypes(transaction.type);
		const transactionHolder = accountHolderFor(transaction);

		if (
			!Number.isFinite(amount) ||
			amount >= 0 ||
			!periods[period].matches(
				transaction.date,
				current
			)
		) {
			continue;
		}

		const matchingType =
			types.find(type =>
				selectedTypeSet.has(type)
			);

		if (!matchingType) continue;
		if (holder && transactionHolder !== holder) continue;

		const reason =
			String(transaction.reason || "").trim() ||
			matchingType;

			const key =
				`${transactionHolder}\u0000${matchingType}\u0000${reason}`;

		const entry =
			totals.get(key) || {
				label: reason,
				type: matchingType,
				holder: transactionHolder,
				amount: 0
			};

		entry.amount += Math.abs(amount);

		totals.set(key, entry);
	}

	const typeOrder = new Map(
		configuredTypes.map(
			(type, index) => [type, index]
		)
	);

	return Array
		.from(totals.values())
		.sort(
			(left, right) =>
				(typeOrder.get(left.type) ??
					Number.MAX_SAFE_INTEGER) -
				(typeOrder.get(right.type) ??
					Number.MAX_SAFE_INTEGER) ||
				right.amount - left.amount ||
				left.label.localeCompare(right.label)
		);
};

// --------------------------------------------------
// Build UI
// --------------------------------------------------

const root = document.createElement("div");
root.className = "finance-insights";

const header = document.createElement("div");
header.className = "finance-insights__header";

const title = document.createElement("div");

title.innerHTML = `
	<div class="finance-eyebrow">
		Budget
	</div>

	<div class="finance-insights__title">
		Tracked spending
	</div>
`;

header.appendChild(title);

const tabs = document.createElement("div");
tabs.className = "finance-tabs";

header.appendChild(tabs);

const holderTabs = document.createElement("div");
holderTabs.className = "finance-tabs";
holderTabs.style.marginTop = "0.75rem";
header.appendChild(holderTabs);
root.appendChild(header);

const chart = document.createElement("div");
chart.className = "finance-chart-card";

root.appendChild(chart);

const dataTable = document.createElement("div");
dataTable.className = "finance-table-container";

root.appendChild(dataTable);

dv.container.appendChild(root);

// --------------------------------------------------
// Chart
// --------------------------------------------------

const createChart = entries => ({

	type: "pie",

	data: {

		labels:
			entries.map(entry => entry.label),

		datasets: [{

			data:
				entries.map(entry => entry.amount),

			borderColor:
				"var(--background-primary)",

			borderWidth: 2,

			backgroundColor:
				entries.map(
					entry =>
						colorForType.get(entry.type) ||
						chartColors[0]
				)
		}]
	},

	options: {

		responsive: true,

		plugins: {

			legend: {

				position: "bottom",

				labels: {

					usePointStyle: true,

					padding: 16,

					generateLabels: () =>
						Array
							.from(
								new Set(
									entries.map(
										entry => entry.type
									)
								)
							)
							.map(type => ({

								text: type,

								fillStyle:
									colorForType.get(type) ||
									chartColors[0],

								strokeStyle:
									colorForType.get(type) ||
									chartColors[0],

								lineWidth: 1,

								hidden: false
							}))
				}
			},

			tooltip: {

				callbacks: {

					label: context =>
						`${context.label}: ${formatCurrency(
							context.raw
						)}`
				}
			}
		}
	}
});

// --------------------------------------------------
// Table
// --------------------------------------------------

const renderTable = entries => {

	dataTable.replaceChildren();

	const table = document.createElement("table");
	table.className = "finance-table";

	const headerRow = table.insertRow();

	for (const heading of [
		"Account holder",
		"Type",
		"Reason",
		"Amount"
	]) {
		headerRow.insertCell().textContent = heading;
	}

	for (const entry of entries) {

		const row = table.insertRow();

		row.insertCell().textContent = entry.holder;
		row.insertCell().textContent = entry.type;
		row.insertCell().textContent = entry.label;
		row.insertCell().textContent =
			formatCurrency(entry.amount);
	}

	dataTable.appendChild(table);
};

// --------------------------------------------------
// Period rendering
// --------------------------------------------------

let selectedHolder = "";

const renderPeriod = period => {

	chart.replaceChildren();
	dataTable.replaceChildren();

	if (!selectedTypes.length) {

		chart.className =
			"finance-chart-card finance-chart--empty";

		chart.textContent =
			"Select at least one transaction type to track spending.";

		return;
	}

	const entries = totalsFor(period, selectedHolder);

	if (!entries.length) {

		chart.className =
			"finance-chart-card finance-chart--empty";

		chart.textContent =
			`No tracked spending recorded for ${
				periods[period].label.toLowerCase()
			}.`;

		return;
	}

	chart.className =
		"finance-chart-card";

	renderChart(
		createChart(entries),
		chart
	);

	renderTable(entries);
};

// --------------------------------------------------
// Period tabs
// --------------------------------------------------

const holders = Array.from(new Set(
	transactions.values.map(accountHolderFor),
)).sort((left, right) => left.localeCompare(right));
for (const holder of holders) {
	const tab = document.createElement("button");
	tab.type = "button";
	tab.textContent = holder;
	tab.className = "finance-tab";
	tab.addEventListener("click", () => {
		holderTabs.querySelectorAll("button").forEach(button => button.classList.remove("is-active"));
		tab.classList.add("is-active");
		selectedHolder = holder;
		const activePeriod = tabs.querySelector(".is-active")?.textContent === "This year"
			? "year"
			: tabs.querySelector(".is-active")?.textContent === "All time" ? "all" : "month";
		renderPeriod(activePeriod);
	});
	holderTabs.appendChild(tab);
	if (tabs.children.length === 1) tab.click();
}

for (const [key, period] of Object.entries(periods)) {

	const tab = document.createElement("button");

	tab.type = "button";
	tab.textContent = period.label;
	tab.className = "finance-tab";

	tab.addEventListener("click", () => {

		tabs
			.querySelectorAll("button")
			.forEach(button =>
				button.classList.remove("is-active")
			);

		tab.classList.add("is-active");

		renderPeriod(key);
	});

	tabs.appendChild(tab);

	if (key === "month") {
		tab.click();
	}
}

// --------------------------------------------------
// Transaction type selector
// --------------------------------------------------

const selector = document.createElement("div");
selector.className = "finance-filter-panel";

const selectorTitle = document.createElement("div");
selectorTitle.className = "finance-eyebrow";
selectorTitle.textContent =
	"Track transaction types";

selector.appendChild(selectorTitle);

const options = document.createElement("div");
options.className = "finance-filter-options";

options.style.display = "flex";
options.style.flexWrap = "wrap";
options.style.gap = "0.6rem 1rem";
options.style.marginTop = "0.75rem";

for (const type of configuredTypes) {

	const label = document.createElement("label");

	label.className =
		"finance-filter-option";

	label.style.display =
		"inline-flex";

	label.style.alignItems =
		"center";

	label.style.gap =
		"0.4rem";

	label.style.whiteSpace =
		"nowrap";

	const checkbox =
		document.createElement("input");

	checkbox.type = "checkbox";
	checkbox.value = type;
	checkbox.checked =
		selectedTypeSet.has(type);

	checkbox.addEventListener(
		"change",
		async () => {

			const nextTypes =
				Array
					.from(
						options.querySelectorAll(
							"input:checked"
						)
					)
					.map(input => input.value);

			const file = app.vault.getAbstractFileByPath("Budget.md");

			if (!file) return;

			await app.fileManager.processFrontMatter(
				file,
				frontmatter => {
					frontmatter.tracked_types =
						nextTypes;
				}
			);

			// Refresh the current chart immediately.
			selectedTypeSet.clear();

			for (const selected of nextTypes) {
				selectedTypeSet.add(selected);
			}

			renderPeriod(
				tabs
					.querySelector(".is-active")
					?.textContent === "This year"
					? "year"
					: tabs
						.querySelector(".is-active")
						?.textContent === "All time"
						? "all"
						: "month"
			);
		}
	);

	label.append(
		checkbox,
		document.createTextNode(type)
	);

	options.appendChild(label);
}

selector.appendChild(options);
dv.container.appendChild(selector);
```
