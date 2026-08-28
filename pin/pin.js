(async () => {
  const id = new URLSearchParams(location.search).get("id");
  const rec = id && (await SSIDB.get(id));
  if (!rec) return;
  const img = document.getElementById("img");
  img.src = rec.dataUrl;
  document.getElementById("copy").onclick = async () => {
    const blob = await (await fetch(rec.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  };
  document.getElementById("edit").onclick = () => {
    browser.runtime.sendMessage({ type: "SS_OPEN_EDITOR", id });
  };
  document.getElementById("close").onclick = () => window.close();
})();
