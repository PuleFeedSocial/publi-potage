/* Account credentials stay in the form only and are cleared after a successful save. */
let accountUser = null;
let accountBusy = false;
function accountFeedback(id, message, kind = 'error') {
  const el = document.getElementById(id);
  el.textContent = message; el.dataset.kind = kind; el.hidden = !message;
}
function accountPaint(user) {
  const name = String(user.name || '').trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => Array.from(n)[0]).join('').toUpperCase() || '?';
  for (const id of ['display-avatar', 'nav-avatar', 'account-avatar']) document.getElementById(id).textContent = initials;
  for (const id of ['display-user-name', 'profile-title']) document.getElementById(id).textContent = name;
  document.getElementById('nav-user-name').textContent = name.split(/\s+/)[0] || 'Cuenta';
  document.getElementById('account-email').textContent = user.email || '';
  document.getElementById('account-role').textContent = user.role || '';
  const admin = String(user.role).toLowerCase() === 'admin';
  const badge = document.getElementById('display-user-role');
  badge.textContent = user.role || ''; badge.className = 'user-role-badge ' + (admin ? 'badge-admin' : 'badge-colab');
  for (const id of ['gestion-label', 'gestion-items']) document.getElementById(id).hidden = !admin;
  currentRole = user.role;
}
function accountResetProfile() {
  if (!accountUser) return;
  document.getElementById('settings-name').value = accountUser.name;
  document.getElementById('settings-email').value = accountUser.email;
  document.getElementById('profile-verification').value = '';
}
function accountLock(busy) {
  accountBusy = busy;
  document.querySelectorAll('.account-grid fieldset').forEach(el => { el.disabled = busy || !accountUser; });
  document.querySelectorAll('.account-grid form').forEach(el => el.setAttribute('aria-busy', String(busy)));
}
async function accountLoad() {
  accountLock(true);
  const status = document.getElementById('account-status');
  status.hidden = false; status.textContent = 'Cargando tu perfil…';
  document.getElementById('account-retry').hidden = true;
  try {
    const {status: code, body} = await apiFetch('/api/auth/me', {signal: AbortSignal.timeout(15000)});
    if (code !== 200) throw new Error('load');
    accountUser = body;
    accountPaint(body); accountResetProfile();
    setSession(getToken(), body, getRefreshToken());
    const date = body.fecha && new Date(/^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha + 'T12:00:00' : body.fecha);
    document.getElementById('account-since').textContent = date && !isNaN(date) ? 'Miembro desde ' + date.toLocaleDateString('es-AR', {month:'long', year:'numeric'}) : '';
    document.querySelectorAll('.verification-label').forEach(el => el.textContent = body.hasActivationCode ? 'Tu código de activación' : 'Contraseña actual');
    document.querySelectorAll('.verification-help').forEach(el => el.textContent = body.hasActivationCode ? 'Los 6 dígitos que usaste al registrarte. No compartas tu código.' : 'Tu cuenta se creó sin código. Verificá el cambio con tu contraseña actual.');
    document.querySelectorAll('.verification-input').forEach(el => {
      el.maxLength = body.hasActivationCode ? 6 : 1000;
      el.inputMode = body.hasActivationCode ? 'numeric' : 'text';
      el.autocomplete = body.hasActivationCode ? 'off' : 'current-password';
      if (body.hasActivationCode) el.pattern = '[0-9]{6}'; else el.removeAttribute('pattern');
      el.closest('.input-group').querySelector('button').setAttribute('aria-label', body.hasActivationCode ? 'Mostrar código' : 'Mostrar contraseña');
    });
    if (!body.hasActivationCode) document.getElementById('account-code-help').textContent = 'Tu cuenta no tiene código de registro. Usá tu contraseña actual para verificar los cambios. Si no la recordás, contactá al administrador.';
    status.hidden = true;
  } catch {
    accountUser = null;
    status.className = 'alert alert-warning'; status.textContent = 'No pudimos cargar tu cuenta. Revisá la conexión y volvé a intentar.';
    document.getElementById('account-retry').hidden = false;
  } finally { accountLock(false); }
}
function accountVerification(id) {
  const value = document.getElementById(id).value;
  return accountUser.hasActivationCode ? {activationCode:value.trim()} : {currentPassword:value};
}
async function accountSave(event, password) {
  event.preventDefault();
  if (accountBusy || !accountUser) return;
  const form = event.currentTarget;
  const feedback = password ? 'password-feedback' : 'profile-feedback';
  accountFeedback(feedback, '');
  if (!form.reportValidity()) return;
  let payload;
  if (password) {
    const value = document.getElementById('new-password').value;
    if (value !== document.getElementById('confirm-password').value) { accountFeedback(feedback, 'Las contraseñas no coinciden.'); return; }
    if (new TextEncoder().encode(value).length > 72) { accountFeedback(feedback, 'La contraseña es demasiado larga. Usá hasta 72 bytes.'); return; }
    payload = {newPassword:value, ...accountVerification('password-verification')};
  } else {
    const name = document.getElementById('settings-name').value.trim();
    const email = document.getElementById('settings-email').value.trim().toLowerCase();
    if (!name) { accountFeedback(feedback, 'Ingresá tu nombre.'); return; }
    if (name === accountUser.name && email === accountUser.email) { accountFeedback(feedback, 'Tu perfil ya está actualizado.', 'success'); return; }
    payload = {name,email,...accountVerification('profile-verification')};
  }
  accountLock(true);
  const button = form.querySelector('[type="submit"]');const label = button.textContent;button.textContent = 'Guardando…';
  try {
    const {status,body} = await apiFetch(password ? '/api/auth/change-password' : '/api/auth/profile', {method:password?'POST':'PUT', body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    if (status !== 200) { accountFeedback(feedback, body.error || 'No pudimos guardar el cambio.'); return; }
    setSession(body.token, body.user, body.refreshToken);
    accountUser = {...accountUser,...body.user};accountPaint(accountUser);
    document.querySelectorAll('.verification-input').forEach(el => {el.value='';});
    if (password) form.reset(); else accountResetProfile();
    document.querySelectorAll('.account-grid [data-reveal]').forEach(btn => {document.getElementById(btn.dataset.reveal).type='password';btn.setAttribute('aria-pressed','false');btn.setAttribute('aria-label',btn.getAttribute('aria-label').replace('Ocultar','Mostrar'));btn.innerHTML='<i class="bi bi-eye" aria-hidden="true"></i>';});
    accountFeedback(feedback, password ? 'Contraseña actualizada. Las otras sesiones quedaron cerradas.' : 'Perfil guardado. Usá tu correo actualizado para el próximo ingreso.', 'success');
  } catch { accountFeedback(feedback, 'No pudimos confirmar el cambio. Revisá la conexión; antes de repetirlo, comprobá si se guardó.'); }
  finally { button.textContent=label; accountLock(false); }
}
document.addEventListener('DOMContentLoaded', () => {
  const user=getCurrentSession();if(!user){window.location.href='login.html';return;}
  accountPaint(user);accountLoad();
  document.getElementById('account-retry').addEventListener('click',accountLoad);
  document.getElementById('profile-cancel').addEventListener('click',()=>{accountResetProfile();accountFeedback('profile-feedback','');});
  document.getElementById('profile-form').addEventListener('submit',e=>accountSave(e,false));
  document.getElementById('change-password-form').addEventListener('submit',e=>accountSave(e,true));
  document.querySelectorAll('[data-reveal]').forEach(button=>button.addEventListener('click',()=>{
    const input=document.getElementById(button.dataset.reveal);const reveal=input.type==='password';input.type=reveal?'text':'password';button.setAttribute('aria-pressed',String(reveal));button.setAttribute('aria-label',button.getAttribute('aria-label').replace(reveal?'Mostrar':'Ocultar',reveal?'Ocultar':'Mostrar'));button.innerHTML='<i class="bi '+(reveal?'bi-eye-slash':'bi-eye')+'" aria-hidden="true"></i>';
  }));
  document.querySelectorAll('.verification-input').forEach(el=>el.addEventListener('input',()=>{if(accountUser?.hasActivationCode)el.value=el.value.replace(/\D/g,'');}));
});
