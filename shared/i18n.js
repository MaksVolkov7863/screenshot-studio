(function (g) {
  const lang = (() => {
    try {
      const l = (browser.i18n.getUILanguage() || "").toLowerCase();
      return l.startsWith("en") ? "en" : "ru";
    } catch (_) {
      return "ru";
    }
  })();

  const dict = {
    ru: {
      captureVisible: "Видимая область",
      captureRegion: "Область",
      captureFull: "Вся страница",
      captureElement: "Элемент",
      captureScroll: "Скролл области",
      captureMulti: "Несколько областей",
      captureTimer: "Таймер",
      captureWait: "Ждать изменение",
      captureHide: "Скрыть UI сайта",
      captureGif: "GIF области",
      captureScrollVideo: "Видео скролла",
      captureVideoFrame: "Кадр из видео",
      captureRepeat: "Повторить последний",
      edit: "Править",
      copy: "Копировать",
      save: "Сохранить",
      pin: "Пин",
      search: "Искать",
      addRegion: "Ещё область",
      scrollThis: "Скролл этой колонки",
      gifThis: "GIF",
      cancel: "Отмена",
      done: "Готово",
      captureNow: "Снять сейчас",
      pause: "Пауза",
      resume: "Далее",
      history: "История",
      copied: "Скопировано в буфер",
      saved: "Сохранено",
      overlayHint: "Перетащите область · Shift — квадрат · Enter — весь экран · ± лупа · Esc — отмена",
      overlayHintMulti: "Ещё область или Готово. Enter — весь экран.",
      hideHint: "Клик — скрыть элемент. Sticky / Cookie / Чат. Enter — снять.",
      waitHint: "Жду модалку или изменение страницы…",
      timerHint: "Страница живая: откройте меню. 3 / 5 / 10 сек.",
    },
    en: {
      captureVisible: "Visible area",
      captureRegion: "Region",
      captureFull: "Full page",
      captureElement: "Element",
      captureScroll: "Scroll region",
      captureMulti: "Multiple regions",
      captureTimer: "Timer",
      captureWait: "Wait for change",
      captureHide: "Hide site UI",
      captureGif: "Region GIF",
      captureScrollVideo: "Scroll video",
      captureVideoFrame: "Video frame",
      captureRepeat: "Repeat last",
      edit: "Edit",
      copy: "Copy",
      save: "Save",
      pin: "Pin",
      search: "Search",
      addRegion: "Add region",
      scrollThis: "Scroll this column",
      gifThis: "GIF",
      cancel: "Cancel",
      done: "Done",
      captureNow: "Capture now",
      pause: "Pause",
      resume: "Resume",
      history: "History",
      copied: "Copied to clipboard",
      saved: "Saved",
      overlayHint: "Drag a region · Shift square · Enter full view · ± magnifier · Esc cancel",
      overlayHintMulti: "Add another region or Done. Enter — full view.",
      hideHint: "Click to hide. Sticky / Cookie / Chat. Enter to capture.",
      waitHint: "Waiting for a modal or page change…",
      timerHint: "Page is live — open menus. 3 / 5 / 10 s.",
    },
  };

  g.SSI18n = {
    lang,
    t(key) {
      return (dict[lang] && dict[lang][key]) || dict.ru[key] || key;
    },
  };
})(typeof window !== "undefined" ? window : self);
