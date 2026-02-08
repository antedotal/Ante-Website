"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

/**
 * BEAMS BACKGROUND
 * 
 * A re-creation/adaptation of the 'Beams' component from reactbits.dev.
 * Creates animated light beams (planes) with a custom shader for a foggy/noisy light effect.
 */

interface BeamsProps {
  className?: string;
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  lightColor?: string;
  colors?: string[];
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  rotation?: number;
}

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision mediump float;

uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uNoiseIntensity;

varying vec2 vUv;

/**
 * Simplex 3D Noise - Optimized for WebGL 1.0 / GLSL ES 1.0
 * Based on work by Ian McEwan, Ashima Arts
 * Fixed swizzle patterns and type mismatches for broad driver compatibility.
 */
vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + vec3(dot(v, C.yyy)));
  vec3 x0 = v - i + vec3(dot(i, C.xxx));

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy + D.xxx; // -1.0 + 3.0 * C.x = -1.0 + 0.5 = -0.5

  // Permutations
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  // Fixed: replaced invalid .xczy swizzle with explicit component access
  vec4 a0 = vec4(b0.x, b0.z, b0.y, b0.w) + vec4(s0.x, s0.z, s0.y, s0.w) * vec4(sh.x, sh.x, sh.y, sh.y);
  vec4 a1 = vec4(b1.x, b1.z, b1.y, b1.w) + vec4(s1.x, s1.z, s1.y, s1.w) * vec4(sh.z, sh.z, sh.w, sh.w);

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  // Noise flow - animated simplex noise
  float noise = snoise(vec3(vUv.x * uNoiseScale, vUv.y * uNoiseScale - uTime * uSpeed, 0.0));
  
  // Opacity gradient (fade edges for soft beam look)
  float opacity = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  opacity *= smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  
  // Combine noise with opacity and apply intensity uniform
  // Cap alpha at 0.6 to prevent beams from becoming too bright/white
  float alpha = min((noise * 0.5 + 0.5) * opacity * uNoiseIntensity, 0.6);
  
  gl_FragColor = vec4(uColor, alpha);
}
`;

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function Beam({ index, width, height, color, speed, noiseIntensity, noiseScale }: { 
  index: number;
  width: number;
  height: number;
  color: string;
  speed: number;
  noiseIntensity: number;
  noiseScale: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  // Track shader time with throttled updates for smoother performance on low-end GPUs.
  const lastUpdateRef = useRef(0);
  const timeRef = useRef(0);

  const { initialPosition, randomDelay, randomRotation, randomSpeedFactor } = useMemo(() => {
    // Generate deterministic random values based on index
    // This fixes the purity warning and ensures consistent rendering
    const baseSeed = index * 123.456;
    return {
      initialPosition: new THREE.Vector3(
        (seededRandom(baseSeed + 1) - 0.5) * 10,
        (seededRandom(baseSeed + 2) - 0.5) * 5,
        (seededRandom(baseSeed + 3) - 0.5) * 5
      ),
      randomDelay: seededRandom(baseSeed + 4) * 10,
      randomRotation: (seededRandom(baseSeed + 5) - 0.5) * 0.5,
      randomSpeedFactor: 0.5 + seededRandom(baseSeed + 6),
    };
  }, [index]);

  useFrame((state) => {
    // Throttle uniform updates to ~30fps to reduce CPU/GPU overhead.
    const elapsed = state.clock.elapsedTime;
    const elapsedSinceUpdate = elapsed - lastUpdateRef.current;
    if (elapsedSinceUpdate < 1 / 30) {
      return;
    }

    lastUpdateRef.current = elapsed;
    timeRef.current += elapsedSinceUpdate;

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = timeRef.current + randomDelay;
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      position={initialPosition} 
      rotation={[0, 0, randomRotation]}
    >
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uSpeed: { value: speed * randomSpeedFactor },
          uNoiseScale: { value: noiseScale },
          uNoiseIntensity: { value: noiseIntensity }
        }}
      />
    </mesh>
  );
}

export default function Beams({
  className,
  beamWidth = 2,
  beamHeight = 15,
  beamNumber = 8,
  lightColor = "#4a9ead",
  colors,
  speed = 0.6,
  noiseIntensity = 0.4,
  scale = 0.2,
  rotation = 0,
}: BeamsProps) {
  return (
    <div className={cn("relative w-full h-full overflow-hidden bg-black", className)}>
      <Canvas 
        // Cap DPR and disable AA to reduce overdraw and fragment workload.
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, 15], fov: 45 }}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      >
        {/* Rotate the whole group to achieve the directional effect */}
        <group rotation={[0, 0, rotation * (Math.PI / 180)]}>
          {Array.from({ length: beamNumber }).map((_, i) => (
            <Beam
              key={i}
              index={i}
              width={beamWidth}
              height={beamHeight}
              color={colors ? colors[i % colors.length] : lightColor}
              speed={speed}
              noiseIntensity={noiseIntensity}
              noiseScale={scale}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}