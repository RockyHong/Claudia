<script>
  import SessionCard from "./SessionCard.svelte";

  let { sessions = [] } = $props();
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
    {#each sessions as session (session.id)}
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
