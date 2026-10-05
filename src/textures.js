// Procedural PBR texture generation (albedo / normal / roughness) — no external assets.
import * as THREE from 'three';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise (periods must be powers of two ≤ 256). */
export class TileNoise {
  constructor(seed = 1) {
    const r = rng(seed);
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
    this.v = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.v[i] = r();
  }
  hash(x, y) { return this.v[this.p[(this.p[x & 255] + y) & 255]]; }
  noise(x, y, px, py = px) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = this.hash(x0, y0), b = this.hash(x1, y0), c = this.hash(x0, y1), d = this.hash(x1, y1);
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // u,v in [0,1)
  fbm(u, v, period, oct = 5, periodY = period) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise(u * period * f, v * periodY * f, period * f, periodY * f);
      n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function toTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Converts a tileable height field to a tangent-space (OpenGL) normal map canvas. */
function heightToNormal(H, w, h, strength) {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w, yd = ((y + 1) % h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w;
      const dx = (H[yc + xr] - H[yc + xl]) * strength;
      const dy = (H[yd + x] - H[yu + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (yc + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function pack(size, fill) {
  const albedo = makeCanvas(size), rough = makeCanvas(size);
  const actx = albedo.getContext('2d'), rctx = rough.getContext('2d');
  const A = actx.createImageData(size, size), R = rctx.createImageData(size, size);
  const H = new Float32Array(size * size);
  fill(A.data, R.data, H);
  actx.putImageData(A, 0, 0); rctx.putImageData(R, 0, 0);
  return { albedo, rough, H };
}

function finish({ albedo, rough, H }, size, normalStrength) {
  return {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    normalMap: toTexture(heightToNormal(H, size, size, normalStrength), false),
  };
}

/** Castle ashlar masonry: irregular courses, chipped bevels, mortar, grime streaks, moss. */
export function stoneTextures({ size = 1024, rows = 7, seed = 3, base = [122, 114, 102], variance = 0.16, moss = 0.35, grime = 0.5 } = {}) {
  const N = new TileNoise(seed), R = rng(seed * 13 + 1);
  // courses with variable heights
  let hs = []; for (let i = 0; i < rows; i++) hs.push(0.75 + R() * 0.5);
  const hsum = hs.reduce((a, b) => a + b, 0); hs = hs.map((v) => (v / hsum) * size);
  const courses = []; let acc = 0;
  for (let i = 0; i < rows; i++) {
    const count = 3 + Math.floor(R() * 2);
    let ws = []; for (let j = 0; j < count; j++) ws.push(0.6 + R() * 0.9);
    const ws2 = ws.reduce((a, b) => a + b, 0); ws = ws.map((v) => (v / ws2) * size);
    let xa = 0; const bricks = [];
    for (const w of ws) { bricks.push({ x0: xa, x1: xa + w, tone: (R() - 0.5) * 2 * variance, warm: R() - 0.5, dent: R() }); xa += w; }
    courses.push({ y0: acc, y1: acc + hs[i], off: R() * size, bricks });
    acc += hs[i];
  }
  const rowOf = new Int32Array(size);
  for (let y = 0, r = 0; y < size; y++) { while (r < rows - 1 && y >= courses[r].y1) r++; rowOf[y] = r; }
  const mortar = size * 0.006, bevel = size * 0.016;

  const data = pack(size, (A, Rg, H) => {
    for (let y = 0; y < size; y++) {
      const c = courses[rowOf[y]]; const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const xs = (x + c.off) % size;
        let b = c.bricks[0];
        for (let k = 0; k < c.bricks.length; k++) if (xs >= c.bricks[k].x0 && xs < c.bricks[k].x1) { b = c.bricks[k]; break; }
        const n1 = N.fbm(u, v, 8, 5);
        const n2 = N.noise(u * 128, v * 128, 128);
        const n3 = N.fbm(u, v, 32, 3);
        const dEdge = Math.min(xs - b.x0, b.x1 - xs, y - c.y0, c.y1 - y) + (n1 - 0.5) * size * 0.02;
        const edge = smooth(mortar, mortar + bevel, dEdge);
        const chip = n3 > 0.68 ? (n3 - 0.68) * 2.5 : 0;
        const h = edge * (0.7 + n1 * 0.35 + b.dent * 0.12 - chip) + n2 * 0.04;
        const i = y * size + x; H[i] = h;
        // color
        const streak = N.fbm(u, v, 32, 3, 2);
        const g = 1 - grime * Math.max(0, streak - 0.45) * 1.6 - grime * 0.35 * (1 - v) * (1 - v) * 0.0;
        const t = (1 + b.tone) * (0.72 + 0.5 * n1) * (0.9 + 0.2 * n2) * g;
        let r = base[0] * t * (1 + b.warm * 0.12), gg = base[1] * t, bb = base[2] * t * (1 - b.warm * 0.1);
        const mort = 0.42 + n2 * 0.15;
        r = r * edge + base[0] * mort * (1 - edge); gg = gg * edge + base[1] * mort * (1 - edge); bb = bb * edge + base[2] * mort * (1 - edge);
        // moss in crevices
        const mm = moss * smooth(0.5, 0.75, N.fbm(u, v, 16, 4)) * (1 - edge * 0.85);
        r = r * (1 - mm) + 52 * mm; gg = gg * (1 - mm) + 70 * mm; bb = bb * (1 - mm) + 30 * mm;
        const p = i * 4;
        A[p] = clamp255(r); A[p + 1] = clamp255(gg); A[p + 2] = clamp255(bb); A[p + 3] = 255;
        const wet = smooth(0.55, 0.8, streak);
        const ro = (0.78 + n2 * 0.15) * edge + 0.95 * (1 - edge) - wet * 0.35;
        Rg[p] = Rg[p + 1] = Rg[p + 2] = clamp255(ro * 255); Rg[p + 3] = 255;
      }
    }
  });
  return finish(data, size, 3.2);
}

/** Courtyard mud with pebbles, cart ruts and rain puddles (puddles are glossy). */
export function groundTextures({ size = 1024, seed = 9 } = {}) {
  const N = new TileNoise(seed), R = rng(seed);
  const pebbles = [];
  for (let i = 0; i < 1400; i++) pebbles.push({ x: R() * size, y: R() * size, r: 1.5 + Math.pow(R(), 3) * 9, t: R() });
  return finish(pack(size, (A, Rg, H) => {
    const P = new Float32Array(size * size); const PT = new Float32Array(size * size);
    for (const pb of pebbles) {
      const r = pb.r, r2 = r * r;
      for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) {
        const d2 = dx * dx + dy * dy; if (d2 > r2) continue;
        const xx = ((Math.floor(pb.x) + dx) % size + size) % size, yy = ((Math.floor(pb.y) + dy) % size + size) % size;
        const hh = Math.sqrt(1 - d2 / r2) * r * 0.08;
        const k = yy * size + xx; if (hh > P[k]) { P[k] = hh; PT[k] = pb.t; }
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x, p = i * 4;
      const n1 = N.fbm(u, v, 4, 6), n2 = N.noise(u * 256, v * 256, 256), n3 = N.fbm(u, v, 16, 4);
      const puddle = smooth(0.6, 0.66, n1);
      let h = n1 * 0.6 + n3 * 0.3 + n2 * 0.05;
      const peb = P[i];
      h = h * (1 - puddle) + 0.58 * puddle + peb * (1 - puddle * 0.7);
      H[i] = h;
      const m = 0.55 + n3 * 0.5 + n2 * 0.1;
      let r = 78 * m, g = 64 * m, b = 50 * m;
      if (peb > 0) { const t = 0.6 + PT[i] * 0.6; r = 115 * t; g = 110 * t; b = 102 * t; }
      // puddles: dark, mirror-like
      r = r * (1 - puddle * 0.6); g = g * (1 - puddle * 0.55); b = b * (1 - puddle * 0.5);
      A[p] = clamp255(r); A[p + 1] = clamp255(g); A[p + 2] = clamp255(b); A[p + 3] = 255;
      const ro = (0.62 + n2 * 0.2 + (peb > 0 ? -0.15 : 0)) * (1 - puddle) + 0.04 * puddle;
      Rg[p] = Rg[p + 1] = Rg[p + 2] = clamp255(ro * 255); Rg[p + 3] = 255;
    }
  }), size, 6);
}

/** Weathered vertical wood planks. */
export function woodTextures({ size = 512, seed = 21, tint = [92, 66, 44], planks = 5 } = {}) {
  const N = new TileNoise(seed), R = rng(seed);
  const tones = Array.from({ length: planks }, () => 0.8 + R() * 0.4);
  return finish(pack(size, (A, Rg, H) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x, p = i * 4;
      const pi = Math.floor(u * planks), fu = u * planks - pi;
      const warp = N.fbm(u, v, 4, 4, 2);
      const grain = 0.5 + 0.5 * Math.sin((fu * 14 + warp * 9 + pi * 3.1) * Math.PI);
      const fine = N.noise(u * 64, v * 256, 64, 256);
      const gap = smooth(0.0, 0.04, fu) * smooth(1.0, 0.96, fu);
      const knot = smooth(0.82, 0.9, N.fbm(u, v, 8, 3));
      H[i] = gap * (0.6 + grain * 0.15 + fine * 0.1 - knot * 0.2);
      const t = tones[pi] * (0.75 + grain * 0.2 + fine * 0.15) * (0.25 + 0.75 * gap) * (1 - knot * 0.4);
      A[p] = clamp255(tint[0] * t); A[p + 1] = clamp255(tint[1] * t); A[p + 2] = clamp255(tint[2] * t); A[p + 3] = 255;
      Rg[p] = Rg[p + 1] = Rg[p + 2] = clamp255((0.7 + fine * 0.2) * 255); Rg[p + 3] = 255;
    }
  }), size, 4);
}

/** Overlapping slate shingles. */
export function slateTextures({ size = 512, seed = 33 } = {}) {
  const N = new TileNoise(seed), R = rng(seed);
  const rows = 8, cols = 6; const tone = Array.from({ length: rows * cols }, () => 0.75 + R() * 0.5);
  return finish(pack(size, (A, Rg, H) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x, p = i * 4;
      const ry = Math.floor(v * rows), fy = v * rows - ry;
      const off = (ry % 2) * 0.5;
      const cx = (u * cols + off) % cols, ci = Math.floor(cx), fx = cx - ci;
      const n = N.fbm(u, v, 16, 4);
      const roundBottom = fy + 0.08 * (1 - Math.cos((fx - 0.5) * Math.PI * 2)) * 0.5;
      const edgeX = smooth(0, 0.05, fx) * smooth(1, 0.95, fx);
      const h = (0.3 + roundBottom * 0.7) * edgeX + n * 0.1;
      H[i] = h;
      const t = tone[(ry * cols + ci) % tone.length] * (0.6 + 0.5 * n) * (0.4 + 0.6 * edgeX) * (0.55 + 0.45 * roundBottom);
      A[p] = clamp255(64 * t); A[p + 1] = clamp255(68 * t); A[p + 2] = clamp255(76 * t); A[p + 3] = 255;
      Rg[p] = Rg[p + 1] = Rg[p + 2] = clamp255((0.35 + n * 0.3) * 255); Rg[p + 3] = 255;
    }
  }), size, 5);
}

/** Woven cloth (greyscale, tinted by material color). */
export function fabricTextures({ size = 256, seed = 44 } = {}) {
  const N = new TileNoise(seed);
  return finish(pack(size, (A, Rg, H) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x, p = i * 4;
      const wx = Math.sin(u * Math.PI * 2 * 64), wy = Math.sin(v * Math.PI * 2 * 64);
      const weave = (Math.floor(u * 64) + Math.floor(v * 64)) % 2 ? wx : wy;
      const n = N.fbm(u, v, 8, 4);
      H[i] = weave * 0.15 + n * 0.3;
      const t = (0.75 + weave * 0.08) * (0.7 + n * 0.5);
      A[p] = A[p + 1] = A[p + 2] = clamp255(230 * t); A[p + 3] = 255;
      Rg[p] = Rg[p + 1] = Rg[p + 2] = 235; Rg[p + 3] = 255;
    }
  }), size, 2.5);
}

/** Riveted chainmail ring pattern. */
export function chainmailTextures({ size = 256 } = {}) {
  const cells = 16, cs = size / cells, R0 = cs * 0.42, r0 = cs * 0.13;
  return finish(pack(size, (A, Rg, H) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let h = 0;
      for (let ry = -1; ry <= 1; ry++) for (let rx = -1; rx <= 1; rx++) {
        const cy = (Math.floor(y / cs) + ry) * cs + cs * 0.5;
        const row = Math.floor(y / cs) + ry;
        const cx = (Math.floor(x / cs) + rx) * cs + cs * 0.5 + (row % 2 ? cs * 0.5 : 0);
        const d = Math.abs(Math.hypot(x - cx, (y - cy) * 1.15) - R0);
        if (d < r0) h = Math.max(h, Math.sqrt(1 - (d * d) / (r0 * r0)));
      }
      const i = y * size + x, p = i * 4; H[i] = h;
      const t = 0.25 + h * 0.75;
      A[p] = clamp255(150 * t); A[p + 1] = clamp255(150 * t); A[p + 2] = clamp255(155 * t); A[p + 3] = 255;
      Rg[p] = Rg[p + 1] = Rg[p + 2] = clamp255((0.75 - h * 0.4) * 255); Rg[p + 3] = 255;
    }
  }), size, 6);
}

/** Brushed / scratched metal roughness + subtle normal. */
export function metalTextures({ size = 512, seed = 55 } = {}) {
  const N = new TileNoise(seed), R = rng(seed);
  const c = makeCanvas(size); const ctx = c.getContext('2d');
  ctx.fillStyle = '#6a6a6a'; ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size); const d = img.data; const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = N.fbm(x / size, y / size, 8, 5), f = N.noise((x / size) * 256, (y / size) * 8, 256, 8);
    const v = 0.3 + n * 0.35 + f * 0.12; const i = y * size + x; H[i] = n * 0.3;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = clamp255(v * 255); d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + R() * 0.08})`; ctx.lineWidth = 0.5 + R();
    const x = R() * size, y = R() * size, a = R() * Math.PI, l = 10 + R() * 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  return { roughnessMap: toTexture(c, false), normalMap: toTexture(heightToNormal(H, size, size, 2), false) };
}

/** Bark for the weirwood tree (pale, fibrous). */
export function barkTextures({ size = 512, seed = 66 } = {}) {
  const N = new TileNoise(seed);
  return finish(pack(size, (A, Rg, H) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x, p = i * 4;
      const w = N.fbm(u, v, 16, 5, 2);
      const ridges = Math.pow(Math.abs(Math.sin((u * 24 + w * 3) * Math.PI)), 0.5);
      H[i] = ridges * 0.6 + w * 0.4;
      const t = 0.55 + ridges * 0.35 + w * 0.2;
      A[p] = clamp255(214 * t); A[p + 1] = clamp255(206 * t); A[p + 2] = clamp255(192 * t); A[p + 3] = 255;
      Rg[p] = Rg[p + 1] = Rg[p + 2] = clamp255((0.85 - ridges * 0.2) * 255); Rg[p + 3] = 255;
    }
  }), size, 5);
}

// ---------- Painted / drawn textures ----------

export function drawWolf(ctx, s, color) {
  const pts = [[0.42, 0.08], [0.53, 0.3], [0.63, 0.1], [0.7, 0.36], [0.79, 0.5], [0.82, 0.72], [0.72, 0.94], [0.66, 0.8], [0.57, 0.96], [0.52, 0.8], [0.44, 0.9],
    [0.4, 0.72], [0.3, 0.66], [0.2, 0.64], [0.12, 0.6], [0.06, 0.52], [0.1, 0.46], [0.22, 0.42], [0.33, 0.3]];
  ctx.fillStyle = color; ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath(); ctx.fill();
}
export function drawLion(ctx, s, color, bg) {
  ctx.fillStyle = color; ctx.beginPath();
  const n = 22;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2, r = (i % 2 ? 0.46 : 0.34) * s;
    const x = 0.5 * s + Math.cos(a) * r, y = 0.52 * s + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.fill();
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0.5 * s, 0.54 * s, 0.22 * s, 0.25 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0.5 * s, 0.55 * s, 0.18 * s, 0.21 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0.43 * s, 0.5 * s, 0.03 * s, 0.018 * s, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.57 * s, 0.5 * s, 0.03 * s, 0.018 * s, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.46 * s, 0.6 * s); ctx.lineTo(0.54 * s, 0.6 * s); ctx.lineTo(0.5 * s, 0.66 * s); ctx.fill();
  ctx.fillRect(0.44 * s, 0.7 * s, 0.12 * s, 0.015 * s);
  // crown
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(0.36 * s, 0.14 * s); ctx.lineTo(0.4 * s, 0.03 * s); ctx.lineTo(0.45 * s, 0.11 * s); ctx.lineTo(0.5 * s, 0.0 * s);
  ctx.lineTo(0.55 * s, 0.11 * s); ctx.lineTo(0.6 * s, 0.03 * s); ctx.lineTo(0.64 * s, 0.14 * s); ctx.closePath(); ctx.fill();
}

/** Long swallowtail banner with house sigil. */
export function bannerTexture(house) {
  const w = 512, h = 1280; const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  const wolf = house === 'wolf';
  const bg = wolf ? '#c9ccd0' : '#7a1612', fg = wolf ? '#34383e' : '#d8a840', trim = wolf ? '#2a2d33' : '#d8a840';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // fabric shading
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.5, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = trim; ctx.lineWidth = 18; ctx.strokeRect(28, 28, w - 56, h - 200);
  ctx.lineWidth = 4; ctx.strokeRect(56, 56, w - 112, h - 256);
  ctx.save(); ctx.translate(64, 300);
  wolf ? drawWolf(ctx, 384, fg) : drawLion(ctx, 384, fg, bg);
  ctx.restore();
  // diamond motif
  ctx.fillStyle = trim;
  for (let i = 0; i < 3; i++) { const y = 860 + i * 70; ctx.beginPath(); ctx.moveTo(w / 2, y - 22); ctx.lineTo(w / 2 + 22, y); ctx.lineTo(w / 2, y + 22); ctx.lineTo(w / 2 - 22, y); ctx.fill(); }
  // swallowtail cut
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w / 2, h - 170); ctx.lineTo(w, h); ctx.fill();
  // grime at hem
  ctx.globalCompositeOperation = 'source-atop';
  const g2 = ctx.createLinearGradient(0, h - 400, 0, h); g2.addColorStop(0, 'rgba(30,20,10,0)'); g2.addColorStop(1, 'rgba(30,20,10,.6)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  const t = toTexture(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Tabard texture (front of knight). */
export function tabardTexture(house) {
  const s = 256; const c = makeCanvas(s, s * 2); const ctx = c.getContext('2d');
  const wolf = house === 'wolf';
  const bg = wolf ? '#5a5f66' : '#6e1410', fg = wolf ? '#d8dce0' : '#d8a840';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s * 2);
  ctx.strokeStyle = fg; ctx.lineWidth = 8; ctx.strokeRect(10, -10, s - 20, s * 2);
  ctx.save(); ctx.translate(38, 70); wolf ? drawWolf(ctx, 180, fg) : drawLion(ctx, 180, fg, bg); ctx.restore();
  const t = toTexture(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Carved stone relief normal map of a sigil inside a ring (for medallions). */
export function reliefNormal(house) {
  const s = 512; const c = makeCanvas(s); const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
  ctx.filter = 'blur(3px)';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.37, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(s * 0.18, s * 0.17); house === 'wolf' ? drawWolf(ctx, s * 0.64, '#fff') : drawLion(ctx, s * 0.64, '#fff', '#000'); ctx.restore();
  const d = ctx.getImageData(0, 0, s, s).data; const H = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) H[i] = d[i * 4] / 255;
  const t = toTexture(heightToNormal(H, s, s, 6), false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Ivy leaf cluster with alpha. */
export function leafTexture(color = [44, 66, 30]) {
  const s = 256; const c = makeCanvas(s); const ctx = c.getContext('2d'); const R = rng(77);
  for (let i = 0; i < 5; i++) {
    const x = 50 + R() * 156, y = 50 + R() * 156, r = 40 + R() * 26, a = R() * Math.PI * 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const k = 0.7 + R() * 0.5;
    ctx.fillStyle = `rgb(${color[0] * k | 0},${color[1] * k | 0},${color[2] * k | 0})`;
    ctx.beginPath(); ctx.moveTo(0, r);
    for (let j = 0; j <= 5; j++) { const t = Math.PI * (j / 5) - Math.PI; const rr = j % 2 ? r * 0.6 : r; ctx.lineTo(Math.cos(t) * rr * 0.9, Math.sin(t) * rr * 0.9 + r * 0.1); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,150,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(0, -r * 0.6); ctx.stroke();
    ctx.restore();
  }
  const t = toTexture(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/** Soft cloud puff for fog / smoke sprites. */
export function puffTexture() {
  const s = 256; const c = makeCanvas(s); const ctx = c.getContext('2d'); const N = new TileNoise(5);
  const img = ctx.createImageData(s, s); const d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x / s - 0.5, dy = y / s - 0.5; const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = N.fbm(x / s, y / s, 4, 5);
    const a = Math.max(0, 1 - r) ** 1.6 * (0.4 + n * 0.9);
    const i = (y * s + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = clamp255(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
