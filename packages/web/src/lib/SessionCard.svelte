<script>
  import { onMount } from "svelte";

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
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
              <button class="link-dropdown-item" onclick={() => linkTerminal(terminal.hwnd)}>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
          {session.git.branch}{session.git.dirty ? " *" : ""}
        </span>
      {/if}
      {#if session.compacted}
        <span class="card-detail compacted-badge" title="Context was compacted">compacted</span>
      {/if}
      {#if session.cwd}
        <div class="detail-actions">
          <button class="detail-icon-btn" onclick={openFolder} title="Open in explorer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="detail-icon-btn" onclick={openTerminal} title="Open terminal here">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </button>
        </div>
      {/if}
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

  .card-detail svg {
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

  .detail-icon-btn svg {
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
</style>
