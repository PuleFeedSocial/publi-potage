// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"register-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"register-2\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { handleRegister(event) };
  }
  { const element = document.querySelector("[data-page-event=\"register-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { togglePassword('reg-password', this) };
  }
})();
