const DEFAULT_FRAME_RATE = 60;
const DEFAULT_FRAME_QUALITY = 0.72;
const PREFERRED_FRAME_TYPES = ['image/avif', 'image/webp'] as const;
const EXTRACTION_YIELD_INTERVAL = 4;
const MAX_DEVICE_PIXEL_RATIO = 1.25;
const FRAME_PRESENTATION_STYLE = 'position:fixed;inset:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';

type VideoFrameRequestable = HTMLVideoElement & {
	requestVideoFrameCallback?: (
		callback: (now: DOMHighResTimeStamp, metadata: { mediaTime: number }) => void,
	) => number;
	cancelVideoFrameCallback?: (handle: number) => void;
};

export type ScrollFrameSequenceOptions = {
	videoSrc: string;
	fps?: number;
	quality?: number;
	onFrameChange: (src: string) => void;
	onReadyChange?: (ready: boolean) => void;
	onError?: (error: unknown) => void;
};

function makeAbortError(): DOMException {
	return new DOMException('The operation was aborted.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw makeAbortError();
	}
}

function waitForMetadata(video: HTMLVideoElement, signal: AbortSignal) {
	if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
		return Promise.resolve();
	}

	return new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(makeAbortError());
		};
		const onLoadedMetadata = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(video.error ?? new Error('Failed to load background video metadata.'));
		};
		const cleanup = () => {
			signal.removeEventListener('abort', onAbort);
			video.removeEventListener('loadedmetadata', onLoadedMetadata);
			video.removeEventListener('error', onError);
		};

		signal.addEventListener('abort', onAbort, { once: true });
		video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
		video.addEventListener('error', onError, { once: true });
	});
}

function waitForPresentedFrame(video: HTMLVideoElement, signal: AbortSignal) {
	const frameVideo = video as VideoFrameRequestable;
	if (!frameVideo.requestVideoFrameCallback) {
		return nextAnimationFrame(signal);
	}

	return new Promise<void>((resolve, reject) => {
		let callbackId = 0;

		const onAbort = () => {
			cleanup();
			reject(makeAbortError());
		};
		const onError = () => {
			cleanup();
			reject(video.error ?? new Error('Failed while waiting for a decoded background frame.'));
		};
		const onFrame = () => {
			cleanup();
			resolve();
		};
		const cleanup = () => {
			signal.removeEventListener('abort', onAbort);
			video.removeEventListener('error', onError);
			if (callbackId && frameVideo.cancelVideoFrameCallback) {
				frameVideo.cancelVideoFrameCallback(callbackId);
			}
		};

		signal.addEventListener('abort', onAbort, { once: true });
		video.addEventListener('error', onError, { once: true });
		callbackId = frameVideo.requestVideoFrameCallback(onFrame);
	});
}

async function seekVideo(video: HTMLVideoElement, time: number, signal: AbortSignal) {
	throwIfAborted(signal);

	const clampedTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));
	if (
		Math.abs(video.currentTime - clampedTime) < 0.0001 &&
		video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
	) {
		await waitForPresentedFrame(video, signal);
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(makeAbortError());
		};
		const onSeeked = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(video.error ?? new Error('Failed while seeking the background video.'));
		};
		const cleanup = () => {
			signal.removeEventListener('abort', onAbort);
			video.removeEventListener('seeked', onSeeked);
			video.removeEventListener('error', onError);
		};

		signal.addEventListener('abort', onAbort, { once: true });
		video.addEventListener('seeked', onSeeked, { once: true });
		video.addEventListener('error', onError, { once: true });
		video.currentTime = clampedTime;
	});

	await waitForPresentedFrame(video, signal);
}

function nextAnimationFrame(signal: AbortSignal) {
	throwIfAborted(signal);

	return new Promise<void>((resolve, reject) => {
		const rafId = requestAnimationFrame(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		});
		const onAbort = () => {
			cancelAnimationFrame(rafId);
			signal.removeEventListener('abort', onAbort);
			reject(makeAbortError());
		};

		signal.addEventListener('abort', onAbort, { once: true });
	});
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number, signal: AbortSignal) {
	throwIfAborted(signal);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (signal.aborted) {
				reject(makeAbortError());
				return;
			}
			if (!blob) {
				reject(new Error(`Failed to encode a frame as ${type}.`));
				return;
			}
			resolve(blob);
		}, type, quality);
	});
}

async function pickFrameMimeType(
	canvas: HTMLCanvasElement,
	quality: number,
	signal: AbortSignal,
) {
	for (const type of PREFERRED_FRAME_TYPES) {
		const blob = await canvasToBlob(canvas, type, quality, signal);
		if (blob.type === type) {
			return type;
		}
	}

	return 'image/webp';
}

function getExtractionDimensions(video: HTMLVideoElement) {
	const viewportWidth = Math.max(1, Math.ceil(window.innerWidth * Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)));
	const viewportHeight = Math.max(1, Math.ceil(window.innerHeight * Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)));
	const scale = Math.min(
		1,
		Math.max(viewportWidth / Math.max(1, video.videoWidth), viewportHeight / Math.max(1, video.videoHeight)),
	);

	return {
		width: Math.max(1, Math.round(video.videoWidth * scale)),
		height: Math.max(1, Math.round(video.videoHeight * scale)),
	};
}

function getScrollProgress() {
	const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
	if (maxScroll <= 0) {
		return 0;
	}

	return Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
}

async function extractFrames(
	video: HTMLVideoElement,
	signal: AbortSignal,
	{ fps, quality }: { fps: number; quality: number },
) {
	const { width, height } = getExtractionDimensions(video);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext('2d', { alpha: false });
	if (!context) {
		throw new Error('Could not create a 2D context for frame extraction.');
	}
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';

	await seekVideo(video, 0, signal);
	context.drawImage(video, 0, 0, width, height);

	const frameMimeType = await pickFrameMimeType(canvas, quality, signal);
	const frameCount = Math.max(1, Math.round(video.duration * fps));
	const frameUrls: string[] = [];

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
		const frameTime = Math.min(frameIndex / fps, Math.max(0, video.duration - 0.001));

		await seekVideo(video, frameTime, signal);
		context.drawImage(video, 0, 0, width, height);

		const blob = await canvasToBlob(canvas, frameMimeType, quality, signal);
		frameUrls.push(URL.createObjectURL(blob));

		if ((frameIndex + 1) % EXTRACTION_YIELD_INTERVAL === 0) {
			await nextAnimationFrame(signal);
		}
	}

	return frameUrls;
}

export function mountScrollFrameSequence({
	videoSrc,
	fps = DEFAULT_FRAME_RATE,
	quality = DEFAULT_FRAME_QUALITY,
	onFrameChange,
	onReadyChange,
	onError,
}: ScrollFrameSequenceOptions) {
	const controller = new AbortController();
	const { signal } = controller;
	let frameUrls: string[] = [];
	let initialSyncRafId = 0;
	let currentFrameIndex = -1;
	let videoObjectUrl: string | null = null;
	let extractionVideo: HTMLVideoElement | null = null;

	const syncFrameToScroll = () => {
		if (!frameUrls.length) {
			return;
		}

		const nextFrameIndex = Math.min(
			frameUrls.length - 1,
			Math.round(getScrollProgress() * (frameUrls.length - 1)),
		);

		if (nextFrameIndex === currentFrameIndex) {
			return;
		}

		currentFrameIndex = nextFrameIndex;
		onFrameChange(frameUrls[currentFrameIndex]);
	};

	const queueInitialScrollSync = () => {
		requestAnimationFrame(() => {
			syncFrameToScroll();
			initialSyncRafId = requestAnimationFrame(syncFrameToScroll);
		});
	};

	const start = async () => {
		const response = await fetch(videoSrc, { signal });
		if (!response.ok) {
			throw new Error(`Failed to fetch ${videoSrc}: ${response.status} ${response.statusText}`);
		}

		const blob = await response.blob();
		throwIfAborted(signal);

		videoObjectUrl = URL.createObjectURL(blob);

		const video = document.createElement('video');
		video.muted = true;
		video.playsInline = true;
		video.preload = 'auto';
		video.setAttribute('aria-hidden', 'true');
		video.setAttribute('style', FRAME_PRESENTATION_STYLE);
		video.src = videoObjectUrl;
		document.body.append(video);
		extractionVideo = video;
		video.load();

		await waitForMetadata(video, signal);
		frameUrls = await extractFrames(video, signal, { fps, quality });
		throwIfAborted(signal);

		video.pause();
		video.remove();
		extractionVideo = null;

		onReadyChange?.(true);
		syncFrameToScroll();
		queueInitialScrollSync();
	};

	const handleScroll = () => {
		syncFrameToScroll();
	};

	const handleFailure = (error: unknown) => {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return;
		}

		onError?.(error);
	};

	window.addEventListener('scroll', handleScroll, { passive: true });
	window.addEventListener('load', queueInitialScrollSync);
	window.addEventListener('pageshow', queueInitialScrollSync);

	void start().catch(handleFailure);

	return () => {
		controller.abort();
		window.removeEventListener('scroll', handleScroll);
		window.removeEventListener('load', queueInitialScrollSync);
		window.removeEventListener('pageshow', queueInitialScrollSync);
		cancelAnimationFrame(initialSyncRafId);
		for (const frameUrl of frameUrls) {
			URL.revokeObjectURL(frameUrl);
		}
		extractionVideo?.pause();
		extractionVideo?.remove();
		if (videoObjectUrl) {
			URL.revokeObjectURL(videoObjectUrl);
		}
	};
}
