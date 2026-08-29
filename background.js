/* СкринСтудия — capture orchestrator */
const CAPTURE_ID_KEY = "ss_pending_id";

const DEFAULTS = {
  afterCapture: "editor",
  format: "png",
  jpegQuality: 0.92,
  hideFixed: true,
  hideScrollbars: true,
  delayMs: 3000,
  filenamePattern: "{site}-{title}-{date}-{time}",
  autoFolder: true,
  includeCursor: false,
  includeClicks: false,
  scaleExport: "screen",
  imgbbKey: "",
  uploadUrl: "",
  githubRepo: "",
  webhookUrl: "",
  quietToast: true,
  ocrKey: "",
};

let abortCapture = false;
let lastMode = "region";
let _plat = null;

async function plat() {
  if (_plat) return _plat;
  try {
    _plat = await browser.runtime.getPlatformInfo();
  } catch (_) {
    _plat = { os: "unknown" };
  }
  _plat.mobile = _plat.os === "android";
  return _plat;
}
async function isMobile() {
  return (await plat()).mobile;
}
async function openExtUi(url, winOpts) {
  if (await isMobile()) return browser.tabs.create({ url });
  if (winOpts) {
    try {
      return await browser.windows.create({ url, ...winOpts });
    } catch (_) {}
  }
  return browser.tabs.create({ url });
}

browser.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  createMenus();
});
browser.runtime.onStartup.addListener(createMenus);

function createMenus() {
  if (!browser.contextMenus || !browser.contextMenus.create) return;
  try {
    browser.contextMenus.removeAll().then(() => {
      const items = [
        ["visible", "Видимая область", ["page", "frame", "image", "video", "editable"]],
        ["region", "Выделить область", ["page", "frame", "image", "video", "editable"]],
        ["full", "Вся страница", ["page", "frame"]],
        ["element", "Элемент", ["page", "frame"]],
        ["scroll", "Скролл колонки / чата", ["page", "frame"]],
        ["timer", "Таймер 5 сек", ["page", "frame"]],
        ["wait", "Снять после изменения", ["page", "frame"]],
        ["hideui", "Скрыть UI сайта", ["page", "frame"]],
        ["gif", "GIF области", ["page", "frame"]],
        ["video-frame", "Кадр из видео", ["page", "frame", "video"]],
        ["selection", "Снимок выделенного текста", ["selection"]],
      ];
      items.forEach(([id, title, contexts]) => {
        browser.contextMenus.create({ id, title, contexts });
      });
    });
  } catch (e) {
    console.warn(e);
  }
}

if (browser.contextMenus && browser.contextMenus.onClicked) {
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab || tab.id == null) return;
    if (info.menuItemId === "selection") startCapture("selection", tab.id);
    else startCapture(info.menuItemId, tab.id);
  });
}

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    const tab = await getActiveTab();
    if (!tab) return;
    const map = {
      "capture-visible": "visible",
      "capture-region": "region",
      "capture-full": "full",
      "capture-element": "element",
      "capture-repeat": "repeat",
      "capture-timer": "timer",
    };
    const mode = map[command];
    if (mode) startCapture(mode, tab.id);
  });
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;
  const tabId = sender.tab && sender.tab.id;
  const handlers = {
    SS_CAPTURE: async () => {
      let tabId = msg.tabId;
      if (tabId == null) {
        const tab = await getActiveTab();
        tabId = tab && tab.id;
      }
      if (tabId == null) throw new Error("Нет активной вкладки. Откройте сайт и нажмите снова.");
      await setBusy(true, "…");
      try {
        await startCapture(msg.mode, tabId, msg.opts || {});
        return { ok: true };
      } finally {
        await setBusy(false);
      }
    },
    SS_REGION_RESULT: () => finishRegion(tabId, msg),
    SS_PICKER_RESULT: () => finishPicker(msg),
    SS_PICKER_CANCEL: async () => {
      if (msg.id) await SSIDB.del(msg.id).catch(() => {});
    },
    SS_ELEMENT_RESULT: () => finishElement(tabId, msg.rect, msg.scrollInner, msg.pointer),
    SS_CANCEL: () => teardownOverlay(tabId),
    SS_ABORT: async () => { abortCapture = true; await teardownOverlay(tabId); },
    SS_TIMER_FIRE: async () => {
      const tab = await browser.tabs.get(tabId);
      const shot = await captureVisible(tab);
      await deliver(await stampPointer(shot, msg.pointer), { mode: "timer", title: tab.title, url: tab.url });
    },
    SS_HIDDEN_CAPTURE: async () => {
      const tab = await browser.tabs.get(tabId);
      await sleep(40);
      const shot = await captureVisible(tab);
      try {
        await evalInTab(tabId, () => {
          if (typeof window.__SS_RESTORE_HIDE__ === "function") window.__SS_RESTORE_HIDE__();
        });
      } catch (_) {}
      await deliver(await stampPointer(shot, msg.pointer), { mode: "hideui", title: tab.title, url: tab.url });
    },
    SS_SCROLL_START: () => runScrollRect(tabId, msg.rect, msg.pointer),
    SS_GIF_START: () => runGif(tabId, msg.rect, msg.ms, msg.pointer),
    SS_VIDEO_PICKED: () => runVideoFrame(tabId),
    SS_OPEN_EDITOR: () => openEditor(msg.id),
    SS_OPEN_HISTORY: () => browser.tabs.create({ url: browser.runtime.getURL("history/history.html") }),
    SS_OPEN_PIN: () => openPin(msg.id),
    SS_GET_DEFAULTS: () => loadSettings(),
    SS_IDB_GET: () => SSIDB.get(msg.id),
    SS_IDB_PUT: () => SSIDB.put(msg.record),
    SS_IDB_LIST: () => SSIDB.list(),
    SS_IDB_DEL: () => SSIDB.del(msg.id),
    SS_UPLOAD: () => uploadShot(msg.dataUrl),
    SS_OCR: () => runWindowsOcr(msg.image),
    SS_OCR_PING: () => pingWindowsOcr(),
    SS_FAV: async () => {
      const rec = await SSIDB.get(msg.id);
      if (!rec) return;
      rec.favorite = !rec.favorite;
      await SSIDB.put(rec);
      return { favorite: rec.favorite };
    },
  };
  if (handlers[msg.type]) {
    return Promise.resolve(handlers[msg.type]()).then((r) => r || { ok: true }).catch((e) => {
      notify("СкринСтудия", String(e.message || e));
      throw e;
    });
  }
});

async function ensureDefaults() {
  const cur = await browser.storage.local.get("settings");
  const next = { ...DEFAULTS, ...(cur.settings || {}) };
  if (next.stampPointerMigrated !== 1) {
    next.includeCursor = false;
    next.includeClicks = false;
    next.stampPointerMigrated = 1;
  }
  await browser.storage.local.set({ settings: next });
}

async function loadSettings() {
  const cur = await browser.storage.local.get("settings");
  return { ...DEFAULTS, ...(cur.settings || {}) };
}

function isPageTab(t) {
  if (!t || t.id == null) return false;
  const url = String(t.url || "");
  if (url.startsWith("moz-extension:")) return false;
  return true;
}

async function getActiveTab() {
  const queries = [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
    { active: true },
  ];
  for (const q of queries) {
    try {
      const tabs = await browser.tabs.query(q);
      const page = tabs.find(isPageTab);
      if (page) return page;
    } catch (_) {}
  }
  try {
    const wins = await browser.windows.getAll({ populate: true, windowTypes: ["normal"] });
    for (const w of wins) {
      const t = (w.tabs || []).find((x) => x.active && isPageTab(x));
      if (t) return t;
    }
  } catch (_) {}
  return null;
}

function isRestricted(url) {
  if (!url) return true;
  if (/^(about:|moz-extension:|chrome:|resource:|view-source:|jar:|data:)/i.test(url)) return true;
  try {
    const host = new URL(url).hostname;
    if (
      /^(addons\.mozilla\.org|addons\.cdn\.mozilla\.net|accounts\.firefox\.com|support\.mozilla\.org|discovery\.addons\.mozilla\.org|oauth\.accounts\.firefox\.com|profile\.accounts\.firefox\.com|install\.mozilla\.org)$/i.test(
        host
      )
    ) {
      return true;
    }
  } catch (_) {}
  return false;
}

async function captureNativeWindow() {
  if (await isMobile()) {
    throw new Error(
      "На Firefox для Android защищённые страницы (about:, магазины Mozilla) снять нельзя — так устроен браузер."
    );
  }
  await sleep(80);
  try {
    const res = await browser.runtime.sendNativeMessage("screenshot_studio_ocr", { action: "capture" });
    if (!res || !res.ok || !res.dataUrl) {
      throw new Error((res && (res.error || res.message)) || "native capture failed");
    }
    const size = await measureDataUrl(res.dataUrl);
    return {
      dataUrl: res.dataUrl,
      width: size.width,
      height: size.height,
      viewport: { w: size.width, h: size.height, dpr: 1 },
      native: true,
    };
  } catch (e) {
    const m = String(e.message || e);
    if (/no such native application|disconnected|not found/i.test(m)) {
      throw new Error(
        "Для защищённых страниц нужен Windows-host. Запустите native\\install-ocr-host.ps1 и перезапустите Firefox."
      );
    }
    throw e;
  }
}

async function captureVisibleOrNative(tab) {
  try {
    return await captureVisible(tab);
  } catch (e) {
    try {
      return await captureNativeWindow();
    } catch (_) {
      throw e;
    }
  }
}

async function startCapture(mode, tabId, opts = {}) {
  if (mode === "repeat") {
    const st = await browser.storage.local.get("lastMode");
    mode = st.lastMode || "region";
  }
  lastMode = mode;
  await browser.storage.local.set({ lastMode: mode });

  const tab = await browser.tabs.get(tabId);
  const restricted = isRestricted(tab.url);
  const settings = await loadSettings();

  if (restricted) {
    const shot = await captureVisibleOrNative(tab);
    if (mode === "region" || mode === "custom" || mode === "multi" || mode === "element" || mode === "gif" || mode === "scroll") {
      await openRegionPicker(shot, { mode: "region", title: tab.title, url: tab.url, urlPage: tab.url, multi: mode === "multi" });
      return;
    }
    notify(
      "Защищённая страница",
      "Firefox не отдаёт вкладку — снят кадр окна браузера."
    );
    await deliver(shot, { mode: mode + "-native", title: tab.title, url: tab.url });
    return;
  }

  const overlayOrNative = async (send) => {
    try {
      const ok = await injectOverlay(tabId);
      if (!ok) throw new Error("no overlay");
      await send();
    } catch (e) {
      notify("Снимаю окно", "На этой странице нельзя внедрить оверлей.");
      const shot = await captureVisibleOrNative(tab);
      await deliver(shot, { mode: mode + "-native", title: tab.title, url: tab.url });
    }
  };

  if (mode === "timer" || mode === "delay") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_TIMER", ms: opts.delayMs || settings.delayMs || 5000 }));
    return;
  }
  if (mode === "wait") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_WAIT" }));
    return;
  }
  if (mode === "hideui") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_HIDE_UI_PICK" }));
    return;
  }
  if (mode === "scroll") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_SCROLL_REGION" }));
    return;
  }
  if (mode === "gif") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_GIF_REGION" }));
    return;
  }
  if (mode === "scroll-video") {
    abortCapture = false;
    const shot = await recordScrollVideo(tab, settings);
    await deliver(shot, { mode: "scroll-video", title: tab.title, url: tab.url, kind: "webm" });
    return;
  }
  if (mode === "video-frame") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_VIDEO_FRAME" }));
    return;
  }
  if (mode === "selection") {
    await captureSelection(tab);
    return;
  }

  if (mode === "visible") {
    const shot = await captureVisibleOrNative(tab);
    await teardownOverlay(tabId);
    await deliver(await stampPointer(shot, opts.pointer), { mode, title: tab.title, url: tab.url });
    return;
  }
  if (mode === "full") {
    abortCapture = false;
    try {
      const shot = await captureFullPage(tab, settings);
      await teardownOverlay(tabId);
      await deliver(shot, { mode, title: tab.title, url: tab.url });
    } catch (e) {
      notify("Снимаю окно", "Полный снимок страницы недоступен — снято видимое окно.");
      const shot = await captureNativeWindow();
      await deliver(shot, { mode: "full-native", title: tab.title, url: tab.url });
    }
    return;
  }
  if (mode === "region" || mode === "custom" || mode === "multi") {
    const shot = await captureVisibleOrNative(tab);
    try {
      const ok = await injectOverlay(tabId);
      if (!ok) throw new Error("no overlay");
      await sendToTab(tabId, { type: "SS_REGION", dataUrl: shot.dataUrl, viewport: shot.viewport, multi: mode === "multi" });
    } catch (e) {
      await openRegionPicker(shot, { mode: "region", title: tab.title, url: tab.url, multi: mode === "multi" });
    }
    return;
  }
  if (mode === "element") {
    await overlayOrNative(() => sendToTab(tabId, { type: "SS_ELEMENT" }));
  }
}

async function finishRegion(tabId, msg) {
  try {
    const tab = tabId != null ? await browser.tabs.get(tabId) : null;
    const act = msg.act;
    const rects = msg.rects && msg.rects.length ? msg.rects : [msg.rect];

    if (act === "scroll") {
      await teardownOverlay(tabId);
      await runScrollRect(tabId, rects[0], msg.pointer);
      return;
    }
    if (act === "gif") {
      await teardownOverlay(tabId);
      await runGif(tabId, rects[0], 10000, msg.pointer);
      return;
    }

    let shot;
    if (rects.length === 1) {
      shot = await cropDataUrl(msg.dataUrl, rects[0], msg.viewport);
    } else {
      shot = await composeRects(msg.dataUrl, rects, msg.viewport);
    }
    shot.viewport = msg.viewport;

    await teardownOverlay(tabId);
    const meta = { mode: "region", title: tab ? tab.title : "", url: tab ? tab.url : "", act };

    if (act === "pin") {
      const id = await storeShot(shot, meta);
      await openPin(id);
      return;
    }
    if (act === "search") {
      await deliver(shot, { ...meta, act: "copy" });
      await browser.tabs.create({ url: "https://images.google.com/" });
      notify("Поиск по картинке", "Снимок в буфере — вставьте Ctrl+V на странице Google Картинок.");
      return;
    }
    await deliver(shot, meta);
  } catch (e) {
    await teardownOverlay(tabId);
    notify("Ошибка", String(e.message || e));
  }
}

async function finishElement(tabId, rect, scrollInner, pointer) {
  const tab = await browser.tabs.get(tabId);
  const settings = await loadSettings();
  try {
    await sendToTab(tabId, { type: "SS_HIDE_UI" });
    await sleep(30);
    let shot;
    if (scrollInner && rect.scrollH > rect.clientH + 8) {
      shot = await captureElementScroll(tab, rect);
    } else if (rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= rect.vw && rect.y + rect.h <= rect.vh) {
      shot = await captureVisible(tab);
      shot = await cropDataUrl(shot.dataUrl, rect, { w: shot.viewport.w, h: shot.viewport.h });
    } else {
      shot = await captureFullPage(tab, settings);
      const scaleX = shot.width / rect.docW;
      const scaleY = shot.height / rect.docH;
      shot = await cropPixels(shot.dataUrl, {
        x: Math.round(rect.docX * scaleX),
        y: Math.round(rect.docY * scaleY),
        w: Math.round(rect.docWBox * scaleX),
        h: Math.round(rect.docHBox * scaleY),
      });
    }
    shot = await stampPointer(shot, pointer, settings, true);
    await teardownOverlay(tabId);
    await deliver(shot, { mode: "element", title: tab.title, url: tab.url });
  } catch (e) {
    await teardownOverlay(tabId);
    notify("Не удалось снять элемент", String(e.message || e));
  }
}

async function captureSelection(tab) {
  const box = await evalInTab(tab.id, () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const rects = [...sel.getRangeAt(0).getClientRects()];
    if (!rects.length) return null;
    let x = Infinity, y = Infinity, r = 0, b = 0;
    rects.forEach((rc) => {
      x = Math.min(x, rc.left);
      y = Math.min(y, rc.top);
      r = Math.max(r, rc.right);
      b = Math.max(b, rc.bottom);
    });
    const pad = 8;
    return { x: x - pad, y: y - pad, w: r - x + pad * 2, h: b - y + pad * 2, vw: innerWidth, vh: innerHeight, text: sel.toString() };
  });
  if (!box) {
    notify("Нет выделения", "Выделите текст на странице.");
    return;
  }
  const vis = await captureVisible(tab);
  let shot = await cropDataUrl(vis.dataUrl, box, vis.viewport);
  const img = await loadImage(shot.dataUrl);
  const c = makeCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.strokeStyle = "#ff6a3d";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, img.width - 4, img.height - 4);
  shot = { dataUrl: await canvasPng(c), width: img.width, height: img.height };
  await deliver(shot, { mode: "selection", title: tab.title, url: tab.url, text: box.text });
}

async function runScrollRect(tabId, rect, pointer) {
  const tab = await browser.tabs.get(tabId);
  await setBusy(true, "скролл");
  abortCapture = false;
  try {
    const shot = await captureScrollColumn(tab, rect);
    await deliver(await stampPointer(shot, pointer), { mode: "scroll", title: tab.title, url: tab.url });
  } finally {
    await setBusy(false);
  }
}

async function captureScrollColumn(tab, rect) {
  const info = await evalInTab(tab.id, (rect) => {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    let el = document.elementFromPoint(cx, cy);
    while (el && el !== document.documentElement) {
      const st = getComputedStyle(el);
      const oy = st.overflowY;
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 12) {
        window.__SS_SCROLL_EL__ = el;
        return { kind: "el", start: el.scrollTop, max: el.scrollHeight, client: el.clientHeight };
      }
      el = el.parentElement;
    }
    window.__SS_SCROLL_EL__ = null;
    return { kind: "page", start: window.scrollY, max: document.documentElement.scrollHeight, client: window.innerHeight };
  }, rect);

  const pieces = [];
  if (info.kind === "el") {
    await evalInTab(tab.id, () => { if (window.__SS_SCROLL_EL__) window.__SS_SCROLL_EL__.scrollTop = 0; });
    let last = -1;
    for (let i = 0; i < 80; i++) {
      if (abortCapture) break;
      await sleep(160);
      const vis = await captureVisible(tab);
      const box = await evalInTab(tab.id, () => {
        const el = window.__SS_SCROLL_EL__;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, top: el.scrollTop };
      });
      if (!box) break;
      pieces.push(await cropDataUrl(vis.dataUrl, box, vis.viewport));
      const next = await evalInTab(tab.id, (step) => {
        const el = window.__SS_SCROLL_EL__;
        if (!el) return { top: 0, done: true };
        const before = el.scrollTop;
        el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + step);
        return { top: el.scrollTop, done: el.scrollTop === before || el.scrollTop + el.clientHeight >= el.scrollHeight - 1 };
      }, Math.max(40, info.client * 0.85));
      if (next.done || next.top === last) break;
      last = next.top;
    }
    await evalInTab(tab.id, (s) => { if (window.__SS_SCROLL_EL__) window.__SS_SCROLL_EL__.scrollTop = s; }, info.start);
  } else {
    const origin = await evalInTab(tab.id, () => window.scrollY);
    let last = -1;
    for (let i = 0; i < 80; i++) {
      if (abortCapture) break;
      await sleep(160);
      const vis = await captureVisible(tab);
      pieces.push(await cropDataUrl(vis.dataUrl, rect, vis.viewport));
      const next = await evalInTab(tab.id, (step) => {
        const before = window.scrollY;
        window.scrollBy(0, step);
        return { y: window.scrollY, done: window.scrollY === before };
      }, Math.max(40, rect.h * 0.85));
      if (next.done || next.y === last) break;
      last = next.y;
    }
    await evalInTab(tab.id, (y) => window.scrollTo(window.scrollX, y), origin);
  }
  if (!pieces.length) throw new Error("Пустой скролл");
  return stackShots(pieces, 0);
}

async function captureElementScroll(tab, rect) {
  await evalInTab(tab.id, (r) => {
    const el = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2);
    window.__SS_SCROLL_EL__ = el;
    if (el) el.scrollTop = 0;
  }, rect);
  return captureScrollColumn(tab, rect);
}

async function runGif(tabId, rect, ms, pointer) {
  const tab = await browser.tabs.get(tabId);
  await setBusy(true, "GIF");
  abortCapture = false;
  try {
    const frames = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (abortCapture) break;
      const vis = await captureVisible(tab);
      const crop = await cropDataUrl(vis.dataUrl, rect, vis.viewport);
      const img = await loadImage(crop.dataUrl);
      const maxW = 560;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const c = makeCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (pointer && pointer.cursor) {
        ctx.fillStyle = "#ff2d55";
        ctx.beginPath();
        ctx.arc((pointer.cursor.x - rect.x) * scale, (pointer.cursor.y - rect.y) * scale, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      frames.push(ctx.getImageData(0, 0, c.width, c.height));
      await sleep(120);
    }
    const dataUrl = SSGif.encodeGif(frames, 12);
    const f0 = frames[0];
    await deliver({ dataUrl, width: f0.width, height: f0.height }, { mode: "gif", title: tab.title, url: tab.url, kind: "gif" });
  } finally {
    await setBusy(false);
  }
}

async function recordScrollVideo(tab, settings) {
  await setBusy(true, "видео");
  abortCapture = false;
  try {
    const metrics = await evalInTab(tab.id, () => ({
      h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
      vh: innerHeight,
      sy: scrollY,
    }));
    const vis0 = await captureVisible(tab);
    const w = vis0.width, h = vis0.height;
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!canvas.captureStream) {
      const pieces = [];
      await evalInTab(tab.id, () => scrollTo(0, 0));
      let y = -1;
      while (!abortCapture) {
        await sleep(180);
        const vis = await captureVisible(tab);
        const img = await loadImage(vis.dataUrl);
        ctx.drawImage(img, 0, 0);
        pieces.push(ctx.getImageData(0, 0, w, h));
        const n = await evalInTab(tab.id, (s) => {
          const b = scrollY;
          scrollBy(0, s);
          return { y: scrollY, done: scrollY === b };
        }, metrics.vh * 0.8);
        if (n.done || n.y === y) break;
        y = n.y;
      }
      await evalInTab(tab.id, (y) => scrollTo(0, y), metrics.sy);
      const dataUrl = SSGif.encodeGif(pieces, 14);
      return { dataUrl, width: w, height: h };
    }
    const stream = canvas.captureStream(8);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.start();
    await evalInTab(tab.id, () => scrollTo(0, 0));
    let y = -1;
    while (!abortCapture) {
      await sleep(180);
      const vis = await captureVisible(tab);
      ctx.drawImage(await loadImage(vis.dataUrl), 0, 0, w, h);
      const n = await evalInTab(tab.id, (s) => {
        const b = scrollY;
        scrollBy(0, s);
        return { y: scrollY, done: scrollY === b };
      }, metrics.vh * 0.75);
      if (n.done || n.y === y) break;
      y = n.y;
    }
    rec.stop();
    await new Promise((r) => { rec.onstop = r; });
    await evalInTab(tab.id, (y) => scrollTo(0, y), metrics.sy);
    const blob = new Blob(chunks, { type: "video/webm" });
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, width: w, height: h };
  } finally {
    await setBusy(false);
    void settings;
  }
}

async function runVideoFrame(tabId) {
  const tab = await browser.tabs.get(tabId);
  const dataUrl = await evalInTab(tab.id, () => {
    const v = document.querySelector("video");
    if (!v) return null;
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 360;
      c.getContext("2d").drawImage(v, 0, 0);
      return c.toDataURL("image/png");
    } catch (e) {
      return { fail: true };
    }
  });
  await teardownOverlay(tabId);
  if (dataUrl && typeof dataUrl === "string") {
    const size = await measureDataUrl(dataUrl);
    await deliver({ dataUrl, width: size.width, height: size.height }, { mode: "video-frame", title: tab.title, url: tab.url });
    return;
  }
  const vis = await captureVisible(tab);
  const box = await evalInTab(tab.id, () => {
    const v = document.querySelector("video");
    if (!v) return null;
    const r = v.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const shot = box ? await cropDataUrl(vis.dataUrl, box, vis.viewport) : vis;
  await deliver(shot, { mode: "video-frame", title: tab.title, url: tab.url });
}

async function storeShot(shot, meta) {
  const id = uid();
  const thumb = await makeThumb(shot.dataUrl);
  await SSIDB.put({
    id,
    dataUrl: shot.dataUrl,
    width: shot.width,
    height: shot.height,
    thumb,
    favorite: false,
    meta: { ...meta, createdAt: Date.now() },
  });
  await browser.storage.local.set({ lastCaptureId: id });
  await browser.storage.session.set({ [CAPTURE_ID_KEY]: id }).catch(() => {});
  return id;
}

async function deliver(shot, meta) {
  const settings = await loadSettings();
  const id = await storeShot(shot, meta);
  const act = meta.act || settings.afterCapture;

  if (act === "save" || act === "download") {
    await downloadDataUrl(shot.dataUrl, makeFilename(settings, extOf(shot.dataUrl), meta));
    if (settings.quietToast) notify("Сохранено", makeFilename(settings, extOf(shot.dataUrl), meta));
    return;
  }
  if (act === "copy" || act === "quiet") {
    await openQuiet(id);
    return;
  }
  if (act === "pin") {
    await openPin(id);
    return;
  }
  await openEditor(id);
}

function extOf(dataUrl) {
  if (dataUrl.startsWith("data:image/gif")) return "gif";
  if (dataUrl.startsWith("data:video/webm")) return "webm";
  if (dataUrl.startsWith("data:image/jpeg")) return "jpg";
  return "png";
}

async function openEditor(id, extra = {}) {
  if (!id) {
    await browser.tabs.create({ url: browser.runtime.getURL("editor/editor.html") });
    return { ok: true };
  }
  const q = extra.compare ? `&compare=${encodeURIComponent(extra.compare)}` : "";
  const url = browser.runtime.getURL(`editor/editor.html?id=${encodeURIComponent(id)}${extra.autCopy ? "&copy=1" : ""}${q}`);
  await browser.tabs.create({ url });
  return { ok: true };
}

async function openPin(id) {
  const rec = await SSIDB.get(id);
  const w = Math.min(520, (rec && rec.width) || 400);
  const h = Math.min(700, ((rec && rec.height) || 300) + 48);
  const opts = {
    url: browser.runtime.getURL(`pin/pin.html?id=${encodeURIComponent(id)}`),
    type: "popup",
    width: Math.max(280, w),
    height: Math.max(200, h),
  };
  await openExtUi(opts.url, { type: "popup", width: opts.width, height: opts.height, alwaysOnTop: true });
}

async function openQuiet(id) {
  const url = browser.runtime.getURL(`quiet/quiet.html?id=${encodeURIComponent(id)}`);
  await openExtUi(url, { type: "popup", width: 360, height: 220 });
}

async function captureVisible(tab) {
  const metrics = await evalInTab(tab.id, () => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    sx: window.scrollX,
    sy: window.scrollY,
    docW: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
    docH: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
  }));
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const size = await measureDataUrl(dataUrl);
  return { dataUrl, width: size.width, height: size.height, viewport: metrics };
}

async function captureFullPage(tab, settings) {
  await setBusy(true, "склейка");
  abortCapture = false;
  await injectOverlay(tab.id);
  await sendToTab(tab.id, { type: "SS_STATUS", text: "Склеиваю страницу… Отмена внизу" }).catch(() => {});
  const prepared = await evalInTab(tab.id, (opts) => {
    const html = document.documentElement;
    const body = document.body;
    const restore = [];
    const push = (el, prop, val) => {
      restore.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
      el.style.setProperty(prop, val, "important");
    };
    if (opts.hideScrollbars) {
      push(html, "overflow", "hidden");
      if (body) push(body, "overflow", "hidden");
    }
    const hiddenFixed = [];
    if (opts.hideFixed) {
      const all = document.querySelectorAll("body *");
      const limit = Math.min(all.length, 8000);
      for (let i = 0; i < limit; i++) {
        const el = all[i];
        if (el.id === "ss-overlay-root" || (el.closest && el.closest("#ss-overlay-root"))) continue;
        const st = getComputedStyle(el);
        if (st.position === "fixed" || st.position === "sticky") {
          hiddenFixed.push([el, el.style.getPropertyValue("visibility"), el.style.getPropertyPriority("visibility")]);
          el.style.setProperty("visibility", "hidden", "important");
        }
      }
    }
    window.__SS_RESTORE__ = () => {
      restore.forEach(([el, prop, val, pri]) => val ? el.style.setProperty(prop, val, pri) : el.style.removeProperty(prop));
      hiddenFixed.forEach(([el, val, pri]) => val ? el.style.setProperty("visibility", val, pri) : el.style.removeProperty("visibility"));
    };
    return {
      w: Math.max(html.scrollWidth, body ? body.scrollWidth : 0, html.clientWidth),
      h: Math.max(html.scrollHeight, body ? body.scrollHeight : 0, html.clientHeight),
      vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio || 1,
      sx: window.scrollX, sy: window.scrollY,
    };
  }, { hideFixed: settings.hideFixed, hideScrollbars: settings.hideScrollbars });

  const MAX = 16384;
  const outW = Math.ceil(prepared.w * prepared.dpr);
  const outH = Math.ceil(prepared.h * prepared.dpr);
  const scale = Math.min(1, MAX / outW, MAX / outH);
  const canvas = makeCanvas(Math.max(1, Math.floor(outW * scale)), Math.max(1, Math.floor(outH * scale)));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const overlap = 64;
  const stepX = Math.max(50, prepared.vw - overlap);
  const stepY = Math.max(50, prepared.vh - overlap);
  try {
    for (let y = 0; y < prepared.h && !abortCapture; y += stepY) {
      for (let x = 0; x < prepared.w && !abortCapture; x += stepX) {
        await evalInTab(tab.id, (px, py) => window.scrollTo(px, py), x, y);
        await sleep(170);
        const pos = await evalInTab(tab.id, () => ({ x: window.scrollX, y: window.scrollY }));
        const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        const img = await loadImage(dataUrl);
        ctx.drawImage(img, Math.round(pos.x * prepared.dpr * scale), Math.round(pos.y * prepared.dpr * scale), Math.round(img.width * scale), Math.round(img.height * scale));
      }
    }
  } finally {
    try {
      await evalInTab(tab.id, () => { if (typeof window.__SS_RESTORE__ === "function") window.__SS_RESTORE__(); });
      await evalInTab(tab.id, (x, y) => window.scrollTo(x, y), prepared.sx, prepared.sy);
    } catch (_) {}
    await teardownOverlay(tab.id);
    await setBusy(false);
  }
  return { dataUrl: await canvasPng(canvas), width: canvas.width, height: canvas.height, viewport: prepared };
}

async function stampPointer(shot, pointer, settings, forceViewport) {
  settings = settings || (await loadSettings());
  if (!pointer || (!settings.includeCursor && !settings.includeClicks)) return shot;
  const img = await loadImage(shot.dataUrl);
  const c = makeCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const vw = (shot.viewport && shot.viewport.w) || img.width;
  const vh = (shot.viewport && shot.viewport.h) || img.height;
  const sx = forceViewport ? img.width / vw : img.width / vw;
  const sy = img.height / vh;
  if (settings.includeCursor && pointer.cursor) {
    drawCursor(ctx, pointer.cursor.x * sx, pointer.cursor.y * sy);
  }
  if (settings.includeClicks && pointer.click) {
    drawClick(ctx, pointer.click.x * sx, pointer.click.y * sy);
  }
  return { ...shot, dataUrl: await canvasPng(c), width: img.width, height: img.height };
}

function drawCursor(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineTo(5, 14);
  ctx.lineTo(9, 22);
  ctx.lineTo(12, 20);
  ctx.lineTo(8, 12);
  ctx.lineTo(14, 12);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawClick(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,45,85,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

async function composeRects(dataUrl, rects, viewport) {
  const img = await loadImage(dataUrl);
  const sx = viewport && viewport.w ? img.width / viewport.w : 1;
  const sy = viewport && viewport.h ? img.height / viewport.h : 1;
  const boxes = rects.map((r) => ({
    x: Math.round(r.x * sx),
    y: Math.round(r.y * sy),
    w: Math.max(1, Math.round(r.w * sx)),
    h: Math.max(1, Math.round(r.h * sy)),
  }));
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const c = makeCanvas(width, height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0c1016";
  ctx.fillRect(0, 0, width, height);
  for (const b of boxes) {
    ctx.drawImage(img, b.x, b.y, b.w, b.h, b.x - minX, b.y - minY, b.w, b.h);
  }
  return { dataUrl: await canvasPng(c), width, height };
}

async function stackShots(shots, gap) {
  gap = gap == null ? 16 : gap;
  const w = Math.max(...shots.map((s) => s.width));
  const h = shots.reduce((a, s) => a + s.height, 0) + gap * (shots.length - 1);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0c1016";
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  for (const s of shots) {
    const img = await loadImage(s.dataUrl);
    ctx.drawImage(img, 0, y);
    y += s.height + gap;
  }
  return { dataUrl: await canvasPng(c), width: w, height: h };
}

async function makeThumb(dataUrl) {
  try {
    const img = await loadImage(dataUrl);
    const w = 240;
    const h = Math.max(1, Math.round((img.height / img.width) * w));
    const c = makeCanvas(w, h);
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    if (c.toDataURL) return c.toDataURL("image/jpeg", 0.65);
    return dataUrl;
  } catch (_) {
    return dataUrl;
  }
}

async function pingWindowsOcr() {
  try {
    return await browser.runtime.sendNativeMessage("screenshot_studio_ocr", { ping: true });
  } catch (e) {
    return { ok: false, error: "not_installed", message: String(e.message || e) };
  }
}

async function runWindowsOcr(dataUrl) {
  if (!dataUrl) throw new Error("no image");
  try {
    const res = await browser.runtime.sendNativeMessage("screenshot_studio_ocr", { image: dataUrl });
    if (res && res.ok) return res;
    return { ok: false, error: (res && res.error) || "empty" };
  } catch (e) {
    const m = String(e.message || e);
    if (/no such native application|disconnected|not found/i.test(m)) {
      return { ok: false, error: "not_installed", message: m };
    }
    return { ok: false, error: m };
  }
}

async function uploadShot(dataUrl) {
  const settings = await loadSettings();
  const b64 = dataUrl.split(",")[1];
  if (settings.imgbbKey) {
    const body = new URLSearchParams();
    body.set("key", settings.imgbbKey);
    body.set("image", b64);
    const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
    const json = await res.json();
    if (!json.success) throw new Error((json.error && json.error.message) || "ImgBB error");
    return { url: json.data.url, page: json.data.url_viewer };
  }
  if (settings.uploadUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append("file", blob, "screenshot.png");
    const res = await fetch(settings.uploadUrl, { method: "POST", body: fd });
    const json = await res.json().catch(() => ({ url: res.url }));
    return { url: json.url || json.link || json.data && json.data.url };
  }
  throw new Error("Укажите ImgBB ключ или URL загрузки в настройках");
}

async function setBusy(on, label) {
  try {
    if (!browser.action || !browser.action.setBadgeText) return;
    await browser.action.setBadgeBackgroundColor({ color: "#ff6a3d" });
    await browser.action.setBadgeText({ text: on ? (label ? label.slice(0, 4) : "…") : "" });
  } catch (_) {}
}

async function pingOverlay(tabId) {
  try {
    const ping = await sendToTab(tabId, { type: "SS_PING" });
    return !!(ping && ping.ok);
  } catch (_) {
    return false;
  }
}

async function injectOverlay(tabId) {
  if (await pingOverlay(tabId)) return true;
  try {
    await evalInTab(tabId, () => {
      try { delete window.__SS_OVERLAY__; } catch (_) {}
    });
  } catch (_) {}
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["shared/i18n.js", "capture/overlay.js"],
    });
  } catch (_) {
    return false;
  }
  await sleep(60);
  return pingOverlay(tabId);
}

async function openRegionPicker(shot, meta) {
  const id = await storeShot(shot, { ...meta, pendingRegion: true });
  const url = browser.runtime.getURL(`capture/picker.html?id=${encodeURIComponent(id)}`);
  await openExtUi(url, { type: "popup", state: "maximized" });
}

async function finishPicker(msg) {
  const rec = await SSIDB.get(msg.id);
  if (!rec || !rec.dataUrl) throw new Error("Снимок не найден");
  const rects = (msg.rects || []).filter((r) => r && r.w > 2 && r.h > 2);
  if (!rects.length) throw new Error("Область не выделена");
  const shot =
    rects.length === 1
      ? await cropPixels(rec.dataUrl, rects[0])
      : await composeRects(rec.dataUrl, rects);
  await SSIDB.del(msg.id).catch(() => {});
  await deliver(shot, { ...(rec.meta || {}), mode: "region", act: msg.act, pendingRegion: false });
}

async function teardownOverlay(tabId) {
  if (tabId == null) return;
  try { await sendToTab(tabId, { type: "SS_TEARDOWN" }); } catch (_) {}
}

function sendToTab(tabId, msg) { return browser.tabs.sendMessage(tabId, msg); }

async function evalInTab(tabId, func, ...args) {
  const res = await browser.scripting.executeScript({ target: { tabId }, func, args });
  if (!res || !res[0]) return null;
  if (res[0].error) throw res[0].error;
  return res[0].result;
}

function makeCanvas(w, h) {
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

async function canvasPng(canvas) {
  if (typeof canvas.toDataURL === "function") return canvas.toDataURL("image/png");
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать снимок"));
    img.src = dataUrl;
  });
}

function measureDataUrl(dataUrl) {
  return loadImage(dataUrl).then((img) => ({ width: img.naturalWidth, height: img.naturalHeight }));
}

async function cropDataUrl(dataUrl, rect, viewport) {
  const img = await loadImage(dataUrl);
  const sx = img.width / viewport.w;
  const sy = img.height / viewport.h;
  return cropPixels(dataUrl, {
    x: Math.round(rect.x * sx), y: Math.round(rect.y * sy),
    w: Math.round(rect.w * sx), h: Math.round(rect.h * sy),
  }, img);
}

async function cropPixels(dataUrl, box, img) {
  img = img || (await loadImage(dataUrl));
  const x = clamp(box.x, 0, img.width - 1);
  const y = clamp(box.y, 0, img.height - 1);
  const w = clamp(box.w, 1, img.width - x);
  const h = clamp(box.h, 1, img.height - y);
  const canvas = makeCanvas(w, h);
  canvas.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
  return { dataUrl: await canvasPng(canvas), width: w, height: h };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function uid() { return "ss_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function notify(title, message) {
  try {
    if (browser.notifications && browser.notifications.create) {
      browser.notifications.create({ type: "basic", iconUrl: "icons/icon-48.png", title, message });
    }
  } catch (_) {}
}

function makeFilename(settings, ext, meta) {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, "-");
  let host = "site", title = "page";
  try {
    host = new URL(meta && meta.url || "https://site.local").hostname.replace(/^www\./, "");
    title = String((meta && meta.title) || "page").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "page";
  } catch (_) {}
  const base = (settings.filenamePattern || "{site}-{title}-{date}-{time}")
    .replace("{date}", date).replace("{time}", time)
    .replace("{site}", host).replace("{title}", title)
    .replace("{mode}", (meta && meta.mode) || "shot");
  const folder = settings.autoFolder ? `Screenshots/${host}/` : "";
  return `${folder}${base}.${ext}`;
}

async function downloadDataUrl(dataUrl, filename) {
  await browser.downloads.download({ url: dataUrl, filename, saveAs: true });
}

createMenus();
