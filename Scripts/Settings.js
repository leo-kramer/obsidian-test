const DEFAULT_SETTINGS = {
	accounts: ["Debit", "Savings", "Trust"],
	transaction_types: ["Food", "Gift", "Leisure", "Salary", "Subscription"],
	goal_types: ["wishlist", "short", "long"],
	wishlists: ["Leo"],
	goal_type_labels: {
		wishlist: "Wishlist",
		short: "Short Term",
		long: "Long Term",
	},
	templates: ["Account", "Goal", "Leisure", "Transaction"],
}

const SETTINGS_CACHE_TTL = 5000
const settingsCache = new Map()

async function getSettings(options = {}) {
	const includeWishlists = options.includeWishlists !== false
	const includeTemplates = options.includeTemplates !== false
	const cacheKey = JSON.stringify({
		includeWishlists,
		includeTemplates,
	})
	const signature = getSettingsSignature(includeWishlists, includeTemplates)
	const cached = settingsCache.get(cacheKey)
	if (
		cached &&
		cached.signature === signature &&
		Date.now() - cached.createdAt < SETTINGS_CACHE_TTL
	) {
		return cloneSettings(cached.value)
	}

	const userSettings = await loadSettingsFile()
	const [accounts, wishlists, templates] = await Promise.all([
		loadAccounts(),
		includeWishlists ? loadWishlists() : Promise.resolve(DEFAULT_SETTINGS.wishlists),
		includeTemplates ? loadTemplates() : Promise.resolve(DEFAULT_SETTINGS.templates),
	])

	const value = {
		accounts,
		transaction_types: sanitizeArray(
			userSettings.transaction_types,
			DEFAULT_SETTINGS.transaction_types,
		),
		goal_types: sanitizeArray(
			userSettings.goal_types,
			DEFAULT_SETTINGS.goal_types,
		),
		wishlists,
		goal_type_labels: sanitizeObject(
			userSettings.goal_type_labels,
			DEFAULT_SETTINGS.goal_type_labels,
		),
		templates,
	}
	settingsCache.set(cacheKey, { createdAt: Date.now(), signature, value })
	return cloneSettings(value)
}

function getSettingsSignature(includeWishlists, includeTemplates) {
	const files = app.vault.getMarkdownFiles()
		.filter((file) => {
			const path = file.path.replace(/\\/g, "/")
			return path === "Settings.md" ||
				path.startsWith("Accounts/") ||
				(includeWishlists && path.startsWith("Goals/Wishlist/")) ||
				(includeTemplates && path.startsWith("Templates/"))
		})
		.sort((left, right) => left.path.localeCompare(right.path))

	return files.map((file) => `${file.path}:${file.stat?.mtime || 0}`).join("|")
}

function cloneSettings(value) {
	return JSON.parse(JSON.stringify(value))
}

async function loadSettingsFile() {
	const settingsFile = app.vault.getAbstractFileByPath("Settings.md")
	if (!settingsFile) {
		return {}
	}

	const text = await app.vault.cachedRead(settingsFile)
	return parseFrontmatterYaml(text)
}

function parseFrontmatterYaml(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
	if (!match) {
		return {}
	}

	const lines = match[1].split(/\r?\n/)
	const settings = Object.create(null)
	let currentKey = null

	for (const rawLine of lines) {
		const line = rawLine.replace(/\t/g, "  ")
		if (/^\s*$/.test(line)) {
			continue
		}

		const topLevelMatch = line.match(/^([^:\s][^:]*):\s*(.*)$/)
		if (topLevelMatch && /^\S/.test(line)) {
			currentKey = topLevelMatch[1].trim()
			if (isUnsafeKey(currentKey)) {
				currentKey = null
				continue
			}
			const value = topLevelMatch[2]

			if (value === "") {
				settings[currentKey] = []
			} else if (/^\[.*\]$/.test(value.trim())) {
				settings[currentKey] = value
					.slice(1, -1)
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean)
			} else {
				settings[currentKey] = value
			}
			continue
		}

		if (!currentKey) {
			continue
		}

		const arrayMatch = line.match(/^\s*-\s*(.*)$/)
		if (arrayMatch) {
			if (!Array.isArray(settings[currentKey])) {
				settings[currentKey] = []
			}
			settings[currentKey].push(arrayMatch[1].trim())
			continue
		}

		const objectMatch = line.match(/^\s*([^:]+):\s*(.*)$/)
		if (objectMatch && !isUnsafeKey(objectMatch[1].trim())) {
			if (Array.isArray(settings[currentKey]) || settings[currentKey] == null) {
				settings[currentKey] = Object.create(null)
			}
			settings[currentKey][objectMatch[1].trim()] = objectMatch[2].trim()
		}
	}

	return settings
}

function isUnsafeKey(key) {
	return key === "__proto__" || key === "constructor" || key === "prototype"
}

async function loadAccounts() {
	const accountFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.replace(/\\/g, "/").startsWith("Accounts/"))

	if (!accountFiles.length) {
		return DEFAULT_SETTINGS.accounts.map((name) => ({ id: name, name }))
	}

	const accounts = await Promise.all(
		accountFiles.map(async (file) => {
			try {
				const text = await app.vault.cachedRead(file)
				const frontmatter = parseFrontmatterYaml(text)
				const name = frontmatter.account || file.basename
				const id = String(
					frontmatter.account_id || frontmatter.account || file.basename,
				)
				const account_holder = String(frontmatter.account_holder || "").trim()
				return { id, name, account_holder, filePath: file.path }
			} catch (error) {
				console.warn(`Could not load account file ${file.path}: ${error}`)
				return null
			}
		}),
	)

	return accounts.filter(Boolean)
}

async function loadWishlists() {
	const wishlistFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.replace(/\\/g, "/").startsWith("Goals/Wishlist/"))

	const wishlistNames = new Set()
	for (const file of wishlistFiles) {
		const parts = file.path.replace(/\\/g, "/").split("/")
		if (parts.length >= 3) {
			wishlistNames.add(parts[2])
		}
	}

	if (!wishlistNames.size) {
		return DEFAULT_SETTINGS.wishlists
	}

	return Array.from(wishlistNames)
}

async function loadTemplates() {
	const templateFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith("Templates/"))

	if (!templateFiles.length) {
		return DEFAULT_SETTINGS.templates
	}

	return Array.from(new Set(templateFiles.map((file) => file.basename)))
}

function sanitizeArray(value, fallback) {
	if (Array.isArray(value)) {
		return uniqueStrings(value)
	}

	if (typeof value === "string") {
		return uniqueStrings(value.split(","))
	}

	return fallback
}

function uniqueStrings(values) {
	return Array.from(
		new Set(
			values
				.map((item) => String(item).trim())
				.filter(Boolean),
		),
	)
}

function sanitizeObject(value, fallback) {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, val]) => [key, String(val)]),
		)
	}

	return fallback
}

module.exports = {
	getSettings,
}
