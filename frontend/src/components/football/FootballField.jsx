import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import PlayerDot from './PlayerDots';

export default function FootballField({ players, onPlayerClick, selectedPlayerId }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
      <Canvas camera={{ position: [0, 40, 40], fov: 60 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        
        {/* Digital 3D Pitch Layer */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[100, 60]} />
          <meshStandardMaterial color="#1b5e20" /> {/* Dark Grass Green */}
        </mesh>

        {/* Render 22 on-field player dots */}
        {players.map(player => (
          <PlayerDot 
            key={player.id} 
            player={player} 
            onClick={onPlayerClick}
            isSelected={selectedPlayerId === player.id}
          />
        ))}

        <OrbitControls enableRotate={true} enableZoom={true} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}