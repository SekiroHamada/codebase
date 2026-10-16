import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildTrajectory, BALL_RADIUS } from './trajectory';

const TRAIL_SAMPLES = 220;

/**
 * Cricket ball replaying one Hawkeye delivery.
 *
 * Every new `delivery.id` restarts the animation from the bowler's hand. While it plays,
 * the ball leaves a trail and drops a marker where it pitched. The ball's live world
 * position is written to `positionRef` so the camera can follow it, and `onReveal(id)`
 * fires once the outcome is decided (bat, pad or stumps) so the HUD can show it.
 */
export default function Ball({ delivery, positionRef, onReveal }) {
  const groupRef = useRef();
  const spinRef = useRef();
  const markerRef = useRef();
  const clock = useRef({ id: null, start: 0, revealed: false });

  const path = useMemo(() => (delivery ? buildTrajectory(delivery) : null), [delivery]);

  // Trail: the whole path sampled up front, revealed progressively with drawRange
  const trail = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_SAMPLES * 3);
    if (path) {
      for (let i = 0; i < TRAIL_SAMPLES; i++) {
        const p = path.at(path.releaseAt + ((path.total - path.releaseAt) * i) / (TRAIL_SAMPLES - 1));
        positions.set(p, i * 3);
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({ color: '#fef3c7', transparent: true, opacity: 0.75 });
    return new THREE.Line(geometry, material);
  }, [path]);

  useEffect(
    () => () => {
      trail.geometry.dispose();
      trail.material.dispose();
    },
    [trail]
  );

  useFrame((state, dt) => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = !!path;
    if (!path) return;

    const now = state.clock.elapsedTime;
    if (clock.current.id !== delivery.id) {
      clock.current = { id: delivery.id, start: now, revealed: false };
    }
    const t = now - clock.current.start;
    const [x, y, z] = path.at(t);
    group.position.set(x, y, z);
    if (positionRef) positionRef.current.set(x, y, z);

    // Seam spins only while the ball is moving
    if (spinRef.current && t > path.releaseAt && t < path.total) {
      spinRef.current.rotation.x += dt * 25;
    }

    const flown = Math.min(Math.max((t - path.releaseAt) / (path.total - path.releaseAt), 0), 1);
    trail.geometry.setDrawRange(0, Math.floor(flown * (TRAIL_SAMPLES - 1)) + 1);

    if (markerRef.current) {
      markerRef.current.visible = !!path.bounce && t >= path.bounceAt;
    }

    if (!clock.current.revealed && t >= path.revealAt) {
      clock.current.revealed = true;
      onReveal?.(delivery.id);
    }
  });

  return (
    <>
      <group ref={groupRef} visible={false}>
        <group ref={spinRef}>
          <mesh>
            <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
            <meshStandardMaterial color="#b91c1c" roughness={0.35} emissive="#7f1d1d" emissiveIntensity={0.35} />
          </mesh>
          {/* Seam */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[BALL_RADIUS * 1.005, BALL_RADIUS * 0.08, 8, 48]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} />
          </mesh>
        </group>
      </group>

      <primitive object={trail} />

      {/* Where it pitched (Hawkeye pitchX / pitchY) */}
      {path?.bounce && (
        <mesh ref={markerRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[path.bounce[0], 0.035, path.bounce[2]]}>
          <circleGeometry args={[0.45, 32]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.85} />
        </mesh>
      )}
    </>
  );
}
