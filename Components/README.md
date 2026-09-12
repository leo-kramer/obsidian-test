# Components

Reusable markdown blocks live here and are rendered with Obsidian embeds:

```markdown
![[Components/Buttons/Add Transaction]]
```

Keep components self-contained. Dataview components should read the host note through `dv.current()` only when the embedded query preserves that context; otherwise keep page-specific queries in the owning note or template.
