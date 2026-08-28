if (/Android/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("ss-mobile");
  if (document.body) document.body.classList.add("ss-mobile");
}

function showErr(e) {
  const el = document.getElementById("err");
  const text = e && e.message ? e.message : String(e || "Ошибка");
  if (el) {
    el.hidden = false;
    el.textContent = text;
  }
  try { alert(text); } catch (_) {}
}

function isPageTab(t) {
  if (!t || t.id == null) return false;
  const url = String(t.url || "");
  if (url.startsWith("moz-extension:")) return false;
  return true;
}

async function resolveTabId() {
  const queries = [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
    { active: true },
  ];
  for (const q of queries) {
    try {
      const tabs = await browser.tabs.query(q);
      const page = tabs.find(isPageTab);
      if (page) return page.id;
    } catch (_) {}
  }
  throw new Error("Нет открытой вкладки сайта. Откройте страницу и нажмите снова.");
}

async function runCapture(mode, btn) {
  const err = document.getElementById("err");
  if (err) { err.hidden = true; err.textContent = ""; }
  if (btn) btn.disabled = true;
  try {
    const tabId = await resolveTabId();
    await browser.runtime.sendMessage({ type: "SS_CAPTURE", mode, tabId });
    try { window.close(); } catch (_) {}
  } catch (e) {
    if (btn) btn.disabled = false;
    showErr(e);
  }
}

document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => runCapture(btn.getAttribute("data-mode"), btn));
});

document.getElementById("openEditor").addEventListener("click", async () => {
  const { lastCaptureId } = await browser.storage.local.get("lastCaptureId");
  await browser.runtime.sendMessage({ type: "SS_OPEN_EDITOR", id: lastCaptureId });
  try { window.close(); } catch (_) {}
});

document.getElementById("history").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "SS_OPEN_HISTORY" });
  try { window.close(); } catch (_) {}
});

document.getElementById("options").addEventListener("click", async () => {
  await browser.runtime.openOptionsPage();
  try { window.close(); } catch (_) {}
});

const tog = document.getElementById("moreToggle");
if (tog) {
  tog.addEventListener("click", () => {
    document.body.classList.toggle("show-extra");
    tog.textContent = document.body.classList.contains("show-extra") ? "Скрыть лишнее" : "Ещё режимы";
  });
}

if (window.SSPlatform) {
  SSPlatform.applyClass().catch(() => {});
}
