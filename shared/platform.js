(function (g) {
  let cached = null;
  async function getInfo() {
    if (cached) return cached;
    let info = { os: "unknown" };
    try {
      info = await browser.runtime.getPlatformInfo();
    } catch (_) {}
    const ua = (g.navigator && g.navigator.userAgent) || "";
    info.mobile = info.os === "android" || /Android/i.test(ua);
    cached = info;
    return info;
  }
  async function isMobile() {
    return (await getInfo()).mobile;
  }
  async function applyClass() {
    if (!(g.document && (await isMobile()))) return false;
    g.document.documentElement.classList.add("ss-mobile");
    if (g.document.body) g.document.body.classList.add("ss-mobile");
    return true;
  }
  g.SSPlatform = { getInfo, isMobile, applyClass };
})(typeof globalThis !== "undefined" ? globalThis : window);
