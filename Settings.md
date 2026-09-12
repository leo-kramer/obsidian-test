---
transaction_types:
 - Groceries
 - Food
 - Commute
 - Salary
 - Leisure
 - Subscription
 - Medicine
 - Gift
 - Unknown
 - Government
 - Insurance
 - Travel
goal_types:
 - wishlist
 - short
 - long
goal_type_labels:
 wishlist: Wishlist
 short: Short Term
 long: Long Term
---

```dataviewjs
const settingsFile = app.vault.getAbstractFileByPath(dv.current().file.path);

const saveValues = async (key, options) => {
  const values = Array.from(options.querySelectorAll("input[type=checkbox]:checked"))
    .map((input) => input.value.trim())
    .filter(Boolean);
  await app.fileManager.processFrontMatter(settingsFile, (frontmatter) => {
    frontmatter[key] = values;
  });
};

const createEditor = (key, title, values) => {
  const section = document.createElement("section");
  section.className = "finance-settings-section";

  const heading = document.createElement("div");
  heading.className = "finance-eyebrow";
  heading.textContent = title;
  section.appendChild(heading);

  const options = document.createElement("div");
  options.className = "finance-settings-options";

  const addOption = (value) => {
    const label = document.createElement("label");
    label.className = "finance-settings-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = true;
    checkbox.addEventListener("change", () => saveValues(key, options));
    label.append(checkbox, document.createTextNode(value));
    options.appendChild(label);
  };

  values.forEach((value) => addOption(String(value)));
  section.appendChild(options);

  const addRow = document.createElement("div");
  addRow.className = "finance-settings-add";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = `Add ${title.toLowerCase().replace(/s$/, "")}`;
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add";
  addButton.addEventListener("click", async () => {
    const value = input.value.trim();
    if (!value) return;
    const existing = Array.from(options.querySelectorAll("input[type=checkbox]"))
      .map((checkbox) => checkbox.value.trim().toLowerCase());
    if (existing.includes(value.toLowerCase())) return;
    addOption(value);
    input.value = "";
    await saveValues(key, options);
  });
  addRow.append(input, addButton);
  section.appendChild(addRow);
  return section;
};

const editor = document.createElement("div");
editor.className = "finance-settings-grid";
editor.append(
  createEditor("transaction_types", "Transaction types", dv.current().transaction_types || []),
  createEditor("goal_types", "Goal types", dv.current().goal_types || []),
);
dv.container.appendChild(editor);
```

action QuickAdd: Update Templates
![[Components/Buttons/Update Templates]]

action QuickAdd: Create Account
![[Components/Buttons/Create Account]]
