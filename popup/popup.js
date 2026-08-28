document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.getAttribute("data-mode");
    btn.disabled = true;
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tabId = tabs[0] && tabs[0].id;
      browser.runtime.sendMessage({ type: "SS_CAPTURE", mode, tabId }).catch((e) => {
        notifyFail(e);
      });
    } catch (e) {
      notifyFail(e);
      return;
    }
    window.close();
  });
});

function notifyFail(e) {
  try {
    alert(e && e.message ? e.message : String(e));
  } catch (_) {}
}

document.getElementById("openEditor").addEventListener("click", async () => {
  const { lastCaptureId } = await browser.storage.local.get("lastCaptureId");
  await browser.runtime.sendMessage({ type: "SS_OPEN_EDITOR", id: lastCaptureId });
  window.close();
});

document.getElementById("history").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "SS_OPEN_HISTORY" });
  window.close();
});

document.getElementById("options").addEventListener("click", async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
