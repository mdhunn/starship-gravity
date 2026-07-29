import { WORLD_HALF, WORLD_SIZE } from "../constants";
import type { BulletState, Particle } from "../types";

export function Bullets({ bullets }: { bullets: BulletState[] }) {
  return (
    <group>
      {bullets.map((b) => (
        <mesh key={b.id} position={[b.x, 0.35, b.z]}>
          <sphereGeometry args={[b.radius * 1.3, 8, 8]} />
          <meshBasicMaterial color="#bae6fd" transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  );
}

export function Particles({ particles }: { particles: Particle[] }) {
  return (
    <group>
      {particles.map((p) => {
        const alpha = Math.max(0, p.life / p.maxLife);
        return (
          <mesh
            key={p.id}
            position={[p.x, Math.max(0, p.y), p.z]}
            scale={p.size * (0.5 + alpha)}
          >
            <sphereGeometry args={[1, 6, 6]} />
            <meshBasicMaterial
              color={p.color}
              transparent
              opacity={alpha * 0.85}
              depthWrite={false}
            />
          </mesh>
        );
      })}
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

/**
 * Floor grid spans the full wrap-around field (~2.5× original).
 * Cell size stays ~6 units so lines remain readable at play height.
 */
export function GridFloor() {
  const divisions = Math.round(WORLD_SIZE / 6);
  return (
    <gridHelper
      args={[WORLD_SIZE, divisions, "#1a2236", "#0e1422"]}
      position={[0, -0.6, 0]}
    />
  );
}
