// Static page interactions. Dynamic UI behavior remains in its feature module.
(() => {
  { const element = document.querySelector("[data-page-event=\"login-1\"]");
    if (element && !element.onclick) element.onclick = function(event) { toggleTheme() };
  }
  { const element = document.querySelector("[data-page-event=\"login-2\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { handleLogin(event) };
  }
  { const element = document.querySelector("[data-page-event=\"login-3\"]");
    if (element && !element.onclick) element.onclick = function(event) { showForgot();return false; };
  }
  { const element = document.querySelector("[data-page-event=\"login-4\"]");
    if (element && !element.onclick) element.onclick = function(event) { togglePassword('login-password', this) };
  }
  { const element = document.querySelector("[data-page-event=\"login-5\"]");
    if (element && !element.onsubmit) element.onsubmit = function(event) { handleForgot(event) };
  }
  { const element = document.querySelector("[data-page-event=\"login-6\"]");
    if (element && !element.onclick) element.onclick = function(event) { togglePassword('forgot-password', this) };
  }
  { const element = document.querySelector("[data-page-event=\"login-7\"]");
    if (element && !element.onclick) element.onclick = function(event) { togglePassword('forgot-confirm', this) };
  }
  { const element = document.querySelector("[data-page-event=\"login-8\"]");
    if (element && !element.onclick) element.onclick = function(event) { showLogin() };
  }
})();
