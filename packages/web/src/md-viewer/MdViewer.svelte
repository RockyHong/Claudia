<script>
  import { onMount } from "svelte";
  import ViewerToolbar from "./ViewerToolbar.svelte";
  import FileTree from "./FileTree.svelte";
  import MdContent from "./MdContent.svelte";
  import TableOfContents from "./TableOfContents.svelte";

  let { cwd = "" } = $props();

  const CLAUDE_NAMES = new Set(["CLAUDE.md", ".claude"]);

  let tree = $state([]);
  let selectedPath = $state("");
  let headings = $state([]);
  let treeVisible = $state(true);
  let tocVisible = $state(true);
  let darkMode = $state(false);

  let claudeTree = $derived(tree.filter((n) => CLAUDE_NAMES.has(n.name)));
  let projectTree = $derived(tree.filter((n) => !CLAUDE_NAMES.has(n.name)));

  onMount(() => {
    const saved = localStorage.getItem("md-viewer-theme");
    if (saved === "dark") darkMode = true;
  });

  async function loadTree() {
    if (!cwd) return;
    try {
      const res = await fetch(`/api/md/tree?cwd=${encodeURIComponent(cwd)}`);
      const data = await res.json();
      tree = data.tree || [];

      // Auto-select root README.md if present
      if (!selectedPath) {
        const readme = tree.find((n) => !n.children && n.name.toLowerCase() === "readme.md");
        if (readme) selectedPath = readme.path;
      }
    } catch {
      tree = [];
    }
  }

  onMount(() => { loadTree(); });

  function selectFile(filePath) {
    selectedPath = filePath;
  }

  function toggleTheme() {
    darkMode = !darkMode;
    localStorage.setItem("md-viewer-theme", darkMode ? "dark" : "light");
  }
</script>

<div class="viewer" class:dark={darkMode}>
  <ViewerToolbar
    filePath={selectedPath}
    {treeVisible}
    {tocVisible}
    {darkMode}
    onToggleTree={() => treeVisible = !treeVisible}
    onToggleToc={() => tocVisible = !tocVisible}
    onToggleTheme={toggleTheme}
  />

  <div class="viewer-body">
    {#if treeVisible}
      <aside class="panel panel-tree">
        {#if claudeTree.length > 0}
          <div class="tree-section-title">Claude</div>
          <FileTree tree={claudeTree} {selectedPath} onSelectFile={selectFile} />
        {/if}
        {#if projectTree.length > 0}
          {#if claudeTree.length > 0}
            <div class="tree-section-divider"></div>
          {/if}
          <div class="tree-section-title">Project</div>
          <FileTree tree={projectTree} {selectedPath} onSelectFile={selectFile} />
        {/if}
      </aside>
    {/if}

    <MdContent {cwd} filePath={selectedPath} onHeadings={(h) => headings = h} />

    {#if tocVisible && headings.length > 0}
      <aside class="panel panel-toc">
        <TableOfContents {headings} />
      </aside>
    {/if}
  </div>
</div>

<style>
  .viewer {
    --viewer-bg: #faf8f5;
    --viewer-toolbar-bg: #f5f0ec;
    --viewer-sidebar-bg: #f0ebe6;
    --viewer-text: #2c2520;
    --viewer-text-muted: #6e655d;
    --viewer-text-faint: #a39a91;
    --viewer-border: #e0d8d0;
    --viewer-hover: rgba(0, 0, 0, 0.04);
    --viewer-active: rgba(0, 0, 0, 0.07);
    --viewer-code-bg: rgba(0, 0, 0, 0.04);
    --viewer-link: #3a75c4;
    --viewer-accent: #a84e31;
    --viewer-red: #c43c3c;

    --font-heading: 'Space Grotesk', sans-serif;
    --font-body: 'DM Sans', sans-serif;
    --font-reading: 'Inter', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;

    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--viewer-bg);
    color: var(--viewer-text);
    font-family: var(--font-body);
    font-size: 0.9375rem;
  }

  .viewer.dark {
    --viewer-bg: #1a1714;
    --viewer-toolbar-bg: #211e1a;
    --viewer-sidebar-bg: #1e1b17;
    --viewer-text: #e0d8d0;
    --viewer-text-muted: #948b82;
    --viewer-text-faint: #5c554e;
    --viewer-border: #302922;
    --viewer-hover: rgba(255, 255, 255, 0.04);
    --viewer-active: rgba(255, 255, 255, 0.07);
    --viewer-code-bg: rgba(255, 255, 255, 0.05);
    --viewer-link: #7aabef;
    --viewer-accent: #c15f3c;
    --viewer-red: #d95555;
  }

  .viewer-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .panel {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 20;
    flex-shrink: 0;
    overflow-y: auto;
    background: var(--viewer-sidebar-bg);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
  }

  .panel-tree {
    left: 0;
    width: 260px;
    border-right: 1px solid var(--viewer-border);
  }

  .panel-toc {
    right: 0;
    width: 220px;
    border-left: 1px solid var(--viewer-border);
  }

  .tree-section-title {
    padding: 10px 16px 2px;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--viewer-text-faint);
  }

  .tree-section-divider {
    height: 1px;
    margin: 6px 16px;
    background: var(--viewer-border);
  }

  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(*) {
    scrollbar-width: thin;
    scrollbar-color: var(--viewer-border) transparent;
  }
</style>
