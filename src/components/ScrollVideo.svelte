<script lang="ts">
	import { onMount } from 'svelte';

	let videoEl: HTMLVideoElement;
	let currentTime = $state(0);
	let targetTime = $state(0);
	let ready = $state(false);
	let rafId: number;
	let lastSeekTime = 0;
	let initialSyncRafId = 0;
	let seekableObjectUrl: string | null = null;

	const LERP_FACTOR = 0.3;
	const FIREFOX_SEEK_INTERVAL = 17;
	const DEFAULT_VIDEO_SRC = '/video/lumen-bg.mp4';
	const SEEKABLE_VIDEO_SRC = '/video/lumen-bg-seekable.mp4';

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

	function markReady() {
		ready = true;
		syncVideoToScroll(true);
		queueInitialScrollSync();
	}

	async function waitForMetadata(video: HTMLVideoElement) {
		if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;

		await new Promise<void>((resolve) => {
			video.addEventListener('loadedmetadata', () => resolve(), { once: true });
		});
	}

	async function loadSeekableVideo(video: HTMLVideoElement, signal: AbortSignal) {
		// Keep the lightweight default source attached to the element while the seekable video buffers in the background.
		const res = await fetch(SEEKABLE_VIDEO_SRC, { signal });
		const blob = await res.blob();
		const objectUrl = URL.createObjectURL(blob);

		if (signal.aborted) {
			URL.revokeObjectURL(objectUrl);
			return;
		}

		seekableObjectUrl = objectUrl;
		video.src = objectUrl;
		video.load();

		await waitForMetadata(video);

		if (signal.aborted) return;

		markReady();
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
		const controller = new AbortController();

		void waitForMetadata(videoEl).then(() => {
			if (!controller.signal.aborted) {
				markReady();
			}
		});

		void loadSeekableVideo(videoEl, controller.signal).catch((error) => {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			console.error('Failed to load seekable background video', error);
		});

		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('load', queueInitialScrollSync);
		window.addEventListener('pageshow', queueInitialScrollSync);
		rafId = requestAnimationFrame(animate);

		return () => {
			controller.abort();
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('load', queueInitialScrollSync);
			window.removeEventListener('pageshow', queueInitialScrollSync);
			cancelAnimationFrame(rafId);
			cancelAnimationFrame(initialSyncRafId);
			if (seekableObjectUrl) {
				URL.revokeObjectURL(seekableObjectUrl);
			}
		};
	});
</script>

<div
	class="fixed inset-0 -z-10 bg-no-repeat bg-cover"
>
	<video
		bind:this={videoEl}
		src={DEFAULT_VIDEO_SRC}
		poster="/video/lumen-bg-poster.webp"
		muted
		playsinline
		preload="auto"
		class="h-full w-full object-cover"
	></video>
</div>
