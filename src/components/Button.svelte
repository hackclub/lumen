<script>
  import { onMount } from 'svelte';

  export let href = '#';
  export let bob = false;
  let cls = '';
  export { cls as class };

  let wrap;

  onMount(() => {
    if (wrap) {
      wrap.style.animationPlayState = 'running';
    }
  });
</script>

<div class="mt-8 flex justify-center button-pop-wrap" bind:this={wrap}>
  <a
    {href}
    target="_blank"
    class="group inline-block relative border-none bg-none p-0 cursor-pointer font-[Minecraftia,monospace] text-2xl text-white no-underline [text-shadow:3px_3px_0_#1F102B] [image-rendering:pixelated] button-pop {cls}"
    class:bobbing={bob}
  >
    <img
      src="/img/button-normal.png"
      alt=""
      class="block [zoom:3] [image-rendering:pixelated] group-hover:hidden group-active:hidden"
      draggable="false"
    />
    <img
      src="/img/button-hover.png"
      alt=""
      class="hidden [zoom:3] [image-rendering:pixelated] group-hover:block group-active:hidden"
      draggable="false"
    />
    <img
      src="/img/button-pressed.png"
      alt=""
      class="hidden [zoom:3] [image-rendering:pixelated] group-active:block"
      draggable="false"
    />
    <span class="absolute inset-0 flex items-center justify-center pointer-events-none [text-shadow:3px_3px_0_#1F102B] translate-y-1.5 group-active:translate-y-2.5">
      <slot />
    </span>
  </a>
</div>

<style>
  .bobbing {
    animation: button-bob 2s ease-in-out infinite;
  }

  @keyframes button-bob {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-12px);
    }
  }
</style>
