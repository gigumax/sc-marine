/* ============================================================
   enemies.js — zergling meshes, chase/lunge AI, wave manager
   ============================================================ */

const Enemies = {
  list: [],
  scene: null,
  kills: 0,
  gibs: [],
  pickups: [],
};

/* ---------- zerg senses ---------- */
const Z_SIGHT = 34, Z_SMELL = 6;             // how far they see / always sense

/* eye-line vs world cover — a blocker hides you only if it's taller than the
   sightline where they cross, so you can shoot over chest-high blinds */
function zLos(ex, ez, eh, tx, tz, th) {
  const dx = tx - ex, dz = tz - ez;
  const len2 = dx * dx + dz * dz || 1e-6;
  for (const b of World.sight) {
    let t = ((b.x - ex) * dx + (b.z - ez) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ex + dx * t - b.x, pz = ez + dz * t - b.z;
    if (px * px + pz * pz < b.r * b.r && eh + (th - eh) * t < b.h) return false;
  }
  return true;
}

/* can this zerg spot something at (tx,ty,tz)? */
function zCanSee(e, tx, ty, tz) {
  const m = e.mesh.position;
  const d = Math.hypot(tx - m.x, tz - m.z);
  return d < Z_SMELL ||
    (d < Z_SIGHT && zLos(m.x, m.z, e.ultra ? 2.4 : e.hunter ? 1.0 : 0.85, tx, tz, ty));
}

/* gunfire gives you away — nearby zerg stalk the shot origin for a few sec */
function noiseAt(x, z, r) {
  for (const e of Enemies.list) {
    if (e.dead) continue;
    if (Math.hypot(e.mesh.position.x - x, e.mesh.position.z - z) < r) {
      (e.alertPos = e.alertPos || new THREE.Vector3()).set(x, 0, z);
      e.alertT = 5;
    }
  }
}

/* ---------- zergling model (primitives) ---------- */
// veined membrane wing drawn once on a canvas — translucent insect look
let _wingTex = null;
function wingTexture() {
  if (_wingTex) return _wingTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  // membrane fan: root at left edge, scalloped trailing edge right
  g.beginPath();
  g.moveTo(8, 80);
  g.quadraticCurveTo(70, 4, 252, 10);       // leading edge
  g.quadraticCurveTo(216, 52, 250, 68);     // scallop
  g.quadraticCurveTo(202, 88, 242, 110);
  g.quadraticCurveTo(182, 118, 212, 148);
  g.quadraticCurveTo(120, 152, 8, 80);      // trailing edge
  g.closePath();
  const mg = g.createLinearGradient(0, 0, 256, 0);
  mg.addColorStop(0, 'rgba(148,104,158,.95)');
  mg.addColorStop(1, 'rgba(214,196,204,.5)');
  g.fillStyle = mg; g.fill();
  // veins radiating from the wing root
  g.strokeStyle = 'rgba(88,42,108,.85)'; g.lineWidth = 3;
  for (const [tx, ty] of [[250, 12], [246, 66], [238, 108], [208, 146], [120, 150]]) {
    g.beginPath(); g.moveTo(8, 80);
    g.quadraticCurveTo(120, (80 + ty) / 2, tx, ty); g.stroke();
  }
  // thick leading-edge spar
  g.strokeStyle = 'rgba(66,32,86,.9)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(8, 80); g.quadraticCurveTo(70, 4, 252, 10); g.stroke();
  _wingTex = new THREE.CanvasTexture(c);
  return _wingTex;
}

// shared geometries/materials — one upload reused by every zergling
const _zgeo = {}, _zmats = {};
function zg(key, make) { return _zgeo[key] || (_zgeo[key] = make()); }
function zergMats(hunter) {
  const k = hunter ? 'h' : 'z';
  if (!_zmats[k]) _zmats[k] = {
    body: new THREE.MeshStandardMaterial({
      color: hunter ? 0x7c1620 : 0x6e2f52, roughness: 0.8,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: hunter ? 0x2e0a10 : 0x33122a, roughness: 1,
    }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd9c9a4, roughness: 0.55 }),
    eye:  new THREE.MeshBasicMaterial({ color: 0xffcc33 }),
    wing: new THREE.MeshBasicMaterial({
      map: wingTexture(), transparent: true, opacity: 0.95, alphaTest: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
      color: hunter ? 0xffb0a0 : 0xffffff,
    }),
  };
  return _zmats[k];
}

// curved scythe-horn: tapering cone chain arcing up then forward (y-z plane)
function buildHorn(len, baseR, span, mat) {
  const g = new THREE.Group();
  const R = len / span, N = 6;
  for (let i = 0; i < N; i++) {
    const phi = (i + 0.5) / N * span;
    const r = Math.max(baseR * (1 - i / (N - 1) * 0.82), 0.02);
    const seg = new THREE.Mesh(
      zg('horn' + i, () => new THREE.ConeGeometry(r, len / N * 1.45, 5)), mat);
    seg.position.set(0, R * Math.sin(phi), R * (1 - Math.cos(phi)));
    seg.rotation.x = phi;
    g.add(seg);
  }
  return g;
}

function buildZerglingMesh(scale, hunter) {
  const g = new THREE.Group();
  const M = zergMats(hunter);

  // hunched torso — nose-down posture
  const body = new THREE.Mesh(
    zg('body', () => new THREE.SphereGeometry(0.5, 10, 8)), M.body);
  body.scale.set(0.9, 0.75, 1.3);
  body.position.set(0, 0.6, 0.05);
  body.rotation.x = 0.18;
  body.userData.part = 'body';
  g.add(body);

  // rear abdomen bulk
  const abd = new THREE.Mesh(
    zg('abd', () => new THREE.SphereGeometry(0.44, 9, 7)), M.body);
  abd.scale.set(0.85, 0.75, 1.0);
  abd.position.set(0, 0.72, -0.55);
  abd.userData.part = 'body';
  g.add(abd);

  // low forward head
  const head = new THREE.Mesh(
    zg('head', () => new THREE.SphereGeometry(0.27, 8, 7)), M.body);
  head.scale.set(0.95, 0.9, 1.15);
  head.position.set(0, 0.55, 0.66);
  head.userData.part = 'head';
  g.add(head);

  // skull crest sweeping back
  const crest = new THREE.Mesh(
    zg('crest', () => new THREE.ConeGeometry(0.1, 0.5, 5)), M.dark);
  crest.rotation.x = -Math.PI / 2 + 0.5;
  crest.position.set(0, 0.72, 0.5);
  g.add(crest);

  // wide jaw + bone fangs
  const jaw = new THREE.Mesh(
    zg('jaw', () => new THREE.ConeGeometry(0.18, 0.45, 5)), M.dark);
  jaw.rotation.x = Math.PI / 2 + 0.55;
  jaw.position.set(0, 0.44, 0.88);
  jaw.userData.part = 'head';
  g.add(jaw);
  for (const s of [-1, 1]) {
    const fang = new THREE.Mesh(
      zg('fang', () => new THREE.ConeGeometry(0.028, 0.16, 4)), M.bone);
    fang.rotation.x = Math.PI * 0.85;
    fang.position.set(s * 0.09, 0.5, 0.86);
    fang.userData.part = 'head';
    g.add(fang);
    const fang2 = new THREE.Mesh(
      zg('fang', () => new THREE.ConeGeometry(0.028, 0.16, 4)), M.bone);
    fang2.rotation.x = Math.PI * 0.85;
    fang2.position.set(s * 0.15, 0.46, 0.74);
    fang2.userData.part = 'head';
    g.add(fang2);
  }

  // twin eye pairs
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(
      zg('eye', () => new THREE.SphereGeometry(0.045, 6, 5)), M.eye);
    eye.position.set(s * 0.12, 0.62, 0.88);
    g.add(eye);
    const eye2 = new THREE.Mesh(
      zg('eye2', () => new THREE.SphereGeometry(0.028, 5, 4)), M.eye);
    eye2.position.set(s * 0.19, 0.57, 0.78);
    g.add(eye2);
  }

  // spine spikes down the back
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(
      zg('spike', () => new THREE.ConeGeometry(0.06, 0.28, 5)), M.dark);
    sp.scale.setScalar(1 - i * 0.09);
    sp.position.set(0, 0.88 - i * 0.03, 0.28 - i * 0.22);
    sp.rotation.x = -0.35 - i * 0.14;
    g.add(sp);
  }

  // the iconic shoulder scythes — bone arcs over the head
  for (const s of [-1, 1]) {
    const horn = buildHorn(1.95, 0.1, 2.45, M.bone);
    horn.position.set(s * 0.28, 0.72, -0.15);
    horn.rotation.z = -s * 0.35;               // splay outward
    g.add(horn);
  }

  // veined wings sweeping back over the abdomen
  const wings = [];
  for (const s of [-1, 1]) {
    const wg = new THREE.Group();
    const w = new THREE.Mesh(
      zg('wing', () => new THREE.PlaneGeometry(1.55, 0.95)), M.wing);
    w.scale.x = s;                              // mirror texture for left wing
    wg.add(w);
    wg.position.set(s * 0.14, 0.88, -0.3);
    wg.rotation.y = s * 0.95;                   // sweep backward/outward
    wg.rotation.z = -s * 0.55;                  // dihedral: tips up
    wg.userData.base = -s * 0.55;
    g.add(wg);
    wings.push(wg);
  }

  // legs — 4 animated, bone claws at the tips
  const legs = [];
  for (const s of [-1, 1]) for (const f of [0.3, -0.35]) {
    const leg = new THREE.Mesh(
      zg('leg', () => {
        const b = new THREE.BoxGeometry(0.09, 0.55, 0.09);
        b.translate(0, -0.275, 0);               // pivot at hip
        return b;
      }), M.dark);
    leg.position.set(s * 0.42, 0.56, f);
    const claw = new THREE.Mesh(
      zg('claw', () => {
        const c = new THREE.ConeGeometry(0.03, 0.14, 4);
        c.rotateX(Math.PI);                      // point down
        return c;
      }), M.bone);
    claw.position.set(0, -0.5, 0.04);
    leg.add(claw);
    g.add(leg);
    legs.push(leg);
  }

  // small forearm talons tucked under the scythes
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(
      zg('arm', () => new THREE.BoxGeometry(0.06, 0.3, 0.06)), M.dark);
    arm.position.set(s * 0.24, 0.52, 0.5);
    arm.rotation.x = -0.6;
    const talon = new THREE.Mesh(
      zg('talon', () => {
        const c = new THREE.ConeGeometry(0.025, 0.18, 4);
        c.rotateX(Math.PI);
        return c;
      }), M.bone);
    talon.position.set(0, -0.2, 0.1);
    arm.add(talon);
    g.add(arm);
  }

  // tapering tail
  const tail = new THREE.Mesh(
    zg('tail', () => new THREE.ConeGeometry(0.1, 0.8, 5)), M.dark);
  tail.rotation.x = -Math.PI / 2 - 0.35;
  tail.position.set(0, 0.6, -1.05);
  g.add(tail);

  g.scale.setScalar(scale);
  g.userData.legs = legs;
  g.userData.wings = wings;
  return g;
}

/* ---------- ultralisk — half a hive tall, kaiser blades, brutal melee ---------- */
function ultraMats() {
  if (!_zmats.u) _zmats.u = {
    flesh: new THREE.MeshStandardMaterial({ color: 0x63304a, roughness: 0.75 }),
    dark:  new THREE.MeshStandardMaterial({ color: 0x3a1c30, roughness: 0.85 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x8a5433, roughness: 0.7 }),
    bone:  new THREE.MeshStandardMaterial({ color: 0xc9a97e, roughness: 0.55 }),
    eye:   new THREE.MeshBasicMaterial({ color: 0xffc23a }),
  };
  return _zmats.u;
}

function buildUltraliskMesh() {
  const g = new THREE.Group();
  const M = ultraMats();

  // massive barrel torso + hunched shoulder hump
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 9), M.flesh);
  body.scale.set(1.35, 1.0, 1.65); body.position.y = 2.1;
  g.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), M.flesh);
  hump.scale.set(1.55, 0.85, 1.05); hump.position.set(0, 3.05, 0.45);
  g.add(hump);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), M.dark);
  belly.scale.set(1.05, 0.72, 1.35); belly.position.set(0, 1.15, 0.1);
  g.add(belly);

  // armored back — layered chitin plates marching down the spine
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.1 - i * 0.28, 0.28, 1.05), M.plate);
    p.position.set(0, 3.55 - i * 0.32, 0.35 - i * 0.75);
    p.rotation.x = 0.12 + i * 0.10;
    g.add(p);
    for (const s of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.95 - i * 0.1, 5), M.plate);
      sp.position.set(s * (0.85 - i * 0.1), 3.75 - i * 0.3, 0.3 - i * 0.75);
      sp.rotation.z = -s * 0.3; sp.rotation.x = -0.25 - i * 0.1;
      g.add(sp);
    }
  }

  // low slab head — wide jaw, tusks, orange eyes
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), M.flesh);
  head.scale.set(1.05, 0.85, 1.35); head.position.set(0, 1.75, 2.75);
  g.add(head);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 5), M.dark);
  jaw.rotation.x = Math.PI / 2 + 0.45; jaw.position.set(0, 1.35, 3.2);
  g.add(jaw);
  for (const s of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.85, 5), M.bone);
    tusk.rotation.x = Math.PI - 0.7; tusk.rotation.z = -s * 0.2;
    tusk.position.set(s * 0.3, 1.45, 3.25);
    g.add(tusk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), M.eye);
    eye.position.set(s * 0.32, 2.05, 3.2); g.add(eye);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), M.eye);
    eye2.position.set(s * 0.46, 1.92, 3.0); g.add(eye2);
  }

  // the kaiser blades — two huge scythes sweeping forward off the shoulders,
  // plus a shorter second pair
  for (const s of [-1, 1]) {
    const b1 = buildHorn(3.8, 0.34, 1.75, M.bone);
    b1.position.set(s * 1.5, 2.55, 1.4);
    b1.rotation.z = -s * 0.55;
    g.add(b1);
    const b2 = buildHorn(2.6, 0.26, 1.9, M.bone);
    b2.position.set(s * 1.7, 2.9, -0.55);
    b2.rotation.z = -s * 0.85;
    b2.rotation.x = -0.3;
    g.add(b2);
  }

  // four pillar legs — diagonal gait (order: LF RB RF LB)
  const legs = [];
  for (const [s, f] of [[-1, 1.35], [1, -1.25], [1, 1.35], [-1, -1.25]]) {
    const leg = new THREE.Group();
    leg.position.set(s * 1.25, 1.55, f);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 7), M.dark);
    col.position.y = -0.65; leg.add(col);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 5), M.bone);
    claw.rotation.x = Math.PI; claw.position.set(0, -1.55, 0.05);
    leg.add(claw);
    g.add(leg); legs.push(leg);
  }

  // thick tail dragging behind
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 6), M.flesh);
  tail.rotation.x = -Math.PI / 2 - 0.5;
  tail.position.set(0, 1.5, -3.0);
  g.add(tail);

  g.userData.legs = legs;
  return g;
}

/* ---------- enemy ---------- */
function spawnEnemy(type, pos) {
  const hunter = type === 'hunter', ultra = type === 'ultralisk';
  const mesh = ultra ? buildUltraliskMesh() : buildZerglingMesh(hunter ? 1.5 : 1, hunter);
  mesh.position.copy(pos);
  const e = {
    mesh, hunter, ultra,
    hp: ultra ? 1000 : hunter ? 240 : 68,
    speed: (ultra ? 4.2 : hunter ? 4.2 : 11.2) * (0.9 + Math.random() * 0.25),
    radius: ultra ? 1.9 : hunter ? 1.05 : 0.7,
    attackCd: 0,
    lungeT: 0,
    lungeFrom: null, lungeTo: null,
    dead: false, deathT: 0,
    weave: Math.random() * 10,
    animT: Math.random() * 7,
    screechT: 2 + Math.random() * 6,
    home: pos.clone(),             // where the hive dumped it — drift back here
    // fresh hatch knows where the drop was — it hunts the marines, not the nest
    alertPos: Player.pos.clone(), alertT: 600,
    wanderT: Math.random() * 2, wanderPos: null,
  };
  mesh.userData.enemy = e;
  Enemies.scene.add(mesh);
  Enemies.list.push(e);
  if (Net.on) {
    e.netId = Net.nextEid++;
    Net.eById[e.netId] = e;
  }
  Audio2.spawn(pos.distanceTo(Player.pos));
  return e;
}

/* building a mesh costs ~30 object allocations — bursting 20+ in one frame
   hitches the main thread for seconds. Queue and drip out a few per frame. */
const spawnQueue = [];
function queueSpawn(type, pos) {
  spawnQueue.push({
    type,
    x: pos.x + (Math.random() - .5) * 2.4,
    z: pos.z + (Math.random() - .5) * 2.4,
  });
}
function drainSpawns() {
  for (let i = 0; i < 3 && spawnQueue.length; i++) {
    const q = spawnQueue.shift();
    spawnEnemy(q.type, _v2.set(q.x, 0, q.z));
  }
}

/* egg splits open — little slime burst */
const _slimeMat = new THREE.MeshBasicMaterial({ color: 0x4aff6a });
function eggPop(p, big) {
  for (let i = 0; i < (big ? 12 : 6); i++) {
    const m = new THREE.Mesh(_gibGeo, _slimeMat);
    m.position.copy(p); m.position.y = 0.35;
    Enemies.scene.add(m);
    Enemies.gibs.push({
      m, ttl: big ? 1.1 : 0.7, t: 0,
      vx: (Math.random() - .5) * (big ? 9 : 5),
      vy: 1.5 + Math.random() * (big ? 6 : 3),
      vz: (Math.random() - .5) * (big ? 9 : 5),
      rs: (Math.random() - .5) * 10,
    });
  }
}

const EGG_T = 5, ULTRA_EGG_T = 20;  // ling eggs pop fast; the brood egg takes longer

/* ---------- spawner damage ---------- */
const HIVE_RANGE = 26;                        // hives are armored past this range
function damageSpawner(s, dmg, from) {
  if (s.dead) return false;
  const f = from || Player.pos;
  if (Math.hypot(s.pos.x - f.x, s.pos.z - f.z) > HIVE_RANGE) return false;
  noiseAt(s.pos.x, s.pos.z, 24);                       // defenders hear their hive hit
  s.hp -= dmg;
  s.flash = 1;
  Audio2.hit();
  UI.hitmarker(false);
  bloodBurst(s.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 5);
  if (s.hp <= 0) {
    s.dead = true;
    Audio2.kill(s.pos.distanceTo(Player.pos));
    Audio2.wave();
    // hive collapse: dim everything, tilt, sink, kill beacon
    s.ringMat.emissiveIntensity = 0.05;
    s.ringMat.color.setHex(0x1a1220);
    s.moundMat.color.setHex(0x241a2e);
    s.sacMat.emissiveIntensity = 0;
    s.sacMat.color.setHex(0x2a2030);
    s.glow.intensity = 0;
    s.beam.visible = false;
    s.mesh.rotation.z = 0.18;
    s.mesh.position.y = -0.4;
    for (const eg of s.eggs) eg.m.visible = false;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(_gibGeo, new THREE.MeshBasicMaterial({ color: 0x8a3ae0 }));
      m.position.copy(s.pos); m.position.y = 0.8;
      Enemies.scene.add(m);
      Enemies.gibs.push({
        m, ttl: 1.2, t: 0,
        vx: (Math.random() - .5) * 9, vy: 2 + Math.random() * 6, vz: (Math.random() - .5) * 9,
        rs: (Math.random() - .5) * 14,
      });
    }
    const left = World.spawners.filter(x => !x.dead).length;
    UI.waveBanner(left ? `SPAWN-HIVE DESTROYED — ${left} LEFT` : 'ALL HIVES DOWN — CLEAR THE SWARM');
    for (const s of World.spawners)
      if (!s.dead)
        for (let i = 0; i < 8; i++)
          queueSpawn(i < 2 ? 'hunter' : 'zergling', s.pos);
    if (Net.on) {
      Net.send('hiveDown', { id: s.netId });
    }
  }
  return true;
}

/* queued lings crawl out a few per frame — visuals identical, zero hitch */
function updateSpawners(dt) {
  for (const s of World.spawners) {
    if (s.dead) continue;
    s.flash = Math.max(0, s.flash - dt * 4);
    s.ringMat.emissiveIntensity = 0.9 + Math.sin(Game.time * 3 + s.pos.x) * 0.25 + s.flash * 1.6;
    s.sacMat.emissiveIntensity = 0.6 + Math.sin(Game.time * 2.2 + s.pos.z) * 0.25 + s.flash * 1.2;
    s.ring.rotation.z += dt * 0.6;

    // eggs gestate, swell, then crack open — ling eggs fast, the brood egg slow
    for (const eg of s.eggs) {
      eg.t += dt;
      const T = eg.ultra ? ULTRA_EGG_T : EGG_T;
      const k = Math.min(1, eg.t / T);
      const wob = k > 0.7 ? Math.sin(Game.time * 9 + eg.m.position.x) * 0.05 : 0;  // shakes near hatch
      const b = (0.45 + 0.55 * k) * (eg.ultra ? 2.1 : 1);   // brood egg is huge
      eg.m.scale.set(b + wob, b * 0.75, b - wob);
    }
    // the ling clutch bursts as ONE pack of 20 out of all six eggs at once
    const le = s.eggs.filter(e => !e.ultra);
    const ue = s.eggs.find(e => e.ultra);
    const burst = le.length && le[0].t >= EGG_T;
    const uHatch = ue && ue.t >= ULTRA_EGG_T;
    if (burst) for (const eg of le) eg.t = 0;
    if (uHatch) ue.t = 0;
    if (Net.on && !Net.isHost) continue;            // host owns hatching
    if (burst) {
      for (const eg of le) eggPop(eg.m.position);
      const nLive = Enemies.list.reduce((n, x) => n + (!x.gone && !x.dead && !x.sd ? 1 : 0), 0)
                  + spawnQueue.length;
      for (let i = 0; i < 20 && nLive + i < 72; i++)
        queueSpawn('zergling', le[i % le.length].m.position);
    }
    // the brood egg keeps its own slow cycle — one ultralisk at a time
    if (uHatch) {
      const nU = Enemies.list.reduce((n, x) => n + (x.ultra && !x.dead ? 1 : 0), 0);
      if (nU < 3) {
        spawnEnemy('ultralisk', ue.m.position.clone());
        eggPop(ue.m.position, true);
      }
    }
  }
  drainSpawns();                                   // pop a few queued lings each frame
}

// hive-collapse visuals shared by host damage + client snapshots
function hiveDownFX(s) {
  if (s.dead) return;
  s.dead = true;
  s.ringMat.emissiveIntensity = 0.05;
  s.ringMat.color.setHex(0x1a1220);
  s.moundMat.color.setHex(0x241a2e);
  if (s.boneMat) s.boneMat.color.setHex(0x3a3430);
  s.sacMat.emissiveIntensity = 0;
  s.sacMat.color.setHex(0x2a2030);
  s.glow.intensity = 0;
  s.beam.visible = false;
  s.mesh.rotation.z = 0.18;
  s.mesh.position.y = -0.4;
  for (const eg of s.eggs) eg.m.visible = false;
  const left = World.spawners.filter(x => !x.dead).length;
  UI.waveBanner(left ? `SPAWN-HIVE DESTROYED — ${left} LEFT` : 'ALL HIVES DOWN — CLEAR THE SWARM');
}

function damageEnemy(e, dmg, headshot, byPlayer, creditId) {
  if (e.dead) return;
  noiseAt(e.mesh.position.x, e.mesh.position.z, 26);   // the pack hears a kill
  e.hp -= dmg;
  bloodBurst(e.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), headshot ? 10 : 6);
  // up close your visor catches the spray — splat whichever side the bug is on
  if (byPlayer && e.mesh.position.distanceTo(Player.pos) < 8) {
    _v1.copy(e.mesh.position); _v1.y = 1.0;
    _v1.project(Player.cam);
    if (_v1.z < 1) UI.bloodSplat(Math.sign(_v1.x || 0.01) * Math.min(1, 0.35 + Math.abs(_v1.x)));
  }
  if (e.hp <= 0) {
    e.dead = true;
    e.deathT = 0;
    Enemies.kills++;
    if (Net.on)                          // authoritative kill — everyone gets the gib
      Net.send('ekill', { id: e.netId, by: creditId || (byPlayer ? Net.id : null), k: Enemies.kills,
        x: +e.mesh.position.x.toFixed(1), z: +e.mesh.position.z.toFixed(1) });
    if (byPlayer) {                      // kills count toward command
      Player.kills++;
      if (!Game.leader && !Game.online && Player.kills >= PROMOTE_KILLS) promoteToLeader();
    }
    Audio2.kill(e.mesh.position.distanceTo(Player.pos));
    gibBurst(e.mesh.position, e.hunter || e.ultra);
    maybeDrop(e.mesh.position.clone());
    UI.hitmarker(true);
  } else {
    Audio2.hit();
    UI.hitmarker(false);
    // enrage briefly
    e.speed *= 1.04;
  }
}

/* ---------- particles ---------- */
const _gibGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
const _gibMat = new THREE.MeshBasicMaterial({ color: 0xa02010 });
const _bloodGeo = new THREE.SphereGeometry(0.05, 5, 4);
const _bloodMat = new THREE.MeshBasicMaterial({ color: 0xc03018 });

function gibBurst(pos, big) {
  const n = big ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(_gibGeo, _gibMat);
    m.position.copy(pos); m.position.y += 0.5;
    Enemies.gibs.push({
      m, ttl: 0.9 + Math.random() * 0.5, t: 0,
      vx: (Math.random() - .5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - .5) * 6,
      rs: (Math.random() - .5) * 12,
    });
    Enemies.scene.add(m);
  }
}
function bloodBurst(pos, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(_bloodGeo, _bloodMat);
    m.position.copy(pos);
    Enemies.gibs.push({
      m, ttl: 0.4 + Math.random() * 0.3, t: 0,
      vx: (Math.random() - .5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - .5) * 3,
      rs: 0,
    });
    Enemies.scene.add(m);
  }
}
function updateGibs(dt) {
  for (const g of Enemies.gibs) {
    g.t += dt;
    g.vy -= 14 * dt;
    g.m.position.x += g.vx * dt;
    g.m.position.y += g.vy * dt;
    g.m.position.z += g.vz * dt;
    if (g.m.position.y < 0.05) { g.m.position.y = 0.05; g.vy *= -0.3; g.vx *= 0.6; g.vz *= 0.6; }
    g.m.rotation.x += g.rs * dt; g.m.rotation.z += g.rs * dt;
    if (g.t > g.ttl) { Enemies.scene.remove(g.m); g.done = true; }
  }
  Enemies.gibs = Enemies.gibs.filter(g => !g.done);
}

/* ---------- carcasses — zerglings flop, gray out, and can be kicked ---------- */
const _carcassMat  = new THREE.MeshStandardMaterial({ color: 0x6a6f76, roughness: 0.95, metalness: 0.05 });
const _carcassWing = new THREE.MeshBasicMaterial({ color: 0x565b62, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
const _goreGeo = new THREE.CircleGeometry(0.15, 8);
const _goreMat = new THREE.MeshBasicMaterial({ color: 0x8a1008, transparent: true, opacity: 0.8 });
const _chunkGeo = new THREE.BoxGeometry(0.12, 0.1, 0.22);
const _chunkMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.9 });
const _chunkRed = new THREE.MeshStandardMaterial({ color: 0x6a1408, roughness: 0.9 });
const CORPSE_CAP = 40;

function setCarcassGray(m) {
  if (m.userData._grayed) return;
  m.userData._grayed = true;
  m.traverse(o => {
    if (o.isMesh) o.material = (o.material && o.material.transparent) ? _carcassWing : _carcassMat;
  });
}

function bloodSmear(pos) {
  const m = new THREE.Mesh(_goreGeo, _goreMat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * 7;
  m.scale.setScalar(0.7 + Math.random() * 0.9);
  m.position.set(pos.x + (Math.random() - .5) * 0.35, 0.02, pos.z + (Math.random() - .5) * 0.35);
  Enemies.scene.add(m);
  Enemies.gibs.push({ m, ttl: 60, t: 0, vx: 0, vy: 0, vz: 0, rs: 0 });   // rides the gib pool, but still
}

function carcassChunk(m) {
  const c = new THREE.Mesh(_chunkGeo, Math.random() < 0.5 ? _chunkMat : _chunkRed);
  c.position.copy(m.position); c.position.y = 0.25;
  Enemies.scene.add(c);
  Enemies.gibs.push({
    m: c, ttl: 25, t: 0,
    vx: (Math.random() - .5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - .5) * 3,
    rs: (Math.random() - .5) * 16,
  });
}

// who's close enough to boot this body — player, AI marines, remote peers
function carcassKicker(mp) {
  if (!Player.dead && Math.hypot(mp.x - Player.pos.x, mp.z - Player.pos.z) < 1.05) return Player.pos;
  for (const a of Allies.list)
    if (!a.dead && Math.hypot(mp.x - a.pos.x, mp.z - a.pos.z) < 1.05) return a.pos;
  if (Net.on)
    for (const id in Net.peers) {
      const q = Net.peers[id];
      if (!q.dead && Math.hypot(mp.x - q.mesh.position.x, mp.z - q.mesh.position.z) < 1.05)
        return q.mesh.position;
    }
  return null;
}

function kickCarcass(e, m, fromPos) {
  const dx = m.position.x - fromPos.x, dz = m.position.z - fromPos.z;
  const d = Math.hypot(dx, dz) || 0.1;
  e.kickV = e.kickV || new THREE.Vector3();
  e.kickV.set(dx / d * 3.4 + (Math.random() - .5), 0, dz / d * 3.4 + (Math.random() - .5));
  e.bloodT = 0; e.chunkT = 0;
  e.chunks = 2 + (Math.random() * 2 | 0);        // limbs shear off as it slides
  bloodBurst(m.position.clone().setY(0.15), 4);
  Audio2.hit();
}

function updateCarcass(e, m, dt) {
  e.deathT += dt;
  // tip onto the side instead of face-planting, then settle + desaturate
  const flop = Math.min(Math.PI / 2, e.deathT * 5.5);
  m.rotation.x = flop * 0.15;
  m.rotation.z = flop;
  if (flop >= Math.PI / 2 && !e._grayed) {
    e._grayed = true;
    m.position.y = 0.02;
    setCarcassGray(m);
    // field can't become a carpet — cull the oldest bodies past the cap
    const corpses = Enemies.list.filter(x => x.dead);
    if (corpses.length > CORPSE_CAP) {
      Enemies.scene.remove(corpses[0].mesh);
      corpses[0].gone = true;
    }
  }
  // skidding after a kick — smears blood, sheds parts, spins a little
  if (e.kickV) {
    const sp = Math.hypot(e.kickV.x, e.kickV.z);
    if (sp > 0.05) {
      m.position.x += e.kickV.x * dt;
      m.position.z += e.kickV.z * dt;
      m.rotation.y += dt * sp * 2;
      e.kickV.multiplyScalar(Math.max(0, 1 - dt * 4));
      e.bloodT -= dt;
      if (e.bloodT <= 0) { e.bloodT = 0.06; bloodSmear(m.position); }
      e.chunkT -= dt;
      if (e.chunkT <= 0 && e.chunks > 0) { e.chunkT = 0.16; e.chunks--; carcassChunk(m); }
    } else e.kickV.set(0, 0, 0);
  }
  e.kickCd = (e.kickCd || 0) - dt;
  if (e.kickCd <= 0) {
    const from = carcassKicker(m.position);
    if (from) { e.kickCd = 0.5; kickCarcass(e, m, from); }
  }
  // corpse rots away — sink under the field ~4 s in, gone ~5 s in
  if (e.deathT > 4) {
    m.position.y = 0.02 - (e.deathT - 4) * 0.4;
    if (e.deathT > 5.2) { Enemies.scene.remove(m); e.gone = true; }
  }
}

/* ---------- pickups ---------- */
const _ammoGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const _ammoMat = new THREE.MeshStandardMaterial({ color: 0x2266aa, emissive: 0x2a8ae0, emissiveIntensity: 0.9 });
const _hpGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
const _hpMat = new THREE.MeshStandardMaterial({ color: 0x22aa55, emissive: 0x2ae05a, emissiveIntensity: 0.9 });

function maybeDrop(pos) {
  const r = Math.random();
  if (r > 0.16) return;
  const type = r < 0.10 ? 'ammo' : 'health';
  const m = new THREE.Mesh(
    type === 'ammo' ? _ammoGeo : _hpGeo,
    type === 'ammo' ? _ammoMat : _hpMat);
  m.position.set(pos.x, 0.5, pos.z);
  Enemies.scene.add(m);
  const p = { m, type, t: 0 };
  if (Net.on) { p.pkId = Net.nextPk++; Net.pkById[p.pkId] = p; }
  Enemies.pickups.push(p);
}
function updatePickups(dt) {
  for (const p of Enemies.pickups) {
    p.t += dt;
    p.m.rotation.y += dt * 2.4;
    p.m.position.y = 0.5 + Math.sin(p.t * 3) * 0.12;
    const d = Math.hypot(p.m.position.x - Player.pos.x, p.m.position.z - Player.pos.z);
    if (d < 1.6) {
      if (p.type === 'ammo') {                  // mineral shard — 10 toward the gun tune
        Player.minerals += 10;
        if (Player.unit === 'medic') {          // medics still sip capacitor charge too
          Player.energy = Math.min(Player.energyMax, Player.energy + 35);
          UI.toast('+10 MINERALS · +35 ENERGY');
        } else UI.toast('+10 MINERALS');
      }
      else { Player.heal(30); UI.toast('+30 VITALS'); }
      Audio2.pickup();
      if (Net.on) Net.tookPickup(p);
      else { Enemies.scene.remove(p.m); p.done = true; }
    }
    // squad scavenge — an AI marine grabs any pickup he walks over
    if (!p.done) for (const a of Allies.list) {
      if (a.dead) continue;
      if (Math.hypot(p.m.position.x - a.pos.x, p.m.position.z - a.pos.z) < 1.3) {
        if (p.type === 'ammo') a.minerals += 10;
        else a.hp = Math.min(a.maxHp, a.hp + 30);
        Enemies.scene.remove(p.m); p.done = true;
        break;
      }
    }
    if (p.t > 25) { Enemies.scene.remove(p.m); p.done = true; }
  }
  Enemies.pickups = Enemies.pickups.filter(p => !p.done);
}

/* ---------- melee resolution — hit whichever victim is in reach ---------- */
function meleeHit(e, dmg) {
  const px = e.mesh.position.x, pz = e.mesh.position.z;
  let bd = Math.hypot(Player.pos.x - px, Player.pos.z - pz), victim = null, peerId = null;
  for (const a of Allies.list) {
    if (a.dead) continue;
    const d = Math.hypot(a.pos.x - px, a.pos.z - pz);
    if (d < bd) { bd = d; victim = a; peerId = null; }
  }
  if (Net.on)                            // remote marines are victims too
    for (const id in Net.peers) {
      const q = Net.peers[id];
      if (q.dead) continue;
      const d = Math.hypot(q.mesh.position.x - px, q.mesh.position.z - pz);
      if (d < bd) { bd = d; victim = null; peerId = id; }
    }
  if (bd >= (e.ultra ? 3.6 : 1.7)) return;       // kaiser blades reach way past the ling's nip
  if (victim) damageAlly(victim, dmg, e.mesh.position);
  else if (peerId) Net.hurt(peerId, dmg, e.mesh.position);
  else damagePlayer(dmg, e.mesh.position);
}

/* ---------- per-frame enemy update ---------- */
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

function updateEnemies(dt, onPlayerHit) {
  const p = Player.pos;
  for (const e of Enemies.list) {
    const m = e.mesh;

    if (e.dead) {
      updateCarcass(e, m, dt);                          // side flop, gray, kickable
      continue;
    }

    e.attackCd -= dt;
    e.screechT -= dt;
    e.weave += dt * 6;

    // pick nearest victim it can actually see — cover breaks sight
    let tp = null, tAlly = null, dist = Infinity;
    // hunt vector — nearest marine PERIOD, sighted or not; idle zerg sweep toward it
    let hx = p.x, hz = p.z, hd = Player.dead ? Infinity
      : Math.hypot(p.x - m.position.x, p.z - m.position.z);
    const see = (x, y, z) => zCanSee(e, x, y, z);
    if (!Player.dead && see(p.x, 1.3, p.z)) {
      dist = hd;
      tp = p;
    }
    for (const a of Allies.list) {
      if (a.dead) continue;
      const d = Math.hypot(a.pos.x - m.position.x, a.pos.z - m.position.z);
      if (d < hd) { hd = d; hx = a.pos.x; hz = a.pos.z; }
      if (d < dist && see(a.pos.x, 1.3, a.pos.z)) { dist = d; tp = a.pos; tAlly = a; }
    }
    if (Net.on)
      for (const id in Net.peers) {
        const q = Net.peers[id];
        if (q.dead) continue;
        const mp = q.mesh.position;
        const d = Math.hypot(mp.x - m.position.x, mp.z - m.position.z);
        if (d < hd) { hd = d; hx = mp.x; hz = mp.z; }
        if (d < dist && see(mp.x, 1.3, mp.z)) { dist = d; tp = mp; tAlly = null; }
      }
    e.tgtAlly = tAlly;

    // nothing in sight — stalk the last gunshot, else drift around the hive
    const engaged = !!tp;
    if (!engaged) {
      if (e.alertPos) {
        e.alertT -= dt;
        if (e.alertT <= 0 ||
            Math.hypot(e.alertPos.x - m.position.x, e.alertPos.z - m.position.z) < 2)
          e.alertPos = null;
      }
      if (e.alertPos) tp = e.alertPos;
      else {
        e.wanderT -= dt;
        if (e.wanderT <= 0 || !e.wanderPos) {
          e.wanderT = 2.5 + Math.random() * 3;
          (e.wanderPos = e.wanderPos || new THREE.Vector3())
            .set(hx + (Math.random() - .5) * 16, 0,      // picket the marine's area
                 hz + (Math.random() - .5) * 16);
        }
        tp = e.wanderPos;
      }
      dist = Math.hypot(tp.x - m.position.x, tp.z - m.position.z);
    }

    const dx = tp.x - m.position.x, dz = tp.z - m.position.z;

    // face victim
    m.rotation.y = Math.atan2(dx, dz);

    if (e.lungeT > 0) {
      // mid-lunge: arc toward target
      e.lungeT += dt * 3.2;
      const k = Math.min(1, e.lungeT);
      m.position.lerpVectors(e.lungeFrom, e.lungeTo, k);
      m.position.y = Math.sin(k * Math.PI) * (e.ultra ? 0.5 : 1.1);
      if (k >= 1) {
        m.position.y = 0;
        e.lungeT = 0;
        meleeHit(e, e.ultra ? 80 : e.hunter ? 18 : 9);
        e.attackCd = e.ultra ? 1.5 : 0.5;   // the big swing is slow but heavy
      }
      continue;
    }

    if (engaged && dist < (e.ultra ? 4.6 : 2.3) && e.attackCd <= 0) {
      // start lunge
      e.lungeT = 0.001;
      e.lungeFrom = m.position.clone();
      e.lungeTo = tp.clone(); e.lungeTo.y = 0;
      Audio2.screech(dist);
      continue;
    }

    if (e.screechT <= 0 && engaged && dist < 30) {
      e.screechT = 3 + Math.random() * 7;
      Audio2.screech(dist);
    }

    const sd = Math.max(dist, 0.001);
    let mx = dx / sd, mz = dz / sd;
    // combat move at full clip; stalk heard shots; idle drift is slow
    let sp = e.speed * (engaged ? 1 : (tp === e.alertPos ? 1.0 : 0.38));
    if (engaged) {
      // zergling/hunter: sinus weave chase
      const wob = Math.sin(e.weave) * Math.min(1, dist / 12) * 0.7;
      const px = -mz * wob, pz = mx * wob;
      mx += px; mz += pz;
      sp *= dist < 6 ? 1.15 : 1;
    }
    const ml = Math.hypot(mx, mz) || 1;
    let nx = m.position.x + mx / ml * sp * dt;
    let nz = m.position.z + mz / ml * sp * dt;
    const res = worldCollide(nx, nz, e.radius);
    m.position.x = res.x; m.position.z = res.z;

    // separation
    for (const o of Enemies.list) {
      if (o === e || o.dead) continue;
      const ox = m.position.x - o.mesh.position.x, oz = m.position.z - o.mesh.position.z;
      const od = Math.hypot(ox, oz), min = e.radius + o.radius;
      if (od > 0 && od < min) {
        m.position.x += ox / od * (min - od) * 0.4;
        m.position.z += oz / od * (min - od) * 0.4;
      }
    }

    // run animation — legs cycle, body bobs
    const msp = Math.min(1, sp / 5);            // swing amplitude scales with speed
    e.animT += dt * (3 + sp * 1.4);
    const legs = m.userData.legs;
    if (legs)
      for (let i = 0; i < legs.length; i++)
        legs[i].rotation.x = Math.sin(e.animT + i * Math.PI) * 0.9 * msp;
    const wings = m.userData.wings;
    if (wings) {
      const flap = Math.sin(e.animT * 9) * 0.22 * Math.min(1, msp + 0.15);
      for (let i = 0; i < wings.length; i++)
        wings[i].rotation.z = wings[i].userData.base - (i === 0 ? -flap : flap);
    }
    m.position.y = Math.abs(Math.sin(e.animT)) * 0.09;
  }
  Enemies.list = Enemies.list.filter(e => !e.gone);
}

/* ---------- wave manager — endless pressure until hives die ---------- */
const Waves = {
  wave: 0,
  t: 0,
  spawnT: 0,

  alive() { return Enemies.list.filter(e => !e.dead).length; },
  hivesLeft() { return World.spawners.filter(s => !s.dead).length; },

  reset() {
    this.wave = 1;
    this.t = 0;
    this.spawnT = 1.2;
    UI.waveBanner('DESTROY THE 4 SPAWN-HIVES');
    Audio2.wave();
  },

  pickType() {
    const r = Math.random();
    if (this.wave >= 4 && r < 0.30) return 'hunter';
    return 'zergling';
  },

  update(dt) {
    const hives = World.spawners.filter(s => !s.dead);

    // all hives down → victory once the field is clear
    if (!hives.length) {
      if (this.alive() === 0 && Game.running) {
        Game.victory();
        if (Net.on && Net.isHost) Net.send('win', {});
      }
      return;
    }

    // threat level ramps every 24s — each wave hits as a surge from every hive
    this.t += dt;
    if (this.t > 24) {
      this.t = 0;
      this.wave++;
      UI.waveBanner(`WAVE ${this.wave} — THE SWARM SURGES`);
      Audio2.wave();
      let surge = Math.min(9, 3 + this.wave);        // lings per hive per wave
      const nLive = Enemies.list.filter(e => !e.gone && !e.dead && !e.sd).length
                  + spawnQueue.length;
      let q = 0;
      for (const s of hives)
        for (let i = 0; i < surge && nLive + q < 72; i++, q++)
          queueSpawn(this.pickType(), s.pos);
    }

    // ambient pressure comes from the eggs — no free spawns between surges
  },
};
