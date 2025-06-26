
<script lang="ts">
  import { onMount } from 'svelte';

  let status = 'Loading...';

  onMount(async () => {
    try {
      const response = await fetch('/health');
      const data = await response.json();
      status = data.status;
    } catch (error) {
      status = 'Error';
    }
  });
</script>

<h1>KubeKavach Dashboard</h1>
<p>API Status: {status}</p>
