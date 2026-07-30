import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ShipState } from "../types";

/**
 * SpaceX Starship upper stage (Ship) inspired model.
 * Stainless body, black nose/body TPS, forward canards, aft flaps, 3 Raptor bells.
 * Local space: nose along −Z, engines at +Z (matches yaw=0 forward).
 */
export function ShipMesh({
  ship,
  getThrusting,
}: {
  ship: ShipState;
  getThrusting: () => boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const plume = useRef<THREE.Group>(null);

  const steel = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c5c9cc",
        metalness: 0.88,
        roughness: 0.32,
      }),
    [],
  );
  const steelDark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#9aa0a6",
        metalness: 0.85,
        roughness: 0.4,
      }),
    [],
  );
  const tps = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a1b1e",
        metalness: 0.15,
        roughness: 0.78,
      }),
    [],
  );
  const tpsTile = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2a2c30",
        metalness: 0.12,
        roughness: 0.82,
      }),
    [],
  );
  const engine = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6b7280",
        metalness: 0.75,
        roughness: 0.35,
        emissive: "#1e293b",
        emissiveIntensity: 0.15,
      }),
    [],
  );
  const windowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0f172a",
        metalness: 0.4,
        roughness: 0.2,
        emissive: "#38bdf8",
        emissiveIntensity: 0.25,
      }),
    [],
  );

  useFrame((state) => {
    if (!group.current) return;
    group.current.position.set(ship.x, 0.55, ship.z);
    group.current.rotation.y = ship.yaw;
    const thrusting = getThrusting();
    group.current.rotation.z = THREE.MathUtils.lerp(
      group.current.rotation.z,
      thrusting ? Math.sin(state.clock.elapsedTime * 8) * 0.03 : 0,
      0.1,
    );
    group.current.position.y =
      0.55 + Math.sin(state.clock.elapsedTime * 2.4) * 0.04;

    // Length contraction along hull (local −Z) as speed → c
    const speed = Math.hypot(ship.vx, ship.vz);
    const beta = Math.min(0.995, speed / 48);
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    const compress = 1 / gamma;
    const fatten = 1 + (gamma - 1) * 0.12;
    group.current.scale.set(1.15 * fatten, 1.15 * fatten, 1.15 * compress);

    if (plume.current) {
      plume.current.visible = thrusting && ship.alive;
      if (thrusting) {
        const s = 0.85 + Math.random() * 0.35;
        plume.current.scale.set(s * 0.85, s, s * 0.85);
      }
    }

    if (ship.invuln > 0) {
      group.current.visible = Math.sin(state.clock.elapsedTime * 22) > -0.25;
    } else {
      group.current.visible = ship.alive;
    }
  });

  if (!ship.alive) return null;

  const R = 0.38;
  const bodyLen = 2.35;
  const noseLen = 0.95;

  return (
    <group ref={group} scale={1.15}>
      <group>
        {/* Main stainless barrel */}
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, bodyLen * 0.08]}
          material={steel}
        >
          <cylinderGeometry args={[R, R, bodyLen, 24]} />
        </mesh>

        {/* Aft skirt */}
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, bodyLen * 0.5 + 0.12]}
          material={steelDark}
        >
          <cylinderGeometry args={[R * 0.92, R * 1.02, 0.28, 20]} />
        </mesh>

        {/* Nose cone — tip toward −Z */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, -bodyLen * 0.5 - noseLen * 0.28]}
          material={steel}
        >
          <coneGeometry args={[R, noseLen, 24]} />
        </mesh>

        {/* Windward TPS strip */}
        <mesh position={[0, -R * 0.55, 0.05]} material={tps}>
          <boxGeometry args={[R * 1.15, R * 0.18, bodyLen * 0.92]} />
        </mesh>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -R * 0.12, -bodyLen * 0.5 - noseLen * 0.28]}
          material={tpsTile}
          scale={[1, 1, 0.55]}
        >
          <coneGeometry args={[R * 0.98, noseLen * 0.95, 16, 1, true]} />
        </mesh>

        {/* Header tank band */}
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -bodyLen * 0.12]}
          material={steelDark}
        >
          <cylinderGeometry args={[R * 1.02, R * 1.02, 0.14, 24]} />
        </mesh>

        <mesh position={[0, R * 0.35, -bodyLen * 0.22]} material={windowMat}>
          <boxGeometry args={[0.14, 0.08, 0.1]} />
        </mesh>

        {/* Forward canards */}
        <mesh
          position={[R * 0.95, 0, -bodyLen * 0.28]}
          rotation={[0, 0.15, 0.55]}
          material={steel}
        >
          <boxGeometry args={[0.55, 0.04, 0.32]} />
        </mesh>
        <mesh
          position={[-R * 0.95, 0, -bodyLen * 0.28]}
          rotation={[0, -0.15, -0.55]}
          material={steel}
        >
          <boxGeometry args={[0.55, 0.04, 0.32]} />
        </mesh>
        <mesh
          position={[R * 0.7, -0.08, -bodyLen * 0.22]}
          rotation={[0.2, 0.1, 0.4]}
          material={steelDark}
        >
          <boxGeometry args={[0.35, 0.03, 0.22]} />
        </mesh>
        <mesh
          position={[-R * 0.7, -0.08, -bodyLen * 0.22]}
          rotation={[0.2, -0.1, -0.4]}
          material={steelDark}
        >
          <boxGeometry args={[0.35, 0.03, 0.22]} />
        </mesh>

        {/* Aft body flaps */}
        <mesh
          position={[R * 0.85, -0.05, bodyLen * 0.38]}
          rotation={[0.1, -0.05, 0.35]}
          material={steel}
        >
          <boxGeometry args={[0.85, 0.05, 0.55]} />
        </mesh>
        <mesh
          position={[-R * 0.85, -0.05, bodyLen * 0.38]}
          rotation={[0.1, 0.05, -0.35]}
          material={steel}
        >
          <boxGeometry args={[0.85, 0.05, 0.55]} />
        </mesh>
        <mesh
          position={[R * 0.85, -0.1, bodyLen * 0.38]}
          rotation={[0.1, -0.05, 0.35]}
          material={tps}
        >
          <boxGeometry args={[0.8, 0.02, 0.5]} />
        </mesh>
        <mesh
          position={[-R * 0.85, -0.1, bodyLen * 0.38]}
          rotation={[0.1, 0.05, -0.35]}
          material={tps}
        >
          <boxGeometry args={[0.8, 0.02, 0.5]} />
        </mesh>

        {/* Three Raptor SL engines — wide nozzle toward +Z (aft) */}
        {(
          [
            [0, 0.14],
            [-0.13, -0.1],
            [0.13, -0.1],
          ] as const
        ).map(([x, y], i) => (
          <group key={i} position={[x, y, bodyLen * 0.5 + 0.32]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={engine}>
              <cylinderGeometry args={[0.13, 0.06, 0.32, 12]} />
            </mesh>
            <mesh
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, 0, 0.14]}
              material={steelDark}
            >
              <torusGeometry args={[0.13, 0.015, 6, 16]} />
            </mesh>
          </group>
        ))}

        <group ref={plume} position={[0, 0, bodyLen * 0.5 + 0.72]} visible={false}>
          {(
            [
              [0, 0.14],
              [-0.13, -0.1],
              [0.13, -0.1],
            ] as const
          ).map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.1, 0.7, 10]} />
              <meshBasicMaterial
                color={i === 0 ? "#fde68a" : "#7dd3fc"}
                transparent
                opacity={0.72}
                depthWrite={false}
              />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.05]}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshBasicMaterial
              color="#fef3c7"
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
