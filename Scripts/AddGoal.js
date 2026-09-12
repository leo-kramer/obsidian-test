let ensureFolder, getRequiredPlugin, notifyError, parseAllocation, parseMoney, renderTemplate, safeName, text, unwrapValue
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

module.exports = async function (options = { result: null }) {
	const library = await loadLibrary();
	({
		ensureFolder,
		getRequiredPlugin,
		notifyError,
		parseAllocation,
		parseMoney,
		renderTemplate,
		safeName,
		text,
		unwrapValue,
	} = library)
	debugLog = typeof library.debugLog === "function" ? library.debugLog : () => { }

	try {
		debugLog("goal.start")
		let result = options.result
		const settings = await loadSettingsCompat()

		if (!result) {
			const modalForms = getRequiredPlugin("modalforms")
			const form = {
				title: "Add Goal",
				name: "add_goal",
				version: "1",
				fields: [
					{
						name: "name",
						label: "Goal name",
						description: "",
						isRequired: true,
						input: {
							type: "text",
							hidden: false,
						},
					},
					{
						name: "type",
						label: "Type",
						description: "",
						isRequired: false,
						input: {
							type: "select",
							source: "fixed",
							options: settings.goal_types.map((value) => ({
								value,
								label: settings.goal_type_labels[value] || value,
							})),
						},
					},
					{
						name: "price",
						label: "Price",
						description: "How much will it cost?",
						isRequired: false,
						condition: {
							dependencyName: "type",
							type: "isExactly",
							value: "short",
						},
						input: {
							type: "number",
							hidden: false,
						},
					},
					{
						name: "allocate",
						label: "Allocation",
						description: "Use a percentage like 5% or a flat amount like 100",
						isRequired: true,
						input: {
							type: "text",
							hidden: false,
						},
					},
					{
						name: "save_start",
						label: "Started saving",
						description: "",
						isRequired: false,
						input: {
							type: "date",
							hidden: false,
						},
					},
					{
						name: "account_holders",
						label: "Account holders",
						description: "Select account holders used for this saving goal",
						isRequired: false,
						input: {
							type: "multiselect",
							source: "fixed",
							multi_select_options: Array.from(
								new Set(
									(Array.isArray(settings.accounts) ? settings.accounts : [])
										.map((account) => String(account.account_holder || "").trim())
										.filter(Boolean),
								),
							),
						},
					},
				],
			}

			result = await modalForms.api.openForm(form)
		}

		if (!result || result.status === "cancelled") return

		const name = text(result.getValue("name"))
		const selectedType = text(result.getValue("type")).toLowerCase()
		const isWishlist = options.type === "wishlist" || selectedType === "wishlist"
		const type = isWishlist ? "wishlist" : selectedType
		const priceValue = parseMoney(result.getValue("price"), { allowZero: true })
		const allocateValue = parseAllocation(result.getValue("allocate"))
		const price = priceValue === null ? "" : priceValue
		const allocate = allocateValue ? allocateValue.value : ""
		const save_start = text(result.getValue("save_start"))
		const accountHoldersRaw = unwrapValue(result.getValue("account_holders")) ?? []
		const selectedAccountHolders = Array.isArray(accountHoldersRaw)
			? accountHoldersRaw.flat(Infinity)
			: [accountHoldersRaw]
		const account_holders = selectedAccountHolders
			.map((value) => text(value))
			.filter(Boolean)

		if (!name) {
			new Notice("Please fill in a goal name")
			return
		}

		if (!type) {
			new Notice("Please choose a goal type")
			return
		}
		if (!allocateValue) {
			new Notice("Allocation must be a flat amount or a percentage from 0% to 100%")
			return
		}
		if (type === "short" && priceValue === null) {
			new Notice("Short-term goals need a valid price")
			return
		}

		const typeMap = {
			long: "Long Term",
			short: "Short Term",
			wishlist: "Wishlist",
		}

		const folderType = typeMap[type]
		const fileName = safeName(name, "Goal name")
		let folder = `Goals/${folderType}`
		let filePath = `${folder}/${fileName}.md`
		let budgetFolder = ""
		let templateFile

		if (type === "short") {
			filePath = `${folder}/${fileName}.md`
			templateFile = app.vault.getAbstractFileByPath("Templates/ShortTermGoal.md")
		} else if (type === "long" || type === "wishlist") {
			folder =
				type === "wishlist"
					? `Goals/${typeMap.wishlist}/${fileName}`
					: `Goals/${folderType}/${fileName}`
			filePath = `${folder}/Overview.md`
			templateFile = app.vault.getAbstractFileByPath(
				type === "wishlist" ? "Templates/Wishlist.md" : "Templates/LongTermGoal.md",
			)
			budgetFolder =
				type === "wishlist" ? `${folder}/Items` : `${folder}/Budget`
		} else {
			new Notice("Unsupported goal type")
			return
		}

		if (app.vault.getAbstractFileByPath(filePath)) {
			new Notice("A goal with this name already exists")
			return
		}

		if (!templateFile) {
			new Notice("Template file not found")
			return
		}

		if (budgetFolder) {
			await ensureFolder(app.vault, budgetFolder)
		}

		const template = await app.vault.cachedRead(templateFile)

		const replacements = {
			name,
			type,
			price,
			allocate,
			save_start,
			saved: 0,
			saved_month: save_start ? save_start.slice(0, 7) : "",
			account_holders: account_holders.map((holder) => `\n  - ${holder}`).join(""),
		}

		const content = renderTemplate(template, replacements, {
			multilineKeys: ["account_holders"],
		})

		await app.vault.create(filePath, content)
		debugLog("goal.created", { filePath })
		new Notice(`Created goal ${name}`)
	} catch (error) {
		notifyError(error, "Creating the goal")
	}
};

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
				return await loaded.getSettings()
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
			return await module.exports.getSettings()
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
