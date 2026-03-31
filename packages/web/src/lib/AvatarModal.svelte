<script>
import AvatarTab from "./AvatarTab.svelte";
import Modal from "./Modal.svelte";

let { onclose, onavatarchange } = $props();
</script>

<Modal title="Avatar" {onclose}>
  <AvatarTab {onavatarchange} />
</Modal>
