<script lang="ts">
  import { onMount } from 'svelte';
  import type * as Monaco from 'monaco-editor';
  import {
    clearGlslModelExtraSymbols,
    glslLanguageId,
    registerGlslLanguage,
    setGlslModelExtraSymbols,
    type GlslSymbol
  } from './monaco-glsl';
  import {
    getPreviewPointerPosition,
    getPreviewRenderSize,
    previewTransitionMs
  } from './shader-editor-preview';

  const defaultFragmentShader = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 sampled = texture2D(colortex0, uv).rgb;
  fragColor = vec4(sampled, 1.0);
}`;

  const vertexShaderSource = `attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  const shaderPreambleLines = [
    'precision highp float;',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform float iTimeDelta;',
    'uniform int iFrame;',
    'uniform vec4 iMouse;',
    'uniform sampler2D colortex0;'
  ];

  const shaderPreamble = shaderPreambleLines.join('\n');
  const shaderPostamble = `void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;
  const editorSymbols: GlslSymbol[] = [
    {
      name: 'iResolution',
      type: 'vec3',
      qualifier: 'uniform',
      detail: 'uniform variable',
      documentation: 'Viewport resolution in pixels.'
    },
    {
      name: 'iTime',
      type: 'float',
      qualifier: 'uniform',
      detail: 'uniform variable',
      documentation: 'Elapsed time in seconds.'
    },
    {
      name: 'iTimeDelta',
      type: 'float',
      qualifier: 'uniform',
      detail: 'uniform variable',
      documentation: 'Frame delta time in seconds.'
    },
    {
      name: 'iFrame',
      type: 'int',
      qualifier: 'uniform',
      detail: 'uniform variable',
      documentation: 'Current frame number.'
    },
    {
      name: 'iMouse',
      type: 'vec4',
      qualifier: 'uniform',
      detail: 'uniform variable',
      documentation: 'Mouse position and click origin in pixels.'
    },
    {
      name: 'colortex0',
      type: 'sampler2D',
      qualifier: 'uniform',
      detail: 'uniform sampler',
      documentation: 'Default texture sampler. Sample with texture2D(colortex0, uv).'
    },
    {
      name: 'gl_FragCoord',
      type: 'vec4',
      qualifier: 'in',
      detail: 'fragment input',
      documentation: 'Window-relative fragment coordinates.'
    },
    {
      name: 'gl_FragColor',
      type: 'vec4',
      qualifier: 'out',
      detail: 'fragment output',
      documentation: 'Final fragment color.'
    }
  ];

  const editorFontFamily = 'Consolas, "SFMono-Regular", Menlo, Monaco, "Liberation Mono", monospace';
  const markerOwner = `texture-fragment-shader-${Math.random().toString(36).slice(2)}`;

  export let source = defaultFragmentShader;
  export let defaultTextureUrl = '';

  let canvas: HTMLCanvasElement | null = null;
  let previewFrame: HTMLDivElement | null = null;
  let editorHost: HTMLDivElement | null = null;
  let errorMessage = '';
  let isEditorFocused = false;
  let isPreviewReturning = false;
  let previewRenderWidth = 0;
  let previewRenderHeight = 0;

  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  let model: Monaco.editor.ITextModel | null = null;
  let monaco: typeof Monaco | null = null;
  let animationFrameId = 0;
  let compileTimeout = 0;
  let startTime = 0;
  let lastFrameTime = 0;
  let frame = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let clickX = 0;
  let clickY = 0;
  let previewReturnTimeout = 0;
  let quadBuffer: WebGLBuffer | null = null;
  let channel0Texture: WebGLTexture | null = null;

  const uniforms = {
    resolution: null as WebGLUniformLocation | null,
    time: null as WebGLUniformLocation | null,
    timeDelta: null as WebGLUniformLocation | null,
    frame: null as WebGLUniformLocation | null,
    mouse: null as WebGLUniformLocation | null,
    colortex0: null as WebGLUniformLocation | null
  };

  const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0;

  const ensureTexture = () => {
    if (!gl) return null;

    if (!channel0Texture) {
      channel0Texture = gl.createTexture();
    }

    return channel0Texture;
  };

  const setTextureSampling = (width: number, height: number) => {
    if (!gl) return;

    if (isPowerOfTwo(width) && isPowerOfTwo(height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return;
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const setDefaultTexture = (message = 'Using generated default texture.') => {
    if (!gl) return;

    const texture = ensureTexture();

    if (!texture) {
      return;
    }

    const fallbackPixels = new Uint8Array([
      255, 80, 64, 255,
      48, 180, 255, 255,
      255, 220, 74, 255,
      100, 255, 180, 255
    ]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, fallbackPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    setTextureSampling(2, 2);
    gl.bindTexture(gl.TEXTURE_2D, null);
  };

  const loadTextureFromUrl = async (url: string) => {
    if (!gl) {
      return false;
    }

    const texture = ensureTexture();

    if (!texture) {
      return false;
    }

    const targetUrl = url.trim();

    if (!targetUrl) {
      return false;
    }

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.crossOrigin = 'anonymous';
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('Failed to load URL image.'));
        nextImage.src = targetUrl;
      });

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      setTextureSampling(image.width, image.height);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return true;
    } catch {
      return false;
    }
  };

  const applyMarkers = (message: string) => {
    if (!monaco || !model) return;

    const markers: Monaco.editor.IMarkerData[] = [];
    const sourceLineOffset = shaderPreambleLines.length;
    const errorPattern = /ERROR:\s*\d+:(\d+):\s*(.*)/g;

    for (const match of message.matchAll(errorPattern)) {
      const rawLine = Number(match[1]);
      const markerLine = Math.min(
        model.getLineCount(),
        Math.max(1, rawLine - sourceLineOffset)
      );
      const lineText = model.getLineContent(markerLine) || '';

      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: match[2].trim() || 'Shader compilation failed.',
        startLineNumber: markerLine,
        endLineNumber: markerLine,
        startColumn: 1,
        endColumn: Math.max(2, lineText.length + 1)
      });
    }

    if (!markers.length) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: message.trim() || 'Shader compilation failed.',
        startLineNumber: 1,
        endLineNumber: 1,
        startColumn: 1,
        endColumn: Math.max(2, model.getLineContent(1).length + 1)
      });
    }

    monaco.editor.setModelMarkers(model, markerOwner, markers);
  };

  const clearMarkers = () => {
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, markerOwner, []);
  };

  const compileProgram = (fragmentSource: string) => {
    if (!gl) return;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      errorMessage = 'WebGL could not create shader objects.';
      applyMarkers(errorMessage);
      return;
    }

    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      errorMessage = gl.getShaderInfoLog(vertexShader) ?? 'Vertex shader compilation failed.';
      applyMarkers(errorMessage);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.shaderSource(fragmentShader, `${shaderPreamble}\n${fragmentSource}\n${shaderPostamble}`);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      errorMessage = gl.getShaderInfoLog(fragmentShader) ?? 'Fragment shader compilation failed.';
      applyMarkers(errorMessage);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    const nextProgram = gl.createProgram();

    if (!nextProgram) {
      errorMessage = 'WebGL could not create a shader program.';
      applyMarkers(errorMessage);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.attachShader(nextProgram, vertexShader);
    gl.attachShader(nextProgram, fragmentShader);
    gl.linkProgram(nextProgram);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
      errorMessage = gl.getProgramInfoLog(nextProgram) ?? 'Program link failed.';
      applyMarkers(errorMessage);
      gl.deleteProgram(nextProgram);
      return;
    }

    if (program) {
      gl.deleteProgram(program);
    }

    program = nextProgram;
    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, 'aPosition');

    if (!quadBuffer) {
      quadBuffer = gl.createBuffer();
    }

    if (quadBuffer && positionLocation >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    uniforms.resolution = gl.getUniformLocation(program, 'iResolution');
    uniforms.time = gl.getUniformLocation(program, 'iTime');
    uniforms.timeDelta = gl.getUniformLocation(program, 'iTimeDelta');
    uniforms.frame = gl.getUniformLocation(program, 'iFrame');
    uniforms.mouse = gl.getUniformLocation(program, 'iMouse');
    uniforms.colortex0 = gl.getUniformLocation(program, 'colortex0');

    if (uniforms.colortex0) {
      gl.uniform1i(uniforms.colortex0, 0);
    }

    errorMessage = '';
    clearMarkers();
    frame = 0;
    startTime = performance.now();
    lastFrameTime = startTime;
  };

  const updatePreviewRenderSize = () => {
    const nextSize = getPreviewRenderSize({
      previewFrame,
      currentWidth: previewRenderWidth,
      currentHeight: previewRenderHeight,
      isLocked: isEditorFocused || isPreviewReturning
    });

    previewRenderWidth = nextSize.width;
    previewRenderHeight = nextSize.height;
  };

  const resizeCanvas = () => {
    if (!canvas || !gl) return;

    updatePreviewRenderSize();

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(previewRenderWidth * dpr));
    const height = Math.max(1, Math.floor(previewRenderHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const drawFrame = (now: number) => {
    if (!gl || !program || !canvas) {
      animationFrameId = window.requestAnimationFrame(drawFrame);
      return;
    }

    resizeCanvas();
    gl.useProgram(program);

    if (channel0Texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, channel0Texture);
      if (uniforms.colortex0) {
        gl.uniform1i(uniforms.colortex0, 0);
      }
    }

    const elapsed = (now - startTime) / 1000;
    const delta = (now - lastFrameTime) / 1000;

    gl.uniform3f(uniforms.resolution, canvas.width, canvas.height, 1);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.timeDelta, delta);
    gl.uniform1i(uniforms.frame, frame);
    gl.uniform4f(
      uniforms.mouse,
      mouseX,
      mouseY,
      mouseDown ? clickX : -Math.abs(clickX),
      mouseDown ? clickY : -Math.abs(clickY)
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    frame += 1;
    lastFrameTime = now;
    animationFrameId = window.requestAnimationFrame(drawFrame);
  };

  const scheduleCompile = () => {
    window.clearTimeout(compileTimeout);
    compileTimeout = window.setTimeout(() => {
      compileProgram(model?.getValue() ?? source);
    }, 160);
  };

  const updateMouse = (event: PointerEvent) => {
    if (!canvas) return;

    const pointerPosition = getPreviewPointerPosition({
      event,
      previewFrame,
      previewRenderWidth,
      previewRenderHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });

    if (!pointerPosition) return;

    mouseX = pointerPosition.x;
    mouseY = pointerPosition.y;

    if (mouseDown) {
      clickX = mouseX;
      clickY = mouseY;
    }
  };

  onMount(() => {
    let resizeObserver: ResizeObserver | null = null;
    let handlePointerMove: ((event: PointerEvent) => void) | null = null;
    let handlePointerDown: ((event: PointerEvent) => void) | null = null;
    let handlePointerUp: (() => void) | null = null;
    let focusListener: Monaco.IDisposable | null = null;
    let blurListener: Monaco.IDisposable | null = null;

    const setup = async () => {
      if (!canvas || !editorHost) return;

      const monacoModule = await import('monaco-editor');
      monaco = monacoModule;
      registerGlslLanguage(monacoModule);

      model = monaco.editor.createModel(source, glslLanguageId);
      setGlslModelExtraSymbols(model, editorSymbols);
      editor = monaco.editor.create(editorHost, {
        model,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true,
        tabSize: 2,
        insertSpaces: true,
        theme: 'vs-dark',
        padding: { top: 18, bottom: 18 },
        fontSize: 14,
        lineHeight: 22,
        fontFamily: editorFontFamily,
        fontLigatures: false,
        letterSpacing: 0,
        lineNumbersMinChars: 3,
        roundedSelection: false,
        renderLineHighlight: 'none',
        wordWrap: 'off'
      });

      monaco.editor.remeasureFonts();

      model.onDidChangeContent(scheduleCompile);
      focusListener = editor.onDidFocusEditorText(() => {
        window.clearTimeout(previewReturnTimeout);
        isPreviewReturning = false;
        isEditorFocused = true;
      });
      blurListener = editor.onDidBlurEditorText(() => {
        isEditorFocused = false;
        isPreviewReturning = true;
        window.clearTimeout(previewReturnTimeout);
        previewReturnTimeout = window.setTimeout(() => {
          isPreviewReturning = false;
          updatePreviewRenderSize();
          resizeCanvas();
        }, previewTransitionMs);
      });

      gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });

      if (!gl) {
        errorMessage = 'This browser does not expose WebGL.';
        applyMarkers(errorMessage);
        return;
      }

      const hasDefaultTextureUrl = defaultTextureUrl.trim().length > 0;
      const loadedDefaultTexture = hasDefaultTextureUrl
        ? await loadTextureFromUrl(defaultTextureUrl)
        : false;

      if (!loadedDefaultTexture) {
        if (hasDefaultTextureUrl) {
          setDefaultTexture('Falling back to generated texture because the default URL failed to load.');
        } else {
          setDefaultTexture();
        }
      }
      compileProgram(source);
      resizeCanvas();

      resizeObserver = new ResizeObserver(() => {
        updatePreviewRenderSize();
        resizeCanvas();
        editor?.layout();
      });

      if (previewFrame) {
        resizeObserver.observe(previewFrame);
      }
      resizeObserver.observe(editorHost);

      handlePointerMove = (event: PointerEvent) => updateMouse(event);
      handlePointerDown = (event: PointerEvent) => {
        mouseDown = true;
        updateMouse(event);
        clickX = mouseX;
        clickY = mouseY;
      };
      handlePointerUp = () => {
        mouseDown = false;
      };

      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointerup', handlePointerUp);

      animationFrameId = window.requestAnimationFrame(drawFrame);
    };

    setup();

    return () => {
      resizeObserver?.disconnect();

      if (canvas && handlePointerMove) {
        canvas.removeEventListener('pointermove', handlePointerMove);
      }

      if (canvas && handlePointerDown) {
        canvas.removeEventListener('pointerdown', handlePointerDown);
      }

      if (handlePointerUp) {
        window.removeEventListener('pointerup', handlePointerUp);
      }
      if (focusListener) {
        focusListener.dispose();
      }
      if (blurListener) {
        blurListener.dispose();
      }

      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(compileTimeout);
      window.clearTimeout(previewReturnTimeout);

      clearMarkers();
      if (model) {
        clearGlslModelExtraSymbols(model);
      }
      model?.dispose();
      editor?.dispose();

      if (quadBuffer && gl) {
        gl.deleteBuffer(quadBuffer);
      }

      if (channel0Texture && gl) {
        gl.deleteTexture(channel0Texture);
      }

      if (program && gl) {
        gl.deleteProgram(program);
      }
    };
  });
</script>

<div class="texture-fragment-shader-editor not-content" class:is-editor-focused={isEditorFocused}>
  <div bind:this={editorHost} class="texture-fragment-shader-editor__editor"></div>

  <div class="texture-fragment-shader-editor__preview-panel">
    <div bind:this={previewFrame} class="texture-fragment-shader-editor__preview-frame">
      <canvas
        bind:this={canvas}
        class="texture-fragment-shader-editor__preview"
        style:width={`${previewRenderWidth}px`}
        style:height={`${previewRenderHeight}px`}
      ></canvas>
    </div>
  </div>

  {#if errorMessage}
    <div class="texture-fragment-shader-editor__status" role="status" aria-live="polite">
      <span class="texture-fragment-shader-editor__status-label">Shader error</span>
      <pre class="texture-fragment-shader-editor__status-message">{errorMessage}</pre>
    </div>
  {/if}
</div>

<style>
  .texture-fragment-shader-editor {
    --texture-editor-width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 1fr);
    align-items: start;
    gap: 1rem;
    width: var(--texture-editor-width);
    max-width: none;
    margin: 1.5rem 0;
    overflow: visible;
    transition:
      grid-template-columns 240ms cubic-bezier(0.22, 1, 0.36, 1),
      width 240ms cubic-bezier(0.22, 1, 0.36, 1),
      margin-left 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .texture-fragment-shader-editor.is-editor-focused {
    grid-template-columns: minmax(0, 1.8fr) minmax(14rem, 0.7fr);
  }

  @media (min-width: 96rem) {
    .texture-fragment-shader-editor.is-editor-focused {
      --texture-editor-width: min(calc(100vw - 3rem), calc(100% + 28rem));
      margin-left: calc((100% - var(--texture-editor-width)) / 2);
    }
  }

  .texture-fragment-shader-editor__editor,
  .texture-fragment-shader-editor__preview-frame {
    min-height: 26rem;
    height: 26rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    background: #0d1117;
  }

  .texture-fragment-shader-editor__editor {
    all: initial;
    display: block;
    min-height: 26rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    overflow: hidden;
    background: #0d1117;
    color: white;
    direction: ltr;
    text-align: left;
    box-sizing: border-box;
  }

  .texture-fragment-shader-editor :global(.monaco-editor .view-lines),
  .texture-fragment-shader-editor :global(.monaco-editor .view-line),
  .texture-fragment-shader-editor :global(.monaco-editor .line-numbers),
  .texture-fragment-shader-editor :global(.monaco-editor .inputarea),
  .texture-fragment-shader-editor :global(.monaco-editor textarea) {
    font-family: Consolas, "SFMono-Regular", Menlo, Monaco, "Liberation Mono", monospace !important;
    letter-spacing: 0 !important;
  }

  .texture-fragment-shader-editor :global(.monaco-editor .view-lines),
  .texture-fragment-shader-editor :global(.monaco-editor .view-line),
  .texture-fragment-shader-editor :global(.monaco-editor .line-numbers) {
    line-height: 22px !important;
  }

  .texture-fragment-shader-editor__preview-panel {
    display: grid;
    gap: 0.6rem;
  }

  .texture-fragment-shader-editor__texture-message {
    margin: 0;
    color: #b7c7e3;
    font-size: 0.83rem;
    line-height: 1.35;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .texture-fragment-shader-editor__preview-frame {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at top, rgba(91, 136, 234, 0.2), transparent 35%),
      linear-gradient(180deg, #130f1c, #09070f);
  }

  .texture-fragment-shader-editor__preview {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: block;
  }

  .texture-fragment-shader-editor__status {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem 0.95rem;
    border-radius: 0.75rem;
    background: rgba(102, 21, 39, 0.88);
    color: #ffe0e5;
    font-size: 0.85rem;
    line-height: 1.35;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    backdrop-filter: blur(8px);
  }

  .texture-fragment-shader-editor__status-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #ffb7c6;
  }

  .texture-fragment-shader-editor__status-message {
    margin: 0;
    font: inherit;
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (max-width: 80rem) {
    .texture-fragment-shader-editor {
      grid-template-columns: 1fr;
    }

    .texture-fragment-shader-editor__editor,
    .texture-fragment-shader-editor__preview-frame {
      min-height: 22rem;
      height: 22rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .texture-fragment-shader-editor {
      transition: none;
    }
  }
</style>
