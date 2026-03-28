<script>
  import AvatarSetEditor from "./AvatarSetEditor.svelte";

  let { onavatarchange } = $props();

  let sets = $state([]);
  let loading = $state(true);
  let error = $state("");
  let confirmDelete = $state(null);
  let editorMode = $state(null);
  let editorSet = $state(null);

  $effect(() => {
    fetchSets();
  });

  async function fetchSets() {
    loading = true;
    error = "";
    try {
      const res = await fetch("/api/avatars/sets");
      const data = await res.json();
      sets = data.sets;
    } catch {
      error = "Failed to load avatar sets";
    }
    loading = false;
  }

  async function switchSet(name) {
    try {
      const res = await fetch("/api/avatars/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: name }),
      });
      if (!res.ok) throw new Error("Failed to switch");
      sets = sets.map((s) => ({ ...s, active: s.name === name }));
      onavatarchange?.();
    } catch {
      error = "Failed to switch avatar set";
    }
  }

  async function confirmDeleteSet() {
    const name = confirmDelete;
    confirmDelete = null;
    try {
      const res = await fetch(`/api/avatars/sets/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      sets = sets.filter((s) => s.name !== name);
    } catch {
      error = "Failed to delete set";
    }
  }

  function thumbnailUrl(set) {
    const idleFile = set.files.find((f) => f.startsWith("idle"));
    if (!idleFile) return null;
    return `/api/avatars/sets/${encodeURIComponent(set.name)}/file/${idleFile}`;
  }

  function openEditor(mode, set = null) {
    editorMode = mode;
    editorSet = set;
  }

  function closeEditor() {
    editorMode = null;
    editorSet = null;
  }

  async function handleEditorSave() {
    closeEditor();
    await fetchSets();
    onavatarchange?.();
  }

  let activeSet = $derived(sets.find((s) => s.active));
  let activeThumb = $derived(activeSet ? thumbnailUrl(activeSet) : null);
  // Sort: default always last
  let sortedSets = $derived([...sets].sort((a, b) => {
    if (a.name === "default") return 1;
    if (b.name === "default") return -1;
    return 0;
  }));
</script>

{#if error}
  <div class="error-bar">{error}</div>
{/if}

{#if confirmDelete}
  <div class="confirm-bar">
    <span>Delete "{confirmDelete}"?</span>
    <div class="confirm-actions">
      <button class="confirm-yes" onclick={confirmDeleteSet}>Delete</button>
      <button class="confirm-no" onclick={() => confirmDelete = null}>Cancel</button>
    </div>
  </div>
{/if}

{#if activeSet}
  <section class="active-preview">
    <h3>Active</h3>
    <div class="active-card">
      <div class="active-thumb">
        {#if activeThumb}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            src={activeThumb}
            preload="auto"
            muted
            playsinline
            onloadeddata={(e) => { e.target.currentTime = 0.1; e.target.pause(); }}
          ></video>
        {/if}
      </div>
      <span class="active-name">{activeSet.name}</span>
    </div>
  </section>
{/if}

<section>
  <h3>All Sets</h3>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else}
    <div class="set-grid">
      <div
        class="set-card add-card"
        onclick={() => openEditor("create")}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditor("create"); } }}
        role="button"
        tabindex="0"
      >
        <div class="add-icon">+</div>
        <span class="set-name">Add New</span>
      </div>

      {#each sortedSets as set (set.name)}
        {@const thumb = thumbnailUrl(set)}
        {@const isDefault = set.name === "default"}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="set-card"
          class:active={set.active}
          onclick={() => switchSet(set.name)}
          onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchSet(set.name); } }}
          role="button"
          tabindex="0"
        >
          <div class="set-thumb">
            {#if thumb}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video
                src={thumb}
                preload="auto"
                muted
                playsinline
                onloadeddata={(e) => { e.target.currentTime = 0.1; e.target.pause(); }}
              ></video>
            {:else}
              <div class="no-thumb"></div>
            {/if}
          </div>
          <span class="set-name">{set.name}</span>
          {#if set.active}
            <span class="active-badge">Active</span>
          {/if}

          {#if !isDefault}
            <div class="card-actions">
              <button
                class="action-btn delete-action"
                onclick={(e) => { e.stopPropagation(); confirmDelete = set.name; }}
                aria-label="Delete {set.name}"
              ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1m2 0v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4h10Z"/></svg></button>
              <button
                class="action-btn edit-action"
                onclick={(e) => { e.stopPropagation(); openEditor("edit", set); }}
                aria-label="Edit {set.name}"
              ><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L5 13l-3 1 1-3Z"/></svg></button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if editorMode}
  <AvatarSetEditor
    mode={editorMode}
    set={editorSet}
    onclose={closeEditor}
    onsave={handleEditorSave}
  />
{/if}

<style>
  section h3 {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .muted {
    color: var(--text-muted);
    font-size: 13px;
  }

  .error-bar {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .confirm-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
  }

  .confirm-actions {
    display: flex;
    gap: 6px;
  }

  .confirm-yes {
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .confirm-yes:hover {
    background: #dc2626;
  }

  .confirm-no {
    background: none;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .confirm-no:hover {
    color: var(--text);
  }

  /* --- Active preview --- */

  .active-preview {
    margin-bottom: 4px;
  }

  .active-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg);
    border: 1px solid var(--brand);
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 0 0 1px rgba(193, 95, 60, 0.15);
  }

  .active-thumb {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--border);
    flex-shrink: 0;
  }

  .active-thumb video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .active-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  /* --- Set grid --- */

  .set-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }

  .set-card {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }

  .set-card:hover {
    border-color: var(--text-muted);
    background: var(--bg-card);
  }

  .set-card.active {
    border-color: var(--brand);
    box-shadow: 0 0 0 1px rgba(193, 95, 60, 0.15);
  }

  .set-thumb {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    overflow: hidden;
    background: var(--border);
  }

  .set-thumb video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-thumb {
    width: 100%;
    height: 100%;
    background: var(--border);
  }

  .set-name {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .active-badge {
    font-size: 10px;
    font-weight: 600;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* --- Add card --- */

  .add-card {
    border-style: dashed;
    justify-content: center;
    min-height: 100px;
  }

  .add-card:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: rgba(193, 95, 60, 0.06);
  }

  .add-icon {
    font-size: 28px;
    color: var(--text-muted);
    line-height: 1;
  }

  .add-card:hover .add-icon {
    color: var(--brand);
  }

  /* --- Hover action buttons --- */

  .card-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .set-card:hover .card-actions {
    opacity: 1;
  }

  .action-btn {
    background: rgba(0, 0, 0, 0.55);
    border: none;
    color: var(--text-muted);
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
  }

  .action-btn svg {
    width: 13px;
    height: 13px;
  }

  .delete-action:hover {
    color: #f87171;
    background: rgba(239, 68, 68, 0.25);
  }

  .edit-action:hover {
    color: var(--blue);
    background: rgba(91, 143, 217, 0.2);
  }
</style>
