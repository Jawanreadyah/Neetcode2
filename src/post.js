// Post-processing: MSAA HDR target -> GTAO -> Bloom -> Tone map (ACES) -> cinematic grade.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

class FilteredGTAOPass extends GTAOPass {
  constructor(...a) { super(...a); this.hide = []; }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    const vis = this.hide.map((o) => o.visible); this.hide.forEach((o) => (o.visible = false));
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
    this.hide.forEach((o, i) => (o.visible = vis[i]));
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uDamage: { value: 0 }, uFlash: { value: 0 }, uVignette: { value: 0.9 }, uGrain: { value: 0.03 }, uCA: { value: 0.004 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uDamage, uFlash, uVignette, uGrain, uCA; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * uCA * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.9, 0.98, 1.1), (1.0 - l) * 0.45);
      col = mix(col, col * vec3(1.1, 1.0, 0.86), smoothstep(0.35, 1.0, l) * 0.5);
      col = mix(vec3(l), col, 0.9);
      col = (col - 0.5) * 1.07 + 0.5;
      col *= mix(1.0, smoothstep(0.95, 0.25, length(c) * 1.25), uVignette);
      col = mix(col, vec3(0.45, 0.0, 0.0), uDamage * smoothstep(0.15, 0.75, length(c)));
      col += vec3(0.7, 0.75, 0.9) * uFlash * 0.15;
      float g = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.hide = [];
  }
  build(q) {
    const r = this.renderer; const size = r.getDrawingBufferSize(new THREE.Vector2());
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer.passes.forEach((p) => p.dispose && p.dispose()); }
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const ao = new FilteredGTAOPass(this.scene, this.camera, size.x, size.y);
      ao.hide = this.hide;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 2.0, scale: 1.2, samples: 16, distanceFallOff: 1.0 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      ao.blendIntensity = 0.9;
      this.composer.addPass(ao); this.ao = ao;
    } else this.ao = null;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.45, 0.96);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uRes.value.set(size.x, size.y);
    this.composer.addPass(this.grade);
    this.composer.setSize(size.x, size.y);
  }
  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    this.grade.uniforms.uRes.value.set(size.x, size.y);
  }
  render(dt) { this.composer.render(dt); }
}
