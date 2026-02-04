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
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uNoiseIntensity;

varying vec2 vUv;

// Simplex 3D Noise 
// by Ian McEwan, Ashima Arts
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //  x0 = x0 - 0.0 + 0.0 * C 
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

// Permutations
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients
// ( N=N*N*N*N )
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xczy + s0.xczy*sh.xxyy ;
  vec4 a1 = b1.xczy + s1.xczy*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  // Noise flow
  float noise = snoise(vec3(vUv.x * uNoiseScale, vUv.y * uNoiseScale - uTime * uSpeed, 0.0));
  
  // Opacity gradient (fade edges)
  float opacity = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
  opacity *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
  
  // Combine
  float alpha = (noise * 0.5 + 0.5) * opacity;
                                  // Increase alpha multiplier for better visibility
  gl_FragColor = vec4(uColor, alpha * 1.5);
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
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime + randomDelay;
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
  beamNumber = 12,
  lightColor = "#ffffff",
  colors,
  speed = 2,
  noiseIntensity = 1.75,
  scale = 0.2,
  rotation = 0,
}: BeamsProps) {
  return (
    <div className={cn("relative w-full h-full overflow-hidden bg-black", className)}>
      <Canvas 
        camera={{ position: [0, 0, 15], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
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