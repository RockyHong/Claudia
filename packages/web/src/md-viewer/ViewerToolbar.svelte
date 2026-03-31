<script>
  import { PanelLeft, List, Sun, Moon } from "lucide-svelte";

  let {
    filePath = "",
    treeVisible = true,
    tocVisible = true,
    darkMode = false,
    onToggleTree = () => {},
    onToggleToc = () => {},
    onToggleTheme = () => {},
  } = $props();
</script>

<div class="toolbar">
  <div class="toolbar-left">
    <button class="toolbar-btn" class:active={treeVisible} onclick={onToggleTree} title="Toggle file tree">
      <PanelLeft size={16} />
    </button>
    <span class="breadcrumb">{filePath || "No file selected"}</span>
  </div>
  <div class="toolbar-right">
    <button class="toolbar-btn" class:active={tocVisible} onclick={onToggleToc} title="Toggle table of contents">
      <List size={16} />
    </button>
    <button class="toolbar-btn" onclick={onToggleTheme} title="Toggle theme">
      {#if darkMode}
        <Sun size={16} />
      {:else}
        <Moon size={16} />
      {/if}
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    border-bottom: 1px solid var(--viewer-border);
    background: var(--viewer-toolbar-bg);
    flex-shrink: 0;
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .breadcrumb {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--viewer-text-faint);
  }

  .toolbar-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    color: var(--viewer-text-faint);
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }

  .toolbar-btn:hover {
    color: var(--viewer-text);
    background: var(--viewer-hover);
  }

  .toolbar-btn.active {
    color: var(--viewer-text-muted);
  }
</style>
