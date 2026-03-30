<script>
  import Tooltip from "./Tooltip.svelte";

  let { usage = null } = $props();

  const CIRCUMFERENCE = 2 * Math.PI * 9;
  const STALE_MS = 30 * 60 * 1000;

  let countdownText5h = $state("");
  let countdownText7d = $state("");
  let stale = $state(false);

  function dashOffset(utilization) {
    return CIRCUMFERENCE * (1 - (utilization || 0) / 100);
  }

  function formatCountdown(resetsAt) {
    if (!resetsAt) return "";
    const ms = new Date(resetsAt).getTime() - Date.now();
    if (ms <= 0) return "";
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }

  function refreshCountdowns() {
    if (!usage) return;
    countdownText5h = formatCountdown(usage.fiveHour?.resetsAt);
    countdownText7d = formatCountdown(usage.sevenDay?.resetsAt);
    stale = usage.fetchedAt && (Date.now() - usage.fetchedAt > STALE_MS);
  }

  $effect(() => {
    usage;
    refreshCountdowns();
    const interval = setInterval(refreshCountdowns, 60_000);
    return () => clearInterval(interval);
  });
</script>

<div class="usage-rings" class:stale class:skeleton={!usage}>
  <div class="ring-item">
    <Tooltip text={usage ? `${Math.round(usage.fiveHour?.utilization ?? 0)}%` : ""}>
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          {#if usage}
            <circle class="ring-fill" cx="12" cy="12" r="9"
              stroke-dasharray={CIRCUMFERENCE}
              stroke-dashoffset={dashOffset(usage.fiveHour?.utilization)}
            />
          {/if}
        </svg>
      </div>
    </Tooltip>
    <span class="ring-label">5h</span>
    {#if countdownText5h}
      <span class="ring-reset">{countdownText5h}</span>
    {/if}
  </div>
  <div class="ring-item">
    <Tooltip text={usage ? `${Math.round(usage.sevenDay?.utilization ?? 0)}%` : ""}>
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          {#if usage}
            <circle class="ring-fill" cx="12" cy="12" r="9"
              stroke-dasharray={CIRCUMFERENCE}
              stroke-dashoffset={dashOffset(usage.sevenDay?.utilization)}
            />
          {/if}
        </svg>
      </div>
    </Tooltip>
    <span class="ring-label">7d</span>
    {#if countdownText7d}
      <span class="ring-reset">{countdownText7d}</span>
    {/if}
  </div>
  {#if !usage}
    <span class="ring-hint">waiting…</span>
  {/if}
</div>

<style>
  .usage-rings {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    transition: opacity 0.3s ease;
  }

  .usage-rings.stale,
  .usage-rings.skeleton {
    opacity: 0.5;
  }

  .ring-hint {
    font-size: 0.5625rem;
    color: var(--text-faint);
    opacity: 0.7;
  }

  .ring-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: var(--text-faint);
  }

  .ring-wrap {
    width: 24px;
    height: 24px;
  }

  .ring-wrap svg {
    transform: rotate(-90deg);
    width: 24px;
    height: 24px;
  }

  .ring-bg {
    fill: none;
    stroke: var(--bg-raised);
    stroke-width: 2.5;
  }

  .ring-fill {
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ring-reset {
    opacity: 0.7;
  }
</style>
