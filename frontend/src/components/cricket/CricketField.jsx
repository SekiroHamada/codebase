import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';

const BOWLER_POS = [0, 0.35, -9];
const BATTER_POS = [0, 0.35, 9];

function getTrustColor(score = 50) {
  if (score < 40) return '#ef4444';
  if (score < 70) return '#f59e0b';
  return '#22c55e';
}

function ThirtyYardCircle() {
  const points = useMemo(() => {
    const pts = [];
    const segments = 80;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(theta) * 25, Math.sin(theta) * 25, 0]);
    }
    return pts;
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <Line points={points} color="white" linewidth={1} dashed dashScale={5} dashSize={1} />
    </group>
  );
}

function PitchAndWickets() {
  const Wickets = ({ zPosition }) => (
    <group position={[0, 0.6, zPosition]}>
      <mesh position={[-0.4, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.2]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.2]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>
      <mesh position={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.2]} />
        <meshStandardMaterial color="#fcd34d" />
      </mesh>
    </group>
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[8, 28]} />
        <meshStandardMaterial color="#d4b483" />
      </mesh>

      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <Line points={[[-5, 10, 0], [5, 10, 0]]} color="white" linewidth={2} />
        <Line points={[[-5, -10, 0], [5, -10, 0]]} color="white" linewidth={2} />

        <Line points={[[-4, 12.5, 0], [4, 12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[-4, -12.5, 0], [4, -12.5, 0]]} color="white" linewidth={2} />

        <Line points={[[-4, 10, 0], [-4, 12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[4, 10, 0], [4, 12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[-4, -10, 0], [-4, -12.5, 0]]} color="white" linewidth={2} />
        <Line points={[[4, -10, 0], [4, -12.5, 0]]} color="white" linewidth={2} />
      </group>

      <Wickets zPosition={-12.5} />
      <Wickets zPosition={12.5} />
    </group>
  );
}

function PlayerMarker({ player, roleLabel, position, onClick, isSelected }) {
  const trustColor = getTrustColor(player?.trustScore ?? 50);

  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(player);
      }}
    >
      <mesh>
        <cylinderGeometry args={[1.2, 1.2, 0.5, 32]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.52, 32]} />
        <meshStandardMaterial color={trustColor} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.28, 0]}>
          <ringGeometry args={[1.35, 1.55, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}

      <Html position={[0, 2, 0]} center>
        <div
          style={{
            color: 'white',
            background: 'rgba(0,0,0,0.72)',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div>{player?.name || roleLabel}</div>
          <div style={{ color: '#93c5fd', fontSize: '10px' }}>
            {roleLabel} • Trust: {player?.trustScore ?? '-'}%
          </div>
        </div>
      </Html>
    </group>
  );
}

function BallAnimation({ deliveryId }) {
  const ballRef = useRef();
  const progressRef = useRef(0);

  useEffect(() => {
    progressRef.current = 0;
  }, [deliveryId]);

  useFrame((_, delta) => {
    if (!ballRef.current) return;

    progressRef.current = Math.min(1, progressRef.current + delta * 1.25);
    const t = progressRef.current;

    const x = BOWLER_POS[0] + (BATTER_POS[0] - BOWLER_POS[0]) * t;
    const z = BOWLER_POS[2] + (BATTER_POS[2] - BOWLER_POS[2]) * t;
    const y = 0.65 + Math.sin(t * Math.PI) * 1.6;

    ballRef.current.position.set(x, y, z);
  });

  return (
    <>
      {/* path line */}
      <Line
        points={[
          [BOWLER_POS[0], 0.55, BOWLER_POS[2]],
          [BATTER_POS[0], 0.55, BATTER_POS[2]]
        ]}
        color="#facc15"
        linewidth={2}
        dashed
        dashSize={0.8}
        dashScale={6}
      />

      {/* moving ball */}
      <mesh ref={ballRef} position={[BOWLER_POS[0], 0.65, BOWLER_POS[2]]}>
        <sphereGeometry args={[0.35, 24, 24]} />
        <meshStandardMaterial color="#ff4d4f" />
      </mesh>
    </>
  );
}

export default function CricketField({
  players,
  onPlayerClick,
  selectedPlayerId,
  deliveryId
}) {
  const batter = players.find((p) => p.displayRole === 'Batter');
  const bowler = players.find((p) => p.displayRole === 'Bowler');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <Canvas camera={{ position: [0, 58, 0.1], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 20, 10]} intensity={1} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} scale={[1, 0.8, 1]}>
          <circleGeometry args={[60, 64]} />
          <meshStandardMaterial color="#65a30d" />
        </mesh>

        <ThirtyYardCircle />
        <PitchAndWickets />

        {bowler && (
          <PlayerMarker
            player={bowler}
            roleLabel="Bowler"
            position={BOWLER_POS}
            onClick={onPlayerClick}
            isSelected={selectedPlayerId === bowler.id}
          />
        )}

        {batter && (
          <PlayerMarker
            player={batter}
            roleLabel="Batter"
            position={BATTER_POS}
            onClick={onPlayerClick}
            isSelected={selectedPlayerId === batter.id}
          />
        )}

        <BallAnimation deliveryId={deliveryId} />
      </Canvas>
    </div>
  );
}