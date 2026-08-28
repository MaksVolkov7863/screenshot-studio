document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.getAttribute("data-mode");
    btn.disabled = true;
    try {
      await browser.runtime.sendMessage({ type: "SS_CAPTURE", mode });
      window.close();
    } catch (e) {
      btn.disabled = false;
      alert(e && e.message ? e.message : String(e));
    }
  });
});

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
