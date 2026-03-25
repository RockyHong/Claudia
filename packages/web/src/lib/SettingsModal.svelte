<script>
  let { onclose, onavatarchange, sfx } = $props();

  let sfxVolume = $state(0.5);

  $effect(() => {
    if (sfx) {
      sfxVolume = sfx.muted ? 0 : sfx.volume;
    }
  });

  let sets = $state([]);
  let loading = $state(true);
  let error = $state("");
  let uploading = $state(false);
  let confirmDelete = $state(null);

  // Upload form state
  let newSetName = $state("");
  let fileIdle = $state(null);
  let fileBusy = $state(null);
  let filePending = $state(null);

  $effect(() => {
    fetchSets();
    function onKey(e) {
      if (e.key === "Escape") onclose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  async function uploadSet() {
    if (!newSetName.trim()) { error = "Enter a set name"; return; }
    if (!fileIdle && !fileBusy && !filePending) { error = "Select at least one video"; return; }

    uploading = true;
    error = "";

    function ext(file) { return file.name.endsWith(".mp4") ? ".mp4" : ".webm"; }
    const form = new FormData();
    if (fileIdle) form.append("idle", fileIdle, `idle${ext(fileIdle)}`);
    if (fileBusy) form.append("busy", fileBusy, `busy${ext(fileBusy)}`);
    if (filePending) form.append("pending", filePending, `pending${ext(filePending)}`);

    try {
      const res = await fetch(`/api/avatars/sets/${encodeURIComponent(newSetName.trim())}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      newSetName = "";
      fileIdle = null;
      fileBusy = null;
      filePending = null;
      await fetchSets();
    } catch (err) {
      error = err.message;
    }
    uploading = false;
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function thumbnailUrl(set) {
    const idleFile = set.files.find((f) => f.startsWith("idle"));
    if (!idleFile) return null;
    return `/api/avatars/sets/${encodeURIComponent(set.name)}/file/${idleFile}`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" onclick={handleBackdrop} onkeydown={() => {}} role="dialog" aria-modal="true" aria-label="Settings">
  <div class="modal">
    <div class="modal-header">
      <h2>Settings</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
    </div>

    <div class="modal-body">
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

      <section>
        <h3>Avatar Sets</h3>

        {#if loading}
          <p class="muted">Loading...</p>
        {:else if sets.length === 0}
          <p class="muted">No avatar sets found. Upload one below.</p>
        {:else}
          <div class="set-grid">
            {#each sets as set (set.name)}
              {@const thumb = thumbnailUrl(set)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="set-card"
                class:active={set.active}
                onclick={() => switchSet(set.name)}
                onkeydown={(e) => { if (e.key === "Enter") switchSet(set.name); }}
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
                {#if !set.active}
                  <button
                    class="delete-btn"
                    onclick={(e) => { e.stopPropagation(); confirmDelete = set.name; }}
                    aria-label="Delete {set.name}"
                  >&times;</button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <h3>Sound Effects</h3>
        <div class="sfx-controls">
          <label class="sfx-volume">
            <span>{sfxVolume === 0 ? "Off" : `${Math.round(sfxVolume * 100)}%`}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sfxVolume}
              oninput={(e) => {
                sfxVolume = +e.target.value;
              }}
              onchange={(e) => {
                sfxVolume = +e.target.value;
                sfx.volume = sfxVolume || 0.01;
                sfx.muted = sfxVolume === 0;
                if (sfxVolume > 0) sfx.preview("pending");
              }}
            />
          </label>
        </div>
      </section>

      <details class="upload-section">
        <summary>Upload New Set</summary>
        <div class="upload-content">
          <input
            class="set-name-input"
            type="text"
            bind:value={newSetName}
            placeholder="Set name"
            maxlength="50"
          />
          <div class="file-fields">
            <label class="file-field">
              <span>Idle</span>
              <input type="file" accept=".webm,.mp4" onchange={(e) => fileIdle = e.target.files[0]} />
              {#if fileIdle}<span class="file-name">{fileIdle.name}</span>{/if}
            </label>
            <label class="file-field">
              <span>Busy</span>
              <input type="file" accept=".webm,.mp4" onchange={(e) => fileBusy = e.target.files[0]} />
              {#if fileBusy}<span class="file-name">{fileBusy.name}</span>{/if}
            </label>
            <label class="file-field">
              <span>Pending</span>
              <input type="file" accept=".webm,.mp4" onchange={(e) => filePending = e.target.files[0]} />
              {#if filePending}<span class="file-name">{filePending.name}</span>{/if}
            </label>
          </div>
          <button class="upload-btn" onclick={uploadSet} disabled={uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </details>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.2s ease;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-size: 16px;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 22px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  section h3 {
    font-size: 12px;
    font-weight: 600;
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

  /* --- Avatar set grid --- */

  .set-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }

  .set-card {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }

  .set-card:hover {
    border-color: var(--text-muted);
    background: var(--card-bg);
  }

  .set-card.active {
    border-color: var(--blue);
    box-shadow: 0 0 0 1px var(--blue);
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
    font-size: 12px;
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

  .delete-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: var(--text-muted);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }

  .set-card:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: #f87171;
    background: rgba(239, 68, 68, 0.2);
  }

  /* --- SFX controls --- */

  .sfx-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sfx-volume {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .sfx-volume span {
    min-width: 32px;
    text-align: right;
  }

  .sfx-volume input[type="range"] {
    flex: 1;
    accent-color: var(--blue);
    height: 4px;
  }

  /* --- Upload form --- */

  .upload-section {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .upload-section summary {
    cursor: pointer;
    list-style: none;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .upload-section summary::-webkit-details-marker {
    display: none;
  }

  .upload-section summary::after {
    content: " +";
  }

  .upload-section[open] summary::after {
    content: " −";
  }

  .upload-content {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .set-name-input {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .set-name-input:focus {
    border-color: var(--blue);
  }

  .file-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .file-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: var(--bg);
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 12px 8px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .file-field:hover {
    border-color: var(--text-muted);
  }

  .file-field span {
    font-size: 11px;
    color: var(--text-muted);
  }

  .file-field input[type="file"] {
    display: none;
  }

  .file-name {
    font-size: 10px;
    color: var(--blue);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80px;
  }

  .upload-btn {
    background: var(--blue);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
    align-self: flex-end;
  }

  .upload-btn:hover {
    opacity: 0.9;
  }

  .upload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
