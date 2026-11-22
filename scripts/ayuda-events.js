// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"ayuda-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"ayuda-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"ayuda-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users') };
  }
  { const element = document.querySelector("[data-page-event=\"ayuda-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"ayuda-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"ayuda-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
})();
