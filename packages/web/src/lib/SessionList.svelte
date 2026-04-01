<script>
import { Ghost, Info } from "lucide-svelte";
import ConsentModal from "./ConsentModal.svelte";
import SessionCard from "./SessionCard.svelte";
import Tooltip from "./Tooltip.svelte";
import UsageRings from "./UsageRings.svelte";

let {
	sessions = [],
	showSpawn = false,
	immersive = false,
	usage = null,
	usageMonitoring = false,
	onusagemonitoringchange,
	ontogglespawn,
} = $props();

const statePriority = { pending: 0, idle: 1, busy: 2 };

let showConsent = $state(false);

let sorted = $derived(
	[...sessions].sort((a, b) => {
		const pa = statePriority[a.state] ?? 3;
		const pb = statePriority[b.state] ?? 3;
		if (pa !== pb) return pa - pb;
		return b.lastEvent - a.lastEvent;
	}),
);
</script>

<div class="sessions-panel" class:immersive>
<div class="section-header">
  <span class="section-label">Sessions <Tooltip text="Sessions appear automatically when Claude Code sends hook events"><Info size={11} /></Tooltip></span>
  {#if usageMonitoring}
    <UsageRings {usage} />
  {:else}
    <button class="track-usage-btn" onclick={() => showConsent = true}>Track usage</button>
  {/if}
</div>

<div class="list" class:immersive>
  <button class="add-card" onclick={ontogglespawn}>
    <Ghost size={18} />
    <span>New CLI session</span>
  </button>

  {#each sorted as session (session.id)}
    <SessionCard {session} {immersive} />
  {/each}

</div>

</div>

{#if showConsent}
  <ConsentModal onchoice={(v) => {
    showConsent = false;
    if (v) onusagemonitoringchange?.(true);
  }} />
{/if}

<style>
  .sessions-panel.immersive {
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: var(--radius-xl);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: var(--space-4);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-heading);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
  }

  .section-label :global(.tooltip-anchor) {
    opacity: 0.5;
    cursor: help;
    transition: opacity var(--duration-normal) var(--ease-in-out);
  }

  .section-label :global(.tooltip-anchor:hover) {
    opacity: 1;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .add-card {
    order: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 14px 16px;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    color: var(--text-faint);
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .immersive .add-card {
    order: -1;
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
  }

  .immersive .add-card:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.1);
  }

  .sessions-panel.immersive .section-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .sessions-panel.immersive .track-usage-btn {
    color: rgba(255, 255, 255, 0.5);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .sessions-panel.immersive .track-usage-btn:hover {
    color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
  }

  .add-card:hover {
    border-style: solid;
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .track-usage-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-faint);
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .track-usage-btn:hover {
    color: var(--text-muted);
    border-color: var(--border-active);
    background: var(--bg-raised);
  }
</style>
