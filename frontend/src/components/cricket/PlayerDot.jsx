// WE CAN REMOVE THIS FILE AS IT IS THE SAME AS THE FOOTBALL ONE


import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

export default function PlayerDot({ player, onClick, isSelected }) {
  const groupRef = useRef();

  const dotColor = player.trustScore < (player.threshold || 40) ? '#ef4444' : '#3b82f6';
  const teamColor = player.team === 'Team 2' ? '#18181b' : '#f8fafc';

  const targetX = (player.x / 100) * 100 - 50;
  const targetZ = (player.y / 100) * 60 - 30;

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.05;
      groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.05;
    }
  });

  return (
    <group 
      ref={groupRef} 
      position={[targetX, 0.2, targetZ]}
      onClick={(e) => { 
        e.stopPropagation(); 
        onClick(player); 
      }}
    >
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.4, 32]} />
        <meshStandardMaterial 
          color={teamColor} 
          emissive={isSelected ? "#ffffff" : "#000000"} 
          emissiveIntensity={isSelected ? 0.4 : 0} 
          roughness={0.7}
        />
      </mesh>

      <mesh position={[0, 0.02, 0]}> 
        <cylinderGeometry args={[0.8, 0.8, 0.4, 32]} />
        <meshStandardMaterial color={dotColor} roughness={0.3} />
      </mesh>

      <Html position={[0, 1.8, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          color: 'white', 
          background: 'rgba(0,0,0,0.65)', 
          padding: '2px 6px',
          borderRadius: '4px', 
          fontSize: '10px', 
          fontWeight: 'bold', 
          whiteSpace: 'nowrap',
          border: isSelected ? '1px solid #60a5fa' : 'none'
        }}>
          {player.name}
        </div>
      </Html>
    </group>
  );
}