// Apply the preferred theme before the first paint on every page.
(function () {
  let theme;
  try { theme = localStorage.getItem('potageTheme'); } catch {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-bs-theme', theme);
})();
