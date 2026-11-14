import * as THREE from 'three';
import { WORLD } from './config.js';
import { rng, makeNoise, clamp, lerp, smooth } from './utils.js';
import { Physics } from './physics.js';
import { mergeGeoms, M } from './models.js';
import { buildDistricts, buildAtmosphere, updateAtmosphere } from './worldplus.js';

export const POIS = [
  { name: 'NEON PLAZA', x: 0, z: 0, r: 54, h: 2.0, paved: 1 },
  { name: 'DOCKYARD', x: 112, z: 62, r: 34, h: 1.2, paved: 1 },
  { name: 'THE REACTOR', x: -104, z: 84, r: 32, h: 3.5, paved: 1 },
  { name: 'CRYSTAL RIDGE', x: -92, z: -92, r: 30, h: 10, paved: 0 },
  { name: 'SUNSET VILLA', x: 96, z: -98, r: 30, h: 5.5, paved: 0 },
  { name: 'NORTH WATCH', x: 4, z: -132, r: 15, h: 4, paved: 0 },
  { name: 'SOUTH WATCH', x: -8, z: 134, r: 15, h: 3, paved: 0 },
  { name: 'WEST WATCH', x: -144, z: -6, r: 14, h: 4, paved: 0 },
  { name: 'EAST WATCH', x: 146, z: -18, r: 14, h: 3, paved: 0 },
  { name: 'SCRAPYARD', x: 48, z: 88, r: 21, h: 2.2, paved: 1 },
  { name: 'THE RUINS', x: -92, z: -38, r: 21, h: 6, paved: 0, dirt: 1 },
  { name: 'BROKEN HIGHWAY', x: 40, z: -92, r: 28, h: 3, paved: 1 },
  { name: 'BUNKER LINE', x: -44, z: 90, r: 19, h: 2.6, paved: 0, dirt: 1 },
  { name: 'RELAY STATION', x: 90, z: -44, r: 17, h: 7, paved: 0, dirt: 1 },
  { name: 'CHECKPOINT', x: 84, z: 6, r: 13, h: 2.2, paved: 1 },
];

// Toxic crater lake.
export const SINK = { x: -36, z: -80, r: 14 };

// Road network: spokes out of the plaza plus an outer ring. Each road runs between two POI centres and
// holds each end's height until it leaves that POI, so the flattened districts stay flat.
const byName = Object.fromEntries(POIS.map((p) => [p.name, p]));
export const ROADS = [
  ['NEON PLAZA', 'DOCKYARD'], ['NEON PLAZA', 'THE REACTOR'], ['NEON PLAZA', 'CRYSTAL RIDGE'], ['NEON PLAZA', 'SUNSET VILLA'],
  ['NEON PLAZA', 'NORTH WATCH'], ['NEON PLAZA', 'SOUTH WATCH'], ['NEON PLAZA', 'WEST WATCH'], ['NEON PLAZA', 'CHECKPOINT'],
  ['CHECKPOINT', 'EAST WATCH'], ['DOCKYARD', 'SCRAPYARD'], ['SCRAPYARD', 'SOUTH WATCH'], ['THE REACTOR', 'BUNKER LINE'],
  ['WEST WATCH', 'THE RUINS'], ['THE RUINS', 'CRYSTAL RIDGE'], ['NORTH WATCH', 'BROKEN HIGHWAY'], ['BROKEN HIGHWAY', 'SUNSET VILLA'],
  ['SUNSET VILLA', 'RELAY STATION'], ['RELAY STATION', 'CHECKPOINT'],
].map(([a, b]) => {
  const A = byName[a], B = byName[b], len = Math.hypot(B.x - A.x, B.z - A.z);
  return { ax: A.x, az: A.z, ah: A.h, bx: B.x, bz: B.z, bh: B.h, len, ra: A.r * 0.85, rb: B.r * 0.85 };
});

const WALLS = [0xf4efff, 0xffe9d6, 0xd9f7ff, 0xffd9ec];
const ACCENTS = [0xff4f8b, 0x29d3c9, 0xffb52e, 0x7c5cff, 0x3fa9ff, 0xff7043];
const NEONS = [0x4ff3ff, 0xff4fd8, 0xffe14a, 0x9dff3c];
const ROOF = 0x2d2a5e;
const TAU = Math.PI * 2;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.R = rng(1337);
    this.noise = makeNoise(99);
    this.uT = { value: 0 };
    this.boxI = [];
    this.glowI = [];
    this.lootSpots = [];
    this.jumpPads = [];
    this.spinners = [];
    this.pulsers = [];
    this.fires = [];
    this.pois = POIS;
    this.roads = ROADS;
    this.sink = SINK;
    this._rh = 0;
    this.storm = { x: 0, z: 0, r: 400 };

    this.genHeight();
    this.phys = new Physics((x, z) => this.height(x, z));
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildStructures();
    this.buildDecor();
    this.flushBoxes();
    this.buildStorm();
    buildAtmosphere(this);
    this.buildMinimap();
  }

  // ------------------------------------------------------------ terrain
  genHeight() {
    const S = WORLD.size, N = (this.N = 211), half = S / 2, cell = (this.cell = S / (N - 1));
    const hm = (this.hm = new Float32Array(N * N)), noise = this.noise;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = -half + i * cell, z = -half + j * cell;
        const n = noise.fbm(x * 0.011 + 5.2, z * 0.011 + 1.7, 4);
        const ridge = 1 - Math.abs(2 * noise.fbm(x * 0.016 + 31.7, z * 0.016 + 8.3, 3) - 1);
        let h = 1.3 + Math.max(0, n - 0.4) * 44 + Math.pow(ridge, 5) * 7 * smooth(0.4, 0.56, n) + (noise.at(x * 0.07, z * 0.07) - 0.5) * 1.3;
        // terraces: hills step up in plateaus with cliff bands between them
        const T = 4, f = h / T, fi = Math.floor(f);
        h = lerp(h, (fi + smooth(0.43, 0.57, f - fi)) * T, 0.9 * smooth(3.5, 7, h));
        // crater lake
        const dc = Math.hypot(x - SINK.x, z - SINK.z);
        if (dc < SINK.r + 9) {
          const bowl = smooth(SINK.r, SINK.r * 0.35, dc);
          h = lerp(h, -1.9, bowl) + Math.exp(-Math.pow((dc - SINK.r - 1) / 3, 2)) * 4 * (1 - bowl);
        }
        for (const p of POIS) {
          const w = 1 - smooth(p.r * 0.8, p.r * 1.3, Math.hypot(x - p.x, z - p.z));
          if (w > 0) h = lerp(h, p.h, w);
        }
        // roads cut through hills and ride embankments across dips
        const rd = this.roadAt(x, z);
        if (rd < 10) h = lerp(h, this._rh, 1 - smooth(3.8, 10, rd));
        const r = Math.hypot(x, z) + (noise.at(x * 0.02 + 9, z * 0.02) - 0.5) * 22;
        h = lerp(h, -5, smooth(WORLD.islandR - 30, WORLD.islandR + 8, r));
        hm[j * N + i] = h;
      }
  }

  // Distance from (x,z) to the nearest road; this._rh receives the road surface height at that point.
  roadAt(x, z) {
    let best = 1e9;
    for (const r of ROADS) {
      const dx = r.bx - r.ax, dz = r.bz - r.az;
      const t = clamp(((x - r.ax) * dx + (z - r.az) * dz) / (r.len * r.len), 0, 1);
      const d = Math.hypot(x - (r.ax + dx * t), z - (r.az + dz * t));
      if (d < best) {
        best = d;
        this._rh = lerp(r.ah, r.bh, clamp((t * r.len - r.ra) / Math.max(1, r.len - r.ra - r.rb), 0, 1));
      }
    }
    return best;
  }

  height(x, z) {
    const N = this.N, half = WORLD.size / 2;
    const fx = clamp((x + half) / this.cell, 0, N - 1.001), fz = clamp((z + half) / this.cell, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, hm = this.hm, k = j * N + i;
    return (hm[k] * (1 - u) + hm[k + 1] * u) * (1 - v) + (hm[k + N] * (1 - u) + hm[k + N + 1] * u) * v;
  }

  inPOI(x, z, k = 1) {
    for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r * k) return p;
    return null;
  }

  steep(x, z, k = 1.6) {
    return Math.abs(this.height(x + 1.2, z) - this.height(x - 1.2, z)) > k || Math.abs(this.height(x, z + 1.2) - this.height(x, z - 1.2)) > k;
  }

  buildTerrain() {
    const N = this.N, cell = this.cell, half = WORLD.size / 2, hm = this.hm, noise = this.noise;
    const cells = (N - 1) * (N - 1);
    const P = new Float32Array(cells * 18), Nn = new Float32Array(cells * 18), C = new Float32Array(cells * 18);
    const col = {
      sand: new THREE.Color(0xffd9a8), g1: new THREE.Color(0x3fd6a4), g2: new THREE.Color(0x1fb5a8), g3: new THREE.Color(0x8ee38f),
      high: new THREE.Color(0xa78bfa), cliff: new THREE.Color(0x6d4fc2), pave: new THREE.Color(0xb3aee6), sea: new THREE.Color(0x2a9fc0),
      road: new THREE.Color(0x4f4a8c), shoulder: new THREE.Color(0x9a94d6), dirt: new THREE.Color(0x8573bd), toxic: new THREE.Color(0x7dff8a),
    };
    const c = new THREE.Color();
    let o = 0;
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      const n = noise.at(mx * 0.045, mz * 0.045), n2 = noise.at(mx * 0.5 + 40, mz * 0.5);
      if (my < WORLD.waterY) c.copy(col.sea);
      else if (my < 0.7) c.copy(col.sand);
      else {
        c.copy(col.g1).lerp(col.g2, smooth(0.35, 0.65, n));
        if (n2 > 0.72) c.lerp(col.g3, 0.6);
        c.lerp(col.sand, 1 - smooth(0.7, 1.5, my));
        c.lerp(col.high, smooth(11, 17, my));
        c.lerp(col.cliff, smooth(0.93, 0.74, ny));
      }
      const poi = this.inPOI(mx, mz, 0.9);
      if (poi && my > 0.3) {
        const k = 1 - smooth(poi.r * 0.7, poi.r * 0.9, Math.hypot(mx - poi.x, mz - poi.z));
        if (poi.paved) c.lerp(col.pave, 0.85 * k);
        else if (poi.dirt) c.lerp(col.dirt, 0.7 * k * (0.6 + n2 * 0.6));
      }
      if (my > 0.2 && !(poi && poi.paved)) {
        const rd = this.roadAt(mx, mz);
        if (rd < 3.4) c.lerp(col.road, 0.94);
        else if (rd < 4.8) c.lerp(col.shoulder, 0.55);
      }
      const dsink = Math.hypot(mx - SINK.x, mz - SINK.z);
      if (dsink < SINK.r + 2) c.lerp(col.toxic, 0.55 * smooth(SINK.r + 2, SINK.r - 4, dsink));
      c.multiplyScalar(0.9 + n2 * 0.2);
      const pts = [ax, ay, az, bx, by, bz, cx, cy, cz];
      for (let k = 0; k < 9; k += 3) {
        P[o] = pts[k]; P[o + 1] = pts[k + 1]; P[o + 2] = pts[k + 2];
        Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz;
        C[o] = c.r; C[o + 1] = c.g; C[o + 2] = c.b;
        o += 3;
      }
    };
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        const x0 = -half + i * cell, x1 = x0 + cell, z0 = -half + j * cell, z1 = z0 + cell;
        const a = hm[j * N + i], b = hm[j * N + i + 1], d = hm[(j + 1) * N + i], e = hm[(j + 1) * N + i + 1];
        tri(x0, a, z0, x0, d, z1, x1, b, z0);
        tri(x1, b, z0, x0, d, z1, x1, e, z1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  // ------------------------------------------------------------ sky, light, water
  buildSky() {
    const el = 0.62, az = 0.9;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    this.fogBase = new THREE.Color(0xf0a6cf);
    this.fogStorm = new THREE.Color(0x8a4ae0);
    this.scene.fog = new THREE.FogExp2(this.fogBase.getHex(), 0.0034);
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: {
        c0: { value: new THREE.Color(0xffd3ac) }, c1: { value: new THREE.Color(0xff8fc7) }, c2: { value: new THREE.Color(0x8f6cf5) },
        c3: { value: new THREE.Color(0x2f2fa8) }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(0xffe2b8) },
        time: this.uT, storm: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 c0,c1,c2,c3,sunDir,sunCol; uniform float time,storm; varying vec3 vDir;
        float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){ vec3 d=normalize(vDir); float h=d.y;
          vec3 col=mix(c0,c1,smoothstep(-0.02,0.12,h)); col=mix(col,c2,smoothstep(0.08,0.36,h)); col=mix(col,c3,smoothstep(0.3,0.85,h));
          float s=max(dot(d,sunDir),0.0);
          col+=sunCol*(smoothstep(0.9982,0.9988,s)*5.0+pow(s,90.0)*0.7+pow(s,8.0)*0.22);
          vec3 q=floor(d*170.0); float st=hash(q);
          col+=vec3(1.0,0.95,0.9)*step(0.9975,st)*smoothstep(0.25,0.7,h)*(0.6+0.4*sin(time*2.0+st*90.0))*1.6;
          float band=sin(d.x*5.0+sin(d.z*4.0+time*0.05)*2.0+time*0.03);
          col+=vec3(0.2,0.9,0.8)*smoothstep(0.75,1.0,band)*smoothstep(0.25,0.5,h)*smoothstep(0.9,0.5,h)*0.12;
          col=mix(col,vec3(0.36,0.16,0.7)*(0.6+h*0.5),storm*0.75);
          gl_FragColor=vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 20), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.skyGroup.add(sky);

    // ringed planet hanging low in the sky
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(120, 40, 24),
      new THREE.ShaderMaterial({
        depthWrite: false, depthTest: false, fog: false,
        uniforms: { sunDir: { value: this.sunDir } },
        vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(mat3(modelMatrix)*normal); vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
          void main(){ float b=sin(vP.y*0.09+sin(vP.x*0.03)*1.5)*0.5+0.5;
            vec3 col=mix(vec3(1.0,0.56,0.78),vec3(0.52,0.4,1.0),b); col=mix(col,vec3(1.0,0.86,0.6),smoothstep(0.8,1.0,sin(vP.y*0.23)));
            float l=clamp(dot(normalize(vN),sunDir)*0.6+0.5,0.0,1.0);
            col=mix(vec3(0.5,0.38,0.95),col*1.15,l*l);
            gl_FragColor=vec4(col,1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      })
    );
    planet.position.set(-520, 330, -760);
    planet.renderOrder = -9;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(160, 235, 72),
      new THREE.MeshBasicMaterial({ color: 0xffb8e0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: false })
    );
    ring.position.copy(planet.position);
    ring.rotation.set(1.25, 0.3, 0);
    ring.renderOrder = -8;
    this.skyGroup.add(planet, ring);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xd9ccff, 0xffa98a, 1.35);
    this.sun = new THREE.DirectionalLight(0xffdcb8, 2.7);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 10;
    sc.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    this.sun.shadow.intensity = 0.72;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  buildWater() {
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { time: this.uT, fogC: { value: this.scene.fog.color }, storm: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float time,storm; uniform vec3 fogC; varying vec3 vW;
        void main(){ float d=length(vW.xz); vec2 uv=vW.xz*0.06;
          vec2 p1=mat2(0.88,0.48,-0.48,0.88)*uv, p2=mat2(0.62,-0.78,0.78,0.62)*uv*1.37;
          float w=sin(p1.x*3.0+time*0.9+sin(p1.y*2.0+time*0.5)*1.6)*0.5+0.5;
          w*=sin(p2.y*4.0-time*0.7+sin(p2.x*1.7-time*0.3)*1.4)*0.5+0.5;
          w*=0.75+0.25*sin(p1.y*0.9+p2.x*0.7+time*0.2);
          vec3 col=mix(vec3(0.16,0.86,0.82),vec3(0.3,0.26,0.82),smoothstep(150.0,300.0,d));
          col+=vec3(1.0,0.85,0.95)*smoothstep(0.6,0.9,w)*0.45*(1.0-smoothstep(200.0,600.0,d)*0.85);
          float shore=smoothstep(196.0,170.0,d)*(0.5+0.5*sin(d*1.4-time*1.6));
          col+=vec3(1.0)*smoothstep(0.75,1.0,shore)*0.35;
          col=mix(col,fogC,smoothstep(260.0,1250.0,d));
          col=mix(col,vec3(0.4,0.2,0.75),storm*0.4);
          gl_FragColor=vec4(col,0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2), this.waterMat);
    water.position.y = WORLD.waterY;
    this.scene.add(water);
  }

  // ------------------------------------------------------------ construction helpers
  box(x0, y0, z0, x1, y1, z1, color, collide = true) {
    this.boxI.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color]);
    if (collide) this.phys.addBox(x0, y0, z0, x1, y1, z1);
  }
  glow(x0, y0, z0, x1, y1, z1, color, k = 2.3) {
    this.glowI.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, k]);
  }
  pickC(arr) {
    return arr[(this.R() * arr.length) | 0];
  }

  // wall along X (fixed z) or Z (fixed x) with door/window openings: {c, w, y0, y1} relative to floor
  wall(alongX, fixed, a0, a1, yb, fl, y1, t, color, ops = []) {
    ops = ops.slice().sort((p, q) => p.c - q.c);
    const put = (s0, s1, ya, yc) => {
      if (s1 - s0 < 0.03 || yc - ya < 0.03) return;
      if (alongX) this.box(s0, ya, fixed - t / 2, s1, yc, fixed + t / 2, color);
      else this.box(fixed - t / 2, ya, s0, fixed + t / 2, yc, s1, color);
    };
    let cur = a0;
    for (const o of ops) {
      const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
      put(cur, o0, yb, y1);
      put(o0, o1, yb, fl + o.y0);
      put(o0, o1, fl + o.y1, y1);
      cur = o1;
    }
    put(cur, a1, yb, y1);
  }

  building(cx, cz, w, d, h, o = {}) {
    const g = this.height(cx, cz), yb = g - 1.2, t = 0.5, top = g + h, Rf = top + 0.4;
    const wallC = o.wall ?? this.pickC(WALLS), accent = o.accent ?? this.pickC(ACCENTS), neon = o.neon ?? this.pickC(NEONS);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const doors = o.doors ?? ['s', 'n'];
    const door = { w: 2.4, y0: 0, y1: 2.9 }, win = { w: 2.0, y0: 1.25, y1: 2.5 };
    const ops = (side, len, mid) => {
      if (doors.includes(side)) return [{ ...door, c: mid }];
      if (side === 'e') return [];
      return len > 9 ? [{ ...win, c: mid - len * 0.24 }, { ...win, c: mid + len * 0.24 }] : [{ ...win, c: mid }];
    };
    this.wall(true, z0 + t / 2, x0, x1, yb, g, top, t, wallC, ops('n', w, cx));
    this.wall(true, z1 - t / 2, x0, x1, yb, g, top, t, wallC, ops('s', w, cx));
    this.wall(false, x0 + t / 2, z0 + t, z1 - t, yb, g, top, t, wallC, ops('w', d, cz));
    this.wall(false, x1 - t / 2, z0 + t, z1 - t, yb, g, top, t, wallC, ops('e', d, cz));
    // colour band + roof slab + parapets
    this.box(x0 - 0.06, top - 1.0, z0 - 0.06, x1 + 0.06, top - 0.45, z1 + 0.06, accent, false);
    this.box(x0 - 0.4, top, z0 - 0.4, x1 + 0.4, Rf, z1 + 0.4, ROOF);
    this.box(x0 - 0.4, Rf, z0 - 0.4, x1 + 0.4, Rf + 0.9, z0 - 0.05, ROOF);
    this.box(x0 - 0.4, Rf, z1 + 0.05, x1 + 0.4, Rf + 0.9, z1 + 0.4, ROOF);
    this.box(x0 - 0.4, Rf, z0 - 0.05, x0 - 0.05, Rf + 0.9, z1 + 0.05, ROOF);
    this.box(x1 + 0.05, Rf, z0 + 1.7, x1 + 0.4, Rf + 0.9, z1 + 0.05, ROOF);
    // exterior stairs up the east side (south -> north)
    const n = Math.ceil((h + 0.4) / 0.42), rise = (h + 0.4) / n, sd = Math.min(0.95, (d - 1.3) / n);
    const zs = z1 + 0.4;
    for (let i = 0; i < n; i++) this.box(x1 + 0.4, yb, zs - (i + 1) * sd, x1 + 2.1, g + (i + 1) * rise, zs - i * sd, i % 2 ? accent : ROOF);
    if (zs - n * sd > z0 - 0.4 + 0.05) this.box(x1 + 0.4, yb, z0 - 0.4, x1 + 2.1, Rf, zs - n * sd, ROOF);
    // neon trim
    this.glow(x0 - 0.46, top + 0.12, z1 + 0.4, x1 + 0.46, top + 0.28, z1 + 0.47, neon);
    this.glow(x0 - 0.46, top + 0.12, z0 - 0.47, x1 + 0.46, top + 0.28, z0 - 0.4, neon);
    this.glow(x0 - 0.47, top + 0.12, z0 - 0.4, x0 - 0.4, top + 0.28, z1 + 0.4, neon);
    for (const s of doors) {
      if (s === 's' || s === 'n') {
        const z = s === 's' ? z1 + 0.02 : z0 - 0.08;
        this.glow(cx - 1.32, g + 2.9, z, cx + 1.32, g + 3.02, z + 0.06, neon);
        this.glow(cx - 1.32, g, z, cx - 1.2, g + 2.9, z + 0.06, neon);
        this.glow(cx + 1.2, g, z, cx + 1.32, g + 2.9, z + 0.06, neon);
      } else {
        const x = s === 'e' ? x1 + 0.02 : x0 - 0.08;
        this.glow(x, g + 2.9, cz - 1.32, x + 0.06, g + 3.02, cz + 1.32, neon);
        this.glow(x, g, cz - 1.32, x + 0.06, g + 2.9, cz - 1.2, neon);
        this.glow(x, g, cz + 1.2, x + 0.06, g + 2.9, cz + 1.32, neon);
      }
    }
    // warm ceiling strip so interiors glow through the doors and windows
    this.glow(cx - Math.min(2.2, w * 0.2), top - 0.1, cz - 0.3, cx + Math.min(2.2, w * 0.2), top - 0.02, cz + 0.3, 0xffd9a0, 2.4);
    // interior cover + loot
    if (this.R() < 0.7) this.crate(x0 + 1.6, z0 + 1.6, 1.2, this.pickC(ACCENTS));
    this.lootSpots.push({ x: cx + 1.2, y: g, z: cz - 0.8 }, { x: cx - 1, y: Rf, z: cz + 1 });
    if (w * d > 150) this.lootSpots.push({ x: cx - w * 0.3, y: g, z: cz + d * 0.25 });
  }

  crate(cx, cz, s, color, tech = false, base) {
    const g = base ?? this.height(cx, cz);
    this.box(cx - s / 2, g - 0.3, cz - s / 2, cx + s / 2, g + s, cz + s / 2, color);
    if (tech) this.glow(cx - s / 2 - 0.03, g + s * 0.44, cz - s / 2 - 0.03, cx + s / 2 + 0.03, g + s * 0.56, cz + s / 2 + 0.03, this.pickC(NEONS));
  }

  container(cx, cz, alongX, color, lvl = 0) {
    const L = 6.6, W = 2.6, H = 2.7, y = this.height(cx, cz) + lvl * H - (lvl ? 0 : 0.3);
    const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
    this.box(cx - hx, y, cz - hz, cx + hx, y + H + (lvl ? 0 : 0.3), cz + hz, color);
    const y1 = y + H + (lvl ? 0 : 0.3);
    if (alongX) this.glow(cx - hx - 0.03, y1 - 0.5, cz - 0.5, cx - hx + 0.03, y1 - 0.38, cz + 0.5, 0xffffff, 1.6);
    else this.glow(cx - 0.5, y1 - 0.5, cz - hz - 0.03, cx + 0.5, y1 - 0.38, cz - hz + 0.03, 0xffffff, 1.6);
  }

  barrier(cx, cz, len, alongX, color = 0x3b3f7a) {
    const g = this.height(cx, cz), hx = alongX ? len / 2 : 0.3, hz = alongX ? 0.3 : len / 2;
    this.box(cx - hx, g - 0.4, cz - hz, cx + hx, g + 1.15, cz + hz, color);
    this.glow(cx - hx * 0.96, g + 1.15, cz - hz * 0.96, cx + hx * 0.96, g + 1.21, cz + hz * 0.96, this.pickC(NEONS), 1.8);
  }

  lamp(x, z, color) {
    const g = this.height(x, z);
    this.box(x - 0.1, g, z - 0.1, x + 0.1, g + 4.6, z + 0.1, 0x2d2a5e, false);
    this.glow(x - 0.28, g + 4.6, z - 0.28, x + 0.28, g + 5.0, z + 0.28, color, 3);
  }

  pad(x, z, power = 17) {
    const y = this.height(x, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.75, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x23204d, roughness: 0.6 }));
    base.position.set(x, y + 0.1, z);
    base.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dff3c).multiplyScalar(2.6), toneMapped: false }));
    ring.position.set(x, y + 0.3, z);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dff3c).multiplyScalar(1.3), toneMapped: false }));
    core.position.set(x, y + 0.27, z);
    this.scene.add(base, ring, core);
    this.jumpPads.push({ x, z, y: y + 0.25, r: 1.55, power, ring });
  }

  watchtower(cx, cz) {
    const g = this.height(cx, cz), H = 6.4, Pt = g + H + 0.4, c1 = 0x3b3f7a, acc = this.pickC(ACCENTS), neon = this.pickC(NEONS);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(cx + sx * 2.3 - 0.3, g - 1, cz + sz * 2.3 - 0.3, cx + sx * 2.3 + 0.3, g + H, cz + sz * 2.3 + 0.3, c1);
    this.box(cx - 3, g + H, cz - 3, cx + 3, Pt, cz + 3, acc);
    this.box(cx - 3, Pt, cz - 3, cx + 3, Pt + 0.9, cz - 2.7, c1);
    this.box(cx - 3, Pt, cz + 2.7, cx + 3, Pt + 0.9, cz + 3, c1);
    this.box(cx - 3, Pt, cz - 2.7, cx - 2.7, Pt + 0.9, cz + 2.7, c1);
    this.box(cx + 2.7, Pt, cz - 1.0, cx + 3, Pt + 0.9, cz + 2.7, c1);
    // canopy
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(cx + sx * 2.8 - 0.1, Pt + 0.9, cz + sz * 2.8 - 0.1, cx + sx * 2.8 + 0.1, Pt + 3, cz + sz * 2.8 + 0.1, c1, false);
    this.box(cx - 3.3, Pt + 3, cz - 3.3, cx + 3.3, Pt + 3.3, cz + 3.3, ROOF);
    this.glow(cx - 3.34, Pt + 3.08, cz - 3.34, cx + 3.34, Pt + 3.2, cz + 3.34, neon);
    this.glow(cx - 0.3, Pt + 3.3, cz - 0.3, cx + 0.3, Pt + 4.4, cz + 0.3, neon, 3);
    // floating slab stairs on the east side
    const n = 16, rise = (H + 0.4) / n, sd = 0.72, zs = cz - 2.7 + n * sd;
    for (let i = 0; i < n; i++) this.box(cx + 3, g + (i + 1) * rise - 0.3, zs - (i + 1) * sd, cx + 4.7, g + (i + 1) * rise, zs - i * sd, i % 2 ? acc : c1);
    this.box(cx + 3, Pt - 0.3, cz - 3, cx + 4.7, Pt, cz - 2.7 + 0.02, c1);
    this.lootSpots.push({ x: cx, y: Pt, z: cz }, { x: cx - 1, y: g, z: cz + 1 });
  }

  // ------------------------------------------------------------ the island
  buildStructures() {
    const R = this.R;
    const P = (i) => POIS[i];

    // --- NEON PLAZA
    {
      const sp = 29;
      const layout = [
        [-sp, -sp, 14, 12, 6.5, ['s', 'w']], [0, -sp - 2, 16, 11, 9, ['s', 'n']], [sp, -sp, 13, 12, 5.5, ['s', 'w']],
        [-sp - 2, 0, 12, 15, 8, ['w', 'n']], [sp + 1, 0, 12, 14, 6.5, ['w', 's']],
        [-sp, sp, 14, 12, 5.5, ['n', 'w']], [0, sp + 2, 16, 11, 7, ['n', 's']], [sp, sp, 13, 12, 9, ['n', 'w']],
      ];
      for (const [x, z, w, d, h, doors] of layout) this.building(x, z, w, d, h, { doors });
      const g = P(0).h;
      // monument
      this.box(-4.5, g - 0.5, -4.5, 4.5, g + 0.4, 4.5, 0x3b3f7a);
      this.box(-3.2, g + 0.4, -3.2, 3.2, g + 0.8, 3.2, 0x4a4f96);
      this.box(-1.3, g + 0.8, -1.3, 1.3, g + 9, 1.3, 0x2d2a5e);
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        this.glow(sx * 1.31 - 0.12, g + 1.2, sz * 1.31 - 0.12, sx * 1.31 + 0.12, g + 8.6, sz * 1.31 + 0.12, 0xff4fd8, 2.6);
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(1.9, 0), new THREE.MeshStandardMaterial({ color: 0xff7ae0, emissive: 0xff3fd0, emissiveIntensity: 2.2, flatShading: true, roughness: 0.25 }));
      cry.scale.y = 1.7;
      cry.position.set(0, g + 13.2, 0);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.09, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4ff3ff).multiplyScalar(2.6), toneMapped: false }));
      r1.position.copy(cry.position);
      const r2 = r1.clone();
      r2.scale.setScalar(1.3);
      this.scene.add(cry, r1, r2);
      this.spinners.push({ m: cry, ax: 'y', sp: 0.6, bob: 0.5, y: cry.position.y }, { m: r1, ax: 'x', sp: 0.9 }, { m: r2, ax: 'z', sp: -0.7 });
      this.beam(0, g + 14, 0, 0xff4fd8, 1.0);
      for (const [x, z] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) this.pad(x, z, 17.5);
      for (const [x, z, l, ax] of [[0, -11, 5, 1], [0, 11, 5, 1], [-11, 0, 5, 0], [11, 0, 5, 0], [-15, -40, 4, 1], [15, 42, 4, 1], [42, -14, 4, 0], [-44, 14, 4, 0]]) this.barrier(x, z, l, !!ax);
      for (let i = 0; i < 16; i++) {
        const a = R() * TAU, r = 9 + R() * 38, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (this.phys.blocked(x, g, z, 2.2, 3)) continue;
        const s = 1.1 + R() * 0.5;
        this.crate(x, z, s, this.pickC(ACCENTS), R() < 0.4);
        if (R() < 0.35) this.crate(x + s * 0.9, z + 0.3, s * 0.8, this.pickC(ACCENTS));
        this.lootSpots.push({ x: x - s, y: g, z: z - s });
      }
      for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, -17], [0, 17], [-45, -45], [45, 45], [45, -45], [-45, 45]]) this.lamp(x, z, this.pickC(NEONS));
    }

    // --- DOCKYARD
    {
      const p = P(1), cols = [0xff4f8b, 0x29d3c9, 0xffb52e, 0x7c5cff, 0x3fa9ff, 0xf4efff];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 3; c++) {
          const x = p.x - 16 + c * 9.5 + (r % 2) * 2, z = p.z - 16 + r * 6.2;
          if (R() < 0.15) continue;
          this.container(x, z, true, this.pickC(cols));
          if (R() < 0.4) this.container(x, z, true, this.pickC(cols), 1);
          if (R() < 0.5) this.lootSpots.push({ x: x, y: p.h, z: z + 3 });
        }
      this.building(p.x + 16, p.z - 6, 12, 18, 6.5, { doors: ['w', 's'] });
      this.container(p.x - 4, p.z + 14, false, this.pickC(cols));
      this.container(p.x + 4, p.z + 15, false, this.pickC(cols));
      // gantry crane
      const g = p.h;
      for (const sx of [-1, 1]) this.box(p.x + sx * 13 - 0.5, g - 1, p.z + 24, p.x + sx * 13 + 0.5, g + 14, p.z + 25, 0xffb52e);
      this.box(p.x - 16, g + 14, p.z + 23.8, p.x + 16, g + 15.2, p.z + 25.2, 0xffb52e);
      this.glow(p.x - 16, g + 13.8, p.z + 24.2, p.x + 16, g + 14, p.z + 24.8, 0xffe14a);
      this.pad(p.x - 20, p.z + 4);
      for (let i = 0; i < 6; i++) this.crate(p.x - 22 + R() * 30, p.z + 8 + R() * 10, 1.2 + R() * 0.4, this.pickC(cols), R() < 0.5);
      this.lamp(p.x - 22, p.z - 20, 0x4ff3ff);
      this.lamp(p.x + 6, p.z + 22, 0xffe14a);
    }

    // --- THE REACTOR
    {
      const p = P(2), g = p.h;
      this.box(p.x - 5, g - 1, p.z - 5, p.x + 5, g + 17, p.z + 5, 0x23204d);
      this.box(p.x - 6.5, g - 1, p.z - 6.5, p.x + 6.5, g + 1.2, p.z + 6.5, 0x3b3f7a);
      this.box(p.x - 5.6, g + 17, p.z - 5.6, p.x + 5.6, g + 17.6, p.z + 5.6, 0x3b3f7a);
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        for (const o of [-2.4, 0, 2.4])
          this.glow(p.x + sx * 5.02 + (sz ? o : 0) - 0.25, g + 1.6, p.z + sz * 5.02 + (sx ? o : 0) - 0.25, p.x + sx * 5.02 + (sz ? o : 0) + 0.25, g + 16.4, p.z + sz * 5.02 + (sx ? o : 0) + 0.25, 0x4ff3ff, 2.4);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.35, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4ff3ff).multiplyScalar(2.4), toneMapped: false }));
      ring.position.set(p.x, g + 20, p.z);
      const ring2 = ring.clone();
      ring2.scale.setScalar(0.7);
      ring2.position.y += 3;
      this.scene.add(ring, ring2);
      this.spinners.push({ m: ring, ax: 'y', sp: 0.5, bob: 0.8, y: ring.position.y }, { m: ring2, ax: 'y', sp: -0.8, bob: -0.6, y: ring2.position.y });
      this.beam(p.x, g + 18, p.z, 0x4ff3ff, 1.6);
      this.building(p.x + 17, p.z + 14, 11, 10, 5, { doors: ['w', 'n'], neon: 0x4ff3ff });
      this.building(p.x - 18, p.z - 12, 10, 12, 5, { doors: ['s', 'n'], neon: 0x4ff3ff });
      // pipes
      this.box(p.x + 5, g + 3, p.z - 0.6, p.x + 21, g + 4.2, p.z + 0.6, 0xff7043);
      this.box(p.x + 20, g - 1, p.z - 0.8, p.x + 21.6, g + 4.2, p.z + 0.8, 0x3b3f7a);
      this.box(p.x - 0.6, g + 3, p.z - 21, p.x + 0.6, g + 4.2, p.z - 5, 0xff7043);
      this.box(p.x - 0.8, g - 1, p.z - 21.6, p.x + 0.8, g + 4.2, p.z - 20, 0x3b3f7a);
      for (const [x, z, l, ax] of [[p.x + 10, p.z - 12, 5, 1], [p.x - 12, p.z + 10, 5, 0], [p.x - 2, p.z + 14, 6, 1], [p.x + 12, p.z - 2, 4, 0]]) this.barrier(x, z, l, !!ax);
      for (let i = 0; i < 7; i++) {
        const a = R() * TAU, r = 10 + R() * 14, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (this.phys.blocked(x, g, z, 2, 3)) continue;
        this.crate(x, z, 1.3, this.pickC(ACCENTS), true);
        this.lootSpots.push({ x: x + 1.4, y: g, z });
      }
      this.pad(p.x - 9, p.z - 9, 20);
    }

    // --- CRYSTAL RIDGE
    {
      const p = P(3);
      this.building(p.x - 8, p.z + 6, 9, 9, 4.5, { doors: ['s', 'w'], wall: 0xd9f7ff, neon: 0xff4fd8 });
      this.building(p.x + 10, p.z - 8, 10, 8, 4.5, { doors: ['n', 's'], wall: 0xffd9ec, neon: 0x4ff3ff });
      this.watchtower(p.x + 8, p.z + 12);
      this.pad(p.x - 2, p.z - 6);
    }

    // --- SUNSET VILLA
    {
      const p = P(4);
      this.building(p.x - 12, p.z - 10, 12, 10, 5, { doors: ['s', 'w'], wall: 0xffe9d6, accent: 0xff7043 });
      this.building(p.x + 10, p.z - 12, 10, 11, 7.5, { doors: ['s', 'w'], wall: 0xf4efff, accent: 0xff4f8b });
      this.building(p.x - 10, p.z + 11, 11, 10, 5, { doors: ['n', 'w'], wall: 0xffd9ec, accent: 0x7c5cff });
      this.building(p.x + 11, p.z + 10, 10, 10, 5.5, { doors: ['n', 'w'], wall: 0xd9f7ff, accent: 0x29d3c9 });
      for (const [x, z, l, ax] of [[p.x, p.z - 2, 6, 1], [p.x - 1, p.z + 3, 5, 0], [p.x + 22, p.z, 5, 0], [p.x - 22, p.z + 1, 5, 0]]) this.barrier(x, z, l, !!ax, 0xf4efff);
      this.pad(p.x + 1, p.z + 20);
      this.lamp(p.x - 2, p.z - 5, 0xffe14a);
      this.lamp(p.x + 3, p.z + 6, 0xff4fd8);
      for (let i = 0; i < 5; i++) this.crate(p.x - 20 + R() * 40, p.z - 1 + R() * 3 - 22 * (i % 2 ? 1 : -1) * 0.1, 1.2, this.pickC(ACCENTS));
    }

    // --- watch outposts
    for (let i = 5; i < 9; i++) {
      const p = P(i);
      this.watchtower(p.x, p.z);
      this.barrier(p.x - 6, p.z + 5, 5, true);
      this.barrier(p.x + 2, p.z - 7, 5, true);
      this.crate(p.x - 5, p.z - 4, 1.4, this.pickC(ACCENTS), true);
      this.crate(p.x - 6.3, p.z - 3.6, 1.0, this.pickC(ACCENTS));
      this.lootSpots.push({ x: p.x - 3.5, y: p.h, z: p.z - 5 });
      if (i % 2) this.pad(p.x - 7, p.z - 8);
    }

    buildDistricts(this);

    // --- supply crates sprinkled across the wilds
    let placed = 0;
    for (let t = 0; t < 500 && placed < 38; t++) {
      const a = R() * TAU, r = Math.sqrt(R()) * 160, x = Math.cos(a) * r, z = Math.sin(a) * r, h = this.height(x, z);
      if (h < 1 || this.inPOI(x, z, 1.05) || this.roadAt(x, z) < 6 || this.steep(x, z) || this.phys.blocked(x, h, z, 2.5, 3)) continue;
      const s = 1.2 + R() * 0.5;
      this.crate(x, z, s, this.pickC(ACCENTS), R() < 0.5, Math.min(h, this.height(x + s / 2, z + s / 2), this.height(x - s / 2, z - s / 2)));
      if (R() < 0.4) this.barrier(x + 2.5, z + 1.5, 3.5, R() < 0.5);
      this.lootSpots.push({ x: x + s, y: this.height(x + s, z + s), z: z + s });
      placed++;
    }
    for (let t = 0; t < 200 && this.lootSpots.length < 190; t++) {
      const a = R() * TAU, r = Math.sqrt(R()) * 160, x = Math.cos(a) * r, z = Math.sin(a) * r, h = this.height(x, z);
      if (h < 1 || this.phys.blocked(x, h, z, 1, 2)) continue;
      this.lootSpots.push({ x, y: h, z });
    }
  }

  beam(x, y, z, color, r) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 260, 12, 1, true).translate(0, 130, 0),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { col: { value: new THREE.Color(color) }, time: this.uT },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 col; uniform float time; varying vec2 vUv;
          void main(){ float a=pow(1.0-vUv.y,1.6)*(0.55+0.25*sin(vUv.y*60.0-time*6.0)); gl_FragColor=vec4(col*a*1.5,1.0); }`,
      })
    );
    m.position.set(x, y, z);
    this.scene.add(m);
  }

  flushBoxes() {
    const d = new THREE.Object3D(), c = new THREE.Color();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
          #endif
          vWP = (modelMatrix * wp4).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 fn = abs(normalize(cross(dFdx(vWP), dFdy(vWP))));
          vec3 pq = vWP / 1.7;
          vec3 gq = abs(fract(pq) - 0.5);
          float fw = max(fwidth(pq.x), max(fwidth(pq.y), fwidth(pq.z)));
          vec3 ln = smoothstep(0.468, 0.5, gq);
          float line = max(max(ln.x * (1.0 - fn.x), ln.y * (1.0 - fn.y)), ln.z * (1.0 - fn.z));
          diffuseColor.rgb *= 1.0 - 0.3 * line * clamp(1.0 - fw * 5.0, 0.0, 1.0);
          diffuseColor.rgb *= mix(0.86, 1.06, fn.y);`);
    };
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.boxI.length);
    this.boxI.forEach((b, i) => {
      d.position.set(b[0], b[1], b[2]);
      d.scale.set(b[3], b[4], b[5]);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      im.setColorAt(i, c.set(b[6]));
    });
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    this.scene.add(im);

    const gm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), this.glowI.length);
    this.glowI.forEach((b, i) => {
      d.position.set(b[0], b[1], b[2]);
      d.scale.set(b[3], b[4], b[5]);
      d.updateMatrix();
      gm.setMatrixAt(i, d.matrix);
      gm.setColorAt(i, c.set(b[6]).multiplyScalar(b[7]));
    });
    gm.frustumCulled = false;
    this.scene.add(gm);
    this.boxMesh = im;
  }

  // ------------------------------------------------------------ nature + scenery
  buildDecor() {
    const R = this.R, scene = this.scene, d = new THREE.Object3D(), c = new THREE.Color();
    const inst = (geo, mat, items, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        d.position.set(it.x, it.y, it.z);
        d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
        d.scale.set(it.sx ?? it.s, it.sy ?? it.s, it.sz ?? it.s);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        if (it.c !== undefined) im.setColorAt(i, c.set(it.c).multiplyScalar(it.k ?? 1));
      });
      im.castShadow = shadow;
      im.receiveShadow = shadow;
      im.frustumCulled = false;
      scene.add(im);
      return im;
    };
    const scatter = (count, fn, o = {}) => {
      let placed = 0;
      for (let t = 0; t < count * 14 && placed < count; t++) {
        const a = R() * TAU, r = Math.sqrt(R()) * (o.rmax ?? 168), x = (o.cx ?? 0) + Math.cos(a) * r, z = (o.cz ?? 0) + Math.sin(a) * r;
        const h = this.height(x, z);
        if (h < (o.minH ?? 1) || h > (o.maxH ?? 30)) continue;
        if (o.avoid !== 0 && this.inPOI(x, z, o.avoid ?? 0.95)) continue;
        if (o.road && this.roadAt(x, z) < o.road) continue;
        if (o.flat && this.steep(x, z)) continue;
        if (Math.hypot(x - SINK.x, z - SINK.z) < SINK.r + 3) continue;
        if (o.free && this.phys.blocked(x, h, z, o.free, 3)) continue;
        fn(x, h, z);
        placed++;
      }
    };

    // trees
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
    leafMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uT;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
          transformed.x += sin(uTime * 1.3 + ph + position.y * 0.5) * 0.035 * position.y;
          transformed.z += cos(uTime * 1.1 + ph) * 0.025 * position.y;
          #endif`);
    };
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f6e, roughness: 0.9, flatShading: true });
    const trunkG = new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6).translate(0, 1.3, 0);
    const cone = (r, h) => new THREE.ConeGeometry(r, h, 7);
    const pineG = mergeGeoms([{ g: cone(1.55, 2.4), m: M(0, 2.9, 0) }, { g: cone(1.2, 2.0), m: M(0, 4.1, 0) }, { g: cone(0.8, 1.7), m: M(0, 5.2, 0) }]);
    const ico = (r) => new THREE.IcosahedronGeometry(r, 1);
    const puffG = mergeGeoms([{ g: ico(1.6), m: M(0, 3.7, 0) }, { g: ico(1.1), m: M(1.0, 3.0, 0.3) }, { g: ico(1.0), m: M(-0.9, 3.1, -0.4) }]);
    const leafC = [0xff5fa2, 0xff5fa2, 0xff8a3c, 0xb06bff, 0xffd166, 0x29d3c9, 0xff7ac8];
    const trunks = [], pines = [], puffs = [];
    scatter(330, (x, h, z) => {
      const s = 0.9 + R() * 0.8, ry = R() * TAU, col = this.pickC(leafC);
      trunks.push({ x, y: h - 0.2, z, s, ry });
      (R() < 0.5 ? pines : puffs).push({ x, y: h - 0.2, z, s, ry, c: col, k: 0.85 + R() * 0.3 });
      this.phys.addBox(x - 0.3 * s, h - 1, z - 0.3 * s, x + 0.3 * s, h + 2.6 * s, z + 0.3 * s);
    }, { minH: 1.2, maxH: 16, free: 2.5, road: 6, flat: 1 });
    inst(trunkG, trunkMat, trunks);
    inst(pineG, leafMat, pines);
    inst(puffG, leafMat, puffs);

    // rocks
    const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const rocks = [];
    scatter(120, (x, h, z) => {
      const s = 0.6 + R() * R() * 2.6;
      rocks.push({ x, y: h + s * 0.15, z, sx: s * (0.8 + R() * 0.5), sy: s * (0.6 + R() * 0.4), sz: s * (0.8 + R() * 0.5), ry: R() * TAU, rx: R() * 0.4, c: this.pickC([0x8f7fd8, 0x7a68c4, 0xa79be6, 0x6d5fb0]) });
      if (s > 0.9) this.phys.addBox(x - s * 0.62, h - 1, z - s * 0.62, x + s * 0.62, h + s * 0.62, z + s * 0.62);
    }, { minH: 0.4, free: 2.5, avoid: 0.9, road: 6 });
    inst(new THREE.IcosahedronGeometry(1, 0), rockMat, rocks);

    // crystals (two emissive colours)
    const cryG = new THREE.OctahedronGeometry(1, 0).scale(0.45, 1.6, 0.45).translate(0, 1.1, 0);
    const cA = [], cB = [];
    const addCry = (x, h, z, big) => {
      const n = 2 + ((R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const s = (big ? 1.2 : 0.6) * (0.5 + R() * 1.1), ox = (R() - 0.5) * 2.2, oz = (R() - 0.5) * 2.2;
        (R() < 0.5 ? cA : cB).push({ x: x + ox, y: this.height(x + ox, z + oz) - 0.3, z: z + oz, s, rx: (R() - 0.5) * 0.7, rz: (R() - 0.5) * 0.7, ry: R() * TAU });
      }
      if (big) this.phys.addBox(x - 0.5, h - 1, z - 0.5, x + 0.5, h + 2.2, z + 0.5);
    };
    scatter(26, (x, h, z) => addCry(x, h, z, true), { cx: POIS[3].x, cz: POIS[3].z, rmax: 34, avoid: 0, free: 2 });
    scatter(46, (x, h, z) => addCry(x, h, z, R() < 0.3), { minH: 1.5, free: 2, road: 5 });
    const cryMat = (col, em) => new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: 1.5, roughness: 0.2, flatShading: true });
    inst(cryG, cryMat(0x8ff8ff, 0x23d8ff), cA, false);
    inst(cryG, cryMat(0xffa0ec, 0xff3fd0), cB, false);

    // grass tufts + glow flowers
    const tufts = [], flowers = [];
    const gcol = [0x2fc49a, 0x58dba0, 0x1fa89c, 0x9fe88a];
    scatter(7000, (x, h, z) => tufts.push({ x, y: h + 0.12, z, sx: 0.7 + R() * 0.8, sy: 0.5 + R() * 0.9, sz: 0.7 + R() * 0.8, ry: R() * TAU, c: this.pickC(gcol) }), { minH: 1.5, maxH: 10, avoid: 0.8, road: 4.6 });
    scatter(700, (x, h, z) => flowers.push({ x, y: h + 0.3 + R() * 0.2, z, s: 0.07 + R() * 0.06, c: this.pickC([0xff5fe0, 0xffe14a, 0x6ef3ff, 0xffffff]), k: 2.2 }), { minH: 1, maxH: 10, avoid: 0.8, road: 4.6 });
    inst(new THREE.ConeGeometry(0.14, 0.5, 3, 1, true), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, side: THREE.DoubleSide }), tufts, false).receiveShadow = true;
    inst(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), flowers, false);

    // clouds
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xff8fc0, emissiveIntensity: 0.45, flatShading: true, fog: false });
    for (let i = 0; i < 16; i++) {
      const parts = [];
      const n = 4 + ((R() * 4) | 0);
      for (let k = 0; k < n; k++) parts.push({ g: new THREE.IcosahedronGeometry(8 + R() * 9, 1), m: M((k - n / 2) * 11 + R() * 5, R() * 5, R() * 9, 0, R() * 3, 0, 1, 0.55, 1) });
      const m = new THREE.Mesh(mergeGeoms(parts), cloudMat);
      const a = R() * TAU, r = 190 + R() * 520;
      m.position.set(Math.cos(a) * r, 95 + R() * 90, Math.sin(a) * r);
      m.rotation.y = R() * TAU;
      m.scale.setScalar(0.8 + R() * 1.3);
      this.clouds.add(m);
    }
    scene.add(this.clouds);

    // far floating islets
    this.islets = [];
    const isletMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
    for (let i = 0; i < 7; i++) {
      const r = 18 + R() * 26, hh = r * (1.1 + R() * 0.8);
      const g = mergeGeoms([
        { g: new THREE.ConeGeometry(r, hh, 7).rotateX(Math.PI), m: M(0, -hh / 2, 0), c: new THREE.Color(0x8a6fd6) },
        { g: new THREE.CylinderGeometry(r * 1.02, r, r * 0.16, 7), m: M(0, r * 0.08, 0), c: new THREE.Color(0x58dbb0) },
        { g: new THREE.ConeGeometry(r * 0.2, r * 0.6, 6), m: M(r * 0.3, r * 0.4, 0), c: new THREE.Color(0xff7ac8) },
        { g: new THREE.ConeGeometry(r * 0.15, r * 0.45, 6), m: M(-r * 0.35, r * 0.33, r * 0.2), c: new THREE.Color(0xffa24a) },
      ]);
      const m = new THREE.Mesh(g, isletMat);
      const a = (i / 7) * TAU + R() * 0.5, dist = 330 + R() * 260;
      m.position.set(Math.cos(a) * dist, 30 + R() * 90, Math.sin(a) * dist);
      m.rotation.y = R() * TAU;
      scene.add(m);
      this.islets.push({ m, y: m.position.y, ph: R() * TAU });
    }
  }

  // ------------------------------------------------------------ storm wall
  buildStorm() {
    this.stormMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { time: this.uT, radius: { value: 100 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float time,radius; varying vec2 vUv; varying vec3 vW;
        void main(){ float ang=vUv.x*6.2831853*radius; float y=vW.y;
          float cells=abs(sin(ang*0.35))*abs(sin(y*0.35-time*0.8));
          float streak=smoothstep(0.55,1.0,sin(ang*0.9+sin(y*0.2+time)*2.0)*0.5+0.5)*(0.5+0.5*sin(y*0.5-time*3.0));
          float base=0.26+0.2*smoothstep(0.8,1.0,cells)+0.3*streak;
          float fade=smoothstep(120.0,20.0,y)*smoothstep(-6.0,2.0,y);
          fade*=mix(1.0,0.22,smoothstep(30.0,170.0,distance(vW.xz,cameraPosition.xz)));
          vec3 col=mix(vec3(0.55,0.2,1.0),vec3(1.0,0.35,0.9),streak)*1.5;
          gl_FragColor=vec4(col,base*fade);
        }`,
    });
    this.stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 130, 128, 1, true).translate(0, 55, 0), this.stormMat);
    this.stormMesh.frustumCulled = false;
    this.stormMesh.renderOrder = 4;
    this.stormMesh.visible = false;
    this.scene.add(this.stormMesh);
  }

  setStorm(x, z, r, visible = true) {
    this.storm.x = x;
    this.storm.z = z;
    this.storm.r = r;
    this.stormMesh.visible = visible;
    this.stormMesh.position.set(x, 0, z);
    this.stormMesh.scale.set(Math.max(r, 0.5), 1, Math.max(r, 0.5));
    this.stormMat.uniforms.radius.value = Math.max(r, 0.5);
  }

  // ------------------------------------------------------------ minimap image
  buildMinimap() {
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), img = g.createImageData(S, S), half = WORLD.size / 2;
    for (let py = 0; py < S; py++)
      for (let px = 0; px < S; px++) {
        const x = (px / S - 0.5) * WORLD.size, z = (py / S - 0.5) * WORLD.size, h = this.height(x, z);
        let r, gg, b, a = 255;
        if (h < WORLD.waterY) { r = 40; gg = 60; b = 150; a = 150; }
        else if (h < 0.7) { r = 240; gg = 205; b = 160; }
        else if (h > 10) { r = 150; gg = 128; b = 235; }
        else { const k = 0.8 + h * 0.03; r = 50 * k; gg = 200 * k; b = 160 * k; }
        const poi = this.inPOI(x, z, 0.75);
        if (poi && poi.paved && h > 0.3) { r = 120; gg = 118; b = 190; }
        else if (h > 0.3 && this.roadAt(x, z) < 3.6) { r = 84; gg = 80; b = 150; }
        const i = (py * S + px) * 4;
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a;
      }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#231f52';
    for (const b of this.phys.boxes) {
      if (b.y1 - b.y0 < 2.2 || (b.x1 - b.x0) * (b.z1 - b.z0) < 3) continue;
      const k = S / WORLD.size;
      g.fillRect((b.x0 + half) * k, (b.z0 + half) * k, Math.max(1, (b.x1 - b.x0) * k), Math.max(1, (b.z1 - b.z0) * k));
    }
    this.mapCanvas = cv;
  }

  // Random standable point inside a disc (used for spawns, loot, bot goals).
  freePoint(cx, cz, r, minR = 0, out = {}) {
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * TAU, rr = minR + Math.sqrt(Math.random()) * (r - minR);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (Math.hypot(x, z) > WORLD.boundR - 14) continue;
      const h = this.height(x, z);
      if (h < 0.4 || this.phys.blocked(x, h, z, 0.7, 2)) continue;
      out.x = x; out.y = h; out.z = z;
      return out;
    }
    out.x = cx; out.z = cz; out.y = this.phys.ground(cx, cz, 100);
    return out;
  }

  setQuality(q) {
    const s = q === 'high' ? 2048 : 1024;
    this.sun.castShadow = q !== 'low';
    if (this.sun.shadow.mapSize.x !== s) {
      this.sun.shadow.mapSize.set(s, s);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  update(dt, cam, stormK = 0) {
    this.uT.value += dt;
    const t = this.uT.value;
    this.skyGroup.position.copy(cam.position);
    this.skyMat.uniforms.storm.value = stormK;
    this.waterMat.uniforms.storm.value = stormK;
    this.scene.fog.color.copy(this.fogBase).lerp(this.fogStorm, stormK * 0.8);
    this.scene.fog.density = 0.0034 + stormK * 0.006;
    for (const s of this.spinners) {
      s.m.rotation[s.ax] += s.sp * dt;
      if (s.bob) s.m.position.y = s.y + Math.sin(t * 1.2 + s.sp) * s.bob;
    }
    for (const p of this.jumpPads) p.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 5 + p.x));
    this.clouds.rotation.y += dt * 0.004;
    updateAtmosphere(this, dt, cam, t);
    for (const i of this.islets) i.m.position.y = i.y + Math.sin(t * 0.3 + i.ph) * 4;
    // shadow frustum follows the camera, snapped to reduce shimmer
    const sx = Math.round(cam.position.x / 4) * 4, sz = Math.round(cam.position.z / 4) * 4;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx, 0, sz).addScaledVector(this.sunDir, 200);
  }
}
