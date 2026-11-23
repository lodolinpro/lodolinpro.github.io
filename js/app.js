/* =========================================================
   app.js — 作品集 / 摄影设备 双视图路由
   3D 星河场景已移出（独立项目 lodolin-3d）
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* 回到顶部按钮显隐同步（由 initToTop 赋值） */
  var syncToTop = function () {};

  /* 分类二级（景点/题材）筛选状态（由 initFilter / initSpotMenus 维护） */
  var activeSpot = '';
  var applyFilter = function () {};

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

  var VIEWS = ['about', 'works', 'gear'];

  function go(name) {
    if (VIEWS.indexOf(name) < 0) name = 'about';
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
    /* 切换视图后同步回到顶部按钮 */
    requestAnimationFrame(syncToTop);
  }

  function initRouter() {
    var tabs = document.querySelectorAll('[data-nav]');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        go(t.getAttribute('data-nav'));
      });
    });
    /* 深链：#works / #about / #gear 直达 */
    if (location.hash.indexOf('works') >= 0) go('works');
    else if (location.hash.indexOf('about') >= 0) go('about');
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
        var okCat = f === 'all' || w.getAttribute('data-cat') === f;
        var okSpot = !activeSpot || w.getAttribute('data-spot') === activeSpot;
        var match = okCat && okSpot;
        w.style.display = match ? '' : 'none';
        if (match && !w.classList.contains('is-in')) w.classList.add('is-in');
      });
      Array.prototype.forEach.call(cats, function (c) {
        /* 景点筛选时隐藏分类标题，只留作品流 */
        var match = (f === 'all' || c.getAttribute('data-cat') === f) && !activeSpot;
        c.style.display = match ? '' : 'none';
      });
      moveGlider();
    }

    applyFilter = apply;

    Array.prototype.forEach.call(chips, function (ch) {
      ch.addEventListener('click', function () {
        activeSpot = '';
        Array.prototype.forEach.call(document.querySelectorAll('.spot-menu'), function (m) { m.hidden = true; });
        apply(ch.getAttribute('data-filter'));
      });
    });

    /* 视图切换/窗口尺寸变化后重新对位（display:none 时量不到宽度） */
    window.addEventListener('resize', moveGlider);
    window.addEventListener('load', moveGlider);
    requestAnimationFrame(moveGlider);
  }

  /* ---------------- 分类二级菜单（悬停 / 点击展开） ---------------- */

  function initSpotMenus() {
    var bar = document.querySelector('.works-filter');
    if (!bar) return;
    var triggers = bar.querySelectorAll('.chip[data-spot-menu]');
    if (!triggers.length) return;

    var closers = [];

    function closeAll() {
      closers.forEach(function (fn) { fn(); });
    }

    function bind(trig) {
      var menu = document.getElementById(trig.getAttribute('data-spot-menu'));
      if (!menu) return;
      var timer = null;
      var cat = trig.getAttribute('data-filter');

      function sync() {
        Array.prototype.forEach.call(menu.querySelectorAll('.spot-chip'), function (x) {
          x.classList.toggle('is-active', (x.getAttribute('data-spot') || '') === activeSpot);
        });
      }

      function place() {
        var r = trig.getBoundingClientRect();
        var w = Math.min(360, window.innerWidth - 24);
        var left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
        menu.style.width = w + 'px';
        menu.style.left = left + 'px';
        menu.style.top = (r.bottom + 10) + 'px';
        menu.hidden = false;
        sync();
      }

      function hideNow() {
        clearTimeout(timer);
        menu.hidden = true;
      }

      function show() {
        clearTimeout(timer);
        closeAll();
        place();
      }

      function hideSoon() {
        clearTimeout(timer);
        timer = setTimeout(hideNow, 200);
      }

      trig.addEventListener('mouseenter', show);
      trig.addEventListener('mouseleave', hideSoon);
      trig.addEventListener('click', show);

      menu.addEventListener('mouseenter', function () { clearTimeout(timer); });
      menu.addEventListener('mouseleave', hideSoon);

      menu.addEventListener('click', function (e) {
        var btn = e.target;
        while (btn && btn !== menu && !btn.classList.contains('spot-chip')) btn = btn.parentNode;
        if (!btn || btn === menu) return;
        activeSpot = btn.getAttribute('data-spot') || '';
        applyFilter(cat);
        hideNow();
      });

      closers.push(hideNow);
    }

    Array.prototype.forEach.call(triggers, bind);

    window.addEventListener('resize', closeAll);
    window.addEventListener('scroll', closeAll, true);
  }

  /* ---------------- 回到顶部（固定右下角） ---------------- */

  function initToTop() {
    var btn = $('to-top');
    if (!btn) return;

    function activeView() {
      return document.querySelector('.view.is-active');
    }

    function update() {
      var el = activeView();
      var top = el ? el.scrollTop : 0;
      btn.classList.toggle('is-on', top > 240);
    }

    syncToTop = update;

    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.addEventListener('scroll', update, { passive: true });
    });

    btn.addEventListener('click', function () {
      var el = activeView();
      if (!el) return;
      if (el.scrollTo) el.scrollTo({ top: 0, behavior: 'smooth' });
      else el.scrollTop = 0;
    });

    window.addEventListener('resize', update);
    update();
  }

  /* ---------------- 启动 ---------------- */

  document.addEventListener('DOMContentLoaded', function () {
    initRouter();
    initNavGlider();
    initWorks();
    initFilter();
    initSpotMenus();
    initToTop();
  });
})();
