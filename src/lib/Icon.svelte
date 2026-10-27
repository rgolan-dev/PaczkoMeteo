<script lang="ts">
  let { name, size = 24, class: className = '' }: { name: string; size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={className}>
  {#if name === 'sun'}
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>
  {:else if name === 'partly'}
    <circle cx="9" cy="8" r="4"/><path d="M9 1v1M2 8H1m3-5L3 2m12 1 1-1M5 21h13a4 4 0 0 0 0-8 6 6 0 0 0-11-1 4.5 4.5 0 0 0-2 9Z"/>
  {:else if ['cloud', 'rain', 'snow', 'storm'].includes(name)}
    <path d="M5 16h13a4 4 0 0 0 0-8A6 6 0 0 0 7 7a4.5 4.5 0 0 0-2 9Z"/>
    {#if name === 'rain'}<path d="m7 19-1 2m6-2-1 2m6-2-1 2"/>{:else if name === 'snow'}<path d="M7 20h.01M12 20h.01M17 20h.01"/>{:else if name === 'storm'}<path d="m13 17-3 4h4l-2 3"/>{/if}
  {:else if name === 'mist'}<path d="M4 7h16M2 12h20M4 17h16"/>
  {:else if name === 'pin'}<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>
  {:else if name === 'arrow'}<path d="M5 12h14m-5-5 5 5-5 5"/>
  {:else if name === 'chevron'}<path d="m9 5 7 7-7 7"/>
  {:else if name === 'refresh'}<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>
  {:else if name === 'drop'}<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>
  {:else if name === 'wind'}<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a3 3 0 1 1-3 3"/>
  {:else if name === 'gauge'}<path d="M4 19a9 9 0 1 1 16 0H4Z"/><path d="m12 14 4-5M5 11l2 1m10 0 2-1M12 5v2"/>
  {:else if name === 'thermometer'}<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z"/><path d="M12 9v9"/>
  {:else if name === 'leaf'}<path d="M20 3C8 2 2 7 5 14c3 7 15 5 15-11Z"/><path d="m4 21 11-12"/>
  {:else if name === 'box'}<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M12 3v18M4 15h16m-2-9h1m-1 6h1m-1 6h1"/>
  {:else if name === 'download'}<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>
  {:else if name === 'close'}<path d="m6 6 12 12M6 18 18 6"/>
  {:else if name === 'external'}<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>
  {:else if name === 'info'}<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>
  {:else if name === 'offline'}<path d="m2 2 20 20M3 9a15 15 0 0 1 3-2m4-1a15 15 0 0 1 11 3M6 13a10 10 0 0 1 4-2m5 0a10 10 0 0 1 3 2M9 17a5 5 0 0 1 6 0m-3 4h.01"/>
  {:else if name === 'sunrise'}<path d="M3 18h18M5 14h14M8 14a4 4 0 0 1 8 0M12 2v5m-3-2 3-3 3 3M3 10l2 1m14 0 2-1"/>
  {:else if name === 'sunset'}<path d="M3 18h18M5 14h14M8 14a4 4 0 0 1 8 0M12 2v5m-3-2 3 3 3-3M3 10l2 1m14 0 2-1"/>
  {/if}
</svg>
