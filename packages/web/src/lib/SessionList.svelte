<script>
  import SessionCard from "./SessionCard.svelte";
  import SpawnPopover from "./SpawnPopover.svelte";
  import UsageRings from "./UsageRings.svelte";
  import ConsentModal from "./ConsentModal.svelte";

  let { sessions = [], showSpawn = false, immersive = false, usage = null, usageMonitoring = false, onusagemonitoringchange, ontogglespawn, onclosespawn } = $props();

  const statePriority = { pending: 0, idle: 1, busy: 2 };

  let showConsent = $state(false);

  let sorted = $derived(
    [...sessions].sort((a, b) => {
      const pa = statePriority[a.state] ?? 3;
      const pb = statePriority[b.state] ?? 3;
      if (pa !== pb) return pa - pb;
      return b.lastEvent - a.lastEvent;
    })
  );
</script>

{#if sessions.length > 0}
  <div class="section-header">
    <span class="section-label">Active Sessions</span>
    {#if usageMonitoring}
      <UsageRings {usage} />
    {:else}
      <button class="track-usage-btn" onclick={() => showConsent = true}>Track usage</button>
    {/if}
  </div>
{/if}

<div class="list" class:immersive>
  <button class="add-card" onclick={ontogglespawn}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span>New session</span>
  </button>

  {#each sorted as session (session.id)}
    <SessionCard {session} />
  {/each}

  {#if showSpawn}
    <SpawnPopover onclose={onclosespawn} />
  {/if}
</div>

{#if showConsent}
  <ConsentModal onchoice={(v) => {
    showConsent = false;
    if (v) onusagemonitoringchange?.(true);
  }} />
{/if}

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-label {
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .add-card {
    order: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 16px;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: 12px;
    color: var(--text-faint);
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .immersive .add-card {
    order: -1;
  }

  .add-card:hover {
    border-style: solid;
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .track-usage-btn {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: var(--text-faint);
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
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
