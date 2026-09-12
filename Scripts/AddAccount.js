let ensureFolder, getRequiredPlugin, notifyError, renderTemplate, safeName, text, unwrapValue
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
		renderTemplate,
		safeName,
		text,
		unwrapValue,
	} = library)
	debugLog = typeof library.debugLog === "function" ? library.debugLog : () => { }

	try {
		debugLog("account.start")
		const modalForms = getRequiredPlugin("modalforms")
		const result = await modalForms.api.openForm(buildAccountForm())

		if (!result || result.status === "cancelled") {
			return
		}

		await createAccount(result)
	} catch (error) {
		notifyError(error, "Creating the account")
	}
};

function buildAccountForm() {
	return {
		title: "Create Account",
		name: "add_account",
		version: "1",
		fields: [
			{
				name: "name",
				label: "Account name",
				description: "",
				isRequired: true,
				input: {
					type: "text",
					hidden: false,
				},
			},
			{
				name: "account_holder",
				label: "Account holder",
				description: "Who owns this account?",
				isRequired: false,
				input: {
					type: "text",
					hidden: false,
				},
			},
		],
	}
}

async function createAccount(result) {
	const name = text(result.getValue("name"))

	if (!name) {
		new Notice("Please fill in an account name")
		return
	}

	const fileName = safeName(name, "Account name")
	const folder = "Accounts"
	const filePath = `${folder}/${fileName}.md`

	await ensureFolder(app.vault, folder)

	if (app.vault.getAbstractFileByPath(filePath)) {
		new Notice("An account with this name already exists")
		return
	}

	const accountId = await getNextAccountId()
	const templateFile = app.vault.getAbstractFileByPath("Templates/Account.md")

	if (!templateFile) {
		new Notice("Account template not found")
		return
	}

	const template = await app.vault.cachedRead(templateFile)
	const accountHolder = text(result.getValue("account_holder"))

	const content = renderTemplate(template, {
		account: name,
		account_holder: accountHolder,
		account_id: accountId,
	})

	await app.vault.create(filePath, content)
	debugLog("account.created", { filePath })
	new Notice(`Created account ${name}`)
}

async function getNextAccountId() {
	const accountFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.replace(/\\/g, "/").startsWith("Accounts/"))

	const ids = await Promise.all(
		accountFiles.map(async (file) => {
			try {
				const text = await app.vault.cachedRead(file)
				const match = text.match(/^account_id:\s*(?:"|')?(.*?)(?:"|')?\s*$/m)
				if (!match) {
					return 0
				}

				const value = match[1].trim()
				const numeric = Number(value)
				return Number.isInteger(numeric) && numeric > 0 ? numeric : 0
			} catch (error) {
				console.warn(`Could not read account file ${file.path}: ${error}`)
				return 0
			}
		}),
	)

	return String(Math.max(0, ...ids) + 1)
}

