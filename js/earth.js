/* =========================================================
   earth.js — 地球粒子化（Points，无外部资源）+ 地月系
   地形：真实大陆多边形（北美/南美/格陵兰/非洲/欧亚）+ 岛屿 + 荒漠
        + 极地冰盖/格陵兰冰原/北冰洋海冰，按纬度分层植被色
   三层：核心实心球（日/夜明暗）+ 云层（加色，沿纬度带）+ 大气辉光
   月球：粒子球（月海/高地 + 环形山亮斑），带轨道环，绕地公转
   由 morph.js 点击切换：银河收起 → 地球淡入并缓慢自转
   ========================================================= */
(function () {
  'use strict';

  var NS = (window.Lodolin3D = window.Lodolin3D || {});
  NS.Earth = NS.Earth || {};

  var group, spin, corePts, cloudPts, atmoPts;
  var orbit, moonPts, ringLine;
  var target = 0.02, scale = 0.02;   // 银河视角下缩成与粒子等大的小点
  var ORBIT_R = 5.4;
  /* 太阳系在银河系中的位置（猎户/本地臂上的大致坐标） */
  var SUN = { x: 6, y: 0, z: -3 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32(20261014);

  /* 球面均匀方向 */
  function dir() {
    var u = rand(-1, 1), ph = rand(0, Math.PI * 2);
    var rxy = Math.sqrt(Math.max(0, 1 - u * u));
    return { x: rxy * Math.cos(ph), y: rxy * Math.sin(ph), z: u };
  }

  /* ---------- 真实大陆多边形（经纬度顶点，粗略但可辨认的轮廓） ---------- */
  var NORTH_AMERICA = [[-168,65],[-158,70],[-145,70],[-128,72],[-115,73],[-100,73],[-88,72],[-78,74],[-68,76],[-56,64],[-55,52],[-60,47],[-66,44],[-74,40],[-76,35],[-80,31],[-82,27],[-81,25],[-90,29],[-96,28],[-97,22],[-94,18],[-90,14],[-84,11],[-81,8],[-78,7],[-77,9],[-83,11],[-88,14],[-92,16],[-96,20],[-100,22],[-105,24],[-112,26],[-118,30],[-124,34],[-130,40],[-138,50],[-150,58],[-162,63]];
  var SOUTH_AMERICA = [[-78,7],[-72,10],[-66,10],[-62,11],[-58,8],[-52,4],[-48,-2],[-40,-3],[-36,-8],[-38,-15],[-40,-22],[-48,-26],[-54,-34],[-58,-40],[-64,-46],[-68,-54],[-72,-52],[-74,-44],[-72,-40],[-70,-35],[-72,-30],[-70,-20],[-75,-15],[-80,-8],[-80,-2]];
  var GREENLAND = [[-58,76],[-50,82],[-42,82],[-32,78],[-38,68],[-52,60],[-56,64]];
  var AFRICA = [[-6,35],[-9,32],[-16,28],[-17,22],[-16,15],[-15,10],[-10,5],[-8,0],[9,2],[11,-5],[15,-10],[20,-15],[25,-18],[33,-22],[35,-28],[32,-34],[27,-34],[20,-35],[17,-30],[14,-25],[11,-20],[12,-15],[10,-8],[10,0],[12,6],[15,11],[20,15],[30,20],[34,25],[34,30],[32,33],[28,36],[22,36],[15,38],[5,37],[-1,36]];
  var EURASIA = [[-9,38],[-9,43],[-2,43],[3,43],[8,44],[12,44],[18,40],[22,37],[27,37],[30,38],[36,36],[40,33],[44,30],[50,27],[55,25],[58,23],[60,25],[65,25],[70,22],[75,20],[78,16],[80,10],[82,6],[84,4],[87,8],[90,12],[92,18],[94,22],[98,20],[100,14],[102,10],[105,8],[108,12],[112,18],[118,22],[122,24],[128,28],[135,32],[140,38],[142,45],[145,50],[150,55],[158,58],[165,60],[170,65],[178,66],[179,70],[170,72],[160,74],[150,74],[140,72],[130,72],[120,73],[110,74],[100,74],[90,74],[80,73],[70,72],[60,70],[50,68],[45,68],[40,65],[35,64],[30,60],[25,65],[20,64],[15,62],[10,60],[5,58],[0,55],[-5,50]];
  var LAND_POLYS = [NORTH_AMERICA, SOUTH_AMERICA, GREENLAND, AFRICA, EURASIA];

  /* 岛屿：[lon, lat, 半径°] */
  var ISLANDS = [[-18,65,3],[-2,53,3],[-8,53,2],[138,36,2],[140,39,1.5],[143,43,1.5],[131,31,1.5],[47,-19,3],[114,0,3],[100,0,2.5],[110,-7,2],[141,-5,3],[123,12,2.5],[172,-41,3],[-79,21.5,2],[-71,19,1.5],[81,7,1.2],[146,-42,1.5],[125,-9,1.5]];

  /* 荒漠：[lon, lat, 经向半径°, 纬向半径°] */
  var DESERTS = [[10,22,20,9],[46,22,9,6],[133,-24,13,6],[95,42,22,8],[-112,34,9,5],[22,-22,8,4],[-68,-46,9,5],[72,27,6,4]];

  var D2R = Math.PI / 180;

  function inside(lon, lat, poly) {
    var flag = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1];
      var xj = poly[j][0], yj = poly[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) flag = !flag;
    }
    return flag;
  }

  function isLand(lon, lat) {
    for (var p = 0; p < LAND_POLYS.length; p++) if (inside(lon, lat, LAND_POLYS[p])) return true;
    for (var k = 0; k < ISLANDS.length; k++) {
      var dLat = lat - ISLANDS[k][1];
      var dLon = (lon - ISLANDS[k][0]) * Math.cos(lat * D2R);
      if (dLat * dLat + dLon * dLon < ISLANDS[k][2] * ISLANDS[k][2]) return true;
    }
    return false;
  }

  function desertW(lon, lat) {
    var w = 0;
    for (var d = 0; d < DESERTS.length; d++) {
      var dLat = lat - DESERTS[d][1];
      var dLon = (lon - DESERTS[d][0]) * Math.cos(lat * D2R);
      w += Math.exp(-(dLat * dLat / (2 * DESERTS[d][3] * DESERTS[d][3]) + dLon * dLon / (2 * DESERTS[d][2] * DESERTS[d][2])));
    }
    return w;
  }

  /* ---------- 核心实心球：真实大陆 + 海洋 + 冰盖 + 日/夜明暗 ---------- */
  function buildCore(N) {
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var size = new Float32Array(N), norm = new Float32Array(N * 3);
    var R = 3.0;

    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      var d = dir();
      var lat = Math.asin(d.z) * 180 / Math.PI;
      var lon = Math.atan2(d.y, d.x) * 180 / Math.PI;
      var land = isLand(lon, lat);

      var antarctic = lat < -62;
      var arcticSeaIce = lat > 76 && !land;
      var greenland = inside(lon, lat, GREENLAND);
      var ice = antarctic || arcticSeaIce || greenland;

      var n = rng(), r, g, b;
      if (ice) { r = 0.94; g = 0.96; b = 1.0; }
      else if (land) {
        var dw = desertW(lon, lat);
        if (dw > 0.55) { r = 0.56 + 0.06 * n; g = 0.47 + 0.05 * n; b = 0.30 + 0.05 * n; }  // 荒漠
        else {
          var al = Math.abs(lat);
          if (al < 23.5)      { r = 0.22 + 0.08 * n; g = 0.50 + 0.06 * n; b = 0.22 + 0.04 * n; }  // 热带
          else if (al < 50)   { r = 0.34 + 0.08 * n; g = 0.50 + 0.05 * n; b = 0.24 + 0.04 * n; }  // 温带
          else                { r = 0.16 + 0.06 * n; g = 0.38 + 0.05 * n; b = 0.18 + 0.04 * n; }  // 泰加林
        }
      } else {
        var dd = Math.abs(lat) / 75;                                     // 纬度越高海越深
        r = 0.06 + 0.04 * n; g = 0.20 + 0.12 * (1 - dd); b = 0.48 + 0.22 * (1 - dd);
        if (r > 0.30) r = 0.30; if (g > 0.55) g = 0.55; if (b > 0.86) b = 0.86;
      }

      pos[i3] = d.x * R; pos[i3 + 1] = d.y * R; pos[i3 + 2] = d.z * R;
      norm[i3] = d.x; norm[i3 + 1] = d.y; norm[i3 + 2] = d.z;
      col[i3] = r; col[i3 + 1] = g; col[i3 + 2] = b;
      size[i] = rand(0.45, 0.7);
    }
    return { pos: pos, col: col, size: size, norm: norm };
  }

  /* ---------- 云层：沿纬度带聚集的加色白点 ---------- */
  function buildClouds(N) {
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    var R = 3.05;
    var bands = [-55, -30, 0, 20, 45, 60];
    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      var band = bands[(Math.random() * bands.length) | 0];
      var lat = (band + gauss() * 11) * Math.PI / 180;
      var lon = Math.random() * Math.PI * 2;
      var x = Math.cos(lat) * Math.cos(lon);
      var y = Math.sin(lat);
      var z = Math.cos(lat) * Math.sin(lon);
      var rad = rand(0.995, 1.015);
      pos[i3] = x * R * rad; pos[i3 + 1] = y * R * rad; pos[i3 + 2] = z * R * rad;
      var v = 0.55 + Math.random() * 0.4;
      col[i3] = v; col[i3 + 1] = v * 0.98; col[i3 + 2] = v * 1.05;
      size[i] = rand(0.85, 1.35);
    }
    return { pos: pos, col: col, size: size };
  }

  /* ---------- 大气辉光：淡蓝外壳 ---------- */
  function buildAtmo(N) {
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    var R = 3.26;
    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      var d = dir();
      pos[i3] = d.x * R; pos[i3 + 1] = d.y * R; pos[i3 + 2] = d.z * R;
      var v = 0.14 + Math.random() * 0.12;
      col[i3] = v * 0.6; col[i3 + 1] = v; col[i3 + 2] = v * 1.8;
      size[i] = rand(1.6, 2.3);
    }
    return { pos: pos, col: col, size: size };
  }

  /* ---------- 月球：月海/高地 + 环形山亮斑（近地面朝地球，潮汐锁定） ---------- */
  function buildMoon(N) {
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var size = new Float32Array(N), norm = new Float32Array(N * 3);
    var R = 0.85;
    /* 月海：近地面（-x 半球）不规则暗斑，r 为角半径(rad) */
    var maria = [
      { x: -0.55, y: 0.30, z: 0.45, r: 0.55 },
      { x: -0.50, y: -0.25, z: -0.50, r: 0.50 },
      { x: -0.75, y: 0.10, z: -0.25, r: 0.45 },
      { x: -0.40, y: 0.55, z: -0.20, r: 0.50 },
      { x: -0.30, y: -0.50, z: 0.35, r: 0.48 },
      { x: -0.65, y: -0.10, z: 0.45, r: 0.42 },
      { x: -0.20, y: 0.05, z: -0.30, r: 0.40 }
    ];
    for (var i = 0; i < N; i++) {
      var i3 = i * 3;
      var d = dir();
      var isMaria = false;
      for (var m = 0; m < maria.length; m++) {
        var mx = maria[m].x, my = maria[m].y, mz = maria[m].z;
        var ml = Math.sqrt(mx * mx + my * my + mz * mz);
        var dot = (d.x * mx + d.y * my + d.z * mz) / ml;
        if (dot > Math.cos(maria[m].r)) { isMaria = true; break; }
      }
      var n = rng();
      var r, g, b;
      if (isMaria) { r = 0.40 + 0.04 * n; g = 0.40 + 0.04 * n; b = 0.42 + 0.04 * n; }  // 月海
      else { r = 0.70 + 0.06 * n; g = 0.70 + 0.06 * n; b = 0.72 + 0.06 * n; }        // 高地
      if (rng() < 0.04) { r = 0.90; g = 0.90; b = 0.92; }                            // 亮斑环形山
      pos[i3] = d.x * R; pos[i3 + 1] = d.y * R; pos[i3 + 2] = d.z * R;
      norm[i3] = d.x; norm[i3 + 1] = d.y; norm[i3 + 2] = d.z;
      col[i3] = r; col[i3 + 1] = g; col[i3 + 2] = b;
      size[i] = rand(0.14, 0.22);
    }
    return { pos: pos, col: col, size: size, norm: norm };
  }

  /* ---------- 着色器 ---------- */
  /* 实心核心：表面法线 + 定向光，做日/夜明暗 */
  function solidShader() {
    return {
      vertex: [
        'attribute float psize;',
        'attribute vec3 color;',
        'attribute vec3 anormal;',
        'varying vec3 vColor;',
        'varying float vLight;',
        'uniform float uScale;',
        'uniform vec3 uLightDir;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = psize * uScale * (150.0 / -mv.z);',
        '  vec3 wn = normalize(normalMatrix * anormal);',
        '  vLight = 0.22 + 0.85 * max(0.0, dot(wn, uLightDir));',
        '  vColor = color;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragment: [
        'varying vec3 vColor;',
        'varying float vLight;',
        'void main() {',
        '  vec2 d = gl_PointCoord - vec2(0.5);',
        '  float r = length(d) * 2.0;',
        '  float a = smoothstep(1.0, 0.55, r);',
        '  if (a < 0.02) discard;',
        '  gl_FragColor = vec4(vColor * vLight, a);',
        '}'
      ].join('\n')
    };
  }
  /* 加色柔光（云层/大气） */
  function glowShader() {
    return {
      vertex: [
        'attribute float psize;',
        'attribute vec3 color;',
        'varying vec3 vColor;',
        'uniform float uScale;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = psize * uScale * (150.0 / -mv.z);',
        '  vColor = color;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragment: [
        'varying vec3 vColor;',
        'void main() {',
        '  vec2 d = gl_PointCoord - vec2(0.5);',
        '  float r2 = dot(d, d) * 4.0;',
        '  float a = exp(-r2 * 2.5);',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(vColor, a);',
        '}'
      ].join('\n')
    };
  }

  function makePoints(d, sh, opts) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(d.size, 1));
    if (d.norm) geo.setAttribute('anormal', new THREE.BufferAttribute(d.norm, 3));
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: !!opts.depthWrite,
      depthTest: true,
      blending: opts.blending || THREE.NormalBlending,
      uniforms: { uScale: { value: 1 }, uLightDir: { value: new THREE.Vector3(0.5, 0.3, 0.75).normalize() } },
      vertexShader: sh.vertex,
      fragmentShader: sh.fragment
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = opts.renderOrder || 0;
    return pts;
  }

  function build() {
    group = new THREE.Group();
    group.position.set(SUN.x, SUN.y, SUN.z);   // 太阳系位于银河本地臂
    group.rotation.z = 0.41;              // 地轴倾角 ≈ 23.4°
    group.scale.setScalar(0.02);          // 银河视角下缩成与粒子等大的小点
    group.visible = true;

    spin = new THREE.Group();
    group.add(spin);

    corePts = makePoints(buildCore(26000), solidShader(), { depthWrite: true, blending: THREE.NormalBlending, renderOrder: 1 });
    spin.add(corePts);

    cloudPts = makePoints(buildClouds(5600), glowShader(), { depthWrite: false, blending: THREE.AdditiveBlending, renderOrder: 2 });
    spin.add(cloudPts);

    atmoPts = makePoints(buildAtmo(3400), glowShader(), { depthWrite: false, blending: THREE.AdditiveBlending, renderOrder: 3 });
    spin.add(atmoPts);

    /* 月球轨道：轨道面约 5° 倾斜，绕地公转 */
    orbit = new THREE.Group();
    orbit.rotation.x = 0.09;
    group.add(orbit);

    var ringPts = [];
    for (var a = 0; a < 129; a++) {
      var t = a / 128 * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(t) * ORBIT_R, 0, Math.sin(t) * ORBIT_R));
    }
    ringLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0x8a9bb0, transparent: true, opacity: 0.3 })
    );
    ringLine.renderOrder = 2;
    orbit.add(ringLine);

    moonPts = makePoints(buildMoon(4200), solidShader(), { depthWrite: true, blending: THREE.NormalBlending, renderOrder: 1 });
    moonPts.position.x = ORBIT_R;
    orbit.add(moonPts);

    return group;
  }

  function setShown(on) { target = on ? 1 : 0.02; }
  function isShown() { return target > 0.5; }

  function update(now, dt) {
    if (!group) return;
    scale += (target - scale) * Math.min(1, dt * 3.4);
    group.scale.setScalar(scale);
    group.visible = scale > 0.0005;
    if (scale > 0.5) {
      spin.rotation.y += dt * 0.06;   // 地球自转
      orbit.rotation.y += dt * 0.10;  // 月球绕地公转
    }
  }

  NS.Earth = {
    build: build,
    update: update,
    setShown: setShown,
    isShown: isShown,
    sunPos: function () { return SUN; }
  };
})();
