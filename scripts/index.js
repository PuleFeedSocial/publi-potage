        document.addEventListener('DOMContentLoaded', () => {
            if (getCurrentSession()) {
                window.location.href = '/pages/dashboard.html';
            }
        });
    
