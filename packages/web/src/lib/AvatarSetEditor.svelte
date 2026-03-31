<script>
import { Upload } from "lucide-svelte";
import DropZone from "./DropZone.svelte";
import Modal from "./Modal.svelte";
import Tooltip from "./Tooltip.svelte";

let {
	mode = "create",
	set = null,
	onclose,
	onsave,
	onimport,
	importing = false,
} = $props();

let name = $state(mode === "edit" ? (set?.name ?? "") : "");
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
		: name.trim() &&
				(name.trim() !== set?.name || fileIdle || fileBusy || filePending),
);

let title = $derived(
	mode === "edit" ? `Edit "${set?.name}"` : "New Avatar Set",
);

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

			const res = await fetch(
				`/api/avatars/sets/${encodeURIComponent(name.trim())}`,
				{
					method: "POST",
					body: form,
				},
			);
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
				if (filePending)
					form.append("pending", filePending, `pending${ext(filePending)}`);
				if (renamed) form.append("rename", name.trim());

				const res = await fetch(
					`/api/avatars/sets/${encodeURIComponent(set.name)}`,
					{
						method: "PUT",
						body: form,
					},
				);
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					throw new Error(data.error || "Update failed");
				}
			} else if (renamed) {
				const res = await fetch(
					`/api/avatars/sets/${encodeURIComponent(set.name)}`,
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ rename: name.trim() }),
					},
				);
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					throw new Error(data.error || "Rename failed");
				}
			}
		}

		onsave?.(name.trim());
	} catch (err) {
		error = err.message;
	}
	saving = false;
}

function ext(file) {
	return file.name.endsWith(".mp4") ? ".mp4" : ".webm";
}

function handleKeydown(e) {
	if (e.key === "Escape") {
		e.stopPropagation();
		onclose();
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal title={title} onclose={onclose}>
  {#snippet children()}
    {#if error}
      <div class="error-bar">{error}</div>
    {/if}

    <fieldset class="field-group">
      <legend class="field-label">Name</legend>
      <input
        class="name-input"
        type="text"
        bind:value={name}
        placeholder="Your avatar name"
        maxlength="50"
      />
    </fieldset>

    <fieldset class="field-group">
      <legend class="field-label">Videos <span class="format-hint">.webm .mp4</span></legend>
      <div class="drop-grid">
        <DropZone label="Idle" file={fileIdle} previewUrl={existingUrl("idle")} onfile={(f) => fileIdle = f} />
        <DropZone label="Working" file={fileBusy} previewUrl={existingUrl("busy")} onfile={(f) => fileBusy = f} />
        <DropZone label="Waiting" file={filePending} previewUrl={existingUrl("pending")} onfile={(f) => filePending = f} />
      </div>
    </fieldset>

    <div class="actions">
      {#if mode === "create" && onimport}
        <Tooltip text="Import from .claudia file">
          <button class="import-btn" onclick={onimport} disabled={importing}>
            <Upload size={14} strokeWidth={1.5} />
            {importing ? "Importing..." : "Import"}
          </button>
        </Tooltip>
      {/if}
      <div class="actions-right">
        <button class="cancel-btn" onclick={onclose}>Cancel</button>
        <button class="save-btn" onclick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving..." : mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .field-group {
    border: none;
    margin: 0;
    padding: 0;
  }

  .field-label {
    font-size: var(--text-xs);
    font-weight: 600;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: var(--space-2);
    padding: 0;
  }

  .format-hint {
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    opacity: 0.6;
  }

  .error-bar {
    background: rgba(217, 85, 85, 0.12);
    border: 1px solid rgba(217, 85, 85, 0.3);
    color: var(--red);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .name-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    color: var(--text);
    font-size: var(--text-sm);
    font-family: var(--font-body);
    outline: none;
    transition: border-color var(--duration-normal) var(--ease-in-out);
    width: 100%;
  }

  .name-input:focus {
    border-color: var(--brand);
  }

  .drop-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 130px));
    gap: var(--space-2);
    justify-content: center;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .actions-right {
    display: flex;
    gap: var(--space-2);
  }

  .import-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .import-btn:hover:not(:disabled) {
    background: rgba(193, 95, 60, 0.06);
    color: var(--brand);
    border-color: var(--brand);
  }

  .import-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .cancel-btn:hover {
    background: var(--bg-raised);
    color: var(--text);
    border-color: var(--border-active);
  }

  .save-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    min-height: 28px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: all var(--duration-normal) var(--ease-in-out);
  }

  .save-btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
