/* =========================================================
   galaxy.js — 银河系 SBbc 粒子生成（写实重构 v2，单形态）
   中心：盒状/花生核球 + 细长棒（棒角 25°）+ Sgr A* 亮核
   旋臂：四主臂自棒两端发出（英仙臂 / 盾牌-半人马臂 / 矩尺臂 / 人马臂）
         + 本地臂刺（猎户-天鹅支臂，太阳所在），对数螺线 pitch≈18°
   盘：薄盘（年轻蓝白，内暖外蓝径向梯度）+ 厚盘（年老偏橙）
   尘埃：臂内缘暗带 + 核区尘埃环 + 中央分子环（3.5-5kpc）
   晕：球状星团 + 晕族恒星；外盘翘曲与张角
   ========================================================= */
(function () {
  'use strict';

  var NS = (window.Lodolin3D = window.Lodolin3D || {});
  NS.Galaxy = NS.Galaxy || {};

  function rand(a, b) { return a + Math.random() * (b - a); }
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /* 指数盘径向采样：内密外疏 */
  function discR() { return -Math.log(1 - Math.random() * 0.965); }

  function buildMilkyway(N) {
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);

    /* 视角：近正对俯视（倾角 ~22°，b/a≈0.93）+ 轻微滚转 14°，四臂与棒最清楚 */
    var CX = 0.93, SX = 0.37;
    var CZ = 0.97, SZ = 0.24;

    var BAR_ANG = 0.44, cosB = Math.cos(BAR_ANG), sinB = Math.sin(BAR_ANG);
    var A_BAR = 2.25;

    /* 四主臂：自棒两端发出，臂长/缠绕角各不相同（真实银河系四臂不对称） */
    var armDefs = [
      { root: BAR_ANG,           wrap: 4.7, rEnd: 10.6, off: 0.00 },  // 英仙臂（外、长）
      { root: BAR_ANG + Math.PI, wrap: 4.7, rEnd: 10.3, off: 0.10 },  // 盾牌-半人马臂
      { root: BAR_ANG,           wrap: 5.4, rEnd: 9.1,  off: -0.14 }, // 矩尺臂（内、短）
      { root: BAR_ANG + Math.PI, wrap: 5.2, rEnd: 9.4,  off: 0.22 }   // 人马臂
    ];
    /* 本地臂刺（猎户-天鹅支臂）：人马与英仙之间的短刺，太阳所在 */
    var LOCAL = { root: BAR_ANG + Math.PI * 0.5, wrap: 5.0, rEnd: 8.6, off: 0.35 };

    function armPoint(ad, t) {
      var th = ad.root + ad.off + t * ad.wrap;
      var r = A_BAR + t * (ad.rEnd - A_BAR);
      return { th: th, r: r };
    }
    function pickArm() { return armDefs[(Math.random() * armDefs.length) | 0]; }
    function armRand(tMin, tMax) { return armPoint(pickArm(), rand(tMin, tMax)); }

    /* 预生成 HII / OB 锚点（沿臂分布）与球状星团 */
    var hii = [], ob = [], gc = [];
    for (var h = 0; h < 24; h++) hii.push(armRand(0.1, 0.9));
    for (var o = 0; o < 18; o++) ob.push(armRand(0.12, 0.9));
    for (var g = 0; g < 28; g++) {
      var aa = rand(0, Math.PI * 2), ph2 = Math.acos(rand(-0.7, 0.7)), rr = rand(4.5, 13);
      gc.push({ x: Math.cos(aa) * Math.cos(ph2) * rr, z: Math.sin(aa) * Math.cos(ph2) * rr, y: Math.sin(ph2) * rr * 0.65 });
    }

    for (var i = 0; i < N; i++) {
      var i3 = i * 3, u = Math.random(), x, y, z, cr, cg, cb, s;

      if (u < 0.06) {
        /* 盒状/花生核球（中心密集、暖黄，三轴沿棒方向拉长） */
        var bx = gauss() * 1.6, bz = gauss() * 0.98, by = gauss() * 0.66;
        x = bx * cosB - bz * sinB;
        z = bx * sinB + bz * cosB;
        y = by;
        var kc = Math.min(1, Math.sqrt(bx * bx + bz * bz) / 1.75);
        cr = 1.0; cg = 0.91 - kc * 0.05; cb = 0.68 - kc * 0.14;
        s = rand(0.6, 1.7);
      } else if (u < 0.145) {
        /* 细长棒（穿过核球，棒角 25°，端部略厚） */
        var ax = gauss() * 2.4, az = gauss() * 0.6;
        var ay = gauss() * (0.24 + 0.17 * Math.min(1, Math.abs(ax) / 2.4));
        x = ax * cosB - az * sinB;
        z = ax * sinB + az * cosB;
        y = ay;
        var kb = Math.min(1, Math.sqrt(ax * ax + az * az) / 2.55);
        cr = 1.0; cg = 0.88 - kb * 0.06; cb = 0.64 - kb * 0.11;
        s = rand(0.6, 1.8);
      } else if (u < 0.16) {
        /* 核区：核盘 + Sgr A*（8% 概率做成超大白点） */
        if (Math.random() < 0.08) {
          x = gauss() * 0.04; z = gauss() * 0.04; y = gauss() * 0.03;
          cr = 1.0; cg = 1.0; cb = 0.98; s = rand(3.0, 3.8);
        } else {
          var rn = Math.abs(gauss()) * 0.34;
          var tn = Math.random() * Math.PI * 2;
          x = Math.cos(tn) * rn; z = Math.sin(tn) * rn; y = gauss() * 0.08;
          cr = 1.0; cg = 0.94; cb = 0.80; s = rand(0.9, 2.0);
        }
      } else if (u < 0.40) {
        /* 四主臂：对数螺线，臂亮中段、两端渐淡 */
        var ad = pickArm();
        var t = Math.pow(Math.random(), 0.72);
        var ap = armPoint(ad, t);
        var rr = ap.r + gauss() * (0.2 + t * 0.6);
        var th = ap.th + gauss() * 0.13;
        x = Math.cos(th) * rr; z = Math.sin(th) * rr;
        y = gauss() * (0.09 + t * 0.28);
        var prof = Math.exp(-Math.pow((t - 0.45) / 0.3, 2)) * 0.68 + 0.5;
        cr = 0.72 + 0.26 * prof; cg = 0.82 + 0.14 * prof; cb = 1.0;
        if (Math.random() < 0.08) { cr = 0.96; cg = 0.82; cb = 0.62; }
        s = rand(0.42, 1.25);
      } else if (u < 0.435) {
        /* 本地臂刺（猎户-天鹅支臂，太阳所在） */
        var tL = rand(0.35, 0.85);
        var apL = armPoint(LOCAL, tL);
        var rrL = apL.r + gauss() * (0.24 + tL * 0.5);
        var thL = apL.th + gauss() * 0.13;
        x = Math.cos(thL) * rrL; z = Math.sin(thL) * rrL;
        y = gauss() * (0.09 + tL * 0.26);
        cr = 0.78; cg = 0.87; cb = 1.0; s = rand(0.4, 1.0);
      } else if (u < 0.46) {
        /* 臂间分支毛刺 */
        var ad2 = pickArm();
        var t2 = rand(0.3, 0.8);
        var ap2 = armPoint(ad2, t2);
        var fork = (Math.random() < 0.5 ? 1 : -1) * rand(0.2, 0.5);
        var rr2 = ap2.r + gauss() * (0.28 + t2 * 0.5);
        var th2 = ap2.th + fork + gauss() * 0.13;
        x = Math.cos(th2) * rr2; z = Math.sin(th2) * rr2;
        y = gauss() * (0.1 + t2 * 0.3);
        cr = 0.74; cg = 0.84; cb = 0.98; s = rand(0.4, 1.0);
      } else if (u < 0.53) {
        /* HII 造星区（粉红斑块沿臂） */
        var a1 = hii[(Math.random() * hii.length) | 0];
        x = Math.cos(a1.th) * a1.r + gauss() * 0.34; z = Math.sin(a1.th) * a1.r + gauss() * 0.34; y = gauss() * 0.18;
        cr = 1.0; cg = 0.40 + rand(-0.05, 0.14); cb = 0.5 + rand(-0.07, 0.18);
        s = rand(0.65, 1.6);
      } else if (u < 0.58) {
        /* OB 星协（蓝亮团块）+ 少量红超巨星团（盾牌臂方向更暖） */
        var a2 = ob[(Math.random() * ob.length) | 0];
        x = Math.cos(a2.th) * a2.r + gauss() * 0.3; z = Math.sin(a2.th) * a2.r + gauss() * 0.3; y = gauss() * 0.18;
        if (Math.random() < 0.18) { cr = 1.0; cg = 0.62; cb = 0.5; s = rand(1.0, 2.1); }
        else { cr = 0.7; cg = 0.83; cb = 1.0; s = rand(0.85, 1.9); }
      } else if (u < 0.66) {
        /* 尘埃：臂内缘暗带 + 核区尘埃环 + 中央分子环（3.5-5kpc） */
        var rnd = Math.random();
        if (rnd < 0.66) {
          var ad3 = pickArm();
          var t3 = rand(0.1, 0.95);
          var ap3 = armPoint(ad3, t3);
          var rr3 = ap3.r * 0.94 + gauss() * (0.12 + t3 * 0.28);
          var th3 = ap3.th - 0.2 + gauss() * 0.08;
          x = Math.cos(th3) * rr3; z = Math.sin(th3) * rr3;
          y = gauss() * 0.09;
        } else if (rnd < 0.82) {
          var tr = rand(0, Math.PI * 2), rr4 = rand(3.5, 5.0);
          x = Math.cos(tr) * rr4; z = Math.sin(tr) * rr4; y = gauss() * 0.07;
        } else {
          var tr2 = rand(0, Math.PI * 2), rr5 = rand(0.55, 0.95);
          x = Math.cos(tr2) * rr5; z = Math.sin(tr2) * rr5; y = gauss() * 0.05;
        }
        cr = 0.28; cg = 0.15; cb = 0.10; s = rand(0.7, 1.7);
      } else if (u < 0.82) {
        /* 薄盘场星（年轻蓝白，极薄，内暖外蓝的径向梯度） */
        var th4 = Math.random() * Math.PI * 2, r3 = Math.min(10.4, 0.6 + discR() * 5.5);
        x = Math.cos(th4) * r3; z = Math.sin(th4) * r3; y = gauss() * 0.11;
        var rr3n = Math.min(1, r3 / 10);
        cr = 0.86 + 0.1 * rr3n; cg = 0.82 + 0.14 * rr3n; cb = 0.78 + 0.22 * rr3n;
        s = rand(0.35, 0.95);
      } else if (u < 0.905) {
        /* 厚盘（年老偏橙，标高更高） */
        var th6 = Math.random() * Math.PI * 2, r5 = Math.min(9.2, 0.8 + discR() * 4.9);
        x = Math.cos(th6) * r5; z = Math.sin(th6) * r5; y = gauss() * 0.58;
        cr = 1.0; cg = 0.8; cb = 0.55; s = rand(0.4, 1.0);
      } else if (u < 0.96) {
        /* 球状星团（晕内暖点，向中心聚拢） */
        var a4 = gc[(Math.random() * gc.length) | 0];
        x = a4.x + gauss() * 0.2; y = a4.y + gauss() * 0.2; z = a4.z + gauss() * 0.2;
        cr = 1.0; cg = 0.88; cb = 0.66; s = rand(0.6, 1.5);
      } else {
        /* 恒星晕（金属贫，稀疏散布，半径大） */
        var th5 = Math.random() * Math.PI * 2, r6 = rand(5.5, 14.5);
        x = Math.cos(th5) * r6; z = Math.sin(th5) * r6; y = gauss() * 1.5;
        cr = 0.55; cg = 0.6; cb = 0.78; s = rand(0.28, 0.68);
      }

      /* 外盘翘曲与张角（r>5 起，随半径增强） */
      var rr2 = Math.sqrt(x * x + z * z);
      if (rr2 > 5) y += 0.32 * Math.pow((rr2 - 5) / 5, 2) * Math.sin(2 * Math.atan2(z, x) + 0.6);

      /* 烘焙倾角与滚转 */
      var y1 = y * CX - z * SX, z1 = y * SX + z * CX;
      var x2 = x * CZ - y1 * SZ, y2 = x * SZ + y1 * CZ;
      pos[i3] = x2; pos[i3 + 1] = y2; pos[i3 + 2] = z1;

      var v = 0.5 + Math.random() * 0.42;
      col[i3] = cr * v; col[i3 + 1] = cg * v; col[i3 + 2] = cb * v;
      size[i] = s;
    }
    return { pos: pos, col: col, size: size };
  }
  NS.Galaxy.buildMilkyway = buildMilkyway;
})();
