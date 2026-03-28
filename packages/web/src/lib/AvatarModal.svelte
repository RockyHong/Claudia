<script>
  import Modal from "./Modal.svelte";
  import AvatarTab from "./AvatarTab.svelte";

  let { onclose, onavatarchange } = $props();
</script>

<Modal title="Avatar" {onclose}>
  <AvatarTab {onavatarchange} />
</Modal>
