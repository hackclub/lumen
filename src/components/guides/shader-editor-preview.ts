export const previewTransitionMs = 240;

type PreviewRenderSizeOptions = {
  previewFrame: HTMLDivElement | null;
  currentWidth: number;
  currentHeight: number;
  isLocked: boolean;
};

type PointerPositionOptions = {
  event: PointerEvent;
  previewFrame: HTMLDivElement | null;
  previewRenderWidth: number;
  previewRenderHeight: number;
  canvasWidth: number;
  canvasHeight: number;
};

export const getPreviewRenderSize = ({
  previewFrame,
  currentWidth,
  currentHeight,
  isLocked
}: PreviewRenderSizeOptions) => {
  if (!previewFrame) {
    return { width: currentWidth, height: currentHeight };
  }

  const nextWidth = Math.max(1, Math.round(previewFrame.clientWidth));
  const nextHeight = Math.max(1, Math.round(previewFrame.clientHeight));

  if (!isLocked || !currentWidth || !currentHeight) {
    return { width: nextWidth, height: nextHeight };
  }

  return { width: currentWidth, height: currentHeight };
};

export const getPreviewPointerPosition = ({
  event,
  previewFrame,
  previewRenderWidth,
  previewRenderHeight,
  canvasWidth,
  canvasHeight
}: PointerPositionOptions) => {
  if (!previewFrame || !previewRenderWidth || !previewRenderHeight) {
    return null;
  }

  const frameRect = previewFrame.getBoundingClientRect();
  const scaleX = canvasWidth / previewRenderWidth;
  const scaleY = canvasHeight / previewRenderHeight;
  const cropOffsetX = Math.max(0, (previewRenderWidth - frameRect.width) / 2);
  const cropOffsetY = Math.max(0, (previewRenderHeight - frameRect.height) / 2);
  const x = cropOffsetX + (event.clientX - frameRect.left);
  const y = cropOffsetY + (event.clientY - frameRect.top);

  return {
    x: x * scaleX,
    y: canvasHeight - y * scaleY
  };
};
