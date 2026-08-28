const grid = document.getElementById("grid");
const q = document.getElementById("q");
const favOnly = document.getElementById("favOnly");

async function render() {
  const rows = await SSIDB.list();
  const term = q.value.trim().toLowerCase();
  const list = rows.filter((r) => {
    if (favOnly.checked && !r.favorite) return false;
    if (!term) return true;
    const m = r.meta || {};
    return `${m.title || ""} ${m.url || ""} ${m.mode || ""}`.toLowerCase().includes(term);
  });
  grid.innerHTML = list.map((r) => {
    const m = r.meta || {};
    const when = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
    return `<article class="card" data-id="${r.id}">
      <img src="${r.thumb || r.dataUrl}" alt="">
      <div class="meta"><b title="${escapeAttr(m.title || "")}">${escapeHtml(m.title || m.mode || "снимок")}</b>${when}<br>${escapeHtml((m.url || "").replace(/^https?:\/\//, "").slice(0, 48))}</div>
      <div class="acts">
        <button data-act="open">Открыть</button>
        <button data-act="pin">Пин</button>
        <button data-act="fav" class="star">${r.favorite ? "★" : "☆"}</button>
        <button data-act="del">Удалить</button>
      </div>
    </article>`;
  }).join("") || "<p style='padding:20px;color:#8b97a8'>Пока пусто — сделайте первый снимок.</p>";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }

grid.addEventListener("click", async (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const id = card.dataset.id;
  const act = e.target.dataset.act;
  if (!act || act === "open" || e.target.tagName === "IMG") {
    browser.runtime.sendMessage({ type: "SS_OPEN_EDITOR", id });
    return;
  }
  if (act === "pin") browser.runtime.sendMessage({ type: "SS_OPEN_PIN", id });
  if (act === "fav") {
    await browser.runtime.sendMessage({ type: "SS_FAV", id });
    render();
  }
  if (act === "del") {
    await SSIDB.del(id);
    render();
  }
});
q.addEventListener("input", render);
favOnly.addEventListener("change", render);
render();
