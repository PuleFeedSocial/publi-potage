// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"sucursales-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users') };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { loadSucursales() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-8\"]");
    if (element && !element.onclick) element.onclick = function(event) { openAddSucursal() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-9\"]");
    if (element && !element.oninput) element.oninput = function(event) { renderSucursales() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-10\"]");
    if (element && !element.onchange) element.onchange = function(event) { renderSucursales() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-11\"]");
    if (element && !element.onchange) element.onchange = function(event) { renderSucursales() };
  }
  { const element = document.querySelector("[data-page-event=\"sucursales-12\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { saveSucursal(event) };
  }
})();
