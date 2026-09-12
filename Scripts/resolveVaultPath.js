function resolveVaultScriptPath(vault, relativePath) {
    if (!vault) {
        return null
    }

    const scriptPath = String(relativePath || "").replace(/^[/\\]+/, "")
    if (!scriptPath) {
        return null
    }

    const adapter = vault.adapter
    if (adapter && typeof adapter.getBasePath === "function") {
        const basePath = adapter.getBasePath()
        if (typeof basePath === "string" && basePath.trim()) {
            return `${basePath.replace(/[\\/]$/, "")}/Scripts/${scriptPath}`
        }
    }

    try {
        return require.resolve(`./${scriptPath}`)
    } catch (error) {
        return null
    }
}

module.exports = {
    resolveVaultScriptPath,
}
