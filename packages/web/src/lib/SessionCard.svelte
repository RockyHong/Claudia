<script>
import { BookOpen, Folder, Ghost, GitBranch, Terminal } from "lucide-svelte";
import Tooltip from "./Tooltip.svelte";

let { session, immersive = false } = $props();

const stateConfig = {
	idle: { dot: "dot-idle", label: "Idle" },
	busy: { dot: "dot-busy", label: "Working" },
	pending: { dot: "dot-pending", label: "Pending" },
	disconnected: { dot: "dot-disconnected", label: "Disconnected" },
};

let elapsed = $state("");
let approveLoading = $state(false);
let flashClass = $state("");
let lastPermissionId = $state(null);
let toolContextExpanded = $state(false);

async function handleDecision(decision) {
	approveLoading = true;
	flashClass = decision === "allow" ? "flash-approve" : "flash-deny";
	try {
		await fetch(`/api/permission/${session.id}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision }),
		});
	} catch {
		// best-effort — if server is down, hook will timeout and fallback
	}
	// Cosmetic flash clear — decoupled from state so it can't race the queue shift
	setTimeout(() => {
		flashClass = "";
	}, 300);
}

// Reset button state when the displayed permission changes identity
// (new request arrived, or queue shifted to the next head after a decision).
// Card visibility is driven by session.permissionRequest alone — no decisionMade flag.
$effect(() => {
	const currentId = session.permissionRequest?.id ?? null;
	if (currentId !== lastPermissionId) {
		lastPermissionId = currentId;
		approveLoading = false;
	}
});

$effect(() => {
	const interval = setInterval(() => {
		elapsed = formatElapsed(session.stateChangedAt);
	}, 1000);
	elapsed = formatElapsed(session.stateChangedAt);
	return () => clearInterval(interval);
});

function formatElapsed(timestamp) {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

let config = $derived(stateConfig[session.state] || stateConfig.idle);

async function handleClick() {
	try {
		await fetch(`/focus/${session.id}`, { method: "POST" });
	} catch {
		// best-effort
	}
}

async function openFolder(e) {
	e.stopPropagation();
	try {
		await fetch("/api/open-folder", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: session.cwd }),
		});
	} catch {
		// best-effort
	}
}

async function openTerminal(e) {
	e.stopPropagation();
	try {
		await fetch("/api/open-terminal", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: session.cwd }),
		});
	} catch {
		// best-effort
	}
}

async function spawnSession(e) {
	e.stopPropagation();
	try {
		await fetch("/api/launch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: session.cwd }),
		});
	} catch {
		// best-effort
	}
}

function openDocs(e) {
	e.stopPropagation();
	const url = `${window.location.origin}/md-viewer.html?cwd=${encodeURIComponent(session.cwd)}`;
	const win = window.open(url, "_blank");
	if (!win) {
		// Popup blocked (e.g. Tauri WebView) — open in system browser
		fetch("/api/open-url", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		}).catch(() => {});
	}
}


</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="card {session.state}"
  class:immersive
  class:clickable={true}
  onclick={handleClick}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleClick())}
  tabindex="0"
  role="button"
>
  <div class="card-row">
    <div class="card-left">
      <span class="dot {config.dot}"></span>
      <span class="name">
        {session.displayName}
      </span>
    </div>
    <span class="card-state">
      {config.label}
      {#if session.state === 'busy' || session.state === 'pending'}
        &middot; {elapsed}
      {/if}
      {#if session.subagentActivity > 0}
        <span class="subagent-badge">{session.subagentActivity} subagent{session.subagentActivity !== 1 ? "s" : ""}</span>
      {/if}
    </span>
  </div>

  {#if session.git?.isGit || session.cwd}
    <div class="card-row card-row-detail">
      {#if session.git?.isGit}
        <span class="card-detail">
          <GitBranch />
          {session.git.branch}{session.git.dirty ? " *" : ""}
        </span>
      {/if}
      {#if session.cwd}
        <div class="detail-actions">
          <Tooltip text="Browse project docs"><button class="detail-icon-btn" onclick={openDocs}>
            <BookOpen />
          </button></Tooltip>
          <Tooltip text="Open project folder"><button class="detail-icon-btn" onclick={openFolder}>
            <Folder />
          </button></Tooltip>
          <Tooltip text="Open terminal at project"><button class="detail-icon-btn" onclick={openTerminal}>
            <Terminal />
          </button></Tooltip>
          <Tooltip text="Launch new CLI session for this project"><button class="detail-icon-btn" onclick={spawnSession}>
            <Ghost />
          </button></Tooltip>
        </div>
      {/if}
    </div>
  {/if}

  {#if session.permissionRequest}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tool-context" class:expanded={toolContextExpanded} onclick={() => toolContextExpanded = !toolContextExpanded} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toolContextExpanded = !toolContextExpanded)}>
      {session.permissionRequest.toolName}{session.permissionRequest.toolInput ? `: ${session.permissionRequest.toolInput}` : ''}
    </div>
    <div class="inline-actions">
      <button class="action-btn action-approve {flashClass === 'flash-approve' ? 'flash-approve' : ''}" onclick={(e) => { e.stopPropagation(); handleDecision('allow'); }} disabled={approveLoading}>Approve</button>
      <button class="action-btn action-deny {flashClass === 'flash-deny' ? 'flash-deny' : ''}" onclick={(e) => { e.stopPropagation(); handleDecision('deny'); }} disabled={approveLoading}>Deny</button>
    </div>
  {/if}
</div>

<style>
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    transition: all var(--duration-normal, 150ms) var(--ease-in-out, ease);
    user-select: none;
  }

  .card.clickable { cursor: pointer; }
  .card.clickable:hover { border-color: var(--border-active, var(--border)); }
  .card.clickable:active { opacity: 0.85; }

  .card.pending {
    background: rgba(229, 160, 58, 0.14);
    border-color: rgba(229, 160, 58, 0.35);
    box-shadow: 0 0 16px rgba(229, 160, 58, 0.1);
  }

  .card-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .card-row-detail {
    margin-top: var(--space-1);
  }

  .card-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    position: relative;
  }

  .name {
    font-family: var(--font-heading, sans-serif);
    font-weight: 600;
    font-size: var(--text-base);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-state {
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--text-faint, #5c554e);
    flex-shrink: 0;
    margin-left: 12px;
  }

  .card-detail {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--text-faint, #5c554e);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .card-detail :global(svg) {
    width: 12px;
    height: 12px;
    stroke: var(--text-faint, #5c554e);
    flex-shrink: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle { background: var(--green); }
  .dot-busy {
    background: var(--blue);
    animation: pulse-dot 2.5s ease-in-out infinite;
  }
  .dot-pending {
    background: var(--amber);
    animation: pulse-dot 1.8s ease-in-out infinite;
  }
  .dot-disconnected {
    background: var(--text-faint, var(--gray));
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .detail-icon-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    color: var(--text-faint, #5c554e);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-xs);
    transition: color var(--duration-normal, 150ms) var(--ease-in-out, ease);
  }

  .detail-icon-btn:hover {
    color: var(--text-muted, #948b82);
  }

  .detail-icon-btn :global(svg) {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .subagent-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    vertical-align: middle;
  }

  .card.immersive .subagent-badge {
    color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-busy, .dot-pending {
      animation: none;
      box-shadow: none;
    }
  }

  .tool-context {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--amber);
    margin-top: 6px;
    padding: 6px 10px;
    background: rgba(229, 160, 58, 0.08);
    border-radius: var(--radius-sm);
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: all var(--duration-normal, 150ms) var(--ease-in-out, ease);
  }

  .tool-context.expanded {
    white-space: normal;
    word-break: break-word;
  }

  .inline-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(229, 160, 58, 0.2);
  }

  .action-btn {
    all: unset;
    font-family: var(--font-heading, sans-serif);
    font-size: var(--text-xs);
    font-weight: 600;
    border-radius: var(--radius-sm);
    padding: 6px 16px;
    cursor: pointer;
    transition: all var(--duration-normal, 150ms) var(--ease-in-out, ease);
    flex: 1;
    text-align: center;
    box-sizing: border-box;
  }

  .action-approve {
    background: rgba(74, 186, 106, 0.15);
    color: var(--green);
    border: 1px solid rgba(74, 186, 106, 0.3);
  }

  .action-approve:hover:not(:disabled) {
    background: rgba(74, 186, 106, 0.25);
  }

  .action-deny {
    background: rgba(217, 85, 85, 0.1);
    color: var(--red);
    border: 1px solid rgba(217, 85, 85, 0.2);
  }

  .action-deny:hover:not(:disabled) {
    background: rgba(217, 85, 85, 0.2);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .flash-approve {
    background: rgba(74, 186, 106, 0.4) !important;
    transition: background 300ms ease;
  }

  .flash-deny {
    background: rgba(217, 85, 85, 0.35) !important;
    transition: background 300ms ease;
  }
</style>
