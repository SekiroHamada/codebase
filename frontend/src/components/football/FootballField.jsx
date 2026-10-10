import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import PlayerDot from './PlayerDot';

const FieldLines = () => {
  const lineMaterial = { color: 'white', linewidth: 2 };

  // Helper function to calculate precise points for arcs and circles
  const createArc = (x, y, radius, startAngle, endAngle, segments = 32) => {
    const points = [];
    const step = (endAngle - startAngle) / segments;
    for (let i = 0; i <= segments; i++) {
      const theta = startAngle + i * step;
      points.push([x + Math.cos(theta) * radius, y + Math.sin(theta) * radius, 0]);
    }
    return points;
  };

  // Pre-calculate arc coordinates to prevent recalculating every frame
  const centerCircle = useMemo(() => createArc(0, 0, 9, 0, Math.PI * 2, 64), []);
  const leftArc = useMemo(() => createArc(-40, 0, 9, -0.841, 0.841), []);
  const rightArc = useMemo(() => createArc(40, 0, 9, Math.PI - 0.841, Math.PI + 0.841), []);
  
  // Corner Arcs mapped to their specific quadrants
  const cornerBL = useMemo(() => createArc(-50, -30, 1, 0, Math.PI/2), []);
  const cornerBR = useMemo(() => createArc(50, -30, 1, Math.PI/2, Math.PI), []);
  const cornerTR = useMemo(() => createArc(50, 30, 1, Math.PI, Math.PI * 1.5), []);
  const cornerTL = useMemo(() => createArc(-50, 30, 1, -Math.PI/2, 0), []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
      {/* Outer Boundary */}
      <Line points={[[-50, -30, 0], [50, -30, 0], [50, 30, 0], [-50, 30, 0], [-50, -30, 0]]} {...lineMaterial} />
      
      {/* Halfway Line */}
      <Line points={[[0, -30, 0], [0, 30, 0]]} {...lineMaterial} />

      {/* Center Circle & Center Spot */}
      <Line points={centerCircle} {...lineMaterial} />
      <mesh><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="white" /></mesh>

      {/* --- LEFT SIDE --- */}
      {/* Penalty Area */}
      <Line points={[[-50, -18, 0], [-34, -18, 0], [-34, 18, 0], [-50, 18, 0]]} {...lineMaterial} />
      {/* Goal Area */}
      <Line points={[[-50, -9, 0], [-44, -9, 0], [-44, 9, 0], [-50, 9, 0]]} {...lineMaterial} />
      {/* Goal Post (Protruding outside the field) */}
      <Line points={[[-50, -4, 0], [-52, -4, 0], [-52, 4, 0], [-50, 4, 0]]} {...lineMaterial} />
      {/* D-Arc and Penalty Spot */}
      <Line points={leftArc} {...lineMaterial} /> 
      <mesh position={[-40, 0, 0]}><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="white" /></mesh>

      {/* --- RIGHT SIDE --- */}
      {/* Penalty Area */}
      <Line points={[[50, -18, 0], [34, -18, 0], [34, 18, 0], [50, 18, 0]]} {...lineMaterial} />
      {/* Goal Area */}
      <Line points={[[50, -9, 0], [44, -9, 0], [44, 9, 0], [50, 9, 0]]} {...lineMaterial} />
      {/* Goal Post (Protruding outside the field) */}
      <Line points={[[50, -4, 0], [52, -4, 0], [52, 4, 0], [50, 4, 0]]} {...lineMaterial} />
      {/* D-Arc and Penalty Spot */}
      <Line points={rightArc} {...lineMaterial} /> 
      <mesh position={[40, 0, 0]}><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="white" /></mesh>
      
      {/* Corner Arcs */}
      <Line points={cornerBL} {...lineMaterial} />
      <Line points={cornerBR} {...lineMaterial} />
      <Line points={cornerTR} {...lineMaterial} />
      <Line points={cornerTL} {...lineMaterial} />
    </group>
  );
};

export default function FootballField({ players, onPlayerClick, selectedPlayerId }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', justifyContent: 'center' }}>
      <Canvas camera={{ position: [0, 70, 0.1], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        
        {/* Pitch Ground Plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[110, 70]} /> 
          <meshStandardMaterial color="#3A5311" /> 
        </mesh>

        <FieldLines />

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