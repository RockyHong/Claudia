<script>
  import SessionCard from "./SessionCard.svelte";

  let { sessions = [] } = $props();

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

{#if sessions.length === 0}
  <div class="empty">
    <p class="empty-title">No active sessions</p>
    <p class="empty-sub">
      Start a Claude Code session — Claudia will pick it up automatically.
    </p>
  </div>
{:else}
  <div class="list">
    {#each sorted as session (session.id)}
      <SessionCard {session} />
    {/each}
  </div>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-muted);
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .empty-sub {
    font-size: 13px;
  }
</style>
