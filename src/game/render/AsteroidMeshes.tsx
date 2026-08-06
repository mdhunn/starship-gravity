import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AsteroidState, ShipState } from "../types";
import { wrapRelative } from "../sim/math";

function deformGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const noise =
      Math.sin(n.x * 4.1 + seed) * 0.12 +
      Math.cos(n.y * 5.3 + seed * 1.7) * 0.1 +
      Math.sin(n.z * 3.7 + seed * 0.6) * 0.08;
    v.addScaledVector(n, noise * radius);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * High-contrast rock palette — warm pale stone against cool dark space/nebula.
 * Size tiers stay distinct without sinking into the blue-purple background.
 */
function rockPalette(size: AsteroidState["size"], seed: number) {
  // Slight hue jitter per rock so the field doesn't look flat
  const j = ((seed * 0.17) % 1) * 0.06;
  if (size === "large") {
    return {
      color: new THREE.Color().setHSL(0.08 + j, 0.18, 0.62),
      emissive: new THREE.Color("#c4b5a0"),
      emissiveIntensity: 0.12,
      roughness: 0.78,
      metalness: 0.08,
    };
  }
  if (size === "medium") {
    return {
      color: new THREE.Color().setHSL(0.1 + j, 0.22, 0.68),
      emissive: new THREE.Color("#d6c4a8"),
      emissiveIntensity: 0.14,
      roughness: 0.72,
      metalness: 0.06,
    };
  }
  return {
    color: new THREE.Color().setHSL(0.09 + j, 0.28, 0.74),
    emissive: new THREE.Color("#e7d5b5"),
    emissiveIntensity: 0.16,
    roughness: 0.65,
    metalness: 0.05,
  };
}

function AsteroidMesh({ a, ship }: { a: AsteroidState; ship: ShipState }) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(
    () => deformGeometry(a.radius, a.seed),
    [a.radius, a.seed],
  );
  const palette = useMemo(
    () => rockPalette(a.size, a.seed),
    [a.size, a.seed],
  );

  useFrame(() => {
    if (!group.current) return;
    // Live ship coords — nearest toroidal image so wrap-seam rocks stay on screen
    group.current.position.set(
      wrapRelative(a.x, ship.x),
      0,
      wrapRelative(a.z, ship.z),
    );
    group.current.rotation.set(a.rotX, a.rotY, a.rotZ);
  });

  return (
    <group ref={group}>
      {/* Core rock — bright warm albedo */}
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial
          color={palette.color}
          roughness={palette.roughness}
          metalness={palette.metalness}
          flatShading
          emissive={palette.emissive}
          emissiveIntensity={palette.emissiveIntensity}
        />
      </mesh>
      {/* Soft rim shell — lifts silhouette off the dark field */}
      <mesh geometry={geo} scale={1.045}>
        <meshBasicMaterial
          color="#f0e6d4"
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function AsteroidMeshes({
  asteroids,
  ship,
}: {
  asteroids: AsteroidState[];
  ship: ShipState;
}) {
  return (
    <group>
      {asteroids.map((a) => (
        <AsteroidMesh key={a.id} a={a} ship={ship} />
      ))}
    </group>
  );
}
