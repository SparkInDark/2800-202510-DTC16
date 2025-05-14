document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('profileDropdownBtn');
    const menu = document.getElementById('profileDropdownMenu');

    if (btn && menu) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', function() {
            menu.classList.add('hidden');
        });
    }
});
