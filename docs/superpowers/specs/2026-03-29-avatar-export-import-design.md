# Avatar Export/Import Design

Export and import avatar sets as `.claudia` files for easy sharing.

## File Format

A `.claudia` file is a zip archive with a custom extension. No manifest, no metadata — just video files.

Contents:
```
my-avatar.claudia (zip internally)
├── idle.webm
├── busy.webm
└── pending.webm
```

- Set name is derived from the zip filename: `pixel-art.claudia` → set name `pixel-art`
- Exactly 3 files required: `idle`, `busy`, `pending`
- Each file has exactly one extension: `.webm` or `.mp4`
- No duplicate states allowed (e.g., `busy.mp4` + `busy.webm` = rejected)
- Mixed formats are valid (e.g., `idle.webm` + `busy.mp4` + `pending.webm`)
- No transcoding — files are preserved as-is

## Supported Formats

webm and mp4 only. Same as existing upload validation.

Valid filenames inside the archive:
- `idle.webm`, `idle.mp4`
- `busy.webm`, `busy.mp4`
- `pending.webm`, `pending.mp4`

## Export

**API**: `GET /api/avatars/sets/:name/export`

- Server reads the 3 video files from `~/.claudia/avatars/<name>/`
- Zips them into a `.claudia` archive
- Returns as a download with `Content-Disposition: attachment; filename="<name>.claudia"`
- Default set can be exported (it's valid user-facing content)

**UI**: Export icon button on each avatar set card in `AvatarTab`, next to the edit button. Not shown for the default set.

Clicking triggers a browser download via the API endpoint.

## Import

**API**: `POST /api/avatars/import`

- Accepts a `.claudia` file upload (the zip)
- Set name is derived from the uploaded filename (minus `.claudia` extension)
- Validates the set name against existing naming rules
- Name conflict resolution: auto-suffix with `(2)`, `(3)`, etc.

**UI**: "Import" button in `AvatarTab`, next to the "Add New" button. Import is a separate flow from manual creation — it doesn't go through the editor.

Clicking opens a file picker filtered to `.claudia` files only.

## Validation

All validation reuses existing logic from avatar-storage.js where possible.

### Zip-level
- Max zip size: 20MB (matches existing request limit)
- Must be a valid zip archive
- Path traversal protection: strip directory paths, match against whitelist

### File-level
- Exactly 3 files
- Each filename must be one of the 6 valid names (`idle.webm`, `idle.mp4`, etc.)
- No duplicate states (one file per state)
- Max 5MB per file (matches existing upload limit)
- Magic byte validation: EBML header for webm, `ftyp` for mp4 (existing checks)

### Name-level
- Derived filename must pass existing set name regex: `/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,48}[a-zA-Z0-9]$/`
- If name conflicts with existing set, auto-suffix: `name (2)`, `name (3)`, etc.

## Error Messages

Human-readable, shown as a toast notification (not a modal). No error codes.

| Failure | Message |
|---------|---------|
| Not a valid zip | "This file doesn't look like a valid .claudia avatar pack" |
| Wrong file count or missing/duplicate state | "Avatar pack must contain exactly 3 files: idle, busy, and pending" |
| File too large | "One or more files exceed the 5MB limit" |
| Bad magic bytes | "One or more files aren't valid video files" |
| Zip too large | "File is too large" |
| Invalid set name from filename | "Filename isn't a valid avatar set name" |

## Security

| Threat | Mitigation |
|--------|------------|
| Zip bomb | 20MB zip cap, 5MB per-file cap |
| Path traversal | Whitelist filenames, ignore all others |
| Non-video payload | Magic byte validation |
| Malicious codec exploit | Browser sandbox (not our concern) |
| Extra files in zip | Ignored — only whitelisted names extracted |

## Dependency

Zip creation and extraction requires a library. The server currently has zero non-express dependencies. This adds one.

Candidates:
- `yazl` / `yauzl` — small, focused, well-maintained (separate libs for create/extract)
- `adm-zip` — single package, simpler API, synchronous

Recommendation: `adm-zip` for simplicity — one dep, covers both create and extract, API is straightforward.

## UI Placement

### Export
- Icon button on each avatar set card in `AvatarTab.svelte`
- Not shown for the default set
- Positioned next to the existing edit button

### Import
- Button in `AvatarTab.svelte`, near the "Add New" button
- Opens native file picker filtered to `.claudia`
- On success: refreshes the set list, new set appears
- On failure: toast with error message

## Out of Scope

- Deep video playback validation (broken codecs, truncated files) — browser is the validator
- Transcoding between formats
- Batch export/import
- Drag-and-drop import (file picker only for v1)
