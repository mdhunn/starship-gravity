import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_HALF } from "../constants";

export function Starfield({ count = 1800 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const extent = WORLD_HALF * 2.2;

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Spread stars across a box larger than the playfield
      positions[i * 3] = (Math.random() - 0.5) * extent * 2;
      positions[i * 3 + 1] = (Math.random() - 0.35) * extent * 1.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * extent * 2;
      const warm = Math.random();
      if (warm > 0.92) c.setHSL(0.08, 0.55, 0.85);
      else if (warm > 0.8) c.setHSL(0.55, 0.45, 0.9);
      else c.setHSL(0.6, 0.15, 0.75 + Math.random() * 0.25);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, [count, extent]);

  useFrame((_, dt) => {
    if (points.current) points.current.rotation.y += dt * 0.0025;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.55}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
