/* =========================================================
   particles.js — 沧野式粒子引擎
   爆发旋涡 + 轮廓云 + 鼠标斥力 + 弹簧归位 + 尘埃层
   坐标空间：pivot 局部空间（points 挂在 pivot 下）
   ========================================================= */
(function () {
  'use strict';

  var NS = (window.Lodolin3D = window.Lodolin3D || {});

  var P = 2400;          // 主粒子数
  var DUST = 260;        // 背景尘埃数
  var BURST_MS = 900;    // 爆发阶段时长
  var REPEL_R = 1.7;     // 鼠标斥力半径（pivot 空间）

  var pos, col, vel, home, shell, seed;
  var geo, points, dustPts, dustGeo;
  var dustBase, dustSeed;
  var mode = 'solid';
  var phaseT = 0;
  var onPhase = null;

  // 各阶段物理参数
  var PH = {
    burst:  { k: 2.2,  drag: 1.8, swirl: 2.6,  noise: 1.1,  repel: 0 },
    cloud:  { k: 7.5,  drag: 3.4, swirl: 0.55, noise: 0.32, repel: 1 },
    gather: { k: 30.0, drag: 6.5, swirl: 0,    noise: 0,    repel: 0 }
  };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function emit(m) { if (onPhase) onPhase(m); }

  /* ---------- 表面采样（含 modelRoot 偏移，输出 pivot 空间） ---------- */

  function sampleSurfaces(meshes) {
    var out = [], tmp = new THREE.Vector3();
    for (var i = 0; i < meshes.length; i++) {
      var m = meshes[i], g = m.geometry;
      var pa = g.attributes.position, idx = g.index;
      var tri = idx ? idx.count / 3 : pa.count / 3;
      var hex = (m.material && m.material.color) ? m.material.color.getHex() : 0x888888;
      for (var k = 0; k < 70; k++) {
        var f = (Math.random() * tri) | 0, a, b, c;
        if (idx) { a = idx.getX(f * 3); b = idx.getX(f * 3 + 1); c = idx.getX(f * 3 + 2); }
        else { a = f * 3; b = f * 3 + 1; c = f * 3 + 2; }
        var r1 = Math.random(), r2 = Math.random(), r3 = Math.random();
        var s = r1 + r2 + r3; r1 /= s; r2 /= s; r3 /= s;
        tmp.set(
          pa.getX(a) * r1 + pa.getX(b) * r2 + pa.getX(c) * r3,
          pa.getY(a) * r1 + pa.getY(b) * r2 + pa.getY(c) * r3,
          pa.getZ(a) * r1 + pa.getZ(b) * r2 + pa.getZ(c) * r3
        );
        m.localToWorld(tmp);
        out.push({ x: tmp.x, y: tmp.y, z: tmp.z, hex: hex });
      }
    }
    return out;
  }

  /* ---------- 构建 ---------- */

  function build(meshes, dims, modelZ) {
    home = new Float32Array(P * 3);
    shell = new Float32Array(P * 3);
    pos = new Float32Array(P * 3);
    vel = new Float32Array(P * 3);
    col = new Float32Array(P * 3);
    seed = new Float32Array(P);

    var samples = sampleSurfaces(meshes);
    var c = new THREE.Color();
    var i, i3;
    for (i = 0; i < P; i++) {
      var sp = samples[i % samples.length];
      i3 = i * 3;
      home[i3] = sp.x; home[i3 + 1] = sp.y; home[i3 + 2] = sp.z;
      pos[i3] = sp.x; pos[i3 + 1] = sp.y; pos[i3 + 2] = sp.z;
      c.setHex(sp.hex);
      var v = 0.82 + Math.random() * 0.36;
      // 能量态调色：黑色部件提亮为银蓝，亮色部件保留色相（沧野式明亮粒子）
      var r0 = c.r, g0 = c.g, b0 = c.b;
      var lum = Math.max(r0, g0, b0);
      var mixK = 0.3 + 0.55 * (1 - Math.min(1, lum * 2.4));
      col[i3] = (r0 * (1 - mixK) + 0.8 * mixK) * v;
      col[i3 + 1] = (g0 * (1 - mixK) + 0.84 * mixK) * v;
      col[i3 + 2] = (b0 * (1 - mixK) + 0.94 * mixK) * v;
      if (Math.random() < 0.06) { col[i3] = 0.95; col[i3 + 1] = 0.65; col[i3 + 2] = 0.3; }
      seed[i] = Math.random() * Math.PI * 2;
    }

    buildShell(modelZ);

    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    var mat = new THREE.PointsMaterial({
      size: 0.062, vertexColors: true, transparent: true, opacity: 1.0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    points = new THREE.Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;

    buildDust();
  }

  /* ---------- 轮廓外壳目标点（沧野式：散开仍保持整机形状） ---------- */

  function buildShell(mz) {
    var i, i3, u, th, r, z, x, y;
    var BW = 2.35, BH = 1.5, BD = 1.0;      // 机身壳半尺寸（含兔笼）
    var face, w;
    for (i = 0; i < P; i++) {
      i3 = i * 3;
      u = i / P;
      if (u < 0.45) {
        // 机身盒壳
        face = Math.random();
        if (face < 0.36) { z = mz + (Math.random() < 0.5 ? -BD : BD); x = rnd(-BW, BW); y = rnd(-BH, BH); }
        else if (face < 0.60) { y = Math.random() < 0.5 ? -BH : BH; x = rnd(-BW, BW); z = mz + rnd(-BD, BD); }
        else { x = Math.random() < 0.5 ? -BW : BW; y = rnd(-BH, BH); z = mz + rnd(-BD, BD); }
        shell[i3] = x; shell[i3 + 1] = y; shell[i3 + 2] = z;
        if (x > 1.45) { col[i3] *= 0.82; col[i3 + 1] *= 0.82; col[i3 + 2] *= 0.85; }
      } else if (u < 0.82) {
        // 镜筒圆柱壳
        th = Math.random() * Math.PI * 2;
        z = rnd(-1.1, 3.5);
        r = z > 2.4 ? 1.44 : 1.5;
        shell[i3] = Math.cos(th) * r;
        shell[i3 + 1] = Math.sin(th) * r;
        shell[i3 + 2] = z;
        if (z > 1.55 && z < 1.9) { col[i3] = 0.82; col[i3 + 1] = 0.85; col[i3 + 2] = 0.9; }
        else if (z > -0.85 && z < 0.2) { col[i3] *= 0.8; col[i3 + 1] *= 0.8; col[i3 + 2] *= 0.84; }
        else { col[i3] *= 0.9; col[i3 + 1] *= 0.9; col[i3 + 2] *= 0.94; }
      } else if (u < 0.88) {
        // 前镜片玻璃面
        th = Math.random() * Math.PI * 2;
        r = Math.sqrt(Math.random()) * 1.26;
        shell[i3] = Math.cos(th) * r;
        shell[i3 + 1] = Math.sin(th) * r;
        shell[i3 + 2] = 3.15;
        if (r < 0.45) { col[i3] = 0.98; col[i3 + 1] = 0.68; col[i3 + 2] = 0.32; }
        else { col[i3] = 0.4; col[i3 + 1] = 0.52; col[i3 + 2] = 0.78; }
      } else {
        // 花瓣遮光罩环带（带花瓣调制）
        th = Math.random() * Math.PI * 2;
        z = rnd(3.45, 4.25);
        var t = (z - 3.45) / 0.8;
        r = 1.45 + t * 0.5;
        r *= 1 + 0.13 * Math.cos(2 * th) * t;
        shell[i3] = Math.cos(th) * r;
        shell[i3 + 1] = Math.sin(th) * r;
        shell[i3 + 2] = z;
        col[i3] *= 0.8; col[i3 + 1] *= 0.8; col[i3 + 2] *= 0.84;
      }
    }
  }

  /* ---------- 背景尘埃 ---------- */

  function buildDust() {
    dustBase = new Float32Array(DUST * 3);
    dustSeed = new Float32Array(DUST);
    var dp = new Float32Array(DUST * 3);
    var dc = new Float32Array(DUST * 3);
    for (var i = 0; i < DUST; i++) {
      dustBase[i * 3] = rnd(-9, 9);
      dustBase[i * 3 + 1] = rnd(-4.5, 4.5);
      dustBase[i * 3 + 2] = rnd(-6, 5);
      dp[i * 3] = dustBase[i * 3];
      dp[i * 3 + 1] = dustBase[i * 3 + 1];
      dp[i * 3 + 2] = dustBase[i * 3 + 2];
      var v = 0.4 + Math.random() * 0.5;
      dc[i * 3] = 0.55 * v; dc[i * 3 + 1] = 0.62 * v; dc[i * 3 + 2] = 0.78 * v;
      dustSeed[i] = Math.random() * Math.PI * 2;
    }
    dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.03, vertexColors: true, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    dustPts.frustumCulled = false;
  }

  /* ---------- 状态切换 ---------- */

  function scatter(now) {
    if (mode !== 'solid') return;
    mode = 'burst';
    phaseT = now;
    var i, i3;
    for (i = 0; i < P; i++) {
      i3 = i * 3;
      pos[i3] = home[i3]; pos[i3 + 1] = home[i3 + 1]; pos[i3 + 2] = home[i3 + 2];
      // 爆发方向：轮廓方向 + 径向 + 旋涡切向
      var dx = shell[i3] - home[i3], dy = shell[i3 + 1] - home[i3 + 1], dz = shell[i3 + 2] - home[i3 + 2];
      var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var rx = home[i3], ry = home[i3 + 1];
      var rl = Math.sqrt(rx * rx + ry * ry) || 1;
      var sp = rnd(5.5, 9.5);
      vel[i3]     = (dx / dl) * 0.45 * sp + (-ry / rl) * 2.2 + rnd(-1.2, 1.2);
      vel[i3 + 1] = (dy / dl) * 0.45 * sp + (rx / rl) * 2.2 + rnd(-1.2, 1.2);
      vel[i3 + 2] = (dz / dl) * 0.45 * sp + rnd(-0.8, 2.4);
    }
    points.visible = true;
    emit('burst');
  }

  function gather() {
    if (mode !== 'cloud' && mode !== 'burst') return;
    mode = 'gather';
    emit('gather');
  }

  /* ---------- 物理更新 ---------- */

  function update(now, dt, repel) {
    if (mode === 'solid') return true;
    var prm = PH[mode];
    dt = Math.min(dt, 0.033);
    var drag = Math.exp(-prm.drag * dt);
    var settle = mode === 'gather';
    var R2 = REPEL_R * REPEL_R;
    var i, i3;

    for (i = 0; i < P; i++) {
      i3 = i * 3;
      var tx = (mode === 'gather') ? home[i3] : shell[i3];
      var ty = (mode === 'gather') ? home[i3 + 1] : shell[i3 + 1];
      var tz = (mode === 'gather') ? home[i3 + 2] : shell[i3 + 2];

      vel[i3]     += (tx - pos[i3]) * prm.k * dt;
      vel[i3 + 1] += (ty - pos[i3 + 1]) * prm.k * dt;
      vel[i3 + 2] += (tz - pos[i3 + 2]) * prm.k * dt;

      // 旋涡切向力（绕镜头轴）
      if (prm.swirl > 0) {
        var rx = pos[i3], ry = pos[i3 + 1];
        var r2 = rx * rx + ry * ry;
        if (r2 > 0.05) {
          var inv = prm.swirl * dt / Math.sqrt(r2);
          vel[i3]     += -ry * inv;
          vel[i3 + 1] += rx * inv;
        }
      }

      // 噪声漂浮
      if (prm.noise > 0) {
        var s = seed[i];
        vel[i3]     += Math.sin(now * 0.0016 + s) * prm.noise * dt;
        vel[i3 + 1] += Math.cos(now * 0.0013 + s * 1.7) * prm.noise * dt;
        vel[i3 + 2] += Math.sin(now * 0.0011 + s * 2.3) * prm.noise * dt * 0.6;
      }

      // 鼠标斥力（云态）
      if (prm.repel && repel) {
        var mx = pos[i3] - repel.x, my = pos[i3 + 1] - repel.y, mz2 = pos[i3 + 2] - repel.z;
        var d2 = mx * mx + my * my + mz2 * mz2;
        if (d2 < R2 && d2 > 0.0001) {
          var f = ((R2 - d2) / R2) * 30 * dt / Math.sqrt(d2);
          vel[i3] += mx * f; vel[i3 + 1] += my * f; vel[i3 + 2] += mz2 * f;
        }
      }

      vel[i3] *= drag; vel[i3 + 1] *= drag; vel[i3 + 2] *= drag;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      if (settle) {
        var gx = pos[i3] - home[i3], gy = pos[i3 + 1] - home[i3 + 1], gz = pos[i3 + 2] - home[i3 + 2];
        var v2 = vel[i3] * vel[i3] + vel[i3 + 1] * vel[i3 + 1] + vel[i3 + 2] * vel[i3 + 2];
        if (gx * gx + gy * gy + gz * gz > 0.0036 || v2 > 0.02) settle = false;
      }
    }

    geo.attributes.position.needsUpdate = true;

    if (mode === 'burst' && now - phaseT > BURST_MS) { mode = 'cloud'; emit('cloud'); }
    else if (settle) { mode = 'solid'; points.visible = false; emit('solid'); }

    updateDust(now);
    return mode === 'solid';
  }

  function updateDust(now) {
    var dp = dustGeo.attributes.position.array;
    for (var i = 0; i < DUST; i++) {
      var s = dustSeed[i];
      dp[i * 3] = dustBase[i * 3] + Math.sin(now * 0.00022 + s) * 0.55;
      dp[i * 3 + 1] = dustBase[i * 3 + 1] + Math.sin(now * 0.00035 + s * 2.1) * 0.4;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- 对外接口 ---------- */

  NS.Particles = {
    build: build,
    scatter: scatter,
    gather: gather,
    update: update,
    updateDust: updateDust,
    points: function () { return points; },
    dust: function () { return dustPts; },
    mode: function () { return mode; },
    onPhase: function (cb) { onPhase = cb; }
  };
})();
