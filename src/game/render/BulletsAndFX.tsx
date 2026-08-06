import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_HALF } from "../constants";
import type { BulletState, Particle, ShipState } from "../types";
import { wrapRelative } from "../sim/math";

function BulletMesh({ b, ship }: { b: BulletState; ship: ShipState }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.set(
      wrapRelative(b.x, ship.x),
      0.35,
      wrapRelative(b.z, ship.z),
    );
  });
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[b.radius * 1.3, 8, 8]} />
      <meshBasicMaterial color="#bae6fd" transparent opacity={0.95} />
    </mesh>
  );
}

export function Bullets({
  bullets,
  ship,
}: {
  bullets: BulletState[];
  ship: ShipState;
}) {
  return (
    <group>
      {bullets.map((b) => (
        <BulletMesh key={b.id} b={b} ship={ship} />
      ))}
    </group>
  );
}

function ParticleMesh({ p, ship }: { p: Particle; ship: ShipState }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    const alpha = Math.max(0, p.life / p.maxLife);
    mesh.current.position.set(
      wrapRelative(p.x, ship.x),
      Math.max(0, p.y),
      wrapRelative(p.z, ship.z),
    );
    mesh.current.scale.setScalar(p.size * (0.5 + alpha));
    const mat = mesh.current.material as THREE.MeshBasicMaterial;
    mat.opacity = alpha * 0.85;
  });
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={p.color}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Particles({
  particles,
  ship,
}: {
  particles: Particle[];
  ship: ShipState;
}) {
  return (
    <group>
      {particles.map((p) => (
        <ParticleMesh key={p.id} p={p} ship={ship} />
      ))}
    </group>
  );
}

/** Boundary ring tracks WORLD_HALF so the arena edge stays readable. */
export function PlayfieldRing() {
  const outer = WORLD_HALF;
  const inner = WORLD_HALF - 0.9;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <ringGeometry args={[inner, outer, 96]} />
      <meshBasicMaterial
        color="#1e293b"
        transparent
        opacity={0.28}
        side={2}
      />
    </mesh>
  );
}
