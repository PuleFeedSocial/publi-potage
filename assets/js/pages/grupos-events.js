// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"grupos-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users') };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { loadGruposPage() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-8\"]");
    if (element && !element.onclick) element.onclick = function(event) { openAddGrupo() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-9\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveGruposFilters();renderGruposPage() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-10\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveGruposFilters();renderGruposPage() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-11\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveGruposFilters();renderGruposPage() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-12\"]");
    if (element && !element.oninput) element.oninput = function(event) { renderGruposPage() };
  }
  { const element = document.querySelector("[data-page-event=\"grupos-13\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { saveGrupoPage(event) };
  }
})();
