
'use client';
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

const Plexus = () => {
  const pointsRef = useRef();

  const particles = useMemo(() => {
    const p = new Array(500).fill(0).map(() => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1
      ),
    }));
    return p;
  }, []);

  useFrame(() => {
    if (pointsRef.current) {
      const positions = pointsRef.current.geometry.attributes.position.array;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.position.add(p.velocity);

        if (p.position.x < -5 || p.position.x > 5) p.velocity.x *= -1;
        if (p.position.y < -5 || p.position.y > 5) p.velocity.y *= -1;
        if (p.position.z < -5 || p.position.z > 5) p.velocity.z *= -1;

        positions[i * 3] = p.position.x;
        positions[i * 3 + 1] = p.position.y;
        positions[i * 3 + 2] = p.position.z;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={pointsRef} positions={particles.map(p => p.position.toArray()).flat()} stride={3}>
      <PointMaterial
        transparent
        color="#ffffff"
        size={0.02}
        sizeAttenuation
        depthWrite={false}
      />
    </Points>
  );
};

export const PlexusCanvas = () => (
  <Canvas camera={{ position: [0, 0, 5] }}>
    <Plexus />
  </Canvas>
);
