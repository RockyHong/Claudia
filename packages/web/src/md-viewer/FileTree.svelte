<script>
  import { ChevronRight, FileText } from "lucide-svelte";
  import FileTree from "./FileTree.svelte";

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
          <ChevronRight size={14} class={expanded[node.name] ? 'chevron-open' : ''} />
          <span>{node.name}</span>
        </button>
        {#if expanded[node.name]}
          <div class="tree-children">
            <FileTree
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
        <FileText size={14} />
        <span>{node.name}</span>
      </button>
    {/if}
  {/each}
</nav>

<style>
  .file-tree {
    padding: 12px 0;
    overflow-y: auto;
    font-size: 0.8125rem;
  }

  .tree-item {
    all: unset;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 16px;
    cursor: pointer;
    color: var(--viewer-text-muted);
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
