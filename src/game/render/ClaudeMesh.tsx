import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ClaudeState, ShipState } from "../types";
import { CLAUDE } from "../constants";
import { wrapDelta, wrapRelative } from "../sim/math";

function ClaudeOne({
  c,
  ship,
}: {
  c: ClaudeState;
  ship: ShipState;
}) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const aura = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.position.set(
      wrapRelative(c.x, ship.x),
      1.2 + Math.sin(t * 2 + c.phase) * 0.35,
      wrapRelative(c.z, ship.z),
    );
    group.current.rotation.y = t * 0.6 + c.phase;

    const shipNear =
      Math.hypot(wrapDelta(c.x, ship.x), wrapDelta(c.z, ship.z)) <
      CLAUDE.influenceRadius;

    if (ring.current) {
      ring.current.rotation.x = t * 1.2;
      ring.current.rotation.z = t * 0.7;
      const s = 1 + Math.sin(t * 3) * 0.08;
      ring.current.scale.setScalar(s);
    }
    if (aura.current) {
      const mat = aura.current.material as THREE.MeshBasicMaterial;
      mat.opacity = shipNear ? 0.08 + Math.sin(t * 6) * 0.03 : 0.04;
      // Soft influence disc — keep modest so it never floods the camera
      const r = shipNear ? 3.2 : 1.6;
      aura.current.scale.setScalar(r / 1.5);
    }
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial
          color="#d4a574"
          emissive="#c4884a"
          emissiveIntensity={0.75}
          metalness={0.4}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0.1, 0.55]}>
        <boxGeometry args={[0.7, 0.45, 0.12]} />
        <meshStandardMaterial color="#1a1510" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[-0.16, 0.15, 0.62]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#7dd3fc" />
      </mesh>
      <mesh position={[0.16, 0.15, 0.62]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#7dd3fc" />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[1.35, 0.04, 8, 48]} />
        <meshBasicMaterial color="#d4a574" transparent opacity={0.65} />
      </mesh>
      <mesh rotation={[Math.PI / 2.5, 0.4, 0]}>
        <torusGeometry args={[1.55, 0.03, 8, 48]} />
        <meshBasicMaterial color="#f0d5b0" transparent opacity={0.35} />
      </mesh>
      <mesh ref={aura}>
        <sphereGeometry args={[1.5, 20, 20]} />
        <meshBasicMaterial
          color="#c4884a"
          transparent
          opacity={0.06}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function ClaudeMeshes({
  claudes,
  ship,
}: {
  claudes: ClaudeState[];
  ship: ShipState;
}) {
  return (
    <group>
      {claudes.map((c) => (
        <ClaudeOne key={c.id} c={c} ship={ship} />
      ))}
    </group>
  );
}
