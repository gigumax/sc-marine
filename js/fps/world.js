/* ============================================================
   world.js — night arena: terrain, sky, obstacles, spawn gates
   ============================================================ */

const ARENA_R = 62;              // playable radius (m)
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
  tex.repeat.set(10, 10);
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
  scene.fog = new THREE.FogExp2(0x0a0d14, 0.030);
  scene.background = new THREE.Color(0x05060f);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide })
  );
  scene.add(sky);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_R * 2 + 40, ARENA_R * 2 + 40),
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

  // perimeter cliff ring
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x232c3c, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2;
    const r = ARENA_R + 8 + Math.random() * 8;
    const h = 8 + Math.random() * 14;
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(5 + Math.random() * 6, h, 5),
      cliffMat
    );
    rock.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r);
    rock.rotation.y = Math.random() * 7;
    scene.add(rock);
  }

  // scattered crates & rocks (cover)
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8, metalness: 0.3 });
  const rockMat  = new THREE.MeshStandardMaterial({ color: 0x1f2733, roughness: 1 });
  const crates = [
    [8, -6, 1.6], [-10, 4, 1.4], [16, 12, 1.8], [-18, -14, 1.5],
    [4, 22, 1.4], [-6, -24, 1.7], [24, -18, 1.5], [-26, 16, 1.6],
    [30, 6, 1.4], [-32, -6, 1.8], [12, -30, 1.5], [-14, 30, 1.5],
    [34, -28, 1.6], [-36, 26, 1.4], [0, -38, 1.7], [2, 36, 1.5],
  ];
  for (const [x, z, s] of crates) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 1.6, s * 2), Math.random() < .5 ? crateMat : rockMat);
    box.position.set(x, s * 0.8, z);
    box.rotation.y = Math.random() * 1.5;
    scene.add(box);
    World.colliders.push({ x, z, r: s * 1.45 });
    World.sight.push({ x, z, r: s * 1.45, h: s * 1.6 });   // cover: blocks the swarm's view
  }

  // mineral crystal clusters (StarCraft flavor, glowing)
  const crysMat = new THREE.MeshStandardMaterial({
    color: 0x3fa8e0, emissive: 0x1a6ab0, emissiveIntensity: 0.9,
    roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.95,
  });
  for (const [cx, cz] of [[-20, -34], [38, 20], [-40, 10]]) {
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
  for (const [bx, bz, sw, n] of [[-12, -14, 2.2, 2], [12, -14, 2.2, 2],
                                [0, -25, 2.2, 3], [-20, -35, 2.2, 2], [20, -35, 2.2, 2]]) {
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

  // spawn-hives — the nest is dug in along the north edge, guarded together
  for (const [gx, gz] of [[-19, -46], [19, -46], [-9, -31], [9, -31]]) {
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
    };
    gate.userData.spawner = spawner;
    World.spawners.push(spawner);
    World.colliders.push({ x: gx, z: gz, r: 2.4 });
    World.sight.push({ x: gx, z: gz, r: 2.4, h: 1.4 });    // duck behind the mound
  }

  return World;
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
