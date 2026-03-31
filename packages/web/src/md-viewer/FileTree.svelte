<script>
  import { ChevronRight, FileText } from "lucide-svelte";

  let {
    tree = [],
    selectedPath = "",
    onSelectFile = () => {},
  } = $props();

  let expanded = $state({});

  function toggleFolder(name) {
    expanded[name] = !expanded[name];
  }
</script>

<nav class="file-tree" aria-label="Project files">
  {#each tree as node}
    {#if node.children}
      <div class="tree-folder">
        <button
          class="tree-item tree-folder-toggle"
          onclick={() => toggleFolder(node.name)}
        >
          <ChevronRight size={12} class={expanded[node.name] ? 'chevron-open' : ''} />
          <span>{node.name}</span>
        </button>
        {#if expanded[node.name]}
          <div class="tree-children">
            <svelte:self
              tree={node.children}
              {selectedPath}
              {onSelectFile}
            />
          </div>
        {/if}
      </div>
    {:else}
      <button
        class="tree-item tree-file"
        class:selected={selectedPath === node.path}
        onclick={() => onSelectFile(node.path)}
      >
        <FileText size={12} />
        <span>{node.name}</span>
      </button>
    {/if}
  {/each}
</nav>

<style>
  .file-tree {
    padding: 8px 0;
    overflow-y: auto;
    font-size: 13px;
  }

  .tree-item {
    all: unset;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 12px;
    cursor: pointer;
    color: var(--viewer-text-faint);
    box-sizing: border-box;
    transition: color 150ms ease, background 150ms ease;
  }

  .tree-item:hover {
    color: var(--viewer-text);
    background: var(--viewer-hover);
  }

  .tree-file.selected {
    color: var(--viewer-text);
    background: var(--viewer-active);
  }

  .tree-folder-toggle :global(.chevron-open) {
    transform: rotate(90deg);
  }

  .tree-folder-toggle :global(svg) {
    transition: transform 150ms ease;
    flex-shrink: 0;
  }

  .tree-children {
    padding-left: 12px;
  }

  .tree-file :global(svg) {
    flex-shrink: 0;
    opacity: 0.5;
  }
</style>
