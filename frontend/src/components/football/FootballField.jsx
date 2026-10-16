import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import PlayerDot from './PlayerDot';
import Ball from './Ball';


// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const FOV = 50;
// Area the overview must always show: pitch (100 x 60) + goals + a small margin
const OVERVIEW_SPAN_X = 112;
const OVERVIEW_SPAN_Z = 66;

// Ball cam: camera sits behind the ball (relative to its direction of travel),
// BALL_CAM_DISTANCE away, looking down at BALL_CAM_ELEVATION_DEG from the ground.
const BALL_CAM_DISTANCE = 22;
const BALL_CAM_ELEVATION_DEG = 45;
const BALL_CAM_FOLLOW = 0.08;   // how quickly the camera catches up (0–1 per frame)
const BALL_HEADING_TURN = 0.03; // how quickly "behind" swings round when the ball changes direction

const toPitch = (pos) => ({
  x: (pos.x / 100) * 100 - 50,
  z: (pos.y / 100) * 60 - 30,
});

const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

function CameraRig({ mode, ballPosition }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  const focus = useRef(new THREE.Vector3());
  const lastFocus = useRef(new THREE.Vector3());
  const heading = useRef(0); // radians in the x/z plane; 0 = camera looks towards +x
  const desiredCam = useRef(new THREE.Vector3());

  // Overview: same top-down camera as before, height fitted so the whole pitch fills the panel
  useEffect(() => {
    if (mode !== 'overview') return;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = width / Math.max(height, 1);
    const h = Math.max(OVERVIEW_SPAN_Z / 2, OVERVIEW_SPAN_X / 2 / aspect) / tanHalf;
    camera.position.set(0, h, 0.1);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [mode, width, height, camera, controls]);

  // Ball cam: start from wherever the ball currently is
  useEffect(() => {
    if (mode !== 'ball') return;
    if (ballPosition && ballPosition.x !== 'NaN' && ballPosition.y !== 'NaN') {
      const { x, z } = toPitch(ballPosition);
      focus.current.set(x, 0, z);
      lastFocus.current.copy(focus.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useFrame(() => {
    if (mode !== 'ball') return;

    // Hold the last known spot while the ball is out of play (NaN)
    if (ballPosition && ballPosition.x !== 'NaN' && ballPosition.y !== 'NaN') {
      const { x, z } = toPitch(ballPosition);
      focus.current.x += (x - focus.current.x) * 0.1; // same smoothing as Ball.jsx
      focus.current.z += (z - focus.current.z) * 0.1;
    }

    // Direction of travel -> which side is "behind" the ball
    const dx = focus.current.x - lastFocus.current.x;
    const dz = focus.current.z - lastFocus.current.z;
    if (Math.hypot(dx, dz) > 0.015) {
      heading.current = lerpAngle(heading.current, Math.atan2(dz, dx), BALL_HEADING_TURN);
    }
    lastFocus.current.copy(focus.current);

    const el = THREE.MathUtils.degToRad(BALL_CAM_ELEVATION_DEG);
    const back = BALL_CAM_DISTANCE * Math.cos(el);
    desiredCam.current.set(
      focus.current.x - Math.cos(heading.current) * back,
      BALL_CAM_DISTANCE * Math.sin(el),
      focus.current.z - Math.sin(heading.current) * back
    );
    camera.position.lerp(desiredCam.current, BALL_CAM_FOLLOW);
    camera.lookAt(focus.current);
  });

  return null;
}

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

export default function FootballField({ players, onPlayerClick, selectedPlayerId, ballPosition, cameraMode = 'overview' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', justifyContent: 'center' }}>
      <Canvas camera={{ position: [0, 70, 0.1], fov: FOV }}>
        <CameraRig mode={cameraMode} ballPosition={ballPosition} />

        
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        
        {/* Pitch Ground Plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          {/* Larger than the pitch so no background shows around it in either camera */}
          <planeGeometry args={[400, 300]} />
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
        <OrbitControls
          makeDefault
          enabled={cameraMode === 'overview'}
          target={[0, 0, 0]}
          enableRotate={true}
          enableZoom={true}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}