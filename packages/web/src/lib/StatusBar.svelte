<script>
  let { aggregateState = "idle", statusMessage = "", sessionCount = 0, disconnected = false } = $props();

  let dotClass = $derived(disconnected ? "dot-disconnected" : `dot-${aggregateState}`);
</script>

<div class="status-bar">
  <span class="dot {dotClass}"></span>
  <span class="message">{statusMessage}</span>
  <span class="count">{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-idle { background: var(--green); }
  .dot-busy { background: var(--blue); }
  .dot-pending { background: var(--amber, var(--orange)); }
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
    font-size: 0.75rem;
    opacity: 0.7;
  }
</style>
