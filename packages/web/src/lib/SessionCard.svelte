<script>
  import { onMount } from "svelte";
  import { GitBranch, Folder, Terminal } from "lucide-svelte";

  let { session } = $props();

  const stateConfig = {
    idle: { dot: "dot-idle", label: "Idle" },
    busy: { dot: "dot-busy", label: "Working" },
    pending: { dot: "dot-pending", label: "Pending" },
    disconnected: { dot: "dot-disconnected", label: "Disconnected" },
  };

  let elapsed = $state("");
  let showLinkDropdown = $state(false);
  let terminalList = $state([]);
  let linkLoading = $state(false);
  let linkError = $state("");
  let approveLoading = $state(false);
  let flashClass = $state("");
  let decisionMade = $state(false);
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
    setTimeout(() => {
      flashClass = "";
      approveLoading = false;
      decisionMade = true;
    }, 300);
  }

  // Reset when a new permission request arrives for this session
  $effect(() => {
    if (session.permissionRequest) decisionMade = false;
  });

  onMount(() => {
    const handler = (e) => {
      if (showLinkDropdown) showLinkDropdown = false;
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
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
    if (!session.spawned) return;
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

  async function openLinkDropdown(e) {
    e.stopPropagation();
    if (showLinkDropdown) {
      showLinkDropdown = false;
      return;
    }
    linkLoading = true;
    linkError = "";
    showLinkDropdown = true;
    try {
      const res = await fetch("/api/terminals");
      const data = await res.json();
      if (data.supported === false) {
        terminalList = [];
        linkError = "Linking not supported on this platform yet";
      } else {
        terminalList = data.terminals || [];
      }
    } catch {
      terminalList = [];
      linkError = "Failed to load terminals";
    } finally {
      linkLoading = false;
    }
  }

  function flashTerminal(hwnd) {
    fetch(`/api/flash/${hwnd}`, { method: "POST" }).catch(() => {});
  }

  async function linkTerminal(hwnd) {
    try {
      await fetch(`/api/link/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowHandle: hwnd }),
      });
    } catch {
      // best-effort
    }
    showLinkDropdown = false;
  }


</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="card {session.state}"
  class:clickable={session.spawned}
  onclick={handleClick}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleClick())}
  tabindex={session.spawned ? 0 : -1}
  role={session.spawned ? "button" : undefined}
>
  <div class="card-row">
    <div class="card-left">
      <span class="dot {config.dot}"></span>
      <span class="name">
        {session.terminalTitle || session.displayName}
        {#if !session.spawned}
          <span class="orphan-badge" title="Click to link a terminal" role="button" tabindex="0" onclick={openLinkDropdown} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openLinkDropdown(e))}>unlinked</span>
        {/if}
      </span>
      {#if showLinkDropdown}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="link-dropdown" onclick={(e) => e.stopPropagation()}>
          {#if linkLoading}
            <div class="link-dropdown-item link-dropdown-empty">Loading...</div>
          {:else if linkError}
            <div class="link-dropdown-item link-dropdown-empty">{linkError}</div>
          {:else if terminalList.length === 0}
            <div class="link-dropdown-item link-dropdown-empty">No terminals found</div>
          {:else}
            {#each terminalList as terminal}
              <button class="link-dropdown-item" onclick={() => linkTerminal(terminal.hwnd)} onmouseenter={() => flashTerminal(terminal.hwnd)}>
                {terminal.title}
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
    <span class="card-state">
      {config.label}
      {#if session.state === 'busy' || session.state === 'pending'}
        &middot; {elapsed}
      {/if}
      {#if session.subagentActivity > 0}
        <span class="subagent-count" title="Subagents completed this turn">{session.subagentActivity} sub</span>
      {/if}
    </span>
  </div>

  {#if session.git?.isGit || session.cwd || session.compacted}
    <div class="card-row card-row-detail">
      {#if session.git?.isGit}
        <span class="card-detail">
          <GitBranch />
          {session.git.branch}{session.git.dirty ? " *" : ""}
        </span>
      {/if}
      {#if session.compacted}
        <span class="card-detail compacted-badge" title="Context was compacted">compacted</span>
      {/if}
      {#if session.cwd}
        <div class="detail-actions">
          <button class="detail-icon-btn" onclick={openFolder} title="Open in explorer">
            <Folder />
          </button>
          <button class="detail-icon-btn" onclick={openTerminal} title="Open terminal here">
            <Terminal />
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if session.permissionRequest && !decisionMade}
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
    box-shadow: 0 0 6px var(--blue);
    animation: glow-dot 2.5s ease-in-out infinite;
  }
  .dot-pending {
    background: var(--amber);
    box-shadow: 0 0 6px var(--amber);
    animation: glow-dot 1.8s ease-in-out infinite;
  }
  .dot-disconnected {
    background: var(--text-faint, var(--gray));
  }

  @keyframes glow-dot {
    0%, 100% { box-shadow: 0 0 6px currentColor; opacity: 1; }
    50% { box-shadow: 0 0 2px currentColor; opacity: 0.5; }
  }

  .orphan-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    background: var(--bg-raised);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    margin-left: 6px;
    vertical-align: middle;
    cursor: pointer;
    transition: color var(--duration-normal, 150ms) var(--ease-in-out, ease),
                background var(--duration-normal, 150ms) var(--ease-in-out, ease);
  }

  .orphan-badge:hover {
    color: var(--text-muted);
    background: var(--bg-hover, var(--bg-raised));
  }

  .link-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    margin-bottom: 4px;
    min-width: 240px;
    max-width: 360px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    overflow: hidden;
  }

  .link-dropdown-item {
    all: unset;
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
  }

  .link-dropdown-item:hover {
    background: var(--bg-hover, var(--bg-raised));
    color: var(--text-primary, var(--text));
  }

  .link-dropdown-empty {
    color: var(--text-faint);
    cursor: default;
    font-family: var(--font-body, sans-serif);
  }

  .link-dropdown-empty:hover {
    background: none;
    color: var(--text-faint);
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

  .subagent-count {
    font-size: var(--text-xs);
    color: var(--text-faint, #5c554e);
    margin-left: 4px;
  }

  .compacted-badge {
    font-size: var(--text-xs);
    color: var(--text-faint, #5c554e);
    opacity: 0.7;
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
