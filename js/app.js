/* =========================================================
   app.js — 星河舞台装配 + 作品集路由
   双视图：星河（银河系单形态）/ 作品集（沧野式一屏一品）
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* JS 就绪标记（作品入场动画依赖） */
  document.documentElement.classList.add('js');

  /* ---------------- Toast ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------------- 导航液态玻璃滑块 ---------------- */

  var moveNavGlider = null;

  function initNavGlider() {
    var nav = document.querySelector('.nav-capsule');
    if (!nav) return;
    var glider = nav.querySelector('.nav-glider');
    if (!glider) return;
    moveNavGlider = function () {
      var a = nav.querySelector('.tab.is-active');
      if (!a) return;
      glider.style.width = (a.offsetWidth + 20) + 'px';
      glider.style.transform = 'translateX(' + (a.offsetLeft - 10) + 'px)';
    };
    moveNavGlider();
    window.addEventListener('resize', moveNavGlider);
    window.addEventListener('load', moveNavGlider);
  }

  /* ---------------- 双视图路由 ---------------- */

  var VIEWS = ['camera', 'gear', 'works'];

  function go(name) {
    if (VIEWS.indexOf(name) < 0) name = 'camera';
    var tabs = document.querySelectorAll('[data-nav]');
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t.getAttribute('data-nav') === name;
      t.classList.toggle('is-active', on);
      if (t.getAttribute('role') === 'tab') t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    VIEWS.forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.classList.toggle('is-active', v === name);
    });
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
    /* 导航玻璃滑块滑到新激活的标签 */
    if (moveNavGlider) moveNavGlider();
    /* 切到作品集后重定位筛选条滑块（display:none 时量不到宽度） */
    if (name === 'works') {
      requestAnimationFrame(function () {
        window.dispatchEvent(new Event('resize'));
      });
    }
  }

  function initRouter() {
    var tabs = document.querySelectorAll('[data-nav]');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        go(t.getAttribute('data-nav'));
      });
    });
    /* 深链：#works / #gear 直达 */
    if (location.hash.indexOf('works') >= 0) go('works');
    else if (location.hash.indexOf('gear') >= 0) go('gear');
  }

  /* ---------------- 作品集：入场动画 + 形态跳转 ---------------- */

  function initWorks() {
    /* 滚动到位才浮起（沧野式 cayRise） */
    var works = document.querySelectorAll('.work');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('is-in');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.15 });
      Array.prototype.forEach.call(works, function (w) { io.observe(w); });
    } else {
      Array.prototype.forEach.call(works, function (w) { w.classList.add('is-in'); });
    }

    /* 「去星河里看看」：切到星河页并飞回银河视角 */
    var btns = document.querySelectorAll('[data-goto-shape]');
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.getAttribute('data-goto-shape'));
        try {
          if (window.Lodolin3D && window.Lodolin3D.goShape) window.Lodolin3D.goShape(i);
        } catch (e) { console.error(e); }
        go('camera');
      });
    });
  }

  /* ---------------- 3D 舞台 ---------------- */

  function initStage() {
    try {
      window.Lodolin3D.initStage($('stage'));
      window.Lodolin3D.onStateChange(function (info) {
        var name = $('shape-name');
        var sub = $('shape-sub');
        var hero = document.querySelector('.hero-title');
        var names = { milkyway: '银河系', earth: '地球' };
        var subs = {
          milkyway: 'MILKY WAY · 直径约 10 万光年 · SBbc 棒旋星系',
          earth: 'EARTH · 第三行星 · 直径约 1.27 万公里'
        };
        if (info && info.shape) {
          if (name) name.textContent = names[info.shape] || info.shape;
          if (sub) sub.textContent = subs[info.shape] || '';
          /* 形态确定时重放大标题浮起动画（沧野式入场） */
          if (hero && !info.morphing) {
            hero.classList.remove('is-rising');
            void hero.offsetWidth;
            hero.classList.add('is-rising');
          }
        }
      });
    } catch (e) {
      console.error(e);
      toast('3D 加载失败：' + e.message);
    }
  }

  /* ---------------- 作品集：分类筛选（液态玻璃滑块跟随选中项） ---------------- */

  function initFilter() {
    var bar = document.querySelector('.works-filter');
    if (!bar) return;
    var chips = bar.querySelectorAll('.chip');
    var glider = bar.querySelector('.glider');

    function moveGlider() {
      var a = bar.querySelector('.chip.is-active');
      if (!a || !glider) return;
      glider.style.width = a.offsetWidth + 'px';
      glider.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    }

    function apply(f) {
      Array.prototype.forEach.call(chips, function (c) {
        c.classList.toggle('is-active', c.getAttribute('data-filter') === f);
      });
      var works = document.querySelectorAll('.work');
      var cats = document.querySelectorAll('.works-cat');
      Array.prototype.forEach.call(works, function (w) {
        var match = f === 'all' || w.getAttribute('data-cat') === f;
        w.style.display = match ? '' : 'none';
        if (match && !w.classList.contains('is-in')) w.classList.add('is-in');
      });
      Array.prototype.forEach.call(cats, function (c) {
        var match = f === 'all' || c.getAttribute('data-cat') === f;
        c.style.display = match ? '' : 'none';
      });
      moveGlider();
    }

    Array.prototype.forEach.call(chips, function (ch) {
      ch.addEventListener('click', function () {
        apply(ch.getAttribute('data-filter'));
      });
    });

    /* 视图切换/窗口尺寸变化后重新对位（display:none 时量不到宽度） */
    window.addEventListener('resize', moveGlider);
    window.addEventListener('load', moveGlider);
    requestAnimationFrame(moveGlider);
  }

  /* ---------------- 启动 ---------------- */

  document.addEventListener('DOMContentLoaded', function () {
    initRouter();
    initNavGlider();
    initWorks();
    initFilter();
    initStage();
  });
})();
