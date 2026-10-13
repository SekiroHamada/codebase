import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import PlayerDot from './PlayerDot';

const ThirtyYardCircle = () => {
  const points = useMemo(() => {
    const pts = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(theta) * 25, Math.sin(theta) * 25, 0]);
    }
    return pts;
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      {/* Dashed line to represent the 30-yard circle */}
      <Line 
        points={points} 
        color="white" 
        linewidth={2} 
        dashed={true} 
        dashScale={5} 
        dashSize={1} 
        dashOffset={0} 
      />
    </group>
  );
};

const PitchAndWickets = () => {
  // Generates the 3 stumps on either side
  const Wickets = ({ zPosition }) => (
    <group position={[0, 0.6, zPosition]}>
       <mesh position={[-0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#fcd34d" /></mesh>
       <mesh position={[0, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#fcd34d" /></mesh>
       <mesh position={[0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#fcd34d" /></mesh>
    </group>
  );

  return (
    <group>
      {/* Rectangular Pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[8, 28]} />
        <meshStandardMaterial color="#d4b483" />
      </mesh>

      {/* Creases mapped over the pitch */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        {/* Popping Creases (front line for the batter/bowler) */}
        <Line points={[[-5, 10, 0], [5, 10, 0]]} color="white" linewidth={2} />
        <Line points={[[-5, -10, 0], [5, -10, 0]]} color="white" linewidth={2} />
        
        {/* Bowling Creases (in line with the wickets) */}
        <Line points={[[-4, 12.5, 0], [4, 12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[-4, -12.5, 0], [4, -12.5, 0]]} color="white" linewidth={2} />

        {/* Return Creases (side boundaries of the popping crease) */}
        <Line points={[[-4, 10, 0], [-4, 12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[4, 10, 0], [4, 12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[-4, -10, 0], [-4, -12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[4, -10, 0], [4, -12.5, 0]]} color="white" linewidth={2} />
      </group>

      <Wickets zPosition={-12.5} />
      <Wickets zPosition={12.5} />
    </group>
  );
};

export default function CricketField({ players, onPlayerClick, selectedPlayerId }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', justifyContent: 'center' }}>
      <Canvas camera={{ position: [0, 65, 0.1], fov: 55 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        
        {/* Ground Oval (Boundary limit) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} scale={[1, 0.8, 1]}>
          <circleGeometry args={[60, 64]} /> 
          {/* Using a bright grass green comparable to the provided diagram */}
          <meshStandardMaterial color="#84cc16" /> 
        </mesh>

        <ThirtyYardCircle />
        <PitchAndWickets />

        {players.map(player => (
          <PlayerDot 
            key={player.id} 
            player={player} 
            onClick={onPlayerClick}
            isSelected={selectedPlayerId === player.id}
          />
        ))}

        <OrbitControls target={[0, 0, 0]} enableRotate={true} enableZoom={true} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}