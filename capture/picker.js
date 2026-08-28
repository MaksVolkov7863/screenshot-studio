(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const canvas = document.getElementById("hud");
  const bar = document.getElementById("bar");
  const hint = document.getElementById("hint");
  const ctx = canvas.getContext("2d");

  let img = null;
  let layout = { ox: 0, oy: 0, dw: 0, dh: 0, scale: 1 };
  let dpr = 1;
  let drag = null;
  let hover = { x: 0, y: 0 };
  const rects = [];
  let adding = false;

  function fit() {
    dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (!img) return;
    const pad = 8;
    const scale = Math.min((cssW - pad * 2) / img.width, (cssH - pad * 2) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    layout = {
      ox: (cssW - dw) / 2,
      oy: (cssH - dh) / 2,
      dw,
      dh,
      scale,
    };
    paint();
  }

  function cssToImage(e) {
    const x = (e.clientX - layout.ox) / layout.scale;
    const y = (e.clientY - layout.oy) / layout.scale;
    return {
      x: Math.max(0, Math.min(img.width, x)),
      y: Math.max(0, Math.min(img.height, y)),
    };
  }

  function imgToCanvas(p) {
    return {
      x: (layout.ox + p.x * layout.scale) * dpr,
      y: (layout.oy + p.y * layout.scale) * dpr,
    };
  }

  function norm(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  function paint() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#06080e";
    ctx.fillRect(0, 0, w, h);
    if (!img) return;

    const x = layout.ox * dpr;
    const y = layout.oy * dpr;
    const dw = layout.dw * dpr;
    const dh = layout.dh * dpr;
    ctx.imageSmoothingEnabled = layout.scale < 0.999;
    ctx.drawImage(img, x, y, dw, dh);
    ctx.fillStyle = "rgba(6,8,14,0.55)";
    ctx.fillRect(x, y, dw, dh);

    const list = rects.slice();
    if (drag) list.push(norm(drag.a, drag.b));
    for (const sel of list) {
      const p0 = imgToCanvas({ x: sel.x, y: sel.y });
      const p1 = imgToCanvas({ x: sel.x + sel.w, y: sel.y + sel.h });
      const rx = p0.x;
      const ry = p0.y;
      const rw = p1.x - p0.x;
      const rh = p1.y - p0.y;
      ctx.drawImage(img, sel.x, sel.y, sel.w, sel.h, rx, ry, rw, rh);
      ctx.strokeStyle = "#ff6a3d";
      ctx.lineWidth = Math.max(2, dpr);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
      ctx.font = `${12 * dpr}px Segoe UI`;
      const label = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "#111826";
      ctx.fillRect(rx, Math.max(0, ry - 20 * dpr), tw + 12 * dpr, 18 * dpr);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, rx + 6 * dpr, Math.max(14 * dpr, ry - 6 * dpr));
    }
  }

  function placeBar(sel) {
    bar.hidden = false;
    const p = imgToCanvas({ x: sel.x, y: sel.y + sel.h });
    let left = p.x / dpr;
    let top = p.y / dpr + 10;
    if (top + 56 > window.innerHeight) top = Math.max(8, imgToCanvas({ x: sel.x, y: sel.y }).y / dpr - 56);
    if (left + 480 > window.innerWidth) left = window.innerWidth - 490;
    if (left < 8) left = 8;
    bar.style.left = left + "px";
    bar.style.top = top + "px";
  }

  async function commit(act) {
    if (!rects.length) return;
    await browser.runtime.sendMessage({ type: "SS_PICKER_RESULT", id, rects, act });
    window.close();
  }

  async function cancel() {
    try {
      await browser.runtime.sendMessage({ type: "SS_PICKER_CANCEL", id });
    } catch (_) {}
    window.close();
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!img) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = cssToImage(e);
    drag = { a: p, b: { ...p } };
    if (!adding) {
      rects.length = 0;
      bar.hidden = true;
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (!img) return;
    hover = cssToImage(e);
    if (drag) {
      drag.b = cssToImage(e);
      if (e.shiftKey) {
        const side = Math.max(Math.abs(drag.b.x - drag.a.x), Math.abs(drag.b.y - drag.a.y));
        drag.b = {
          x: drag.a.x + Math.sign(drag.b.x - drag.a.x || 1) * side,
          y: drag.a.y + Math.sign(drag.b.y - drag.a.y || 1) * side,
        };
      }
    }
    paint();
  });
  const endPick = () => {
    if (!drag || !img) return;
    const n = norm(drag.a, drag.b);
    drag = null;
    if (n.w < 4 || n.h < 4) {
      paint();
      return;
    }
    n.x = Math.max(0, Math.min(img.width - 1, n.x));
    n.y = Math.max(0, Math.min(img.height - 1, n.y));
    n.w = Math.min(n.w, img.width - n.x);
    n.h = Math.min(n.h, img.height - n.y);
    rects.push(n);
    adding = false;
    paint();
    placeBar(n);
  };
  window.addEventListener("pointerup", endPick);
  window.addEventListener("pointercancel", endPick);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
    if (e.key === "Enter" && img) {
      e.preventDefault();
      if (!rects.length) rects.push({ x: 0, y: 0, w: img.width, h: img.height });
      commit("edit");
    }
  });
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act === "add") {
      adding = true;
      bar.hidden = true;
      hint.textContent = "Выделите ещё область, затем Править";
      return;
    }
    if (act === "cancel") {
      cancel();
      return;
    }
    commit(act);
  });
  window.addEventListener("resize", fit);
  void hover;

  (async () => {
    if (!id) {
      hint.textContent = "Нет снимка";
      return;
    }
    const rec = await browser.runtime.sendMessage({ type: "SS_IDB_GET", id });
    if (!rec || !rec.dataUrl) {
      hint.textContent = "Снимок не найден";
      return;
    }
    img = new Image();
    img.onload = fit;
    img.src = rec.dataUrl;
  })().catch((e) => {
    hint.textContent = String(e.message || e);
  });
})();
