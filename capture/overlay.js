/* СкринСтудия overlay */
(() => {
  if (window.__SS_OVERLAY__) {
    window.__SS_OVERLAY__.alive = true;
    return;
  }

  const t = (k, fallback) => {
    try {
      return (window.SSI18n && window.SSI18n.t(k)) || fallback || k;
    } catch (_) {
      return fallback || k;
    }
  };

  const SS = { alive: true, root: null, shadow: null, mode: null, ac: null, magZoom: 3, pointer: { x: 0, y: 0, down: false } };
  window.__SS_OVERLAY__ = SS;

  function signal() {
    if (SS.ac) SS.ac.abort();
    SS.ac = new AbortController();
    return SS.ac.signal;
  }

  const CSS = `
    :host, * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
    .layer { position: fixed; inset: 0; z-index: 2147483646; }
    .freeze { position: fixed; inset: 0; width: 100vw; height: 100vh; object-fit: fill; pointer-events: none; }
    canvas.hud { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: crosshair; }
    .hint {
      position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
      background: rgba(12,16,24,.9); color: #eef3fb; padding: 8px 14px;
      border-radius: 999px; font-size: 12px; border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 10px 30px rgba(0,0,0,.35); max-width: 92vw; text-align: center; z-index: 3;
      pointer-events: none;
    }
    .bar, .dock {
      position: fixed; display: none; flex-wrap: wrap; gap: 6px; padding: 8px;
      background: rgba(14,18,26,.95); border: 1px solid rgba(255,255,255,.1);
      border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.45); z-index: 4;
    }
    .bar button, .dock button, .chip {
      appearance: none; border: 0; cursor: pointer;
      background: #1c2433; color: #eef3fb; border-radius: 10px;
      padding: 8px 11px; font-size: 12px; font-weight: 600;
    }
    .bar button.primary, .dock button.primary { background: #ff6a3d; color: #1a0c07; }
    .bar button:hover, .dock button:hover { filter: brightness(1.08); }
    .dock { display: flex; left: 50%; bottom: 18px; transform: translateX(-50%); pointer-events: auto; }
    .count-wrap { position: fixed; right: 18px; top: 18px; display: flex; gap: 8px; align-items: center; z-index: 5; }
    .count-num {
      min-width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
      font-size: 28px; font-weight: 800; color: #fff; background: rgba(16,20,28,.86);
      border: 3px solid #ff6a3d;
    }
    .el-tip {
      position: fixed; pointer-events: none; background: #ff6a3d; color: #1a0c07;
      font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;
    }
    .live-pass { pointer-events: none !important; }
    .live-pass .dock, .live-pass .count-wrap, .live-pass .hint { pointer-events: auto !important; }
  `;

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    const map = {
      SS_REGION: () => startRegion(msg.dataUrl, msg.viewport, msg.multi),
      SS_ELEMENT: () => startElement(),
      SS_COUNTDOWN: () => startTimer(msg.ms || 3000),
      SS_TIMER: () => startTimer(msg.ms || 5000),
      SS_HIDE_UI_PICK: () => startHideUi(),
      SS_WAIT: () => startWait(),
      SS_SCROLL_REGION: () => startLiveRegion("scroll"),
      SS_GIF_REGION: () => startLiveRegion("gif"),
      SS_VIDEO_FRAME: () => startVideoFrame(),
      SS_STATUS: () => showStatus(msg.text),
      SS_HIDE_UI: () => teardown(),
      SS_TEARDOWN: () => teardown(),
    };
    if (map[msg.type]) {
      map[msg.type]();
      return Promise.resolve({ ok: true });
    }
  });

  function ensureHost(live) {
    if (SS.root && document.documentElement.contains(SS.root)) {
      SS.root.classList.toggle("live-pass", !!live);
      return;
    }
    const root = document.createElement("div");
    root.id = "ss-overlay-root";
    root.style.all = "initial";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "2147483646";
    if (live) root.classList.add("live-pass");
    const shadow = root.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    (document.documentElement || document.body).appendChild(root);
    SS.root = root;
    SS.shadow = shadow;
  }

  function teardown() {
    if (SS.ac) SS.ac.abort();
    SS.ac = null;
    if (SS.waitObs) {
      SS.waitObs.disconnect();
      SS.waitObs = null;
    }
    if (SS.root) SS.root.remove();
    SS.root = null;
    SS.shadow = null;
    SS.mode = null;
  }

  function onEsc(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      browser.runtime.sendMessage({ type: "SS_CANCEL" });
      teardown();
    }
  }

  function trackPointer(sig) {
    window.addEventListener("mousemove", (e) => {
      SS.pointer.x = e.clientX;
      SS.pointer.y = e.clientY;
    }, { signal: sig, capture: true });
    window.addEventListener("mousedown", (e) => {
      SS.pointer.down = true;
      SS.pointer.clickX = e.clientX;
      SS.pointer.clickY = e.clientY;
      SS.pointer.clicked = true;
    }, { signal: sig, capture: true });
  }

  function pointerMeta() {
    return {
      cursor: { x: SS.pointer.x, y: SS.pointer.y },
      click: SS.pointer.clicked ? { x: SS.pointer.clickX, y: SS.pointer.clickY } : null,
    };
  }

  function showStatus(text) {
    ensureHost(true);
    let hint = SS.shadow.querySelector(".hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "hint";
      SS.shadow.appendChild(hint);
    }
    hint.textContent = text;
    const dock = document.createElement("div");
    dock.className = "dock";
    dock.innerHTML = `<button data-act="abort">${t("cancel", "Отмена")}</button>`;
    dock.style.display = "flex";
    SS.shadow.appendChild(dock);
    dock.addEventListener("click", () => {
      browser.runtime.sendMessage({ type: "SS_ABORT" });
    });
  }

  function startTimer(ms) {
    teardown();
    ensureHost(true);
    SS.mode = "timer";
    const sig = signal();
    window.addEventListener("keydown", onEsc, { capture: true, signal: sig });
    trackPointer(sig);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = t("timerHint", "Страница живая: откройте меню. 3 / 5 / 10 сек.");
    const wrap = document.createElement("div");
    wrap.className = "count-wrap";
    wrap.innerHTML = `<div class="count-num">…</div>
      <button class="chip" data-ms="3000">3с</button>
      <button class="chip" data-ms="5000">5с</button>
      <button class="chip" data-ms="10000">10с</button>
      <button class="chip primary" data-act="now">${t("captureNow", "Снять сейчас")}</button>
      <button class="chip" data-act="pause">${t("pause", "Пауза")}</button>
      <button class="chip" data-act="cancel">${t("cancel", "Отмена")}</button>`;
    SS.shadow.append(hint, wrap);
    let left = ms;
    let paused = false;
    const num = wrap.querySelector(".count-num");
    const tick = () => {
      num.textContent = Math.max(0, Math.ceil(left / 1000));
    };
    tick();
    const iv = setInterval(() => {
      if (paused) return;
      left -= 200;
      tick();
      if (left <= 0) {
        clearInterval(iv);
        fire();
      }
    }, 200);
    function fire() {
      clearInterval(iv);
      browser.runtime.sendMessage({ type: "SS_TIMER_FIRE", pointer: pointerMeta() });
      teardown();
    }
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.ms) {
        left = +b.dataset.ms;
        tick();
      }
      if (b.dataset.act === "now") fire();
      if (b.dataset.act === "pause") {
        paused = !paused;
        b.textContent = paused ? t("resume", "Далее") : t("pause", "Пауза");
      }
      if (b.dataset.act === "cancel") {
        clearInterval(iv);
        browser.runtime.sendMessage({ type: "SS_CANCEL" });
        teardown();
      }
    });
  }

  function startWait() {
    teardown();
    ensureHost(true);
    SS.mode = "wait";
    const sig = signal();
    window.addEventListener("keydown", onEsc, { capture: true, signal: sig });
    trackPointer(sig);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = t("waitHint", "Жду модалку или изменение страницы…");
    const dock = document.createElement("div");
    dock.className = "dock";
    dock.style.display = "flex";
    dock.innerHTML = `<button class="primary" data-act="now">${t("captureNow", "Снять сейчас")}</button>
      <button data-act="cancel">${t("cancel", "Отмена")}</button>`;
    SS.shadow.append(hint, dock);
    const startKids = document.body ? document.body.childElementCount : 0;
    const startText = (document.body && document.body.innerText || "").length;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      if (SS.waitObs) SS.waitObs.disconnect();
      browser.runtime.sendMessage({ type: "SS_TIMER_FIRE", pointer: pointerMeta() });
      teardown();
    };
    SS.waitObs = new MutationObserver(() => {
      const dlg = document.querySelector("dialog[open], [role='dialog'], [class*='modal']");
      const kids = document.body ? document.body.childElementCount : 0;
      const text = (document.body && document.body.innerText || "").length;
      if (dlg || Math.abs(kids - startKids) > 2 || Math.abs(text - startText) > 80) fire();
    });
    SS.waitObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    dock.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "now") fire();
      if (b.dataset.act === "cancel") {
        browser.runtime.sendMessage({ type: "SS_CANCEL" });
        teardown();
      }
    });
  }

  function startHideUi() {
    teardown();
    ensureHost(false);
    SS.mode = "hide";
    const sig = signal();
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishHide();
      }
      onEsc(e);
    }, { capture: true, signal: sig });
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.pointerEvents = "auto";
    hint.textContent = t("hideHint", "Клик — скрыть элемент.");
    const dock = document.createElement("div");
    dock.className = "dock";
    dock.style.display = "flex";
    dock.innerHTML = `
      <button data-act="sticky">Sticky</button>
      <button data-act="cookie">Cookie</button>
      <button data-act="chat">Чат</button>
      <button class="primary" data-act="shot">${t("captureNow", "Снять")}</button>
      <button data-act="cancel">${t("cancel", "Отмена")}</button>`;
    const canvas = document.createElement("canvas");
    canvas.className = "hud";
    canvas.style.cursor = "pointer";
    SS.shadow.append(canvas, hint, dock);
    const hidden = [];
    const hideEl = (el) => {
      if (!el || el === SS.root) return;
      hidden.push([el, el.style.getPropertyValue("visibility"), el.style.getPropertyPriority("visibility")]);
      el.style.setProperty("visibility", "hidden", "important");
    };
    const presets = {
      sticky: () => {
        document.querySelectorAll("body *").forEach((el, i) => {
          if (i > 8000) return;
          const p = getComputedStyle(el).position;
          if (p === "fixed" || p === "sticky") hideEl(el);
        });
      },
      cookie: () => {
        document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], #onetrust-banner-sdk, .cc-window, [id*="gdpr" i]').forEach(hideEl);
      },
      chat: () => {
        document.querySelectorAll('[class*="intercom" i], [id*="chat" i], [class*="crisp" i], [class*="helpcrunch" i], iframe[title*="chat" i]').forEach(hideEl);
      },
    };
    canvas.addEventListener("click", (e) => {
      SS.root.style.pointerEvents = "none";
      const el = document.elementFromPoint(e.clientX, e.clientY);
      SS.root.style.pointerEvents = "auto";
      hideEl(el);
    }, { signal: sig });
    dock.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (presets[b.dataset.act]) presets[b.dataset.act]();
      if (b.dataset.act === "shot") finishHide();
      if (b.dataset.act === "cancel") {
        restore();
        browser.runtime.sendMessage({ type: "SS_CANCEL" });
        teardown();
      }
    });
    function restore() {
      hidden.forEach(([el, val, pri]) => {
        if (val) el.style.setProperty("visibility", val, pri);
        else el.style.removeProperty("visibility");
      });
    }
    function finishHide() {
      teardown();
      browser.runtime.sendMessage({ type: "SS_HIDDEN_CAPTURE", pointer: pointerMeta() });
    }
    window.__SS_RESTORE_HIDE__ = restore;
  }

  function startLiveRegion(kind) {
    teardown();
    ensureHost(false);
    SS.mode = kind;
    const sig = signal();
    window.addEventListener("keydown", onEsc, { capture: true, signal: sig });
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = kind === "gif"
      ? "Выделите область для GIF · 5–15 сек"
      : "Выделите колонку/чат — склеим при прокрутке";
    const canvas = document.createElement("canvas");
    canvas.className = "hud";
    SS.shadow.append(hint, canvas);
    liveSelect(canvas, sig, (rect) => {
      if (kind === "gif") {
        const dock = document.createElement("div");
        dock.className = "dock";
        dock.style.display = "flex";
        dock.innerHTML = `<button data-ms="5000">5с</button><button data-ms="10000" class="primary">10с</button><button data-ms="15000">15с</button>`;
        SS.shadow.appendChild(dock);
        dock.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          browser.runtime.sendMessage({ type: "SS_GIF_START", rect, ms: +b.dataset.ms, pointer: pointerMeta() });
          teardown();
        });
        return;
      }
      browser.runtime.sendMessage({ type: "SS_SCROLL_START", rect, pointer: pointerMeta() });
      teardown();
    });
  }

  function liveSelect(canvas, sig, onDone) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      paint();
    };
    window.addEventListener("resize", resize, { signal: sig });
    let drag = null, rect = null, hover = { x: 0, y: 0 };
    function css(e) {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
    }
    function paint() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(6,8,14,0.35)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sel = drag ? norm(drag.x0, drag.y0, drag.x1, drag.y1) : rect;
      if (sel) {
        ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = "#ff6a3d";
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      }
    }
    resize();
    canvas.addEventListener("mousedown", (e) => {
      const p = css(e);
      drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }, { signal: sig });
    window.addEventListener("mousemove", (e) => {
      const p = css(e);
      hover = p;
      if (drag) {
        drag.x1 = p.x;
        drag.y1 = p.y;
      }
      paint();
    }, { signal: sig });
    window.addEventListener("mouseup", () => {
      if (!drag) return;
      rect = norm(drag.x0, drag.y0, drag.x1, drag.y1);
      drag = null;
      if (rect.w > 8 && rect.h > 8) {
        onDone({ x: rect.x / dpr, y: rect.y / dpr, w: rect.w / dpr, h: rect.h / dpr });
      }
    }, { signal: sig });
    void hover;
  }

  function startRegion(dataUrl, viewport, forceMulti) {
    teardown();
    ensureHost(false);
    SS.mode = "region";
    const sig = signal();
    window.addEventListener("keydown", onEsc, { capture: true, signal: sig });
    trackPointer(sig);

    const img = new Image();
    img.className = "freeze";
    img.src = dataUrl;
    const canvas = document.createElement("canvas");
    canvas.className = "hud";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = t("overlayHint", "Перетащите область · Shift — квадрат · Enter — весь экран · колесо — лупа");
    const bar = document.createElement("div");
    bar.className = "bar";
    SS.shadow.append(img, canvas, hint, bar);

    const ctx = canvas.getContext("2d");
    const freeze = new Image();
    freeze.src = dataUrl;
    let dpr = window.devicePixelRatio || 1;
    const rects = [];
    let drag = null, hover = { x: 0, y: 0 };

    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      paint();
    };
    window.addEventListener("resize", resize, { signal: sig });
    window.addEventListener("wheel", (e) => {
      e.preventDefault();
      SS.magZoom = Math.max(1.5, Math.min(8, SS.magZoom + (e.deltaY < 0 ? 0.4 : -0.4)));
      paint();
    }, { passive: false, signal: sig, capture: true });

    function cssToCanvas(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      };
    }

    function paint() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (freeze.complete) ctx.drawImage(freeze, 0, 0, w, h);
      ctx.fillStyle = "rgba(6,8,14,0.55)";
      ctx.fillRect(0, 0, w, h);
      const list = rects.slice();
      if (drag) list.push(norm(drag.x0, drag.y0, drag.x1, drag.y1));
      for (const sel of list) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
        ctx.restore();
        if (freeze.complete) ctx.drawImage(freeze, sel.x, sel.y, sel.w, sel.h, sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = "#ff6a3d";
        ctx.lineWidth = Math.max(2, dpr);
        ctx.strokeRect(sel.x + 0.5, sel.y + 0.5, sel.w, sel.h);
        ctx.fillStyle = "#111826";
        ctx.font = `${12 * dpr}px Segoe UI`;
        const label = `${Math.round(sel.w / dpr)} × ${Math.round(sel.h / dpr)}`;
        ctx.fillRect(sel.x, Math.max(0, sel.y - 20 * dpr), ctx.measureText(label).width + 12 * dpr, 18 * dpr);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, sel.x + 6 * dpr, Math.max(14 * dpr, sel.y - 6 * dpr));
      }
      if (freeze.complete) {
        const mag = 120 * dpr, zoom = SS.magZoom;
        let mx = hover.x + 22 * dpr, my = hover.y + 22 * dpr;
        if (mx + mag > w) mx = hover.x - mag - 22 * dpr;
        if (my + mag > h) my = hover.y - mag - 22 * dpr;
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx + mag / 2, my + mag / 2, mag / 2, 0, Math.PI * 2);
        ctx.clip();
        const sw = mag / zoom;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(freeze, hover.x - sw / 2, hover.y - sw / 2, sw, sw, mx, my, mag, mag);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(mx + mag / 2, my + mag / 2, mag / 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff6a3d";
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
      }
    }
    freeze.onload = paint;
    resize();

    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const p = cssToCanvas(e);
      drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      bar.style.display = "none";
    }, { signal: sig });
    window.addEventListener("mousemove", (e) => {
      const p = cssToCanvas(e);
      hover = p;
      if (drag) {
        drag.x1 = p.x;
        drag.y1 = p.y;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
          drag.x1 = drag.x0 + Math.sign(drag.x1 - drag.x0 || 1) * side;
          drag.y1 = drag.y0 + Math.sign(drag.y1 - drag.y0 || 1) * side;
        }
      }
      paint();
    }, { signal: sig });
    window.addEventListener("mouseup", () => {
      if (!drag) return;
      const n = norm(drag.x0, drag.y0, drag.x1, drag.y1);
      drag = null;
      if (n.w < 4 * dpr || n.h < 4 * dpr) return;
      rects.push(n);
      paint();
      placeBar(bar, n, dpr);
      fillBar(bar, rects, forceMulti);
    }, { signal: sig });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        rects.length = 0;
        rects.push({ x: 0, y: 0, w: canvas.width, h: canvas.height });
        commit("edit", rects, dataUrl, dpr);
      }
    }, { capture: true, signal: sig });

    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "add") {
        bar.style.display = "none";
        hint.textContent = t("overlayHintMulti", "Ещё область или Готово");
        return;
      }
      if (act === "cancel") {
        browser.runtime.sendMessage({ type: "SS_CANCEL" });
        teardown();
        return;
      }
      commit(act, rects, dataUrl, dpr);
    });
  }

  function fillBar(bar, rects, forceMulti) {
    const last = forceMulti;
    bar.innerHTML = `
      <button data-act="edit" class="primary">${t("edit", "Править")}</button>
      <button data-act="copy">${t("copy", "Копировать")}</button>
      <button data-act="save">${t("save", "Сохранить")}</button>
      <button data-act="pin">${t("pin", "Пин")}</button>
      <button data-act="search">${t("search", "Искать")}</button>
      <button data-act="add">${t("addRegion", "Ещё область")}</button>
      <button data-act="scroll">${t("scrollThis", "Скролл колонки")}</button>
      <button data-act="gif">${t("gifThis", "GIF")}</button>
      <button data-act="cancel">${t("cancel", "Отмена")}</button>`;
    void last;
  }

  function commit(act, rects, dataUrl, dpr) {
    if (!rects.length) return;
    const cssRects = rects.map((r) => ({
      x: r.x / dpr, y: r.y / dpr, w: r.w / dpr, h: r.h / dpr,
    }));
    browser.runtime.sendMessage({
      type: "SS_REGION_RESULT",
      dataUrl,
      rects: cssRects,
      rect: cssRects[0],
      viewport: { w: window.innerWidth, h: window.innerHeight },
      act,
      pointer: pointerMeta(),
    });
  }

  function placeBar(bar, rect, dpr) {
    bar.style.display = "flex";
    const left = rect.x / dpr;
    const top = rect.y / dpr;
    const h = rect.h / dpr;
    let x = left;
    let y = top + h + 10;
    if (y + 56 > window.innerHeight) y = Math.max(8, top - 56);
    if (x + 520 > window.innerWidth) x = window.innerWidth - 530;
    if (x < 8) x = 8;
    bar.style.left = x + "px";
    bar.style.top = y + "px";
  }

  function norm(x0, y0, x1, y1) {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }

  function startElement() {
    teardown();
    ensureHost(false);
    SS.mode = "element";
    const sig = signal();
    window.addEventListener("keydown", onEsc, { capture: true, signal: sig });
    const canvas = document.createElement("canvas");
    canvas.className = "hud";
    canvas.style.cursor = "pointer";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Элемент: клик. Shift — скролл внутри элемента";
    const tip = document.createElement("div");
    tip.className = "el-tip";
    SS.shadow.append(canvas, hint, tip);
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    let last = null;
    canvas.addEventListener("mousemove", (e) => {
      last = pick(e.clientX, e.clientY);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(6,8,14,0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!last) return;
      const r = last.getBoundingClientRect();
      ctx.clearRect(r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
      ctx.strokeStyle = "#ff6a3d";
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
      tip.textContent = `${last.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)}`;
      tip.style.left = e.clientX + 12 + "px";
      tip.style.top = e.clientY + 12 + "px";
    }, { signal: sig });
    canvas.addEventListener("click", (e) => {
      const el = last || pick(e.clientX, e.clientY);
      if (!el) return;
      sendElement(el, e.shiftKey);
    }, { signal: sig });
  }

  function sendElement(el, scrollInner) {
    const r = el.getBoundingClientRect();
    const html = document.documentElement;
    const body = document.body;
    browser.runtime.sendMessage({
      type: "SS_ELEMENT_RESULT",
      scrollInner: !!scrollInner,
      rect: {
        x: r.left, y: r.top, w: r.width, h: r.height,
        vw: window.innerWidth, vh: window.innerHeight,
        docX: r.left + window.scrollX, docY: r.top + window.scrollY,
        docWBox: r.width, docHBox: r.height,
        docW: Math.max(html.scrollWidth, body ? body.scrollWidth : 0),
        docH: Math.max(html.scrollHeight, body ? body.scrollHeight : 0),
        scrollH: el.scrollHeight, clientH: el.clientHeight,
        scrollW: el.scrollWidth, clientW: el.clientWidth,
      },
      pointer: pointerMeta(),
    });
  }

  function pick(x, y) {
    SS.root.style.pointerEvents = "none";
    const stack = document.elementsFromPoint(x, y);
    SS.root.style.pointerEvents = "auto";
    return stack.find((el) => el !== SS.root && el.id !== "ss-overlay-root") || null;
  }

  function startVideoFrame() {
    teardown();
    ensureHost(false);
    const sig = signal();
    window.addEventListener("keydown", onEsc, { capture: true, signal: sig });
    const videos = [...document.querySelectorAll("video")].filter((v) => v.readyState >= 1);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = videos.length ? "Кликните по видео" : "На странице нет видео";
    SS.shadow.appendChild(hint);
    const canvas = document.createElement("canvas");
    canvas.className = "hud";
    canvas.style.cursor = "pointer";
    SS.shadow.appendChild(canvas);
    canvas.addEventListener("click", (e) => {
      SS.root.style.pointerEvents = "none";
      const el = document.elementFromPoint(e.clientX, e.clientY);
      SS.root.style.pointerEvents = "auto";
      const v = el && el.closest ? el.closest("video") : null;
      if (v) {
        browser.runtime.sendMessage({ type: "SS_VIDEO_PICKED" });
        teardown();
      }
    }, { signal: sig });
    if (videos.length === 1) {
      browser.runtime.sendMessage({ type: "SS_VIDEO_PICKED" });
      teardown();
    }
  }
})();
