(function () {
  'use strict';
  if (!window.HtmlBoxClipboard) return;
  var clipboard = {
    writeText: function (text) {
      try {
        return HtmlBoxClipboard.writeText(String(text)) ? Promise.resolve() : Promise.reject(new Error('无法写入剪贴板'));
      } catch (error) { return Promise.reject(error); }
    },
    readText: function () {
      try { return Promise.resolve(String(HtmlBoxClipboard.readText())); }
      catch (error) { return Promise.reject(error); }
    }
  };
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard }); }
  catch (_) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText = clipboard.writeText;
      navigator.clipboard.readText = clipboard.readText;
    }
  }
})();
