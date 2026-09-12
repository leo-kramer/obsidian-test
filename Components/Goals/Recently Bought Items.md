```dataviewjs
const activePath = app.workspace.getActiveFile()?.path;
const pathParts = activePath ? activePath.split("/") : [];

if (pathParts[0] === "Goals" && pathParts[1] && pathParts[2]) {

    const category = pathParts[1];
    const goalName = pathParts[2];

    const folder = `Goals/${category}/${goalName}/Items`;

    const isBought = item =>
        item.bought === true ||
        String(item.bought).toLowerCase() === "true";

    const format = value =>
        `€ ${Number(value).toLocaleString("nl-NL", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;

    const truncateUrl = url => {
        if (!url) return "";
        const string = String(url);
        return string.length > 25
            ? `${string.substring(0, 22)}...`
            : string;
    };

    const items = dv.pages(`"${folder}"`)
        .where(isBought)
        .sort(item => item.file.mtime, "desc")
        .limit(5);

    if (items.length === 0) {
        dv.paragraph("No recently bought items.");
    } else {

        const table = document.createElement("table");
        table.className = "finance-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        ["Bought", "Item", "Price", "URL"].forEach(text => {
            const th = document.createElement("th");
            th.textContent = text;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        for (const item of items) {
            const row = document.createElement("tr");

            // Checkbox
            const checkboxCell = document.createElement("td");
            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.checked = true;

            checkbox.addEventListener("change", async event => {
                const file = app.vault.getAbstractFileByPath(item.file.path);

                if (file) {
                    await app.fileManager.processFrontMatter(
                        file,
                        frontmatter => {
                            frontmatter.bought = event.target.checked;
                        }
                    );
                }
            });

            checkboxCell.appendChild(checkbox);
            row.appendChild(checkboxCell);

            // Item
            const itemCell = document.createElement("td");
            const itemLink = document.createElement("a");

            itemLink.href = "#";
            itemLink.textContent = item.name || item.file.name;

            itemLink.addEventListener("click", event => {
                event.preventDefault();
                app.workspace.openLinkText(item.file.path, activePath);
            });

            itemCell.appendChild(itemLink);
            row.appendChild(itemCell);

            // Price
            const priceCell = document.createElement("td");
            priceCell.textContent = format(item.price);
            row.appendChild(priceCell);

            // URL
            const urlCell = document.createElement("td");

            if (item.url) {
                const urlLink = document.createElement("a");

                urlLink.href = String(item.url);
                urlLink.textContent = truncateUrl(item.url);
                urlLink.target = "_blank";
                urlLink.rel = "noopener noreferrer";

                urlCell.appendChild(urlLink);
            }

            row.appendChild(urlCell);

            tbody.appendChild(row);
        }

        table.appendChild(tbody);
        dv.container.appendChild(table);
    }

} else {
    dv.paragraph("This component must be used inside a Goal page.");
}
```
