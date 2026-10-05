// Static geometry batcher: transforms, world-space UV projection and merging by material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Box-projects UVs in world space per triangle so texel density is uniform everywhere. */
export function projectUVs(geo, scale) {
  const pos = geo.attributes.position; const n = pos.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
    const ax = Math.abs(ab.x), ay = Math.abs(ab.y), az = Math.abs(ab.z);
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z * Math.sign(ab.x || 1); v = y; } else { u = -x * Math.sign(ab.z || 1); v = y; }
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, material, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (material.userData.uvScale) projectUVs(g, material.userData.uvScale);
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return g;
  }
  build(parent, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      // split into chunks to keep buffers sane & allow culling
      const CH = 400;
      for (let i = 0; i < list.length; i += CH) {
        const merged = mergeGeometries(list.slice(i, i + CH), false);
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast && !mat.userData.noShadow; mesh.receiveShadow = receive;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        parent.add(mesh); meshes.push(mesh);
      }
      list.forEach((g) => g.dispose());
    }
    this.groups.clear();
    return meshes;
  }
}

/** Arch-panel outline: a wall of width W, height H with an arched opening of span s. */
export function archPanelGeometry(W, H, depth, span, spring, rise, bevel = 0.04) {
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, 0); sh.lineTo(-span / 2, 0); sh.lineTo(-span / 2, spring);
  sh.absellipse(0, spring, span / 2, rise, Math.PI, 0, true);
  sh.lineTo(span / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H); sh.lineTo(-W / 2, H); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 28 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Displaced rock geometry. */
export function rockGeometry(seed = 1, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 2) * Math.sin(v.z * 3.7 + seed * 3);
    const n2 = Math.sin(v.x * 9 + seed) * Math.sin(v.z * 8 - seed) * 0.3;
    v.multiplyScalar(1 + n * 0.25 + n2 * 0.1);
    v.y *= 0.65;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
