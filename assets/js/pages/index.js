        document.addEventListener('DOMContentLoaded', () => {
            if (getCurrentSession()) {
                window.location.href = 'dashboard.html';
            }
        });
    
