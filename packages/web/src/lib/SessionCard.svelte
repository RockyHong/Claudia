<script>
  let { session } = $props();

  const stateConfig = {
    idle: { dot: "dot-idle", label: "Idle" },
    busy: { dot: "dot-busy", label: "Busy" },
    pending: { dot: "dot-pending", label: "Needs you" },
  };

  let elapsed = $state("");

  $effect(() => {
    const interval = setInterval(() => {
      elapsed = formatElapsed(session.lastEvent);
    }, 1000);
    elapsed = formatElapsed(session.lastEvent);
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="card {session.state}" onclick={handleClick} onkeydown={(e) => e.key === 'Enter' && handleClick()} tabindex="0" role="button">
  <div class="card-main">
    <span class="dot {config.dot}"></span>
    <div class="card-info">
      <span class="name">{session.displayName}</span>
      <span class="meta">
        {config.label}
        {#if session.lastTool}
          &middot; {session.lastTool}
        {/if}
        &middot; {elapsed}
      </span>
    </div>
  </div>

  {#if session.pendingMessage}
    <div class="pending-msg">{session.pendingMessage}</div>
  {/if}
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    transition: border-color 0.2s, background 0.15s;
    cursor: pointer;
    user-select: none;
  }

  .card:hover {
    background: var(--card-bg-hover, var(--card-bg));
  }

  .card:active {
    opacity: 0.85;
  }

  .card.pending {
    border-color: var(--orange);
  }

  .card-main {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 12px;
    color: var(--text-muted);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle {
    background: var(--blue);
  }
  .dot-busy {
    background: var(--gray);
    animation: pulse 3s infinite;
  }
  .dot-pending {
    background: var(--orange);
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .pending-msg {
    font-size: 12px;
    color: var(--orange);
    flex-shrink: 1;
  }

</style>
