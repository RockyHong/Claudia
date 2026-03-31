<script>
import Tooltip from "./Tooltip.svelte";

let { immersive = false } = $props();

let status = $state(null);

const STATUS_POLL_MS = 60_000;
let pollTimer;

async function fetchStatus() {
	try {
		const res = await fetch("/api/claude-status");
		if (res.status === 204) return;
		status = await res.json();
	} catch {
		// Keep stale on failure
	}
}

$effect(() => {
	fetchStatus();
	pollTimer = setInterval(fetchStatus, STATUS_POLL_MS);
	return () => clearInterval(pollTimer);
});

let dotClass = $derived(
	!status
		? "dot-unknown"
		: status.overall === "operational"
			? "dot-ok"
			: status.overall === "degraded_performance"
				? "dot-degraded"
				: "dot-outage",
);

let tooltipText = $derived(() => {
	if (!status) return "Claude status: checking…";
	return status.components
		.map((c) => `${c.name}: ${c.status.replace(/_/g, " ")}`)
		.join("\n");
});
</script>

{#if status}
  <Tooltip text={tooltipText()}>
    <a
      class="claude-status"
      class:immersive
      href="https://status.claude.com/"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="label">Claude</span>
      <span class="dot {dotClass}"></span>
    </a>
  </Tooltip>
{/if}

<style>
  .claude-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    transition: background var(--duration-normal) var(--ease-in-out);
    cursor: pointer;
  }

  .claude-status:hover {
    background: none;
  }

  .label {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--text-faint);
    font-weight: 500;
  }

  .immersive .label {
    color: rgba(255, 255, 255, 0.4);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-ok { background: var(--green); }
  .dot-degraded { background: var(--amber); }
  .dot-outage { background: var(--red); }
  .dot-unknown { background: var(--gray); }
</style>
