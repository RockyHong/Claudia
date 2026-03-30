<script>
  let { aggregateState = "idle", statusMessage = "", sessionCount = 0, disconnected = false, immersive = false } = $props();

  let dotClass = $derived(disconnected ? "dot-disconnected" : `dot-${aggregateState}`);
</script>

<footer class="status-bar" class:pending={!disconnected && aggregateState === "pending"} class:immersive>
  <div class="status-inner">
    <span class="dot {dotClass}"></span>
    <span class="message">{statusMessage}</span>
    <span class="count">{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
  </div>
</footer>

<style>
  .status-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    font-size: var(--text-sm);
    color: var(--text-muted);
    background: var(--bg-card);
    border-top: 1px solid var(--border);
    transition: all 150ms ease;
  }

  .status-bar.pending {
    background: rgba(229, 160, 58, 0.14);
    border-top-color: rgba(229, 160, 58, 0.35);
  }

  .status-bar.immersive {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);
  }

  .status-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 640px;
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
  }

  .immersive .status-inner {
    margin: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle { background: var(--green); }
  .dot-busy { background: var(--blue); }
  .dot-pending { background: var(--amber); }
  .dot-disconnected {
    background: var(--gray);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot-disconnected { animation: none; }
  }

  .message { flex: 1; }

  .count {
    font-size: var(--text-xs);
    opacity: 0.7;
  }
</style>
