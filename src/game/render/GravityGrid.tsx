import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Simulation } from "../sim/Simulation";
import { ASTEROID, CLAUDE, RELATIVITY, WORLD_SIZE } from "../constants";
import {
  gravityAccelFrom,
  lorentzGamma,
  relativisticMass,
  wrapDelta,
} from "../sim/math";

const GRID_SEGS = 40;
const WARP_GAIN = 0.22;
const MAX_HORIZ = 12;
const VERT_GAIN = 0.14;
const MAX_VERT = 9;
const BASE_Y = -0.6;

function localGMul(sim: Simulation, x: number, z: number): number {
  let bestI = 0;
  let effect: string | null = null;
  for (const c of sim.claudes) {
    const dx = wrapDelta(c.x, x);
    const dz = wrapDelta(c.z, z);
    const d = Math.hypot(dx, dz);
    if (d >= CLAUDE.influenceRadius) continue;
    const raw = 1 - d / CLAUDE.influenceRadius;
    const i =
      Math.pow(Math.max(0, raw), CLAUDE.intensityPower) *
      CLAUDE.maxDistortion;
    if (i > bestI) {
      bestI = i;
      effect = c.effect;
    }
  }
  if (!effect || bestI < 0.04) return 1;
  const fx = CLAUDE.effects;
  if (effect === "gravity_invert") {
    return 1 - bestI * fx.gravityInvertScale;
  }
  if (effect === "gravity_amp") {
    return 1 + bestI * fx.gravityAmpScale;
  }
  return 1;
}

function fieldAt(
  sim: Simulation,
  x: number,
  z: number,
): { ax: number; az: number; mag: number; gMul: number } {
  const gMul = localGMul(sim, x, z);
  const G = ASTEROID.G;
  const soft = ASTEROID.soft;
  let ax = 0;
  let az = 0;

  for (const a of sim.asteroids) {
    const m = relativisticMass(a.mass, Math.hypot(a.vx, a.vz));
    const g = gravityAccelFrom(x, z, a.x, a.z, m, G, soft, gMul);
    ax += g.ax;
    az += g.az;
  }
  if (sim.ship.alive) {
    const m = relativisticMass(
      sim.ship.mass,
      Math.hypot(sim.ship.vx, sim.ship.vz),
    );
    const g = gravityAccelFrom(
      x,
      z,
      sim.ship.x,
      sim.ship.z,
      m,
      G,
      soft,
      gMul,
    );
    ax += g.ax;
    az += g.az;
  }
  for (const c of sim.claudes) {
    const m = relativisticMass(c.mass, Math.hypot(c.vx, c.vz));
    const g = gravityAccelFrom(x, z, c.x, c.z, m, G, soft, gMul);
    ax += g.ax;
    az += g.az;
  }

  return { ax, az, mag: Math.hypot(ax, az), gMul };
}

/**
 * Gravity-warped grid with Lorentz length contraction along the ship's velocity.
 */
export function GravityGrid({ sim }: { sim: Simulation }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  const { geometry, base } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      WORLD_SIZE,
      WORLD_SIZE,
      GRID_SEGS,
      GRID_SEGS,
    );
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const baseArr = new Float32Array(pos.array.length);
    baseArr.set(pos.array as Float32Array);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = 0.1;
      colors[i * 3 + 1] = 0.14;
      colors[i * 3 + 2] = 0.22;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geometry: geo, base: baseArr };
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const carr = col.array as Float32Array;

    const rel = sim.getRelativity();
    const gamma = rel.gamma;
    const speed = rel.speed;
    // Length contraction along velocity in the ship frame
    let vxn = 0;
    let vzn = 0;
    if (speed > 0.5) {
      vxn = rel.vx / speed;
      vzn = rel.vz / speed;
    }
    const contract =
      1 - (1 - 1 / gamma) * RELATIVITY.gridContract;

    let peak = 0;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      let bx = base[i3]!;
      const by = base[i3 + 1]!;
      let bz = base[i3 + 2]!;

      // Lorentz-contract world relative to ship along v
      if (speed > 0.5) {
        const rx = wrapDelta(bx, rel.x);
        const rz = wrapDelta(bz, rel.z);
        const along = rx * vxn + rz * vzn;
        const px = rx - along * vxn;
        const pz = rz - along * vzn;
        const alongC = along * contract;
        bx = rel.x + px + alongC * vxn;
        bz = rel.z + pz + alongC * vzn;
      }

      const { ax, az, mag, gMul } = fieldAt(sim, bx, bz);
      peak = Math.max(peak, mag);

      let dx = ax * WARP_GAIN;
      let dz = az * WARP_GAIN;
      const h = Math.hypot(dx, dz);
      if (h > MAX_HORIZ) {
        const s = MAX_HORIZ / h;
        dx *= s;
        dz *= s;
      }

      const sign = gMul < 0 ? -1 : 1;
      let dy = -mag * VERT_GAIN * sign;
      // Extra vertical stretch from γ (relativistic field pile-up)
      dy *= 1 + (gamma - 1) * 0.35;
      if (Math.abs(dy) > MAX_VERT * (1 + (gamma - 1) * 0.25)) {
        dy =
          Math.sign(dy) * MAX_VERT * (1 + (gamma - 1) * 0.25);
      }

      arr[i3] = bx + dx;
      arr[i3 + 1] = by + BASE_Y + dy;
      arr[i3 + 2] = bz + dz;

      const t = Math.min(1, mag / 12);
      // Doppler: blueshift ahead of velocity, redshift behind
      let doppler = 0;
      if (speed > 1) {
        const rx = wrapDelta(bx, rel.x);
        const rz = wrapDelta(bz, rel.z);
        const rlen = Math.hypot(rx, rz) || 1;
        doppler = ((rx / rlen) * vxn + (rz / rlen) * vzn) * rel.beta;
      }
      if (gMul < 0) {
        carr[i3] = 0.12 + t * 0.65 + Math.max(0, -doppler) * 0.25;
        carr[i3 + 1] = 0.14 + t * 0.3;
        carr[i3 + 2] = 0.18 + t * 0.08 + Math.max(0, doppler) * 0.35;
      } else {
        carr[i3] = 0.08 + t * 0.2 + Math.max(0, -doppler) * 0.4;
        carr[i3 + 1] = 0.12 + t * 0.55;
        carr[i3 + 2] = 0.2 + t * 0.7 + Math.max(0, doppler) * 0.45;
      }
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;

    if (matRef.current) {
      matRef.current.opacity =
        0.42 + Math.min(0.4, peak * 0.015) + Math.min(0.15, (gamma - 1) * 0.12);
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        vertexColors
        transparent
        opacity={0.5}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
