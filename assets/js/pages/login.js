        document.addEventListener('DOMContentLoaded', () => {
            if (getCurrentSession()) {
                window.location.href = 'dashboard.html';
            }
        });
        function togglePassword(inputId, btn) {
            const input = document.getElementById(inputId);
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
            btn.setAttribute('aria-pressed', String(isPassword));
            btn.innerHTML = isPassword ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        }

        function showForgot() {
            document.getElementById('login-form').classList.add('d-none');
            document.getElementById('forgot-form').classList.remove('d-none');
            document.getElementById('forgot-feedback').classList.add('d-none');
            document.querySelector('.auth-card-header h2').innerText = 'Recuperar Contraseña';
            document.querySelector('.auth-card-header p').innerText = 'Restablecé tu clave con tu código de activación';
        }

        function showLogin() {
            document.getElementById('forgot-form').classList.add('d-none');
            document.getElementById('forgot-feedback').classList.add('d-none');
            document.getElementById('login-form').classList.remove('d-none');
            document.querySelector('.auth-card-header h2').innerText = 'Iniciar Sesión';
            document.querySelector('.auth-card-header p').innerText = 'Ingresá tus credenciales para acceder al dashboard';
        }

        function forgotFeedback(msg, type) {
            const el = document.getElementById('forgot-feedback');
            el.className = 'mt-3 small alert alert-' + type + ' py-2 px-3 mb-0';
            el.innerText = msg;
            el.classList.remove('d-none');
        }

        function handleForgot(e) {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value.trim();
            const code = document.getElementById('forgot-code').value.trim();
            const pw = document.getElementById('forgot-password').value;
            const confirm = document.getElementById('forgot-confirm').value;

            if (!/^[0-9]{6}$/.test(code)) { forgotFeedback('El código de activación debe tener 6 dígitos.', 'danger'); return; }
            if (pw.length < 6) { forgotFeedback('La nueva contraseña debe tener al menos 6 caracteres.', 'danger'); return; }
            if (pw !== confirm) { forgotFeedback('Las contraseñas no coinciden.', 'danger'); return; }

            const btn = document.getElementById('forgot-submit');
            const orig = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Procesando...';

            fetch(API_BASE + '/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, activationCode: code, newPassword: pw })
            })
                .then(r => r.json().then(b => ({ status: r.status, body: b })))
                .then(({ status, body }) => {
                    btn.disabled = false;
                    btn.innerHTML = orig;
                    if (status !== 200) { forgotFeedback(body.error || 'No se pudo restablecer la contraseña.', 'danger'); return; }
                    forgotFeedback('Contraseña restablecida correctamente. Ya podés iniciar sesión.', 'success');
                    document.getElementById('forgot-form').reset();
                    setTimeout(showLogin, 1800);
                })
                .catch(() => {
                    btn.disabled = false;
                    btn.innerHTML = orig;
                    forgotFeedback('Error de conexión con el servidor.', 'danger');
                });
        }

        document.getElementById('forgot-code').addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '');
        });
    
