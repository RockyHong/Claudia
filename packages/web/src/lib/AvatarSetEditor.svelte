<script>
  import DropZone from "./DropZone.svelte";

  let { mode = "create", set = null, onclose, onsave } = $props();

  let name = $state(mode === "edit" ? set?.name ?? "" : "");
  let fileIdle = $state(null);
  let fileBusy = $state(null);
  let filePending = $state(null);
  let error = $state("");
  let saving = $state(false);

  // In edit mode, build preview URLs from existing set files
  function existingUrl(state) {
    if (mode !== "edit" || !set) return null;
    const file = set.files.find((f) => f.startsWith(state));
    if (!file) return null;
    return `/api/avatars/sets/${encodeURIComponent(set.name)}/file/${file}`;
  }

  let canSave = $derived(
    mode === "create"
      ? name.trim() && fileIdle && fileBusy && filePending
      : name.trim() && (
          name.trim() !== set?.name ||
          fileIdle || fileBusy || filePending
        )
  );

  let title = $derived(mode === "edit" ? `Edit "${set?.name}"` : "New Avatar Set");

  async function handleSave() {
    if (!canSave || saving) return;
    saving = true;
    error = "";

    try {
      if (mode === "create") {
        const form = new FormData();
        form.append("idle", fileIdle, `idle${ext(fileIdle)}`);
        form.append("busy", fileBusy, `busy${ext(fileBusy)}`);
        form.append("pending", filePending, `pending${ext(filePending)}`);

        const res = await fetch(`/api/avatars/sets/${encodeURIComponent(name.trim())}`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
      } else {
        // Edit mode — send only changes
        const hasFiles = fileIdle || fileBusy || filePending;
        const renamed = name.trim() !== set.name;

        if (hasFiles) {
          const form = new FormData();
          if (fileIdle) form.append("idle", fileIdle, `idle${ext(fileIdle)}`);
          if (fileBusy) form.append("busy", fileBusy, `busy${ext(fileBusy)}`);
          if (filePending) form.append("pending", filePending, `pending${ext(filePending)}`);
          if (renamed) form.append("rename", name.trim());

          const res = await fetch(`/api/avatars/sets/${encodeURIComponent(set.name)}`, {
            method: "PUT",
            body: form,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Update failed");
          }
        } else if (renamed) {
          const res = await fetch(`/api/avatars/sets/${encodeURIComponent(set.name)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rename: name.trim() }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Rename failed");
          }
        }
      }

      onsave?.();
    } catch (err) {
      error = err.message;
    }
    saving = false;
  }

  function ext(file) {
    return file.name.endsWith(".mp4") ? ".mp4" : ".webm";
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="backdrop" onclick={handleBackdrop} onkeydown={() => {}} role="dialog" aria-modal="true" aria-label={title}>
  <div class="editor-modal">
    <div class="editor-header">
      <button class="back-btn" onclick={onclose} aria-label="Back">&larr;</button>
      <h2>{title}</h2>
    </div>

    <div class="editor-body">
      {#if error}
        <div class="error-bar">{error}</div>
      {/if}

      <input
        class="name-input"
        type="text"
        bind:value={name}
        placeholder="Set name"
        maxlength="50"
      />

      <div class="drop-grid">
        <DropZone label="Idle" file={fileIdle} previewUrl={existingUrl("idle")} onfile={(f) => fileIdle = f} />
        <DropZone label="Busy" file={fileBusy} previewUrl={existingUrl("busy")} onfile={(f) => fileBusy = f} />
        <DropZone label="Pending" file={filePending} previewUrl={existingUrl("pending")} onfile={(f) => filePending = f} />
      </div>

      <div class="actions">
        <button class="cancel-btn" onclick={onclose}>Cancel</button>
        <button class="save-btn" onclick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving..." : mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgba(10, 8, 7, 0.7);
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

  .editor-modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    font-family: var(--font-body);
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

  .editor-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .editor-header h2 {
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-heading);
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    transition: color 0.15s;
  }

  .back-btn:hover {
    color: var(--text);
  }

  .editor-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .error-bar {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .name-input {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--text);
    font-size: 13px;
    font-family: var(--font-body);
    outline: none;
    transition: border-color 0.15s;
  }

  .name-input:focus {
    border-color: var(--blue);
  }

  .drop-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .cancel-btn {
    background: none;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .cancel-btn:hover {
    color: var(--text);
    border-color: var(--border-active);
  }

  .save-btn {
    background: var(--brand);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: var(--brand-hover);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
