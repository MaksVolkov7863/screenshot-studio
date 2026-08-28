(() => {
  const wait = () => new Promise((r) => {
    const t = setInterval(() => {
      if (window.SSApp) { clearInterval(t); r(window.SSApp); }
    }, 20);
  });

  wait().then((App) => boot(App));

  function boot(App) {
    const { state, $, toast, E } = App;
    window.SSHooks = window.SSHooks || {};
    App.stepScheme = "num";
    App.stepParent = "";
    state.selectedIds = state.selectedIds || [];
    state.guides = { rulers: false, grid: false, measure: false };
    state.deviceFrame = "none";
    state.compare = null;

    injectCss();
    injectUi();
    bindUi();
    loadPrefs();
    drawMinimap();

    SSHooks.afterImage = (ctx, filtered) => {
      if (state.compareImage && state.compare != null) {
        const x = filtered.width * state.compare;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, filtered.width - x, filtered.height);
        ctx.clip();
        ctx.drawImage(state.compareImage, 0, 0, filtered.width, filtered.height);
        ctx.restore();
        ctx.fillStyle = "#3dc4ff";
        ctx.fillRect(x - 1, 0, 2, filtered.height);
      }
    };

    SSHooks.overlay = (ctx, cssW, cssH) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state.guides.grid && state.image) {
        ctx.strokeStyle = "rgba(61,196,255,0.12)";
        ctx.lineWidth = 1;
        const step = 50 * state.zoom;
        ctx.beginPath();
        for (let x = state.panX % step; x < cssW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, cssH); }
        for (let y = state.panY % step; y < cssH; y += step) { ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
        ctx.stroke();
      }
      if (state.guides.rulers) {
        ctx.fillStyle = "rgba(20,26,36,0.92)";
        ctx.fillRect(0, 0, cssW, 22);
        ctx.fillRect(0, 0, 22, cssH);
        ctx.fillStyle = "#8b97a8";
        ctx.font = "10px Segoe UI";
        const step = 50 * state.zoom;
        for (let x = state.panX % step; x < cssW; x += step) {
          const world = Math.round((x - state.panX) / state.zoom);
          ctx.fillText(String(world), x + 2, 14);
        }
      }
      if (state.guides.measure && state.hoverWorld && state.image) {
        const o = App.getSelected();
        const t = o
          ? `${Math.round(o.w)}×${Math.round(o.h)}  ·  ${Math.round(o.x)},${Math.round(o.y)}`
          : `${Math.round(state.hoverWorld.x)}, ${Math.round(state.hoverWorld.y)}`;
        ctx.fillStyle = "rgba(17,24,38,0.9)";
        ctx.fillRect(cssW - 210, cssH - 28, 200, 22);
        ctx.fillStyle = "#e8eef8";
        ctx.font = "12px Segoe UI";
        ctx.fillText(t, cssW - 200, cssH - 13);
      }
      drawMinimap(ctx, cssW, cssH);
      ctx.restore();
    };

    App.wrap.addEventListener("mousemove", (e) => {
      const r = App.canvas.getBoundingClientRect();
      state.hoverWorld = {
        x: (e.clientX - r.left - state.panX) / state.zoom,
        y: (e.clientY - r.top - state.panY) / state.zoom,
      };
      if (state.guides.measure) App.draw();
    });
  }

  function injectCss() {
    const s = document.createElement("style");
    s.textContent = `
      html[data-theme="light"] { --bg:#f4f6f9; --panel:#fff; --panel-2:#eef2f7; --text:#1b2430; --muted:#5c6b7b; --line:rgba(0,0,0,.08); }
      html.compact .right h3:not(.keep), html.compact .stamps { display:none; }
      html.compact .right { width: 240px; }
      .minimap { position:absolute; right:12px; bottom:12px; width:120px; border:1px solid var(--line); background:#0a0d12; z-index:4; cursor:pointer; }
      #compareBar { position:absolute; left:80px; right:300px; bottom:44px; z-index:5; display:none; }
      #ocrBox { position:absolute; z-index:6; background:#111826; color:#eef3fb; padding:8px; border-radius:8px; max-width:280px; display:none; white-space:pre-wrap; }
    `;
    document.head.appendChild(s);
  }

  function injectUi() {
    const right = document.querySelector(".right");
    if (!right) return;
    const block = document.createElement("div");
    block.innerHTML = `
      <h3 class="keep">Шаблоны</h3>
      <div class="row">
        <button class="btn" id="tplBug">Баг</button>
        <button class="btn" id="tplBa">До / После</button>
      </div>
      <h3 class="keep">Нумерация</h3>
      <div class="row"><label>Схема</label>
        <select id="stepScheme">
          <option value="num">1 2 3</option>
          <option value="roman">I II III</option>
          <option value="lat">A B C</option>
          <option value="latLower">a b c</option>
          <option value="cyr">А Б В</option>
          <option value="cyrLower">а б в</option>
        </select>
      </div>
      <div class="row"><label>Подшаг к</label>
        <select id="stepParent"><option value="">— корень</option></select>
      </div>
      <h3 class="keep">Направляющие</h3>
      <div class="row"><label>Линейки</label><input type="checkbox" id="gRulers"></div>
      <div class="row"><label>Сетка</label><input type="checkbox" id="gGrid"></div>
      <div class="row"><label>Размер px</label><input type="checkbox" id="gMeasure" checked></div>
      <h3 class="keep">Выравнивание</h3>
      <div class="row">
        <button class="btn" id="alL">⟸</button>
        <button class="btn" id="alC">⇔</button>
        <button class="btn" id="alR">⟹</button>
      </div>
      <h3 class="keep">Вставка</h3>
      <div class="row">
        <button class="btn" id="insImg">Логотип / картинка</button>
      </div>
      <div class="row">
        <button class="btn" id="insWm">Водяной знак</button>
      </div>
      <h3 class="keep">Сравнение</h3>
      <div class="row"><button class="btn" id="btnCompare">Второй снимок из истории</button></div>
      <h3 class="keep">OCR / PDF / выгрузка</h3>
      <div class="row"><button class="btn" id="btnOcr">Распознать текст (Windows OCR)</button></div>
      <div class="row"><button class="btn" id="btnPdf">PDF</button>
        <button class="btn" id="btnPrint">Печать</button></div>
      <div class="row"><button class="btn" id="btnUpload">Загрузить ссылку</button></div>
      <div class="row"><button class="btn" id="btnSend">Отправить…</button></div>
      <h3 class="keep">Рамка устройства</h3>
      <div class="row"><select id="deviceFrame">
        <option value="none">Нет</option>
        <option value="browser">Окно браузера</option>
        <option value="phone">Телефон</option>
      </select></div>
      <h3 class="keep">Вид</h3>
      <div class="row"><button class="btn" id="btnTheme">Светлая / тёмная</button></div>
      <div class="row"><label>Компакт</label><input type="checkbox" id="compact"></div>
      <input type="file" id="insFile" accept="image/*" hidden>
    `;
    right.insertBefore(block, right.firstChild);
    const compareBar = document.createElement("input");
    compareBar.type = "range";
    compareBar.min = "0"; compareBar.max = "1"; compareBar.step = "0.01"; compareBar.value = "0.5";
    compareBar.id = "compareBar";
    document.querySelector(".stage-wrap").appendChild(compareBar);
    const ocrBox = document.createElement("div");
    ocrBox.id = "ocrBox";
    document.querySelector(".stage-wrap").appendChild(ocrBox);
  }

  function bindUi() {
    const App = window.SSApp;
    const { state, toast, E, draw, snapshot } = App;
    const $ = App.$;

    $("stepScheme").onchange = () => {
      App.stepScheme = $("stepScheme").value;
      const o = App.getSelected();
      if (o && o.type === "step") {
        o.scheme = App.stepScheme;
        E.renumberSteps(state.objects);
        snapshot();
        draw();
      }
    };
    $("stepParent").onchange = () => {
      App.stepParent = $("stepParent").value;
      const o = App.getSelected();
      if (o && o.type === "step") {
        o.parentKey = App.stepParent;
        E.renumberSteps(state.objects);
        snapshot();
        draw();
      }
    };
    document.getElementById("toolbar").addEventListener("click", refreshStepParents);

    $("tplBug").onclick = () => {
      if (!state.image) return;
      const W = state.image.width, H = state.image.height;
      const rect = E.defaultsFor("rect", state.style);
      rect.x = W * 0.08; rect.y = H * 0.08; rect.w = W * 0.84; rect.h = H * 0.84;
      rect.fill = "rgba(255,59,48,0.06)"; rect.stroke = "#ff3b30"; rect.strokeWidth = 5;
      const step = E.defaultsFor("step", state.style);
      step.x = rect.x - 8; step.y = rect.y - 8; step.n = 1; step.scheme = "num";
      const note = E.defaultsFor("note", state.style);
      note.x = rect.x; note.y = rect.y + rect.h - 90; note.w = 240; note.h = 80; note.text = "Баг: что не так";
      state.objects.push(rect, step, note);
      E.renumberSteps(state.objects);
      snapshot();
      draw();
    };
    $("tplBa").onclick = () => {
      if (!state.image) return;
      const W = state.image.width, H = state.image.height;
      const mk = (text, x) => {
        const t = E.defaultsFor("text", state.style);
        t.text = text; t.x = x; t.y = 16; t.w = W / 2 - 40; t.fontSize = 32; t.stroke = "#ffffff"; t.shadow = true;
        return t;
      };
      const line = E.defaultsFor("line", state.style);
      line.x = W / 2; line.y = 0; line.w = 0; line.h = H; line.stroke = "#3dc4ff"; line.strokeWidth = 3;
      state.objects.push(mk("ДО", 24), mk("ПОСЛЕ", W / 2 + 24), line);
      snapshot();
      draw();
    };

    $("gRulers").onchange = (e) => { state.guides.rulers = e.target.checked; draw(); };
    $("gGrid").onchange = (e) => { state.guides.grid = e.target.checked; draw(); };
    $("gMeasure").onchange = (e) => { state.guides.measure = e.target.checked; draw(); };
    $("gMeasure").checked = true;
    state.guides.measure = true;

    const align = (how) => {
      const ids = state.selectedIds && state.selectedIds.length ? state.selectedIds : (state.selected ? [state.selected] : []);
      const objs = ids.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
      if (objs.length < 2) { toast("Shift-клик: выберите несколько"); return; }
      if (how === "l") { const x = Math.min(...objs.map((o) => o.x)); objs.forEach((o) => { o.x = x; }); }
      if (how === "r") { const r = Math.max(...objs.map((o) => o.x + o.w)); objs.forEach((o) => { o.x = r - o.w; }); }
      if (how === "c") {
        const c = objs.reduce((a, o) => a + o.x + o.w / 2, 0) / objs.length;
        objs.forEach((o) => { o.x = c - o.w / 2; });
      }
      snapshot();
      draw();
    };
    $("alL").onclick = () => align("l");
    $("alC").onclick = () => align("c");
    $("alR").onclick = () => align("r");

    $("insImg").onclick = () => $("insFile").click();
    $("insFile").onchange = () => {
      const f = $("insFile").files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const o = E.defaultsFor("image", state.style);
        o.src = r.result;
        o.x = 40; o.y = 40; o.w = 160; o.h = 80;
        const im = new Image();
        im.onload = () => {
          o._img = im;
          o.w = Math.min(280, im.width);
          o.h = o.w * (im.height / im.width);
          state.objects.push(o);
          snapshot();
          draw();
        };
        im.src = r.result;
      };
      r.readAsDataURL(f);
    };
    $("insWm").onclick = () => {
      if (!state.image) return;
      const o = E.defaultsFor("watermark", state.style);
      o.text = "Confidential";
      o.x = 0; o.y = 0; o.w = state.image.width; o.h = state.image.height;
      o.opacity = 0.16; o.fontSize = 36; o.stroke = "#ffffff";
      state.objects.push(o);
      snapshot();
      draw();
    };

    $("btnCompare").onclick = async () => {
      const rows = window.SSIDB ? await SSIDB.list() : [];
      if (rows.length < 2) { toast("Нужно минимум два снимка в истории"); return; }
      const pick = rows.find((r) => r.dataUrl !== (state.image && state.image.src)) || rows[1];
      const im = new Image();
      im.onload = () => {
        state.compareImage = im;
        state.compare = 0.5;
        $("compareBar").style.display = "block";
        draw();
        toast("Тяните слайдер до/после");
      };
      im.src = pick.dataUrl;
    };
    $("compareBar").oninput = (e) => { state.compare = +e.target.value; draw(); };

    $("btnOcr").onclick = () => runOcr(App);
    $("btnPdf").onclick = async () => {
      const c = App.bake();
      if (!c) return;
      const url = await SSPdf.imagesToPdf([c.toDataURL("image/jpeg", 0.9)]);
      const a = document.createElement("a");
      a.href = url; a.download = "screenshots.pdf"; a.click();
    };
    $("btnPrint").onclick = () => {
      const c = App.bake();
      if (!c) return;
      const w = window.open("");
      w.document.write(`<img src="${c.toDataURL("image/png")}" style="max-width:100%">`);
      w.document.close();
      w.focus();
      w.print();
    };
    $("btnUpload").onclick = async () => {
      const c = App.bake();
      if (!c) return;
      toast("Загружаю…");
      try {
        const res = await browser.runtime.sendMessage({ type: "SS_UPLOAD", dataUrl: c.toDataURL("image/png") });
        if (res && res.url) {
          await navigator.clipboard.writeText(res.url);
          toast("Ссылка скопирована: " + res.url);
        }
      } catch (e) { toast(e.message || String(e)); }
    };
    $("btnSend").onclick = async () => sendMenu(App);
    $("deviceFrame").onchange = (e) => { state.deviceFrame = e.target.value; };
    $("btnTheme").onclick = () => {
      const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", cur);
      savePrefs();
    };
    $("compact").onchange = (e) => {
      document.documentElement.classList.toggle("compact", e.target.checked);
      savePrefs();
    };

    const origBake = App.bake;
    App.bake = function () {
      const c = origBake();
      if (!c || state.deviceFrame === "none") return c;
      return frameCanvas(c, state.deviceFrame);
    };

    setInterval(refreshStepParents, 800);
  }

  function refreshStepParents() {
    const App = window.SSApp;
    if (!App) return;
    const sel = document.getElementById("stepParent");
    if (!sel) return;
    const cur = sel.value;
    const steps = App.state.objects.filter((o) => o.type === "step");
    sel.innerHTML = `<option value="">— корень</option>` + steps.map((s) =>
      `<option value="${s.id}">${s.label || s.n}</option>`).join("");
    sel.value = cur;
  }

  async function runOcr(App) {
    const src = canvasForOcr(App);
    if (!src) return;
    App.toast("Windows OCR…");
    const dataUrl = shrinkForOcr(src);
    try {
      const res = await browser.runtime.sendMessage({ type: "SS_OCR", image: dataUrl });
      if (res && res.error === "not_installed") {
        App.toast("Один раз запустите native\\install-ocr-host.ps1 и перезапустите Firefox");
        return;
      }
      const text = (res && res.text || "").trim();
      if (!res || !res.ok || !text) throw new Error((res && (res.error || res.message)) || "Пусто");
      await navigator.clipboard.writeText(text);
      const box = document.getElementById("ocrBox");
      box.style.display = "block";
      box.style.left = "24px";
      box.style.top = "24px";
      box.textContent = text;
      App.toast("Windows OCR — текст скопирован");
    } catch (e) {
      App.toast("OCR: " + (e.message || e));
    }
  }

  function canvasForOcr(App) {
    const baked = App.bake();
    if (!baked) return null;
    const o = App.getSelected();
    if (o && o.w > 8 && o.h > 8 && !["pen", "laser", "highlight", "line", "arrow"].includes(o.type)) {
      const x = Math.max(0, Math.round(o.x));
      const y = Math.max(0, Math.round(o.y));
      const w = Math.min(baked.width - x, Math.round(Math.abs(o.w)));
      const h = Math.min(baked.height - y, Math.round(Math.abs(o.h)));
      if (w > 8 && h > 8) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(baked, x, y, w, h, 0, 0, w, h);
        return c;
      }
    }
    return baked;
  }

  function shrinkForOcr(src) {
    const max = 1920;
    let w = src.width, h = src.height;
    if (w > max || h > max) {
      const s = max / Math.max(w, h);
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, w, h);
    return c.toDataURL("image/png");
  }

  async function sendMenu(App) {
    const c = App.bake();
    if (!c) return;
    const settings = await browser.runtime.sendMessage({ type: "SS_GET_DEFAULTS" });
    const meta = App.state.meta || {};
    let url = "";
    try {
      const up = await browser.runtime.sendMessage({ type: "SS_UPLOAD", dataUrl: c.toDataURL("image/png") });
      url = up && up.url;
    } catch (_) {}
    const title = encodeURIComponent(meta.title || "Screenshot");
    const body = encodeURIComponent(`${meta.title || ""}\n${meta.url || ""}\n${url || "(снимок в буфере)"}`);
    if (url) await navigator.clipboard.writeText(url);
    else {
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); } catch (_) {}
    }
    const pick = prompt("Открыть: telegram / mail / github / webhook (или Cancel)", "telegram");
    if (!pick) return;
    if (pick === "telegram") browser.tabs.create({ url: `https://t.me/share/url?url=${encodeURIComponent(url || meta.url || "")}&text=${title}` });
    if (pick === "mail") location.href = `mailto:?subject=${title}&body=${body}`;
    if (pick === "github") {
      const repo = settings.githubRepo;
      if (!repo) { App.toast("Укажите owner/repo в настройках"); return; }
      browser.tabs.create({ url: `https://github.com/${repo}/issues/new?title=${title}&body=${body}` });
    }
    if (pick === "webhook" && settings.webhookUrl) {
      await fetch(settings.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meta.title, url: meta.url, image: url }),
      });
      App.toast("Webhook отправлен");
    }
  }

  function frameCanvas(src, kind) {
    const padX = kind === "phone" ? 24 : 16;
    const padTop = kind === "phone" ? 48 : 36;
    const padBot = kind === "phone" ? 48 : 16;
    const w = src.width + padX * 2;
    const h = src.height + padTop + padBot;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = kind === "phone" ? "#111" : "#dfe6ee";
    round(ctx, 8, 8, w - 16, h - 16, kind === "phone" ? 36 : 10);
    ctx.fill();
    if (kind === "browser") {
      ctx.fillStyle = "#c5ced8";
      ctx.fillRect(16, 16, w - 32, 22);
      ctx.fillStyle = "#ff5f57"; ctx.beginPath(); ctx.arc(28, 27, 5, 0, 7); ctx.fill();
      ctx.fillStyle = "#febc2e"; ctx.beginPath(); ctx.arc(44, 27, 5, 0, 7); ctx.fill();
      ctx.fillStyle = "#28c840"; ctx.beginPath(); ctx.arc(60, 27, 5, 0, 7); ctx.fill();
    }
    if (kind === "phone") {
      ctx.fillStyle = "#222";
      ctx.fillRect(w / 2 - 40, 18, 80, 8);
      ctx.beginPath(); ctx.arc(w / 2, h - 28, 10, 0, 7); ctx.fill();
    }
    ctx.drawImage(src, padX, padTop);
    return c;
  }
  function round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMinimap(ctx, cssW, cssH) {
    const App = window.SSApp;
    if (!App || !App.state.image) return;
    const img = App.state.filtered || App.state.image;
    const mw = 120, mh = Math.max(40, Math.round(mw * (img.height / img.width)));
    const x = cssW - mw - 12, y = cssH - mh - 12;
    if (!ctx) return;
    ctx.fillStyle = "rgba(10,13,18,0.85)";
    ctx.fillRect(x, y, mw, mh);
    ctx.drawImage(img, x, y, mw, mh);
    const { zoom, panX, panY, image } = App.state;
    const vx = (-panX / zoom) / image.width * mw;
    const vy = (-panY / zoom) / image.height * mh;
    const vw = (cssW / zoom) / image.width * mw;
    const vh = (cssH / zoom) / image.height * mh;
    ctx.strokeStyle = "#ff6a3d";
    ctx.strokeRect(x + vx, y + vy, vw, vh);
  }

  async function loadPrefs() {
    const { editorPrefs } = await browser.storage.local.get("editorPrefs");
    if (!editorPrefs) return;
    if (editorPrefs.theme) document.documentElement.setAttribute("data-theme", editorPrefs.theme);
    if (editorPrefs.compact) {
      document.documentElement.classList.add("compact");
      const c = document.getElementById("compact");
      if (c) c.checked = true;
    }
    if (editorPrefs.stroke && window.SSApp) {
      window.SSApp.state.style.stroke = editorPrefs.stroke;
      const el = document.getElementById("stroke");
      if (el) el.value = editorPrefs.stroke;
    }
    if (editorPrefs.tool && window.SSApp) window.SSApp.setTool(editorPrefs.tool);
  }
  function savePrefs() {
    const App = window.SSApp;
    browser.storage.local.set({
      editorPrefs: {
        theme: document.documentElement.getAttribute("data-theme") || "dark",
        compact: document.documentElement.classList.contains("compact"),
        tool: App.state.tool,
        stroke: App.state.style.stroke,
      },
    });
  }
  document.addEventListener("click", () => savePrefs(), true);
})();
