import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function Ball({ position }) {
  const meshRef = useRef();

  // Map 0-100 percentage coordinates to the 3D Plane dimensions (-50 to 50, -30 to 30)
  // Default to center pitch (50, 50) if no live data is present yet
  const rawX = position?.x ?? 50;
  const rawY = position?.y ?? 50;
  
  const targetX = (rawX / 100) * 100 - 50;
  const targetZ = (rawY / 100) * 60 - 30;

  // Generate a procedural hexagonal texture so no external image assets are needed
  const hexTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Background (White)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    
    // Hexagon pattern lines (Black)
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 6;
    
    const hexRadius = 40;
    const hexHeight = hexRadius * Math.sqrt(3);
    
    for (let x = -2; x < 15; x++) {
      for (let y = -2; y < 15; y++) {
        const cx = x * hexRadius * 1.5;
        const cy = y * hexHeight + (x % 2 === 0 ? 0 : hexHeight / 2);
        
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const hx = cx + hexRadius * Math.cos(angle);
          const hy = cy + hexRadius * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  }, []);

  useFrame(() => {
    if (meshRef.current) {
      const dx = targetX - meshRef.current.position.x;
      const dz = targetZ - meshRef.current.position.z;

      // Smooth translation
      meshRef.current.position.x += dx * 0.1;
      meshRef.current.position.z += dz * 0.1;
      
      // Calculate realistic rolling rotation based on the distance moved
      meshRef.current.rotation.x += dz * 0.15;
      meshRef.current.rotation.z -= dx * 0.15;
    }
  });

  return (
    <mesh ref={meshRef} position={[targetX, 0.4, targetZ]}>
      {/* 0.4 radius to keep it proportional to the player checkers */}
      <sphereGeometry args={[0.4, 32, 32]} />
      <meshStandardMaterial map={hexTexture} roughness={0.4} metalness={0.1} />
    </mesh>
  );
}