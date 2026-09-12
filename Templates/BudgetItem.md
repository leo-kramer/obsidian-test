---
template_id: 2
name: %%name%%
price: %%price%%
url: %%url%%
bought: %%bought%%
---

# %%name%%

```dataviewjs
const bought = dv.current().bought === true || String(dv.current().bought).toLowerCase() === "true";
const price = Number(dv.current().price) || 0;
const formatted = `€ ${price.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const panel = document.createElement("div");
panel.className = "finance-panel finance-item";
const url = String(dv.current().url || "").trim();
panel.innerHTML = `<div class="finance-item__header"><div><div class="finance-eyebrow">Wishlist item</div><div class="finance-value">${formatted}</div>${url ? `<a href="${url}" class="finance-link">Open item link</a>` : ""}</div><div class="finance-status ${bought ? "finance-positive" : ""}">${bought ? "Bought" : "To buy"}</div></div>`;
dv.container.appendChild(panel);
```
