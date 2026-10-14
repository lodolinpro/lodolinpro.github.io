/* =========================================================
   stage.js — 三维舞台：银河系 ⇄ 地球（飞越过渡）
   银河视角：拖动环视（转 pivot）· 滚轮缩放 · 缓慢自转 · 太阳标记
   地球视角：点击银河后，镜头飞向太阳系位置并放大到地球
            · 拖动绕地球环视 · 滚轮缩放 · 月球绕地公转
   ========================================================= */
(function () {
  'use strict';

  var NS = (window.Lodolin3D = window.Lodolin3D || {});

  var renderer, scene, persp, pivot, earthGroup, sunMarker;
  var lastInteract = 0;
  var onState = null;
  var reduceMotion = false;
  var lastT = 0;

  var mode = 'galaxy';                 // 'galaxy' | 'earth'
  var trans = null;                    // 进行中的镜头过渡
  var lookTarget = new THREE.Vector3(0, 0, 0);
  var earthWorld = new THREE.Vector3();
  var eYaw = 0, ePitch = 0.22, eDist = 8;

  var HOME_POS = new THREE.Vector3(0, 2.6, 16);   // 银河默认机位
  var D_EARTH = 8;                                 // 地球视角初始距离

  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x050505, 1);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.018);

    persp = new THREE.PerspectiveCamera(45, 1, 0.1, 260);
    persp.position.copy(HOME_POS);
    persp.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x28304a, 0.9));

    pivot = new THREE.Group();
    scene.add(pivot);
    pivot.rotation.set(0.06, 0.3, 0);

    NS.Morph.build();
    pivot.add(NS.Morph.points());
    pivot.add(NS.Morph.stars());   /* 深空星场随拖动一起转动，如转动镜头 */
    earthGroup = NS.Earth.build();
    pivot.add(earthGroup);         /* 太阳系（地球+月球），位于银河本地臂 */
    scene.add(NS.Morph.dust());

    buildSunMarker();

    NS.Morph.onPhase(function (info) { if (onState) onState(info); });

    bindEvents(canvas);
    resize();
    lastT = performance.now();
    animate();
  }

  /* ---------------- 太阳标记（银河里标示地球所在） ---------------- */

  function buildSunMarker() {
    var N = 42, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      if (i < 8) {
        var r = Math.random() * 0.14, a = Math.random() * Math.PI * 2;
        pos[i3] = Math.cos(a) * r; pos[i3 + 1] = (Math.random() - 0.5) * 0.12; pos[i3 + 2] = Math.sin(a) * r;
        col[i3] = 1.0; col[i3 + 1] = 0.85; col[i3 + 2] = 0.55;
      } else {
        var a2 = (i - 8) / (N - 8) * Math.PI * 2;
        var rr = 0.42 + (Math.random() - 0.5) * 0.06;
        pos[i3] = Math.cos(a2) * rr; pos[i3 + 1] = (Math.random() - 0.5) * 0.05; pos[i3 + 2] = Math.sin(a2) * rr;
        col[i3] = 0.7; col[i3 + 1] = 0.55; col[i3 + 2] = 0.35;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sunMarker = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    var sp = NS.Earth.sunPos();
    sunMarker.position.set(sp.x, sp.y, sp.z);
    sunMarker.frustumCulled = false;
    pivot.add(sunMarker);
  }

  /* ---------------- 切换 + 过渡 ---------------- */

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function toggle() {
    if (trans) return;
    if (mode === 'galaxy') goEarth(); else goGalaxy();
  }

  function goEarth() {
    pivot.updateMatrixWorld(true);
    earthWorld.setFromMatrixPosition(earthGroup.matrixWorld);
    trans = {
      t0: performance.now(), dur: 2600,
      fromPos: persp.position.clone(),
      toPos: earthWorld.clone().add(new THREE.Vector3(0, 3, D_EARTH)),
      fromLook: lookTarget.clone(),
      toLook: earthWorld.clone()
    };
    mode = 'earth';
    NS.Morph.setShape(1);   // 淡出银河、淡入地球
  }

  function goGalaxy() {
    trans = {
      t0: performance.now(), dur: 2200,
      fromPos: persp.position.clone(),
      toPos: HOME_POS.clone(),
      fromLook: lookTarget.clone(),
      toLook: new THREE.Vector3(0, 0, 0)
    };
    mode = 'galaxy';
    NS.Morph.setShape(0);   // 淡入银河、淡出地球
  }

  function goShape(i) {
    if (trans) return;
    if (i === 1 && mode !== 'earth') goEarth();
    else if (i === 0 && mode !== 'galaxy') goGalaxy();
  }

  function updateTransition(now) {
    var t = Math.min(1, (now - trans.t0) / trans.dur);
    var e = easeInOutCubic(t);
    persp.position.lerpVectors(trans.fromPos, trans.toPos, e);
    lookTarget.lerpVectors(trans.fromLook, trans.toLook, e);
    persp.lookAt(lookTarget);
    if (t >= 1) {
      trans = null;
      if (mode === 'earth') initEarthOrbit();
    }
  }

  function initEarthOrbit() {
    var off = persp.position.clone().sub(earthWorld);
    eDist = Math.max(4, off.length());
    ePitch = Math.asin(Math.max(-1, Math.min(1, off.y / eDist)));
    eYaw = Math.atan2(off.x, off.z);
  }

  function applyEarthCamera() {
    persp.position.set(
      earthWorld.x + eDist * Math.cos(ePitch) * Math.sin(eYaw),
      earthWorld.y + eDist * Math.sin(ePitch),
      earthWorld.z + eDist * Math.cos(ePitch) * Math.cos(eYaw)
    );
    lookTarget.copy(earthWorld);
    persp.lookAt(lookTarget);
  }

  NS.nextShape = toggle;
  NS.goShape = goShape;
  NS.shapeName = function () { return NS.Morph.current(); };
  NS.onStateChange = function (cb) { onState = cb; };

  /* ---------------- 交互 ---------------- */

  var repelLocal = null;

  function bindEvents(canvas) {
    var dragging = false, moved = 0, px = 0, py = 0, downTime = 0;
    var pointers = new Map();
    var pinchDist = 0;

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true; moved = 0; px = e.clientX; py = e.clientY;
        downTime = performance.now();
      } else if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      lastInteract = performance.now();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDist > 0) zoom((pinchDist - d) * 0.02);
        pinchDist = d;
        lastInteract = performance.now();
        return;
      }
      updateRepel(e, canvas);
      if (!dragging) return;
      var dx = e.clientX - px, dy = e.clientY - py;
      moved += Math.abs(dx) + Math.abs(dy);
      px = e.clientX; py = e.clientY;
      if (mode === 'earth') {
        eYaw -= dx * 0.005;
        ePitch = Math.max(-1.2, Math.min(1.2, ePitch + dy * 0.005));
      } else {
        pivot.rotation.y += dx * 0.0045;
        pivot.rotation.x = Math.max(-0.6, Math.min(0.8, pivot.rotation.x + dy * 0.0032));
      }
      lastInteract = performance.now();
    });

    function up(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (dragging && pointers.size === 0) {
        dragging = false;
        var quick = performance.now() - downTime < 500;
        if (quick && moved < 7) toggle();
      }
      lastInteract = performance.now();
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function () { repelLocal = null; });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom(e.deltaY * 0.012);
      lastInteract = performance.now();
    }, { passive: false });

    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      try { new ResizeObserver(resize).observe(canvas); } catch (e) {}
    }
  }

  function zoom(delta) {
    if (mode === 'earth') eDist = Math.max(4, Math.min(14, eDist * (1 + delta * 0.12)));
    else persp.position.z = Math.max(8, Math.min(26, persp.position.z + delta));
  }

  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var invMat = new THREE.Matrix4();
  var repelWorld = new THREE.Vector3();

  function updateRepel(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, persp);
    var center = new THREE.Vector3(0, 0, 0);
    pivot.localToWorld(center);
    var dist = center.distanceTo(persp.position);
    repelWorld.copy(raycaster.ray.direction).multiplyScalar(dist).add(raycaster.ray.origin);
    invMat.copy(pivot.matrixWorld).invert();
    repelLocal = repelWorld.clone().applyMatrix4(invMat);
  }

  function resize() {
    var canvas = renderer.domElement;
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    if (canvas.clientWidth === 0) { w = window.innerWidth; h = window.innerHeight; }
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    var now = performance.now();
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    NS.Morph.update(now, dt, repelLocal);
    NS.Earth.update(now, dt);

    if (trans) updateTransition(now);
    else if (mode === 'earth') applyEarthCamera();

    /* 太阳标记随银河淡入淡出 */
    if (sunMarker) sunMarker.material.opacity = 0.85 * NS.Morph.galaxyScale();

    /* 银河视角静止态整体缓慢自转 */
    if (mode === 'galaxy' && !trans && !reduceMotion) {
      pivot.rotation.y += 0.0006;
    }

    renderer.render(scene, persp);
  }

  NS.initStage = init;
})();
