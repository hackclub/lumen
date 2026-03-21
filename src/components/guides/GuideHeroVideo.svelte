<script lang="ts">
  import { onMount } from 'svelte';

  let videoEl: HTMLVideoElement;
  let currentTime = $state(0);
  let targetTime = $state(0);
  let ready = $state(false);
  let rafId = 0;
  let lastSeekTime = 0;

  const LERP_FACTOR = 0.3;
  const FIREFOX_SEEK_INTERVAL = 17;

  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const forceFullBuffer = async (video: HTMLVideoElement) => {
    const res = await fetch(video.src);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;

    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });

    video.currentTime = 0;
    ready = true;
  };

  const handleScroll = () => {
    if (!ready || !videoEl?.duration) return;

    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;

    const progress = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    targetTime = progress * videoEl.duration;
  };

  const animate = () => {
    if (ready && videoEl) {
      currentTime = lerp(currentTime, targetTime, LERP_FACTOR);

      if (Math.abs(currentTime - targetTime) > 0.001) {
        const now = performance.now();
        if ('fastSeek' in videoEl) {
          if (now - lastSeekTime >= FIREFOX_SEEK_INTERVAL) {
            videoEl.fastSeek(currentTime);
            lastSeekTime = now;
          }
        } else {
          videoEl.currentTime = currentTime;
        }
      }
    }

    rafId = requestAnimationFrame(animate);
  };

  onMount(() => {
    forceFullBuffer(videoEl);
    window.addEventListener('scroll', handleScroll, { passive: true });
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  });
</script>

<div class="guide-hero-media" aria-hidden="true">
  <video
    bind:this={videoEl}
    muted
    playsinline
    preload="auto"
    src="/video/lumen-bg-seekable.mp4"
    poster="/video/lumen-bg-poster.webp"
    class="guide-hero-media__video"
  ></video>
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

  .guide-hero-media__video {
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
