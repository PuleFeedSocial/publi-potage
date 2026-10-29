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
            btn.innerHTML = isPassword ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        }
        document.getElementById('reg-code').addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '');
        });
    
