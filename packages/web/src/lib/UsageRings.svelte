<script>
  import Tooltip from "./Tooltip.svelte";

  let { usage = null } = $props();

  const CIRCUMFERENCE = 2 * Math.PI * 9;
  const STALE_MS = 30 * 60 * 1000;
  const WINDOW_5H = 5 * 60 * 60 * 1000;
  const WINDOW_7D = 7 * 24 * 60 * 60 * 1000;

  function timeElapsedPct(resetsAt, windowMs) {
    if (!resetsAt) return 0;
    const msLeft = Math.max(0, new Date(resetsAt).getTime() - Date.now());
    return (1 - msLeft / windowMs) * 100;
  }

  function isOutpacing(utilization, resetsAt, windowMs) {
    if (!utilization || utilization < 50) return false;
    return utilization > timeElapsedPct(resetsAt, windowMs);
  }

  function tooltipText(utilization, countdown, outpacing) {
    let line = `${Math.round(utilization ?? 0)}% used`;
    if (countdown) line += ` · resets in ${countdown}`;
    if (outpacing) line += `\nMay run out before reset at current pace`;
    return line;
  }

  let countdownText5h = $state("");
  let countdownText7d = $state("");
  let stale = $state(false);
  let fiveHourOutpacing = $state(false);
  let sevenDayOutpacing = $state(false);

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

  function refreshState() {
    if (!usage) return;
    countdownText5h = formatCountdown(usage.fiveHour?.resetsAt);
    countdownText7d = formatCountdown(usage.sevenDay?.resetsAt);
    stale = usage.fetchedAt && (Date.now() - usage.fetchedAt > STALE_MS);
    fiveHourOutpacing = isOutpacing(usage.fiveHour?.utilization, usage.fiveHour?.resetsAt, WINDOW_5H);
    sevenDayOutpacing = isOutpacing(usage.sevenDay?.utilization, usage.sevenDay?.resetsAt, WINDOW_7D);
  }

  $effect(() => {
    usage;
    refreshState();
    const interval = setInterval(refreshState, 60_000);
    return () => clearInterval(interval);
  });
</script>

<div class="usage-rings" class:stale class:skeleton={!usage}>
  <div class="ring-item">
    <Tooltip text={usage ? tooltipText(usage.fiveHour?.utilization, countdownText5h, fiveHourOutpacing) : ""}>
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          {#if usage}
            <circle class="ring-fill" cx="12" cy="12" r="9"
              class:outpacing={fiveHourOutpacing}
              stroke-dasharray={CIRCUMFERENCE}
              stroke-dashoffset={dashOffset(usage.fiveHour?.utilization)}
            />
          {/if}
        </svg>
      </div>
    </Tooltip>
    <span class="ring-label">5h</span>
  </div>
  <div class="ring-item">
    <Tooltip text={usage ? tooltipText(usage.sevenDay?.utilization, countdownText7d, sevenDayOutpacing) : ""}>
      <div class="ring-wrap">
        <svg viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="9"/>
          {#if usage}
            <circle class="ring-fill" cx="12" cy="12" r="9"
              class:outpacing={sevenDayOutpacing}
              stroke-dasharray={CIRCUMFERENCE}
              stroke-dashoffset={dashOffset(usage.sevenDay?.utilization)}
            />
          {/if}
        </svg>
      </div>
    </Tooltip>
    <span class="ring-label">7d</span>
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
    stroke: var(--gray);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                stroke 0.3s ease;
  }

  .ring-fill.outpacing {
    animation: breathe 3.5s ease-in-out infinite;
  }

  @keyframes breathe {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
</style>
