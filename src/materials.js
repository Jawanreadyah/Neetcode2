import * as THREE from 'three';
import * as T from './textures.js';

export const shared = { uTime: { value: 0 }, uWind: { value: 1 } };

/** Adds a GPU wind sway to a standard material. mode: 'grass' (by height) or 'cloth' (by uv.y from top). */
export function addWind(mat, mode = 'grass', amp = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      ${mode === 'grass' ? `
        vec4 wp0 = vec4(0.0,0.0,0.0,1.0);
        #ifdef USE_INSTANCING
          wp0 = instanceMatrix * wp0;
        #endif
        wp0 = modelMatrix * wp0;
        float hh = max(position.y, 0.0);
        float gust = sin(uTime*0.7 + wp0.x*0.05) * 0.5 + 0.5;
        float sw = sin(uTime*2.1 + wp0.x*0.35 + wp0.z*0.27) * (0.6 + gust) + sin(uTime*4.3 + wp0.z*0.9)*0.25;
        transformed.x += sw * hh * hh * ${(0.35 * amp).toFixed(3)} * uWind;
        transformed.z += sw * hh * hh * ${(0.18 * amp).toFixed(3)} * uWind;
      ` : `
        float hang = 1.0 - uv.y;
        vec4 wq = modelMatrix * vec4(position, 1.0);
        float wv = sin(uTime*1.8 + hang*4.0 + wq.x*0.3 + wq.z*0.2) * 0.6 + sin(uTime*3.3 + hang*7.0 + wq.y)*0.25;
        transformed.z += wv * hang * hang * ${(0.35 * amp).toFixed(3)} * uWind;
        transformed.x += sin(uTime*1.3 + hang*3.0) * hang * ${(0.06 * amp).toFixed(3)} * uWind;
      `}
    `);
  };
  mat.customProgramCacheKey = () => 'wind-' + mode + amp;
  return mat;
}

export async function createMaterials(onStep, aniso = 8) {
  const step = async (label, frac) => { onStep(label, frac); await new Promise((r) => setTimeout(r, 0)); };
  const fixAniso = (o) => { for (const k in o) if (o[k] && o[k].isTexture) o[k].anisotropy = aniso; return o; };

  await step('Quarrying stone', 0.05);
  const stoneT = fixAniso(T.stoneTextures({ seed: 3, rows: 7, moss: 0.3 }));
  await step('Cutting ashlar blocks', 0.15);
  const blockT = fixAniso(T.stoneTextures({ seed: 11, rows: 3, base: [128, 120, 106], moss: 0.18, variance: 0.22 }));
  await step('Weathering the old walls', 0.25);
  const darkT = fixAniso(T.stoneTextures({ seed: 19, rows: 10, base: [92, 88, 82], moss: 0.55, grime: 0.8 }));
  await step('Churning the courtyard mud', 0.35);
  const groundT = fixAniso(T.groundTextures({ seed: 9 }));
  await step('Sawing timber', 0.5);
  const woodT = fixAniso(T.woodTextures({ seed: 21 }));
  const slateT = fixAniso(T.slateTextures({ seed: 33 }));
  await step('Forging steel', 0.6);
  const metalT = fixAniso(T.metalTextures({}));
  const chainT = T.chainmailTextures({});
  const fabricT = T.fabricTextures({});
  const barkT = fixAniso(T.barkTextures({}));
  await step('Weaving the banners', 0.7);

  const m = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);

  m.stone = std({ ...stoneT, color: 0xd8d0c4 }); m.stone.userData.uvScale = 1 / 4;
  m.blocks = std({ ...blockT, color: 0xe0d6c6 }); m.blocks.userData.uvScale = 1 / 3;
  m.stoneDark = std({ ...darkT, color: 0xcfc8bc }); m.stoneDark.userData.uvScale = 1 / 3.5;
  m.trim = std({ ...blockT, color: 0xbab0a0 }); m.trim.userData.uvScale = 1 / 1.5;

  groundT.map.repeat.set(70, 70); groundT.normalMap.repeat.set(70, 70); groundT.roughnessMap.repeat.set(70, 70);
  m.ground = std({ ...groundT, color: 0xffffff, normalScale: new THREE.Vector2(1.2, 1.2), envMapIntensity: 1.6 });

  m.wood = std({ ...woodT, color: 0xd2b8a0 }); m.wood.userData.uvScale = 1 / 2;
  m.woodDark = std({ ...woodT, color: 0x7a6656 }); m.woodDark.userData.uvScale = 1 / 2;
  m.woodRed = std({ ...woodT, color: 0xb04a38, roughness: 0.8 }); m.woodRed.userData.uvScale = 1 / 1.5;
  m.slate = std({ ...slateT, color: 0xb8bcc4, envMapIntensity: 1.3 }); m.slate.userData.uvScale = 1 / 3;
  m.iron = std({ ...metalT, color: 0x3a3a3e, metalness: 1, roughness: 0.6 }); m.iron.userData.uvScale = 1;
  m.bronze = std({ ...metalT, color: 0x8a6440, metalness: 0.92, roughness: 0.55, normalScale: new THREE.Vector2(0.6, 0.6) });
  m.statueStone = std({ ...darkT, color: 0xa8a49c }); m.statueStone.userData.uvScale = 1 / 1.5;
  m.window = std({ color: 0x120a04, emissive: 0xff8a30, emissiveIntensity: 2.4, roughness: 1 });
  m.windowDark = std({ color: 0x050403, roughness: 1 });
  m.black = std({ color: 0x050403, roughness: 1 });
  m.hay = std({ ...fabricT, color: 0xb89a50, roughness: 1 }); m.hay.userData.uvScale = 1;
  m.bark = std({ ...barkT, color: 0xf0ece4 }); m.bark.userData.uvScale = 1 / 1.5;
  m.mountain = std({ color: 0x3a3e44, roughness: 1, flatShading: true });
  m.pine = std({ color: 0x1c2a22, roughness: 1, flatShading: true });
  m.water = std({ color: 0x0a0d10, roughness: 0.02, metalness: 0.2, envMapIntensity: 2 });

  // character materials
  m.steel = std({ color: 0xa8acb2, metalness: 1, roughness: 0.32, roughnessMap: metalT.roughnessMap, normalMap: metalT.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
  m.darkSteel = std({ color: 0x3a3c40, metalness: 1, roughness: 0.42, roughnessMap: metalT.roughnessMap });
  m.blackSteel = std({ color: 0x1a1a1c, metalness: 1, roughness: 0.38, roughnessMap: metalT.roughnessMap });
  m.gold = std({ color: 0xd8a848, metalness: 1, roughness: 0.3 });
  chainT.map.repeat.set(4, 4); chainT.normalMap.repeat.set(4, 4); chainT.roughnessMap.repeat.set(4, 4);
  m.chain = std({ ...chainT, color: 0x9a9a9e, metalness: 1, roughness: 0.5 });
  m.leather = std({ ...fabricT, color: 0x3a2618, roughness: 0.75 });
  fabricT.map.repeat.set(2, 2);
  m.clothWolf = std({ map: fabricT.map, normalMap: fabricT.normalMap, color: 0x3c424a, roughness: 0.95, side: THREE.DoubleSide });
  m.clothLion = std({ map: fabricT.map, normalMap: fabricT.normalMap, color: 0x7a1410, roughness: 0.9, side: THREE.DoubleSide });
  m.clothBoss = std({ map: fabricT.map, normalMap: fabricT.normalMap, color: 0x1a1414, roughness: 0.9, side: THREE.DoubleSide });
  m.fur = std({ map: barkT.map, normalMap: barkT.normalMap, normalScale: new THREE.Vector2(2, 2), color: 0x4a3a2c, roughness: 1 });
  m.tabardWolf = std({ map: T.tabardTexture('wolf'), roughness: 0.95, side: THREE.DoubleSide });
  m.tabardLion = std({ map: T.tabardTexture('lion'), roughness: 0.95, side: THREE.DoubleSide });
  m.plume = std({ color: 0x9a1a10, roughness: 0.9 });
  m.eyeGlow = new THREE.MeshBasicMaterial({ color: 0xff3a10 });

  // banners & foliage
  m.bannerWolf = addWind(std({ map: T.bannerTexture('wolf'), roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 }), 'cloth', 1);
  m.bannerLion = addWind(std({ map: T.bannerTexture('lion'), roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 }), 'cloth', 1);
  m.flag = addWind(std({ map: fabricT.map, color: 0x9aa0a8, roughness: 0.9, side: THREE.DoubleSide }), 'cloth', 2.2);
  m.relief = std({ map: blockT.map, normalMap: T.reliefNormal('wolf'), normalScale: new THREE.Vector2(2.5, 2.5), roughness: 0.85, color: 0xc8c0b0 });
  m.reliefBronze = std({ normalMap: T.reliefNormal('wolf'), normalScale: new THREE.Vector2(2, 2), color: 0x9a7040, metalness: 0.9, roughness: 0.45 });
  m.ivy = addWind(std({ map: T.leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 }), 'grass', 0.15);
  m.redLeaves = addWind(std({ map: T.leafTexture([150, 22, 14]), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 }), 'grass', 0.25);
  m.grass = addWind(std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), 'grass', 1);
  m.puff = T.puffTexture();

  for (const k of ['window', 'eyeGlow', 'black', 'windowDark']) m[k].userData.noShadow = true;
  await step('Raising the walls', 0.8);
  return m;
}
