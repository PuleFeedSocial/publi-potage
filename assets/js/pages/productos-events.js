// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"productos-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"productos-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas');window.location='dashboard.html' };
  }
  { const element = document.querySelector("[data-page-event=\"productos-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users');window.location='dashboard.html' };
  }
  { const element = document.querySelector("[data-page-event=\"productos-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"productos-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"productos-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
})();
