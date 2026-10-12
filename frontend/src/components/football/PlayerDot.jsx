import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as d3 from 'd3';

export default function PlayerDot({ player, onClick, isSelected }) {
  const meshRef = useRef();

  const dotColor = player.trustScore < (player.threshold || 40) ? '#ef4444' : '#3b82f6';

  // Map 0-100 percentage coordinates to the 3D Plane dimensions (Width: 100, Depth: 60)
  const targetX = (player.x / 100) * 100 - 50;
  const targetZ = (player.y / 100) * 60 - 30;

  // Smooth animation for moving dots when real-time data updates
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.x += (targetX - meshRef.current.position.x) * 0.05;
      meshRef.current.position.z += (targetZ - meshRef.current.position.z) * 0.05;
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      position={[targetX, 1, targetZ]} 
      onClick={(e) => { e.stopPropagation(); onClick(player); }}
    >
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial 
        color={dotColor} 
        emissive={isSelected ? "#ffffff" : "#000000"} 
        emissiveIntensity={isSelected ? 0.5 : 0} 
      />
      {/* Floating 2D Label over 3D Space */}
      <Html position={[0, 2, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          color: 'white', background: 'rgba(0,0,0,0.6)', padding: '2px 6px',
          borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          {player.name}
        </div>
      </Html>
    </mesh>
  );
}