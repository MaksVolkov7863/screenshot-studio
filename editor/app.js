(() => {
  const E = window.SSEngine;
  const $ = (id) => document.getElementById(id);

  const COLORS = [
    "#ff3b30", "#ff6a3d", "#ff9500", "#ffd60a", "#34c759", "#30d158",
    "#32ade6", "#3dc4ff", "#007aff", "#5856d6", "#af52de", "#ff2d55",
    "#ffffff", "#c7c7cc", "#8e8e93", "#1c1c1e", "#000000",
  ];
  const EMOJI = ["⭐","🔥","✅","❌","⚠️","💡","❤️","👍","👎","📌","🎯","💬","✨","🚀","👀","🔒","📝","🎉","🧩","🧠","⚡","🌈","📎","🕒"];
  const TOOL_RU = {
    select: "выбор", crop: "кадрирование", eyedropper: "пипетка",
    pen: "перо", highlight: "маркер", line: "линия", arrow: "стрелка",
    rect: "прямоугольник", roundrect: "скругление", ellipse: "овал",
    triangle: "треугольник", text: "текст", callout: "выноска",
    step: "нумерация", note: "стикер", stamp: "эмодзи",
    blur: "размытие", pixelate: "пиксели", redact: "замазка",
    spotlight: "прожектор", magnify: "лупа", laser: "лазер",
  };

  const state = {
    image: null,
    objects: [],
    selected: null,
    tool: "select",
    zoom: 1,
    panX: 40,
    panY: 40,
    adj: { brightness: 0, contrast: 0, saturate: 0, warmth: 0 },
    export: { border: 0, borderColor: "#000000", pad: 0, radius: 0, padColor: "#111111" },
    style: {
      stroke: "#ff3b30",
      fill: "rgba(255,59,48,0.12)",
      strokeWidth: 4,
      opacity: 1,
      dash: [],
      shadow: false,
      fontSize: 28,
      fontFamily: "Segoe UI",
      fontWeight: "700",
      italic: false,
      align: "left",
    },
    nextStep: 1,
    history: new E.History(),
    drag: null,
    space: false,
    filtered: null,
    filterKey: "",
  };

  const canvas = $("stage");
  const wrap = $("stageWrap");
  const textEdit = $("textEdit");
  let dpr = 1;

  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => {
      state.style.stroke = c;
      $("stroke").value = toHex(c);
      applyToSelected({ stroke: c });
      document.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    });
    $("swatches").appendChild(b);
  });
  EMOJI.forEach((e) => {
    const b = document.createElement("button");
    b.textContent = e;
    b.addEventListener("click", () => {
      state.tool = "stamp";
      state.style.emoji = e;
      syncToolButtons();
      toast("Кликните на снимок, чтобы поставить " + e);
    });
    $("stamps").appendChild(b);
  });

  document.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  function setTool(t) {
    state.tool = t;
    syncToolButtons();
    $("statTool").textContent = "Инструмент: " + (TOOL_RU[t] || t);
    canvas.style.cursor = t === "select" ? "default" : t === "eyedropper" ? "crosshair" : "crosshair";
    if (t === "spotlight") {
      toast("Обведите важное: эта область останется светлой, остальное затемнится");
    }
    if (t === "magnify") {
      toast("Нарисуйте стекло. Оранжевый прицел — какой участок приближать");
    }
    refreshPanels();
  }
  function syncToolButtons() {
    document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === state.tool));
  }

  function bind() {
    $("stroke").oninput = () => {
      state.style.stroke = $("stroke").value;
      applyToSelected({ stroke: state.style.stroke });
      draw();
    };
    $("fill").oninput = () => {
      const c = $("fill").value;
      const sel = getSelected();
      if (sel && sel.type === "spotlight") {
        sel.dimColor = c;
        draw();
        return;
      }
      state.style.fill = hexAlpha(c, 0.18);
      applyToSelected({ fill: hexAlpha(c, 0.22) });
      draw();
    };
    $("strokeWidth").oninput = () => {
      state.style.strokeWidth = +$("strokeWidth").value;
      $("swVal").textContent = state.style.strokeWidth;
      applyToSelected({ strokeWidth: state.style.strokeWidth });
      draw();
    };
    $("opacity").oninput = () => {
      state.style.opacity = +$("opacity").value / 100;
      $("opVal").textContent = $("opacity").value + "%";
      applyToSelected({ opacity: state.style.opacity });
      draw();
    };
    $("dash").onchange = () => {
      const v = $("dash").value;
      state.style.dash = v ? v.split(",").map(Number) : [];
      applyToSelected({ dash: state.style.dash });
      draw();
    };
    $("shadow").onchange = () => {
      state.style.shadow = $("shadow").checked;
      applyToSelected({ shadow: state.style.shadow });
      draw();
    };
    $("twoWay").onchange = () => {
      applyToSelected({ twoWay: $("twoWay").checked });
      draw();
    };
    $("radius").oninput = () => {
      applyToSelected({ radius: +$("radius").value });
      draw();
    };
    $("fontSize").onchange = () => {
      state.style.fontSize = +$("fontSize").value;
      applyToSelected({ fontSize: state.style.fontSize });
      draw();
    };
    $("fontFamily").onchange = () => {
      state.style.fontFamily = $("fontFamily").value;
      applyToSelected({ fontFamily: state.style.fontFamily });
      draw();
    };
    $("align").onchange = () => {
      state.style.align = $("align").value;
      applyToSelected({ align: state.style.align });
      draw();
    };
    $("bold").onclick = () => {
      const w = state.style.fontWeight === "700" ? "400" : "700";
      state.style.fontWeight = w;
      applyToSelected({ fontWeight: w });
      draw();
    };
    $("italic").onclick = () => {
      state.style.italic = !state.style.italic;
      applyToSelected({ italic: state.style.italic });
      draw();
    };
    $("blur").oninput = () => { applyToSelected({ blur: +$("blur").value }); draw(); };
    $("block").oninput = () => { applyToSelected({ block: +$("block").value }); draw(); };

    $("spotDim").oninput = () => {
      $("spotDimVal").textContent = $("spotDim").value + "%";
      applyToSelected({ dim: +$("spotDim").value / 100 });
      draw();
    };
    $("spotColor").oninput = () => { applyToSelected({ dimColor: $("spotColor").value }); draw(); };
    $("spotFeather").oninput = () => {
      $("spotFeatherVal").textContent = $("spotFeather").value;
      applyToSelected({ feather: +$("spotFeather").value });
      draw();
    };
    $("spotShape").onchange = () => { applyToSelected({ shape: $("spotShape").value }); draw(); };

    $("zoomObj").oninput = () => {
      const z = +$("zoomObj").value;
      $("magZoomVal").textContent = z.toFixed(1) + "×";
      if ($("zoomObjNum")) $("zoomObjNum").value = z;
      applyToSelected({ zoom: z });
      draw();
    };
    $("zoomObjNum").oninput = () => {
      const z = clamp(+$("zoomObjNum").value || 2, 1.1, 12);
      $("zoomObj").value = z;
      $("magZoomVal").textContent = z.toFixed(1) + "×";
      applyToSelected({ zoom: z });
      draw();
    };
    $("magShape").onchange = () => { applyToSelected({ shape: $("magShape").value }); draw(); };
    $("magFollow").onchange = () => {
      const o = getSelected();
      if (!o || o.type !== "magnify") return;
      o.srcFollow = $("magFollow").checked;
      if (o.srcFollow) {
        o.srcX = o.x + o.w / 2;
        o.srcY = o.y + o.h / 2;
      }
      draw();
    };
    $("magEffect").onchange = () => { applyToSelected({ effect: $("magEffect").value }); draw(); };
    $("magGrid").onchange = () => { applyToSelected({ grid: $("magGrid").checked }); draw(); };
    $("magLeader").onchange = () => { applyToSelected({ leader: $("magLeader").checked }); draw(); };
    $("magSource").onchange = () => { applyToSelected({ showSource: $("magSource").checked }); draw(); };
    $("magFeather").oninput = () => {
      $("magFeatherVal").textContent = $("magFeather").value;
      applyToSelected({ feather: +$("magFeather").value });
      draw();
    };
    $("magContrast").oninput = () => {
      $("magContrastVal").textContent = $("magContrast").value;
      applyToSelected({ innerContrast: +$("magContrast").value });
      draw();
    };
    $("magResetSrc").onclick = () => {
      const o = getSelected();
      if (!o || o.type !== "magnify") return;
      o.srcX = o.x + o.w / 2;
      o.srcY = o.y + o.h / 2;
      o.srcFollow = true;
      $("magFollow").checked = true;
      snapshot();
      draw();
    };

    ["brightness", "contrast", "saturate", "warmth"].forEach((k) => {
      $(k).oninput = () => {
        state.adj[k] = +$(k).value;
        const map = { brightness: "brVal", contrast: "ctVal", saturate: "saVal", warmth: "waVal" };
        $(map[k]).textContent = $(k).value;
        state.filtered = null;
        draw();
      };
    });
    $("resetAdj").onclick = () => {
      state.adj = { brightness: 0, contrast: 0, saturate: 0, warmth: 0 };
      ["brightness", "contrast", "saturate", "warmth"].forEach((k) => { $(k).value = 0; });
      $("brVal").textContent = $("ctVal").textContent = $("saVal").textContent = $("waVal").textContent = "0";
      state.filtered = null;
      snapshot();
      draw();
    };
    $("border").oninput = () => { state.export.border = +$("border").value; };
    $("borderColor").oninput = () => { state.export.borderColor = $("borderColor").value; };
    $("pad").oninput = () => { state.export.pad = +$("pad").value; };
    $("outRadius").oninput = () => { state.export.radius = +$("outRadius").value; };

    $("btnUndo").onclick = undo;
    $("btnRedo").onclick = redo;
    $("btnZoomIn").onclick = () => zoomBy(1.15);
    $("btnZoomOut").onclick = () => zoomBy(1 / 1.15);
    $("btnZoomFit").onclick = fit;
    $("btnCopy").onclick = () => copyOut();
    $("btnSave").onclick = () => saveOut();
    $("btnUp").onclick = () => shiftLayer(1);
    $("btnDown").onclick = () => shiftLayer(-1);
    $("btnDup").onclick = duplicate;
    $("btnDel").onclick = delSelected;
    $("btnFlipH").onclick = () => flip("h");
    $("btnFlipV").onclick = () => flip("v");
    $("btnRotL").onclick = () => rotate(-90);
    $("btnRotR").onclick = () => rotate(90);
    $("btnOpen").onclick = () => $("file").click();
    $("file").onchange = () => {
      const f = $("file").files[0];
      if (f) loadBlob(f);
    };

    wrap.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") state.space = false;
    });
    window.addEventListener("paste", onPaste);
    window.addEventListener("resize", resize);
    wrap.addEventListener("dragover", (e) => e.preventDefault());
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("image/")) loadBlob(f);
    });
    textEdit.addEventListener("input", () => {
      const o = getSelected();
      if (o && ("text" in o)) {
        o.text = textEdit.value;
        draw();
      }
    });
    textEdit.addEventListener("blur", () => {
      textEdit.hidden = true;
      snapshot();
    });
  }

  function applyToSelected(patch) {
    const o = getSelected();
    if (!o) return;
    Object.assign(o, patch);
  }

  function getSelected() {
    return state.objects.find((o) => o.id === state.selected) || null;
  }

  function snapshot(withImage) {
    state.history.push(JSON.stringify({
      objects: state.objects,
      adj: state.adj,
      nextStep: state.nextStep,
      image: withImage && state.image ? state.image.src : null,
    }));
  }
  function restore(raw) {
    if (!raw) return;
    const s = JSON.parse(raw);
    state.objects = s.objects;
    state.adj = s.adj;
    state.nextStep = s.nextStep;
    state.filtered = null;
    let img = s.image;
    if (!img) {
      for (let i = state.history.index; i >= 0; i--) {
        const p = JSON.parse(state.history.stack[i]);
        if (p.image) {
          img = p.image;
          break;
        }
      }
    }
    if (img && (!state.image || state.image.src !== img)) {
      loadFromUrl(img, { skipFit: true });
      return;
    }
    draw();
  }
  function undo() { restore(state.history.undo()); }
  function redo() { restore(state.history.redo()); }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    draw();
  }

  function screenToWorld(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const x = sx - r.left;
    const y = sy - r.top;
    return { x: (x - state.panX) / state.zoom, y: (y - state.panY) / state.zoom };
  }

  function onWheel(e) {
    e.preventDefault();
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    state.zoom = clamp(state.zoom * f, 0.08, 8);
    state.panX = e.clientX - wrap.getBoundingClientRect().left - x * state.zoom;
    state.panY = e.clientY - wrap.getBoundingClientRect().top - y * state.zoom;
    $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
    draw();
  }
  function zoomBy(f) {
    state.zoom = clamp(state.zoom * f, 0.08, 8);
    $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
    draw();
  }
  function fit() {
    if (!state.image) return;
    const r = wrap.getBoundingClientRect();
    const z = Math.min((r.width - 80) / state.image.width, (r.height - 80) / state.image.height);
    state.zoom = clamp(z, 0.05, 4);
    state.panX = (r.width - state.image.width * state.zoom) / 2;
    state.panY = (r.height - state.image.height * state.zoom) / 2;
    $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
    draw();
  }

  function onDown(e) {
    if (!state.image) return;
    if (e.button === 1 || state.space) {
      state.drag = { kind: "pan", x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
      return;
    }
    if (e.button !== 0) return;
    const p = screenToWorld(e.clientX, e.clientY);
    $("statXY").textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;

    if (state.tool === "eyedropper") {
      pickColor(p.x, p.y);
      return;
    }
    if (state.tool === "stamp") {
      const o = E.defaultsFor("stamp", state.style);
      o.emoji = state.style.emoji || "⭐";
      o.x = p.x - 24;
      o.y = p.y - 24;
      o.w = 48;
      o.h = 48;
      state.objects.push(o);
      state.selected = o.id;
      snapshot();
      draw();
      return;
    }
    if (state.tool === "step") {
      const o = E.defaultsFor("step", state.style);
      o.n = state.nextStep++;
      o.x = p.x - 18;
      o.y = p.y - 18;
      o.stroke = "#ffffff";
      o.fill = state.style.stroke;
      o.scheme = (window.SSApp && window.SSApp.stepScheme) || "num";
      o.parentKey = (window.SSApp && window.SSApp.stepParent) || "";
      state.objects.push(o);
      state.selected = o.id;
      E.renumberSteps(state.objects);
      snapshot();
      draw();
      return;
    }
    if (state.tool === "text") {
      const o = E.defaultsFor("text", state.style);
      o.x = p.x;
      o.y = p.y;
      o.w = 280;
      o.h = o.fontSize * 1.5;
      o.text = "Текст";
      o.stroke = state.style.stroke;
      state.objects.push(o);
      state.selected = o.id;
      snapshot();
      draw();
      openText(o, e);
      return;
    }

    if (state.tool === "select") {
      if (!state.selectedIds) state.selectedIds = [];
      const handle = hitHandle(p.x, p.y);
      if (handle) {
        const o = getSelected();
        state.drag = { kind: "handle", hid: handle.id, start: E.clone(o), ox: p.x, oy: p.y };
        return;
      }
      const hit = hitTop(p.x, p.y);
      if (e.shiftKey && hit) {
        const ids = state.selectedIds;
        const i = ids.indexOf(hit.id);
        if (i >= 0) ids.splice(i, 1);
        else ids.push(hit.id);
        state.selected = hit.id;
      } else {
        state.selected = hit ? hit.id : null;
        state.selectedIds = hit ? [hit.id] : [];
      }
      if (hit && !hit.locked && !e.shiftKey) {
        const ids = state.selectedIds && state.selectedIds.length ? state.selectedIds : [hit.id];
        state.drag = {
          kind: "move",
          start: E.clone(hit),
          starts: ids.map((id) => E.clone(state.objects.find((x) => x.id === id) || hit)),
          ids,
          ox: p.x,
          oy: p.y,
        };
      }
      if (hit && e.detail === 2 && (hit.type === "text" || hit.type === "note" || hit.type === "callout")) {
        openText(hit, e);
      }
      refreshPanels();
      draw();
      return;
    }

    if (state.tool === "crop") {
      state.drag = { kind: "crop", x: p.x, y: p.y, x1: p.x, y1: p.y };
      return;
    }

    const type = state.tool;
    const o = E.defaultsFor(type, state.style);
    o.x = p.x;
    o.y = p.y;
    o.stroke = state.style.stroke;
    o.fill = type === "redact" ? "#111111" : state.style.fill;
    o.strokeWidth = state.style.strokeWidth;
    o.opacity = state.style.opacity;
    o.dash = state.style.dash;
    o.shadow = state.style.shadow;
    if (type === "pen" || type === "highlight") o.points = [[p.x, p.y]];
    if (type === "note") {
      o.w = 180;
      o.h = 110;
      o.fill = "#ffe56d";
      o.stroke = "#e0c14c";
    }
    if (type === "callout") {
      o.w = 200;
      o.h = 80;
      o.fill = "#fff7d6";
      o.stroke = state.style.stroke;
      o.text = "Смотри сюда";
    }
    if (type === "spotlight") {
      o.dim = 0.68;
      o.dimColor = "#000000";
      o.feather = 28;
      o.shape = $("spotShape") ? $("spotShape").value : "ellipse";
      o.fill = "#000000";
      o.stroke = "#ffffff";
      o.strokeWidth = 0;
      o.opacity = 1;
    }
    if (type === "arrow" || type === "line") {
      o.cpx = p.x;
      o.cpy = p.y;
    }
    if (type === "pen" || type === "highlight" || type === "laser") {
      o.smooth = true;
      o.points = [[p.x, p.y]];
      if (type === "laser") {
        o.stroke = "#ff2d55";
        o.strokeWidth = Math.max(5, o.strokeWidth);
        o.shadow = true;
      }
    }
    if (type === "step") {
      o.scheme = (window.SSApp && window.SSApp.stepScheme) || "num";
      o.parentKey = (window.SSApp && window.SSApp.stepParent) || "";
    }
    if (type === "magnify") {
      o.zoom = +($("zoomObj") && $("zoomObj").value) || 2.5;
      o.shape = $("magShape") ? $("magShape").value : "ellipse";
      o.effect = $("magEffect") ? $("magEffect").value : "glass";
      o.srcFollow = true;
      o.showSource = $("magSource") ? $("magSource").checked : true;
      o.leader = $("magLeader") ? $("magLeader").checked : true;
      o.grid = $("magGrid") ? $("magGrid").checked : false;
      o.innerContrast = $("magContrast") ? +$("magContrast").value : 10;
      o.feather = $("magFeather") ? +$("magFeather").value : 0;
      o.stroke = "#ffffff";
      o.strokeWidth = 4;
      o.fill = "rgba(0,0,0,0)";
      o.shadow = true;
    }
    state.objects.push(o);
    state.selected = o.id;
    state.drag = { kind: "create", id: o.id, x: p.x, y: p.y };
    draw();
  }

  function onMove(e) {
    const p = screenToWorld(e.clientX, e.clientY);
    $("statXY").textContent = state.image ? `${Math.round(p.x)}, ${Math.round(p.y)}` : "";
    if (!state.drag) return;
    if (state.drag.kind === "pan") {
      state.panX = state.drag.panX + (e.clientX - state.drag.x);
      state.panY = state.drag.panY + (e.clientY - state.drag.y);
      draw();
      return;
    }
    if (state.drag.kind === "crop") {
      state.drag.x1 = p.x;
      state.drag.y1 = p.y;
      draw();
      return;
    }
    const o = state.objects.find((x) => x.id === (state.drag.id || state.selected));
    if (!o) return;
    if (state.drag.kind === "move") {
      const dx = p.x - state.drag.ox;
      const dy = p.y - state.drag.oy;
      const starts = state.drag.starts || [state.drag.start];
      for (const st of starts) {
        const obj = state.objects.find((x) => x.id === st.id);
        if (!obj) continue;
        obj.x = st.x + dx;
        obj.y = st.y + dy;
        if (st.points) obj.points = st.points.map((pt) => [pt[0] + dx, pt[1] + dy]);
        if (st.cpx != null) {
          obj.cpx = st.cpx + dx;
          obj.cpy = st.cpy + dy;
        }
        if (obj.type === "magnify" && obj.srcFollow !== false) {
          const startSrc = E.magSource(st);
          obj.srcX = startSrc.x + dx;
          obj.srcY = startSrc.y + dy;
        }
      }
      draw();
      return;
    }
    if (state.drag.kind === "handle") {
      E.applyHandle(o, state.drag.hid, p.x, p.y, state.drag.start);
      draw();
      return;
    }
    if (state.drag.kind === "create") {
      if (o.type === "pen" || o.type === "highlight" || o.type === "laser") {
        const last = o.points[o.points.length - 1];
        if (!last || Math.hypot(p.x - last[0], p.y - last[1]) >= 0.6) {
          o.points.push([p.x, p.y]);
        }
      } else if (o.type === "line" || o.type === "arrow") {
        o.w = p.x - o.x;
        o.h = p.y - o.y;
        if (e.shiftKey) snapLine(o);
      } else {
        o.w = p.x - state.drag.x;
        o.h = p.y - state.drag.y;
        if (e.shiftKey) {
          const s = Math.max(Math.abs(o.w), Math.abs(o.h));
          o.w = Math.sign(o.w || 1) * s;
          o.h = Math.sign(o.h || 1) * s;
        }
      }
      draw();
    }
  }

  function onUp() {
    if (!state.drag) return;
    if (state.drag.kind === "create") {
      const o = getSelected();
      if (o && o.type !== "line" && o.type !== "arrow" && o.type !== "pen" && o.type !== "highlight" && o.type !== "laser") {
        E.normBox(o);
        if (o.w < 3 && o.h < 3) {
          o.w = 80;
          o.h = 50;
        }
      }
      if (o && o.type === "magnify") {
        o.srcX = o.x + o.w / 2;
        o.srcY = o.y + o.h / 2;
        o.srcFollow = true;
      }
      if (o && (o.type === "arrow" || o.type === "line")) {
        o.cpx = o.x + o.w / 2;
        o.cpy = o.y + o.h / 2;
      }
      if (o && o.type === "step") E.renumberSteps(state.objects);
      snapshot();
      refreshPanels();
    } else if (state.drag.kind === "move" || state.drag.kind === "handle") {
      snapshot();
    } else if (state.drag.kind === "crop") {
      commitCrop(state.drag);
    }
    state.drag = null;
    refreshPanels();
    draw();
  }

  function snapLine(o) {
    const ang = Math.atan2(o.h, o.w);
    const snap = Math.PI / 4;
    const a = Math.round(ang / snap) * snap;
    const len = Math.hypot(o.w, o.h);
    o.w = Math.cos(a) * len;
    o.h = Math.sin(a) * len;
  }

  function hitTop(x, y) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      if (E.pointInObject(state.objects[i], x, y)) return state.objects[i];
    }
    return null;
  }

  function hitHandle(x, y) {
    const o = getSelected();
    if (!o) return null;
    const hs = E.handles(o);
    const tol = 8 / state.zoom;
    for (const h of hs) {
      const extra = h.id === "src" ? 10 / state.zoom : 0;
      if (Math.hypot(h.x - x, h.y - y) <= tol + 4 + extra) return h;
    }
    return null;
  }

  function refreshPanels() {
    const o = getSelected();
    const t = o ? o.type : state.tool;
    if ($("panelSpot")) $("panelSpot").hidden = t !== "spotlight";
    if ($("panelMag")) $("panelMag").hidden = t !== "magnify";
    if (o && o.type === "spotlight") {
      $("spotDim").value = Math.round((o.dim != null ? o.dim : 0.68) * 100);
      $("spotDimVal").textContent = $("spotDim").value + "%";
      $("spotColor").value = toHex(o.dimColor || "#000000");
      $("spotFeather").value = o.feather || 0;
      $("spotFeatherVal").textContent = $("spotFeather").value;
      $("spotShape").value = o.shape || "ellipse";
    }
    if (o && o.type === "magnify") {
      const z = o.zoom || 2.5;
      $("zoomObj").value = z;
      $("zoomObjNum").value = z;
      $("magZoomVal").textContent = Number(z).toFixed(1) + "×";
      $("magShape").value = o.shape || "ellipse";
      $("magFollow").checked = o.srcFollow !== false;
      $("magEffect").value = o.effect || "glass";
      $("magGrid").checked = !!o.grid;
      $("magLeader").checked = o.leader !== false;
      $("magSource").checked = o.showSource !== false;
      $("magFeather").value = o.feather || 0;
      $("magFeatherVal").textContent = $("magFeather").value;
      $("magContrast").value = o.innerContrast || 0;
      $("magContrastVal").textContent = $("magContrast").value;
    }
  }

  function pickColor(x, y) {
    ensureFiltered();
    const ctx = state.filtered.getContext("2d");
    const px = ctx.getImageData(Math.max(0, x | 0), Math.max(0, y | 0), 1, 1).data;
    const hex = rgbHex(px[0], px[1], px[2]);
    state.style.stroke = hex;
    $("stroke").value = hex;
    toast("Цвет " + hex);
    setTool("select");
  }

  function openText(o, e) {
    const r = canvas.getBoundingClientRect();
    textEdit.hidden = false;
    textEdit.value = o.text || "";
    textEdit.style.left = e.clientX - r.left + 12 + "px";
    textEdit.style.top = e.clientY - r.top + 12 + "px";
    textEdit.style.font = `${o.fontSize}px ${o.fontFamily}`;
    textEdit.focus();
    textEdit.select();
  }

  function delSelected() {
    if (!state.selected) return;
    state.objects = state.objects.filter((o) => o.id !== state.selected);
    state.selected = null;
    E.renumberSteps(state.objects);
    snapshot();
    draw();
  }
  function duplicate() {
    const o = getSelected();
    if (!o) return;
    const n = E.clone(o);
    n.id = E.uid();
    n.x += 12;
    n.y += 12;
    state.objects.push(n);
    state.selected = n.id;
    snapshot();
    draw();
  }
  function shiftLayer(dir) {
    const i = state.objects.findIndex((o) => o.id === state.selected);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= state.objects.length) return;
    const [it] = state.objects.splice(i, 1);
    state.objects.splice(j, 0, it);
    snapshot();
    draw();
  }

  async function commitCrop(d) {
    const x = Math.min(d.x, d.x1);
    const y = Math.min(d.y, d.y1);
    const w = Math.abs(d.x1 - d.x);
    const h = Math.abs(d.y1 - d.y);
    if (w < 8 || h < 8) return;
    const src = state.image;
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    await loadFromUrl(c.toDataURL("image/png"), { skipFit: true });
    state.objects = state.objects
      .map((o) => {
        const n = E.clone(o);
        n.x -= x;
        n.y -= y;
        if (n.points) n.points = n.points.map((p) => [p[0] - x, p[1] - y]);
        return n;
      })
      .filter((o) => o.x + (o.w || 0) > 0 && o.y + (o.h || 0) > 0);
    snapshot(true);
    setTool("select");
    fit();
  }

  async function flip(axis) {
    if (!state.image) return;
    const c = document.createElement("canvas");
    c.width = state.image.width;
    c.height = state.image.height;
    const ctx = c.getContext("2d");
    if (axis === "h") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, c.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(state.image, 0, 0);
    const w = c.width, h = c.height;
    state.objects.forEach((o) => {
      if (axis === "h") {
        o.x = w - o.x - (o.type === "line" || o.type === "arrow" ? 0 : o.w);
        if (o.type === "line" || o.type === "arrow") o.w = -o.w;
        if (o.points) o.points = o.points.map((p) => [w - p[0], p[1]]);
      } else {
        o.y = h - o.y - (o.type === "line" || o.type === "arrow" ? 0 : o.h);
        if (o.type === "line" || o.type === "arrow") o.h = -o.h;
        if (o.points) o.points = o.points.map((p) => [p[0], h - p[1]]);
      }
    });
    await loadFromUrl(c.toDataURL("image/png"), { skipFit: true });
    snapshot(true);
  }

  async function rotate(deg) {
    if (!state.image) return;
    const src = state.image;
    const c = document.createElement("canvas");
    if (Math.abs(deg) === 90) {
      c.width = src.height;
      c.height = src.width;
    } else {
      c.width = src.width;
      c.height = src.height;
    }
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    const w0 = src.width, h0 = src.height;
    state.objects.forEach((o) => {
      if (deg === 90) {
        const nx = h0 - o.y - (o.type === "line" || o.type === "arrow" ? 0 : o.h);
        const ny = o.x;
        const nw = o.h, nh = o.w;
        o.x = nx; o.y = ny; o.w = nw; o.h = nh;
        if (o.points) o.points = o.points.map((p) => [h0 - p[1], p[0]]);
      } else if (deg === -90) {
        const nx = o.y;
        const ny = w0 - o.x - (o.type === "line" || o.type === "arrow" ? 0 : o.w);
        const nw = o.h, nh = o.w;
        o.x = nx; o.y = ny; o.w = nw; o.h = nh;
        if (o.points) o.points = o.points.map((p) => [p[1], w0 - p[0]]);
      }
    });
    await loadFromUrl(c.toDataURL("image/png"), { skipFit: true });
    snapshot(true);
  }

  function ensureFiltered() {
    if (!state.image) return null;
    const key = JSON.stringify(state.adj) + state.image.src.slice(-24);
    if (state.filtered && state.filterKey === key) return state.filtered;
    state.filtered = E.filterImage(state.image, state.adj);
    state.filterKey = key;
    return state.filtered;
  }

  function draw() {
    const ctx = canvas.getContext("2d");
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!state.image) return;

    const filtered = ensureFiltered();
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.drawImage(filtered, 0, 0);
    if (window.SSHooks && window.SSHooks.afterImage) window.SSHooks.afterImage(ctx, filtered);

    E.drawSpotlights(ctx, state.objects, filtered.width, filtered.height);

    for (const o of state.objects) {
      if (o.type === "spotlight") continue;
      E.drawObject(ctx, o, filtered);
    }

    if (state.drag && state.drag.kind === "crop") {
      const x = Math.min(state.drag.x, state.drag.x1);
      const y = Math.min(state.drag.y, state.drag.y1);
      const w = Math.abs(state.drag.x1 - state.drag.x);
      const h = Math.abs(state.drag.y1 - state.drag.y);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, filtered.width, filtered.height);
      ctx.clearRect(x, y, w, h);
      ctx.drawImage(filtered, x, y, w, h, x, y, w, h);
      ctx.strokeStyle = "#ff6a3d";
      ctx.lineWidth = 2 / state.zoom;
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
    if (window.SSHooks && window.SSHooks.overlay) window.SSHooks.overlay(ctx, cssW, cssH);

    const sel = getSelected();
    if (sel) {
      ctx.save();
      ctx.translate(state.panX, state.panY);
      ctx.scale(state.zoom, state.zoom);
      const b = E.bounds(sel);
      ctx.strokeStyle = "#3dc4ff";
      ctx.lineWidth = 1 / state.zoom;
      ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
      for (const h of E.handles(sel)) {
        ctx.lineWidth = 1.2 / state.zoom;
        if (h.id === "src") {
          const r = 9 / state.zoom;
          ctx.beginPath();
          ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
          ctx.fillStyle = "#ff6a3d";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(h.x - r * 1.6, h.y);
          ctx.lineTo(h.x + r * 1.6, h.y);
          ctx.moveTo(h.x, h.y - r * 1.6);
          ctx.lineTo(h.x, h.y + r * 1.6);
          ctx.stroke();
          continue;
        }
        const s = 7 / state.zoom;
        ctx.fillStyle = h.id === "rot" ? "#ff6a3d" : "#fff";
        ctx.strokeStyle = "#111";
        ctx.beginPath();
        ctx.rect(h.x - s / 2, h.y - s / 2, s, s);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function bake() {
    if (!state.image) return null;
    return E.exportCanvas(state.image, state.objects, state.adj, state.export);
  }

  async function copyOut() {
    const c = bake();
    if (!c) return;
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Снимок скопирован в буфер обмена");
    } catch (e) {
      toast("Не удалось скопировать: " + e.message);
    }
  }

  async function saveOut() {
    const c = bake();
    if (!c) return;
    const fmt = $("fmt").value;
    const mime = fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
    const quality = fmt === "png" ? undefined : 0.92;
    const dataUrl = c.toDataURL(mime, quality);
    const name = filename(fmt === "jpeg" ? "jpg" : fmt);
    try {
      await browser.downloads.download({ url: dataUrl, filename: name, saveAs: true });
    } catch (_) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = name;
      a.click();
    }
  }

  function filename(ext) {
    const d = new Date();
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 8).replace(/:/g, "-");
    return `screenshot-${date}-${time}.${ext}`;
  }

  function onKey(e) {
    if (e.code === "Space") {
      state.space = true;
      return;
    }
    if (e.target === textEdit) return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === "z") { e.preventDefault(); undo(); }
    else if (e.ctrlKey && key === "y") { e.preventDefault(); redo(); }
    else if (e.ctrlKey && key === "s") { e.preventDefault(); saveOut(); }
    else if (e.ctrlKey && key === "c") { e.preventDefault(); copyOut(); }
    else if (e.ctrlKey && key === "d") { e.preventDefault(); duplicate(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delSelected(); }
    else if (key === "v") setTool("select");
    else if (key === "c" && !e.ctrlKey) setTool("crop");
    else if (key === "p") setTool("pen");
    else if (key === "h") setTool("highlight");
    else if (key === "l") setTool("line");
    else if (key === "a" && !e.ctrlKey) setTool("arrow");
    else if (key === "r") setTool("rect");
    else if (key === "o") setTool("ellipse");
    else if (key === "t") setTool("text");
    else if (key === "b") setTool("blur");
    else if (key === "i") setTool("eyedropper");
    else if (key === "escape") { state.selected = null; textEdit.hidden = true; draw(); }
  }

  function onPaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        loadBlob(it.getAsFile());
        return;
      }
    }
  }

  function loadBlob(file) {
    const url = URL.createObjectURL(file);
    loadFromUrl(url);
  }

  function loadFromUrl(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        state.image = img;
        state.filtered = null;
        $("empty").style.display = "none";
        $("statSize").textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
        if (!opts.skipFit) {
          state.objects = [];
          state.selected = null;
          state.nextStep = 1;
          state.history = new E.History();
          snapshot(true);
          fit();
        } else {
          draw();
        }
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function toHex(c) {
    if (c[0] === "#") return c.slice(0, 7);
    return "#ff3b30";
  }
  function hexAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }
  function rgbHex(r, g, b) {
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  async function loadPending() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const compare = params.get("compare");
    if (!id) return;
    try {
      const rec = window.SSIDB ? await SSIDB.get(id) : null;
      if (rec && rec.dataUrl) {
        await loadFromUrl(rec.dataUrl);
        state.meta = rec.meta || {};
        if (params.get("copy") === "1") copyOut();
      }
      if (compare && window.SSIDB) {
        const rec2 = await SSIDB.get(compare);
        if (rec2 && rec2.dataUrl) {
          const img2 = new Image();
          img2.onload = () => {
            state.compareImage = img2;
            state.compare = 0.5;
            draw();
          };
          img2.src = rec2.dataUrl;
        }
      }
    } catch (e) {
      toast("Не удалось загрузить снимок");
      console.error(e);
    }
  }

  bind();
  resize();
  loadPending();
  window.SSApp = {
    state, draw, snapshot, getSelected, $, toast, loadFromUrl, bake, setTool,
    applyToSelected, fit, E, canvas, wrap, copyOut, saveOut,
  };
})();
