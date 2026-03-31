# Project MD Viewer — Design Spec

A lightweight, browser-based markdown viewer for browsing project documentation. Opens in a new tab from a session card action button. Optimized for reading — paper-like default theme, TTS-compatible semantic HTML, collapsible panels for focused reading on vertical monitors.

## File Discovery

- Primary: `git ls-files '*.md'` in the project directory — fast, pre-filtered, reflects tracked files only
- Fallback (non-git projects): recursive scan respecting common ignores (`node_modules`, `.git`, `dist`, `build`, `.next`, `vendor`)

## Backend API

Two new routes in `routes-api.js`:

### `GET /api/md/tree?cwd=/path/to/project`

Returns a nested tree of `.md` files in the project.

```json
{
  "tree": [
    { "name": "CLAUDE.md", "path": "CLAUDE.md" },
    { "name": "docs", "children": [
      { "name": "overview.md", "path": "docs/overview.md" },
      { "name": "building.md", "path": "docs/building.md" }
    ]}
  ]
}
```

- Uses `git ls-files '*.md'` with fallback to recursive scan
- Paths are relative to `cwd`

### `GET /api/md/file?cwd=/path/to/project&path=docs/overview.md`

Returns raw markdown content for a single file.

```json
{
  "content": "# Overview\n...",
  "mtime": 1774947632
}
```

- `mtime` (modification time) enables client-side polling — only re-render when the file changes on disk
- Path validation: must end in `.md`, must resolve inside `cwd` (no path traversal via `../`)

## Frontend Architecture

Second Svelte entry point in `packages/web`, completely independent from the main dashboard.

### Entry Point

- `md-viewer.html` — HTML entry (parallel to `index.html`)
- `src/md-viewer.js` — mounts the viewer app
- Vite config: add `md-viewer.html` as a second `build.rollupOptions.input` entry
- Both apps build to `dist/`, server serves both via `express.static`

### Components

| Component | Responsibility |
|---|---|
| `MdViewer.svelte` | Root layout — three-panel grid, owns state (`selectedFile`, `treeVisible`, `tocVisible`, `theme`) |
| `FileTree.svelte` | Collapsible folder tree, emits file selection |
| `MdContent.svelte` | Fetches raw markdown, renders via `marked` + `highlight.js`, polls for changes |
| `TableOfContents.svelte` | Extracts headings from rendered content, click-to-scroll, active heading tracking on scroll |
| `ViewerToolbar.svelte` | File breadcrumb path, panel toggle buttons, theme switch |

All components live in `src/md-viewer/`.

### State Flow

- `MdViewer` is the single state owner
- `FileTree` emits file selection up via callback prop
- `MdContent` receives `selectedFile` + `cwd`, fetches and renders
- `MdContent` extracts headings after render, passes to `TableOfContents` via prop
- Auto-refresh: `setInterval` every 3 seconds checks `mtime` — re-fetches and re-renders only if the file changed on disk

## Layout

### Default (>900px): Three-column

```
┌──────────┬────────────────────────┬─────────────┐
│ File Tree│ Content                │ TOC         │
│ (~200px) │ (fluid, max-width 720)│ (~160px)    │
│          │                       │             │
│ docs/    │ # Overview            │ Overview    │
│  over... │                       │  Data Flow  │
│  tech... │ Claudia is a personal │  Protocol   │
│  buil... │ receptionist app...   │ Module Index│
│          │                       │  Server     │
│ CLAUDE.md│ ## Data Flow          │  Web        │
│ todo.md  │ The server receives...│             │
└──────────┴────────────────────────┴─────────────┘
```

- Each panel collapses independently
- Content area has `max-width: 720px` centered for optimal line length
- Wider line-height (`1.8`+) for readability

### Focused Mode

Both sidebars collapsed. Content fills full width (still constrained by `max-width`). Toolbar shows hamburger button to restore file tree, TOC button to restore TOC.

### Responsive (<900px)

- Content takes full width
- File tree and TOC become slide-in overlay drawers triggered by toolbar buttons
- Semi-transparent backdrop behind overlays

## Theme

Independent from main dashboard — own CSS, own toggle.

### Light Mode (default)

Paper-like reading theme. Warm background, high-contrast text, comfortable for long reading sessions. Optimized for readability over terminal aesthetics.

### Dark Mode

Similar tones to dashboard but softer contrast and wider spacing. Reading-optimized, not monitoring-optimized.

### Toggle

Simple button in the toolbar. Persists to `localStorage`. No sync with the main dashboard — they're separate windows with different purposes.

## TTS Compatibility

The viewer doesn't implement TTS, but uses semantic HTML so external tools (Speechify, browser TTS, screen readers) work naturally:

- Rendered markdown uses `<article>` wrapper
- Proper heading hierarchy: `<h1>` through `<h6>`
- Content in `<p>` tags, code in `<pre><code>`
- Navigation in `<nav>` elements
- No `aria-hidden` on content areas
- No CSS-based content injection that would confuse readers

## Session Card Integration

One new icon button in `SessionCard.svelte`'s `detail-actions` row:

- Icon: `BookOpen` from `lucide-svelte`
- Position: alongside existing Folder, Terminal, Ghost buttons
- Action: `window.open(\`/md-viewer.html?cwd=\${encodeURIComponent(session.cwd)}\`, '_blank')`
- Tooltip: "Browse project docs"

No backend involvement for launching — it's a client-side `window.open` with the session's `cwd` as a query parameter.

## Dependencies

Client-side only, bundled by Vite (added as `devDependencies` in `packages/web/package.json`):

| Package | Purpose | Size |
|---|---|---|
| `marked` | Markdown → HTML parsing | ~30kb |
| `highlight.js` | Syntax highlighting in code blocks | ~20kb (selective language imports) |

Server stays at one production dependency (express). Zero changes to `packages/server/package.json`.

## Security

- Path traversal prevention: `path` parameter must resolve inside `cwd` after normalization
- Only `.md` files served via the file endpoint
- `cwd` validated against filesystem (must exist, must be a directory)
