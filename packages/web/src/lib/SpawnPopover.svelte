<script>
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

  function handleKeydown(e) {
    if (e.key === "Escape") onclose();
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdropClick}></div>
<div class="popover">
    <div class="popover-header">
      <span class="popover-title">Launch session</span>
    </div>

    {#if loading}
      <div class="popover-empty">Loading...</div>
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
      {/if}
      <div class="popover-footer">
        <button class="browse-btn" disabled={browsing} onclick={browse}>
          {browsing ? "Waiting for selection..." : "Browse folder..."}
        </button>
      </div>
    {/if}
  </div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .popover {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 8px;
    width: 100%;
    z-index: 101;
    max-height: 400px;
    background: var(--bg-card, var(--card-bg));
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
  }

  .popover-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  .popover-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .popover-empty {
    padding: 24px 14px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
  }

  .project-list {
    overflow-y: auto;
    max-height: 340px;
  }

  .project-row {
    display: flex;
    align-items: center;
  }

  .project-row:hover {
    background: var(--border);
  }

  .project-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding: 10px 14px;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
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
    color: var(--orange);
  }

  .project-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .project-path {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .popover-footer {
    padding: 8px;
    border-top: 1px solid var(--border);
  }

  .browse-btn {
    width: 100%;
    padding: 8px 14px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    background: none;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.1s;
  }

  .browse-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  .browse-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }
</style>
