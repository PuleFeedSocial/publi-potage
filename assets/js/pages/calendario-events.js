// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"calendario-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { localStorage.setItem('navTarget','users') };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { calNav(-1) };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-8\"]");
    if (element && !element.onclick) element.onclick = function(event) { calGoToday() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-9\"]");
    if (element && !element.onclick) element.onclick = function(event) { calNav(1) };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-10\"]");
    if (element && !element.onclick) element.onclick = function(event) { calSetView('mes') };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-11\"]");
    if (element && !element.onclick) element.onclick = function(event) { calSetView('semana') };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-12\"]");
    if (element && !element.onclick) element.onclick = function(event) { calSetView('dia') };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-13\"]");
    if (element && !element.onclick) element.onclick = function(event) { calSetView('agenda') };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-14\"]");
    if (element && !element.onclick) element.onclick = function(event) { loadCalendario() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-15\"]");
    if (element && !element.onclick) element.onclick = function(event) { openCalModal() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-16\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveCalFilters();renderAll() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-17\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveCalFilters();renderAll() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-18\"]");
    if (element && !element.onchange) element.onchange = function(event) { saveCalFilters();renderAll() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-19\"]");
    if (element && !element.oninput) element.oninput = function(event) { saveCalFilters();renderAll() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-20\"]");
    if (element && !element.onclick) element.onclick = function(event) { calClearFilters() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-21\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { event.preventDefault();saveCalEvent() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-22\"]");
    if (element && !element.onchange) element.onchange = function(event) { calToggleTodoDia() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-23\"]");
    if (element && !element.onchange) element.onchange = function(event) { calFechaChanged() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-24\"]");
    if (element && !element.onchange) element.onchange = function(event) { calHoraChanged() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-25\"]");
    if (element && !element.onchange) element.onchange = function(event) { calHoraChanged() };
  }
  { const element = document.querySelector("[data-page-event=\"calendario-26\"]");
    if (element && !element.onchange) element.onchange = function(event) { calRecurrenciaChanged() };
  }
})();
