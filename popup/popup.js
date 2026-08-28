(async () => {
  const mobile = window.SSPlatform ? await SSPlatform.applyClass() : false;
  if (mobile) {
    const tog = document.getElementById("moreToggle");
    if (tog) {
      tog.hidden = false;
      tog.addEventListener("click", () => {
        document.body.classList.toggle("show-extra");
        tog.textContent = document.body.classList.contains("show-extra") ? "Скрыть лишнее" : "Ещё режимы";
      });
    }
  }

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.getAttribute("data-mode");
      btn.disabled = true;
      try {
        let tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tabs[0]) tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0] && tabs[0].id;
        browser.runtime.sendMessage({ type: "SS_CAPTURE", mode, tabId }).catch(notifyFail);
      } catch (e) {
        notifyFail(e);
        btn.disabled = false;
        return;
      }
      try { window.close(); } catch (_) {}
    });
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
})();

function notifyFail(e) {
  try {
    alert(e && e.message ? e.message : String(e));
  } catch (_) {}
}
