// Procedurally modelled armoured knight with a joint hierarchy and pose-based animation.
import * as THREE from 'three';

const JOINTS = ['hips', 'spine', 'chest', 'neck', 'lShoulder', 'lElbow', 'lHand', 'rShoulder', 'rElbow', 'rHand', 'lHip', 'lKnee', 'rHip', 'rKnee'];

export const POSES = {
  guard: { spine: [0.05, 0, 0], chest: [0, 0.2, 0], neck: [0, -0.15, 0], rShoulder: [-0.45, 0.1, -0.15], rElbow: [-1.0, 0, 0], rHand: [0.35, 0, 0],
    lShoulder: [-0.25, 0, 0.18], lElbow: [-0.6, 0, 0], lHand: [0, 0, 0], lHip: [-0.18, 0, 0.06], lKnee: [0.25, 0, 0], rHip: [0.12, 0, -0.06], rKnee: [0.2, 0, 0], hipsY: -0.03 },
  shieldGuard: { lShoulder: [-0.6, 0, 0.25], lElbow: [-1.0, 0, 0] },
  shieldBlock: { lShoulder: [-1.15, 0.1, 0.1], lElbow: [-1.3, 0, 0], chest: [0, 0.35, 0], spine: [0.1, 0, 0] },
  swordBlock: { rShoulder: [-1.35, 0.45, -0.25], rElbow: [-1.15, 0, 0], rHand: [0.25, 1.35, 0], lShoulder: [-1.2, -0.5, 0.35], lElbow: [-1.25, 0, 0], chest: [0, 0, 0], spine: [0.08, 0, 0] },
  // light combo
  slashA_wind: { chest: [0, -0.85, 0], spine: [0, -0.3, 0], rShoulder: [-1.3, 0, -1.25], rElbow: [-1.2, 0, 0], rHand: [0.3, 0.2, 0] },
  slashA_hit: { chest: [0.1, 0.95, 0], spine: [0.1, 0.35, 0], rShoulder: [-1.5, 0, -0.1], rElbow: [-0.15, 0, 0], rHand: [0.9, 1.2, 0], lHip: [-0.5, 0, 0], lKnee: [0.5, 0, 0], hipsY: -0.08 },
  slashB_wind: { spine: [-0.2, 0, 0], chest: [-0.2, -0.2, 0], rShoulder: [-2.9, 0, -0.2], rElbow: [-1.3, 0, 0], rHand: [0.6, 0, 0], lShoulder: [-1.0, 0, 0.3] },
  slashB_hit: { spine: [0.35, 0, 0], chest: [0.25, 0.1, 0], rShoulder: [-1.2, 0, -0.1], rElbow: [-0.2, 0, 0], rHand: [1.2, 0, 0], lHip: [-0.7, 0, 0], lKnee: [0.7, 0, 0], rHip: [0.35, 0, 0], rKnee: [0.4, 0, 0], hipsY: -0.14 },
  slashC_wind: { chest: [0, 0.9, 0], spine: [0, 0.3, 0], rShoulder: [-0.9, 0, 0.65], rElbow: [-1.4, 0, 0], rHand: [0.5, -1.0, 0] },
  slashC_hit: { chest: [0, -0.95, 0], spine: [0.05, -0.35, 0], rShoulder: [-1.9, 0, -1.15], rElbow: [-0.2, 0, 0], rHand: [0.6, -0.8, 0], rHip: [-0.5, 0, 0], rKnee: [0.5, 0, 0], hipsY: -0.08 },
  heavy_wind: { spine: [-0.35, 0, 0], chest: [-0.3, -0.5, 0], rShoulder: [-3.0, 0, -0.35], rElbow: [-1.5, 0, 0], rHand: [0.5, 0, 0], lShoulder: [-2.6, 0, 0.3], lElbow: [-1.3, 0, 0], lHip: [0.3, 0, 0], rHip: [-0.4, 0, 0], rKnee: [0.5, 0, 0] },
  heavy_hit: { spine: [0.5, 0, 0], chest: [0.35, 0.15, 0], rShoulder: [-1.0, 0, -0.1], rElbow: [-0.1, 0, 0], rHand: [1.35, 0, 0], lShoulder: [-1.1, -0.4, 0.2], lElbow: [-0.5, 0, 0], lHip: [-0.9, 0, 0], lKnee: [0.9, 0, 0], rHip: [0.45, 0, 0], rKnee: [0.5, 0, 0], hipsY: -0.22 },
  hit: { spine: [-0.35, 0, 0.1], chest: [-0.25, 0.3, 0.1], neck: [-0.3, 0, 0] },
  dodge: { spine: [0.55, 0, 0], chest: [0.3, 0, 0], lHip: [-1.0, 0, 0], lKnee: [1.3, 0, 0], rHip: [-0.3, 0, 0], rKnee: [1.4, 0, 0], hipsY: -0.32, rShoulder: [-0.8, 0, -0.4], lShoulder: [-0.8, 0, 0.4] },
  statue: { spine: [0, 0, 0], chest: [0, 0, 0], neck: [0.15, 0, 0], rShoulder: [-0.5, 0, 0.28], rElbow: [-0.95, 0, 0], rHand: [2.95, 0, 0], lShoulder: [-0.5, 0, -0.28], lElbow: [-0.95, 0, 0],
    lHip: [0, 0, 0.06], rHip: [0, 0, -0.06], lKnee: [0, 0, 0], rKnee: [0, 0, 0], hipsY: 0 },
};

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

// shared geometries
const G = {};
function geos() {
  if (G.ready) return G;
  G.cyl = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
  G.sph = new THREE.SphereGeometry(1, 20, 14);
  G.halfSph = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  G.frontSph = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI, 0, Math.PI);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.torus = new THREE.TorusGeometry(1, 0.25, 8, 24);
  const blade = new THREE.CylinderGeometry(0.003, 0.026, 0.86, 4, 6); blade.scale(1, 1, 0.22); blade.rotateX(Math.PI / 2); blade.translate(0, 0, 0.54);
  G.blade = blade;
  const fuller = new THREE.BoxGeometry(0.006, 0.004, 0.6); fuller.translate(0, 0, 0.42); G.fuller = fuller;
  const sh = new THREE.Shape(); sh.moveTo(-0.26, 0.3); sh.lineTo(0.26, 0.3); sh.quadraticCurveTo(0.28, -0.15, 0, -0.42); sh.quadraticCurveTo(-0.28, -0.15, -0.26, 0.3);
  G.shield = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 16 });
  const shFace = new THREE.ShapeGeometry(sh, 16);
  const uv = shFace.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.6 + 0.5, (uv.getY(i) + 0.42) / 0.72 * 0.5 + 0.5);
  G.shieldFace = shFace;
  G.horn = (() => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(Math.sin(t * 1.6) * 0.18, Math.sin(t * 2.4) * 0.12 + t * 0.12, 0)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.025, 8, false); })();
  G.ready = true;
  return G;
}

export class KnightModel {
  /**
   * @param {object} o  { mats, house: 'wolf'|'lion'|'boss', shield, statue: Material, scale }
   */
  constructor(o) {
    const g = geos(); const M = o.mats;
    const S = o.statue; // statue: everything one material
    const steel = S || (o.house === 'boss' ? M.blackSteel : M.steel);
    const dark = S || (o.house === 'boss' ? M.gold : M.darkSteel);
    const chain = S || M.chain, leather = S || M.leather;
    const cloth = S || (o.house === 'wolf' ? M.clothWolf : o.house === 'boss' ? M.clothBoss : M.clothLion);
    const tabard = S || (o.house === 'wolf' ? M.tabardWolf : M.tabardLion);
    this.house = o.house;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    const j = (this.j = {});
    for (const n of JOINTS) j[n] = new THREE.Group();
    this.rest = {};

    // hierarchy
    this.root.add(j.hips); j.hips.position.y = 0.98;
    j.hips.add(j.spine); j.spine.position.y = 0.05;
    j.spine.add(j.chest); j.chest.position.y = 0.24;
    j.chest.add(j.neck); j.neck.position.y = 0.38;
    j.chest.add(j.lShoulder); j.lShoulder.position.set(0.25, 0.3, 0);
    j.chest.add(j.rShoulder); j.rShoulder.position.set(-0.25, 0.3, 0);
    j.lShoulder.add(j.lElbow); j.lElbow.position.y = -0.29;
    j.rShoulder.add(j.rElbow); j.rElbow.position.y = -0.29;
    j.lElbow.add(j.lHand); j.lHand.position.y = -0.27;
    j.rElbow.add(j.rHand); j.rHand.position.y = -0.27;
    j.hips.add(j.lHip); j.lHip.position.set(0.105, -0.06, 0);
    j.hips.add(j.rHip); j.rHip.position.set(-0.105, -0.06, 0);
    j.lHip.add(j.lKnee); j.lKnee.position.y = -0.45;
    j.rHip.add(j.rKnee); j.rKnee.position.y = -0.45;

    // --- pelvis
    mesh(g.cyl(0.17, 0.2, 0.16), chain, j.hips, 0, -0.02, 0);
    mesh(g.torus, leather, j.hips, 0, 0.06, 0, Math.PI / 2, 0, 0, 0.19, 0.17, 0.12);
    mesh(g.box, dark, j.hips, 0, 0.06, 0.18, 0, 0, 0, 0.07, 0.06, 0.02); // buckle
    // faulds: layered plates
    for (let i = 0; i < 3; i++) mesh(g.cyl(0.2 + i * 0.012, 0.215 + i * 0.012, 0.07, 16, true), steel, j.hips, 0, -0.04 - i * 0.055, 0);
    // tabard skirt (front & back)
    const skirtGeo = new THREE.PlaneGeometry(0.3, 0.5, 1, 4); skirtGeo.translate(0, -0.25, 0);
    const suv = skirtGeo.attributes.uv; for (let i = 0; i < suv.count; i++) suv.setY(i, suv.getY(i) * 0.5);
    this.skirtF = mesh(skirtGeo, tabard, j.hips, 0, -0.02, 0.215);
    this.skirtB = mesh(skirtGeo, cloth, j.hips, 0, -0.02, -0.215);

    // --- torso
    mesh(g.cyl(0.18, 0.17, 0.28), chain, j.spine, 0, 0.1, 0);
    mesh(g.cyl(0.215, 0.18, 0.4, 16), chain, j.chest, 0, 0.14, 0);
    mesh(g.frontSph, steel, j.chest, 0, 0.17, 0.0, 0, 0, 0, 0.215, 0.27, 0.19);
    mesh(g.frontSph, steel, j.chest, 0, 0.17, 0.0, 0, Math.PI, 0, 0.21, 0.26, 0.15);
    // tabard over chest (partial cylinder)
    const tab = new THREE.CylinderGeometry(0.222, 0.2, 0.34, 18, 1, true, -1.1, 2.2);
    const tuv = tab.attributes.uv; for (let i = 0; i < tuv.count; i++) tuv.setY(i, 0.5 + tuv.getY(i) * 0.5);
    mesh(tab, tabard, j.chest, 0, 0.12, 0);
    mesh(g.cyl(0.11, 0.13, 0.1), steel, j.chest, 0, 0.36, 0); // gorget
    if (o.house === 'wolf' && !S) mesh(g.torus, M.fur, j.chest, 0, 0.36, -0.01, Math.PI / 2, 0, 0, 0.21, 0.19, 0.42);

    // --- head / helm
    const head = new THREE.Group(); j.neck.add(head); head.position.y = 0.04;
    mesh(g.cyl(0.05, 0.06, 0.08), chain, j.neck, 0, 0, 0);
    if (o.house === 'wolf') {
      // great helm with flat top & cross
      mesh(g.cyl(0.13, 0.135, 0.25, 18), steel, head, 0, 0.12, 0);
      mesh(g.halfSph, steel, head, 0, 0.245, 0, 0, 0, 0, 0.13, 0.05, 0.13);
      mesh(g.box, M.black || steel, head, 0, 0.14, 0.124, 0, 0, 0, 0.2, 0.022, 0.02);
      mesh(g.box, dark, head, 0, 0.1, 0.132, 0, 0, 0, 0.02, 0.2, 0.012);
      mesh(g.box, dark, head, 0, 0.165, 0.128, 0, 0, 0, 0.24, 0.018, 0.015);
    } else if (o.house === 'boss') {
      mesh(g.cyl(0.14, 0.15, 0.27, 18), steel, head, 0, 0.13, 0);
      mesh(g.halfSph, steel, head, 0, 0.265, 0, 0, 0, 0, 0.14, 0.09, 0.14);
      const eyes = mesh(g.box, S || M.eyeGlow, head, 0, 0.15, 0.135, 0, 0, 0, 0.2, 0.02, 0.02); eyes.castShadow = false;
      const h1 = mesh(g.horn, dark, head, 0.12, 0.22, 0, 0, 0, 0); h1.scale.set(1.5, 1.5, 1.5);
      const h2 = mesh(g.horn, dark, head, -0.12, 0.22, 0, 0, Math.PI, 0); h2.scale.set(1.5, 1.5, 1.5);
    } else {
      // kettle-sallet with crest
      mesh(g.sph, steel, head, 0, 0.13, 0, 0, 0, 0, 0.13, 0.14, 0.14);
      mesh(g.cyl(0.19, 0.19, 0.015, 24), steel, head, 0, 0.1, 0); // brim
      mesh(g.box, M.black || steel, head, 0, 0.1, 0.122, 0, 0, 0, 0.17, 0.05, 0.03);
      if (!S) mesh(g.sph, M.plume, head, 0, 0.27, -0.02, 0, 0, 0, 0.025, 0.08, 0.17);
    }
    this.head = head;

    // --- arms
    const arm = (side) => {
      const sh = j[side + 'Shoulder'], el = j[side + 'Elbow'], ha = j[side + 'Hand'], sx = side === 'l' ? 1 : -1;
      for (let i = 0; i < 3; i++) mesh(g.halfSph, steel, sh, 0.03 * sx, 0.04 - i * 0.06, 0, 0, 0, -0.5 * sx, 0.13 - i * 0.006, 0.09, 0.13);
      mesh(g.cyl(0.058, 0.052, 0.26), chain, sh, 0, -0.14, 0);
      mesh(g.cyl(0.064, 0.058, 0.14), steel, sh, 0, -0.17, 0);
      mesh(g.sph, steel, el, 0, 0, 0, 0, 0, 0, 0.058, 0.058, 0.058);
      mesh(g.halfSph, dark, el, 0, 0, -0.03, -Math.PI / 2, 0, 0, 0.06, 0.05, 0.06);
      mesh(g.cyl(0.054, 0.045, 0.24), steel, el, 0, -0.13, 0);
      mesh(g.cyl(0.07, 0.05, 0.06), steel, el, 0, -0.24, 0); // flared cuff
      mesh(g.box, steel, ha, 0, -0.04, 0.01, 0, 0, 0, 0.075, 0.1, 0.09);
      mesh(g.box, leather, ha, 0, -0.1, 0.02, 0.3, 0, 0, 0.07, 0.05, 0.08);
    };
    arm('l'); arm('r');

    // --- legs
    const leg = (side) => {
      const hp = j[side + 'Hip'], kn = j[side + 'Knee'];
      mesh(g.cyl(0.08, 0.066, 0.44), chain, hp, 0, -0.22, 0);
      mesh(g.cyl(0.085, 0.07, 0.3, 14, true), steel, hp, 0, -0.24, 0.005);
      mesh(g.sph, steel, kn, 0, 0, 0.02, 0, 0, 0, 0.065, 0.065, 0.07);
      mesh(g.halfSph, dark, kn, 0, 0, 0.045, Math.PI / 2, 0, 0, 0.055, 0.03, 0.055);
      mesh(g.cyl(0.064, 0.05, 0.38), steel, kn, 0, -0.21, 0);
      mesh(g.box, steel, kn, 0, -0.43, 0.05, 0, 0, 0, 0.1, 0.07, 0.24);
      mesh(g.box, leather, kn, 0, -0.465, 0.04, 0, 0, 0, 0.105, 0.02, 0.26);
    };
    leg('l'); leg('r');

    // --- sword
    const sword = (this.sword = new THREE.Group()); j.rHand.add(sword); sword.position.set(0, -0.05, 0.02);
    const big = o.house === 'boss' ? 1.35 : 1;
    sword.scale.setScalar(big);
    mesh(g.blade, S || M.steel, sword);
    if (!S) mesh(g.fuller, M.darkSteel, sword, 0, 0, 0);
    mesh(g.box, dark, sword, 0, 0, 0.1, 0, 0, 0, 0.26, 0.035, 0.04);
    mesh(g.cyl(0.018, 0.02, 0.18, 8), leather, sword, 0, 0, 0, Math.PI / 2, 0, 0);
    mesh(g.sph, dark, sword, 0, 0, -0.1, 0, 0, 0, 0.032, 0.032, 0.032);
    this.bladeBase = new THREE.Object3D(); this.bladeBase.position.z = 0.2; sword.add(this.bladeBase);
    this.bladeTip = new THREE.Object3D(); this.bladeTip.position.z = 0.98; sword.add(this.bladeTip);

    // --- shield
    if (o.shield) {
      const sg = new THREE.Group(); j.lElbow.add(sg);
      sg.position.set(0.09, -0.14, 0.0); sg.rotation.set(Math.PI / 2, 0, 0); sg.rotateY(0.15);
      mesh(g.shield, S || M.woodDark, sg, 0, 0, -0.03);
      const face = mesh(g.shieldFace, S || M.tabardLion, sg, 0, 0, 0.018);
      face.castShadow = false;
      mesh(g.torus, dark, sg, 0, 0.05, 0.04, 0, 0, 0, 0.05, 0.05, 0.05);
      this.shieldMesh = sg;
    }

    // --- cape (CPU cloth)
    const capeGeo = new THREE.PlaneGeometry(0.5, 1.05, 6, 12); capeGeo.translate(0, -0.525, 0);
    this.cape = mesh(capeGeo, cloth, j.chest, 0, 0.34, -0.19);
    this.capeBase = capeGeo.attributes.position.array.slice();
    this.capeStatic = !!S;

    for (const n of JOINTS) this.rest[n] = j[n].rotation.clone();
    this.hipsBaseY = j.hips.position.y;
    this.root.scale.setScalar(o.scale || 1);
    this.root.traverse((c) => { if (c.isMesh && S) { c.castShadow = true; } });
  }

  /** Apply a blended pose: pose is { joint: [x,y,z], hipsY }. */
  applyPose(p) {
    for (const n of JOINTS) {
      const v = p[n]; const r = this.j[n].rotation;
      if (v) r.set(v[0], v[1], v[2]); else r.set(0, 0, 0);
    }
    this.j.hips.position.y = this.hipsBaseY + (p.hipsY || 0);
  }

  updateCape(t, speed, lean = 0) {
    if (this.capeStatic) return;
    const pos = this.cape.geometry.attributes.position; const b = this.capeBase;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1];
      const v = -y / 1.05; // 0 top .. 1 bottom
      const back = v * v * (0.12 + Math.min(speed, 8) * 0.06) + v * 0.08 + lean * v * 0.3;
      const wave = Math.sin(t * (3 + speed * 0.6) + v * 5 + x * 6) * 0.035 * v * (1 + speed * 0.25);
      pos.setXYZ(i, x * (1 + v * 0.25), y + back * 0.2 * v, -back - wave);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
    // skirt sway follows legs
    const lh = this.j.lHip.rotation.x, rh = this.j.rHip.rotation.x;
    this.skirtF.rotation.x = Math.min(lh, rh) * 0.6 - 0.05;
    this.skirtB.rotation.x = Math.max(lh, rh) * 0.6 + 0.05;
  }
}

// ---------- pose math ----------
export function blendPose(out, a, b, t) {
  for (const n of JOINTS) {
    const va = a[n] || ZERO, vb = b[n] || ZERO;
    const o = out[n] || (out[n] = [0, 0, 0]);
    o[0] = va[0] + (vb[0] - va[0]) * t; o[1] = va[1] + (vb[1] - va[1]) * t; o[2] = va[2] + (vb[2] - va[2]) * t;
  }
  out.hipsY = (a.hipsY || 0) + ((b.hipsY || 0) - (a.hipsY || 0)) * t;
  return out;
}
/** Overlay: values from b replace a where defined, weighted. */
export function overlayPose(out, base, over, w) {
  for (const n of JOINTS) {
    const va = base[n] || ZERO; const vb = over[n];
    const o = out[n] || (out[n] = [0, 0, 0]);
    if (vb) { o[0] = va[0] + (vb[0] - va[0]) * w; o[1] = va[1] + (vb[1] - va[1]) * w; o[2] = va[2] + (vb[2] - va[2]) * w; } else { o[0] = va[0]; o[1] = va[1]; o[2] = va[2]; }
  }
  out.hipsY = over.hipsY !== undefined ? (base.hipsY || 0) + (over.hipsY - (base.hipsY || 0)) * w : base.hipsY || 0;
  return out;
}
export function clonePose(p) { const o = {}; for (const k in p) o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; return o; }
export function fullPose(...layers) { // merge partial poses on top of guard
  const o = clonePose(POSES.guard); for (const l of layers) for (const k in l) o[k] = Array.isArray(l[k]) ? l[k].slice() : l[k]; return o;
}
const ZERO = [0, 0, 0];
export { JOINTS };
