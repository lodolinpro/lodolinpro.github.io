/* =========================================================
   camera3d.js — ZV-E10 + 腾龙 B070 装配态建模（按用户实物照）
   实物特征：SmallRig 兔笼、白色快门钮、花瓣遮光罩、
   17/35/50/70 变焦刻度、TAMRON 字样、颗粒蒙皮、背带
   比例尺：1 单位 = 25mm
   ========================================================= */
(function () {
  'use strict';

  var NS = (window.Lodolin3D = window.Lodolin3D || {});

  var geoCache = {};
  function cachedGeo(key, factory) {
    if (!geoCache[key]) geoCache[key] = factory();
    return geoCache[key];
  }

  /* ---------------- 材质 ---------------- */

  function makeMats() {
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.6, metalness: 0.28 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.95, metalness: 0.04 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.3, metalness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7, metalness: 0.2 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.5, metalness: 0.35 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.94, metalness: 0.03 }),
      screen: new THREE.MeshStandardMaterial({ color: 0x12141a, roughness: 0.35, metalness: 0.25, emissive: 0x23232c, emissiveIntensity: 0.3 }),
      rec: new THREE.MeshStandardMaterial({ color: 0xe5684f, emissive: 0xe5684f, emissiveIntensity: 0.55, roughness: 0.4 }),
      lensGlass: new THREE.MeshPhysicalMaterial({
        color: 0x0a0f1a, metalness: 0.1, roughness: 0.08,
        clearcoat: 1.0, clearcoatRoughness: 0.05,
        emissive: 0x101b30, emissiveIntensity: 0.45
      }),
      hood: new THREE.MeshStandardMaterial({ color: 0x131316, roughness: 0.78, metalness: 0.1, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: 0xe9e9ec, roughness: 0.35, metalness: 0.1 }),
      cage: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.48, metalness: 0.72 }),
    };
  }

  /* ---------------- 造型辅助 ---------------- */

  function box(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(cachedGeo('b' + w + '_' + h + '_' + d, function () {
      return new THREE.BoxGeometry(w, h, d);
    }), mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  function cyl(rt, rb, h, seg, mat, x, y, z, axis) {
    var m = new THREE.Mesh(cachedGeo('c' + rt + '_' + rb + '_' + h + '_' + seg, function () {
      return new THREE.CylinderGeometry(rt, rb, h, seg);
    }), mat);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    else if (axis !== 'y') m.rotation.x = Math.PI / 2;
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  function sphere(r, mat, x, y, z) {
    var m = new THREE.Mesh(cachedGeo('s' + r, function () {
      return new THREE.SphereGeometry(r, 16, 12);
    }), mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  /* 白字贴片（SONY / SmallRig / TAMRON / 焦段刻度） */
  function textPlane(text, w, h, fontSize, color) {
    var cv = document.createElement('canvas');
    cv.width = 512; cv.height = Math.max(48, Math.round(512 * h / w));
    var cx = cv.getContext('2d');
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.fillStyle = color || '#eef0f3';
    cx.font = '700 ' + fontSize + 'px Arial, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(text, cv.width / 2, cv.height / 2);
    var tex = new THREE.CanvasTexture(cv);
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    return m;
  }

  /* 花瓣遮光罩：旋转成型 + 花瓣形顶点调制 */
  function petalHood(mat, z) {
    var prof = [[1.34, 0], [1.40, 0.10], [1.60, 0.44], [1.80, 0.74], [1.93, 0.93], [1.97, 1.0]];
    var pts = [];
    for (var i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(prof[i][0], prof[i][1]));
    var geo = new THREE.LatheGeometry(pts, 64);
    var pa = geo.attributes.position;
    for (var k = 0; k < pa.count; k++) {
      var vx = pa.getX(k), vy = pa.getY(k), vz = pa.getZ(k);
      var th = Math.atan2(vz, vx);
      var t = Math.max(0, vy);
      var f = 1 + (0.15 * Math.cos(2 * th) + 0.04 * Math.cos(th)) * t;
      pa.setX(k, vx * f);
      pa.setZ(k, vz * f);
    }
    geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 0, z);
    return m;
  }



  /* ---------------- 整机建模 ----------------
     镜头朝 +Z，卡口面 z0 = DS/2。
  --------------------------------------------- */

  function buildCameraModel() {
    var mats = makeMats();
    var root = new THREE.Group();
    var body = new THREE.Group();
    var lensGrp = new THREE.Group();
    root.add(body);
    root.add(lensGrp);

    var W = 4.6, H = 2.56, DS = 1.3;

    /* ---------- 机身 ---------- */
    body.add(box(W, H, DS, mats.body, 0, 0, 0));
    body.add(box(W * 0.96, 0.12, DS * 0.9, mats.dark, 0, -H / 2 - 0.05, 0));

    /* 手柄（右侧，颗粒蒙皮质感） */
    var gripGrp = new THREE.Group();
    gripGrp.add(box(1.15, H - 1.15, 1.7, mats.grip, 0, 0, -0.25));
    gripGrp.add(cyl(0.575, 0.575, 1.7, 24, mats.grip, 0, (H - 1.15) / 2, -0.25));
    gripGrp.add(cyl(0.575, 0.575, 1.7, 24, mats.grip, 0, -(H - 1.15) / 2, -0.25));
    gripGrp.position.set(W / 2 - 0.575, 0, 0);
    body.add(gripGrp);

    /* 白色快门钮 + REC 红点 + C1 键（照片特征） */
    body.add(cyl(0.2, 0.22, 0.1, 20, mats.white, W / 2 - 0.55, H / 2 + 0.12, 0.35, 'y'));
    body.add(sphere(0.085, mats.rec, W / 2 - 0.55, H / 2 + 0.12, 0.75));
    body.add(box(0.22, 0.08, 0.3, mats.dark, W / 2 - 1.35, H / 2 + 0.11, 0.5));

    /* 模式拨盘（左肩，兔笼外露） */
    body.add(cyl(0.5, 0.5, 0.16, 28, mats.dark, -2.0, H / 2 + 0.2, 0.1, 'y'));
    var dialRing = new THREE.Mesh(cachedGeo('ring_dial', function () {
      return new THREE.TorusGeometry(0.5, 0.05, 10, 32);
    }), mats.silver);
    dialRing.rotation.x = Math.PI / 2;
    dialRing.position.set(-2.0, H / 2 + 0.27, 0.1);
    body.add(dialRing);

    /* 三胶囊麦克风平台（顶面前缘，兔笼板前方） */
    body.add(box(2.7, 0.26, 0.5, mats.body, 0, H / 2 + 0.2, 0.55));
    var mi;
    for (mi = 0; mi < 3; mi++) {
      body.add(cyl(0.12, 0.12, 0.05, 16, mats.dark, -0.8 + mi * 0.8, H / 2 + 0.2, 0.81));
    }

    /* 背屏（合拢态）+ 背面按键 */
    body.add(box(2.9, 1.85, 0.05, mats.dark, -0.6, 0.15, -DS / 2 - 0.02));
    body.add(box(2.6, 1.55, 0.05, mats.screen, -0.6, 0.15, -DS / 2 - 0.055));
    body.add(box(0.26, 0.4, 0.06, mats.dark, 1.75, 0.55, -DS / 2 - 0.05));
    body.add(box(0.26, 0.4, 0.06, mats.dark, 1.75, 0.05, -DS / 2 - 0.05));

    /* 正面 SONY 铭牌（照片同款白字） */
    var sony = textPlane('SONY', 0.85, 0.2, 150);
    sony.position.set(-1.45, 0.62, DS / 2 + 0.03);
    body.add(sony);
    body.add(box(0.04, 1.1, 0.75, mats.dark, -W / 2 - 0.02, 0.05, 0));

    /* ---------- SmallRig 兔笼（照片特征） ---------- */
    // 顶板（盖住热靴区，前缘印 SmallRig）
    body.add(box(2.9, 0.09, 1.3, mats.cage, -0.3, H / 2 + 0.26, -0.35));
    var sr = textPlane('SmallRig', 0.95, 0.15, 120);
    sr.position.set(-0.3, H / 2 + 0.265, 0.32);
    body.add(sr);
    // 左右侧板 + 底板
    body.add(box(0.06, 3.1, 1.7, mats.cage, -W / 2 - 0.05, 0.15, -0.1));
    body.add(box(0.06, 3.1, 1.7, mats.cage, W / 2 + 0.05, 0.15, -0.25));
    body.add(box(3.5, 0.08, 1.8, mats.cage, 0.1, -H / 2 - 0.14, -0.1));
    // 右侧板孔位
    var hi;
    for (hi = 0; hi < 3; hi++) {
      body.add(cyl(0.07, 0.07, 0.03, 12, mats.dark, W / 2 + 0.09, 0.55 - hi * 0.45, -0.25, 'x'));
    }

    /* ---------- 背带（左右两条垂落） ---------- */



    /* ---------- 镜头：腾龙 B070 装配态 ---------- */
    var z0 = DS / 2;

    // 卡口银环（照片中醒目的镀铬环）
    lensGrp.add(cyl(1.06, 1.06, 0.16, 32, mats.silver, 0, 0, z0 + 0.02));

    // 尾筒
    lensGrp.add(cyl(1.3, 1.3, 0.5, 36, mats.lens, 0, 0, z0 + 0.37));

    // 变焦环（最大径，橡胶颗粒纹理）
    lensGrp.add(cyl(1.49, 1.49, 1.0, 36, mats.rubber, 0, 0, z0 + 1.12));
    lensGrp.add(cyl(1.505, 1.505, 0.045, 36, mats.lens, 0, 0, z0 + 0.75));
    lensGrp.add(cyl(1.505, 1.505, 0.045, 36, mats.lens, 0, 0, z0 + 1.49));

    // 变焦刻度：白色指数线 + 环周银点
    lensGrp.add(cyl(0.026, 0.026, 0.016, 10, mats.white, 0, 1.5, z0 + 0.68));
    var ti;
    for (ti = 0; ti < 8; ti++) {
      var ta = ti * Math.PI / 4;
      lensGrp.add(cyl(0.02, 0.02, 0.012, 8, mats.silver, Math.cos(ta) * 1.5, Math.sin(ta) * 1.5, z0 + 0.68));
    }
    // 焦段数字（17 35 50 70，照片同款）
    var focal = textPlane('17   35   50   70', 0.78, 0.16, 92);
    focal.rotation.x = -Math.PI / 2;
    focal.position.set(0, 1.503, z0 + 1.12);
    lensGrp.add(focal);

    // 中筒 + TAMRON 字样（沿镜身轴向，照片同款）
    lensGrp.add(cyl(1.45, 1.45, 1.38, 36, mats.lens, 0, 0, z0 + 2.31));
    var tamron = textPlane('TAMRON  17-70mm  F/2.8', 1.7, 0.26, 76);
    tamron.rotation.x = -Math.PI / 2;
    tamron.position.set(0, 1.462, z0 + 2.35);
    lensGrp.add(tamron);
    // 侧面 AF/MF 拨杆
    lensGrp.add(box(0.1, 0.16, 0.36, mats.dark, -1.5, 0, z0 + 2.35));

    // 银色装饰环（腾龙签名环）
    lensGrp.add(cyl(1.475, 1.475, 0.25, 36, mats.silver, 0, 0, z0 + 3.15));

    // 对焦环
    lensGrp.add(cyl(1.42, 1.42, 0.9, 36, mats.rubber, 0, 0, z0 + 3.7));

    // 前锥收口 + 滤镜口 + 前镜片
    lensGrp.add(cyl(1.34, 1.42, 0.35, 36, mats.lens, 0, 0, z0 + 4.32));
    lensGrp.add(cyl(1.34, 1.34, 0.1, 36, mats.dark, 0, 0, z0 + 4.5));
    lensGrp.add(cyl(1.26, 1.26, 0.06, 36, mats.lensGlass, 0, 0, z0 + 4.56));

    // 花瓣遮光罩（照片特征，罩在前面）
    lensGrp.add(petalHood(mats.hood, z0 + 4.6));

    return {
      root: root, body: body, lensGrp: lensGrp, mats: mats,
      dims: { W: W, H: H, DS: DS, frontZ: z0 + 5.6 }
    };
  }

  NS.buildCameraModel = buildCameraModel;
})();
