import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CHOKE_THRESHOLD } from '../dashboard/trust';
import { percentToWorld } from './geometry';

/**
 * Bowler / striker marker. Positions come from the backend as % of the ground oval
 * (50/50 = centre), so they're converted with the same geometry as the ball.
 *
 * The name tag is not drawn here: CricketField's PlayerLabels overlay follows the
 * group passed to `anchorRef`. (drei's <Html> gives every tag its own React root,
 * which React 19 can drop when the striker or bowler changes.)
 */
export default function PlayerDot({ player, onClick, isSelected, anchorRef }) {
  const groupRef = useRef();

  const dotColor = player.trustScore < (player.threshold || CHOKE_THRESHOLD) ? '#ef4444' : '#3b82f6';
  const teamColor = player.team === 'Team 2' ? '#18181b' : '#f8fafc';

  const { x: targetX, z: targetZ } = percentToWorld(player.x, player.y);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.08;
      groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.08;
    }
  });

  return (
    <group
      ref={(obj) => {
        groupRef.current = obj;
        anchorRef?.(obj);
      }}
      position={[targetX, 0.2, targetZ]}
      onClick={(e) => {
        e.stopPropagation();
        onClick(player);
      }}
    >
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.4, 32]} />
        <meshStandardMaterial
          color={teamColor}
          emissive={isSelected ? '#ffffff' : '#000000'}
          emissiveIntensity={isSelected ? 0.4 : 0}
          roughness={0.7}
        />
      </mesh>

      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.62, 0.62, 0.4, 32]} />
        <meshStandardMaterial color={dotColor} roughness={0.3} />
      </mesh>
    </group>
  );
}
