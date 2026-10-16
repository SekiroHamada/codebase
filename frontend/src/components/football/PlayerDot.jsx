import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import PlayerTag from '../common/PlayerTag';

export default function PlayerDot({ player, onClick, isSelected }) {
  const groupRef = useRef();

  // Determine trust score color (Inner Layer)
  const dotColor = player.trustScore < (player.threshold || 40) ? '#ef4444' : '#3b82f6';
  
  // Determine team color (Outer Layer: White for Home, Black for Away)
  const teamColor = player.team === 'Away' ? '#000000' : '#ffffff';

  // Map 0-100 percentage coordinates to the 3D Plane dimensions (Width: 100, Depth: 60)
  const targetX = (player.x / 100) * 100 - 50;
  const targetZ = (player.y / 100) * 60 - 30;

  // Smooth animation for moving dots when real-time data updates
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.05;
      groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.05;
    }
  });

  return (
    <group 
      ref={groupRef} 
      position={[targetX, 0.2, targetZ]} // Lowered y-axis so the checker rests on the pitch
      onClick={(e) => { 
        e.stopPropagation(); 
        onClick(player); 
      }}
    >
      {/* Outer Layer: Team Color */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.4, 32]} />
        <meshStandardMaterial 
          color={teamColor} 
          emissive={isSelected ? "#ffffff" : "#000000"} 
          emissiveIntensity={isSelected ? 0.4 : 0} 
          roughness={0.7}
        />
      </mesh>

      {/* Inner Layer: Trust Score */}
      {/* Placed slightly higher on the Y-axis (0.02) to prevent flickering where meshes overlap */}
      <mesh position={[0, 0.02, 0]}> 
        <cylinderGeometry args={[0.4, 0.4, 0.4, 32]} />
        <meshStandardMaterial color={dotColor} roughness={0.3} />
      </mesh>

      {/* Floating 2D Label over 3D Space */}
      <Html position={[0, 1.8, 0]} center style={{ pointerEvents: 'none' }}>
        <PlayerTag
          name={player.name}
          dark={player.team === 'Away'}
          badge={player.team === 'Away' ? 'A' : 'H'}
          isSelected={isSelected}
        />
      </Html>
    </group>
  );
}