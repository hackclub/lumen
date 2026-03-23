<script lang="ts">
  import { onMount } from 'svelte';
  import { mountScrollFrameSequence } from '../../utils/scroll-frame-sequence';

  const VIDEO_SRC = '/video/lumen-bg.mp4';
  const POSTER_SRC = '/video/lumen-bg-poster.webp';

  let frameSrc = $state(POSTER_SRC);

  onMount(() => {
    return mountScrollFrameSequence({
      videoSrc: VIDEO_SRC,
      onFrameChange: (src) => {
        frameSrc = src;
      },
      onError: (error) => {
        console.error('Failed to build the guide hero frame sequence', error);
      }
    });
  });
</script>

<div class="guide-hero-media" aria-hidden="true">
  <img
    src={frameSrc}
    alt=""
    loading="eager"
    decoding="async"
    fetchpriority="high"
    class="guide-hero-media__image"
  />
  <div class="guide-hero-media__overlay"></div>
</div>

<style>
  .guide-hero-media {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    background: #120d15;
  }

  .guide-hero-media__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: none;
    opacity: 1;
  }

  .guide-hero-media__overlay {
    position: absolute;
    inset: 0;
    background: transparent;
  }
</style>
