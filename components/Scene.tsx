"use client";
import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Icosahedron } from "@react-three/drei";

const SpinningMesh = () => {
  const meshRef = useRef();

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <Icosahedron ref={meshRef} args={[1, 1]}>
      <meshStandardMaterial color="hotpink" wireframe />
    </Icosahedron>
  );
};

export const Scene = () => {
  return (
    <Canvas>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      <SpinningMesh />
    </Canvas>
  );
};