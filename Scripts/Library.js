const INVALID_PATH_CHARACTERS = /[\\/:*?"<>|\x00-\x1F]/g
const DEBUG_STORAGE_KEY = "finances.debug"

function isDebugEnabled() {
    if (globalThis.FINANCES_DEBUG === true) return true

    try {
        return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === "true"
    } catch (error) {
        return false
    }
}

function debugLog(event, details = {}) {
    if (!isDebugEnabled()) return
    console.debug(`[Finances] ${event}`, details)
}

function unwrapValue(value) {
    if (value && typeof value === "object" && "value" in value) {
        return unwrapValue(value.value)
    }
    return value
}

function text(value, fallback = "") {
    const unwrapped = unwrapValue(value)

    // Frontmatter values must stay on one line, even when form input is pasted.
    return unwrapped === null || unwrapped === undefined
        ? fallback
        : String(unwrapped).replace(/[\r\n\t]+/g, " ").trim()
}

function safeName(value, label = "Name") {
    const name = text(value)
        .replace(INVALID_PATH_CHARACTERS, "-")
        .replace(/[. ]+$/g, "")
        .trim()

    if (!name || name === "." || name === "..") {
        throw new Error(`${label} must contain at least one valid character.`)
    }

    return name
}

function parseMoney(value, { allowZero = false, allowNegative = false } = {}) {
    const raw = text(value).replace(/,/g, ".")
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return null

    const amount = Number(raw)
    if (!Number.isFinite(amount) || (!allowNegative && amount < 0) || (!allowZero && amount === 0)) {
        return null
    }

    return amount
}

function parseAllocation(value) {
    const raw = text(value)
    const percentage = raw.endsWith("%")
    const numberText = percentage ? raw.slice(0, -1).trim() : raw
    const amount = parseMoney(numberText, { allowZero: true })

    if (amount === null || (percentage && amount > 100)) return null
    return { amount, percentage, value: `${amount}${percentage ? "%" : ""}` }
}

function parseLocalDate(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null

    const [, yearText, monthText, dayText] = match
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const date = new Date(year, month - 1, day)

    return date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
        ? date
        : null
}

function frontmatterRange(content) {
    const match = String(content).match(/^(---\r?\n)([\s\S]*?)(\r?\n---)([\s\S]*)$/)
    return match
        ? { start: match[1], body: match[2], end: match[3], suffix: match[4] }
        : null
}

function readFrontmatterField(frontmatter, key) {
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = String(frontmatter).match(new RegExp(`^${escapedKey}:[ \\t]*(.*?)\\s*$`, "m"))
    return match ? match[1].replace(/^['"]|['"]$/g, "").trim() : ""
}

function updateFrontmatterField(content, key, value) {
    const range = frontmatterRange(content)
    if (!range) throw new Error("The note must contain valid frontmatter.")

    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const keyPattern = new RegExp(`^${escapedKey}:[ \\t]*.*$`, "m")
    if (!keyPattern.test(range.body)) {
        throw new Error(`The frontmatter field '${key}' is missing.`)
    }

    // Replace only the requested property so the note body and other metadata survive.
    const body = range.body.replace(keyPattern, `${key}: ${value}`)
    return `${range.start}${body}${range.end}${range.suffix}`
}

function renderTemplate(template, replacements, options = {}) {
    const multilineKeys = new Set(options.multilineKeys || [])
    const templateText = String(template)
    const frontmatterEnd = templateText.indexOf("\n---", 4)

    // Unknown placeholders are errors so new template fields cannot disappear silently.
    return templateText.replace(/%%([A-Za-z][A-Za-z0-9_]*)%%/g, (placeholder, key, offset) => {
        if (!Object.prototype.hasOwnProperty.call(replacements, key)) {
            throw new Error(`Template contains an unsupported placeholder: ${placeholder}`)
        }

        if (replacements[key] === null || replacements[key] === undefined) return ""

        const value = String(replacements[key])
        const hasUnsafeControlCharacter = /[\0-\x08\x0B\x0C\x0E-\x1F]/.test(value)
        const hasUnexpectedLineBreak = !multilineKeys.has(key) && /[\r\n]/.test(value)

        if (hasUnsafeControlCharacter || hasUnexpectedLineBreak) {
            throw new Error(`Template value '${key}' contains unsafe control characters.`)
        }

        return value
    })
}

async function ensureFolder(vault, folderPath) {
    const parts = String(folderPath).replace(/\\/g, "/").split("/").filter(Boolean)
    let current = ""

    // Create each parent because Obsidian does not guarantee recursive folder creation.
    for (const part of parts) {
        current = current ? `${current}/${part}` : part
        if (!vault.getAbstractFileByPath(current)) await vault.createFolder(current)
    }
}

function getRequiredPlugin(name) {
    const plugin = app?.plugins?.plugins?.[name]
    if (!plugin?.api?.openForm) {
        throw new Error(`The '${name}' plugin is required for this command.`)
    }
    return plugin
}

function notifyError(error, operation = "The operation") {
    console.error(`[Finances] ${operation}`, error)
    const details = error instanceof Error && error.message
        ? `: ${error.message}`
        : "."
    new Notice(`${operation} failed${details}`)
}

module.exports = {
    ensureFolder,
    frontmatterRange,
    debugLog,
    getRequiredPlugin,
    notifyError,
    parseAllocation,
    parseLocalDate,
    parseMoney,
    readFrontmatterField,
    renderTemplate,
    safeName,
    text,
    unwrapValue,
    updateFrontmatterField,
}
