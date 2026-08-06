import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Simulation } from "../sim/Simulation";
import { Starfield } from "./Starfield";
import { Nebula } from "./Nebula";
import { ShipMesh } from "./ShipMesh";
import { AsteroidMeshes } from "./AsteroidMeshes";
import { ClaudeMeshes } from "./ClaudeMesh";
import { Bullets, Particles, PlayfieldRing } from "./BulletsAndFX";
import { GravityGrid } from "./GravityGrid";
import { MAX_FRAME_DT, RELATIVITY } from "../constants";

/** Chase-cam elevation above the playfield (degrees). */
const CAMERA_ELEVATION_DEG = 35;
/** Distance from ship to camera (world units) — keeps framing similar to the old ~59 unit slant range. */
const CAMERA_DISTANCE = 60;

function CameraRig({ sim }: { sim: Simulation }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const baseFov = 42;

  useFrame((_, dt) => {
    const d = Math.min(dt, MAX_FRAME_DT);
    const ship = sim.ship;
    const shake = sim.getShake();
    const sx = (Math.random() - 0.5) * shake * 0.6;
    const sz = (Math.random() - 0.5) * shake * 0.6;
    const rel = sim.getRelativity();

    // 35° elevation chase: behind the ship along yaw, looking down at the hull
    const elev = (CAMERA_ELEVATION_DEG * Math.PI) / 180;
    // Mild length contraction of camera boom along velocity at high γ
    const boomScale = 1 - (1 - 1 / rel.gamma) * 0.35;
    const height = CAMERA_DISTANCE * Math.sin(elev) * boomScale;
    const back = CAMERA_DISTANCE * Math.cos(elev) * boomScale;
    const yaw = ship.yaw;
    const backX = Math.sin(yaw) * back;
    const backZ = Math.cos(yaw) * back;

    desired.current.set(ship.x + backX + sx, height, ship.z + backZ + sz);
    camera.position.lerp(desired.current, 1 - Math.exp(-3.2 * d));
    target.current.set(ship.x, 0, ship.z);
    camera.lookAt(target.current);

    // Relativistic beaming / aberration: FOV opens with γ
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      const boost = Math.min(
        RELATIVITY.maxFovBoost,
        (rel.gamma - 1) * RELATIVITY.fovPerGamma,
      );
      const want = baseFov + boost;
      cam.fov += (want - cam.fov) * (1 - Math.exp(-6 * d));
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

function SimDriver({ sim, onUi }: { sim: Simulation; onUi: () => void }) {
  const [, setRev] = useState(0);
  const sigRef = useRef("");
  const getThrusting = useCallback(() => sim.thrusting > 0.1, [sim]);

  useFrame((_, dt) => {
    sim.update(dt);
    onUi();
    const sig = `${sim.asteroids.length}:${sim.bullets.length}:${sim.claudes.length}:${Math.min(sim.particles.length, 50)}:${sim.ship.alive}:${sim.mode}`;
    if (sig !== sigRef.current) {
      sigRef.current = sig;
      setRev((n) => n + 1);
    }
  });

  return (
    <>
      <ShipMesh ship={sim.ship} getThrusting={getThrusting} />
      <AsteroidMeshes asteroids={sim.asteroids} ship={sim.ship} />
      <ClaudeMeshes claudes={sim.claudes} ship={sim.ship} />
      <Bullets bullets={sim.bullets} ship={sim.ship} />
      <Particles particles={sim.particles.slice(0, 80)} ship={sim.ship} />
    </>
  );
}

function Lights({ intensityBoost }: { intensityBoost: number }) {
  return (
    <>
      {/* Cool ambient keeps space dark; key light is warm so rocks pop */}
      <ambientLight intensity={0.28 + intensityBoost * 0.05} color="#6b7a99" />
      <directionalLight
        position={[25, 50, 15]}
        intensity={1.15}
        color="#fff4e6"
      />
      <directionalLight
        position={[-22, 18, -20]}
        intensity={0.35}
        color="#94a3b8"
      />
      <hemisphereLight args={["#1a2238", "#04050a", 0.35]} />
    </>
  );
}

function DistortionTint({
  active,
  intensity,
  beta,
}: {
  active: boolean;
  intensity: number;
  beta: number;
}) {
  const { scene } = useThree();
  useEffect(() => {
    // Doppler-tinted fog: blue when fast (beaming), warm under Claude
    const base = active ? 0.008 + intensity * 0.005 : 0.0042;
    const fogDensity = base + beta * 0.0035;
    let color = active ? "#120e0a" : "#05060a";
    if (beta > 0.35) {
      // Blueshift cast at high speed
      color = active ? "#0a1020" : "#060a14";
    }
    scene.fog = new THREE.FogExp2(color, fogDensity);
    return () => {
      scene.fog = null;
    };
  }, [scene, active, intensity, beta]);
  return null;
}

function SceneContents({ sim, onUi }: { sim: Simulation; onUi: () => void }) {
  const [fx, setFx] = useState({ active: false, intensity: 0, beta: 0 });
  useFrame(() => {
    const ui = sim.getUi();
    const rel = sim.getRelativity();
    const active = ui.effectIntensity > 0.15;
    if (
      active !== fx.active ||
      Math.abs(ui.effectIntensity - fx.intensity) > 0.05 ||
      Math.abs(rel.beta - fx.beta) > 0.04
    ) {
      setFx({ active, intensity: ui.effectIntensity, beta: rel.beta });
    }
  });

  return (
    <>
      <color attach="background" args={["#05060a"]} />
      <Lights intensityBoost={fx.intensity} />
      <DistortionTint
        active={fx.active}
        intensity={fx.intensity}
        beta={fx.beta}
      />
      <Starfield count={1400} />
      <Nebula />
      <GravityGrid sim={sim} />
      <PlayfieldRing />
      <CameraRig sim={sim} />
      <SimDriver sim={sim} onUi={onUi} />
    </>
  );
}

const INIT_ELEV = (CAMERA_ELEVATION_DEG * Math.PI) / 180;
const INIT_CAM: [number, number, number] = [
  0,
  CAMERA_DISTANCE * Math.sin(INIT_ELEV),
  CAMERA_DISTANCE * Math.cos(INIT_ELEV),
];

export function GameCanvas({
  sim,
  onUi,
}: {
  sim: Simulation;
  onUi: () => void;
}) {
  return (
    <div className="game-canvas-wrap">
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        camera={{ fov: 42, near: 0.5, far: 500, position: INIT_CAM }}
        onCreated={({ gl }) => {
          gl.setClearColor("#05060a");
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.98;
        }}
      >
        <SceneContents sim={sim} onUi={onUi} />
      </Canvas>
    </div>
  );
}
