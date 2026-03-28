<script>
  import Modal from "./Modal.svelte";
  import ConfigTab from "./ConfigTab.svelte";
  import AvatarTab from "./AvatarTab.svelte";

  let { onclose, onavatarchange, sfx, nightMode = true, onnightmodechange } = $props();

  let activeTab = $state("config");
</script>

<Modal title="Settings" {onclose}>
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === "config"}
      onclick={() => activeTab = "config"}
    >Config</button>
    <button
      class="tab"
      class:active={activeTab === "avatar"}
      onclick={() => activeTab = "avatar"}
    >Avatar</button>
  </div>

  {#if activeTab === "config"}
    <ConfigTab {nightMode} {onnightmodechange} {sfx} />
  {:else}
    <AvatarTab {onavatarchange} />
  {/if}
</Modal>

<style>
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin: -20px -20px 0;
    padding: 0 20px;
  }

  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-body);
    padding: 10px 16px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover {
    color: var(--text);
  }

  .tab.active {
    color: var(--text);
    border-bottom-color: var(--brand);
  }
</style>
