# Avatars

The visual personality — video that reacts to what's happening across all sessions.

## Concept

One avatar represents the receptionist. It shows three moods matching the aggregate state: idle (calm), busy (working), pending (alert). The avatar is the emotional center of the dashboard — it tells you at a glance whether anything needs attention.

## Avatar Sets

Each set is a folder under `~/.claudia/avatars/{set-name}/` with up to 3 video files:

| File | State | Fallback |
|---|---|---|
| `idle.*` | No sessions or all idle | Required |
| `busy.*` | At least one busy | → idle |
| `pending.*` | At least one pending | → busy → idle |

**Fallback chain**: pending → busy → idle. A set with only `idle.mp4` works for all states. Extension doesn't matter — the server probes for supported formats.

## Default Set

Built-in videos in `packages/server/assets/avatar/`. Used when active set is "default" or custom set has missing files. Cannot be deleted.

## User Operations

- **Browse sets** — AvatarModal shows all sets with video previews
- **Select active** — stored in preferences (`activeSet`)
- **Create/edit** — upload state videos via drag-and-drop (AvatarSetEditor)
- **Import/export** — ZIP files via `adm-zip`. Portable between machines.
- **Open folder** — jump to avatars directory in file explorer

## Design Decisions

- **Video over GIF/sprite** — videos are smoother, more expressive, and the `<video loop>` API is simpler than animation frame management
- **Set-based, not per-state** — sets are cohesive visual identities, not mix-and-match pieces
- **Server probes formats** — no client negotiation needed, the server knows what's available per set
- **Cache-busting** — `avatarVersion` counter increments on any set change, forces frontend reload
