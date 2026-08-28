(function (g) {
  /* Compact GIF89a encoder for RGBA/ImageData frames. */
  function encodeGif(frames, delayCs) {
    if (!frames.length) throw new Error("no frames");
    delayCs = delayCs || 10;
    const w = frames[0].width;
    const h = frames[0].height;
    const pal = buildPalette(frames);
    const bytes = [];
    const u16 = (n) => {
      bytes.push(n & 255, (n >> 8) & 255);
    };
    bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
    u16(w);
    u16(h);
    bytes.push(0xf7, 0, 0);
    for (let i = 0; i < 256; i++) {
      const c = pal.rgb[i] || [0, 0, 0];
      bytes.push(c[0], c[1], c[2]);
    }
    bytes.push(0x21, 0xff, 0x0b);
    "NETSCAPE2.0".split("").forEach((ch) => bytes.push(ch.charCodeAt(0)));
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);
    for (const frame of frames) {
      bytes.push(0x21, 0xf9, 0x04, 0x04);
      u16(delayCs);
      bytes.push(0x00, 0x00);
      bytes.push(0x2c, 0x00, 0x00, 0x00, 0x00);
      u16(w);
      u16(h);
      bytes.push(0x00);
      const idx = indexFrame(frame, pal);
      const lzw = lzwEncode(idx, 8);
      bytes.push(8);
      for (let i = 0; i < lzw.length; i += 255) {
        const chunk = lzw.subarray(i, i + 255);
        bytes.push(chunk.length);
        for (let j = 0; j < chunk.length; j++) bytes.push(chunk[j]);
      }
      bytes.push(0x00);
    }
    bytes.push(0x3b);
    const bin = Uint8Array.from(bytes);
    let s = "";
    for (let i = 0; i < bin.length; i++) s += String.fromCharCode(bin[i]);
    return "data:image/gif;base64," + btoa(s);
  }

  function buildPalette(frames) {
    const map = new Map();
    const rgb = [];
    const put = (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (map.has(key)) return;
      if (rgb.length >= 256) return;
      map.set(key, rgb.length);
      rgb.push([r, g, b]);
    };
    put(0, 0, 0);
    put(255, 255, 255);
    for (const f of frames) {
      const d = f.data;
      const step = Math.max(16, Math.floor(d.length / 8000) * 4) || 16;
      for (let i = 0; i < d.length; i += step) put(d[i], d[i + 1], d[i + 2]);
      if (rgb.length >= 256) break;
    }
    while (rgb.length < 256) rgb.push([0, 0, 0]);
    return { rgb, map };
  }

  function indexFrame(frame, pal) {
    const d = frame.data;
    const out = new Uint8Array(frame.width * frame.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      let idx = pal.map.get(key);
      if (idx == null) {
        idx = nearest(d[i], d[i + 1], d[i + 2], pal.rgb);
      }
      out[p] = idx;
    }
    return out;
  }

  function nearest(r, g, b, rgb) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < 256; i++) {
      const c = rgb[i];
      const dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
      const dd = dr * dr + dg * dg + db * db;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return best;
  }

  function lzwEncode(pixels, minCode) {
    const clear = 1 << minCode;
    const eoi = clear + 1;
    let codeSize = minCode + 1;
    let nextCode = eoi + 1;
    const maxCode = 4096;
    const out = [];
    let buf = 0, nbits = 0;
    const write = (code) => {
      buf |= code << nbits;
      nbits += codeSize;
      while (nbits >= 8) {
        out.push(buf & 255);
        buf >>= 8;
        nbits -= 8;
      }
    };
    write(clear);
    let dict = new Map();
    let w = String.fromCharCode(pixels[0]);
    for (let i = 1; i < pixels.length; i++) {
      const c = String.fromCharCode(pixels[i]);
      const wc = w + c;
      if (dict.has(wc)) w = wc;
      else {
        write(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
        if (nextCode < maxCode) {
          dict.set(wc, nextCode++);
          if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
        } else {
          write(clear);
          dict = new Map();
          codeSize = minCode + 1;
          nextCode = eoi + 1;
        }
        w = c;
      }
    }
    write(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
    write(eoi);
    if (nbits) out.push(buf & 255);
    return Uint8Array.from(out);
  }

  g.SSGif = { encodeGif };
})(typeof window !== "undefined" ? window : self);
