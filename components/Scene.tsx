"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, PerspectiveCamera, Environment } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

function FloatingShape({ position, color, type, scale = 1 }: { position: [number, number, number], color: string, type: 'icosahedron' | 'octahedron' | 'torusKnot' | 'dodecahedron', scale?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += 0.005;
    meshRef.current.rotation.y += 0.005;
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <mesh ref={meshRef} position={position} scale={scale}>
        {type === 'icosahedron' && <icosahedronGeometry args={[1, 0]} />}
        {type === 'octahedron' && <octahedronGeometry args={[1, 0]} />}
        {type === 'torusKnot' && <torusKnotGeometry args={[0.6, 0.2, 128, 16]} />}
        {type === 'dodecahedron' && <dodecahedronGeometry args={[1, 0]} />}
        <meshStandardMaterial 
            color={color} 
            roughness={0.3} 
            metalness={0.8}
            emissive={color}
            emissiveIntensity={0.1}
        />
      </mesh>
    </Float>
  );
}

export default function Scene() {
  return (
    <div className="absolute inset-0 -z-10 h-full w-full pointer-events-none">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 10]} />
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <pointLight position={[-10, -10, -10]} color="blue" intensity={1} />
        
        <FloatingShape position={[-5, 2, 0]} color="#2953FF" type="icosahedron" scale={1.2} />
        <FloatingShape position={[5, -2, -2]} color="#60a5fa" type="torusKnot" scale={1.5} />
        <FloatingShape position={[3, 4, -5]} color="#3b82f6" type="octahedron" scale={0.8} />
        <FloatingShape position={[-3, -4, -3]} color="#93c5fd" type="dodecahedron" scale={1} />
        
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
