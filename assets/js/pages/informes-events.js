// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"informes-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"informes-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users') };
  }
  { const element = document.querySelector("[data-page-event=\"informes-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { loadInformes() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-8\"]");
    if (element && !element.onclick) element.onclick = function(event) { openSyncModal() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-9\"]");
    if (element && !element.onclick) element.onclick = function(event) { importCSV() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-10\"]");
    if (element && !element.onclick) element.onclick = function(event) { confirmImport() };
  }
  { const element = document.querySelector("[data-page-event=\"informes-11\"]");
    if (element && !element.onclick) element.onclick = function(event) { confirmSync() };
  }
})();
