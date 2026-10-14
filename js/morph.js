/* =========================================================
   morph.js — 银河系 ⇄ 地球 切换引擎（写实渲染版）
   银河系：N 粒子 / 弹簧力 + 噪声漂移 + 鼠标斥力 / 柔光晕 shader
   地球：粒子球由 NS.Earth 管理，点击时银河收起、地球浮现
   + 真实光谱背景深空星场（不随形态流转）
   ========================================================= */
(function () {
  'use strict';

  var NS = (window.Lodolin3D = window.Lodolin3D || {});

  var isMobile = false;
  try { isMobile = window.matchMedia('(max-width: 768px)').matches; } catch (e) {}
  var N = isMobile ? 25000 : 50000;   // 主粒子数（单形态，全部给银河系）
  var DUST = isMobile ? 420 : 700;    // 背景尘埃
  var STARS = isMobile ? 1000 : 2400; // 深空背景星
  var REPEL_R = 1.9;

  var SHAPES = ['milkyway'];
  var idx = 0;
  var morphing = false;
  var phaseT = 0;
  var MIX_MS = 2800;
  var onPhase = null;

  var pos, vel, seed, twk;
  var shapePos = [], shapeCol = [], shapeSize = [];
  var geo, points, dustPts, dustGeo, dustBase, dustSeed;
  var starPts, starGeo;
  var repel = null;

  /* 银河系 ⇄ 地球 逻辑态 */
  var currentShape = 'milkyway';
  var galaxyScale = 1, galaxyTarget = 1;

  var PH = {
    rest:  { k: 16, drag: 4.2, swirl: 1.4, noise: 0.5 },
    morph: { k: 9,  drag: 3.2, swirl: 1.8, noise: 1.3 }
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function emit(m) { if (onPhase) onPhase(m); }

  /* 共用着色器：高斯亮核 + 柔和光晕，星点更像真实镜头星像 */
  function glowFragments() {
    return {
      vertex: [
        'attribute float psize;',
        'attribute vec3 color;',
        'attribute float aseed;',
        'varying vec3 vColor;',
        'varying float vTwinkle;',
        'uniform float uScale;',
        'uniform float uTime;',
        'uniform float uTwAmp;',
        'uniform float uFade;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = max(psize * uScale * (150.0 / -mv.z), 1.0);',
        '  vColor = color * uFade;',
        '  vTwinkle = 1.0 - uTwAmp + uTwAmp * (0.5 + 0.5 * sin(uTime * 1.7 + aseed * 6.2831));',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragment: [
        'varying vec3 vColor;',
        'varying float vTwinkle;',
        'void main() {',
        '  vec2 d = gl_PointCoord - vec2(0.5);',
        '  float r2 = dot(d, d) * 4.0;',
        '  float core = exp(-r2 * 7.0);',
        '  float halo = exp(-r2 * 1.8) * 0.32;',
        '  float a = (core + halo) * vTwinkle;',
        '  if (a < 0.004) discard;',
        '  gl_FragColor = vec4(vColor * (0.55 + 0.45 * a), a);',
        '}'
      ].join('\n')
    };
  }

  function build() {
    var gens = [NS.Galaxy.buildMilkyway];
    for (var g = 0; g < gens.length; g++) {
      var d = gens[g](N);
      shapePos.push(d.pos);
      shapeCol.push(d.col);
      shapeSize.push(d.size);
    }

    pos = new Float32Array(N * 3);
    vel = new Float32Array(N * 3);
    seed = new Float32Array(N);
    twk = new Float32Array(N);
    for (var i = 0; i < N * 3; i++) pos[i] = shapePos[0][i];
    for (var j = 0; j < N; j++) {
      seed[j] = Math.random();
      twk[j] = 0.75 + Math.random() * 0.5;
    }

    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(shapeCol[0], 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(shapeSize[0], 1));
    geo.setAttribute('aseed', new THREE.BufferAttribute(seed, 1));

    var sh = glowFragments();
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uTime: { value: 0 },
        uTwAmp: { value: 0.16 },
        uFade: { value: 1 }
      },
      vertexShader: sh.vertex,
      fragmentShader: sh.fragment
    });

    points = new THREE.Points(geo, mat);
    points.visible = true;
    points.frustumCulled = false;

    buildDust();
    buildDeepStars();
  }

  /* ---------- 深空背景星场（真实光谱型 + 星等分布） ---------- */

  function buildDeepStars() {
    var sp = new Float32Array(STARS * 3);
    var sc = new Float32Array(STARS * 3);
    var ss = new Float32Array(STARS);
    var sd = new Float32Array(STARS);

    /* 光谱型颜色（O/B → M），概率近似太阳邻域 */
    function starColor() {
      var t = Math.random();
      if (t < 0.03) return [0.62, 0.72, 1.0];   /* O/B 蓝 */
      if (t < 0.11) return [0.78, 0.85, 1.0];   /* A 蓝白 */
      if (t < 0.23) return [0.95, 0.94, 1.0];   /* F 白 */
      if (t < 0.45) return [1.0, 0.95, 0.85];   /* G 黄白 */
      if (t < 0.72) return [1.0, 0.8, 0.58];    /* K 橙 */
      return [1.0, 0.62, 0.42];                 /* M 红 */
    }

    for (var i = 0; i < STARS; i++) {
      var i3 = i * 3;
      /* 均匀球壳分布，远近分层 */
      var u = Math.random() * 2 - 1;
      var phi = Math.acos(u);
      var th = Math.random() * Math.PI * 2;
      var r = 55 + Math.pow(Math.random(), 0.5) * 55;
      sp[i3] = Math.cos(th) * Math.sin(phi) * r;
      sp[i3 + 1] = Math.cos(phi) * r;
      sp[i3 + 2] = Math.sin(th) * Math.sin(phi) * r;

      /* 星等分布：暗星多、亮星极少（视星等幕律） */
      var mag = Math.pow(Math.random(), 5.5);
      var v = 0.14 + mag * 0.8;
      var c = starColor();
      sc[i3] = c[0] * v; sc[i3 + 1] = c[1] * v; sc[i3 + 2] = c[2] * v;
      ss[i] = 0.5 + mag * (Math.random() < 0.008 ? 3.4 : 1.9);
      sd[i] = Math.random();
    }

    starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    starGeo.setAttribute('psize', new THREE.BufferAttribute(ss, 1));
    starGeo.setAttribute('aseed', new THREE.BufferAttribute(sd, 1));

    var sh = glowFragments();
    starPts = new THREE.Points(starGeo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uTime: { value: 0 },
        uTwAmp: { value: 0.55 },
        uFade: { value: 1 }
      },
      vertexShader: sh.vertex,
      fragmentShader: sh.fragment
    }));
    starPts.frustumCulled = false;
  }

  /* ---------- 银河系 ⇄ 地球 切换 ---------- */

  function showGalaxy() {
    currentShape = 'milkyway';
    galaxyTarget = 1;
    if (NS.Earth) NS.Earth.setShown(false);
    emit({ shape: 'milkyway', morphing: false });
  }

  function showEarth() {
    currentShape = 'earth';
    galaxyTarget = 0;
    if (NS.Earth) NS.Earth.setShown(true);
    emit({ shape: 'earth', morphing: false });
  }

  function next() {
    if (currentShape === 'earth') showGalaxy(); else showEarth();
  }

  function current() { return currentShape; }

  /* 直切形态（供外部控制）：0 = 银河系，1 = 地球 */
  function setShape(i) {
    if (i === 1) showEarth(); else showGalaxy();
  }

  /* ---------- 物理更新 ---------- */

  function update(now, dt, repelLocal) {
    dt = Math.min(dt, 0.033);
    var prm = morphing ? PH.morph : PH.rest;
    var drag = Math.exp(-prm.drag * dt);
    var tp = shapePos[idx];
    var tc = shapeCol[idx];
    var ts = shapeSize[idx];
    var pa = geo.attributes.position;
    var ca = geo.attributes.color;
    var sa = geo.attributes.psize;
    var i, i3;

    for (i = 0; i < N; i++) {
      i3 = i * 3;
      vel[i3]     += (tp[i3] - pos[i3]) * prm.k * dt;
      vel[i3 + 1] += (tp[i3 + 1] - pos[i3 + 1]) * prm.k * dt;
      vel[i3 + 2] += (tp[i3 + 2] - pos[i3 + 2]) * prm.k * dt;

      if (prm.swirl > 0) {
        var rx = pos[i3], rz = pos[i3 + 2];
        var r2 = rx * rx + rz * rz;
        if (r2 > 0.04) {
          var inv = prm.swirl * dt / Math.sqrt(r2);
          vel[i3] += -rz * inv;
          vel[i3 + 2] += rx * inv;
        }
      }
      if (prm.noise > 0) {
        var s = seed[i] * 6.2831;
        vel[i3]     += Math.sin(now * 0.0013 + s) * prm.noise * dt;
        vel[i3 + 1] += Math.cos(now * 0.0011 + s * 1.7) * prm.noise * dt;
        vel[i3 + 2] += Math.sin(now * 0.0016 + s * 2.3) * prm.noise * dt;
      }
      if (repelLocal) {
        var mx = pos[i3] - repelLocal.x, my = pos[i3 + 1] - repelLocal.y, mz = pos[i3 + 2] - repelLocal.z;
        var d2 = mx * mx + my * my + mz * mz;
        if (d2 < REPEL_R * REPEL_R && d2 > 0.0001) {
          var f = ((REPEL_R * REPEL_R - d2) / (REPEL_R * REPEL_R)) * 26 * dt / Math.sqrt(d2);
          vel[i3] += mx * f; vel[i3 + 1] += my * f; vel[i3 + 2] += mz * f;
        }
      }

      vel[i3] *= drag; vel[i3 + 1] *= drag; vel[i3 + 2] *= drag;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      /* 流转中颜色与尺寸同步渐变 */
      if (morphing) {
        var ck = Math.min(1, dt * 2.2);
        ca.array[i3]     += (tc[i3] - ca.array[i3]) * ck;
        ca.array[i3 + 1] += (tc[i3 + 1] - ca.array[i3 + 1]) * ck;
        ca.array[i3 + 2] += (tc[i3 + 2] - ca.array[i3 + 2]) * ck;
        sa.array[i] += (ts[i] - sa.array[i]) * ck;
      }
    }

    pa.needsUpdate = true;
    if (morphing) { ca.needsUpdate = true; sa.needsUpdate = true; }
    points.material.uniforms.uTime.value = now * 0.001;
    starPts.material.uniforms.uTime.value = now * 0.001;

    if (morphing && now - phaseT > MIX_MS) {
      morphing = false;
      emit({ shape: SHAPES[idx], morphing: false });
    }

    updateDust(now);

    /* 银河系淡入淡出（切换到地球时变暗消失，不塌缩，保留原位） */
    galaxyScale += (galaxyTarget - galaxyScale) * Math.min(1, dt * 3.4);
    points.material.uniforms.uFade.value = Math.max(0, galaxyScale);
    points.visible = galaxyScale > 0.004;
    if (dustPts) dustPts.material.opacity = 0.4 * Math.max(0, galaxyScale);
  }

  function updateDust(now) {
    if (!dustGeo) return;
    var dp = dustGeo.attributes.position.array;
    for (var i = 0; i < DUST; i++) {
      var s = dustSeed[i];
      dp[i * 3] = dustBase[i * 3] + Math.sin(now * 0.00021 + s) * 0.6;
      dp[i * 3 + 1] = dustBase[i * 3 + 1] + Math.sin(now * 0.00033 + s * 2.1) * 0.45;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  function buildDust() {
    dustBase = new Float32Array(DUST * 3);
    dustSeed = new Float32Array(DUST);
    var dp = new Float32Array(DUST * 3);
    var dc = new Float32Array(DUST * 3);
    for (var i = 0; i < DUST; i++) {
      dustBase[i * 3] = rand(-12, 12);
      dustBase[i * 3 + 1] = rand(-6, 6);
      dustBase[i * 3 + 2] = rand(-8, 6);
      dp[i * 3] = dustBase[i * 3];
      dp[i * 3 + 1] = dustBase[i * 3 + 1];
      dp[i * 3 + 2] = dustBase[i * 3 + 2];
      var v = 0.22 + Math.random() * 0.3;
      /* 银河系方向性尘埃：少量暖色深空尘埃带 */
      var warm = Math.random() < 0.2;
      dc[i * 3] = (warm ? 0.5 : 0.42) * v; dc[i * 3 + 1] = (warm ? 0.44 : 0.5) * v; dc[i * 3 + 2] = 0.7 * v;
      dustSeed[i] = Math.random() * Math.PI * 2;
    }
    dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.035, vertexColors: true, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    dustPts.frustumCulled = false;
  }

  NS.Morph = {
    build: build,
    update: update,
    updateDust: updateDust,
    next: next,
    current: current,
    setShape: setShape,
    isMorphing: function () { return morphing; },
    galaxyScale: function () { return galaxyScale; },
    points: function () { return points; },
    dust: function () { return dustPts; },
    stars: function () { return starPts; },
    onPhase: function (cb) { onPhase = cb; },
    setScale: function (s) {
      points.material.uniforms.uScale.value = s;
      if (starPts) starPts.material.uniforms.uScale.value = s * 0.55;
    }
  };
})();
