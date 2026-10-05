# A Song of Steel — The Siege of Winterhold

A Game of Thrones–inspired third-person melee game built with three.js (r186). Every model and texture is generated in code, so there are no asset files to download.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

**Controls:** WASD move · Mouse look · Shift sprint · LMB attack (hold or click to chain a 3-hit combo) · Q heavy strike · RMB block · Space dodge · 1/2/3 graphics quality · Esc pause

Hold the courtyard for 4 waves of the Crimson Host. Wave 5 adds the Black Champion. Each kill heals you a little. Blocking an enemy swing staggers the attacker, so you can hit back.

| File | Contents |
|---|---|
| `src/textures.js` | Procedural PBR maps (albedo/normal/roughness): ashlar stone, mud with glossy puddles, wood, slate, chainmail, brushed metal, bark, banners, sigil reliefs |
| `src/world.js` | Curtain walls with buttresses, corbels and merlons; towers with quoins, machicolations and slate roofs; gatehouse with voussoirs, portcullis and doors; arched bridge with timber ribs and red railings; the Great Keep with a wooden gallery; bronze king statues; heart tree; props; ivy, grass, rubble; distant castle, pines, mountains, sky |
| `src/characters.js` | Jointed plate-armour knights (helms, pauldrons, mail, tabards, cloth capes, swords, shields) and pose library |
| `src/effects.js` | GPU rain and puddle ripples, fire, embers, smoke, ground mist, sparks and blood, sword trails |
| `src/post.js` | HDR MSAA → GTAO → bloom → ACES tone mapping → colour grade (split tone, vignette, grain, chromatic aberration) |
| `src/game.js` | Combat, enemy AI (attack tokens, strafing, shield guard), camera with wall collision, waves |
| `src/audio.js` | Synthesised rain, wind, thunder, swings, steel clashes, war horn |
