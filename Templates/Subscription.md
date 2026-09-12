---
template_id: 7
name: %%name%%
price: %%price%%
category: %%category%%
first_payment: %%first_payment%%
next_payment: %%next_payment%%
interval_days: %%interval_days%%
active: true
---

# %%name%%

```dataviewjs
const price = Number(dv.current().price) || 0;
const formattedPrice = price.toLocaleString('nl-NL', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

const panel = document.createElement("div");
panel.className = "finance-panel";
panel.innerHTML = `<div class="finance-eyebrow">${dv.current().category || "Subscription"}</div><div class="finance-value">€ ${formattedPrice}</div><div class="finance-meta">Every ${dv.current().interval_days} days</div>`;
dv.container.appendChild(panel);
```

First payment: %%first_payment%%

Next payment: %%next_payment%%
