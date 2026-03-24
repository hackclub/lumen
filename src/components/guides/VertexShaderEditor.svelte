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
  import { loadMonaco } from './load-monaco';

  type Vec3 = [number, number, number];
  type PreparedMesh = {
    positions: Float32Array;
    normals: Float32Array;
    vertexCount: number;
    wireframePositions: Float32Array;
    wireframeNormals: Float32Array;
    wireframeVertexCount: number;
    radius: number;
  };

  const defaultVertexShader = `void mainVertex(inout vec3 position, inout vec3 normal) {
  float ripple = sin((position.y + position.x) * 4.0 + iTime * 2.0) * 0.14;
  position += normal * ripple;
}`;

  const fragmentShaderSource = `precision highp float;

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vTexturePosition;
varying vec3 vTextureNormal;

uniform vec3 uCameraPosition;
uniform float uRenderMode;
uniform sampler2D uTexture;

void main() {
  if (uRenderMode > 1.5) {
    gl_FragColor = vec4(0.9, 0.95, 1.0, 0.95);
    return;
  }

  if (uRenderMode > 0.5) {
    vec2 pointUv = gl_PointCoord * 2.0 - 1.0;
    float pointMask = smoothstep(1.0, 0.68, dot(pointUv, pointUv));

    if (pointMask <= 0.01) {
      discard;
    }

    vec3 pointColor = vec3(0.98, 0.94, 0.8);
    gl_FragColor = vec4(pointColor, pointMask);
    return;
  }

  vec3 textureNormal = normalize(vTextureNormal);
  vec3 blend = pow(max(abs(textureNormal), vec3(0.0001)), vec3(8.0));
  blend /= max(blend.x + blend.y + blend.z, 0.0001);
  vec3 tiledPosition = vTexturePosition * (1.0 / 1.8) + 0.5;
  vec3 textureColor =
    texture2D(uTexture, tiledPosition.yz).rgb * blend.x +
    texture2D(uTexture, tiledPosition.xz).rgb * blend.y +
    texture2D(uTexture, tiledPosition.xy).rgb * blend.z;
  gl_FragColor = vec4(textureColor, 1.0);
}`;

  const shaderPreambleLines = [
    'precision highp float;',
    'attribute vec3 aPosition;',
    'attribute vec3 aNormal;',
    'uniform mat4 uModelMatrix;',
    'uniform mat4 uViewMatrix;',
    'uniform mat4 uProjectionMatrix;',
    'uniform float uPointSize;',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform float iTimeDelta;',
    'uniform int iFrame;',
    'uniform vec4 iMouse;',
    'varying vec3 vNormal;',
    'varying vec3 vWorldPosition;',
    'varying vec3 vTexturePosition;',
    'varying vec3 vTextureNormal;'
  ];

  const shaderPreamble = shaderPreambleLines.join('\n');
  const shaderPostamble = `void main() {
  vec3 position = aPosition;
  vec3 normal = normalize(aNormal);

  mainVertex(position, normal);

  vec4 worldPosition = uModelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(mat3(uModelMatrix) * normal);
  vTexturePosition = aPosition;
  vTextureNormal = normalize(aNormal);
  gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
  gl_PointSize = uPointSize;
}`;

  const editorSymbols: GlslSymbol[] = [
    {
      name: 'aPosition',
      type: 'vec3',
      qualifier: 'attribute',
      detail: 'mesh attribute',
      documentation: 'Original vertex position from the provided triangle mesh.'
    },
    {
      name: 'aNormal',
      type: 'vec3',
      qualifier: 'attribute',
      detail: 'mesh attribute',
      documentation: 'Flat-shaded normal derived from the provided triangle mesh.'
    },
    {
      name: 'iResolution',
      type: 'vec3',
      qualifier: 'uniform',
      detail: 'uniform variable',
      documentation: 'Preview resolution in pixels.'
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
      documentation: 'Mouse position and click origin in preview pixels.'
    },
    {
      name: 'uModelMatrix',
      type: 'mat4',
      qualifier: 'uniform',
      detail: 'transform matrix',
      documentation: 'Object-to-world matrix applied after your edits.'
    },
    {
      name: 'uViewMatrix',
      type: 'mat4',
      qualifier: 'uniform',
      detail: 'transform matrix',
      documentation: 'World-to-camera matrix controlled by the orbit preview.'
    },
    {
      name: 'uProjectionMatrix',
      type: 'mat4',
      qualifier: 'uniform',
      detail: 'transform matrix',
      documentation: 'Perspective projection matrix for the preview camera.'
    }
  ];

  const editorFontFamily = 'Consolas, "SFMono-Regular", Menlo, Monaco, "Liberation Mono", monospace';
  const markerOwner = `vertex-shader-${Math.random().toString(36).slice(2)}`;
  const identityMatrix = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);

  export let source = defaultVertexShader;
  export let vertices: number[] = [];
  export let showVertices = true;
  export let wireframe = false;
  export let autoSpin = true;
  export let defaultTextureUrl = '';

  let canvas: HTMLCanvasElement | null = null;
  let previewFrame: HTMLDivElement | null = null;
  let editorHost: HTMLDivElement | null = null;
  let shaderErrorMessage = '';
  let meshErrorMessage = '';
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
  let previewReturnTimeout = 0;
  let startTime = 0;
  let lastFrameTime = 0;
  let frame = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let clickX = 0;
  let clickY = 0;
  let orbitPointerId: number | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let orbitYaw = 0.72;
  let orbitPitch = 0.42;
  let orbitDistance = 3.2;
  let meshVertexCount = 0;
  let wireframeVertexCount = 0;
  let meshRadius = 1;
  let positionBuffer: WebGLBuffer | null = null;
  let normalBuffer: WebGLBuffer | null = null;
  let wireframePositionBuffer: WebGLBuffer | null = null;
  let wireframeNormalBuffer: WebGLBuffer | null = null;
  let channel0Texture: WebGLTexture | null = null;

  const uniforms = {
    modelMatrix: null as WebGLUniformLocation | null,
    viewMatrix: null as WebGLUniformLocation | null,
    projectionMatrix: null as WebGLUniformLocation | null,
    pointSize: null as WebGLUniformLocation | null,
    resolution: null as WebGLUniformLocation | null,
    time: null as WebGLUniformLocation | null,
    timeDelta: null as WebGLUniformLocation | null,
    frame: null as WebGLUniformLocation | null,
    mouse: null as WebGLUniformLocation | null,
    cameraPosition: null as WebGLUniformLocation | null,
    renderMode: null as WebGLUniformLocation | null,
    texture: null as WebGLUniformLocation | null
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0;

  const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];

  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const lengthOf = (value: Vec3) => Math.hypot(value[0], value[1], value[2]);

  const normalize = (value: Vec3): Vec3 => {
    const magnitude = lengthOf(value);

    if (magnitude <= 1e-6) {
      return [0, 1, 0];
    }

    return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
  };

  const ensureTexture = () => {
    if (!gl) return null;

    if (!channel0Texture) {
      channel0Texture = gl.createTexture();
    }

    return channel0Texture;
  };

  const setTextureSampling = (width: number, height: number) => {
    if (!gl) return;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    if (isPowerOfTwo(width) && isPowerOfTwo(height)) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return;
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const setDefaultTexture = () => {
    if (!gl) return;

    const texture = ensureTexture();

    if (!texture) {
      return;
    }

    const fallbackPixels = new Uint8Array([
      36, 52, 83, 255,
      231, 153, 84, 255,
      244, 231, 190, 255,
      90, 146, 210, 255
    ]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, fallbackPixels);
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
      setTextureSampling(image.width, image.height);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return true;
    } catch {
      return false;
    }
  };

  const perspective = (fovY: number, aspect: number, near: number, far: number) => {
    const f = 1 / Math.tan(fovY / 2);
    const rangeInverse = 1 / (near - far);

    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * rangeInverse, -1,
      0, 0, 2 * far * near * rangeInverse, 0
    ]);
  };

  const lookAt = (eye: Vec3, target: Vec3, up: Vec3) => {
    const zAxis = normalize(subtract(eye, target));
    const xAxis = normalize(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);

    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1
    ]);
  };

  const prepareMesh = (inputVertices: number[]): PreparedMesh | null => {
    if (inputVertices.length < 9) {
      meshErrorMessage = 'Pass triangle vertices as xyz triplets. At least one triangle is required.';
      return null;
    }

    if (inputVertices.length % 9 !== 0) {
      meshErrorMessage = 'Vertices must be provided as triangles. The array length must be divisible by 9.';
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < inputVertices.length; index += 3) {
      const x = inputVertices[index];
      const y = inputVertices[index + 1];
      const z = inputVertices[index + 2];

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        meshErrorMessage = 'Vertices must contain only finite numeric xyz values.';
        return null;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    const scale = 1.8 / maxExtent;
    const positions = new Float32Array(inputVertices.length);
    const normals = new Float32Array(inputVertices.length);
    const wireframePositions = new Float32Array((inputVertices.length / 9) * 18);
    const wireframeNormals = new Float32Array((inputVertices.length / 9) * 18);
    let radius = 0;

    for (let index = 0; index < inputVertices.length; index += 3) {
      const x = (inputVertices[index] - centerX) * scale;
      const y = (inputVertices[index + 1] - centerY) * scale;
      const z = (inputVertices[index + 2] - centerZ) * scale;

      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
      radius = Math.max(radius, Math.hypot(x, y, z));
    }

    for (let index = 0; index < positions.length; index += 9) {
      const a: Vec3 = [positions[index], positions[index + 1], positions[index + 2]];
      const b: Vec3 = [positions[index + 3], positions[index + 4], positions[index + 5]];
      const c: Vec3 = [positions[index + 6], positions[index + 7], positions[index + 8]];
      const normal = normalize(cross(subtract(b, a), subtract(c, a)));

      for (let offset = 0; offset < 9; offset += 3) {
        normals[index + offset] = normal[0];
        normals[index + offset + 1] = normal[1];
        normals[index + offset + 2] = normal[2];
      }

      const wireframeBase = (index / 9) * 18;
      wireframePositions.set(a, wireframeBase);
      wireframePositions.set(b, wireframeBase + 3);
      wireframePositions.set(b, wireframeBase + 6);
      wireframePositions.set(c, wireframeBase + 9);
      wireframePositions.set(c, wireframeBase + 12);
      wireframePositions.set(a, wireframeBase + 15);

      for (let offset = 0; offset < 18; offset += 3) {
        wireframeNormals[wireframeBase + offset] = normal[0];
        wireframeNormals[wireframeBase + offset + 1] = normal[1];
        wireframeNormals[wireframeBase + offset + 2] = normal[2];
      }
    }

    meshErrorMessage = '';

    return {
      positions,
      normals,
      vertexCount: positions.length / 3,
      wireframePositions,
      wireframeNormals,
      wireframeVertexCount: wireframePositions.length / 3,
      radius: Math.max(radius, 0.75)
    };
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

  const configureAttributes = (
    nextPositionBuffer: WebGLBuffer | null,
    nextNormalBuffer: WebGLBuffer | null
  ) => {
    if (!gl || !program || !nextPositionBuffer || !nextNormalBuffer) return;

    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    const normalLocation = gl.getAttribLocation(program, 'aNormal');

    if (positionLocation >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, nextPositionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    }

    if (normalLocation >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, nextNormalBuffer);
      gl.enableVertexAttribArray(normalLocation);
      gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
    }
  };

  const configureMeshAttributes = () => {
    configureAttributes(positionBuffer, normalBuffer);
  };

  const configureWireframeAttributes = () => {
    configureAttributes(wireframePositionBuffer, wireframeNormalBuffer);
  };

  const uploadMesh = () => {
    if (!gl) return;

    const preparedMesh = prepareMesh(vertices);

    if (!preparedMesh) {
      meshVertexCount = 0;
      wireframeVertexCount = 0;
      return;
    }

    if (!positionBuffer) {
      positionBuffer = gl.createBuffer();
    }

    if (!normalBuffer) {
      normalBuffer = gl.createBuffer();
    }

    if (!wireframePositionBuffer) {
      wireframePositionBuffer = gl.createBuffer();
    }

    if (!wireframeNormalBuffer) {
      wireframeNormalBuffer = gl.createBuffer();
    }

    if (!positionBuffer || !normalBuffer || !wireframePositionBuffer || !wireframeNormalBuffer) {
      meshErrorMessage = 'WebGL could not create the mesh buffers.';
      meshVertexCount = 0;
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, preparedMesh.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, preparedMesh.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, wireframePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, preparedMesh.wireframePositions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, wireframeNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, preparedMesh.wireframeNormals, gl.STATIC_DRAW);

    meshVertexCount = preparedMesh.vertexCount;
    wireframeVertexCount = preparedMesh.wireframeVertexCount;
    meshRadius = preparedMesh.radius;
    orbitDistance = Math.max(2.8, meshRadius * 2.8);

    configureMeshAttributes();
  };

  const compileProgram = (vertexSource: string) => {
    if (!gl) return;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      shaderErrorMessage = 'WebGL could not create shader objects.';
      applyMarkers(shaderErrorMessage);
      return;
    }

    gl.shaderSource(vertexShader, `${shaderPreamble}\n${vertexSource}\n${shaderPostamble}`);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      shaderErrorMessage = gl.getShaderInfoLog(vertexShader) ?? 'Vertex shader compilation failed.';
      applyMarkers(shaderErrorMessage);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      shaderErrorMessage = gl.getShaderInfoLog(fragmentShader) ?? 'Fragment shader compilation failed.';
      applyMarkers(shaderErrorMessage);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    const nextProgram = gl.createProgram();

    if (!nextProgram) {
      shaderErrorMessage = 'WebGL could not create a shader program.';
      applyMarkers(shaderErrorMessage);
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
      shaderErrorMessage = gl.getProgramInfoLog(nextProgram) ?? 'Program link failed.';
      applyMarkers(shaderErrorMessage);
      gl.deleteProgram(nextProgram);
      return;
    }

    if (program) {
      gl.deleteProgram(program);
    }

    program = nextProgram;
    gl.useProgram(program);
    configureMeshAttributes();

    uniforms.modelMatrix = gl.getUniformLocation(program, 'uModelMatrix');
    uniforms.viewMatrix = gl.getUniformLocation(program, 'uViewMatrix');
    uniforms.projectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    uniforms.pointSize = gl.getUniformLocation(program, 'uPointSize');
    uniforms.resolution = gl.getUniformLocation(program, 'iResolution');
    uniforms.time = gl.getUniformLocation(program, 'iTime');
    uniforms.timeDelta = gl.getUniformLocation(program, 'iTimeDelta');
    uniforms.frame = gl.getUniformLocation(program, 'iFrame');
    uniforms.mouse = gl.getUniformLocation(program, 'iMouse');
    uniforms.cameraPosition = gl.getUniformLocation(program, 'uCameraPosition');
    uniforms.renderMode = gl.getUniformLocation(program, 'uRenderMode');
    uniforms.texture = gl.getUniformLocation(program, 'uTexture');

    if (uniforms.texture) {
      gl.uniform1i(uniforms.texture, 0);
    }

    shaderErrorMessage = '';
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

  const drawFrame = (now: number) => {
    if (!gl || !program || !canvas) {
      animationFrameId = window.requestAnimationFrame(drawFrame);
      return;
    }

    resizeCanvas();
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.035, 0.045, 0.075, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const elapsed = (now - startTime) / 1000;
    const delta = Math.max(0.001, (now - lastFrameTime) / 1000);

    if (autoSpin && orbitPointerId === null) {
      orbitYaw += delta * 0.35;
    }

    if (meshVertexCount > 0) {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const projectionMatrix = perspective(Math.PI / 3.1, aspect, 0.1, 100);
      const eye: Vec3 = [
        Math.cos(orbitPitch) * Math.sin(orbitYaw) * orbitDistance,
        Math.sin(orbitPitch) * orbitDistance,
        Math.cos(orbitPitch) * Math.cos(orbitYaw) * orbitDistance
      ];
      const viewMatrix = lookAt(eye, [0, 0, 0], [0, 1, 0]);

      gl.uniformMatrix4fv(uniforms.modelMatrix, false, identityMatrix);
      gl.uniformMatrix4fv(uniforms.viewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(uniforms.projectionMatrix, false, projectionMatrix);
      gl.uniform1f(uniforms.pointSize, Math.max(5, (window.devicePixelRatio || 1) * 4.5));
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
      gl.uniform3f(uniforms.cameraPosition, eye[0], eye[1], eye[2]);
      gl.uniform1f(uniforms.renderMode, 0);
      if (channel0Texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, channel0Texture);
        if (uniforms.texture) {
          gl.uniform1i(uniforms.texture, 0);
        }
      }

      if (wireframe) {
        configureWireframeAttributes();
        gl.disable(gl.CULL_FACE);
        gl.uniform1f(uniforms.renderMode, 2);
        gl.drawArrays(gl.LINES, 0, wireframeVertexCount);
      } else {
        configureMeshAttributes();
        gl.uniform1f(uniforms.renderMode, 0);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1, 1);
        gl.drawArrays(gl.TRIANGLES, 0, meshVertexCount);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }

      if (showVertices) {
        configureMeshAttributes();
        gl.disable(gl.CULL_FACE);
        gl.depthMask(false);
        gl.uniform1f(uniforms.renderMode, 1);
        gl.drawArrays(gl.POINTS, 0, meshVertexCount);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
      }
    }

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

  $: if (gl) {
    uploadMesh();
  }

  onMount(() => {
    let resizeObserver: ResizeObserver | null = null;
    let handlePointerMove: ((event: PointerEvent) => void) | null = null;
    let handlePointerDown: ((event: PointerEvent) => void) | null = null;
    let handlePointerUp: ((event: PointerEvent) => void) | null = null;
    let focusListener: Monaco.IDisposable | null = null;
    let blurListener: Monaco.IDisposable | null = null;

    const setup = async () => {
      if (!canvas || !editorHost) return;

      const monacoModule = await loadMonaco();
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
        shaderErrorMessage = 'This browser does not expose WebGL.';
        applyMarkers(shaderErrorMessage);
        return;
      }

      const hasDefaultTextureUrl = defaultTextureUrl.trim().length > 0;
      const loadedDefaultTexture = hasDefaultTextureUrl
        ? await loadTextureFromUrl(defaultTextureUrl)
        : false;

      if (!loadedDefaultTexture) {
        setDefaultTexture();
      }

      uploadMesh();
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

      handlePointerMove = (event: PointerEvent) => {
        updateMouse(event);

        if (orbitPointerId !== event.pointerId) {
          return;
        }

        const deltaX = event.clientX - lastPointerX;
        const deltaY = event.clientY - lastPointerY;

        orbitYaw += deltaX * 0.012;
        orbitPitch = clamp(orbitPitch - deltaY * 0.012, -1.25, 1.25);
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
      };

      handlePointerDown = (event: PointerEvent) => {
        if (!previewFrame) return;

        orbitPointerId = event.pointerId;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        mouseDown = true;
        updateMouse(event);
        clickX = mouseX;
        clickY = mouseY;
        previewFrame.setPointerCapture(event.pointerId);
      };

      handlePointerUp = (event: PointerEvent) => {
        if (!previewFrame || orbitPointerId !== event.pointerId) {
          return;
        }

        mouseDown = false;
        orbitPointerId = null;

        if (previewFrame.hasPointerCapture(event.pointerId)) {
          previewFrame.releasePointerCapture(event.pointerId);
        }
      };

      previewFrame?.addEventListener('pointermove', handlePointerMove);
      previewFrame?.addEventListener('pointerdown', handlePointerDown);
      previewFrame?.addEventListener('pointerup', handlePointerUp);
      previewFrame?.addEventListener('pointercancel', handlePointerUp);

      animationFrameId = window.requestAnimationFrame(drawFrame);
    };

    setup();

    return () => {
      resizeObserver?.disconnect();

      if (previewFrame && handlePointerMove) {
        previewFrame.removeEventListener('pointermove', handlePointerMove);
      }

      if (previewFrame && handlePointerDown) {
        previewFrame.removeEventListener('pointerdown', handlePointerDown);
      }

      if (previewFrame && handlePointerUp) {
        previewFrame.removeEventListener('pointerup', handlePointerUp);
        previewFrame.removeEventListener('pointercancel', handlePointerUp);
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

      if (positionBuffer && gl) {
        gl.deleteBuffer(positionBuffer);
      }

      if (normalBuffer && gl) {
        gl.deleteBuffer(normalBuffer);
      }

      if (wireframePositionBuffer && gl) {
        gl.deleteBuffer(wireframePositionBuffer);
      }

      if (wireframeNormalBuffer && gl) {
        gl.deleteBuffer(wireframeNormalBuffer);
      }

      if (program && gl) {
        gl.deleteProgram(program);
      }

      if (channel0Texture && gl) {
        gl.deleteTexture(channel0Texture);
      }
    };
  });
</script>

<div class="vertex-shader-editor not-content" class:is-editor-focused={isEditorFocused}>
  <div bind:this={editorHost} class="vertex-shader-editor__editor"></div>

  <div class="vertex-shader-editor__preview-panel">
    <div
      bind:this={previewFrame}
      class="vertex-shader-editor__preview-frame"
      class:is-orbiting={orbitPointerId !== null}
    >
      <canvas
        bind:this={canvas}
        class="vertex-shader-editor__preview"
        style:width={`${previewRenderWidth}px`}
        style:height={`${previewRenderHeight}px`}
      ></canvas>

      <div class="vertex-shader-editor__orbit-hint" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M16.5 3.8h1.8v5.1h-5.1" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M19.5 12A7.5 7.5 0 0 1 6.7 17.3" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M7.5 20.2H5.7v-5.1h5.1" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Drag to orbit</span>
      </div>
    </div>
  </div>

  {#if shaderErrorMessage || meshErrorMessage}
    <div class="vertex-shader-editor__status" role="status" aria-live="polite">
      <span class="vertex-shader-editor__status-label">
        {shaderErrorMessage ? 'Shader error' : 'Mesh error'}
      </span>
      <pre class="vertex-shader-editor__status-message">{shaderErrorMessage || meshErrorMessage}</pre>
    </div>
  {/if}
</div>

<style>
  .vertex-shader-editor {
    --vertex-editor-width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 1fr);
    align-items: start;
    gap: 1rem;
    width: var(--vertex-editor-width);
    max-width: none;
    margin: 1.5rem 0;
    overflow: visible;
    transition:
      grid-template-columns 240ms cubic-bezier(0.22, 1, 0.36, 1),
      width 240ms cubic-bezier(0.22, 1, 0.36, 1),
      margin-left 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .vertex-shader-editor.is-editor-focused {
    grid-template-columns: minmax(0, 1.8fr) minmax(14rem, 0.7fr);
  }

  @media (min-width: 96rem) {
    .vertex-shader-editor.is-editor-focused {
      --vertex-editor-width: min(calc(100vw - 3rem), calc(100% + 28rem));
      margin-left: calc((100% - var(--vertex-editor-width)) / 2);
    }
  }

  .vertex-shader-editor__editor,
  .vertex-shader-editor__preview-frame {
    min-height: 26rem;
    height: 26rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    background: #0d1117;
  }

  .vertex-shader-editor__editor {
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

  .vertex-shader-editor :global(.monaco-editor .view-lines),
  .vertex-shader-editor :global(.monaco-editor .view-line),
  .vertex-shader-editor :global(.monaco-editor .line-numbers),
  .vertex-shader-editor :global(.monaco-editor .inputarea),
  .vertex-shader-editor :global(.monaco-editor textarea) {
    font-family: Consolas, "SFMono-Regular", Menlo, Monaco, "Liberation Mono", monospace !important;
    letter-spacing: 0 !important;
  }

  .vertex-shader-editor :global(.monaco-editor .view-lines),
  .vertex-shader-editor :global(.monaco-editor .view-line),
  .vertex-shader-editor :global(.monaco-editor .line-numbers) {
    line-height: 22px !important;
  }

  .vertex-shader-editor__preview-panel {
    display: grid;
  }

  .vertex-shader-editor__preview-frame {
    position: relative;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    background:
      radial-gradient(circle at 50% 10%, rgba(120, 205, 255, 0.18), transparent 35%),
      radial-gradient(circle at 25% 75%, rgba(255, 158, 85, 0.16), transparent 32%),
      linear-gradient(180deg, #151b2a, #090c14);
  }

  .vertex-shader-editor__preview-frame.is-orbiting {
    cursor: grabbing;
  }

  .vertex-shader-editor__preview-frame::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 2.5rem 2.5rem;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.7), transparent 80%);
    pointer-events: none;
  }

  .vertex-shader-editor__preview {
    position: absolute;
    inset: 0;
    display: block;
  }

  .vertex-shader-editor__orbit-hint {
    position: absolute;
    right: 0.85rem;
    bottom: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    background: rgba(8, 11, 19, 0.72);
    color: #dce7ff;
    font-size: 0.78rem;
    line-height: 1;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    backdrop-filter: blur(8px);
    pointer-events: none;
  }

  .vertex-shader-editor__orbit-hint svg {
    width: 1rem;
    height: 1rem;
    flex: 0 0 auto;
    color: #8ec5ff;
  }

  .vertex-shader-editor__status {
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

  .vertex-shader-editor__status-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #ffb7c6;
  }

  .vertex-shader-editor__status-message {
    margin: 0;
    font: inherit;
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (max-width: 80rem) {
    .vertex-shader-editor {
      grid-template-columns: 1fr;
    }

    .vertex-shader-editor__editor,
    .vertex-shader-editor__preview-frame {
      min-height: 22rem;
      height: 22rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .vertex-shader-editor {
      transition: none;
    }
  }
</style>
