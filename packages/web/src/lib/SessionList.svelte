<script>
  import SessionCard from "./SessionCard.svelte";
  import SpawnPopover from "./SpawnPopover.svelte";

  let { sessions = [], showSpawn = false, ontogglespawn, onclosespawn } = $props();

  const statePriority = { pending: 0, idle: 1, busy: 2 };

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
  <div class="section-label">Active Sessions</div>
{/if}

<div class="list">
  {#each sorted as session (session.id)}
    <SessionCard {session} />
  {/each}

  <button class="add-card" onclick={ontogglespawn}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span>New agent</span>
  </button>

  {#if showSpawn}
    <SpawnPopover onclose={onclosespawn} />
  {/if}
</div>

<style>
  .section-label {
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 12px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .add-card {
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

  .add-card:hover {
    border-style: solid;
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }
</style>
