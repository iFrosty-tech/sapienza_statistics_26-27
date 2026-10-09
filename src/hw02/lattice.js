/**
 * Geometry of the Keccak-f[1600] state lattice drawn by Figure 5: the 1600
 * bits as a 5 × 5 × 64 grid of points, rotated about the vertical axis (yaw)
 * and the horizontal screen axis (pitch), projected orthographically and
 * painted from the farthest point to the nearest.
 *
 * Model coordinates follow the static SVG of render.js: u runs along the
 * lane (z), v across the lanes (x) and w upwards (y = 0 at the top), all
 * centred on the middle of the state; one unit is the spacing of the lanes and
 * Z_GAP the spacing of consecutive bits along a lane.
 */

export const LATTICE_SIZE = 1600;
export const Z_GAP = 0.62;
/** Largest tilt of the view above or below the lane plane, in radians. */
export const PITCH_LIMIT = 0.45;

/**
 * The difference mask of one checkpoint as 1600 values 0/1: state bit
 * i = 64(x + 5y) + z is bit (i mod 8) of byte ⌊i / 8⌋ (FIPS 202 bit order).
 * @param {string} hex 400 hex digits
 * @returns {Uint8Array}
 */
export function decodeMask(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{400}$/.test(hex)) throw new Error('a state mask has 400 hex digits');
  const bits = new Uint8Array(LATTICE_SIZE);
  for (let byte = 0; byte < 200; byte += 1) {
    const v = parseInt(hex.slice(2 * byte, 2 * byte + 2), 16);
    for (let k = 0; k < 8; k += 1) bits[8 * byte + k] = (v >> k) & 1;
  }
  return bits;
}

/**
 * The model position of every state bit, indexed by i = 64(x + 5y) + z.
 * @returns {{ x: number, y: number, z: number, u: number, v: number, w: number }[]}
 */
export function latticePoints() {
  const points = new Array(LATTICE_SIZE);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      for (let z = 0; z < 64; z += 1) {
        points[64 * (x + 5 * y) + z] = { x, y, z, u: (z - 31.5) * Z_GAP, v: x - 2, w: 2 - y };
      }
    }
  }
  return points;
}

/**
 * A model point seen from the view (yaw about the vertical, then pitch about
 * the horizontal screen axis): screen offsets in model units (sy grows
 * downwards) and its depth (larger is farther).
 */
export function rotate(p, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const u1 = p.u * cy - p.v * sy;
  const v1 = p.u * sy + p.v * cy;
  const w2 = p.w * cp + v1 * sp;
  const depth = v1 * cp - p.w * sp;
  return { sx: u1, sy: -w2, depth };
}

/**
 * A model point in canvas pixels.
 * @param {{ u: number, v: number, w: number }} p
 * @param {{ yaw: number, pitch: number, scale: number, cx: number, cy: number }} view
 */
export function project(p, { yaw, pitch, scale, cx, cy }) {
  const r = rotate(p, yaw, pitch);
  return { x: cx + r.sx * scale, y: cy + r.sy * scale, depth: r.depth };
}

/** Indices of the points from the farthest to the nearest, the painter's order. */
export function depthOrder(points, yaw, pitch) {
  const depth = points.map((p) => rotate(p, yaw, pitch).depth);
  return points.map((_, i) => i).sort((a, b) => depth[b] - depth[a]);
}

export function clampPitch(pitch) {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}

/*
 * Half-extents of the lattice on screen over every yaw and every pitch in
 * [−PITCH_LIMIT, PITCH_LIMIT]: horizontally at most the half-diagonal of the
 * (u, v) footprint; vertically the same footprint tilted by the pitch plus
 * the half-height of the lanes.
 */
const U_HALF = 31.5 * Z_GAP;
const V_HALF = 2;
const W_HALF = 2;
const FOOTPRINT = Math.hypot(U_HALF, V_HALF);
const HALF_WIDTH = FOOTPRINT;
const HALF_HEIGHT = FOOTPRINT * Math.sin(PITCH_LIMIT) + W_HALF;

/**
 * The largest scale (pixels per model unit) at which the lattice, centred,
 * stays inside a width × height canvas with `pad` pixels of margin at any yaw
 * and any admissible pitch, so the drawing never changes size as it turns.
 */
export function fitScale(width, height, pad = 16) {
  return Math.max(0, Math.min((width / 2 - pad) / HALF_WIDTH, (height / 2 - pad) / HALF_HEIGHT));
}

/**
 * The opacity of every "differs" mark at fraction t ∈ [0, 1] of the passage
 * from one mask to the next: bits that switch on fade in, bits that switch
 * off fade out, the others hold.
 * @param {Uint8Array} from
 * @param {Uint8Array} to
 * @param {number} t
 * @returns {Float32Array}
 */
export function maskTransition(from, to, t) {
  const out = new Float32Array(to.length);
  for (let i = 0; i < to.length; i += 1) out[i] = from[i] + (to[i] - from[i]) * t;
  return out;
}
