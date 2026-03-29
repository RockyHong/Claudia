<script>
  let { message, confirmLabel = "Delete", variant = "danger", onconfirm, oncancel } = $props();

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
    <p class="message">{@html message}</p>
    <div class="actions">
      <button class="cancel-btn" onclick={oncancel}>Cancel</button>
      <button class="confirm-btn {variant}" onclick={onconfirm}>{confirmLabel}</button>
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
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    font-family: var(--font-body);
    padding: var(--space-5);
    width: 90%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    animation: slideUp 0.2s ease;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .message {
    font-size: var(--text-sm);
    color: var(--text);
    margin: 0;
  }

  .message :global(code) {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--bg-raised);
    padding: 1px var(--space-1);
    border-radius: var(--radius-xs);
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
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

  .confirm-btn {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
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

  .confirm-btn.danger {
    background: var(--red);
  }

  .confirm-btn.danger:hover {
    background: #c43c3c;
  }

  .confirm-btn.neutral {
    background: var(--brand);
  }

  .confirm-btn.neutral:hover {
    background: var(--brand-hover);
  }
</style>
