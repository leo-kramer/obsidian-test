```dataviewjs
const goals = dv.pages('"Goals"').where((goal) => {
    const path = String(goal.file.path);
    return goal.isCompleted === false && (
        path.startsWith("Goals/Long Term/") && goal.file.name === "Overview" ||
        path.startsWith("Goals/Wishlist/") && goal.file.name === "Overview" ||
        /^Goals\/Short Term\/[^/]+\.md$/.test(path)
    );
});
const holdersFor = (goal) => {
    const holders = Array.isArray(goal.account_holders)
        ? goal.account_holders
        : String(goal.account_holders || "").split(/,\s*/);
    return holders.map((holder) => String(holder).trim()).filter(Boolean);
};
const goalLabel = (goal) => {
    const path = String(goal.file.path);
    if (path.startsWith("Goals/Long Term/")) return String(goal.file.folder).replace("Goals/Long Term/", "");
    if (path.startsWith("Goals/Wishlist/")) return String(goal.file.folder).replace("Goals/Wishlist/", "");
    return goal.file.name;
};
const holderNames = new Set();
for (const goal of goals) for (const holder of holdersFor(goal)) holderNames.add(holder);
if (!holderNames.size) holderNames.add("Unassigned");
const root = document.createElement("div");
root.className = "finance-insights";
const header = document.createElement("div");
header.className = "finance-insights__header";
header.innerHTML = '<div><div class="finance-eyebrow">Active goals</div><div class="finance-insights__title">Started goals by account holder</div></div>';
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
    const matching = goals.where((goal) => holdersFor(goal).includes(holder))
        .sort((left, right) => String(left.save_start || "").localeCompare(String(right.save_start || "")));
    if (!matching.length) {
        content.textContent = "No active goals for this account holder.";
        return;
    }
    const table = document.createElement("table");
    table.className = "finance-table";
    const headerRow = table.insertRow();
    for (const heading of ["Goal", "Type", "Allocation", "Started"]) headerRow.insertCell().textContent = heading;
    for (const goal of matching) {
        const path = String(goal.file.path);
        const type = path.startsWith("Goals/Long Term/") ? "Long term" : path.startsWith("Goals/Wishlist/") ? "Wishlist" : "Short term";
        const row = table.insertRow();
        const goalCell = row.insertCell();
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = goalLabel(goal);
        link.addEventListener("click", (event) => {
            event.preventDefault();
            app.workspace.openLinkText(goal.file.path, dv.current().file.path);
        });
        goalCell.appendChild(link);
        row.insertCell().textContent = type;
        row.insertCell().textContent = String(goal.allocate || "");
        row.insertCell().textContent = String(goal.save_start || "");
    }
    content.appendChild(table);
};
for (const holder of Array.from(holderNames).sort()) {
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
