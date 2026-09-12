```dataviewjs
const activePath = app.workspace.getActiveFile()?.path;
const pathParts = activePath ? activePath.split("/") : [];

if (pathParts[0] === "Goals" && pathParts[1] && pathParts[2]) {

    const category = pathParts[1];
    const goalName = pathParts[2];
    const goalPath = activePath;

    // Read the actual Goal page, not the component
    const current = dv.page(goalPath);

    const typeMap = {
        "Long Term": "long",
        "Short Term": "short",
        "Wishlist": "wishlist"
    };

    const type = typeMap[category] || String(current?.type || "long");

    const goalFolder = `Goals/${category}/${goalName}`;
    const itemFolder = type === "wishlist"
        ? `${goalFolder}/Items`
        : `${goalFolder}/Budget`;

    const items = dv.pages(`"${itemFolder}"`);

    const isBought = item =>
        item.bought === true ||
        String(item.bought).toLowerCase() === "true";

    const target = type === "short"
        ? Number(current?.price) || 0
        : items.values
            .filter(item => type !== "wishlist" || !isBought(item))
            .reduce(
                (sum, item) => sum + (Number(item.price) || 0),
                0
            );

    const boughtTotal = type === "wishlist"
        ? items.values
            .filter(isBought)
            .reduce(
                (sum, item) => sum + (Number(item.price) || 0),
                0
            )
        : 0;

    const accounts = dv.pages('"Accounts"').values;
    const transactions = dv.pages('"Transactions"');

    const selectedHolders = Array.from(
        new Set(
            (
                Array.isArray(current?.account_holders)
                    ? current.account_holders
                    : String(current?.account_holders || "")
                        .split(/,\s*/)
                        .filter(Boolean)
            )
                .map(value => String(value).trim())
                .filter(Boolean)
        )
    );

    const now = new Date();

    const currentMonth =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const normalizeMonth = value => {
        const match = String(value || "")
            .match(/^(\d{4})-(\d{1,2})/);

        return match
            ? `${match[1]}-${String(match[2]).padStart(2, "0")}`
            : currentMonth;
    };

    const monthStart = month => {
        const [year, number] = month.split("-").map(Number);
        return new Date(year, number - 1, 1);
    };

    const monthKey = date =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const nextMonth = month => {
        const date = monthStart(month);
        date.setMonth(date.getMonth() + 1);
        return monthKey(date);
    };

    const incomeForMonth = month => {
        const start = monthStart(month);
        const end = monthStart(nextMonth(month));

        return transactions.values.reduce((total, transaction) => {

            if (
                !transaction.price ||
                !transaction.date ||
                Number(transaction.price) <= 0
            ) {
                return total;
            }

            const date = new Date(transaction.date);

            if (date < start || date >= end) {
                return total;
            }

            const accountId =
                transaction.account_id != null
                    ? String(transaction.account_id)
                    : String(transaction.account || "");

            const account = accounts.find(item =>
                (
                    item.account_id != null &&
                    String(item.account_id) === accountId
                ) ||
                (
                    item.account != null &&
                    String(item.account) === accountId
                )
            );

            const holder = account
                ? String(account.account_holder || "").trim()
                : "";

            return selectedHolders.length > 0 &&
                !selectedHolders.includes(holder)
                ? total
                : total + Number(transaction.price);

        }, 0);
    };

    const applyAllocation = (balance, month) => {
        const allocation =
            String(current?.allocate || "").trim();

        if (allocation.includes("%")) {
            return balance +
                (balance + incomeForMonth(month)) *
                (Number(allocation.replace("%", "")) / 100);
        }

        const amount = Number(allocation);

        return Number.isFinite(amount)
            ? balance + amount
            : balance;
    };

const persistedSaved = Number(current?.saved);

const hasPersistedSaved =
    String(current?.saved || "").trim() !== "" &&
    Number.isFinite(persistedSaved);

let saved = hasPersistedSaved
    ? persistedSaved
    : 0;

let savedMonth = normalizeMonth(
    hasPersistedSaved
        ? current?.saved_month
        : current?.save_start
);

// Apply allocations through the current month, including this month.
while (savedMonth <= currentMonth) {
    saved = applyAllocation(saved, savedMonth);
    savedMonth = nextMonth(savedMonth);
}    const available = Math.max(0, saved - boughtTotal);

    const progress = target > 0
        ? Math.min(100, Math.round((available / target) * 100))
        : 0;

    const remaining = Math.max(0, target - available);

    const format = value =>
        value.toLocaleString("nl-NL", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const panel = document.createElement("div");
    panel.className = "finance-panel";

    panel.innerHTML = `
        <div class="finance-panel__header">
            <div class="finance-eyebrow">
                ${type === "wishlist" ? "Wishlist" : "Goal"} progress
            </div>

            <div class="finance-status ${progress >= 100 ? "finance-positive" : ""}">
                ${progress >= 100 ? "Complete" : `${progress}% funded`}
            </div>
        </div>

        <div class="finance-value">
            € ${format(available)}
            <span class="finance-meta">saved</span>
        </div>

        <progress
            class="finance-progress"
            value="${progress}"
            max="100">
        </progress>

        <div class="finance-meta finance-meta--spread">
            <span>
                ${type === "wishlist" ? "Available" : "Saved"}:
                <strong>€ ${format(available)}</strong>
            </span>

            <span>
                Target:
                <strong>€ ${format(target)}</strong>
            </span>

            <span>
                Remaining:
                <strong>€ ${format(remaining)}</strong>
            </span>
        </div>
    `;

    dv.container.appendChild(panel);

} else {
    dv.paragraph("This component must be used inside a Goal page.");
}
```
