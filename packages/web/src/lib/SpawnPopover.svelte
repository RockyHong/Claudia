<script>
  import Modal from "./Modal.svelte";

  let { onclose } = $props();

  let projects = $state([]);
  let loading = $state(true);
  let launching = $state(null);

  $effect(() => {
    fetchProjects();
  });

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      projects = data.projects || [];
    } catch {
      projects = [];
    }
    loading = false;
  }

  let browsing = $state(false);

  async function removeProject(projectPath) {
    try {
      await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: projectPath }),
      });
      projects = projects.filter((p) => p.path !== projectPath);
    } catch {
      // ignore
    }
  }

  async function launch(projectPath) {
    launching = projectPath;
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: projectPath }),
      });
      if (res.ok) {
        onclose();
      } else {
        launching = null;
      }
    } catch {
      launching = null;
    }
  }

  async function browse() {
    browsing = true;
    try {
      const res = await fetch("/api/browse", { method: "POST" });
      const data = await res.json();
      if (data.path) {
        await launch(data.path);
      }
    } catch {
      // cancelled or error
    }
    browsing = false;
  }
</script>

<Modal title="Launch session" {onclose}>
  {#if loading}
    <div class="empty">Loading...</div>
  {:else}
    {#if projects.length > 0}
      <div class="project-list">
        {#each projects as project}
          <div class="project-row">
            <button
              class="project-item"
              disabled={launching === project.path}
              onclick={() => launch(project.path)}
            >
              <span class="project-name">{project.name}</span>
              <span class="project-path">{project.path}</span>
            </button>
            <button
              class="remove-btn"
              title="Remove from history"
              onclick={() => removeProject(project.path)}
            >&times;</button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">No recent projects. Browse to launch a session.</div>
    {/if}

    <button class="browse-btn" disabled={browsing} onclick={browse}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      {browsing ? "Waiting for selection..." : "Browse folder..."}
    </button>
  {/if}
</Modal>

<style>
  .empty {
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
    padding: 8px 0;
  }

  .project-list {
    display: flex;
    flex-direction: column;
    margin: -4px -8px;
    max-height: 340px;
    overflow-y: auto;
  }

  .project-row {
    display: flex;
    align-items: center;
    border-radius: 8px;
    transition: background 0.1s;
  }

  .project-row:hover {
    background: var(--bg-raised);
  }

  .project-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-body);
  }

  .project-item:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .remove-btn {
    flex-shrink: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 16px;
    padding: 4px 10px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s, color 0.1s;
  }

  .project-row:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--amber);
  }

  .project-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .project-path {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .browse-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    background: none;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .browse-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .browse-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }
</style>
