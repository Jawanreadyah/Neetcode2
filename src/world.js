// The castle of Winterhold: walls, towers, gatehouse, arched bridge, keep, statues, godswood, props, foliage.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Batcher, mat4, archPanelGeometry, rockGeometry } from './builder.js';
import { KnightModel, fullPose, POSES } from './characters.js';
import { rng, TileNoise } from './textures.js';
import { shared } from './materials.js';

export const FOG_COLOR = new THREE.Color(0x59606a);

function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }

export function buildWorld(scene, M, q) {
  const B = new Batcher();
  const R = rng(1234);
  const noise = new TileNoise(77);
  const rr = (a, b) => a + R() * (b - a);
  const colliders = [], playerOnly = [];
  const torches = [], ivySpots = [], rubbleSpots = [], smokeSpots = [], dynamic = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  const unitCyl8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const box = (w, h, d, x, y, z, mat, ry = 0, rx = 0, rz = 0) => B.add(unitBox, mat, mat4(x, y, z, rx, ry, rz, w, h, d));
  const cyl = (r, h, x, y, z, mat, rx = 0, ry = 0, rz = 0, seg16 = true) => B.add(seg16 ? unitCyl : unitCyl8, mat, mat4(x, y, z, rx, ry, rz, r, h, r));
  const rbCache = new Map();
  const rblock = (w, h, d, x, y, z, mat, ry = 0, rx = 0, rz = 0) => {
    const k = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}`;
    let g = rbCache.get(k); if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.14); rbCache.set(k, g); }
    B.add(g, mat, mat4(x, y, z, rx, ry, rz));
  };
  const col = (x0, x1, z0, z1, list = colliders) => list.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
  const arches = new Map();
  const archGeo = (...a) => { const k = a.join('|'); if (!arches.has(k)) arches.set(k, archPanelGeometry(...a)); return arches.get(k); };

  // ---------------------------------------------------------------- windows
  function windowAt(x, y, z, ry, lit, s = 1) {
    const f = archGeo(1.8 * s, 3.1 * s, 0.4, 1.0 * s, 1.75 * s, 0.5 * s, 0.03);
    B.add(f, M.trim, mat4(x, y, z, 0, ry, 0));
    const fwd = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const px = x - fwd.x * 0.12, pz = z - fwd.z * 0.12;
    box(1.02 * s, 2.3 * s, 0.05, px, y + 1.15 * s, pz, lit ? M.window : M.windowDark, ry);
    box(0.07, 2.3 * s, 0.1, x - fwd.x * 0.05, y + 1.15 * s, z - fwd.z * 0.05, M.iron, ry);
    box(1.0 * s, 0.07, 0.1, x - fwd.x * 0.05, y + 1.3 * s, z - fwd.z * 0.05, M.iron, ry);
    box(1.5 * s, 0.16, 0.55, x + fwd.x * 0.1, y - 0.05, z + fwd.z * 0.1, M.trim, ry);
  }

  // ---------------------------------------------------------------- wall segment
  function wall(axis, fixed, a0, a1, H, T, inner, o = {}) {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const P = (u, w) => (axis === 'x' ? [u, fixed + w * inner] : [fixed + w * inner, u]);
    const ry = axis === 'x' ? 0 : Math.PI / 2;
    const L = (sx, sy, sz, u, y, w, mat, rx = 0) => { const [x, z] = P(u, w); box(sx, sy, sz, x, y, z, mat, ry, rx * inner); };
    const RB = (sx, sy, sz, u, y, w, mat) => { const [x, z] = P(u, w); rblock(sx, sy, sz, x, y, z, mat, ry); };
    L(len, H, T, mid, H / 2, 0, M.stone);
    L(len, 1.3, T + 1.1, mid, 0.65, 0, M.stoneDark);
    L(len, 0.45, T + 0.7, mid, 1.5, 0, M.trim);
    L(len, 0.35, T + 0.35, mid, H * 0.55, 0, M.trim);
    // outer parapet + merlons
    L(len, 1.3, 0.7, mid, H + 0.65, -(T / 2 - 0.35), M.stone);
    for (let u = a0 + 1; u < a1 - 0.5; u += 2.1) RB(1.15, 1.05, 0.8, u, H + 1.82, -(T / 2 - 0.35), M.blocks);
    L(len, 0.7, 0.5, mid, H + 0.35, T / 2 - 0.25, M.stone);
    L(len, 0.3, 0.7, mid, H - 0.05, T / 2 + 0.2, M.trim);
    for (let u = a0 + 0.6; u < a1; u += 1.3) L(0.45, 0.6, 0.55, u, H - 0.5, T / 2 + 0.22, M.trim);
    // large foundation blocks at base on courtyard side
    for (let u = a0 + 0.8; u < a1 - 0.5; u += rr(1.6, 2.4)) RB(rr(1.4, 2.0), rr(0.7, 1.0), 0.5, u, 0.45, T / 2 + 0.55, M.blocks);
    // buttresses, arrow slits, torches
    if (!o.noButtress) for (let u = a0 + 5; u < a1 - 3; u += 9) {
      L(1.9, H * 0.62, 1.7, u, H * 0.31, T / 2 + 0.85, M.stone);
      L(2.1, 1.0, 2.0, u, 0.5, T / 2 + 0.95, M.stoneDark);
      L(1.95, 0.35, 2.4, u, H * 0.62 + 0.05, T / 2 + 0.75, M.trim, 0.55);
      L(1.5, H * 0.2, 0.9, u, H * 0.72, T / 2 + 0.45, M.stone);
      L(1.6, 0.3, 1.3, u, H * 0.82 + 0.05, T / 2 + 0.4, M.trim, 0.6);
      const [cx, cz] = P(u, T / 2 + 0.85);
      if (axis === 'x') col(cx - 1.1, cx + 1.1, cz - 1.1, cz + 1.1); else col(cx - 1.1, cx + 1.1, cz - 1.1, cz + 1.1);
    }
    for (let u = a0 + 9.5; u < a1 - 2; u += 9) {
      L(0.18, 1.5, 0.06, u, H * 0.75, T / 2 + 0.01, M.black);
      L(0.5, 0.12, 0.25, u, H * 0.75 - 0.8, T / 2 + 0.1, M.trim);
      if (!o.noTorch && Math.round((u - a0) / 9) % 2 === 1) {
        L(0.1, 0.1, 0.65, u, 3.9, T / 2 + 0.32, M.iron);
        L(0.08, 0.5, 0.08, u, 3.75, T / 2 + 0.18, M.iron);
        const [tx, tz] = P(u, T / 2 + 0.66);
        cyl(0.09, 0.28, tx, 4.05, tz, M.iron, 0, 0, 0, false);
        torches.push({ pos: new THREE.Vector3(tx, 4.3, tz), light: o.lights !== false, scale: 1 });
      }
    }
    for (let u = a0 + 7; u < a1 - 2; u += 14) { const [tx, tz] = P(u, T / 2 - 0.25); torches.push({ pos: new THREE.Vector3(tx, H + 1.1, tz), light: false, scale: 0.8 }); cyl(0.05, 0.6, tx, H + 0.75, tz, M.iron, 0, 0, 0, false); }
    // ivy & rubble along base
    for (let u = a0 + 3; u < a1 - 3; u += rr(5, 11)) {
      const [ix, iz] = P(u, T / 2 + 0.02);
      ivySpots.push({ x: ix, z: iz, axis, inner, w: rr(1.5, 3.5), h: rr(3, 9) });
      const [bx, bz] = P(u + rr(-2, 2), T / 2 + rr(1, 3));
      rubbleSpots.push({ x: bx, z: bz, r: rr(0.8, 2.2), n: 6 + Math.floor(R() * 8) });
    }
    const pad = T / 2 + 0.7;
    if (axis === 'x') col(a0, a1, fixed - pad, fixed + pad); else col(fixed - pad, fixed + pad, a0, a1);
    return { P, L, RB };
  }

  // ---------------------------------------------------------------- tower
  function tower(x, z, S, H, o = {}) {
    const frust = flat(new THREE.CylinderGeometry((S / 2) * Math.SQRT2, (S / 2 + 1.0) * Math.SQRT2, 3.4, 4, 1));
    B.add(frust, M.stoneDark, mat4(x, 1.7, z, 0, Math.PI / 4, 0));
    box(S + 0.5, 0.4, S + 0.5, x, 3.5, z, M.trim);
    const top = o.ruin ? H - 3 : H;
    box(S, top, S, x, top / 2, z, M.stone);
    // quoins
    for (let y = 4.1, i = 0; y < top - 0.6; y += 0.85, i++) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const e = i % 2 === 0;
        const w = e ? 1.35 : 0.8, d = e ? 0.8 : 1.35;
        rblock(w, 0.78, d, x + sx * (S / 2 - w / 2 + 0.07), y, z + sz * (S / 2 - d / 2 + 0.07), M.blocks);
      }
    }
    for (let y = 9; y < top - 3; y += 7) box(S + 0.35, 0.35, S + 0.35, x, y, z, M.trim);
    // windows on all faces
    const faces = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let y = 6.5, fl = 0; y < top - 4; y += 7, fl++) for (const [fx, fz] of faces) {
      if (o.skipFace && o.skipFace(fx, fz)) continue;
      windowAt(x + fx * (S / 2 + 0.12), y, z + fz * (S / 2 + 0.12), Math.atan2(fx, fz), R() < (o.lit ?? 0.5), 0.9);
    }
    if (o.ruin) {
      // jagged broken top + rubble
      for (let i = 0; i < 26; i++) {
        const a = R() * Math.PI * 2, rx = Math.cos(a) * (S / 2 - 0.4), rz = Math.sin(a) * (S / 2 - 0.4);
        const h = rr(0.6, 4.5); rblock(rr(0.8, 1.6), h, rr(0.8, 1.6), x + rx, top + h / 2 - 0.2, z + rz, M.blocks, R() * 0.3);
      }
      rubbleSpots.push({ x: x + S / 2 + 2, z: z + S / 2 + 2, r: 3.5, n: 30 });
    } else {
      // machicolations
      for (const [fx, fz] of faces) {
        const along = fx === 0 ? [1, 0] : [0, 1];
        for (let t = -S / 2 + 0.5; t <= S / 2 - 0.4; t += 1.0) {
          const cx = x + fx * (S / 2 + 0.25) + along[0] * t, cz = z + fz * (S / 2 + 0.25) + along[1] * t;
          box(0.4, 0.9, 0.4, cx, top - 0.3, cz, M.trim);
          box(0.4, 0.4, 0.55, cx, top - 0.9, cz - fz * 0.05, M.trim);
        }
        // parapet
        const px = x + fx * (S / 2 + 0.3), pz = z + fz * (S / 2 + 0.3);
        if (fx === 0) box(S + 1.3, 1.5, 0.65, px, top + 0.75, pz, M.stone); else box(0.65, 1.5, S + 1.3, px, top + 0.75, pz, M.stone);
        for (let t = -S / 2; t <= S / 2; t += 1.7) {
          const mx = px + along[0] * t, mz = pz + along[1] * t;
          rblock(fx === 0 ? 0.95 : 0.7, 1.0, fx === 0 ? 0.7 : 0.95, mx, top + 2.0, mz, M.blocks);
        }
      }
      box(S + 1.2, 0.35, S + 1.2, x, top + 0.05, z, M.trim);
      if (o.roof) {
        const rh = o.roofH || S * 1.35;
        const cone = flat(new THREE.ConeGeometry((S / 2 + 0.2) * Math.SQRT2, rh, 4, 1));
        B.add(cone, M.slate, mat4(x, top + 0.2 + rh / 2, z, 0, Math.PI / 4, 0));
        // dormer-like gablets
        for (const [fx, fz] of faces) {
          const gx = x + fx * (S / 2 - 0.4), gz = z + fz * (S / 2 - 0.4);
          const g = flat(new THREE.ConeGeometry(1.0, 1.6, 4, 1));
          B.add(g, M.slate, mat4(gx, top + 1.6, gz, 0, Math.PI / 4, 0, 1, 1, 1));
          box(1.0, 1.1, 0.25, gx + fx * 0.3, top + 1.0, gz + fz * 0.3, M.stone, Math.atan2(fx, fz));
        }
        cyl(0.07, 3.5, x, top + rh + 1.4, z, M.iron, 0, 0, 0, false);
        B.add(new THREE.SphereGeometry(0.22, 12, 8), M.gold, mat4(x, top + rh + 0.4, z));
        // tower flag
        const fg = new THREE.PlaneGeometry(2.6, 1.5, 12, 6); fg.translate(1.3, -0.75, 0); fg.rotateY(Math.PI / 2); fg.rotateY(-Math.PI / 2);
        const flag = new THREE.Mesh(fg, M.bannerWolf); flag.position.set(x, top + rh + 3.1, z); flag.rotation.y = R() * 6; flag.castShadow = true;
        flag.userData.flag = true; dynamic.push(flag); scene.add(flag);
      }
    }
    col(x - S / 2 - 1, x + S / 2 + 1, z - S / 2 - 1, z + S / 2 + 1);
  }

  // ---------------------------------------------------------------- banner helper
  const bannerGeo = new THREE.PlaneGeometry(2.1, 6.5, 6, 20); bannerGeo.translate(0, -3.25, 0);
  function banner(x, y, z, ry, mat, s = 1) {
    const b = new THREE.Mesh(bannerGeo, mat); b.position.set(x, y, z); b.rotation.y = ry; b.scale.setScalar(s); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    box(2.6 * s, 0.1, 0.1, x - f.x * 0.05, y + 0.05, z - f.z * 0.05, M.iron, ry);
    for (const sx of [-1, 1]) B.add(new THREE.SphereGeometry(0.1, 8, 6), M.gold, mat4(x + Math.cos(ry) * sx * 1.3 * s, y + 0.05, z - Math.sin(ry) * sx * 1.3 * s));
  }

  // ================================================================ LAYOUT
  const WH = 15, WT = 4.5;
  // North wall with gatehouse
  wall('x', -40, -48, -12.5, WH, WT, 1);
  wall('x', -40, 12.5, 48, WH, WT, 1);
  // West / East / South walls
  wall('z', -50, -38, 48, WH - 1, WT, 1, { lights: false });
  wall('z', 50, -6, 48, WH - 1, WT, -1, { lights: false });
  wall('x', 50, -48, 48, WH - 2, WT, -1, {});
  tower(-48, -40, 10, 26, { ruin: true });
  tower(48, -40, 10, 30, { roof: true, roofH: 14, lit: 0.6 });
  tower(-50, 50, 9, 22, { roof: true, lit: 0.4 });
  tower(50, 50, 9, 22, { roof: true, lit: 0.4 });

  // ---------------------------------------------------------------- gatehouse
  tower(-8.8, -40, 7.5, 21, { roof: true, roofH: 10, lit: 0.7 });
  tower(8.8, -40, 7.5, 21, { roof: true, roofH: 10, lit: 0.7 });
  {
    const gW = 10.1, gH = 17, gD = 5.2, span = 6, spring = 5.2, rise = 3;
    B.add(archGeo(gW, gH, gD, span, spring, rise, 0.05), M.stone, mat4(0, 0, -40));
    // voussoirs (front & back)
    for (const zf of [-40 + gD / 2 + 0.15, -40 - gD / 2 - 0.15]) {
      const N = 15;
      for (let i = 0; i <= N; i++) {
        const a = Math.PI - (i / N) * Math.PI;
        const ex = Math.cos(a) * (span / 2 + 0.45), ey = spring + Math.sin(a) * (rise + 0.45);
        const ang = Math.atan2(Math.sin(a) * (span / 2) , Math.cos(a) * rise);
        const key = i === N / 2 || i === Math.floor(N / 2);
        rblock(key ? 0.75 : 0.6, key ? 1.3 : 1.0, 0.5, ex, ey, zf, M.blocks, 0, 0, ang - Math.PI / 2);
      }
      for (const sx of [-1, 1]) for (let y = 0.6; y < spring; y += 0.9) rblock(0.9, 0.82, 0.5, sx * (span / 2 + 0.45), y, zf, M.blocks);
    }
    // tunnel lining
    box(0.3, spring, gD, -span / 2 + 0.15, spring / 2, -40, M.stoneDark); box(0.3, spring, gD, span / 2 - 0.15, spring / 2, -40, M.stoneDark);
    // portcullis (raised) — iron grid
    const pBottom = 3.6;
    for (let x = -span / 2 + 0.3; x <= span / 2 - 0.3; x += 0.42) {
      box(0.09, spring + rise - pBottom + 1, 0.09, x, pBottom + (spring + rise - pBottom + 1) / 2 - 0.5, -39, M.iron);
      B.add(new THREE.ConeGeometry(0.07, 0.3, 6), M.iron, mat4(x, pBottom - 0.6, -39, Math.PI));
    }
    for (let y = pBottom; y < spring + rise; y += 0.5) box(span - 0.4, 0.08, 0.12, 0, y, -39, M.iron);
    // gate doors open outward
    for (const sx of [-1, 1]) {
      const hx = sx * (span / 2 - 0.2), hz = -42.4;
      const ry = sx * -1.35;
      const dx = Math.cos(ry) * 1.45 * sx, dz = -Math.sin(ry) * 1.45 * sx;
      box(2.9, 5.0, 0.22, hx - dx, 2.5, hz - dz, M.woodDark, ry);
      for (const y of [0.8, 2.5, 4.2]) box(2.95, 0.16, 0.26, hx - dx, y, hz - dz, M.iron, ry);
    }
    // medallion & banners above gate
    const med = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 48), [M.trim, M.relief, M.trim]);
    med.rotation.set(Math.PI / 2, Math.PI / 2, 0); med.position.set(0, 11.5, -37.25); med.castShadow = true; med.receiveShadow = true; scene.add(med);
    for (const sx of [-1, 1]) banner(sx * 3.4, 15.3, -37.25, 0, M.bannerWolf, 0.9);
    // walk over gate
    box(gW + 1, 1.4, 0.6, 0, gH + 0.7, -40 + gD / 2 - 0.3, M.stone);
    box(gW + 1, 1.4, 0.6, 0, gH + 0.7, -40 - gD / 2 + 0.3, M.stone);
    for (let x = -gW / 2; x <= gW / 2; x += 1.7) { rblock(0.95, 1.0, 0.7, x, gH + 1.9, -40 - gD / 2 + 0.3, M.blocks); rblock(0.95, 1.0, 0.7, x, gH + 1.9, -40 + gD / 2 - 0.3, M.blocks); }
    for (const sx of [-1, 1]) {
      col(sx * 3, sx * 5.2, -42.8, -37.2);
      torches.push({ pos: new THREE.Vector3(sx * 4.1, 4.4, -37.0), light: true, scale: 1.1 });
      box(0.1, 0.1, 0.6, sx * 4.1, 4.0, -37.25, M.iron); cyl(0.09, 0.28, sx * 4.1, 4.15, -36.95, M.iron, 0, 0, 0, false);
    }
    // keep player inside the castle; enemies may pass
    col(-3, 3, -47, -45.5, playerOnly);
  }

  // ---------------------------------------------------------------- statues of the old kings
  const statues = [];
  for (const sx of [-1, 1]) {
    const px = sx * 15.5, pz = -32;
    // stepped pedestal of big blocks
    rblock(5.2, 0.8, 5.2, px, 0.4, pz, M.stoneDark);
    for (let y = 1.2, i = 0; y < 4.4; y += 0.85, i++) {
      for (const [ox, oz] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) rblock(1.85 + (i % 2) * 0.05, 0.82, 1.85, px + ox, y, pz + oz, M.blocks, (R() - 0.5) * 0.03);
    }
    rblock(4.6, 0.6, 4.6, px, 4.7, pz, M.trim);
    const med = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 40), [M.trim, M.relief, M.trim]);
    med.rotation.set(Math.PI / 2, Math.PI / 2, 0); med.position.set(px, 2.6, pz + 2.0); med.castShadow = true; scene.add(med);
    const king = new KnightModel({ mats: M, house: 'wolf', statue: M.bronze, scale: 3.3 });
    king.applyPose(fullPose(POSES.statue));
    king.root.position.set(px, 5.0, pz); king.root.rotation.y = -sx * 0.12; scene.add(king.root); statues.push(king);
    col(px - 2.7, px + 2.7, pz - 2.7, pz + 2.7);
    // braziers flanking
    brazier(px + sx * -3.6, pz + 3.4);
    ivySpots.push({ x: px + 2.62 * sx, z: pz, axis: 'z', inner: sx, w: 1.8, h: 3.5 });
  }

  // ---------------------------------------------------------------- the arched bridge (west)
  {
    const bx = -30, deckY = 11, pierS = 3.6, depth = 3.1;
    const piers = [44, 30, 16, 2, -12, -26];
    const ends = [50, ...piers, -37.5];
    piers.forEach((pz, idx) => {
      rblock(pierS + 1.0, 0.9, pierS + 1.0, bx, 0.45, pz, M.stoneDark);
      for (let y = 1.3, i = 0; y < deckY - 0.4; y += 0.86, i++) {
        if (i % 2 === 0) {
          for (const ox of [-0.9, 0.9]) for (const oz of [-0.9, 0.9]) rblock(1.78, 0.84, 1.78, bx + ox + rr(-0.03, 0.03), y, pz + oz + rr(-0.03, 0.03), M.blocks, rr(-0.01, 0.01));
        } else {
          for (const oz of [-1.2, 0, 1.2]) rblock(pierS - 0.05, 0.84, 1.18, bx + rr(-0.04, 0.04), y, pz + oz, M.blocks);
        }
      }
      rblock(pierS + 0.6, 0.6, pierS + 0.6, bx, 5.0, pz, M.trim);
      col(bx - pierS / 2 - 0.6, bx + pierS / 2 + 0.6, pz - pierS / 2 - 0.6, pz + pierS / 2 + 0.6);
      if (idx % 2 === 0) banner(bx + pierS / 2 + 0.12, 10.2, pz, Math.PI / 2, idx === 2 ? M.bannerWolf : M.bannerWolf, 0.75);
      else {
        torches.push({ pos: new THREE.Vector3(bx + pierS / 2 + 0.55, 3.9, pz), light: true, scale: 1 });
        box(0.6, 0.1, 0.1, bx + pierS / 2 + 0.3, 3.55, pz, M.iron); cyl(0.09, 0.28, bx + pierS / 2 + 0.58, 3.7, pz, M.iron, 0, 0, 0, false);
      }
      ivySpots.push({ x: bx + pierS / 2 + 0.03, z: pz, axis: 'z', inner: 1, w: 1.4, h: rr(2, 6) });
    });
    for (let i = 0; i < ends.length - 1; i++) {
      const z0 = ends[i], z1 = ends[i + 1], W = Math.abs(z1 - z0), cz = (z0 + z1) / 2;
      const span = W - pierS, spring = 4.6, rise = Math.min(4.0, span * 0.42);
      B.add(archGeo(W, deckY, depth, span, spring, rise, 0.04), M.stone, mat4(bx, 0, cz, 0, Math.PI / 2, 0));
      // voussoirs on both faces
      for (const fx of [bx + depth / 2 + 0.12, bx - depth / 2 - 0.12]) {
        const N = 17;
        for (let k = 0; k <= N; k++) {
          const a = Math.PI - (k / N) * Math.PI;
          const ez = Math.cos(a) * (span / 2 + 0.4), ey = spring + Math.sin(a) * (rise + 0.4);
          const tilt = Math.atan2(Math.cos(a) * rise, Math.sin(a) * (span / 2));
          rblock(0.45, 0.95, 0.62, fx, ey, cz - ez, M.blocks, 0, -tilt);
        }
      }
      // timber centering ribs inside the arch soffit
      for (const rx of [bx - 1.0, bx, bx + 1.0]) {
        const N = 12;
        for (let k = 0; k < N; k++) {
          const a0 = Math.PI - (k / N) * Math.PI, a1 = Math.PI - ((k + 1) / N) * Math.PI;
          const p0 = [Math.cos(a0) * (span / 2 - 0.15), spring + Math.sin(a0) * (rise - 0.15)], p1 = [Math.cos(a1) * (span / 2 - 0.15), spring + Math.sin(a1) * (rise - 0.15)];
          const mz = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
          box(0.22, 0.28, l + 0.05, rx, my, cz - mz, M.woodDark, 0, ang);
        }
        box(0.2, 0.25, span - 0.3, rx, spring - 0.1, cz, M.woodDark);
      }
      // hanging lantern
      const lz = cz, ly = spring + rise - 1.6;
      cyl(0.015, 1.2, bx + 1.1, ly + 0.9, lz, M.iron, 0, 0, 0, false);
      box(0.32, 0.45, 0.32, bx + 1.1, ly, lz, M.window); box(0.4, 0.06, 0.4, bx + 1.1, ly + 0.25, lz, M.iron); box(0.4, 0.06, 0.4, bx + 1.1, ly - 0.25, lz, M.iron);
    }
    // deck
    const zA = -37.5, zB = 50, dl = zB - zA, dm = (zA + zB) / 2;
    box(depth + 0.6, 0.55, dl, bx, deckY + 0.27, dm, M.trim);
    box(depth + 0.2, 0.12, dl, bx, deckY + 0.6, dm, M.wood);
    for (let z = zA + 1; z < zB - 1; z += 1.2) box(depth + 0.8, 0.22, 0.28, bx, deckY - 0.05, z, M.woodDark);
    // railings (lacquered red timber like the old southron style)
    for (const sx of [-1, 1]) {
      const rxp = bx + sx * (depth / 2 + 0.1);
      for (let z = zA + 0.5; z <= zB - 0.5; z += 1.75) {
        box(0.2, 1.3, 0.2, rxp, deckY + 1.25, z, M.woodRed);
        box(0.26, 0.12, 0.26, rxp, deckY + 1.95, z, M.woodRed);
        if (z + 1.75 <= zB - 0.5) {
          const zm = z + 0.875;
          box(0.07, 0.07, 1.9, rxp, deckY + 1.25, zm, M.woodRed, 0, 0.55);
          box(0.07, 0.07, 1.9, rxp, deckY + 1.25, zm, M.woodRed, 0, -0.55);
        }
      }
      box(0.16, 0.14, dl, rxp, deckY + 1.85, dm, M.woodRed);
      box(0.12, 0.1, dl, rxp, deckY + 0.75, dm, M.woodRed);
      box(0.3, 0.3, dl, bx + sx * (depth / 2 + 0.2), deckY + 0.3, dm, M.trim);
    }
    for (let z = zA + 6; z < zB; z += 18) torches.push({ pos: new THREE.Vector3(bx + depth / 2 + 0.1, deckY + 2.3, z), light: false, scale: 0.9 });
  }

  // ---------------------------------------------------------------- the Great Keep (east)
  {
    const x0 = 32, x1 = 50, z0 = -38, z1 = -8, H = 20, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
    box(W, H, D, cx, H / 2, cz, M.stone);
    box(W + 1.2, 1.4, D + 1.2, cx, 0.7, cz, M.stoneDark);
    box(W + 0.6, 0.4, D + 0.6, cx, 1.6, cz, M.trim);
    for (const y of [5.5, 10.8, 16]) box(W + 0.4, 0.3, D + 0.4, cx, y, cz, M.trim);
    // west facade buttresses + windows
    const fx = x0;
    for (let z = z0 + 3, b = 0; z <= z1 - 2.5; z += 6, b++) {
      box(1.6, H - 2, 1.8, fx - 0.8, (H - 2) / 2, z, M.stone);
      box(2.0, 0.35, 2.2, fx - 0.9, H - 1.8, z, M.trim, 0, 0, -0.5);
      box(2.2, 1.2, 2.4, fx - 0.9, 0.6, z, M.stoneDark);
      col(fx - 1.9, fx, z - 1.1, z + 1.1);
    }
    for (let z = z0 + 6, b = 0; z < z1 - 2; z += 6, b++) {
      for (const [fl, y] of [[0, 6.3], [1, 11.6], [2, 16.5]]) {
        if (fl === 0 && Math.abs(z - cz) < 2) continue;
        windowAt(fx - 0.12, y, z, -Math.PI / 2, R() < 0.65);
      }
    }
    // great door
    B.add(archGeo(5.4, 7, 0.9, 3.4, 3.6, 1.7, 0.04), M.trim, mat4(fx - 0.35, 0, cz, 0, -Math.PI / 2, 0));
    box(0.2, 5.1, 3.3, fx - 0.05, 2.55, cz, M.woodDark);
    for (const y of [0.9, 2.4, 3.9]) box(0.26, 0.14, 3.3, fx - 0.12, y, cz, M.iron);
    for (let i = 0; i < 3; i++) box(1.0 + (2 - i) * 0.7, 0.28, 4.6 - i * 0.4, fx - 0.5 - (2 - i) * 0.35, 0.14 + i * 0.28, cz, M.trim);
    for (const dz of [-2.6, 2.6]) {
      torches.push({ pos: new THREE.Vector3(fx - 0.9, 4.3, cz + dz), light: true, scale: 1 });
      box(0.6, 0.1, 0.1, fx - 0.3, 3.95, cz + dz, M.iron); cyl(0.09, 0.28, fx - 0.75, 4.1, cz + dz, M.iron, 0, 0, 0, false);
    }
    // wooden gallery / hoardings along the facade (like the reference shot)
    const gy = 8.4, gd = 2.4;
    box(gd, 0.22, D - 1, fx - gd / 2 - 1.7, gy, cz, M.wood);
    for (let z = z0 + 1; z <= z1 - 1; z += 3) {
      box(0.28, gy, 0.28, fx - gd - 1.6, gy / 2, z, M.woodDark);
      box(0.22, 0.22, 2.6, fx - gd / 2 - 1.7, gy - 0.2, z, M.woodDark, Math.PI / 2, 0, 0);
      box(0.18, 2.3, 0.18, fx - gd - 1.6, gy + 1.1, z, M.woodDark);
      box(0.15, 0.15, 3.0, fx - gd / 2 - 1.6, gy - 1.0, z, M.woodDark, Math.PI / 2, 0, 0.6);
      col(fx - gd - 1.85, fx - gd - 1.35, z - 0.25, z + 0.25);
    }
    box(0.14, 0.14, D - 1, fx - gd - 1.6, gy + 1.1, cz, M.woodDark);
    box(0.14, 0.14, D - 1, fx - gd - 1.6, gy + 0.55, cz, M.woodDark);
    box(gd + 1.2, 0.12, D, fx - gd / 2 - 1.2, gy + 2.6, cz, M.slate, 0, 0, 0.35);
    // ladders
    for (const lz of [z0 + 4.5, z1 - 5.5]) {
      for (const o of [-0.25, 0.25]) box(0.08, gy + 0.6, 0.08, fx - gd - 2.3, gy / 2, lz + o, M.wood, 0, 0, 0.12);
      for (let y = 0.4; y < gy; y += 0.4) box(0.06, 0.06, 0.5, fx - gd - 2.3 + y * 0.12 - gy * 0.06, y, lz, M.wood);
    }
    // corner turrets
    for (const tz of [z0 + 0.5, z1 - 0.5]) {
      const tx = x0 + 0.5;
      B.add(new THREE.CylinderGeometry(1.7, 1.7, 9, 20), M.stone, mat4(tx - 0.8, H + 1.0, tz));
      B.add(new THREE.CylinderGeometry(1.1, 0.3, 3, 20), M.trim, mat4(tx - 0.8, H - 5, tz));
      B.add(new THREE.ConeGeometry(2.1, 6, 20), M.slate, mat4(tx - 0.8, H + 8.5, tz));
      windowAt(tx - 2.55, H + 1, tz, -Math.PI / 2, true, 0.6);
      cyl(0.05, 2.0, tx - 0.8, H + 12, tz, M.iron, 0, 0, 0, false);
    }
    // pitched roof (ridge along z)
    const rs = new THREE.Shape(); rs.moveTo(-W / 2 - 0.8, 0); rs.lineTo(W / 2 + 0.8, 0); rs.lineTo(0, 9.5); rs.closePath();
    const roof = flat(new THREE.ExtrudeGeometry(rs, { depth: D + 1.6, bevelEnabled: false }));
    roof.translate(0, 0, -(D + 1.6) / 2);
    B.add(roof, M.slate, mat4(cx, H + 0.2, cz));
    const gs = new THREE.Shape(); gs.moveTo(-W / 2 + 0.3, 0); gs.lineTo(W / 2 - 0.3, 0); gs.lineTo(0, 8.8); gs.closePath();
    const gable = new THREE.ExtrudeGeometry(gs, { depth: 0.6, bevelEnabled: false });
    for (const z of [z0 - 0.2, z1 - 0.4]) B.add(gable, M.stone, mat4(cx, H + 0.2, z));
    box(0.5, 0.4, D + 2, cx, H + 9.8, cz, M.iron);
    for (const z of [z0 + 6, z1 - 8]) { box(1.6, 5, 1.6, cx + 3.5, H + 6, z, M.stone); box(2.0, 0.4, 2.0, cx + 3.5, H + 8.6, z, M.trim); smokeSpots.push(new THREE.Vector3(cx + 3.5, H + 9, z)); }
    col(x0 - 0.2, x1, z0 - 0.4, z1 + 0.4);
    ivySpots.push({ x: x0 - 0.02, z: z0 + 9, axis: 'z', inner: -1, w: 2.5, h: 8 }, { x: x0 - 0.02, z: z1 - 3, axis: 'z', inner: -1, w: 2.0, h: 6 });
  }

  // ---------------------------------------------------------------- props
  function brazier(x, z, s = 1) {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; box(0.07, 1.3 * s, 0.07, x + Math.cos(a) * 0.32, 0.62 * s, z + Math.sin(a) * 0.32, M.iron, -a, 0, 0); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; B.add(unitBox, M.iron, mat4(x + Math.cos(a) * 0.3, 0.62 * s, z + Math.sin(a) * 0.3, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25, 0.07, 1.3 * s, 0.07)); }
    const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.05, 0), new THREE.Vector2(0.4, 0.06), new THREE.Vector2(0.58, 0.28), new THREE.Vector2(0.62, 0.36), new THREE.Vector2(0.56, 0.36)], 18);
    B.add(bowl, M.iron, mat4(x, 1.22 * s, z, 0, 0, 0, s, s, s));
    B.add(new THREE.SphereGeometry(0.42, 10, 6), M.black, mat4(x, 1.45 * s, z, 0, 0, 0, s, 0.35 * s, s));
    torches.push({ pos: new THREE.Vector3(x, 1.55 * s, z), light: true, scale: 1.9 * s });
    col(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
  }
  const barrelGeo = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const t = i / 8; return new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.07, t * 1.05); }), 16);
  function barrel(x, z, ry = 0, tipped = false) {
    const m = tipped ? mat4(x, 0.42, z, 0, ry, Math.PI / 2) : mat4(x, 0, z, 0, ry, 0);
    B.add(barrelGeo, M.wood, m);
    for (const y of [0.12, 0.4, 0.65, 0.93]) {
      const r = 0.36 + Math.sin((y / 1.05) * Math.PI) * 0.07 + 0.008;
      const hoop = new THREE.CylinderGeometry(r, r, 0.05, 16, 1, true);
      const off = tipped ? mat4(x - (y - 0.52) * 1 * 0 , 0.42, z, 0, ry, Math.PI / 2).multiply(mat4(0, y, 0)) : mat4(x, y, z, 0, ry);
      B.add(hoop, M.iron, off);
    }
    if (!tipped) cyl(0.39, 0.03, x, 1.04, z, M.woodDark);
    if (!tipped) col(x - 0.45, x + 0.45, z - 0.45, z + 0.45);
  }
  function crate(x, y, z, s, ry) {
    box(s, s, s, x, y + s / 2, z, M.wood, ry);
    const c = Math.cos(ry), sn = Math.sin(ry);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lx = ox * s / 2, lz = oz * s / 2; box(0.1, s + 0.02, 0.1, x + lx * c + lz * sn, y + s / 2, z - lx * sn + lz * c, M.woodDark, ry); }
    for (const oy of [0.04, s - 0.04]) for (const [ox, oz, w, d] of [[0, -1, s, 0.1], [0, 1, s, 0.1], [-1, 0, 0.1, s], [1, 0, 0.1, s]]) {
      const lx = ox * s / 2, lz = oz * s / 2; box(w + 0.02, 0.1, d + 0.02, x + lx * c + lz * sn, y + oy, z - lx * sn + lz * c, M.woodDark, ry);
    }
    if (y === 0) col(x - s * 0.7, x + s * 0.7, z - s * 0.7, z + s * 0.7);
  }
  function hay(x, z, ry) { rblock(1.6, 0.8, 0.9, x, 0.4, z, M.hay, ry); col(x - 0.9, x + 0.9, z - 0.9, z + 0.9); }
  function rack(x, z, ry) {
    const c = Math.cos(ry), s = Math.sin(ry), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (const lx of [-1.2, 1.2]) { const [px, pz] = P(lx, 0); box(0.14, 1.9, 0.14, px, 0.95, pz, M.woodDark, ry); box(0.5, 0.12, 0.5, px, 0.06, pz, M.woodDark, ry); }
    box(2.7, 0.12, 0.14, x, 1.65, z, M.woodDark, ry); box(2.7, 0.1, 0.1, x, 0.5, z, M.woodDark, ry);
    for (let i = 0; i < 6; i++) {
      const lx = -1.0 + i * 0.4; const [px, pz] = P(lx, 0.12);
      B.add(unitCyl8, M.wood, mat4(px, 1.15, pz, 0.12, ry, 0, 0.025, 2.3, 0.025));
      const [tx, tz] = P(lx, 0.12 + Math.sin(0.12) * 1.15 * 1.0);
      B.add(new THREE.ConeGeometry(0.04, 0.3, 6), M.steel, mat4(tx, 2.4, tz + 0, 0.12, ry));
    }
    col(x - 1.4, x + 1.4, z - 1.4, z + 1.4);
  }
  function cart(x, z, ry) {
    const c = Math.cos(ry), s = Math.sin(ry), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    box(1.8, 0.15, 3.2, x, 0.95, z, M.wood, ry);
    for (const lx of [-0.88, 0.88]) { const [px, pz] = P(lx, 0); box(0.08, 0.55, 3.2, px, 1.3, pz, M.wood, ry); }
    { const [px, pz] = P(0, -1.58); box(1.8, 0.55, 0.08, px, 1.3, pz, M.wood, ry); }
    for (const lx of [-1.05, 1.05]) {
      const [wx, wz] = P(lx, 0.3);
      const wheel = new THREE.TorusGeometry(0.62, 0.07, 8, 24);
      B.add(wheel, M.woodDark, mat4(wx, 0.68, wz, 0, ry + Math.PI / 2, 0));
      for (let k = 0; k < 6; k++) B.add(unitBox, M.woodDark, mat4(wx, 0.68, wz, 0, ry + Math.PI / 2, (k / 6) * Math.PI, 0.06, 1.2, 0.06));
      cyl(0.12, 0.2, wx, 0.68, wz, M.iron, 0, 0, Math.PI / 2);
    }
    for (const lx of [-0.5, 0.5]) { const [px, pz] = P(lx, 2.6); box(0.1, 0.1, 2.4, px, 0.6, pz, M.woodDark, ry, -0.3); }
    for (let i = 0; i < 5; i++) { const [px, pz] = P(rr(-0.5, 0.5), rr(-1.2, 1.2)); rblock(0.7, 0.5, 0.5, px, 1.3, pz, M.hay, R() * 3); }
    const [ax, az] = P(0, 0); col(ax - 1.6, ax + 1.6, az - 1.8, az + 1.8);
  }
  function well(x, z) {
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; rblock(0.75, 0.9, 0.45, x + Math.cos(a) * 1.25, 0.45, z + Math.sin(a) * 1.25, M.blocks, -a + Math.PI / 2); }
    cyl(1.35, 0.15, x, 0.95, z, M.trim);
    B.add(new THREE.CircleGeometry(1.05, 24), M.water, mat4(x, 0.6, z, -Math.PI / 2));
    for (const sx of [-1, 1]) box(0.18, 2.6, 0.18, x + sx * 1.3, 1.6, z, M.woodDark);
    box(2.8, 0.16, 0.16, x, 2.85, z, M.woodDark);
    box(3.2, 0.08, 1.4, x, 3.3, z + 0.6, M.slate, 0, 0.6); box(3.2, 0.08, 1.4, x, 3.3, z - 0.6, M.slate, 0, -0.6);
    cyl(0.012, 1.4, x, 2.1, z, M.leather, 0, 0, 0, false);
    B.add(new THREE.LatheGeometry([new THREE.Vector2(0.15, 0), new THREE.Vector2(0.2, 0.3), new THREE.Vector2(0.2, 0.31)], 12), M.wood, mat4(x, 1.25, z));
    col(x - 1.6, x + 1.6, z - 1.6, z + 1.6);
  }
  function dummy(x, z, ry) {
    box(0.14, 1.9, 0.14, x, 0.95, z, M.woodDark, ry);
    box(1.3, 0.1, 0.1, x, 1.45, z, M.woodDark, ry);
    B.add(new THREE.SphereGeometry(1, 14, 10), M.hay, mat4(x, 1.25, z, 0, ry, 0, 0.28, 0.42, 0.22));
    B.add(new THREE.SphereGeometry(1, 12, 8), M.hay, mat4(x, 1.82, z, 0, ry, 0, 0.16, 0.18, 0.16));
    col(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
  }

  brazier(-8, 4); brazier(8, 4); brazier(-6, 26); brazier(14, -14);
  well(-14, 10);
  cart(14, 30, 0.5); cart(-40, -20, 1.3);
  rack(-20, 40, 0.0); rack(0, 44.5, 0);
  for (const [x, z, r] of [[-18, 30, 0.3], [-16, 32.5, -0.4], [-21, 33, 1.0]]) dummy(x, z, r);
  // supply clusters along walls
  const clusters = [[-44, -30], [-44, 10], [-44, 36], [44, 4], [44, 20], [40, 42], [-6, -32], [22, -35], [-24, -35], [26, 44], [-36, 44]];
  for (const [cx, cz] of clusters) {
    for (let i = 0; i < 4; i++) barrel(cx + rr(-1.8, 1.8), cz + rr(-1.8, 1.8), R() * 6, R() < 0.2);
    crate(cx + rr(-2, 2), 0, cz + rr(-2, 2), rr(0.9, 1.2), R() * 1.5);
    if (R() < 0.6) crate(cx + rr(-2, 2), 0, cz + rr(-2, 2), rr(0.8, 1.0), R() * 1.5);
    if (R() < 0.5) hay(cx + rr(-2.5, 2.5), cz + rr(-2.5, 2.5), R() * 3);
  }
  // broken flagstone path gate -> keep -> center
  for (let i = 0; i < 260; i++) {
    const t = R(); let x, z;
    if (i < 140) { x = rr(-3.5, 3.5); z = -36 + t * 34; } else { x = -2 + t * 32; z = -20 + rr(-3, 3) + t * -3; }
    if (R() < 0.25) continue;
    rblock(rr(0.6, 1.1), 0.14, rr(0.5, 0.9), x, 0.04, z, M.blocks, R() * 0.4 - 0.2, rr(-0.03, 0.03), rr(-0.03, 0.03));
  }

  // ---------------------------------------------------------------- the godswood heart tree
  const leafSpots = [];
  {
    const tx = 26, tz = 24;
    const seg = (a, b, r0, r1, mat) => {
      const d = new THREE.Vector3().subVectors(b, a); const l = d.length();
      const g = new THREE.CylinderGeometry(r1, r0, l, 12, 1, true);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1));
      B.add(g, mat, m);
      B.add(new THREE.SphereGeometry(r1, 10, 8), mat, new THREE.Matrix4().makeTranslation(b.x, b.y, b.z));
    };
    const branch = (p, dir, len, r, depth) => {
      let cur = p.clone(), d = dir.clone();
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        d.add(new THREE.Vector3(rr(-0.25, 0.25), rr(-0.05, 0.2), rr(-0.25, 0.25))).normalize();
        const nxt = cur.clone().addScaledVector(d, len / steps);
        const r0 = r * (1 - (i / steps) * 0.45), r1 = r * (1 - ((i + 1) / steps) * 0.45);
        seg(cur, nxt, r0, r1, M.bark); cur = nxt;
      }
      if (depth <= 0 || r < 0.06) { for (let k = 0; k < 40; k++) leafSpots.push(cur.clone().add(new THREE.Vector3(rr(-1.8, 1.8), rr(-1, 1.2), rr(-1.8, 1.8)))); return; }
      const n = depth > 2 ? 3 : 2 + (R() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const nd = d.clone().add(new THREE.Vector3(rr(-1, 1), rr(0.1, 0.7), rr(-1, 1))).normalize();
        branch(cur, nd, len * rr(0.6, 0.8), r * 0.55, depth - 1);
      }
    };
    branch(new THREE.Vector3(tx, -0.3, tz), new THREE.Vector3(0.05, 1, 0), 7, 1.0, 4);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; seg(new THREE.Vector3(tx, 1.0, tz), new THREE.Vector3(tx + Math.cos(a) * 2.4, -0.2, tz + Math.sin(a) * 2.4), 0.45, 0.12, M.bark); }
    // carved face toward the courtyard
    const fd = new THREE.Vector3(-1, 0, -1).normalize(); const fp = new THREE.Vector3(tx, 2.8, tz).addScaledVector(fd, 0.86);
    const fr = Math.atan2(fd.x, fd.z);
    const side = new THREE.Vector3(Math.cos(fr), 0, -Math.sin(fr));
    for (const s of [-1, 1]) {
      const e = fp.clone().addScaledVector(side, s * 0.28);
      box(0.24, 0.07, 0.12, e.x, e.y, e.z, M.black, fr, 0, s * 0.35);
      box(0.05, 0.75, 0.08, e.x + fd.x * 0.02, e.y - 0.42, e.z + fd.z * 0.02, M.plume, fr);
    }
    box(0.36, 0.08, 0.12, fp.x, fp.y - 0.62, fp.z, M.black, fr);
    // pool & stones
    B.add(new THREE.CircleGeometry(2.2, 32), M.water, mat4(tx - 4.3, 0.03, tz - 4.0, -Math.PI / 2));
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; rblock(rr(0.5, 0.9), rr(0.3, 0.6), rr(0.5, 0.8), tx - 4.3 + Math.cos(a) * 2.5, 0.15, tz - 4.0 + Math.sin(a) * 2.5, M.blocks, R() * 3); }
    col(tx - 1.2, tx + 1.2, tz - 1.2, tz + 1.2);
    for (let k = 0; k < 50; k++) leafSpots.push(new THREE.Vector3(tx + rr(-4, 4), rr(0.02, 0.05), tz + rr(-4, 4)));
  }

  // ---------------------------------------------------------------- distant castle & world beyond the walls
  const far = new Batcher();
  const fbox = (w, h, d, x, y, z, mat, ry = 0) => far.add(unitBox, mat, mat4(x, y, z, 0, ry, 0, w, h, d));
  for (const [x, z, s, h] of [[-20, -70, 10, 44], [12, -82, 12, 52], [34, -66, 8, 36], [-42, -86, 9, 38], [0, -110, 16, 62], [-70, -40, 10, 30], [70, -20, 9, 34]]) {
    fbox(s, h, s, x, h / 2, z, M.stone);
    for (let y = 8; y < h - 4; y += 7) fbox(s + 0.4, 0.4, s + 0.4, x, y, z, M.trim);
    const rh = s * 1.5; far.add(flat(new THREE.ConeGeometry((s / 2 + 0.6) * Math.SQRT2, rh, 4)), M.slate, mat4(x, h + rh / 2, z, 0, Math.PI / 4));
    for (let k = 0; k < 6; k++) fbox(1.0, 1.8, 0.2, x + rr(-s / 3, s / 3), rr(10, h - 6), z + s / 2 + 0.1, R() < 0.6 ? M.window : M.windowDark);
  }
  fbox(60, 22, 18, -6, 11, -92, M.stone);
  const hallRoof = new THREE.Shape(); hallRoof.moveTo(-10, 0); hallRoof.lineTo(10, 0); hallRoof.lineTo(0, 9); hallRoof.closePath();
  const hr = flat(new THREE.ExtrudeGeometry(hallRoof, { depth: 60, bevelEnabled: false })); hr.translate(0, 0, -30);
  far.add(hr, M.slate, mat4(-6, 22, -92, 0, Math.PI / 2));
  // outer curtain beyond
  fbox(160, 18, 4, 0, 9, -130, M.stoneDark);
  far.build(scene, { cast: false, receive: true });

  // pines (instanced) ring
  {
    const parts = [];
    for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(2.6 - i * 0.55, 3.6, 7); c.translate(0, 2.5 + i * 2.1, 0); parts.push(c.toNonIndexed()); }
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3, 6).toNonIndexed(); parts.push(trunk);
    for (const p of parts) { p.deleteAttribute('uv'); }
    const pine = (() => { const m = new THREE.BufferGeometry(); let n = 0; parts.forEach((p) => (n += p.attributes.position.count));
      const pos = new Float32Array(n * 3); let o = 0; parts.forEach((p) => { pos.set(p.attributes.position.array, o); o += p.attributes.position.array.length; });
      m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.computeVertexNormals(); return m; })();
    const count = 420; const im = new THREE.InstancedMesh(pine, M.pine, count); const dm = new THREE.Object3D();
    let k = 0;
    while (k < count) {
      const x = rr(-200, 200), z = rr(-220, 200);
      if (Math.abs(x) < 62 && z > -140 && z < 62) continue;
      const s = rr(1.6, 3.2); dm.position.set(x, groundHeight(x, z) - 0.5, z); dm.rotation.set(0, R() * 6, 0); dm.scale.set(s, s * rr(0.9, 1.4), s); dm.updateMatrix();
      im.setMatrixAt(k++, dm.matrix);
    }
    im.castShadow = false; im.receiveShadow = true; scene.add(im);
  }
  // mountains: atmospheric silhouettes (pre-fogged, unaffected by scene fog)
  {
    const mats = [0.55, 0.7, 0.82].map((f) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a2e34).lerp(FOG_COLOR, f), fog: false }));
    const snow = [0.55, 0.7, 0.82].map((f) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9aa2ac).lerp(FOG_COLOR, f * 0.9), fog: false }));
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rr(-0.1, 0.1), d = rr(380, 560), layer = d < 430 ? 0 : d < 500 ? 1 : 2;
      const h = rr(90, 210), r = rr(110, 200);
      const g = new THREE.ConeGeometry(r, h, 9, 4); const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) { const y = p.getY(v); if (y < h / 2 - 1) { p.setX(v, p.getX(v) * rr(0.8, 1.15)); p.setZ(v, p.getZ(v) * rr(0.8, 1.15)); p.setY(v, y + rr(-8, 8)); } }
      const m = new THREE.Mesh(g, mats[layer]); m.position.set(Math.cos(a) * d, h / 2 - 20, Math.sin(a) * d); m.rotation.y = R() * 6; scene.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 9, 1), snow[layer]); cap.position.copy(m.position); cap.position.y += h * 0.36 + 0.5; cap.rotation.y = m.rotation.y; scene.add(cap);
    }
  }

  // ---------------------------------------------------------------- ground
  function groundHeight(x, z) {
    const inside = x > -53 && x < 53 && z > -43 && z < 53;
    const n = noise.fbm(((x / 400) % 1 + 1) % 1, ((z / 400) % 1 + 1) % 1, 8, 4);
    if (inside) return (n - 0.5) * 0.12;
    const dx = Math.max(0, Math.abs(x) - 53), dz = Math.max(0, z - 53, -43 - z);
    const d = Math.hypot(dx, dz);
    return (n - 0.5) * 0.12 + Math.min(1, d / 40) * (n * 14 - 3);
  }
  {
    const g = new THREE.PlaneGeometry(700, 700, 220, 220); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    for (const k of ['map', 'normalMap', 'roughnessMap']) M.ground[k].repeat.set(120, 120);
    const ground = new THREE.Mesh(g, M.ground); ground.receiveShadow = true; scene.add(ground);
  }

  // ---------------------------------------------------------------- instanced: rubble, ivy, grass, leaves
  const dummyO = new THREE.Object3D();
  const insideCollider = (x, z, pad = 0) => colliders.some((c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);
  {
    const rocks = [rockGeometry(1), rockGeometry(2.3), rockGeometry(4.1)];
    const per = Math.ceil(rubbleSpots.reduce((a, s) => a + s.n, 0) / 3) + 140;
    const ims = rocks.map((g) => { const im = new THREE.InstancedMesh(g, M.stoneDark, per); im.castShadow = true; im.receiveShadow = true; im.count = 0; scene.add(im); return im; });
    const put = (x, z, s) => { const im = ims[Math.floor(R() * 3)]; if (im.count >= per) return; dummyO.position.set(x, s * 0.25, z); dummyO.rotation.set(rr(-0.4, 0.4), R() * 6, rr(-0.4, 0.4)); dummyO.scale.set(s * rr(0.8, 1.3), s * rr(0.6, 1), s * rr(0.8, 1.3)); dummyO.updateMatrix(); im.setMatrixAt(im.count++, dummyO.matrix); };
    for (const s of rubbleSpots) for (let i = 0; i < s.n; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * s.r; put(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, Math.pow(R(), 2) * 0.55 + 0.06); }
    for (let i = 0; i < 400; i++) { const x = rr(-46, 46), z = rr(-36, 46); if (!insideCollider(x, z, 0.2)) put(x, z, rr(0.04, 0.14)); }
    ims.forEach((im) => (im.instanceMatrix.needsUpdate = true));
  }
  {
    const leafG = new THREE.PlaneGeometry(0.55, 0.55);
    const maxIvy = 9000; const ivy = new THREE.InstancedMesh(leafG, M.ivy, maxIvy); ivy.count = 0; ivy.castShadow = true; ivy.receiveShadow = true;
    const nv = new THREE.Vector3();
    for (const s of ivySpots) {
      const n = Math.floor(s.w * s.h * 22);
      for (let i = 0; i < n && ivy.count < maxIvy; i++) {
        const y = Math.pow(R(), 1.6) * s.h; const spread = s.w * (1 - y / s.h * 0.7);
        const t = rr(-spread, spread);
        nv.set(s.axis === 'x' ? 0 : s.inner, 0, s.axis === 'x' ? s.inner : 0);
        const off = rr(0.02, 0.16);
        const x = s.axis === 'x' ? s.x + t : s.x + nv.x * off, z = s.axis === 'x' ? s.z + nv.z * off : s.z + t;
        dummyO.position.set(s.axis === 'x' ? x : x, y + 0.2, s.axis === 'x' ? z : z);
        dummyO.lookAt(dummyO.position.x + nv.x, dummyO.position.y + rr(-0.3, 0.6), dummyO.position.z + nv.z);
        dummyO.rotateZ(R() * 6.28); dummyO.scale.setScalar(rr(0.6, 1.2)); dummyO.updateMatrix(); ivy.setMatrixAt(ivy.count++, dummyO.matrix);
      }
    }
    scene.add(ivy);
    const red = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), M.redLeaves, leafSpots.length); red.castShadow = true;
    leafSpots.forEach((p, i) => { dummyO.position.copy(p); dummyO.rotation.set(R() * 6, R() * 6, R() * 6); dummyO.scale.setScalar(p.y < 0.1 ? 0.5 : rr(0.7, 1.4)); if (p.y < 0.1) dummyO.rotation.set(-Math.PI / 2, 0, R() * 6); dummyO.updateMatrix(); red.setMatrixAt(i, dummyO.matrix); });
    scene.add(red);
  }
  // grass tufts
  const grass = (() => {
    const blades = 9, segs = 4; const pos = [], colr = [], nrm = [];
    const base = new THREE.Color(0x1e2a12), tip = new THREE.Color(0x8a9a4a), dry = new THREE.Color(0x9a8a52);
    const BR = rng(5);
    for (let b = 0; b < blades; b++) {
      const a = BR() * Math.PI * 2, r = BR() * 0.18, h = 0.3 + BR() * 0.45, bend = 0.15 + BR() * 0.25, w = 0.025 + BR() * 0.02;
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r, dx = Math.cos(a + 1.3), dz = Math.sin(a + 1.3), lx = Math.cos(a), lz = Math.sin(a);
      const tipC = BR() < 0.3 ? dry : tip;
      const pt = (t, sd) => { const ww = w * (1 - t) ; return [ox + dx * ww * sd + lx * bend * t * t, h * t, oz + dz * ww * sd + lz * bend * t * t]; };
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const A = pt(t0, -1), Bq = pt(t0, 1), C = pt(t1, -1), D = pt(t1, 1);
        const c0 = base.clone().lerp(tipC, t0), c1 = base.clone().lerp(tipC, t1);
        for (const [p, c] of [[A, c0], [Bq, c0], [C, c1], [Bq, c0], [D, c1], [C, c1]]) { pos.push(...p); colr.push(c.r, c.g, c.b); nrm.push(lx * 0.3, 1, lz * 0.3); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const max = 42000; const im = new THREE.InstancedMesh(g, M.grass, max); im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false;
    const patches = [];
    for (let i = 0; i < 90; i++) patches.push({ x: rr(-47, 47), z: rr(-36, 47), r: rr(2, 6) });
    for (const s of ivySpots) patches.push({ x: s.x, z: s.z, r: 3 });
    patches.push({ x: 26, z: 24, r: 7 }, { x: 22, z: 20, r: 5 });
    let k = 0, guard = 0;
    while (k < max && guard++ < max * 4) {
      const p = patches[Math.floor(R() * patches.length)];
      const a = R() * 6.28, d = Math.sqrt(R()) * p.r; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (Math.abs(x) < 4 && z < 0 && z > -36) continue;
      if (x < -53 || x > 53 || z < -43 || z > 53 || insideCollider(x, z, 0.1)) continue;
      const s = rr(0.6, 1.4) * (1 - d / p.r * 0.5);
      dummyO.position.set(x, 0, z); dummyO.rotation.set(0, R() * 6, 0); dummyO.scale.set(s, s * rr(0.7, 1.3), s); dummyO.updateMatrix(); im.setMatrixAt(k++, dummyO.matrix);
    }
    im.userData.max = k; im.count = k; scene.add(im);
    return im;
  })();

  // ---------------------------------------------------------------- sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: shared.uTime, uFlash: { value: 0 }, uHorizon: { value: FOG_COLOR.clone() }, uZenith: { value: new THREE.Color(0x1c2028) }, uSun: { value: new THREE.Vector3(-0.5, 0.25, -0.8).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uFlash; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float y = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(y, 0.55));
        vec2 uv = d.xz / (d.y + 0.12) * 1.4;
        float c = fbm(uv + vec2(uTime*0.012, uTime*0.006)); float c2 = fbm(uv*2.3 - vec2(uTime*0.02, 0.0));
        float cloud = smoothstep(0.35, 0.85, c*0.7 + c2*0.45);
        vec3 cc = mix(vec3(0.32,0.35,0.4), vec3(0.12,0.13,0.16), cloud);
        col = mix(col, cc, cloud * smoothstep(0.0, 0.25, y) * 0.85);
        float sun = pow(max(dot(d, uSun), 0.0), 6.0);
        col += vec3(0.55,0.42,0.3) * sun * 0.35 * (1.0 - cloud*0.6);
        col += vec3(0.6,0.65,0.8) * uFlash * (0.4 + cloud*1.4) * smoothstep(-0.05, 0.3, d.y);
        col = mix(col, uHorizon, smoothstep(0.08, -0.02, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);

  const staticMeshes = B.build(scene);
  return { colliders, playerOnly, torches, smokeSpots, dynamic, sky, grass, statues, staticMeshes, groundHeight };
}
