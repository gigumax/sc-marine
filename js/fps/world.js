/* ============================================================
   world.js — night arena: terrain, sky, obstacles, spawn gates
   ============================================================ */

const ARENA_R = 620;             // playable radius (m) — 10x field
const World = {
  colliders: [],                 // {x,z,r} — movement blockers
  sight: [],                     // {x,z,r,h} — line-of-sight blockers, h = top edge
  spawners: [],                  // destructible spawn-hives {mesh,pos,hp,dead,...}
  bounds: ARENA_R,
};

/* ---------- procedural textures ---------- */
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#181d26'; g.fillRect(0, 0, 512, 512);
  // rocky blotches
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 2 + Math.random() * 14;
    const v = 18 + Math.random() * 22;
    g.fillStyle = `rgba(${v},${v + 4},${v + 10},${0.25 + Math.random() * 0.3})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // cracks
  g.strokeStyle = 'rgba(8,10,14,.6)'; g.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    let x = Math.random() * 512, y = Math.random() * 512;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - .5) * 40; y += (Math.random() - .5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  // creep veins (purple)
  g.strokeStyle = 'rgba(90,40,130,.35)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * 512, y = Math.random() * 512;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - .5) * 60; y += (Math.random() - .5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#05060f'); grad.addColorStop(0.55, '#0a1220'); grad.addColorStop(1, '#141a26');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 1024);
  // stars
  for (let i = 0; i < 700; i++) {
    const y = Math.random() * 620;
    const s = Math.random();
    g.fillStyle = `rgba(${200 + s * 55},${200 + s * 55},255,${0.3 + s * 0.7})`;
    g.fillRect(Math.random() * 1024, y, s > 0.92 ? 2 : 1, s > 0.92 ? 2 : 1);
  }
  // nebula tint
  const neb = g.createRadialGradient(720, 260, 20, 720, 260, 340);
  neb.addColorStop(0, 'rgba(70,40,120,.28)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = neb; g.fillRect(0, 0, 1024, 1024);
  const neb2 = g.createRadialGradient(240, 380, 10, 240, 380, 300);
  neb2.addColorStop(0, 'rgba(30,90,140,.22)'); neb2.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = neb2; g.fillRect(0, 0, 1024, 1024);
  return new THREE.CanvasTexture(c);
}

/* ---------- world build ---------- */
function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x0a0d14, 0.005);
  scene.background = new THREE.Color(0x05060f);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide })
  );
  scene.add(sky);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_R * 2 + 160, ARENA_R * 2 + 160),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // lighting — dark night + cold moon
  scene.add(new THREE.AmbientLight(0x2a3448, 0.75));
  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.5);
  moon.position.set(60, 90, 40);
  scene.add(moon);
  const hemi = new THREE.HemisphereLight(0x1c2438, 0x0a0c12, 0.5);
  scene.add(hemi);

  // perimeter cliff ring — huge crags spaced around the whole rim
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x232c3c, roughness: 1 });
  for (let i = 0; i < 140; i++) {
    const a = i / 140 * Math.PI * 2;
    const r = ARENA_R + 12 + Math.random() * 14;
    const h = 16 + Math.random() * 26;
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(9 + Math.random() * 11, h, 5),
      cliffMat
    );
    rock.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
    rock.rotation.y = Math.random() * 7;
    scene.add(rock);
  }

  // hive positions — the nest is dug in along the far north edge
  const HIVES = [[-150, -380], [150, -380], [-70, -260], [70, -260]];

  // scattered crates & rocks (cover)
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8, metalness: 0.3 });
  const rockMat  = new THREE.MeshStandardMaterial({ color: 0x1f2733, roughness: 1 });
  const cover = (x, z, s) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 1.6, s * 2), Math.random() < .5 ? crateMat : rockMat);
    box.position.set(x, s * 0.8, z);
    box.rotation.y = Math.random() * 1.5;
    scene.add(box);
    World.colliders.push({ x, z, r: s * 1.45 });
    World.sight.push({ x, z, r: s * 1.45, h: s * 1.6 });   // cover: blocks the swarm's view
  };
  const crates = [
    [64, -48, 1.6], [-80, 32, 1.4], [128, 96, 1.8], [-144, -112, 1.5],
    [32, 176, 1.4], [-48, -192, 1.7], [192, -144, 1.5], [-208, 128, 1.6],
    [240, 48, 1.4], [-256, -48, 1.8], [96, -240, 1.5], [-112, 240, 1.5],
    [272, -224, 1.6], [-288, 208, 1.4], [0, -304, 1.7], [16, 288, 1.5],
  ];
  for (const [x, z, s] of crates) cover(x, z, s);
  // procedural scatter — the big field still needs cover between pads and nests
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * (ARENA_R - 80);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z - 18) < 14) continue;                    // keep the drop pad clear
    if (HIVES.some(h => Math.hypot(x - h[0], z - h[1]) < 14)) continue;
    cover(x, z, 1.3 + Math.random() * 1.4);
  }

  // mineral crystal clusters (StarCraft flavor, glowing)
  const crysMat = new THREE.MeshStandardMaterial({
    color: 0x3fa8e0, emissive: 0x1a6ab0, emissiveIntensity: 0.9,
    roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.95,
  });
  for (const [cx, cz] of [[-160, -272], [304, 160], [-320, 80],
                          [180, -120], [-200, -160], [80, 280], [-60, 340]]) {
    const cluster = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const h = 1.2 + Math.random() * 2.2;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.4 + Math.random() * 0.35, h, 5), crysMat);
      shard.position.set((Math.random() - .5) * 3, h / 2, (Math.random() - .5) * 3);
      shard.rotation.set((Math.random() - .5) * .5, Math.random() * 7, (Math.random() - .5) * .5);
      cluster.add(shard);
    }
    cluster.position.set(cx, 0, cz);
    scene.add(cluster);
    World.colliders.push({ x: cx, z: cz, r: 2.2 });
    World.sight.push({ x: cx, z: cz, r: 1.5, h: 2.4 });    // crystal clusters hide you too
    const gl = new THREE.PointLight(0x3fa8e0, 0.5, 14);
    gl.position.set(cx, 1.5, cz);
    scene.add(gl);
  }

  // blinds — chest-high slabs with firing gaps; duck behind and lings can't see
  // you, but your rifle still reaches over the top or through the gaps
  const blindMat = new THREE.MeshStandardMaterial({ color: 0x37465c, roughness: .75, metalness: .3 });
  for (const [bx, bz, sw, n] of [[-96, -112, 2.2, 2], [96, -112, 2.2, 2],
                                [0, -200, 2.2, 3], [-160, -280, 2.2, 2], [160, -280, 2.2, 2],
                                [-40, -60, 2.2, 2], [40, -60, 2.2, 2], [-80, 40, 2.2, 3], [80, 40, 2.2, 3]]) {
    const gap = 1.0, total = n * sw + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const sx = bx - total / 2 + sw / 2 + i * (sw + gap);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sw, 1.15, 0.55), blindMat);
      wall.position.set(sx, 0.575, bz);
      scene.add(wall);
      World.colliders.push({ x: sx, z: bz, r: sw * 0.55 });
      World.sight.push({ x: sx, z: bz, r: sw * 0.55, h: 1.15 });
    }
  }

  // spawn-hives — the nest is dug in along the far north edge, guarded together
  const eggMat = new THREE.MeshStandardMaterial({
    color: 0x2e6b20, emissive: 0x3aff50, emissiveIntensity: 0.55, roughness: 0.35,
  });
  const eggGeo = new THREE.SphereGeometry(0.4, 9, 7);
  for (const [gx, gz] of HIVES) {
    const gate = new THREE.Group();
    // per-hive materials so damage/death affects only that hive
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x4a1a70, emissive: 0x8a2ae0, emissiveIntensity: 1.1, roughness: 0.4,
    });
    const moundMat = new THREE.MeshStandardMaterial({ color: 0x3a1a50, roughness: 1 });
    const sacMat = new THREE.MeshStandardMaterial({
      color: 0x6a2aa0, emissive: 0x8a2ae0, emissiveIntensity: 0.8, roughness: 0.5,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.5, 8, 24), ringMat);
    ring.position.y = 0.4; ring.rotation.x = Math.PI / 2;
    gate.add(ring);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), moundMat);
    mound.scale.y = 0.4; mound.position.y = 0;
    gate.add(mound);
    // egg sacs bulging from the mound — the weakpoint look
    for (let i = 0; i < 5; i++) {
      const sac = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.3, 8, 6), sacMat);
      sac.position.set((Math.random() - .5) * 3, 0.6 + Math.random() * 0.5, (Math.random() - .5) * 3);
      gate.add(sac);
    }
    // spikes
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.6 + Math.random(), 5), moundMat);
      const a = i / 6 * Math.PI * 2;
      sp.position.set(Math.cos(a) * 2.2, 0.7, Math.sin(a) * 2.2);
      sp.rotation.set((Math.random() - .5) * .6, 0, (Math.random() - .5) * .6);
      gate.add(sp);
    }
    const glow = new THREE.PointLight(0xa040ff, 0.9, 18);
    glow.position.y = 2;
    gate.add(glow);
    // vertical beacon so hives are findable across the arena
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 1.4, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xa040ff, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    beam.position.y = 30;
    gate.add(beam);

    gate.position.set(gx, 0, gz);
    scene.add(gate);

    const spawner = {
      mesh: gate, ring, ringMat, moundMat, sacMat, beam, glow,
      pos: new THREE.Vector3(gx, 0, gz),
      hp: 4000, maxHp: 4000, dead: false, flash: 0,
      eggs: [],                                          // gestating zerglings
    };
    gate.userData.spawner = spawner;
    World.spawners.push(spawner);
    World.colliders.push({ x: gx, z: gz, r: 2.4 });
    World.sight.push({ x: gx, z: gz, r: 2.4, h: 1.4 });    // duck behind the mound

    // green eggs ringing the mound — gestate EGG_T seconds, then a zergling pops out
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + Math.random() * 0.5;
      const r = 3.9 + Math.random() * 0.7;
      const egg = new THREE.Mesh(eggGeo, eggMat);
      egg.scale.set(1, 0.75, 1);
      egg.position.set(gx + Math.cos(a) * r, 0.3, gz + Math.sin(a) * r);
      scene.add(egg);
      spawner.eggs.push({ m: egg, t: Math.random() * EGG_T });
    }
  }

  buildBase(scene);

  return World;
}

/* ---------- drop base — command center on the south pad ---------- */
const _wEase = x => x * x * (3 - 2 * x);

function buildBase(scene) {
  const armor = new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: .6, metalness: .35 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: .95 });
  const wall  = new THREE.MeshStandardMaterial({ color: 0x1a2531, roughness: .8, metalness: .25 });
  const glowC = new THREE.MeshStandardMaterial({ color: 0x06202c, emissive: 0x4ad0ff, emissiveIntensity: 1.4 });
  const glowO = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const BZ = 18;                                   // pad sits south of the drop point

  const B = (w, h, d, m, x, y, z, parent) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); (parent || scene).add(b);
    return b;
  };

  B(4.4, .12, 4.4, joint, 0, .06, BZ);             // landing pad
  B(.12, .02, 4.4, glowC, -2.1, .125, BZ);         // pad edge lights
  B(.12, .02, 4.4, glowC, 2.1, .125, BZ);
  B(4.4, .02, .12, glowC, 0, .125, BZ - 2.1);
  B(4.4, .02, .12, glowC, 0, .125, BZ + 2.1);

  const g = new THREE.Group(); g.position.set(0, .12, BZ); scene.add(g);
  B(2.6, .5, 2.2, wall, 0, .37, 0, g);             // skirt
  B(2.1, 1.1, 1.7, armor, 0, 1.15, 0, g);          // hull
  B(1.5, .6, 1.2, joint, 0, 1.95, 0, g);           // upper deck
  B(.6, .35, .6, armor, 0, 2.35, 0, g);            // crown
  B(.06, 1, .06, joint, .8, 2.4, 0, g);            // antenna
  B(.1, .1, .1, glowC, .8, 2.95, 0, g);            // beacon
  B(1.6, .06, .02, glowC, 0, 1.0, .86, g);         // window strips
  B(1.6, .06, .02, glowC, 0, 1.35, .86, g);
  for (const lx of [-1.05, 1.05]) for (const lz of [-.8, .8])
    B(.2, .4, .2, joint, lx, .2, lz, g);           // landing legs
  const thr = new THREE.Group(); g.add(thr);
  for (const tx of [-.8, 0, .8]) B(.34, .2, .34, glowO, tx, -.16, 0, thr);
  thr.visible = false;

  // warp-out streak — flat flash column where the base stood
  const warp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 9),
    new THREE.MeshBasicMaterial({ color: 0xaee4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  warp.position.set(0, 4.5, BZ); warp.visible = false; scene.add(warp);

  // dust puff pool — soft sprites blasted out from under the pad
  const dc = document.createElement('canvas'); dc.width = dc.height = 64;
  const dg = dc.getContext('2d');
  const grad = dg.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(190,170,140,.65)');
  grad.addColorStop(1, 'rgba(190,170,140,0)');
  dg.fillStyle = grad; dg.fillRect(0, 0, 64, 64);
  const dustTex = new THREE.CanvasTexture(dc);
  const dust = [];
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dustTex, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false; scene.add(sp);
    dust.push({ m: sp, vel: new THREE.Vector3(), t: 0, life: 0 });
  }

  const col = { x: 0, z: BZ, r: 3.1 };
  const sgt = { x: 0, z: BZ, r: 3.1, h: 3.2 };
  World.base = { g, thr, warp, dust, col, sgt, lift: -1, delay: -1, warped: false };
  World.colliders.push(col);
  World.sight.push(sgt);
}

/* base waits on the pad, then lifts a few seconds after every (re)drop */
function resetBaseLift() {
  const b = World.base; if (!b) return;
  b.g.visible = true; b.g.position.y = .12;
  b.thr.visible = false;
  b.warp.visible = false; b.warp.material.opacity = 0;
  b.lift = -1; b.warped = false; b.delay = 2.4;
  for (const p of b.dust) { p.life = 0; p.m.visible = false; }
  if (!World.colliders.includes(b.col)) World.colliders.push(b.col);
  if (!World.sight.includes(b.sgt)) World.sight.push(b.sgt);
}

function updateBase(dt) {
  const b = World.base; if (!b) return;
  if (b.delay > 0) {
    b.delay -= dt;
    if (b.delay <= 0 && b.lift < 0) {
      // liftoff — thrusters flare, dust blasts out, the base climbs
      b.lift = 0; b.thr.visible = true;
      const n = b.dust.length;
      for (let i = 0; i < n; i++) {
        const p = b.dust[i], a = i / n * Math.PI * 2 + Math.random() * .4;
        p.t = 0; p.life = 1.4 + Math.random() * .9;
        p.m.visible = true;
        p.m.position.set(b.g.position.x + Math.cos(a) * 1.7, .15,
                         b.g.position.z + Math.sin(a) * 1.7);
        p.vel.set(Math.cos(a) * (2.5 + Math.random() * 2.5),
                  .8 + Math.random() * 1.6,
                  Math.sin(a) * (2.5 + Math.random() * 2.5));
        p.m.material.opacity = .5;
      }
      Audio2.noise(1.4, .3, 180, .7);
      Audio2.tone(48, 1.1, 'sawtooth', .22, 30);
      Audio2.say && Audio2.say('Command center dusting off.', { rate: .95 });
    }
  }
  if (b.lift >= 0) {
    b.lift += dt;
    const t = b.lift;
    if (t < 2.8) {
      b.g.position.y = .12 + _wEase(t / 2.8) * 12;
      b.thr.children.forEach((c, i) => c.scale.y = 1 + Math.sin(t * 30 + i * 2) * .3);
    } else if (!b.warped) {
      // warp-out — flash column, base is gone, pad is walkable again
      b.warped = true; b.g.visible = false; b.warp.visible = true;
      const i1 = World.colliders.indexOf(b.col); if (i1 >= 0) World.colliders.splice(i1, 1);
      const i2 = World.sight.indexOf(b.sgt); if (i2 >= 0) World.sight.splice(i2, 1);
      Audio2.noise(.3, .3, 2400, .6);
      Audio2.tone(1500, .35, 'sawtooth', .14, 140);
    }
    if (b.warped) {
      const k = Math.min(1.4, t - 2.8);
      b.warp.material.opacity = Math.max(0, .95 - k * 1.1);
      b.warp.scale.x = .3 + k * 5;
      if (k >= 1.4) { b.warp.visible = false; b.lift = -1; }
    }
  }
  // dust always decays — runs regardless of phase
  for (const p of b.dust) {
    if (p.life <= 0) continue;
    p.t += dt;
    if (p.t >= p.life) { p.life = 0; p.m.visible = false; continue; }
    p.m.position.addScaledVector(p.vel, dt);
    p.vel.multiplyScalar(1 - dt * 1.2);
    const k = p.t / p.life;
    p.m.scale.setScalar(.9 + k * 3.6);
    p.m.material.opacity = .5 * (1 - k);
  }
}

/* ---------- circle collision vs world ---------- */
function worldCollide(x, z, r) {
  // arena bounds
  const d = Math.hypot(x, z);
  if (d > ARENA_R - r) {
    const k = (ARENA_R - r) / d;
    x *= k; z *= k;
  }
  for (const c of World.colliders) {
    const dx = x - c.x, dz = z - c.z;
    const dd = Math.hypot(dx, dz), min = c.r + r;
    if (dd > 0 && dd < min) { x = c.x + dx / dd * min; z = c.z + dz / dd * min; }
  }
  return { x, z };
}
