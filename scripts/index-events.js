// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"index-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
})();
