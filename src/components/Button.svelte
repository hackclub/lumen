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

<div class="button-pop-wrap" bind:this={wrap}>
  <a
    {href}
    target="_blank"
    rel="noreferrer"
    class="button-pop {cls}"
    class:bobbing={bob}
  >
    <img
      src="/img/button-normal.png"
      alt=""
      class="button-pop__sprite button-pop__sprite--normal"
      draggable="false"
    />
    <img
      src="/img/button-hover.png"
      alt=""
      class="button-pop__sprite button-pop__sprite--hover"
      draggable="false"
    />
    <img
      src="/img/button-pressed.png"
      alt=""
      class="button-pop__sprite button-pop__sprite--pressed"
      draggable="false"
    />
    <span class="button-pop__label">
      <slot />
    </span>
  </a>
</div>

<style>
  @font-face {
    font-family: "Minecraftia";
    src: url("/fonts/Minecraftia.ttf") format("truetype");
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  .button-pop-wrap {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
    transform: scale(0);
    animation: logo-pop 0.3s steps(6) 0.25s forwards;
    animation-play-state: paused;
  }

  .button-pop {
    position: relative;
    display: inline-block;
    border: none;
    padding: 0;
    color: white;
    text-decoration: none;
    cursor: pointer;
    image-rendering: pixelated;
    text-shadow: 3px 3px 0 #1f102b;
    font-family: "Minecraftia", monospace;
    font-size: 1.5rem;
    line-height: 1;
  }

  .button-pop__sprite {
    display: block;
    width: 100%;
    min-width: fit-content;
    image-rendering: pixelated;
    zoom: 3;
  }

  .button-pop__sprite--hover,
  .button-pop__sprite--pressed {
    display: none;
  }

  .button-pop:hover .button-pop__sprite--normal {
    display: none;
  }

  .button-pop:hover .button-pop__sprite--hover {
    display: block;
  }

  .button-pop:active .button-pop__sprite--normal,
  .button-pop:active .button-pop__sprite--hover {
    display: none;
  }

  .button-pop:active .button-pop__sprite--pressed {
    display: block;
  }

  .button-pop__label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transform: translateY(0.375rem);
  }

  .button-pop:active .button-pop__label {
    transform: translateY(0.625rem);
  }

  .bobbing {
    animation: button-bob 2s ease-in-out infinite;
  }

  @keyframes logo-pop {
    0% {
      transform: scale(0);
    }
    60% {
      transform: scale(1.15);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes button-bob {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-12px);
    }
  }

  @media (max-width: 40rem) {
    .button-pop__label {
      font-size: 1.25rem;
    }
  }

  @media (max-width: 15rem) {
    .button-pop__label {
      font-size: 1rem;
    }
  }
</style>
