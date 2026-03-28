<script>
  let { message, confirmLabel = "Delete", onconfirm, oncancel } = $props();

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) oncancel();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="backdrop" onclick={handleBackdrop} onkeydown={() => {}} role="dialog" aria-modal="true" aria-label="Confirm">
  <div class="dialog">
    <p class="message">{message}</p>
    <div class="actions">
      <button class="cancel-btn" onclick={oncancel}>Cancel</button>
      <button class="confirm-btn" onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
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

  .dialog {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    font-family: var(--font-body);
    padding: 20px;
    width: 90%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: slideUp 0.2s ease;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .message {
    font-size: 14px;
    color: var(--text);
    margin: 0;
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

  .confirm-btn {
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .confirm-btn:hover {
    background: #dc2626;
  }
</style>
