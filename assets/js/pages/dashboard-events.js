// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"dashboard-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-2\"]");
    if (element && !element.onclick) element.onclick = function(event) { switchView('dashboard') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { switchView('zonas') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { switchView('users') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-5\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleSidebar() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { logout() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-8\"]");
    if (element && !element.onclick) element.onclick = function(event) { refreshMarketingData() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-9\"]");
    if (element && !element.onchange) element.onchange = function(event) { applyFilters() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-10\"]");
    if (element && !element.onchange) element.onchange = function(event) { refreshGruposByZona() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-11\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriod('all') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-12\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriod('7') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-13\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriod('15') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-14\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriod('30') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-15\"]");
    if (element && !element.onchange) element.onchange = function(event) { applyFilters() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-16\"]");
    if (element && !element.oninput) element.oninput = function(event) { applyFilters() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-17\"]");
    if (element && !element.onclick) element.onclick = function(event) { clearFilters() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-18\"]");
    if (element && !element.onclick) element.onclick = function(event) { openAddModal() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-19\"]");
    if (element && !element.onclick) element.onclick = function(event) { openBulkModal() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-20\"]");
    if (element && !element.onclick) element.onclick = function(event) { realizarInforme() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-21\"]");
    if (element && !element.onclick) element.onclick = function(event) { openAddRoleModal() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-22\"]");
    if (element && !element.onclick) element.onclick = function(event) { inviteUser() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-23\"]");
    if (element && !element.onclick) element.onclick = function(event) { generateCodes() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-24\"]");
    if (element && !element.onclick) element.onclick = function(event) { addZona() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-25\"]");
    if (element && !element.onclick) element.onclick = function(event) { syncZonas() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-26\"]");
    if (element && !element.onchange) element.onchange = function(event) { renderZonasDashboard() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-27\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriodZonas('all') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-28\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriodZonas('7') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-29\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriodZonas('15') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-30\"]");
    if (element && !element.onclick) element.onclick = function(event) { setPeriodZonas('30') };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-31\"]");
    if (element && !element.onclick) element.onclick = function(event) { openZonaModal() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-32\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { createNewUser(event) };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-33\"]");
    if (element && !element.onclick) element.onclick = function(event) { resetPermissions() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-34\"]");
    if (element && !element.onclick) element.onclick = function(event) { savePermissions() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-35\"]");
    if (element && !element.onclick) element.onclick = function(event) { createRole() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-36\"]");
    if (element && !element.onclick) element.onclick = function(event) { saveUpdate() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-37\"]");
    if (element && !element.onchange) element.onchange = function(event) { toggleCustomInputs() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-38\"]");
    if (element && !element.onchange) element.onchange = function(event) { filterGruposByZona() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-39\"]");
    if (element && !element.onclick) element.onclick = function(event) { saveMarketingRow() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-40\"]");
    if (element && !element.onchange) element.onchange = function(event) { filterGruposBulk() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-41\"]");
    if (element && !element.oninput) element.oninput = function(event) { filterGruposBulkSearch() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-42\"]");
    if (element && !element.onclick) element.onclick = function(event) { saveBulkMarketing() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-43\"]");
    if (element && !element.onclick) element.onclick = function(event) { saveZona() };
  }
  { const element = document.querySelector("[data-page-event=\"dashboard-44\"]");
    if (element && !element.onclick) element.onclick = function(event) { copiarInforme() };
  }
})();
