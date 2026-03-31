# Tooltip Principles

## When to add a tooltip

A tooltip is warranted when the element's visual alone is ambiguous, but the action is too minor to justify a text label. An element needs a tooltip when it meets **all three** criteria:

1. **Icon-only or badge-only** — no visible text label explaining the action
2. **Non-obvious meaning** — the icon/badge doesn't universally communicate its purpose
3. **Not learnable from interaction** — clicking doesn't reveal what it does in a reversible way

## When NOT to add a tooltip

- **Buttons with text labels** — the label is the explanation ("Approve", "Deny")
- **Context makes meaning clear** — a branch icon next to `main *` is self-evident
- **Interaction reveals purpose** — dropdowns, toggles, expandable areas

## Writing tooltip text

Tooltip text must be **specific and concise**. Name what it acts on, not just the verb.

| Bad | Good | Why |
|-----|------|-----|
| Open folder | Open project folder | "What folder?" |
| Open terminal | Open terminal at project | Clarifies where |
| Link terminal | Link to terminal window | Clarifies what gets linked |

Rules:

- Lead with the verb when it's an action ("Open...", "Link...")
- Lead with the noun when it's informational ("Session started 5m ago")
- Keep under ~30 characters — if it needs more, it's not a tooltip, it's documentation
- No periods, no articles ("a", "the") unless needed for clarity

## Implementation

Use the shared `<Tooltip text="...">` component (see `packages/web/src/lib/Tooltip.svelte`). Do not use HTML `title` attributes — they render as unstyled browser-native bubbles.

Avoid placing `<Tooltip>` inside elements with `overflow: hidden` (e.g. text-ellipsis containers). Move the tooltip wrapper outside the clipping ancestor.
