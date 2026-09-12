let ensureFolder, getRequiredPlugin, notifyError, parseLocalDate, renderTemplate, safeName, text, unwrapValue
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
	const loadedLibrary = await loadLibrary();
	({
		ensureFolder,
		getRequiredPlugin,
		notifyError,
		parseLocalDate,
		renderTemplate,
		safeName,
		text,
		unwrapValue,
	} = loadedLibrary)
	debugLog = typeof loadedLibrary.debugLog === "function" ? loadedLibrary.debugLog : () => { }

	try {
		debugLog("transaction.start")
		const modalForms = getRequiredPlugin("modalforms")
		const settings = await loadSettingsCompat()
		debugLog("transaction.settings.loaded", {
			accountCount: settings.accounts.length,
			typeCount: settings.transaction_types.length,
		})
		const transactionForm = {
			title: "Add Transaction",
			name: "add_transaction",
			version: "1",
			fields: [
				{
					name: "date",
					label: "Date",
					description: "",
					isRequired: false,
					input: {
						type: "date",
						hidden: false,
					},
				},
				{
					name: "reason",
					label: "Reason",
					description: "",
					isRequired: false,
					input: {
						type: "text",
						hidden: false,
					},
				},
				{
					name: "account",
					label: "Account",
					description: "",
					isRequired: false,
					input: {
						type: "select",
						source: "fixed",
						options: (Array.isArray(settings.accounts) ? settings.accounts : [])
							.sort((a, b) => a.name.localeCompare(b.name))
							.map((account) => ({
								value: account.id,
								label: account.name,
							})),
					},
				},
				{
					name: "type",
					label: "Type",
					description: "",
					isRequired: true,
					input: {
						type: "multiselect",
						source: "fixed",
						multi_select_options: settings.transaction_types,
						allowUnknownValues: true,
					},
				},
				{
					name: "price",
					label: "Price",
					description: "",
					isRequired: true,
					input: {
						type: "number",
						hidden: false,
					},
				},
			],
		}

		const result = await modalForms.api.openForm(transactionForm)

		if (!result || result.status == "cancelled") {
			debugLog("transaction.cancelled")
			return
		}

		await createTransaction(result, settings)
	} catch (error) {
		notifyError(error, "Adding the transaction")
	}
};

async function createTransaction(result, settings) {
	const date = normalizeDate(result.getValue("date"))
	const account = text(unwrapValue(result.getValue("account")))
	const type = normalizeSelection(result.getValue("type"))
	const price = parseTransactionPrice(result.getValue("price"))

	let reason = text(result.getValue("reason"))

	if (!reason) {
		reason = type
	}
	if (!date) {
		new Notice("Please fill in Date")
		return
	}
	if (!type) {
		new Notice("Please choose a transaction type")
		return
	}
	if (price === null) {
		new Notice("Price must be a valid amount")
		return
	}
	if (!account) {
		new Notice("Warning: no account selected. This transaction will be unassigned.")
	}

	const dateObject = parseLocalDate(date)
	if (!dateObject) {
		new Notice("Please enter a valid calendar date")
		return
	}

	const day = String(dateObject.getDate()).padStart(2, "0")
	const month = String(dateObject.getMonth() + 1).padStart(2, "0")
	const year = dateObject.getFullYear()

	const filename = `${day}-${month}-${year} - ${safeName(reason, "Reason")}.md`

	const folder = `Transactions/${year}/${dateObject.toLocaleString("default", { month: "short" })}`

	const selectedAccount = settings.accounts.find(
		(accountItem) => accountItem.id === account || accountItem.name === account,
	)
	const accountId = selectedAccount ? selectedAccount.id : String(account)
	const accountName = selectedAccount ? selectedAccount.name : String(account)

	const filePath = `${folder}/${filename}`
	if (app.vault.getAbstractFileByPath(filePath)) {
		debugLog("transaction.duplicate", { filePath })
		new Notice("A transaction with this date and reason already exists")
		return
	}

	const templateFile = app.vault.getAbstractFileByPath("Templates/Transaction.md")
	if (!templateFile) {
		new Notice("Transaction template not found")
		return
	}

	const template = await app.vault.cachedRead(templateFile)
	const content = renderTemplate(template, {
		date,
		account: accountName,
		account_id: accountId,
		reason,
		type,
		price,
	})

	await ensureFolder(app.vault, folder)
	await app.vault.create(filePath, content)
	debugLog("transaction.created", { filePath })
	new Notice(`Added transaction ${reason} (${date})`)
}

function parseTransactionPrice(value) {
	const raw = text(value).replace(/,/g, ".")
	if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return null

	const amount = Number(raw)
	return Number.isFinite(amount) ? amount : null
}

function normalizeDate(value) {
	const raw = unwrapValue(value)
	if (!raw) return ""
	if (typeof raw === "string") return raw.slice(0, 10)
	if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
	return String(raw).slice(0, 10)
}

function normalizeSelection(value) {
	const values = Array.isArray(unwrapValue(value)) ? unwrapValue(value) : [unwrapValue(value)]
	return values.map((item) => text(unwrapValue(item))).filter(Boolean).join(", ")
}

async function loadSettingsCompat() {
	const candidates = []
	const adapter = app?.vault?.adapter
	if (adapter && typeof adapter.getBasePath === "function") {
		const basePath = adapter.getBasePath()
		if (typeof basePath === "string" && basePath.trim()) {
			candidates.push(`${basePath.replace(/[\\/]$/, "")}/Scripts/Settings.js`)
		}
	}
	candidates.push("./Settings.js")

	for (const modulePath of candidates) {
		try {
			const loaded = require(modulePath)
			if (loaded && typeof loaded.getSettings === "function") {
				return await loaded.getSettings({
					includeWishlists: false,
					includeTemplates: false,
				})
			}
		} catch (error) {
			// Continue to the next candidate.
		}
	}

	try {
		const settingsFile = app.vault.getAbstractFileByPath("Scripts/Settings.js")
		if (!settingsFile) throw new Error("Scripts/Settings.js was not found in the vault")
		const source = await app.vault.read(settingsFile)
		const module = { exports: {} }
		Function("module", "exports", source)(module, module.exports)
		if (typeof module.exports.getSettings === "function") {
			return await module.exports.getSettings({
				includeWishlists: false,
				includeTemplates: false,
			})
		}
	} catch (error) {
		// Use the existing defaults when the settings file cannot be loaded.
	}

	return {
		accounts: [],
		transaction_types: [],
		goal_types: ["wishlist", "short", "long"],
		wishlists: [],
		goal_type_labels: {
			wishlist: "Wishlist",
			short: "Short Term",
			long: "Long Term",
		},
		templates: [],
	}
}
