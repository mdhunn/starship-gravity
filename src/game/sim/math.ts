import { WORLD_HALF } from "../constants";

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function wrap(v: number, half = WORLD_HALF): number {
  const size = half * 2;
  let r = ((v + half) % size + size) % size;
  return r - half;
}

export function wrapDelta(a: number, b: number, half = WORLD_HALF): number {
  let d = a - b;
  const size = half * 2;
  if (d > half) d -= size;
  if (d < -half) d += size;
  return d;
}

export function len2(x: number, z: number): number {
  return Math.hypot(x, z);
}

export function normalize2(x: number, z: number): { x: number; z: number } {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

/** yaw=0 faces world −Z; +yaw is CCW about +Y (nose toward −X) */
export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function randRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function randSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

export function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Newtonian gravity with Plummer softening (consistent everywhere):
 *
 *   F_ij = G m_i m_j r_ij / ( |r_ij|² + ε² )^{3/2}
 *   a_i  = F_ij / m_i
 *        = G m_j r_ij / ( |r_ij|² + ε² )^{3/2}
 */
export function gravityAccelFrom(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  bMass: number,
  G: number,
  soft: number,
  gMul = 1,
): { ax: number; az: number } {
  const dx = wrapDelta(bx, ax);
  const dz = wrapDelta(bz, az);
  const r2 = dx * dx + dz * dz + soft * soft;
  const inv = 1 / Math.sqrt(r2);
  const scale = G * bMass * gMul * inv * inv * inv;
  return { ax: dx * scale, az: dz * scale };
}

/** Soft absolute speed clamp (no continuous drag). */
export function clampSpeed(
  vx: number,
  vz: number,
  max: number,
): { vx: number; vz: number } {
  const sp = Math.hypot(vx, vz);
  if (sp <= max || sp < 1e-8) return { vx, vz };
  const s = max / sp;
  return { vx: vx * s, vz: vz * s };
}

/**
 * 2D elastic-ish collision between two free bodies (wrap-aware).
 * Separates overlapping centers, then applies impulse along the contact normal.
 * Returns true if a bounce was applied (bodies were approaching).
 */
export function bounceBodies(
  a: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    mass: number;
    radius: number;
  },
  b: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    mass: number;
    radius: number;
  },
  restitution = 0.88,
  /** Extra positional push fraction so they don't stick (0..1) */
  slop = 0.02,
): boolean {
  const dx = wrapDelta(a.x, b.x);
  const dz = wrapDelta(a.z, b.z);
  const dist = Math.hypot(dx, dz);
  const minDist = a.radius + b.radius;
  if (dist >= minDist || dist < 1e-8) return false;

  const nx = dx / dist;
  const nz = dz / dist;

  // Positional correction (mass-weighted)
  const overlap = minDist - dist + slop;
  const invMassA = 1 / Math.max(1e-6, a.mass);
  const invMassB = 1 / Math.max(1e-6, b.mass);
  const invSum = invMassA + invMassB;
  const corrA = overlap * (invMassA / invSum);
  const corrB = overlap * (invMassB / invSum);
  a.x = wrap(a.x + nx * corrA);
  a.z = wrap(a.z + nz * corrA);
  b.x = wrap(b.x - nx * corrB);
  b.z = wrap(b.z - nz * corrB);

  // Relative velocity along normal (a relative to b)
  const rvx = a.vx - b.vx;
  const rvz = a.vz - b.vz;
  const velAlong = rvx * nx + rvz * nz;
  // Already separating → only positional fix
  if (velAlong > 0) return false;

  // Impulse magnitude
  const j = (-(1 + restitution) * velAlong) / invSum;
  const jx = j * nx;
  const jz = j * nz;
  a.vx += jx * invMassA;
  a.vz += jz * invMassA;
  b.vx -= jx * invMassB;
  b.vz -= jz * invMassB;
  return true;
}

/**
 * Impulse on a free body hit by a light projectile that is then removed.
 * Reflects/ricochets the body's velocity along the impact normal.
 */
export function ricochetFromImpulse(
  body: { vx: number; vz: number; mass: number },
  /** Direction from body center toward projectile (unit preferred) */
  nx: number,
  nz: number,
  projVx: number,
  projVz: number,
  projMass: number,
  restitution = 0.55,
): void {
  const nlen = Math.hypot(nx, nz) || 1;
  const ux = nx / nlen;
  const uz = nz / nlen;
  // Relative velocity of projectile w.r.t. body along outward normal from body
  // Projectile approaches from outside: proj is at body+n, so approach means
  // (projV - bodyV) · u is negative when flying into the body.
  const rvx = projVx - body.vx;
  const rvz = projVz - body.vz;
  // Impulse direction: opposite of projectile approach into body
  // Contact normal for body is toward projectile = u
  const velAlongBody = body.vx * ux + body.vz * uz;
  const velAlongProj = projVx * ux + projVz * uz;
  // Closing speed of proj onto body along -u (into rock)
  const closing = (body.vx - projVx) * ux + (body.vz - projVz) * uz;
  // If projectile is moving into the rock, closing > 0 when measured as body - proj along u?
  // body at center, proj outside along u. proj approaching: projV · u < 0 (moving toward center).
  const approach = -(rvx * ux + rvz * uz); // positive when proj flies toward body
  if (approach <= 0.05) {
    // Glancing / already leaving — still give a light kick outward
    const kick = 2.5 + 0.15 * Math.hypot(projVx, projVz);
    body.vx += ux * kick * (projMass / Math.max(0.2, body.mass));
    body.vz += uz * kick * (projMass / Math.max(0.2, body.mass));
    return;
  }

  const invMass = 1 / Math.max(1e-6, body.mass);
  const invProj = 1 / Math.max(1e-6, projMass);
  // Treat proj as immovable-ish impulse source (it's destroyed)
  // Reflect relative approach into rock velocity change
  const j = ((1 + restitution) * approach) / (invMass + invProj * 0.35);
  body.vx += ux * j * invMass;
  body.vz += uz * j * invMass;

  // Also add a bit of the projectile's tangential velocity transfer (ricochet spray)
  const tx = -uz;
  const tz = ux;
  const tang = rvx * tx + rvz * tz;
  body.vx += tx * tang * 0.12 * (projMass / Math.max(0.2, body.mass));
  body.vz += tz * tang * 0.12 * (projMass / Math.max(0.2, body.mass));

  // Silence unused (kept for readability of the derivation)
  void velAlongBody;
  void velAlongProj;
  void closing;
}

/** Pick a random point on the playfield edge */
export function randomEdgePoint(inset = 2): { x: number; z: number } {
  const edge = (Math.random() * 4) | 0;
  const half = WORLD_HALF - inset;
  if (edge === 0) return { x: -half, z: randRange(-half * 0.85, half * 0.85) };
  if (edge === 1) return { x: half, z: randRange(-half * 0.85, half * 0.85) };
  if (edge === 2) return { x: randRange(-half * 0.85, half * 0.85), z: -half };
  return { x: randRange(-half * 0.85, half * 0.85), z: half };
}
