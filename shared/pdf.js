(function (g) {
  function imagesToPdf(dataUrls) {
    return Promise.all(dataUrls.map(load)).then((imgs) => {
      const pages = imgs.map((img) => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        const jpeg = c.toDataURL("image/jpeg", 0.9);
        const raw = atob(jpeg.split(",")[1]);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return { w: img.width, h: img.height, bytes };
      });
      return build(pages);
    });
  }

  function load(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  function enc(s) {
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255;
    return a;
  }

  function concat(parts) {
    const n = parts.reduce((a, p) => a + p.length, 0);
    const o = new Uint8Array(n);
    let off = 0;
    for (const p of parts) {
      o.set(p, off);
      off += p.length;
    }
    return o;
  }

  function build(pages) {
    const parts = [];
    const xref = [0];
    const push = (u8) => parts.push(u8);
    const pos = () => parts.reduce((a, p) => a + p.length, 0);
    const obj = (n, dict, stream) => {
      xref[n] = pos();
      push(enc(`${n} 0 obj\n`));
      push(enc(dict));
      if (stream) {
        push(enc("\nstream\n"));
        push(stream);
        push(enc("\nendstream"));
      }
      push(enc("\nendobj\n"));
    };

    push(enc("%PDF-1.4\n"));
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    pages.forEach((p, i) => {
      const pageNo = 3 + i * 3;
      const imgNo = pageNo + 1;
      const cNo = pageNo + 2;
      obj(pageNo, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /XObject << /Im${i} ${imgNo} 0 R >> >> /Contents ${cNo} 0 R >>`);
      obj(imgNo, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>`, p.bytes);
      const content = `q ${p.w} 0 0 ${p.h} 0 0 cm /Im${i} Do Q`;
      obj(cNo, `<< /Length ${content.length} >>`, enc(content));
    });
    const xrefPos = pos();
    let xr = `xref\n0 ${3 + pages.length * 3}\n0000000000 65535 f \n`;
    const count = 3 + pages.length * 3;
    for (let i = 1; i < count; i++) {
      xr += String(xref[i] || 0).padStart(10, "0") + " 00000 n \n";
    }
    push(enc(xr));
    push(enc(`trailer << /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`));
    const out = concat(parts);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < out.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, out.subarray(i, i + CHUNK));
    }
    return "data:application/pdf;base64," + btoa(bin);
  }

  g.SSPdf = { imagesToPdf };
})(typeof window !== "undefined" ? window : self);
