# Developer Debugging

The finance scripts keep debug output in the developer console. Debug output is disabled by default and never appears in notices shown to end users.

## Enable

Open Obsidian's developer console and run:

```js
globalThis.FINANCES_DEBUG = true
```

To keep debug mode enabled after restarting Obsidian, run:

```js
localStorage.setItem("finances.debug", "true")
```

Then run the failing QuickAdd command again.

## Inspect

Filter the console for `[Finances]`. Logs include the operation, relevant vault path, and processing stage. Error notices shown to users remain short, while the console includes the underlying error and stack trace.

Do not share console output without checking it for private account names, paths, or transaction metadata.

## Disable

For the current session:

```js
globalThis.FINANCES_DEBUG = false
```

For persistent storage:

```js
localStorage.removeItem("finances.debug")
```
