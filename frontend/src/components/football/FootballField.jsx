import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import PlayerDot from './PlayerDot';
import Ball from './Ball';

const FieldLines = () => {
  const lineMaterial = { color: 'white', linewidth: 2 };

  const createArc = (x, y, radius, startAngle, endAngle, segments = 32) => {
    const points = [];
    const step = (endAngle - startAngle) / segments;
    for (let i = 0; i <= segments; i++) {
      const theta = startAngle + i * step;
      points.push([x + Math.cos(theta) * radius, y + Math.sin(theta) * radius, 0]);
    }
    return points;
  };

  const centerCircle = useMemo(() => createArc(0, 0, 9, 0, Math.PI * 2, 64), []);
  const leftArc = useMemo(() => createArc(-40, 0, 9, -0.841, 0.841), []);
  const rightArc = useMemo(() => createArc(40, 0, 9, Math.PI - 0.841, Math.PI + 0.841), []);
  
  const cornerBL = useMemo(() => createArc(-50, -30, 1, 0, Math.PI/2), []);
  const cornerBR = useMemo(() => createArc(50, -30, 1, Math.PI/2, Math.PI), []);
  const cornerTR = useMemo(() => createArc(50, 30, 1, Math.PI, Math.PI * 1.5), []);
  const cornerTL = useMemo(() => createArc(-50, 30, 1, -Math.PI/2, 0), []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
      <Line points={[[-50, -30, 0], [50, -30, 0], [50, 30, 0], [-50, 30, 0], [-50, -30, 0]]} {...lineMaterial} />
      <Line points={[[0, -30, 0], [0, 30, 0]]} {...lineMaterial} />
      <Line points={centerCircle} {...lineMaterial} />
      <mesh><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="white" /></mesh>

      {/* --- LEFT SIDE --- */}
      <Line points={[[-50, -18, 0], [-34, -18, 0], [-34, 18, 0], [-50, 18, 0]]} {...lineMaterial} />
      <Line points={[[-50, -9, 0], [-44, -9, 0], [-44, 9, 0], [-50, 9, 0]]} {...lineMaterial} />
      <Line points={[[-50, -4, 0], [-52, -4, 0], [-52, 4, 0], [-50, 4, 0]]} {...lineMaterial} />
      <Line points={leftArc} {...lineMaterial} /> 
      <mesh position={[-40, 0, 0]}><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="white" /></mesh>

      {/* --- RIGHT SIDE --- */}
      <Line points={[[50, -18, 0], [34, -18, 0], [34, 18, 0], [50, 18, 0]]} {...lineMaterial} />
      <Line points={[[50, -9, 0], [44, -9, 0], [44, 9, 0], [50, 9, 0]]} {...lineMaterial} />
      <Line points={[[50, -4, 0], [52, -4, 0], [52, 4, 0], [50, 4, 0]]} {...lineMaterial} />
      <Line points={rightArc} {...lineMaterial} /> 
      <mesh position={[40, 0, 0]}><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="white" /></mesh>
      
      <Line points={cornerBL} {...lineMaterial} />
      <Line points={cornerBR} {...lineMaterial} />
      <Line points={cornerTR} {...lineMaterial} />
      <Line points={cornerTL} {...lineMaterial} />
    </group>
  );
};

// Fully Framed 3D Goal Posts with Net
const Goal3D = ({ isLeft }) => {
  const sign = isLeft ? -1 : 1;
  const x = 50 * sign;
  const height = 2.66; 
  const width = 8;
  const depth = 2; 
  const radius = 0.08; // Slightly thinner so the full frame doesn't look too bulky

  return (
    <group position={[x, 0, 0]}>
      {/* ================= POSTS & BARS ================= */}
      
      {/* 1. Front Vertical Posts */}
      <mesh position={[0, height / 2, -width / 2]}>
        <cylinderGeometry args={[radius, radius, height, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[0, height / 2, width / 2]}>
        <cylinderGeometry args={[radius, radius, height, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* 2. Back Vertical Posts */}
      <mesh position={[sign * depth, height / 2, -width / 2]}>
        <cylinderGeometry args={[radius, radius, height, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[sign * depth, height / 2, width / 2]}>
        <cylinderGeometry args={[radius, radius, height, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* 3. Top Crossbars (Front & Back) */}
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, width + radius * 2, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[sign * depth, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, width + radius * 2, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* 4. Top Side Bars */}
      <mesh position={[sign * (depth / 2), height, -width / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, depth, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[sign * (depth / 2), height, width / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, depth, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* 5. Bottom Ground Bars (Back & Sides) */}
      <mesh position={[sign * depth, radius, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius, radius, width + radius * 2, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[sign * (depth / 2), radius, -width / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, depth, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[sign * (depth / 2), radius, width / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, depth, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* ================= WIREFRAME NETTING ================= */}

      {/* Back Net */}
      <mesh position={[sign * depth, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        {/* width, height, widthSegments, heightSegments */}
        <planeGeometry args={[width, height, 40, 14]} />
        <meshBasicMaterial color="#ffffff" wireframe={true} transparent={true} opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      {/* Top Net */}
      <mesh position={[sign * (depth / 2), height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[depth, width, 10, 40]} />
        <meshBasicMaterial color="#ffffff" wireframe={true} transparent={true} opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      {/* Left Side Net */}
      <mesh position={[sign * (depth / 2), height / 2, -width / 2]}>
        <planeGeometry args={[depth, height, 10, 14]} />
        <meshBasicMaterial color="#ffffff" wireframe={true} transparent={true} opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      {/* Right Side Net */}
      <mesh position={[sign * (depth / 2), height / 2, width / 2]}>
        <planeGeometry args={[depth, height, 10, 14]} />
        <meshBasicMaterial color="#ffffff" wireframe={true} transparent={true} opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

export default function FootballField({ players, onPlayerClick, selectedPlayerId,ballPosition }) {
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

        <Goal3D isLeft={true} />
        <Goal3D isLeft={false} />

        {/* Render the Ball */}
        <Ball position={ballPosition} />

        
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