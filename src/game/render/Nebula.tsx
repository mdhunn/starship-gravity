import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_HALF } from "../constants";

function makeSkyTexture() {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#05060a");
  sky.addColorStop(0.35, "#0a1020");
  sky.addColorStop(0.55, "#12183a");
  sky.addColorStop(0.72, "#1a1040");
  sky.addColorStop(1, "#05060a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const blobs = [
    { x: 0.2, y: 0.4, r: 0.35, c: "rgba(56, 100, 180, 0.22)" },
    { x: 0.7, y: 0.55, r: 0.4, c: "rgba(90, 50, 140, 0.18)" },
    { x: 0.5, y: 0.35, r: 0.28, c: "rgba(20, 120, 130, 0.14)" },
    { x: 0.85, y: 0.4, r: 0.25, c: "rgba(140, 60, 100, 0.12)" },
  ];
  for (const b of blobs) {
    const g = ctx.createRadialGradient(
      b.x * w,
      b.y * h,
      0,
      b.x * w,
      b.y * h,
      b.r * w,
    );
    g.addColorStop(0, b.c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (let i = 0; i < 200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.85;
    const a = 0.3 + Math.random() * 0.7;
    ctx.fillStyle = `rgba(220,230,255,${a})`;
    ctx.fillRect(x, y, Math.random() > 0.9 ? 2 : 1, Math.random() > 0.9 ? 2 : 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Inward sky dome — large enough to cover the expanded playfield. */
export function Nebula() {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => makeSkyTexture(), []);
  const radius = Math.max(280, WORLD_HALF * 2.4);

  useFrame((_, dt) => {
    if (mesh.current) mesh.current.rotation.y += dt * 0.004;
  });

  return (
    <mesh ref={mesh} scale={[-1, 1, 1]}>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}
