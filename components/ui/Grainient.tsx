"use client";

/**
 * Grainient — Animated WebGL gradient background with noise/grain.
 * Ported from react-bits (https://reactbits.dev/backgrounds/grainient).
 * Uses `ogl` for lightweight WebGL rendering with a custom GLSL fragment
 * shader that blends three configurable colors through warped noise fields.
 *
 * Props control color palette, warp distortion, rotation, grain overlay,
 * contrast/gamma/saturation post-processing, and viewport zoom/offset.
 */

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

/* ─── Helpers ─────────────────────────────────────────────────── */

/** Convert a hex color string (#RRGGBB) to normalized [r, g, b] floats. */
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
};

/* ─── GLSL Shaders ────────────────────────────────────────────── */

/** Vertex shader — simple full-screen triangle passthrough. */
const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/**
 * Fragment shader — blends three colors via noise-warped UV space,
 * then applies grain, contrast, gamma, and saturation post-processing.
 */
const fragment = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uGrainAnimated;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform vec2 uCenterOffset;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

out vec4 fragColor;

#define S(a,b,t) smoothstep(a,b,t)

mat2 Rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
  return fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
  return 0.5 + 0.5 * n;
}

void mainImage(out vec4 o, vec2 C) {
  float t = iTime * uTimeSpeed;
  vec2 uv = C / iResolution.xy;
  float ratio = iResolution.x / iResolution.y;

  vec2 tuv = uv - 0.5 + uCenterOffset;
  tuv /= max(uZoom, 0.001);

  float degree = noise(vec2(t * 0.1, tuv.x * tuv.y) * uNoiseScale);
  tuv.y *= 1.0 / ratio;
  tuv *= Rot(radians((degree - 0.5) * uRotationAmount + 180.0));
  tuv.y *= ratio;

  float frequency = uWarpFrequency;
  float ws = max(uWarpStrength, 0.001);
  float amplitude = uWarpAmplitude / ws;
  float warpTime = t * uWarpSpeed;
  tuv.x += sin(tuv.y * frequency + warpTime) / amplitude;
  tuv.y += sin(tuv.x * (frequency * 1.5) + warpTime) / (amplitude * 0.5);

  vec3 colLav = uColor1;
  vec3 colOrg = uColor2;
  vec3 colDark = uColor3;
  float b = uColorBalance;
  float s = max(uBlendSoftness, 0.0);
  mat2 blendRot = Rot(radians(uBlendAngle));
  float blendX = (tuv * blendRot).x;

  float edge0 = -0.3 - b - s;
  float edge1 = 0.2 - b + s;
  float v0 = 0.5 - b + s;
  float v1 = -0.3 - b - s;

  vec3 layer1 = mix(colDark, colOrg, S(edge0, edge1, blendX));
  vec3 layer2 = mix(colOrg, colLav, S(edge0, edge1, blendX));
  vec3 col = mix(layer1, layer2, S(v0, v1, tuv.y));

  vec2 grainUv = uv * max(uGrainScale, 0.001);
  if (uGrainAnimated > 0.5) { grainUv += vec2(iTime * 0.05); }
  float grain = fract(sin(dot(grainUv, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * uGrainAmount;

  col = (col - 0.5) * uContrast + 0.5;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col = pow(max(col, 0.0), vec3(1.0 / max(uGamma, 0.001)));
  col = clamp(col, 0.0, 1.0);

  o = vec4(col, 1.0);
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  fragColor = o;
}
`;

/* ─── Props ───────────────────────────────────────────────────── */

interface GrainientProps {
  /** First blend color (hex). */
  color1?: string;
  /** Second blend color (hex). */
  color2?: string;
  /** Third blend color (hex). */
  color3?: string;
  /** Global animation speed multiplier. */
  timeSpeed?: number;
  /** Shifts the blend balance between color layers. */
  colorBalance?: number;
  /** Controls warp distortion intensity. */
  warpStrength?: number;
  /** Frequency of the warp sine pattern. */
  warpFrequency?: number;
  /** Speed of warp sine animation. */
  warpSpeed?: number;
  /** Warp displacement amplitude. */
  warpAmplitude?: number;
  /** Rotation angle (degrees) of the blend axis. */
  blendAngle?: number;
  /** Edge softness of color blending. */
  blendSoftness?: number;
  /** How much noise-driven rotation is applied. */
  rotationAmount?: number;
  /** Scale of the noise field used for rotation. */
  noiseScale?: number;
  /** Intensity of the film-grain overlay. */
  grainAmount?: number;
  /** Scale/size of the grain pattern. */
  grainScale?: number;
  /** Whether grain pattern animates over time. */
  grainAnimated?: boolean;
  /** Contrast adjustment (1 = neutral). */
  contrast?: number;
  /** Gamma correction (1 = neutral). */
  gamma?: number;
  /** Saturation adjustment (1 = neutral). */
  saturation?: number;
  /** Horizontal center offset of the viewport. */
  centerX?: number;
  /** Vertical center offset of the viewport. */
  centerY?: number;
  /** Zoom level of the viewport (higher = zoomed in). */
  zoom?: number;
  /** Additional CSS class names. */
  className?: string;
}

/* ─── Component ───────────────────────────────────────────────── */

/**
 * Renders a full-size WebGL animated gradient with grain noise.
 * Mounts a <canvas> inside a container div and runs an rAF loop.
 * Automatically resizes via ResizeObserver.
 */
export default function Grainient({
  timeSpeed = 0.25,
  colorBalance = 0.0,
  warpStrength = 1.0,
  warpFrequency = 5.0,
  warpSpeed = 2.0,
  warpAmplitude = 50.0,
  blendAngle = 0.0,
  blendSoftness = 0.05,
  rotationAmount = 500.0,
  noiseScale = 2.0,
  grainAmount = 0.1,
  grainScale = 2.0,
  grainAnimated = false,
  contrast = 1.5,
  gamma = 1.0,
  saturation = 1.0,
  centerX = 0.0,
  centerY = 0.0,
  zoom = 0.9,
  color1 = "#FF9FFC",
  color2 = "#5227FF",
  color3 = "#B19EEF",
  className = "",
}: GrainientProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanupFn: (() => void) | null = null;

    /**
     * init: Asynchronously initializes the WebGL context, shaders, and geometry.
     * Purpose & Functionality: Deferring WebGL setup via requestIdleCallback avoids blocking
     * the main thread during initial parsing, layout, and LCP (Largest Contentful Paint) paint.
     */
    const init = () => {
      if (cancelled || !containerRef.current) return;

      /* Set up OGL renderer with WebGL2 context */
      const renderer = new Renderer({
        webgl: 2,
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });

      const gl = renderer.gl;
      const canvas = gl.canvas as HTMLCanvasElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";

      container.appendChild(canvas);

      /* Full-screen triangle geometry + shader program */
      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new Float32Array([1, 1]) },
          uTimeSpeed: { value: timeSpeed },
          uColorBalance: { value: colorBalance },
          uWarpStrength: { value: warpStrength },
          uWarpFrequency: { value: warpFrequency },
          uWarpSpeed: { value: warpSpeed },
          uWarpAmplitude: { value: warpAmplitude },
          uBlendAngle: { value: blendAngle },
          uBlendSoftness: { value: blendSoftness },
          uRotationAmount: { value: rotationAmount },
          uNoiseScale: { value: noiseScale },
          uGrainAmount: { value: grainAmount },
          uGrainScale: { value: grainScale },
          uGrainAnimated: { value: grainAnimated ? 1.0 : 0.0 },
          uContrast: { value: contrast },
          uGamma: { value: gamma },
          uSaturation: { value: saturation },
          uCenterOffset: { value: new Float32Array([centerX, centerY]) },
          uZoom: { value: zoom },
          uColor1: { value: new Float32Array(hexToRgb(color1)) },
          uColor2: { value: new Float32Array(hexToRgb(color2)) },
          uColor3: { value: new Float32Array(hexToRgb(color3)) },
        },
      });

      const mesh = new Mesh(gl, { geometry, program });

      /* Animation loop state & time anchor */
      let raf = 0;
      const t0 = performance.now();
      // Default isVisible to true so initial paint renders immediately without waiting for asynchronous IO callback
      let isVisible = true;

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      /**
       * render: Draws a single WebGL frame with current time uniform.
       * Purpose & Functionality: Computes elapsed seconds and invokes OGL renderer.
       */
      const render = (time: number) => {
        program.uniforms.iTime.value = (time - t0) * 0.001;
        renderer.render({ scene: mesh });
      };

      /**
       * loop: Continuously schedules animation frames when visible in viewport.
       */
      const loop = (t: number) => {
        if (!isVisible) return;
        render(t);
        raf = requestAnimationFrame(loop);
      };

      /**
       * startLoop: Starts the animation loop or renders a single frame for reduced motion.
       */
      const startLoop = () => {
        if (prefersReducedMotion) {
          render(t0);
          return;
        }
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      };

      /**
       * stopLoop: Cancels any active requestAnimationFrame callback to pause GPU rendering.
       */
      const stopLoop = () => {
        cancelAnimationFrame(raf);
        raf = 0;
      };

      /**
       * setSize: Resizes canvas and WebGL drawing buffer to match container bounding box.
       * Also immediately redraws a frame on mount or when static/reduced-motion to prevent blank or stretched frames.
       */
      const setSize = () => {
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        renderer.setSize(width, height);
        const res = program.uniforms.iResolution.value as Float32Array;
        res[0] = gl.drawingBufferWidth;
        res[1] = gl.drawingBufferHeight;

        if (prefersReducedMotion || raf === 0) {
          render(performance.now());
        }
      };

      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      // Pause/resume the rAF loop based on viewport visibility
      const io = new IntersectionObserver(([entry]) => {
        if (!entry) return;
        const nextVisible = entry.isIntersecting;
        if (nextVisible === isVisible) return;
        isVisible = nextVisible;

        if (isVisible) {
          startLoop();
        } else {
          stopLoop();
        }
      });
      io.observe(container);

      cleanupFn = () => {
        stopLoop();
        ro.disconnect();
        io.disconnect();
        try {
          container.removeChild(canvas);
        } catch {
          // Canvas may already be removed if component unmounts quickly
        }
        try {
          // Explicitly release WebGL context to prevent browser context exhaustion
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
          // Fallback if extension is not supported
        }
      };
    };

    // Schedule initialization when browser is idle to prioritize critical FCP and LCP painting
    const idleId =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(init, { timeout: 150 })
        : setTimeout(init, 30);

    /* Cleanup: cancel idle task or invoke cleanup function if already initialized */
    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && "cancelIdleCallback" in window && typeof idleId === "number") {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId as unknown as NodeJS.Timeout);
      }
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [
    timeSpeed,
    colorBalance,
    warpStrength,
    warpFrequency,
    warpSpeed,
    warpAmplitude,
    blendAngle,
    blendSoftness,
    rotationAmount,
    noiseScale,
    grainAmount,
    grainScale,
    grainAnimated,
    contrast,
    gamma,
    saturation,
    centerX,
    centerY,
    zoom,
    color1,
    color2,
    color3,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: `radial-gradient(ellipse at 50% 50%, ${color2} 0%, ${color1} 60%, ${color3} 100%)`,
      }}
      className={className}
    />
  );
}
