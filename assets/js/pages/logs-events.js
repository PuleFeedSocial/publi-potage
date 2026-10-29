// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"logs-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"logs-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users') };
  }
  { const element = document.querySelector("[data-page-event=\"logs-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { loadLogs() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-8\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveLogsFilters();renderLogs() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-9\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveLogsFilters();renderLogs() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-10\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveLogsFilters();renderLogs() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-11\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveLogsFilters();renderLogs() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-12\"]");
    if (element && !element.oninput) element.oninput = function(event) { renderLogs() };
  }
  { const element = document.querySelector("[data-page-event=\"logs-13\"]");
    if (element && !element.onclick) element.onclick = function(event) { clearLogsFilters() };
  }
})();
