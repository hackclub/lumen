<script lang="ts">
	import { onMount } from 'svelte';
	import { mountScrollFrameSequence } from '../utils/scroll-frame-sequence';

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
				console.error('Failed to build the background frame sequence', error);
			},
		});
	});
</script>

<div class="fixed inset-0 -z-10 bg-no-repeat bg-cover">
	<img
		src={frameSrc}
		alt=""
		aria-hidden="true"
		loading="eager"
		decoding="async"
		fetchpriority="high"
		class="h-full w-full object-cover"
	/>
</div>
