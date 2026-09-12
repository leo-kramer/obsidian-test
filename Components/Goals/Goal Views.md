```dataviewjs
const goals = dv.pages('"Goals"').where((goal) => {
    const path = String(goal.file.path);
    return path.startsWith("Goals/Long Term/") && goal.file.name === "Overview" ||
        path.startsWith("Goals/Wishlist/") && goal.file.name === "Overview" ||
    /^Goals\/Short Term\/[^/]+\.md$/.test(path);
});
const categoryFor = (goal) => {
    const path = String(goal.file.path);
    if (path.startsWith("Goals/Long Term/")) return "Long term";
    if (path.startsWith("Goals/Short Term/")) return "Short term";
    return "Wishlists";
};
const labelFor = (goal) => categoryFor(goal) === "Long term"
    ? String(goal.file.folder).replace("Goals/Long Term/", "")
    : categoryFor(goal) === "Wishlists"
        ? String(goal.file.folder).replace("Goals/Wishlist/", "")
        : goal.file.name;
const holdersFor = (goal) => Array.isArray(goal.account_holders)
    ? goal.account_holders.join(", ")
    : String(goal.account_holders || "Unassigned");
const root = document.createElement("div");
root.className = "finance-insights";
const header = document.createElement("div");
header.className = "finance-insights__header";
header.innerHTML = '<div><div class="finance-eyebrow">Saving goals</div><div class="finance-insights__title">Goals by horizon</div></div>';
const tabs = document.createElement("div");
tabs.className = "finance-tabs";
header.appendChild(tabs);
root.appendChild(header);
const content = document.createElement("div");
content.className = "finance-chart-card";
root.appendChild(content);
dv.container.appendChild(root);
const categories = ["Long term", "Short term", "Wishlists"];
const render = (category) => {
    content.replaceChildren();
    const matching = goals.where((goal) => categoryFor(goal) === category && goal.isCompleted === false)
        .sort((left, right) => String(left.save_start || "").localeCompare(String(right.save_start || "")));
    if (!matching.length) {
        content.textContent = "No active goals in this category.";
        return;
    }
    const table = document.createElement("table");
    table.className = "finance-table";
    const headerRow = table.insertRow();
    for (const heading of ["Goal", "Account holders", "Allocation", "Started"]) headerRow.insertCell().textContent = heading;
    for (const goal of matching) {
        const row = table.insertRow();
        const goalCell = row.insertCell();
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = labelFor(goal);
        link.addEventListener("click", (event) => {
            event.preventDefault();
            app.workspace.openLinkText(goal.file.path, dv.current().file.path);
        });
        goalCell.appendChild(link);
        row.insertCell().textContent = holdersFor(goal);
        row.insertCell().textContent = String(goal.allocate || "");
        row.insertCell().textContent = String(goal.save_start || "");
    }
    content.appendChild(table);
};
for (const category of categories) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "finance-tab";
    tab.textContent = category;
    tab.addEventListener("click", () => {
        tabs.querySelectorAll("button").forEach((button) => button.classList.remove("is-active"));
        tab.classList.add("is-active");
        render(category);
    });
    tabs.appendChild(tab);
    if (category === "Long term") tab.click();
}
```
