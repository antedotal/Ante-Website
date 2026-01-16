'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const CustomGeometry = () => {
    const geometry = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0, 0, 5, 2.5, 5, 5);
        shape.bezierCurveTo(5, 7.5, 0, 10, 0, 10);
        shape.bezierCurveTo(-5, 7.5, -5, 5, -5, 5);
        shape.bezierCurveTo(-5, 2.5, 0, 0, 0, 0);

        const extrudeSettings = {
            steps: 2,
            depth: 2,
            bevelEnabled: true,
            bevelThickness: 1,
            bevelSize: 1,
            bevelOffset: 0,
            bevelSegments: 2,
        };

        return new THREE.ExtrudeGeometry(shape, extrudeSettings);

    }, []);

    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.005;
            meshRef.current.position.y = Math.sin(state.clock.getElapsedTime()) * 0.2;
        }
    });

    return (
        <mesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial color={'#ff0000'} />
        </mesh>
    );
};

export function Scene() {
    return (
        <Canvas>
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
            <pointLight position={[-10, -10, -10]} />
            <CustomGeometry />
            <OrbitControls />
        </Canvas>
    );
}
