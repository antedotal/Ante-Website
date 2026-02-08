"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
varying vec2 vUv;

// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  
  // Create a flowing noise pattern
  float noise1 = snoise(uv * 3.0 + uTime * 0.1);
  float noise2 = snoise(uv * 2.0 - uTime * 0.15);
  
  // Mix colors based on noise
  vec3 color = mix(uColor1, uColor2, noise1 * 0.5 + 0.5);
  color = mix(color, uColor3, noise2 * 0.5 + 0.5);
  
  // Add a subtle white overlay for lightness
  color = mix(color, vec3(1.0), 0.2);
  
  gl_FragColor = vec4(color, 1.0);
}
`;

function GradientPlane({ colors }: { colors?: [string, string, string] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(colors?.[0] || "#eff6ff") },
      uColor2: { value: new THREE.Color(colors?.[1] || "#dbeafe") },
      uColor3: { value: new THREE.Color(colors?.[2] || "#bfdbfe") },
    }),
    [colors]
  );

  useFrame((state) => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <mesh ref={meshRef} scale={[20, 20, 1]} position={[0, 0, -5]}>
      <planeGeometry args={[1, 1, 32, 32]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export default function ColorBendBackground({ className, colors }: { className?: string, colors?: [string, string, string] }) {
  return (
    <div className={className || "fixed inset-0 -z-20 h-full w-full"}>
      <Canvas camera={{ position: [0, 0, 1] }}>
        <GradientPlane colors={colors} />
      </Canvas>
    </div>
  );
}
