(async () => {
  const id = new URLSearchParams(location.search).get("id");
  const rec = id && (await SSIDB.get(id));
  const msg = document.getElementById("msg");
  if (!rec) {
    msg.textContent = "Нет снимка";
    return;
  }
  document.getElementById("img").src = rec.thumb || rec.dataUrl;
  try {
    const blob = await (await fetch(rec.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    msg.textContent = "Скопировано в буфер";
  } catch (e) {
    msg.textContent = "Не удалось скопировать: " + e.message;
  }
  setTimeout(() => window.close(), 1600);
})();
