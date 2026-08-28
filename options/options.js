const DEFAULTS = {
  afterCapture: "editor",
  format: "png",
  jpegQuality: 0.92,
  hideFixed: true,
  hideScrollbars: true,
  delayMs: 3000,
  filenamePattern: "{site}-{title}-{date}-{time}",
  autoFolder: true,
  includeCursor: true,
  includeClicks: true,
  scaleExport: "screen",
  imgbbKey: "",
  uploadUrl: "",
  githubRepo: "",
  webhookUrl: "",
  quietToast: true,
  ocrKey: "",
};

async function load() {
  const { settings } = await browser.storage.local.get("settings");
  const s = { ...DEFAULTS, ...(settings || {}) };
  for (const k of Object.keys(DEFAULTS)) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!s[k];
    else el.value = s[k];
  }
  document.getElementById("qVal").textContent = Math.round(s.jpegQuality * 100) + "%";
}

document.getElementById("jpegQuality").addEventListener("input", (e) => {
  document.getElementById("qVal").textContent = Math.round(e.target.value * 100) + "%";
});

document.getElementById("save").addEventListener("click", async () => {
  const settings = {};
  for (const k of Object.keys(DEFAULTS)) {
    const el = document.getElementById(k);
    if (!el) continue;
    settings[k] = el.type === "checkbox" ? el.checked : el.type === "number" || k === "jpegQuality" ? +el.value : el.value;
  }
  await browser.storage.local.set({ settings });
  const ok = document.getElementById("ok");
  ok.hidden = false;
  setTimeout(() => { ok.hidden = true; }, 1600);
});

async function pingOcr() {
  const el = document.getElementById("ocrStatus");
  try {
    const res = await browser.runtime.sendMessage({ type: "SS_OCR_PING" });
    if (res && res.ok) el.textContent = "Windows OCR подключён.";
    else el.textContent = "Host не установлен. Запустите native\\install-ocr-host.ps1 (нужен ключ в реестре Firefox) и полностью закройте Firefox.";
  } catch (e) {
    el.textContent = "Host не установлен: " + (e.message || e);
  }
}

document.getElementById("ocrPing").addEventListener("click", pingOcr);
load();
pingOcr();
