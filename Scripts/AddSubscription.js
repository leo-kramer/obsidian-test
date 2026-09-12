let ensureFolder, getRequiredPlugin, notifyError, parseMoney, renderTemplate, safeName, text
let debugLog = () => { }

async function loadLibrary() {
	const candidates = []
	const adapter = app?.vault?.adapter
	if (adapter && typeof adapter.getBasePath === "function") {
		const basePath = adapter.getBasePath()
		if (typeof basePath === "string" && basePath.trim()) {
			candidates.push(`${basePath.replace(/[\\/]$/, "")}/Scripts/Library.js`)
		}
	}
	candidates.push("./Library.js")

	for (const modulePath of candidates) {
		try {
			const library = require(modulePath)
			if (library) return library
		} catch (error) {
			console.debug("[Finances] Library candidate unavailable", modulePath, error)
			continue
		}
	}

	const libraryFile = app.vault.getAbstractFileByPath("Scripts/Library.js")
	if (!libraryFile) {
		throw new Error("Scripts/Library.js was not found in the vault")
	}
	const source = await app.vault.read(libraryFile)
	const module = { exports: {} }
	Function("module", "exports", source)(module, module.exports)
	return module.exports
}

module.exports = async function () {
	const library = await loadLibrary();
	({
		ensureFolder,
		getRequiredPlugin,
		notifyError,
		parseMoney,
		renderTemplate,
		safeName,
		text,
	} = library)
	debugLog = typeof library.debugLog === "function" ? library.debugLog : () => { }

	try {
		debugLog("subscription.start")
		const modalForms = getRequiredPlugin("modalforms")

		const form = {
			title: "Add Subscription",
			name: "add_subscription",
			version: "1",
			fields: [
				{
					name: "name",
					label: "Subscription name",
					description: "",
					isRequired: true,
					input: { type: "text", hidden: false },
				},
				{
					name: "price",
					label: "Recurring payment",
					description: "Enter the amount charged each time",
					isRequired: true,
					input: { type: "number", hidden: false },
				},
				{
					name: "category",
					label: "Category",
					description: "For example: streaming, software, or fitness",
					isRequired: true,
					input: { type: "text", hidden: false },
				},
				{
					name: "first_payment",
					label: "First payment date",
					description: "",
					isRequired: true,
					input: { type: "date", hidden: false },
				},
				{
					name: "next_payment",
					label: "Next payment date",
					description: "The spacing between these dates determines the recurrence",
					isRequired: true,
					input: { type: "date", hidden: false },
				},
			],
		}

		const result = await modalForms.api.openForm(form)
		if (!result || result.status === "cancelled") return

		await createSubscription(result)
	} catch (error) {
		notifyError(error, "Adding the subscription")
	}
};

async function createSubscription(result) {
	const name = text(result.getValue("name"))
	const price = parseMoney(result.getValue("price"))
	const category = text(result.getValue("category"))
	const firstPayment = normalizeDate(result.getValue("first_payment"))
	const nextPayment = normalizeDate(result.getValue("next_payment"))

	if (!name || !category || !firstPayment || !nextPayment) {
		new Notice("Please fill in all subscription fields")
		return
	}

	if (price === null) {
		new Notice("Recurring payment must be greater than zero")
		return
	}

	const first = parseDate(firstPayment)
	const next = parseDate(nextPayment)
	if (!first || !next) {
		new Notice("Enter valid calendar dates")
		return
	}
	const intervalDays = Math.round((next - first) / 86400000)
	if (intervalDays <= 0) {
		new Notice("Next payment must be after the first payment")
		return
	}

	const fileName = safeName(name, "Subscription name")
	const itemsFolder = "Budget/Items"
	const filePath = `${itemsFolder}/${fileName}.md`
	if (app.vault.getAbstractFileByPath(filePath)) {
		new Notice("A subscription with this name already exists")
		return
	}

	const templateFile = app.vault.getAbstractFileByPath("Templates/Subscription.md")
	if (!templateFile) {
		new Notice("Subscription template not found")
		return
	}

	const template = await app.vault.cachedRead(templateFile)
	const replacements = {
		name,
		price: price.toFixed(2),
		category,
		first_payment: firstPayment,
		next_payment: nextPayment,
		interval_days: intervalDays,
	}
	const content = renderTemplate(template, replacements)

	await ensureFolder(app.vault, itemsFolder)
	await app.vault.create(filePath, content)
	debugLog("subscription.created", { filePath })
	new Notice(`Added subscription ${name}`)
}

function normalizeDate(value) {
	const raw = value && typeof value === "object" && "value" in value ? value.value : value
	if (!raw) return ""
	if (typeof raw === "string") return raw.slice(0, 10)
	if (raw instanceof Date && !isNaN(raw)) return raw.toISOString().slice(0, 10)
	return String(raw.value ?? raw).slice(0, 10)
}

function parseDate(value) {
	const [year, month, day] = value.split("-").map(Number)
	if (![year, month, day].every(Number.isInteger)) return null
	const date = new Date(year, month - 1, day)
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
		? date
		: null
}
