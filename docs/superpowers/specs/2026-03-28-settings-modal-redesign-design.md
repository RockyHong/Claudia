# Settings Modal UX Redesign

## Problem

The settings modal is functional but pre-redesign UX. Key pain points:

- **Upload flow** is buried in a collapsible `<details>` section with 3 separate file inputs — clunky, no drag & drop
- **Avatar set management** lacks proper edit (can't replace a single video, must delete + re-upload entire set) and rename
- **Everything in one scroll** — avatar management dominates the modal but shares space with simple toggles
- **No visual hierarchy** — active set isn't prominent, all sets look equal in the grid

## ICP & Usage Patterns

- **Primary**: developer who sets up avatars once, swaps occasionally
- **Power user**: changes sets weekly, manages 5+ sets, wants fast single-video replacement
- **Future**: community sharing (export/import sets — not in scope now)

## Design

### Modal Structure: Two Tabs

Tab bar sits directly under the modal title. Simple text tabs with underline indicator.

| Tab | Contents |
|-----|----------|
| **Config** | Night mode toggle, SFX volume slider, future simple settings |
| **Avatar** | Active set preview, set grid, hover actions |

Rationale: avatar management is the only complex section. Isolating it in its own tab keeps Config clean and gives avatars full modal space.

### Config Tab

Same controls as today, regrouped:

- Night mode toggle (ToggleSlider component)
- Sound effects volume slider (0–100%)
- Future simple settings slot into this tab without touching Avatar

No functionality changes — purely a re-layout.

### Avatar Tab

#### Active Set Preview

Top of tab — larger thumbnail of the current active set with its name displayed. Visual anchor so users always know what's active.

#### Set Grid

Responsive grid below the active preview. `grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`.

**First position**: dotted "+" add card (always first in grid order).

**Set cards**:
- Video thumbnail (idle video, paused at 0.1s)
- Set name below thumbnail
- Active badge on current set
- **Click** → activates set immediately (same as today)
- **Hover reveals two action icons**:
  - Top-right: delete icon
  - Bottom-right: edit icon

**Scrollable region**: grid has a max-height (~3 rows) with overflow scroll, so it doesn't push content off-screen when there are many sets.

#### "+" Add Card

- Dashed border, centered plus icon
- Click opens Avatar Set Editor modal in **create mode**

### Avatar Set Editor Modal (Stacked)

A second modal that opens on top of the settings modal. Shared component for both create and edit flows.

#### Layout

```
┌─────────────────────────────────────┐
│  ← Back          Edit "My Set"      │  (or "New Avatar Set" in create mode)
├─────────────────────────────────────┤
│  Name: [___________________]        │
│                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐
│  │          │ │          │ │          │
│  │  Idle    │ │  Busy    │ │ Pending  │
│  │          │ │          │ │          │
│  └──────────┘ └──────────┘ └──────────┘
│  drag & drop    drag & drop   drag & drop
│                                     │
│                     [Cancel] [Save]  │
└─────────────────────────────────────┘
```

**Name input**: text field, max 50 chars, required. Pre-filled in edit mode.

**3 video slots** in a row (Idle | Busy | Pending):
- Each slot is a drag & drop zone AND click-to-browse area
- Accepts `.webm` and `.mp4` files
- **Empty state** (create mode): dashed border, state label, drop/click prompt
- **Filled state**: video thumbnail preview (plays on hover), with action to replace

#### Create Mode Rules

- All 3 video slots + name MUST be filled before "Create" button enables
- Closing/canceling discards everything — no draft concept
- No warning dialog on close (losing 3 drag & drops is trivial)

#### Edit Mode Rules

- All 3 slots pre-filled with current videos
- Replacing a slot: pick new file → shows new preview locally
- Cancel/close → reverts all changes (no server call)
- "Save" only enabled if something actually changed (name or any file)
- Save sends only changed files to server

#### Rename

Available in edit mode via the name field. Saved as part of the "Save" action.

### Delete Confirmation

Small confirm dialog — not a full stacked modal. A popover or inline confirmation bar near the card. Shows: "Delete [name]?" with Delete / Cancel buttons.

Cannot delete the active set (same constraint as today — button hidden or disabled on active set).

### Server Changes

#### Require All 3 Videos

`createSet()` must reject requests with fewer than 3 files. All of idle, busy, and pending are required.

Validation error: `"All three videos required: idle, busy, pending"`

This is a protocol-level constraint, not just UI enforcement.

#### New: Update Set Endpoint

Need a new endpoint to support editing (replace individual files, rename):

```
PUT /api/avatars/sets/:name
Content-Type: multipart/form-data

Fields:
- "rename" (text field, optional): new set name — triggers rename
- "idle" (file, optional): replacement idle video
- "busy" (file, optional): replacement busy video
- "pending" (file, optional): replacement pending video

At least one field required. Files are validated same as createSet (magic bytes, size limit).
```

Returns `{ ok: true, name }` (name reflects rename if provided).

## Component Breakdown

| Component | Responsibility |
|-----------|---------------|
| `SettingsModal.svelte` | Tab container, tab state, renders Config or Avatar tab |
| `ConfigTab.svelte` | Night mode + SFX controls |
| `AvatarTab.svelte` | Active preview, set grid, hover actions, add card |
| `AvatarSetEditor.svelte` | Stacked modal for create/edit with 3 drop zones |
| `DropZone.svelte` | Single video drag & drop / click-to-browse slot |
| `Modal.svelte` | Existing generic modal (reused, supports stacking) |

## Future Considerations

### File Format Support

Currently accepts `.webm` and `.mp4`. Future discussion needed:
- Should we hard-constrain to `.webm` only for consistency and smaller file sizes?
- Or keep both for broader compatibility (some tools export mp4 more easily)?
- What about `.gif` or animated `.png` for simpler avatars?

This decision affects the server validation, upload UI messaging, and community sharing format.

### Community Sharing / Export

When ready to implement:
- **Export format**: `.zip` containing `manifest.json` + 3 video files
- JSON manifest includes set name, file mappings, optional metadata
- No draft/partial sets — export only works on complete sets
- Import validates all 3 files present before creating

### Set Limits

No hard limit on number of sets for now. If users accumulate many sets, consider:
- Search/filter in the grid
- Sorting (alphabetical, last used, date created)
- Storage usage indicator
