// GPU rain, puddle ripples, torch fire, embers, smoke, ground mist, combat particles and sword trails.
import * as THREE from 'three';
import { shared } from './materials.js';

const HASH = `
float hash1(float n){ return fract(sin(n)*43758.5453123); }
vec2 hash2(float n){ return fract(sin(vec2(n, n+1.37))*vec2(43758.5453,22578.1459)); }`;

export const fxUniforms = { uCam: { value: new THREE.Vector3() }, uFlash: { value: 0 }, uViewH: { value: 1000 }, uRain: { value: 1 } };

function quadInstanced(count, attrs) {
  const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  for (const [k, size, fill] of attrs) { const a = new Float32Array(count * size); for (let i = 0; i < count; i++) fill(a, i * size, i); g.setAttribute(k, new THREE.InstancedBufferAttribute(a, size)); }
  g.instanceCount = count;
  return g;
}

export class Rain {
  constructor(scene, max = 30000) {
    this.max = max;
    const g = quadInstanced(max, [['aOff', 4, (a, o) => { a[o] = Math.random() * 40; a[o + 1] = Math.random() * 26; a[o + 2] = Math.random() * 40; a[o + 3] = Math.random(); }]]);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: shared.uTime, ...fxUniforms },
      vertexShader: `
        attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; varying vec2 vUv; varying float vA;
        void main(){
          const float S = 40.0, H = 26.0;
          float speed = 17.0 + aOff.w * 7.0;
          vec3 wind = vec3(2.2, 0.0, 1.1);
          vec3 p = aOff.xyz;
          p.y = mod(p.y - uTime * speed, H);
          p.xz += wind.xz * (p.y / speed);
          p.x = uCam.x + mod(p.x - uCam.x + S*0.5, S) - S*0.5;
          p.z = uCam.z + mod(p.z - uCam.z + S*0.5, S) - S*0.5;
          p.y += -1.0 + max(uCam.y - 10.0, 0.0);
          vec3 dir = normalize(vec3(wind.x, -speed, wind.z));
          vec3 toCam = normalize(cameraPosition - p);
          vec3 right = normalize(cross(dir, toCam));
          float len = 0.5 + aOff.w * 0.45;
          vec3 wp = p + right * (position.x * 0.016) - dir * (position.y * len);
          float d = length(p - cameraPosition);
          vA = smoothstep(20.0, 6.0, d) * smoothstep(0.4, 1.5, d);
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform float uFlash; varying vec2 vUv; varying float vA;
        void main(){
          float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          gl_FragColor = vec4(vec3(0.62, 0.68, 0.76) * (1.0 + uFlash * 3.0), a * vA * 0.42);
        }`,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);

    // ripples
    const N = 2400;
    const rg = quadInstanced(N, [['aSeed', 2, (a, o, i) => { a[o] = i * 1.731 + Math.random(); a[o + 1] = 0.6 + Math.random() * 0.8; }]]);
    const rm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: shared.uTime, ...fxUniforms },
      vertexShader: `${HASH}
        attribute vec2 aSeed; uniform float uTime; uniform vec3 uCam; varying vec2 vUv; varying float vT;
        void main(){
          float k = uTime * aSeed.y * 1.6 + aSeed.x;
          float cyc = floor(k); vT = fract(k);
          vec2 r = hash2(cyc * 7.13 + aSeed.x * 3.1) - 0.5;
          vec3 p = vec3(uCam.x + r.x * 30.0, 0.035, uCam.z + r.y * 30.0);
          vec3 lp = vec3((position.x) * 0.32, 0.0, (position.y - 0.5) * 0.32);
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(p + lp, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv; varying float vT;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.12, 0.0, abs(d - vT)) * (1.0 - vT);
          float splash = smoothstep(0.25, 0.0, d) * smoothstep(0.25, 0.0, vT);
          gl_FragColor = vec4(vec3(0.7, 0.75, 0.82), (ring * 0.35 + splash * 0.5));
        }`,
    });
    this.ripples = new THREE.Mesh(rg, rm); this.ripples.frustumCulled = false; scene.add(this.ripples);
  }
  setCount(n) { this.mesh.geometry.instanceCount = Math.min(this.max, n); }
}

export class Fire {
  /** torches: [{pos, scale}] */
  constructor(scene, torches, perTorch = 34) {
    const buffers = (list, per, dy) => {
      const n = list.length * per; const base = new Float32Array(n * 3), seed = new Float32Array(n), sc = new Float32Array(n);
      list.forEach((t, i) => { for (let k = 0; k < per; k++) { const j = i * per + k; base.set([t.pos.x, t.pos.y + dy, t.pos.z], j * 3); seed[j] = Math.random(); sc[j] = t.scale; } });
      return { base, seed, sc };
    };
    const mk = (embers, { base, seed, sc }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aScale', new THREE.BufferAttribute(sc, 1));
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared.uTime, ...fxUniforms },
        vertexShader: `${HASH}
          attribute float aSeed; attribute float aScale; uniform float uTime; uniform float uViewH; varying float vLife; varying float vSeed;
          void main(){
            float rate = ${embers ? '0.22' : '1.25'} + aSeed * ${embers ? '0.25' : '0.7'};
            float life = fract(uTime * rate + aSeed * 13.0);
            vec3 p = position;
            float h1 = hash1(aSeed * 91.0) - 0.5, h2 = hash1(aSeed * 47.0) - 0.5;
            ${embers ? `
              p += vec3(h1 * 0.4 + sin(uTime * 2.0 + aSeed * 30.0) * 0.4 * life + life * 0.9, life * 4.5, h2 * 0.4 + cos(uTime * 1.7 + aSeed * 20.0) * 0.4 * life) * aScale;
              float sz = 0.035 * (1.0 - life);
            ` : `
              float spread = (1.0 - life) * 0.13;
              p += vec3(h1 * spread + sin(uTime * 7.0 + aSeed * 40.0) * 0.03 * life + life * life * 0.12, life * 0.62, h2 * spread) * aScale;
              float sz = (0.32 - life * 0.22) * (0.7 + aSeed * 0.6);
            `}
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = sz * aScale * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z;
            vLife = life; vSeed = aSeed;
          }`,
        fragmentShader: `
          varying float vLife; varying float vSeed;
          void main(){
            vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
            float a = smoothstep(1.0, 0.0, d);
            ${embers ? `
              vec3 col = vec3(3.0, 1.2, 0.3) * a; gl_FragColor = vec4(col, a * (1.0 - vLife));
            ` : `
              vec3 hot = vec3(4.0, 3.0, 1.6), mid = vec3(3.2, 1.1, 0.22), cool = vec3(0.6, 0.08, 0.02);
              vec3 col = mix(hot, mid, smoothstep(0.0, 0.35, vLife)); col = mix(col, cool, smoothstep(0.35, 0.9, vLife));
              float fade = smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
              gl_FragColor = vec4(col * a * a * fade * 0.4, 1.0);
            `}
          }`,
      });
      const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;
    };
    this.flames = mk(false, buffers(torches, perTorch, 0));
    const big = torches.filter((t) => t.scale > 1.05);
    if (big.length) this.embers = mk(true, buffers(big, 26, 0.2));
  }
}

export class Smoke {
  constructor(scene, spots, tex) {
    const per = 26, n = spots.length * per; const base = new Float32Array(n * 3), seed = new Float32Array(n);
    spots.forEach((s, i) => { for (let k = 0; k < per; k++) { base.set([s.x, s.y, s.z], (i * per + k) * 3); seed[i * per + k] = Math.random(); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: shared.uTime, uTex: { value: tex }, ...fxUniforms },
      vertexShader: `
        attribute float aSeed; uniform float uTime; uniform float uViewH; varying float vLife; varying float vRot;
        void main(){
          float life = fract(uTime * 0.08 + aSeed * 7.0);
          vec3 p = position + vec3(life * 6.0 + sin(aSeed * 40.0) * 0.6, life * 9.0, life * 3.0 + cos(aSeed * 30.0) * 0.6);
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + life * 6.0) * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z;
          vLife = life; vRot = aSeed * 6.28 + life;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying float vLife; varying float vRot;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot); c = mat2(co, -s, s, co) * c;
          float a = texture2D(uTex, c + 0.5).a * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife) * 0.35;
          gl_FragColor = vec4(vec3(0.28, 0.29, 0.31), a);
        }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
  }
}

export class Mist {
  constructor(scene, tex, color) {
    this.cards = [];
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.16, color, fog: true });
    const g = new THREE.PlaneGeometry(1, 1);
    const spots = [];
    for (let i = 0; i < 34; i++) spots.push([(Math.random() - 0.5) * 70, (Math.random() - 0.4) * 70]);
    for (let i = 0; i < 16; i++) spots.push([(Math.random() - 0.5) * 220, -60 - Math.random() * 80]);
    for (const [x, z] of spots) {
      const m = new THREE.Mesh(g, mat.clone()); const far = z < -55;
      const s = far ? 30 + Math.random() * 30 : 12 + Math.random() * 12;
      m.scale.set(s, s * 0.35, 1); m.position.set(x, far ? 8 + Math.random() * 10 : s * 0.11, z);
      m.material.opacity = far ? 0.14 : 0.04 + Math.random() * 0.05;
      m.userData = { base: m.position.clone(), sp: 0.2 + Math.random() * 0.4, ph: Math.random() * 6 };
      m.renderOrder = 3; scene.add(m); this.cards.push(m);
    }
  }
  update(t, camera) {
    for (const c of this.cards) {
      const u = c.userData; c.position.x = u.base.x + Math.sin(t * 0.05 * u.sp + u.ph) * 4;
      c.lookAt(camera.position.x, c.position.y, camera.position.z);
      const d = c.position.distanceTo(camera.position);
      c.visible = d > 4;
    }
  }
}

/** CPU particle pool for sparks (additive) and blood (alpha). */
export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.additive = additive;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...fxUniforms },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uViewH; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = viewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z; vC = aColor; vA = aAlpha; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(p, dir, count, o) {
    for (let k = 0; k < count; k++) {
      let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = (dir.x + (Math.random() - 0.5) * o.spread) * sp;
      this.vel[i * 3 + 1] = (dir.y + (Math.random() - 0.3) * o.spread) * sp;
      this.vel[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * o.spread) * sp;
      this.life[i] = this.maxLife[i] = o.life * (0.5 + Math.random() * 0.8);
      this.col[i * 3] = o.color[0]; this.col[i * 3 + 1] = o.color[1]; this.col[i * 3 + 2] = o.color[2];
      this.size[i] = o.size * (0.5 + Math.random());
    }
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; alive++;
      this.vel[i * 3 + 1] -= 9.8 * dt * (this.additive ? 0.6 : 1);
      const drag = Math.exp(-dt * (this.additive ? 2 : 0.8));
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3] *= 0.3; this.vel[i * 3 + 1] = this.additive ? -this.vel[i * 3 + 1] * 0.3 : 0; this.vel[i * 3 + 2] *= 0.3; }
      this.alpha[i] = Math.min(1, (this.life[i] / this.maxLife[i]) * 2);
    }
    if (alive === 0) this.n = 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    g.setDrawRange(0, this.n);
  }
}

/** Ribbon following blade base & tip. */
export class SwordTrail {
  constructor(scene, color = new THREE.Color(1.4, 1.5, 1.8)) {
    this.N = 18; this.hist = [];
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(this.N * 2 * 3); this.alphaA = new Float32Array(this.N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3)); g.setAttribute('aA', new THREE.BufferAttribute(this.alphaA, 1));
    const idx = []; for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color }, uOn: { value: 0 } },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOn; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * vA * uOn * 0.6, 1.0); }',
    }));
    this.mesh.frustumCulled = false; scene.add(this.mesh); this.on = 0;
  }
  update(base, tip, active, dt) {
    this.on += ((active ? 1 : 0) - this.on) * Math.min(1, dt * (active ? 30 : 10));
    this.hist.unshift([base.clone(), tip.clone()]); if (this.hist.length > this.N) this.hist.pop();
    for (let i = 0; i < this.N; i++) {
      const h = this.hist[Math.min(i, this.hist.length - 1)];
      this.posA.set([h[0].x, h[0].y, h[0].z], i * 6); this.posA.set([h[1].x, h[1].y, h[1].z], i * 6 + 3);
      const a = 1 - i / (this.N - 1); this.alphaA[i * 2] = a * 0.2; this.alphaA[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aA.needsUpdate = true;
    this.mesh.material.uniforms.uOn.value = this.on; this.mesh.visible = this.on > 0.01;
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
