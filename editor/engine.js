/* Canvas document, shapes, hit-testing, history */
(function (global) {
  const E = {};
  global.SSEngine = E;

  E.uid = () => Math.random().toString(36).slice(2, 10);

  E.defaultsFor = function (type, style) {
    const s = style || {};
    const base = {
      id: E.uid(),
      type,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      opacity: 1,
      locked: false,
      stroke: s.stroke || "#ff3b30",
      fill: s.fill || "rgba(255,59,48,0.0)",
      strokeWidth: s.strokeWidth || 4,
      dash: s.dash || [],
      shadow: !!s.shadow,
      radius: 16,
      points: [],
      text: "",
      fontSize: s.fontSize || 28,
      fontFamily: s.fontFamily || "Segoe UI",
      fontWeight: "700",
      italic: false,
      align: "left",
      twoWay: false,
      arrowHead: s.arrowHead || "stealth",
      arrowTail: s.arrowTail || "none",
      headScale: s.headScale || 1,
      blur: 12,
      block: 12,
      zoom: 2,
      emoji: "⭐",
      n: 1,
      src: "",
    };
    if (type === "highlight") {
      base.stroke = solidColor(s.stroke) || "#ffd60a";
      base.strokeWidth = Math.max(14, s.strokeWidth || 22);
      base.opacity = s.opacity == null ? 1 : s.opacity;
    }
    if (type === "arrow") {
      base.arrowHead = s.arrowHead || "stealth";
      base.arrowTail = s.arrowTail || "none";
      base.headScale = s.headScale || 1;
      base.twoWay = !!s.twoWay;
      base.strokeWidth = s.strokeWidth || 5;
    }
    if (type === "text" || type === "note" || type === "callout") {
      base.fill = s.fill || (type === "note" ? "#ffe56d" : "rgba(0,0,0,0)");
      base.stroke = s.stroke || (type === "note" ? "#e0c14c" : "#ff3b30");
      base.text = type === "note" ? "Заметка" : "Текст";
    }
    if (type === "redact") {
      base.fill = "#111111";
      base.stroke = "#111111";
    }
    if (type === "step") {
      base.fill = s.stroke || "#ff3b30";
      base.stroke = "#ffffff";
      base.w = 36;
      base.h = 36;
    }
    if (type === "stamp") {
      base.w = 48;
      base.h = 48;
    }
    if (type === "spotlight") {
      base.dim = 0.68;
      base.dimColor = "#000000";
      base.feather = 28;
      base.shape = "ellipse";
      base.fill = "#000000";
      base.stroke = "#ffffff";
      base.strokeWidth = 0;
    }
    if (type === "magnify") {
      base.zoom = 2.5;
      base.shape = "ellipse";
      base.srcFollow = true;
      base.effect = "glass";
      base.feather = 0;
      base.showSource = true;
      base.leader = true;
      base.grid = false;
      base.innerContrast = 10;
      base.stroke = "#ffffff";
      base.strokeWidth = 4;
      base.fill = "rgba(0,0,0,0)";
      base.shadow = true;
    }
    return base;
  };

  E.clone = (o) => JSON.parse(JSON.stringify(o));

  const CYR = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ";
  const cyrL = "абвгдежзиклмнопрстуфхцчшэюя";

  E.formatStep = function (n, scheme) {
    n = Math.max(1, n | 0);
    if (scheme === "roman") return toRoman(n);
    if (scheme === "lat") return colLetter(n);
    if (scheme === "latLower") return colLetter(n).toLowerCase();
    if (scheme === "cyr") return CYR[(n - 1) % CYR.length];
    if (scheme === "cyrLower") return cyrL[(n - 1) % cyrL.length];
    return String(n);
  };

  E.renumberSteps = function (objects) {
    const steps = objects.filter((o) => o.type === "step");
    const byParent = new Map();
    for (const s of steps) {
      const k = s.parentKey || "";
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(s);
    }
    for (const [, arr] of byParent) {
      arr.forEach((s, i) => {
        s.n = i + 1;
        const parent = s.parentKey ? steps.find((x) => x.id === s.parentKey) : null;
        const prefix = parent ? (parent.label || E.formatStep(parent.n, parent.scheme)) + "." : "";
        s.label = prefix + E.formatStep(s.n, s.scheme);
      });
    }
  };

  function toRoman(num) {
    const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let s = "";
    for (const [v, g] of map) while (num >= v) { s += g; num -= v; }
    return s;
  }
  function colLetter(n) {
    let s = "";
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }
  function chaikin(pts, iter) {
    let p = pts;
    for (let k = 0; k < (iter || 1); k++) {
      const n = [];
      if (!p.length) return p;
      n.push(p[0]);
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        n.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
        n.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      n.push(p[p.length - 1]);
      p = n;
    }
    return p;
  }

  E.normBox = function (o) {
    if (o.w < 0) {
      o.x += o.w;
      o.w = -o.w;
    }
    if (o.h < 0) {
      o.y += o.h;
      o.h = -o.h;
    }
    return o;
  };

  E.bounds = function (o) {
    if (o.type === "line" || o.type === "arrow") {
      const x = Math.min(o.x, o.x + o.w);
      const y = Math.min(o.y, o.y + o.h);
      return { x, y, w: Math.abs(o.w), h: Math.abs(o.h) };
    }
    if (o.type === "pen" || o.type === "highlight" || o.type === "laser") {
      if (!o.points.length) return { x: o.x, y: o.y, w: 0, h: 0 };
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const p of o.points) {
        minx = Math.min(minx, p[0]);
        miny = Math.min(miny, p[1]);
        maxx = Math.max(maxx, p[0]);
        maxy = Math.max(maxy, p[1]);
      }
      const pad = o.strokeWidth;
      return { x: minx - pad, y: miny - pad, w: maxx - minx + pad * 2, h: maxy - miny + pad * 2 };
    }
    if (o.type === "text") {
      return { x: o.x, y: o.y, w: Math.max(o.w, 40), h: Math.max(o.h, o.fontSize * 1.4) };
    }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  };

  E.applyStyle = function (ctx, o) {
    ctx.globalAlpha = o.opacity == null ? 1 : o.opacity;
    ctx.strokeStyle = o.stroke;
    ctx.fillStyle = o.fill;
    ctx.lineWidth = o.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(o.dash && o.dash.length ? o.dash : []);
    if (o.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 3;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
  };

  E.withRot = function (ctx, o, fn) {
    const b = E.bounds(o);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.save();
    if (o.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate(o.rotation);
      ctx.translate(-cx, -cy);
    }
    fn();
    ctx.restore();
  };

  E.drawObject = function (ctx, o, baseCanvas) {
    if (o.type === "magnify") {
      E.drawMagnify(ctx, o, baseCanvas);
      return;
    }
    if (o.type === "spotlight") return;
    E.withRot(ctx, o, () => {
      E.applyStyle(ctx, o);
      switch (o.type) {
        case "rect":
        case "redact":
          ctx.beginPath();
          ctx.rect(o.x, o.y, o.w, o.h);
          ctx.fill();
          if (o.type !== "redact") ctx.stroke();
          break;
        case "roundrect":
        case "note":
        case "callout": {
          roundRect(ctx, o.x, o.y, o.w, o.h, o.radius || 14);
          ctx.fill();
          ctx.stroke();
          if (o.type === "callout") {
            const px = o.x + (o.pointerX != null ? o.pointerX : o.w * 0.2);
            const py = o.y + o.h + (o.pointerY != null ? o.pointerY : 22);
            ctx.beginPath();
            ctx.moveTo(o.x + o.w * 0.18, o.y + o.h);
            ctx.lineTo(px, py);
            ctx.lineTo(o.x + o.w * 0.32, o.y + o.h);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          if (o.text) drawTextBox(ctx, o);
          break;
        }
        case "ellipse":
          ctx.beginPath();
          ellipsePath(ctx, o);
          ctx.fill();
          ctx.stroke();
          break;
        case "blur":
          if (baseCanvas) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(o.x, o.y, o.w, o.h);
            ctx.clip();
            ctx.filter = `blur(${o.blur || 12}px)`;
            ctx.drawImage(baseCanvas, 0, 0);
            ctx.restore();
          }
          ctx.beginPath();
          ctx.rect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.stroke();
          break;
        case "pixelate":
          if (baseCanvas) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(o.x, o.y, o.w, o.h);
            ctx.clip();
            const block = Math.max(4, o.block || 12);
            const sx = Math.max(1, Math.round(Math.abs(o.w) / block));
            const sy = Math.max(1, Math.round(Math.abs(o.h) / block));
            const tmp = document.createElement("canvas");
            tmp.width = sx;
            tmp.height = sy;
            const tctx = tmp.getContext("2d");
            tctx.imageSmoothingEnabled = false;
            tctx.drawImage(baseCanvas, o.x, o.y, o.w, o.h, 0, 0, sx, sy);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, 0, 0, sx, sy, o.x, o.y, o.w, o.h);
            ctx.restore();
          }
          ctx.beginPath();
          ctx.rect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.stroke();
          break;
        case "triangle":
          ctx.beginPath();
          ctx.moveTo(o.x + o.w / 2, o.y);
          ctx.lineTo(o.x + o.w, o.y + o.h);
          ctx.lineTo(o.x, o.y + o.h);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        case "line":
        case "arrow": {
          const x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
          const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
          const cpx = o.cpx != null ? o.cpx : midX;
          const cpy = o.cpy != null ? o.cpy : midY;
          const curved = Math.hypot(cpx - midX, cpy - midY) >= 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          if (curved) ctx.quadraticCurveTo(cpx, cpy, x2, y2);
          else ctx.lineTo(x2, y2);
          ctx.stroke();
          if (o.type === "arrow") {
            const fromHead = curved ? [cpx, cpy] : [x1, y1];
            const fromTail = curved ? [cpx, cpy] : [x2, y2];
            drawCap(ctx, fromHead[0], fromHead[1], x2, y2, o, "head");
            drawCap(ctx, fromTail[0], fromTail[1], x1, y1, o, "tail");
          }
          break;
        }
        case "pen":
        case "highlight":
        case "laser": {
          if (!o.points.length) break;
          if (o.type === "highlight") {
            ctx.strokeStyle = solidColor(o.stroke) || o.stroke;
            ctx.fillStyle = ctx.strokeStyle;
          }
          if (o.type === "laser") {
            ctx.shadowColor = o.stroke || "#ff2d55";
            ctx.shadowBlur = 18;
            ctx.strokeStyle = o.stroke || "#ff2d55";
            ctx.fillStyle = o.stroke || "#ff2d55";
            ctx.lineWidth = Math.max(5, o.strokeWidth || 5);
          }
          if (o.points.length === 1) {
            ctx.beginPath();
            ctx.arc(o.points[0][0], o.points[0][1], Math.max(3, ctx.lineWidth / 2), 0, Math.PI * 2);
            ctx.fill();
          } else {
            const pts = o.smooth ? chaikin(o.points, 2) : o.points;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = "source-over";
          ctx.shadowBlur = 0;
          break;
        }
        case "image":
          if (o._img) ctx.drawImage(o._img, o.x, o.y, o.w, o.h);
          else if (o.src) {
            const im = new Image();
            im.onload = () => { o._img = im; };
            im.src = o.src;
          }
          break;
        case "watermark": {
          ctx.save();
          ctx.globalAlpha = o.opacity != null ? o.opacity : 0.18;
          ctx.fillStyle = o.stroke || "#ffffff";
          ctx.font = `700 ${o.fontSize || 28}px ${o.fontFamily || "Segoe UI"}`;
          ctx.translate(o.x, o.y);
          ctx.rotate(o.rotation || -0.4);
          const label = o.text || "Confidential";
          const stepX = ctx.measureText(label).width + 80;
          const stepY = (o.fontSize || 28) + 70;
          for (let yy = -40; yy < (o.h || 400) + 80; yy += stepY) {
            for (let xx = -40; xx < (o.w || 400) + 80; xx += stepX) ctx.fillText(label, xx, yy);
          }
          ctx.restore();
          break;
        }
        case "text":
          drawTextBox(ctx, o);
          break;
        case "step": {
          const r = Math.max(o.w, o.h) / 2;
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#fff";
          const label = o.label || E.formatStep(o.n || 1, o.scheme);
          const fs = Math.max(10, Math.round(r * (label.length > 2 ? 0.7 : 1)));
          ctx.font = `700 ${fs}px ${o.fontFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "transparent";
          ctx.fillText(label, cx, cy + 1);
          break;
        }
        case "stamp":
          ctx.font = `${Math.round(Math.max(o.w, o.h))}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(o.emoji || "⭐", o.x + o.w / 2, o.y + o.h / 2);
          break;
        default:
          break;
      }
    });
  };

  function ellipsePath(ctx, o) {
    ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w) / 2, Math.abs(o.h) / 2, 0, 0, Math.PI * 2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawTextBox(ctx, o) {
    ctx.save();
    ctx.shadowColor = o.shadow ? "rgba(0,0,0,0.45)" : "transparent";
    ctx.fillStyle = o.type === "text" ? o.stroke : "#1b1406";
    ctx.font = `${o.italic ? "italic " : ""}${o.fontWeight || "700"} ${o.fontSize}px ${o.fontFamily}`;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = "top";
    const pad = o.type === "text" ? 0 : 10;
    const maxW = Math.max(20, o.w - pad * 2);
    const lines = wrapText(ctx, o.text || "", maxW);
    let x = o.x + pad;
    if (o.align === "center") x = o.x + o.w / 2;
    if (o.align === "right") x = o.x + o.w - pad;
    let y = o.y + pad;
    const lh = o.fontSize * 1.25;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lh;
    }
    o.h = Math.max(o.h, y - o.y + pad);
    ctx.restore();
  }

  function wrapText(ctx, text, maxW) {
    const paragraphs = String(text).split("\n");
    const lines = [];
    for (const p of paragraphs) {
      const words = p.split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      lines.push(line);
    }
    return lines.length ? lines : [""];
  }

  function capKind(o, end) {
    if (end === "head") return o.arrowHead || "stealth";
    if (o.arrowTail && o.arrowTail !== "none") return o.arrowTail;
    if (o.twoWay) return o.arrowHead || "stealth";
    return "none";
  }

  function drawCap(ctx, fx, fy, tx, ty, o, end) {
    const kind = capKind(o, end);
    if (!kind || kind === "none") return;
    const ang = Math.atan2(ty - fy, tx - fx);
    const sw = o.strokeWidth || 4;
    const len = (10 + sw * 1.8) * (o.headScale || 1);
    const col = solidColor(o.stroke) || o.stroke || "#ff3b30";
    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    if (kind === "circle") {
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(3, sw * 1.15 * (o.headScale || 1)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const left = (a) => [tx - len * Math.cos(ang - a), ty - len * Math.sin(ang - a)];
    const right = (a) => [tx - len * Math.cos(ang + a), ty - len * Math.sin(ang + a)];
    if (kind === "open") {
      const a = left(0.5), b = right(0.5);
      ctx.lineWidth = Math.max(2, sw * 0.9);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(tx, ty);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    if (kind === "diamond") {
      const back = [tx - len * Math.cos(ang), ty - len * Math.sin(ang)];
      const a = left(0.7), b = right(0.7);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(back[0], back[1]);
      ctx.lineTo(b[0], b[1]);
    } else if (kind === "triangle") {
      const a = left(0.45), b = right(0.45);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    } else {
      const a = left(0.38), b = right(0.38);
      const notch = [tx - len * 0.55 * Math.cos(ang), ty - len * 0.55 * Math.sin(ang)];
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(notch[0], notch[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function solidColor(c) {
    if (!c) return "";
    const s = String(c);
    if (s[0] === "#") {
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return "#" + h.slice(0, 6);
    }
    const m = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
      return "#" + hex;
    }
    return s;
  }

  E.pointInObject = function (o, x, y) {
    const b = E.bounds(o);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let px = x, py = y;
    if (o.rotation) {
      const dx = x - cx, dy = y - cy;
      const c = Math.cos(-o.rotation), s = Math.sin(-o.rotation);
      px = cx + dx * c - dy * s;
      py = cy + dx * s + dy * c;
    }
    if (o.type === "line" || o.type === "arrow") {
      return distToSeg(px, py, o.x, o.y, o.x + o.w, o.y + o.h) <= Math.max(6, o.strokeWidth);
    }
    if (o.type === "pen" || o.type === "highlight" || o.type === "laser") {
      for (let i = 1; i < o.points.length; i++) {
        if (distToSeg(px, py, o.points[i - 1][0], o.points[i - 1][1], o.points[i][0], o.points[i][1]) <= o.strokeWidth) return true;
      }
      return false;
    }
    return px >= b.x && py >= b.y && px <= b.x + b.w && py <= b.y + b.h;
  };

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  E.handles = function (o) {
    const b = E.bounds(o);
    if (o.type === "line" || o.type === "arrow") {
      return [
        { id: "p1", x: o.x, y: o.y },
        { id: "p2", x: o.x + o.w, y: o.y + o.h },
        {
          id: "cp",
          x: o.cpx != null ? o.cpx : o.x + o.w / 2,
          y: o.cpy != null ? o.cpy : o.y + o.h / 2,
        },
      ];
    }
    const hs = [
      { id: "nw", x: b.x, y: b.y },
      { id: "n", x: b.x + b.w / 2, y: b.y },
      { id: "ne", x: b.x + b.w, y: b.y },
      { id: "e", x: b.x + b.w, y: b.y + b.h / 2 },
      { id: "se", x: b.x + b.w, y: b.y + b.h },
      { id: "s", x: b.x + b.w / 2, y: b.y + b.h },
      { id: "sw", x: b.x, y: b.y + b.h },
      { id: "w", x: b.x, y: b.y + b.h / 2 },
      { id: "rot", x: b.x + b.w / 2, y: b.y - 28 },
    ];
    if (o.type === "magnify") {
      const src = E.magSource(o);
      hs.push({ id: "src", x: src.x, y: src.y });
    }
    if (o.type === "callout") {
      hs.push({
        id: "tip",
        x: o.x + (o.pointerX != null ? o.pointerX : o.w * 0.2),
        y: o.y + o.h + (o.pointerY != null ? o.pointerY : 22),
      });
    }
    return hs;
  };

  E.applyHandle = function (o, hid, x, y, start) {
    if (hid === "p1") {
      o.w = start.x + start.w - x;
      o.h = start.y + start.h - y;
      o.x = x;
      o.y = y;
      return;
    }
    if (hid === "p2") {
      o.w = x - o.x;
      o.h = y - o.y;
      return;
    }
    if (hid === "src") {
      o.srcX = x;
      o.srcY = y;
      o.srcFollow = false;
      return;
    }
    if (hid === "cp") {
      o.cpx = x;
      o.cpy = y;
      return;
    }
    if (hid === "tip") {
      o.pointerX = x - o.x;
      o.pointerY = y - (o.y + o.h);
      return;
    }
    if (hid === "rot") {
      const b = E.bounds(start);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      o.rotation = Math.atan2(y - cy, x - cx) + Math.PI / 2;
      return;
    }
    let { x: nx, y: ny, w, h } = start;
    if (hid.includes("n")) {
      h = start.y + start.h - y;
      ny = y;
    }
    if (hid.includes("s")) h = y - start.y;
    if (hid.includes("w")) {
      w = start.x + start.w - x;
      nx = x;
    }
    if (hid.includes("e")) w = x - start.x;
    o.x = nx;
    o.y = ny;
    o.w = w;
    o.h = h;
    if (o.type === "magnify" && o.srcFollow !== false) {
      o.srcX = o.x + o.w / 2;
      o.srcY = o.y + o.h / 2;
    }
  };

  E.magSource = function (o) {
    if (o.srcX != null && o.srcY != null) return { x: o.srcX, y: o.srcY };
    return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
  };

  function shapePath(ctx, o) {
    const sh = o.shape || "ellipse";
    if (sh === "rect") ctx.rect(o.x, o.y, o.w, o.h);
    else if (sh === "roundrect") {
      roundRect(ctx, o.x, o.y, o.w, o.h, o.radius || Math.min(Math.abs(o.w), Math.abs(o.h)) * 0.2);
    } else ellipsePath(ctx, o);
  }

  function colorToRgba(c, a) {
    if (!c) return `rgba(0,0,0,${a})`;
    if (c[0] === "#") {
      let h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h.slice(0, 6), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    const m = String(c).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
    return `rgba(0,0,0,${a})`;
  }

  function isWashFill(c) {
    return /255\s*,\s*59\s*,\s*48/.test(String(c || ""));
  }

  E.drawSpotlights = function (ctx, objects, w, h) {
    const spots = objects.filter((o) => o.type === "spotlight");
    if (!spots.length) return;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const sctx = tmp.getContext("2d");
    let dim = 0;
    let dimColor = "#000000";
    for (const s of spots) {
      const d = (s.dim != null ? s.dim : 0.68) * (s.opacity != null ? s.opacity : 1);
      if (d >= dim) {
        dim = d;
        dimColor = s.dimColor || "#000000";
        if (isWashFill(dimColor) || isWashFill(s.fill)) dimColor = "#000000";
      }
    }
    sctx.fillStyle = colorToRgba(dimColor, Math.min(0.92, Math.max(0.15, dim)));
    sctx.fillRect(0, 0, w, h);
    sctx.globalCompositeOperation = "destination-out";
    for (const o of spots) {
      sctx.save();
      const b = E.bounds(o);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (o.rotation) {
        sctx.translate(cx, cy);
        sctx.rotate(o.rotation);
        sctx.translate(-cx, -cy);
      }
      const feather = Math.max(0, o.feather || 0);
      if (feather) sctx.filter = `blur(${feather}px)`;
      sctx.fillStyle = "#000";
      sctx.beginPath();
      shapePath(sctx, o);
      sctx.fill();
      sctx.restore();
    }
    ctx.drawImage(tmp, 0, 0);
    for (const o of spots) {
      if (!o.strokeWidth) continue;
      E.withRot(ctx, o, () => {
        ctx.beginPath();
        shapePath(ctx, o);
        ctx.strokeStyle = o.stroke || "#ffffff";
        ctx.lineWidth = o.strokeWidth;
        ctx.globalAlpha = o.opacity != null ? o.opacity : 1;
        ctx.setLineDash(o.dash && o.dash.length ? o.dash : []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
    }
  };

  E.drawMagnify = function (ctx, o, baseCanvas) {
    if (!baseCanvas) return;
    const z = Math.max(1.05, o.zoom || 2);
    const src = E.magSource(o);
    const sw = Math.max(2, Math.abs(o.w) / z);
    const sh = Math.max(2, Math.abs(o.h) / z);
    const sx = src.x - sw / 2;
    const sy = src.y - sh / 2;
    const lensCx = o.x + o.w / 2;
    const lensCy = o.y + o.h / 2;
    const dist = Math.hypot(src.x - lensCx, src.y - lensCy);

    if (o.leader !== false && dist > 10) {
      ctx.save();
      ctx.strokeStyle = o.stroke || "#ffffff";
      ctx.lineWidth = Math.max(1.5, (o.strokeWidth || 3) * 0.55);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(lensCx, lensCy);
      ctx.stroke();
      ctx.restore();
    }

    if (o.showSource !== false) {
      ctx.save();
      ctx.strokeStyle = "#ff6a3d";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.95;
      const frame = { x: sx, y: sy, w: sw, h: sh, shape: o.shape, radius: (o.radius || 12) / z };
      ctx.beginPath();
      shapePath(ctx, frame);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(src.x, src.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ff6a3d";
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    if (o.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
    }
    ctx.beginPath();
    shapePath(ctx, o);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();

    const effect = o.effect || "none";
    const extra = 1 + (o.innerContrast || 0) / 100;
    let filter = `contrast(${extra})`;
    if (effect === "sharp") filter = `contrast(${1.35 * extra}) saturate(1.2)`;
    else if (effect === "invert") filter = `invert(1) contrast(${extra})`;
    else if (effect === "saturate") filter = `saturate(1.85) contrast(${extra})`;
    else if (effect === "warm") filter = `sepia(0.28) saturate(1.25) contrast(${extra})`;
    else if (effect === "cool") filter = `hue-rotate(190deg) saturate(0.85) contrast(${extra})`;
    else if (effect === "outline") filter = `contrast(${1.7 * extra}) brightness(1.08) saturate(0.85)`;
    else if (effect === "glass") filter = `brightness(1.06) contrast(${1.12 * extra}) saturate(1.08)`;
    ctx.filter = filter;

    const pixel = effect === "pixel";
    if (pixel) {
      const tmp = document.createElement("canvas");
      tmp.width = Math.max(1, Math.round(sw));
      tmp.height = Math.max(1, Math.round(sh));
      const tctx = tmp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.filter = "none";
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, o.x, o.y, o.w, o.h);
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(baseCanvas, sx, sy, sw, sh, o.x, o.y, o.w, o.h);
    }
    ctx.filter = "none";

    if (effect === "glass" || o.glass) {
      const g = ctx.createRadialGradient(
        o.x + o.w * 0.32,
        o.y + o.h * 0.28,
        2,
        lensCx,
        lensCy,
        Math.max(o.w, o.h) * 0.7
      );
      g.addColorStop(0, "rgba(255,255,255,0.38)");
      g.addColorStop(0.35, "rgba(255,255,255,0.08)");
      g.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = g;
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }

    if (o.grid && z >= 2.2) {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      const stepX = o.w / sw;
      const stepY = o.h / sh;
      if (stepX >= 4 && stepY >= 4) {
        ctx.beginPath();
        for (let x = o.x; x <= o.x + o.w + 0.5; x += stepX) {
          ctx.moveTo(x, o.y);
          ctx.lineTo(x, o.y + o.h);
        }
        for (let y = o.y; y <= o.y + o.h + 0.5; y += stepY) {
          ctx.moveTo(o.x, y);
          ctx.lineTo(o.x + o.w, y);
        }
        ctx.stroke();
      }
    }

    if (o.feather > 0) {
      ctx.globalCompositeOperation = "destination-in";
      const pad = o.feather;
      const gg = ctx.createRadialGradient(lensCx, lensCy, Math.max(4, Math.min(o.w, o.h) / 2 - pad), lensCx, lensCy, Math.min(o.w, o.h) / 2);
      gg.addColorStop(0, "rgba(0,0,0,1)");
      gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.restore();

    ctx.save();
    ctx.beginPath();
    shapePath(ctx, o);
    ctx.strokeStyle = o.stroke || "#ffffff";
    ctx.lineWidth = o.strokeWidth || 3;
    ctx.globalAlpha = o.opacity != null ? o.opacity : 1;
    ctx.setLineDash(o.dash && o.dash.length ? o.dash : []);
    ctx.stroke();
    ctx.restore();
  };

  E.History = class {
    constructor() {
      this.stack = [];
      this.index = -1;
    }
    push(state) {
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push(state);
      if (this.stack.length > 80) this.stack.shift();
      this.index = this.stack.length - 1;
    }
    undo() {
      if (this.index <= 0) return null;
      this.index -= 1;
      return this.stack[this.index];
    }
    redo() {
      if (this.index >= this.stack.length - 1) return null;
      this.index += 1;
      return this.stack[this.index];
    }
  };

  E.filterImage = function (img, adj) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext("2d");
    const b = 1 + (adj.brightness || 0) / 100;
    const ct = 1 + (adj.contrast || 0) / 100;
    const s = 1 + (adj.saturate || 0) / 100;
    ctx.filter = `brightness(${b}) contrast(${ct}) saturate(${s})`;
    ctx.drawImage(img, 0, 0);
    const warmth = adj.warmth || 0;
    if (warmth) {
      ctx.filter = "none";
      ctx.globalCompositeOperation = warmth > 0 ? "overlay" : "multiply";
      ctx.fillStyle = warmth > 0
        ? `rgba(255,160,60,${Math.min(0.45, Math.abs(warmth) / 200)})`
        : `rgba(60,120,255,${Math.min(0.45, Math.abs(warmth) / 200)})`;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
    }
    return c;
  };

  E.exportCanvas = function (img, objects, adj, opts) {
    const filtered = E.filterImage(img, adj);
    const border = (opts && opts.border) || 0;
    const radius = (opts && opts.radius) || 0;
    const pad = (opts && opts.pad) || 0;
    const w = filtered.width + border * 2 + pad * 2;
    const h = filtered.height + border * 2 + pad * 2;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (radius) {
      roundRect(ctx, 0, 0, w, h, radius);
      ctx.clip();
    }
    ctx.fillStyle = (opts && opts.padColor) || "#111111";
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.fillStyle = (opts && opts.borderColor) || "#000";
      ctx.fillRect(pad, pad, filtered.width + border * 2, filtered.height + border * 2);
    }
    const ox = pad + border;
    const oy = pad + border;
    ctx.drawImage(filtered, ox, oy);
    ctx.save();
    ctx.translate(ox, oy);
    E.drawSpotlights(ctx, objects, filtered.width, filtered.height);
    for (const o of objects) {
      if (o.type === "spotlight") continue;
      E.drawObject(ctx, o, filtered);
    }
    ctx.restore();
    return out;
  };
})(window);
