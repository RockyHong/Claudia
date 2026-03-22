# Avatar Videos

Claudia's avatar panel displays a looping video that reflects the aggregate state of all monitored sessions. Place your video files in this directory.

## File Naming

```
avatar/
  idle.webm
  working.webm
  pending.webm
  thinking.webm
```

Each filename maps directly to one of Claudia's four states. All four files are required — missing files will show a fallback (empty panel with state dot).

## Format

| Property | Requirement |
|---|---|
| **Format** | WebM (VP9) preferred — supports alpha transparency. MP4 (H.264) accepted as fallback |
| **Resolution** | 200x200px recommended. The panel scales to fit, but square aspect ratio looks best |
| **Duration** | 3–8 seconds. Videos loop seamlessly, so shorter is better |
| **Loop point** | First and last frames should match for a smooth loop. Avoid hard cuts |
| **File size** | Keep each file under 500KB. These load on every page visit |
| **Audio** | None. Videos play muted |

## What Each Video Should Depict

The avatar is Claudia — a receptionist character. Her demeanor should shift with each state:

### `idle.webm`
**Mood:** Relaxed, at ease. Nothing needs attention.
- Subtle idle animation: looking around, blinking, small movements
- Should feel calm and ambient — not distracting
- Think: receptionist at a quiet front desk

### `working.webm`
**Mood:** Busy, focused. Agents are running.
- Typing, reading, or otherwise engaged in activity
- Moderate energy — things are happening but no action needed from the user
- Think: receptionist processing paperwork

### `pending.webm`
**Mood:** Alert, trying to get your attention. Someone needs you.
- Looking directly at the viewer, waving, tapping the desk, or gesturing
- Should feel like a gentle but clear "hey, come here"
- This is the most important state — the user needs to notice it
- Think: receptionist flagging you down as you walk past

### `thinking.webm`
**Mood:** Contemplative, patient. Waiting for the agent to figure things out.
- Hand on chin, looking up, pondering
- Slow, calm animation — nothing urgent
- Think: receptionist waiting for a fax to come through

## Transparency

If your videos use WebM with alpha channel, the avatar will overlay cleanly on the dashboard background (dark or light mode). If using MP4 or opaque WebM, use a neutral background that works in both themes — `#1a1d27` (dark) or `#ffffff` (light) are safe choices.

## Placeholder

No avatar videos are included in the repository. The avatar panel will gracefully hide itself when no videos are found. To test with placeholder content, you can generate simple animations with ffmpeg:

```bash
# Generate a 5s colored circle animation as placeholder
ffmpeg -f lavfi -i "color=c=#6b7280:s=200x200:d=5,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p idle.webm

ffmpeg -f lavfi -i "color=c=#3b82f6:s=200x200:d=5,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p working.webm

ffmpeg -f lavfi -i "color=c=#f59e0b:s=200x200:d=5,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p pending.webm

ffmpeg -f lavfi -i "color=c=#8b5cf6:s=200x200:d=5,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p thinking.webm
```
