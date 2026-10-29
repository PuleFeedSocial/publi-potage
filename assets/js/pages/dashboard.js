        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = 'index.html';
                return;
            }
            enterApp(session);
            const sessionRole = (session.role || '').toLowerCase();
            const isAdmin = sessionRole === 'admin';
            const gestionLabel = document.getElementById('gestion-label');
            const gestionItems = document.getElementById('gestion-items');
            if (gestionLabel) gestionLabel.style.display = isAdmin ? '' : 'none';
            if (gestionItems) gestionItems.style.display = isAdmin ? '' : 'none';
            const informeBtn = document.getElementById('btn-informe');
            if (informeBtn) informeBtn.style.display = isAdmin ? '' : 'none';
            const navTarget = localStorage.getItem('navTarget');
            if (navTarget === 'users') {
                localStorage.removeItem('navTarget');
                switchView('users');
            } else if (navTarget === 'zonas') {
                localStorage.removeItem('navTarget');
                switchView('zonas');
            }
        });
    
