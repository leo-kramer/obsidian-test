let ensureFolder, getRequiredPlugin, notifyError, parseMoney, renderTemplate, safeName, text, unwrapValue
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
		unwrapValue,
	} = library)
	debugLog = typeof library.debugLog === "function" ? library.debugLog : () => { }

	try {
		debugLog("budget-item.start")
		const modalForms = getRequiredPlugin("modalforms")

		const form = {
			title: "Add Budget Item",
			name: "add_budget_item",
			version: "1",
			fields: [
				{
					name: "name",
					label: "Item name",
					description: "",
					isRequired: true,
					input: {
						type: "text",
						hidden: false,
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
				{
					name: "url",
					label: "URL",
					description: "Optional link to the item",
					isRequired: false,
					input: {
						type: "text",
						hidden: false,
					},
				},
				{
					name: "bought",
					label: "Already bought",
					description: "Mark this item as bought when it is created",
					isRequired: false,
					input: {
						type: "toggle",
						hidden: false,
					},
				},
			],
		}

		const result = await modalForms.api.openForm(form)

		if (!result || result.status == "cancelled") {
			return
		}

		await createBudgetItem(result)
	} catch (error) {
		notifyError(error, "Adding the budget item")
	}
};

async function createBudgetItem(result) {
	const name = text(result.getValue("name"))
	const price = parseMoney(result.getValue("price"), { allowZero: true })
	const url = text(result.getValue("url"))
	const boughtValue = unwrapValue(result.getValue("bought"))
	const bought = boughtValue === true || String(boughtValue).toLowerCase() === "true"

	if (!name) {
		new Notice("Please fill in the item name")
		return
	}
	if (price === null) {
		new Notice("Price must be zero or greater")
		return
	}

	const activeFile = app.workspace.getActiveFile()
	if (!activeFile) {
		new Notice("No active file. Open a goal overview note first.")
		return
	}

	const goalFolder = getGoalFolderFromPath(activeFile.path)
	if (!goalFolder) {
		new Notice(
			"Open a goal overview note or a goal file before adding a budget item.",
		)
		return
	}

	const typeMap = {
		"Long Term": "long",
		"Short Term": "short",
		Wishlist: "wishlist",
	}
	const goalType = goalFolder.split("/")[1]
	const type = typeMap[goalType] || null
	if (!type) {
		new Notice(
			"Make sure the active file is a valid goal type (short term, long term, wishlist).",
		)
		return
	}

	const budgetFolder =
		type === "wishlist" ? `${goalFolder}/Items` : `${goalFolder}/Budget`

	const fileName = `${safeName(name, "Item name")}.md`
	const filePath = `${budgetFolder}/${fileName}`
	if (app.vault.getAbstractFileByPath(filePath)) {
		new Notice("A budget item with this name already exists")
		return
	}

	const templateFile = app.vault.getAbstractFileByPath("Templates/BudgetItem.md")
	if (!templateFile) {
		new Notice("Budget item template not found")
		return
	}

	await ensureFolder(app.vault, budgetFolder)
	const template = await app.vault.cachedRead(templateFile)

	const replacements = {
		name,
		price,
		url,
		bought,
	}

	const content = renderTemplate(template, replacements)

	await app.vault.create(filePath, content)
	debugLog("budget-item.created", { filePath })
	new Notice(`Added budget item ${name}`)
}

function getGoalFolderFromPath(path) {
	const normalized = path.replace(/\\/g, "/")
	const parts = normalized.split("/")
	if (parts[0] !== "Goals") {
		return null
	}

	if (parts[parts.length - 1] === "Overview.md" && parts.length >= 4) {
		return parts.slice(0, -1).join("/")
	}

	if (parts[parts.length - 1].endsWith(".md") && parts[1] === "Short Term" && parts.length === 3) {
		return `Goals/Short Term/${parts[2]}`
	}

	if (
		parts[parts.length - 1].endsWith(".md") &&
		(parts[1] === "Long Term" || parts[1] === "Wishlist") &&
		parts.length === 4
	) {
		return `Goals/${parts[1]}/${parts[2]}`
	}

	return null
}
