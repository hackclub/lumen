<script lang="ts">
	import { onMount } from 'svelte';

	let videoEl: HTMLVideoElement;
	let currentTime = $state(0);
	let targetTime = $state(0);
	let ready = $state(false);
	let rafId: number;
	let lastSeekTime = 0;
	let initialSyncRafId = 0;

	const LERP_FACTOR = 0.3;
	const FIREFOX_SEEK_INTERVAL = 17;

	function lerp(start: number, end: number, factor: number): number {
		return start + (end - start) * factor;
	}

	function syncVideoToScroll(immediate = false) {
		if (!ready || !videoEl?.duration) return;

		const scrollY = window.scrollY;
		const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
		const progress = maxScroll > 0 ? Math.min(Math.max(scrollY / maxScroll, 0), 1) : 0;

		targetTime = progress * videoEl.duration;

		if (immediate) {
			currentTime = targetTime;
			videoEl.currentTime = currentTime;
		}
	}

	function queueInitialScrollSync() {
		requestAnimationFrame(() => {
			syncVideoToScroll(true);
			initialSyncRafId = requestAnimationFrame(() => {
				syncVideoToScroll(true);
			});
		});
	}

	async function forceFullBuffer(video: HTMLVideoElement) {
		// Fetch the entire video as a blob so it's fully in memory
		const res = await fetch(video.src);
		const blob = await res.blob();
		const objectUrl = URL.createObjectURL(blob);
		video.src = objectUrl;

		await new Promise<void>((resolve) => {
			video.addEventListener('loadedmetadata', () => resolve(), { once: true });
		});

		video.currentTime = 0;
		ready = true;
		syncVideoToScroll(true);
		queueInitialScrollSync();
	}

	function handleScroll() {
		syncVideoToScroll();
	}

	function animate() {
		if (ready && videoEl) {
			currentTime = lerp(currentTime, targetTime, LERP_FACTOR);

			if (Math.abs(currentTime - targetTime) > 0.001) {
				const now = performance.now();
				if ("fastSeek" in videoEl) {
					// fastSeek is generally only supported on Firefox, but it makes the movement MUCH smoother.
					// Rate-limit seeks on Firefox to avoid overwhelming the decoder.
					if (now - lastSeekTime >= FIREFOX_SEEK_INTERVAL) {
						videoEl.fastSeek(currentTime);
						lastSeekTime = now;
					}
				}
				else {
					(videoEl as HTMLVideoElement).currentTime = currentTime;
				}
			}
		}

		rafId = requestAnimationFrame(animate);
	}

	onMount(() => {
		forceFullBuffer(videoEl);

		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('load', queueInitialScrollSync);
		window.addEventListener('pageshow', queueInitialScrollSync);
		rafId = requestAnimationFrame(animate);

		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('load', queueInitialScrollSync);
			window.removeEventListener('pageshow', queueInitialScrollSync);
			cancelAnimationFrame(rafId);
			cancelAnimationFrame(initialSyncRafId);
		};
	});
</script>

<div
	class="fixed inset-0 -z-10 bg-no-repeat bg-cover"
>
	<video
		bind:this={videoEl}
		src="/video/lumen-bg-seekable.mp4"
		poster="/video/lumen-bg-poster.webp"
		muted
		playsinline
		preload="auto"
		class="h-full w-full object-cover"
	></video>
</div>
