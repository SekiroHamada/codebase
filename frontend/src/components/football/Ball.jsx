import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function Ball({ position }) {
  const meshRef = useRef();

  // Determine if the ball is currently tracked on the field
  const isVisible = position && position.x !== 'NaN' && position.y !== 'NaN';

  // Generate a procedural hexagonal texture
  const hexTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    
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
      // Toggle visibility based on Metrica tracking data
      meshRef.current.visible = isVisible;

      // Skip movement math if the ball is out of play to prevent WebGL NaN errors
      if (!isVisible) return;

      const targetX = (position.x / 100) * 100 - 50;
      const targetZ = (position.y / 100) * 60 - 30;

      const dx = targetX - meshRef.current.position.x;
      const dz = targetZ - meshRef.current.position.z;

      // Smooth translation
      meshRef.current.position.x += dx * 0.1;
      meshRef.current.position.z += dz * 0.1;
      
      // Calculate realistic rolling rotation
      meshRef.current.rotation.x += dz * 0.15;
      meshRef.current.rotation.z -= dx * 0.15;
    }
  });

  return (
    // Set initial spawn to center [0, 0.4, 0] so it doesn't break on a NaN start frame
    <mesh ref={meshRef} position={[0, 0.4, 0]}>
      <sphereGeometry args={[0.4, 32, 32]} />
      <meshStandardMaterial map={hexTexture} roughness={0.4} metalness={0.1} />
    </mesh>
  );
}