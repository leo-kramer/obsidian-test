let getRequiredPlugin, notifyError, renderTemplate
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
	({ getRequiredPlugin, notifyError, renderTemplate } = library)
	debugLog = typeof library.debugLog === "function" ? library.debugLog : () => { }

	try {
		debugLog("templates.start")
		const modalForms = getRequiredPlugin("modalforms")

		const templateFiles = app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith("Templates/"))
		const templateNames = templateFiles.map((file) => file.basename)

		const formResult = await modalForms.api.openForm({
			title: "Update Templates",
			name: "update_templates",
			fields: [
				{
					name: "templates",
					label: "Templates",
					description: "Select one or more templates to apply to matching files",
					isRequired: true,
					input: {
						type: "multiselect",
						source: "fixed",
						multi_select_options: templateNames,
						allowUnknownValues: false,
					},
				},
			],
			version: "1",
		})

		if (!formResult) {
			return
		}

		const selectedTemplates = formResult.getValue("templates")
		const selectedTemplateNames = []

		if (Array.isArray(selectedTemplates)) {
			selectedTemplateNames.push(
				...selectedTemplates.map((item) =>
					item && typeof item === "object" && "value" in item ? item.value : item,
				),
			)
		} else if (
			selectedTemplates &&
			typeof selectedTemplates === "object" &&
			"value" in selectedTemplates
		) {
			selectedTemplateNames.push(
				...(Array.isArray(selectedTemplates.value)
					? selectedTemplates.value
					: [selectedTemplates.value]),
			)
		} else if (selectedTemplates) {
			selectedTemplateNames.push(selectedTemplates)
		}

		const selectedNames = selectedTemplateNames
			.map((name) => String(name).trim())
			.filter(Boolean)

		if (!selectedNames.length) {
			new Notice("Please select at least one template")
			return
		}

		const templatePaths = selectedNames.map((name) => `Templates/${name}.md`)
		const templateFilesToApply = []

		for (const path of templatePaths) {
			const file = app.vault.getAbstractFileByPath(path)
			if (!file) {
				continue
			}

			const templateContent = await app.vault.cachedRead(file)
			const templateId = getTemplateIdFromContent(templateContent)
			templateFilesToApply.push({ file, templateId, content: templateContent })
		}

		if (!templateFilesToApply.length) {
			new Notice("No matching templates were found")
			return
		}

		const templateIds = new Map()
		for (const templateEntry of templateFilesToApply) {
			if (!templateEntry.templateId) {
				new Notice(`Template ${templateEntry.file.basename} has no template_id`)
				return
			}
			if (templateIds.has(templateEntry.templateId)) {
				new Notice(`Duplicate template_id: ${templateEntry.templateId}`)
				return
			}
			templateIds.set(templateEntry.templateId, templateEntry.file.basename)
		}

		const allMarkdownFiles = app.vault.getMarkdownFiles()
		const filesToUpdate = []
		const seenMatchPaths = new Set()
		for (const file of allMarkdownFiles) {
			if (file.path.startsWith("Templates/")) {
				continue
			}

			const currentContent = await app.vault.cachedRead(file)
			const currentTemplateId = getTemplateIdFromContent(currentContent)
			const matchedTemplate = resolveTemplateEntryForFile(file, currentTemplateId, templateFilesToApply)

			if (matchedTemplate && !seenMatchPaths.has(file.path)) {
				filesToUpdate.push({ file, templateEntry: matchedTemplate })
				seenMatchPaths.add(file.path)
			}
		}

		const updates = []
		for (const { file, templateEntry } of filesToUpdate) {
			const currentContent = await app.vault.cachedRead(file)
			const currentTemplateId = getTemplateIdFromContent(currentContent)
			const resolvedTemplateEntry =
				templateEntry || resolveTemplateEntryForFile(file, currentTemplateId, templateFilesToApply)

			if (!resolvedTemplateEntry) {
				continue
			}

			const templateContent = resolvedTemplateEntry.content
			const replacements = getTemplateReplacements(templateContent, currentContent)
			let updatedContent = renderTemplate(
				templateContent,
				replacements,
				{ multilineKeys: getMultilineKeys(replacements) },
			)

			const isFrontmatterOnlyTemplate =
				resolvedTemplateEntry.file.basename === "BudgetItem" ||
				resolvedTemplateEntry.file.basename === "Transaction"
			if (isFrontmatterOnlyTemplate) {
				updatedContent = updateFrontmatterOnly(currentContent, updatedContent)
			}

			if (updatedContent !== currentContent) {
				updates.push({ file, currentContent, updatedContent })
			}
		}

		const matchedFileCount = filesToUpdate.length
		const changedFileCount = updates.length

		await applyUpdates(updates)

		if (!matchedFileCount) {
			new Notice(
				`No files matched ${selectedNames.join(", ")}. Check that their template_id matches or that they sit in the expected vault folders.`,
			)
		} else if (changedFileCount === matchedFileCount) {
			new Notice(
				`Selected ${selectedNames.length} template(s) matched ${matchedFileCount} file(s); all ${changedFileCount} required changes.`,
			)
		} else {
			new Notice(
				`Selected ${selectedNames.length} template(s) matched ${matchedFileCount} file(s); ${changedFileCount} needed changes and ${matchedFileCount - changedFileCount} were already up to date.`,
			)
		}
		debugLog("templates.updated", {
			selectedTemplateCount: selectedNames.length,
			matchedFileCount,
			changedFileCount,
		})
	} catch (error) {
		notifyError(error, "Updating templates")
	}
};

function resolveTemplateEntryForFile(file, currentTemplateId, templateEntries) {
	if (currentTemplateId) {
		const byId = templateEntries.find((candidate) => candidate.templateId === currentTemplateId)
		if (byId) {
			return byId
		}
		return null
	}

	return templateEntries.find((candidate) =>
		matchesTemplateFallback(file, candidate.file.basename),
	) || null
}

function matchesTemplateFallback(file, templateName) {
	if (!file || !templateName) return false

	switch (String(templateName).toLowerCase()) {
		case "account":
			return file.path.startsWith("Accounts/")
		case "transaction":
			return file.path.startsWith("Transactions/")
		case "subscription":
			return file.path.startsWith("Budget/") || file.path.startsWith("Budget/Items/")
		case "budgetitem":
			return file.path.startsWith("Budget/") ||
				/^Goals\/(Long Term|Wishlist)\/[^/]+\/(Budget|Items)\//.test(file.path)
		case "longtermgoal":
			return /^Goals\/Long Term\/[^/]+\/Overview\.md$/.test(file.path)
		case "shorttermgoal":
			return /^Goals\/Short Term\/[^/]+\.md$/.test(file.path)
		case "wishlist":
			return /^Goals\/Wishlist\/[^/]+\/Overview\.md$/.test(file.path)
		default:
			return false
	}
}

function getTemplateReplacements(templateContent, currentContent) {
	const replacements = {}
	const placeholders = String(templateContent).matchAll(/%%([A-Za-z][A-Za-z0-9_]*)%%/g)
	for (const [, key] of placeholders) {
		replacements[key] = readFrontmatterValue(currentContent, key)
	}
	return replacements
}

function readFrontmatterValue(content, key) {
	const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/)
	if (!match) return ""

	const lines = match[1].split(/\r?\n/)
	const keyPattern = new RegExp(`^${escapeRegExp(key)}:[ \\t]*(.*)$`)
	const lineIndex = lines.findIndex((line) => keyPattern.test(line))
	if (lineIndex === -1) return ""

	const firstValue = lines[lineIndex].match(keyPattern)[1].trim()
	if (firstValue !== "") return parseTypedFrontmatterValue(key, firstValue)

	const continuation = []
	for (let index = lineIndex + 1; index < lines.length; index += 1) {
		if (!/^\s+/.test(lines[index])) break
		continuation.push(lines[index])
	}

	return continuation.length ? `\n${continuation.join("\n")}` : ""
}

function parseTypedFrontmatterValue(key, value) {
	const parsedValue = stripYamlQuotes(value)
	const normalized = parsedValue.toLowerCase()

	if (key === "bought" || key === "isCompleted") {
		if (normalized === "true") return true
		if (normalized === "false") return false
	}

	if (key === "price" || key === "saved") {
		if (parsedValue !== "" && Number.isFinite(Number(parsedValue))) {
			return Number(parsedValue)
		}
	}

	return parsedValue
}

function getMultilineKeys(replacements) {
	return Object.entries(replacements)
		.filter(([, value]) => /\r?\n/.test(value))
		.map(([key]) => key)
}

function stripYamlQuotes(value) {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		try {
			return JSON.parse(value)
		} catch (error) {
			return value.slice(1, -1)
		}
	}
	return value.replace(/^'|'$/g, "")
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function applyUpdates(updates) {
	const applied = []
	try {
		for (const update of updates) {
			await app.vault.modify(update.file, update.updatedContent)
			applied.push(update)
		}
	} catch (error) {
		const rollbackFailures = []
		for (const update of applied.reverse()) {
			try {
				await app.vault.modify(update.file, update.currentContent)
			} catch (rollbackError) {
				console.error("[Finances] Template rollback failed", rollbackError)
				rollbackFailures.push(update.file.path)
			}
		}

		if (rollbackFailures.length) {
			throw new Error(
				`Template update failed. Could not restore: ${rollbackFailures.join(", ")}`,
			)
		}

		throw error
	}
}

function getTemplateIdFromContent(content) {
	const match = content.match(/^template_id:\s*(.*?)$/m)
	if (!match) {
		return ""
	}

	return String(match[1])
		.trim()
		.replace(/^['"]|['"]$/g, "")
}

function updateFrontmatterOnly(existingContent, renderedTemplateContent) {
	const frontmatterMatch = renderedTemplateContent.match(
		/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/,
	)
	if (!frontmatterMatch) {
		return renderedTemplateContent
	}

	const frontmatter = frontmatterMatch[1]
	const existingMatch = existingContent.match(
		/^(---\r?\n)[\s\S]*?(\r?\n---)([\s\S]*)$/,
	)
	if (!existingMatch) return renderedTemplateContent

	return `${existingMatch[1]}${frontmatter}${existingMatch[2]}${existingMatch[3]}`
}
