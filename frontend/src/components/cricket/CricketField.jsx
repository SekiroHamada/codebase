import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import PlayerDot from './PlayerDot';
import PlayerTag from '../common/PlayerTag';
import Ball from './Ball';
import { FIELD_RX, FIELD_RZ, STUMPS_Z, PITCH_SCALE, ROPE_SCALE } from './geometry';
import { describeOutcome } from './trajectory';

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const FOV = 55;
// Area the overview must always show: the ground oval plus a small margin
const OVERVIEW_SPAN_X = FIELD_RX * 2 + 4;
const OVERVIEW_SPAN_Z = FIELD_RZ * 2 + 4;

// Broadcast: the classic TV angle — high behind the bowler on a long lens, looking down the pitch
const BROADCAST_FOV = 24;
const BROADCAST_POS = new THREE.Vector3(0, 11, -STUMPS_Z - 34);
const BROADCAST_TARGET = new THREE.Vector3(0, 0.6, STUMPS_Z - 1);
const SKY = '#cfe3f3';

// Ball cam: sits behind the ball (relative to its direction of travel)
const BALL_CAM_DISTANCE = 14;
const BALL_CAM_ELEVATION_DEG = 28;
const BALL_CAM_FOLLOW = 0.12;
const BALL_HEADING_TURN = 0.08;
const DOWN_THE_PITCH = Math.PI / 2; // heading towards +z (bowler -> batter)

const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

function CameraRig({ mode, ballRef }) {
  const camera = useThree((s) => s.camera);
  const getState = useThree((s) => s.get);
  const controls = useThree((s) => s.controls);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  const focus = useRef(new THREE.Vector3());
  const lastBall = useRef(new THREE.Vector3());
  const heading = useRef(DOWN_THE_PITCH);
  const desiredCam = useRef(new THREE.Vector3());

  // Overview: top-down, height fitted so the whole ground fills the panel
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

  useEffect(() => {
    // Broadcast uses a long lens; the other views keep the default one
    const cam = getState().camera;
    const fov = mode === 'broadcast' ? BROADCAST_FOV : FOV;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (mode === 'broadcast') {
      camera.position.copy(BROADCAST_POS);
      camera.lookAt(BROADCAST_TARGET);
    }
    if (mode === 'ball') {
      focus.current.copy(ballRef.current);
      lastBall.current.copy(ballRef.current);
      heading.current = DOWN_THE_PITCH;
    }
  }, [mode, camera, ballRef, getState]);

  useFrame(() => {
    if (mode !== 'ball') return;
    const ball = ballRef.current;

    // A new delivery teleports the ball back to the bowler: snap instead of swinging round
    if (ball.distanceTo(lastBall.current) > 15) {
      focus.current.copy(ball);
      heading.current = DOWN_THE_PITCH;
    } else {
      const dx = ball.x - lastBall.current.x;
      const dz = ball.z - lastBall.current.z;
      if (Math.hypot(dx, dz) > 0.02) {
        heading.current = lerpAngle(heading.current, Math.atan2(dz, dx), BALL_HEADING_TURN);
      }
      focus.current.lerp(ball, 0.25);
    }
    lastBall.current.copy(ball);

    const el = THREE.MathUtils.degToRad(BALL_CAM_ELEVATION_DEG);
    const back = BALL_CAM_DISTANCE * Math.cos(el);
    desiredCam.current.set(
      focus.current.x - Math.cos(heading.current) * back,
      focus.current.y + BALL_CAM_DISTANCE * Math.sin(el),
      focus.current.z - Math.sin(heading.current) * back
    );
    camera.position.lerp(desiredCam.current, BALL_CAM_FOLLOW);
    camera.lookAt(focus.current);
  });

  return null;
}

// ---------------------------------------------------------------------------
// Player name tags: one DOM overlay, moved to each dot's screen position every frame
// ---------------------------------------------------------------------------
const TAG_HEIGHT = 1.8; // world units above the dot
const tagKey = (p) => p.role || p.id;

function LabelProjector({ anchors, tags }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const v = useRef(new THREE.Vector3());

  useFrame(() => {
    camera.updateMatrixWorld();
    for (const [key, el] of Object.entries(tags.current)) {
      const obj = anchors.current[key];
      if (!el) continue;
      if (!obj) {
        el.style.visibility = 'hidden';
        continue;
      }
      const p = v.current.setFromMatrixPosition(obj.matrixWorld);
      p.y += TAG_HEIGHT;
      p.project(camera);
      const visible = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) {
        el.style.transform = `translate(${((p.x + 1) / 2) * width}px, ${((1 - p.y) / 2) * height}px) translate(-50%, -50%)`;
      }
    }
  });

  return null;
}

function PlayerLabels({ players, selectedPlayerId, tags }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      {players.map((player) => (
        <div
          key={tagKey(player)}
          ref={(el) => {
            tags.current[tagKey(player)] = el;
          }}
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap' }}
        >
          <PlayerTag
            name={player.role ? `${player.name} · ${player.role === 'bowler' ? 'bowling' : 'batting'}` : player.name}
            dark={player.team === 'Team 2'}
            badge={player.team === 'Team 2' ? '2' : '1'}
            isSelected={selectedPlayerId === player.id}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
const GRASS = '#4f9a2a';      // playing area inside the rope (darker than the old #84cc16)
const GRASS_EDGE = '#3f8122'; // strip between the rope and the edge of the ground
const SURROUND = '#334155';   // stands, only drawn for the low cameras
const FOUR_COLOR = '#facc15';
const SIX_COLOR = '#e879f9';

const ellipse = (rx, rz, y = 0, segments = 128) => {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(theta) * rx, y, Math.sin(theta) * rz]);
  }
  return pts;
};

const ThirtyYardCircle = () => {
  const points = useMemo(() => ellipse(30, 30, 0.02, 64), []);
  // Dashed line to represent the 30-yard circle
  return <Line points={points} color="white" linewidth={2} dashed={true} dashScale={5} dashSize={1} dashOffset={0} />;
};

/**
 * Ground: grass inside the rope, a darker strip outside it, and two rings.
 *   inner ring = boundary rope — ball crosses it along the ground: FOUR (flashes yellow)
 *   outer ring = edge of the ground — a SIX carries past the rope (flashes pink)
 */
const Ground = ({ boundary }) => {
  const rope = useMemo(() => ellipse(FIELD_RX * ROPE_SCALE, FIELD_RZ * ROPE_SCALE, 0.06), []);
  const edge = useMemo(() => ellipse(FIELD_RX, FIELD_RZ, 0.05), []);
  const squash = FIELD_RZ / FIELD_RX;

  return (
    <group>
      {/* Inside the rope, and the strip outside it as a ring: no overlapping layers to flicker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1, squash, 1]}>
        <circleGeometry args={[FIELD_RX * ROPE_SCALE, 96]} />
        <meshStandardMaterial color={GRASS} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1, squash, 1]}>
        <ringGeometry args={[FIELD_RX * ROPE_SCALE, FIELD_RX, 96, 1]} />
        <meshStandardMaterial color={GRASS_EDGE} />
      </mesh>

      <Line
        points={rope}
        color={boundary === 'four' ? FOUR_COLOR : '#f8fafc'}
        linewidth={boundary === 'four' ? 6 : 3}
      />
      <Line
        points={edge}
        color={boundary === 'six' ? SIX_COLOR : '#e2e8f0'}
        linewidth={boundary === 'six' ? 6 : 1.5}
        transparent
        opacity={boundary === 'six' ? 1 : 0.7}
      />
    </group>
  );
};

// Drawn at base size (stumps at z = ±12.5) and scaled up as one piece by PITCH_SCALE
const BASE_STUMPS_Z = 12.5;

const Wickets = ({ zPosition }) => (
  <group position={[0, 0.6, zPosition]}>
    <mesh position={[-0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#fcd34d" /></mesh>
    <mesh position={[0, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#fcd34d" /></mesh>
    <mesh position={[0.4, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2]} /><meshStandardMaterial color="#fcd34d" /></mesh>
  </group>
);

const PitchAndWickets = () => (
  <group scale={[PITCH_SCALE, PITCH_SCALE, PITCH_SCALE]}>
    {/* Rectangular Pitch */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <planeGeometry args={[8, 28]} />
      <meshStandardMaterial color="#d4b483" />
    </mesh>

    {/* Creases mapped over the pitch */}
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
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

    <Wickets zPosition={-BASE_STUMPS_Z} />
    <Wickets zPosition={BASE_STUMPS_Z} />
  </group>
);

// ---------------------------------------------------------------------------
// Delivery HUD (bowler -> batter, speed, outcome once it's decided)
// ---------------------------------------------------------------------------
const styleLabel = (s) => (s ? s.replace(/_/g, ' ').toLowerCase() : '');

function DeliveryHud({ delivery, revealed }) {
  if (!delivery) return <div className="cricket-hud cricket-hud--idle">Waiting for the first delivery…</div>;
  const outcome = describeOutcome(delivery);
  const tone = delivery.isWicket ? 'bad' : delivery.batterRuns >= 4 ? 'good' : 'neutral';
  return (
    <div className="cricket-hud">
      <div className="cricket-hud__who">
        {delivery.bowler} <span aria-hidden="true">→</span> {delivery.batter}
      </div>
      <div className="cricket-hud__meta">
        {delivery.speed ? `${(delivery.speed * 3.6).toFixed(1)} km/h` : 'speed n/a'}
        {' · '}
        <span className="cricket-hud__style">{styleLabel(delivery.bowlingStyle)}</span>
        {!delivery.pitch && !delivery.stumps && ' · no ball tracking'}
      </div>
      <div className={`cricket-hud__outcome tone-${tone} ${revealed ? 'is-shown' : ''}`}>{revealed ? outcome : '…'}</div>
    </div>
  );
}

export default function CricketField({ players, onPlayerClick, selectedPlayerId, cameraMode = 'overview', matchData }) {
  const delivery = matchData?.delivery || null;
  const ballRef = useRef(new THREE.Vector3(0, 0, 0));
  const [revealedId, setRevealedId] = useState(null);
  const revealed = !!delivery && revealedId === delivery.id;
  // Light up the rope (four) or the edge of the ground (six) once the shot is played
  const boundary = revealed && !delivery.extras ? { 4: 'four', 6: 'six' }[delivery.batterRuns] || null : null;
  const anchors = useRef({}); // tag key -> PlayerDot group
  const tags = useRef({});    // tag key -> label element

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', justifyContent: 'center' }}>
      <Canvas camera={{ position: [0, 65, 0.1], fov: FOV }}>
        {/* Overview: just the ground on the card. Low cameras: sky, haze and stands, so there's no void past the edge */}
        {cameraMode !== 'overview' && (
          <>
            <color attach="background" args={[SKY]} />
            <fog attach="fog" args={[SKY, 160, 420]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
              <planeGeometry args={[600, 600]} />
              <meshStandardMaterial color={SURROUND} />
            </mesh>
          </>
        )}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />

        <Ground boundary={boundary} />
        <ThirtyYardCircle />
        <PitchAndWickets />

        {/* Keyed by role so a strike change or new bowler moves the same dot */}
        {players.map((player) => (
          <PlayerDot
            key={tagKey(player)}
            player={player}
            onClick={onPlayerClick}
            isSelected={selectedPlayerId === player.id}
            anchorRef={(obj) => {
              anchors.current[tagKey(player)] = obj;
            }}
          />
        ))}

        <Ball delivery={delivery} positionRef={ballRef} onReveal={setRevealedId} />

        {/* After the ball, so the camera follows this frame's ball position */}
        <CameraRig mode={cameraMode} ballRef={ballRef} />
        <LabelProjector anchors={anchors} tags={tags} />

        <OrbitControls
          makeDefault
          enabled={cameraMode === 'overview'}
          target={[0, 0, 0]}
          enableRotate={true}
          enableZoom={true}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>

      <PlayerLabels players={players} selectedPlayerId={selectedPlayerId} tags={tags} />
      <DeliveryHud delivery={delivery} revealed={revealed} />
    </div>
  );
}
