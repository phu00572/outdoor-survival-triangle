/* workshop-kit.js — html-slide-builder 離線互動元件＋工作坊模式＋截圖／聽眾版／版面稽核
 * 不需網路、不需 Firebase。Reveal.js 簡報或一般單頁 HTML 都能用。
 * 用法：把 workshop-kit.css / workshop-kit.js 複製到專案 kit/，在 index.html：
 *   <link rel="stylesheet" href="kit/workshop-kit.css">
 *   <script src="kit/workshop-kit.js"></script>      ← 放在 reveal.js 之後、Reveal.initialize 之前
 *   Reveal.initialize({ ..., fragments: !WK.shot })   ← 截圖／聽眾版／稽核展開所有逐步內容
 *   WK.init({ total: 150 })                           ← 有 data-at 的工作坊才給 total（分鐘）
 *
 * 網址參數：
 *   ?shot   截圖模式：關閉動畫與轉場
 *   ?clean  聽眾版：隱藏操作介面（.wk-ui、Reveal 控制鈕、提問牆）、展開翻牌與答案
 *   ?audit  版面稽核：逐頁量測溢出，結果寫進 <script id="wk-audit" type="application/json">（供 shot.py 讀取）
 */
(function (global) {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var WK = {
    clean: qs.has('clean'),
    shot: qs.has('shot') || qs.has('clean') || qs.has('audit'),
    audit: qs.has('audit'),
    store: {
      get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    }
  };
  var root = document.documentElement;
  if (WK.shot) root.classList.add('wk-shot');
  if (WK.clean) root.classList.add('wk-clean');

  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function noSwipe(el) {   // Reveal 觸控防誤換頁
    el.setAttribute('data-prevent-swipe', '');
    ['touchstart', 'touchmove', 'touchend'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: false });
    });
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function beep() {
    try {
      var c = new (global.AudioContext || global.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(function (o) {
        var g = c.createGain(), os = c.createOscillator(); os.frequency.value = 880; os.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.2, c.currentTime + o); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + o + 0.3);
        os.start(c.currentTime + o); os.stop(c.currentTime + o + 0.3);
      });
    } catch (e) {}
  }

  /* ---------- 1. 實作倒數計時器 <div class="wk-timer" data-min="10" data-label="實作①"></div> ---------- */
  function timers() {
    $all('.wk-timer').forEach(function (t) {
      var total = Math.round(parseFloat(t.dataset.min || '5') * 60), left = total, run = false, iv = null;
      t.classList.add('wk-ui');
      t.innerHTML = '<span class="wk-lb">' + (t.dataset.label || '計時') + '<br>' + t.dataset.min + ' 分鐘</span>' +
        '<span class="wk-t"></span><button type="button" data-a="go">開始</button><button type="button" data-a="rs">重設</button>';
      var d = t.querySelector('.wk-t'), go = t.querySelector('[data-a=go]');
      function draw() {
        var a = Math.abs(left);
        d.textContent = (left < 0 ? '+' : '') + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
        d.classList.toggle('warn', left <= 60 && left > 0); d.classList.toggle('over', left <= 0);
      }
      go.onclick = function (e) {
        e.stopPropagation(); run = !run; go.textContent = run ? '暫停' : '繼續';
        if (run) iv = setInterval(function () { left--; if (left === 0) beep(); draw(); }, 1000); else clearInterval(iv);
      };
      t.querySelector('[data-a=rs]').onclick = function (e) { e.stopPropagation(); clearInterval(iv); run = false; left = total; go.textContent = '開始'; draw(); };
      draw();
    });
  }

  /* ---------- 2. 翻牌卡 <div class="wk-flip"><div class="wk-front">…</div><div class="wk-back">…</div></div> ---------- */
  function flips() {
    $all('.wk-flip').forEach(function (f) {
      if (WK.clean) f.classList.add('on');
      f.addEventListener('click', function () { f.classList.toggle('on'); });
    });
  }

  /* ---------- 3. 即時回饋測驗
     <div class="wk-quiz" data-a="2" data-fb="解釋文字"><div class="wk-q">題目</div>
       <div class="wk-opts"><button>A</button><button>B</button><button>C</button></div></div>
     data-a 為正確選項（0 起算）；同頁有 .wk-quiz-score 會顯示累計成績 ---------- */
  function quizzes() {
    var right = 0, done = 0, all = $all('.wk-quiz');
    all.forEach(function (q) {
      var bs = $all('.wk-opts button', q), fb = document.createElement('div'), answered = false;
      fb.className = 'wk-fb'; q.appendChild(fb);
      var a = +q.dataset.a;
      if (WK.clean) { bs[a] && bs[a].classList.add('right'); fb.innerHTML = q.dataset.fb || ''; return; }
      bs.forEach(function (b, i) {
        b.type = 'button';
        b.onclick = function () {
          if (answered) return; answered = true; done++;
          bs[a].classList.add('right');
          if (i !== a) b.classList.add('wrong'); else right++;
          fb.innerHTML = (i === a ? '<b class="ok">✔ 答對了！</b> ' : '<b class="bad">✘ 再想想：</b> ') + (q.dataset.fb || '');
          $all('.wk-quiz-score').forEach(function (s) { s.textContent = '已作答 ' + done + ' / ' + all.length + '，答對 ' + right + ' 題'; });
        };
      });
    });
  }

  /* ---------- 4. 點選排序遊戲 <ol class="wk-order"><li>步驟1</li><li>步驟2</li>…</ol>（依正確順序寫，程式會打亂） ---------- */
  function orders() {
    $all('ol.wk-order').forEach(function (ol) {
      var steps = $all('li', ol).map(function (li) { return li.innerHTML; });
      var box = document.createElement('div'); box.className = 'wk-order-box';
      ol.replaceWith(box); noSwipe(box);
      function init() {
        var n = 0;
        box.innerHTML = '<div class="wk-pool"></div><div class="wk-chain"></div><button type="button" class="wk-btn wk-ui">重來</button>';
        var pool = box.querySelector('.wk-pool'), chain = box.querySelector('.wk-chain');
        steps.forEach(function (s, i) {
          var c = document.createElement('div'); c.className = 'wk-slot';
          c.innerHTML = '<span class="wk-num">' + (i + 1) + '</span>' + (WK.clean ? s : '<span class="wk-muted">？</span>');
          if (WK.clean) c.classList.add('good');
          chain.appendChild(c);
        });
        box.querySelector('.wk-btn').onclick = init;
        if (WK.clean) { pool.remove(); return; }
        shuffle(steps.map(function (s, i) { return [s, i]; })).forEach(function (p) {
          var b = document.createElement('button'); b.type = 'button'; b.innerHTML = p[0];
          b.onclick = function () {
            var slot = chain.children[n];
            if (p[1] === n) {
              b.classList.add('used'); slot.classList.add('good');
              slot.innerHTML = '<span class="wk-num">' + (n + 1) + '</span>' + p[0]; n++;
              if (n === steps.length) { var d = document.createElement('div'); d.className = 'ok'; d.textContent = '🎉 完成！'; chain.appendChild(d); }
            } else { slot.classList.add('no'); setTimeout(function () { slot.classList.remove('no'); }, 500); }
          };
          pool.appendChild(b);
        });
      }
      init();
    });
  }

  /* ---------- 5. 數值滑桿對應等級
     <div class="wk-levels" data-min="10" data-max="37" data-step="0.1" data-value="36.5" data-unit="°C"
          data-levels='[[35,99,"正常","#2F8F5B","說明"],[32,35,"一級","#D9822B","說明"]]'></div> ---------- */
  function levels() {
    $all('.wk-levels').forEach(function (w) {
      var L = JSON.parse(w.dataset.levels || '[]'), unit = w.dataset.unit || '';
      w.innerHTML = '<div class="wk-lv-num"><b></b><span>' + unit + '</span></div>' +
        '<input type="range" min="' + w.dataset.min + '" max="' + w.dataset.max + '" step="' + (w.dataset.step || 1) + '" value="' + (w.dataset.value || w.dataset.max) + '">' +
        '<div class="wk-lv-box"></div>';
      var r = w.querySelector('input'), num = w.querySelector('.wk-lv-num b'), box = w.querySelector('.wk-lv-box');
      noSwipe(r);
      function upd() {
        var v = +r.value, dec = (String(w.dataset.step || '1').split('.')[1] || '').length;
        num.textContent = v.toFixed(dec);
        var l = L.filter(function (x) { return v >= x[0] && v < x[1]; })[0] || L[0];
        if (!l) return;
        num.style.color = l[3]; box.style.borderColor = l[3];
        box.innerHTML = '<h3 style="color:' + l[3] + '">' + l[2] + '</h3><p>' + (l[4] || '') + '</p>';
      }
      r.addEventListener('input', upd); upd();
    });
  }

  /* ---------- 6. 隨機情境卡 <div class="wk-deck"><template>情境A</template><template>情境B</template></div> ---------- */
  function decks() {
    $all('.wk-deck').forEach(function (dk) {
      var items = $all('template', dk).map(function (t) { return t.innerHTML; }), pile = [];
      var card = document.createElement('div'); card.className = 'wk-card';
      var tag = document.createElement('div'); tag.className = 'wk-muted';
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'wk-btn wk-ui'; btn.textContent = '🎲 抽情境卡';
      card.innerHTML = WK.clean ? items.map(function (x, i) { return '<p><b>' + (i + 1) + '.</b> ' + x + '</p>'; }).join('') : '按下「抽情境卡」開始';
      dk.appendChild(tag); dk.appendChild(card); dk.appendChild(btn);
      btn.onclick = function () {
        if (!pile.length) pile = shuffle(items.map(function (x, i) { return i; }));
        var i = pile.pop(); card.innerHTML = items[i]; tag.textContent = '情境 ' + (i + 1) + ' / ' + items.length + '（剩 ' + pile.length + ' 張未抽）';
      };
    });
  }

  /* ---------- 7. 可勾選檢核清單（記在瀏覽器） <ul class="wk-check" data-key="trip-check"><li>項目</li></ul> ---------- */
  function checks() {
    $all('ul.wk-check').forEach(function (ul) {
      var key = 'wk_' + (ul.dataset.key || 'check'), saved = JSON.parse(WK.store.get(key) || '[]');
      var cnt = document.createElement('p'); cnt.className = 'wk-count';
      var items = $all('li', ul);
      function save() {
        var v = items.map(function (li, i) { return li.querySelector('input').checked ? i : -1; }).filter(function (i) { return i >= 0; });
        WK.store.set(key, JSON.stringify(v));
        cnt.textContent = '已完成 ' + v.length + ' / ' + items.length + (v.length === items.length ? '　🎉' : '');
      }
      items.forEach(function (li, i) {
        var lab = document.createElement('label'), c = document.createElement('input');
        c.type = 'checkbox'; c.checked = saved.indexOf(i) >= 0;
        lab.appendChild(c); lab.appendChild(document.createTextNode(li.textContent));
        li.textContent = ''; li.appendChild(lab); li.classList.toggle('done', c.checked);
        c.onchange = function () { li.classList.toggle('done', c.checked); save(); };
      });
      ul.after(cnt); save();
    });
  }

  /* ---------- 8. 一鍵複製 <button class="wk-copy" data-target="#smsTpl">複製範本</button> ---------- */
  function copies() {
    $all('.wk-copy').forEach(function (b) {
      b.classList.add('wk-ui');
      b.onclick = function () {
        var el = document.querySelector(b.dataset.target); if (!el) return;
        var old = b.textContent;
        var done = function () { b.textContent = '✔ 已複製'; setTimeout(function () { b.textContent = old; }, 1600); };
        if (navigator.clipboard) navigator.clipboard.writeText(el.innerText).then(done, function () { sel(el); });
        else sel(el);
        function sel(e) { var r = document.createRange(); r.selectNodeContents(e); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = '已選取，請按 Ctrl+C'; }
      };
    });
  }

  /* ---------- 9. 圖片燈箱 <img class="wk-zoom" src="…"> ---------- */
  function lightbox() {
    var lb = document.createElement('div'); lb.id = 'wk-lightbox'; lb.innerHTML = '<img alt="">';
    document.body.appendChild(lb);
    lb.onclick = function () { lb.classList.remove('on'); };
    document.addEventListener('click', function (e) {
      var z = e.target.closest && e.target.closest('img.wk-zoom,[data-zoom]');
      if (!z) return;
      lb.querySelector('img').src = z.dataset.zoom || z.src; lb.classList.add('on');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('on'); }, true);
  }

  /* ---------- 10. 工作坊課程時鐘：讀目前頁 section 的 data-at（預定開始分鐘）---------- */
  function clock(total) {
    var el = document.createElement('button'); el.id = 'wk-clock'; el.type = 'button'; el.className = 'wk-ui';
    el.title = '按 T 開始／暫停課程計時，Shift+T 歸零';
    document.body.appendChild(el);
    var acc = +(WK.store.get('wk_clock') || 0), start = 0, run = false;
    function elapsed() { return acc + (run ? Date.now() - start : 0); }
    function cur() {
      if (global.Reveal && Reveal.getCurrentSlide) return Reveal.getCurrentSlide();
      return document.querySelector('section.active,.slide.active');
    }
    function plan() {   // 目前頁或往前最近一頁的 data-at
      var s = cur(); if (!s) return null;
      var all = $all('[data-at]'), idx = all.indexOf(s);
      if (s.dataset.at != null) return +s.dataset.at;
      var prevs = all.filter(function (x) { return x.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING; });
      return prevs.length ? +prevs[prevs.length - 1].dataset.at : (idx < 0 ? null : 0);
    }
    function tick() {
      var ms = elapsed(), m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, p = plan();
      var diff = p == null ? 0 : m - p;
      el.textContent = (run ? '⏱ ' : '⏸ ') + pad(m) + ':' + pad(s) + ' / ' + total + ' 分' +
        (p == null ? '' : '｜本頁預定 ' + p + ' 分' + (ms ? (diff > 2 ? '（落後 ' + diff + '）' : diff < -2 ? '（超前 ' + (-diff) + '）' : '（準時）') : ''));
      el.classList.toggle('behind', ms > 0 && diff > 2);
      if (run) WK.store.set('wk_clock', elapsed());
    }
    function toggle() { if (run) { acc = elapsed(); run = false; } else { start = Date.now(); run = true; } WK.store.set('wk_clock', acc); tick(); }
    function reset() { acc = 0; run = false; WK.store.set('wk_clock', 0); tick(); }
    el.onclick = toggle;
    document.addEventListener('keydown', function (e) {
      if (e.target.matches && e.target.matches('input,textarea,[contenteditable]')) return;
      if (e.key === 't') toggle(); else if (e.key === 'T') reset();
    });
    if (global.Reveal && Reveal.on) Reveal.on('slidechanged', tick);
    setInterval(function () { if (run) tick(); }, 1000);
    tick();
    WK.clockTick = tick;
  }

  /* ---------- 11. 版面稽核（?audit）：逐頁量測，結果寫入 #wk-audit ---------- */
  function runAudit() {
    function out(obj) {
      var s = document.createElement('script'); s.type = 'application/json'; s.id = 'wk-audit';
      s.textContent = JSON.stringify(obj); document.body.appendChild(s);
    }
    function measure(sec, H, W) {
      var r = sec.getBoundingClientRect(), bad = [];
      var h = sec.scrollHeight, w = sec.scrollWidth;
      $all('*', sec).forEach(function (e) {
        if (e.closest('aside.notes,.wk-ui,template')) return;
        var cs = getComputedStyle(e);
        if ((cs.overflow === 'hidden' || cs.overflowY === 'hidden') && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 0)
          bad.push('裁切：' + (e.className || e.tagName));
      });
      // 橫向超出：任何子元素的右緣超過本頁右緣（overflow:hidden 時 scrollWidth 量不到，要逐一比對）
      var wide = [], rr = r.right + 2;
      $all('*', sec).forEach(function (e) {
        if (e.closest('aside.notes,.wk-ui,template,#qa-sidebar')) return;
        var er = e.getBoundingClientRect();
        if (er.width && er.right > rr && getComputedStyle(e).position !== 'fixed') wide.push(e);
      });
      wide = wide.filter(function (e) { return !wide.some(function (o) { return o !== e && o.contains(e); }); });
      var wideInfo = wide.slice(0, 3).map(function (e) {
        return (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '')) +
          ' 超出 ' + Math.round(e.getBoundingClientRect().right - r.right) + 'px';
      });
      return { height: h, width: w, limitH: H, limitW: W, over: h > H + 2 || w > W + 2 || wide.length > 0, clipped: bad.slice(0, 5).concat(wideInfo) };
    }
    var res = { viewport: [innerWidth, innerHeight], slides: [] };
    if (global.Reveal && Reveal.getSlides) {
      var whenReady = function (fn) { if (Reveal.isReady && Reveal.isReady()) fn(); else Reveal.on('ready', fn); };
      whenReady(function () {
        var cfg = Reveal.getConfig(), H = cfg.height, W = cfg.width, hs = Reveal.getHorizontalSlides(), i = 0;
        res.mode = document.body.classList.contains('mobile') ? 'mobile' : 'desktop';
        (function next() {
          if (i >= hs.length) { res.total = hs.length; out(res); return; }
          Reveal.slide(i, 0);
          setTimeout(function () {
            var s = Reveal.getCurrentSlide(), m = measure(s, H, W);
            if (res.mode === 'mobile') m.over = document.documentElement.scrollWidth > innerWidth + 1 || m.clipped.some(function (c) { return c.indexOf('超出') >= 0; });   // 手機縱向交給頁內捲動，只查橫向
            m.index = i; m.title = (s.querySelector('h1,h2,h3') || {}).textContent || s.dataset.title || '';
            res.slides.push(m); i++; next();
          }, 120);
        })();
      });
    } else {
      var ss = $all('section.slide,.slide');
      ss.forEach(function (s, i) {
        ss.forEach(function (x) { x.classList.remove('active'); }); s.classList.add('active');
        var m = measure(s, s.clientHeight, s.clientWidth); m.index = i;
        m.title = (s.querySelector('h1,h2,h3') || {}).textContent || s.dataset.title || '';
        res.slides.push(m);
      });
      res.total = ss.length; out(res);
    }
  }

  WK.init = function (opt) {
    opt = opt || {};
    var run = function () {
      timers(); flips(); quizzes(); orders(); levels(); decks(); checks(); copies(); lightbox();
      if (opt.total && !WK.clean) clock(opt.total);
      if (WK.audit) runAudit();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  };
  WK.beep = beep;
  global.WK = WK;
})(window);
