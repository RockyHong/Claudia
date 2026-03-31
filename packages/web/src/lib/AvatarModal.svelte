<script>
let { onclose, onavatarchange } = $props();
</script>

<Modal title="Avatar" {onclose}>
  <AvatarTab {onavatarchange} />
</Modal>
