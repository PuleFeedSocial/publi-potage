        document.addEventListener('DOMContentLoaded', () => {
            const session = getCurrentSession();
            if (!session) {
                window.location.href = 'index.html';
                return;
            }
            const initials = session.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('display-avatar').innerText = initials;
            document.getElementById('display-user-name').innerText = session.name;
            document.getElementById('nav-avatar').innerText = initials;
            document.getElementById('nav-user-name').innerText = session.name.split(' ')[0];
            const badge = document.getElementById('display-user-role');
            const role = session.role || 'colaborador';
            badge.className = 'user-role-badge ' + (role === 'admin' ? 'badge-admin' : 'badge-colab');
            badge.innerText = role === 'admin' ? 'Admin' : role;
            const isAdmin = role === 'admin';
            const gestionLabel = document.getElementById('gestion-label');
            const gestionItems = document.getElementById('gestion-items');
            if (gestionLabel) gestionLabel.style.display = isAdmin ? '' : 'none';
            if (gestionItems) gestionItems.style.display = isAdmin ? '' : 'none';
        });
    
