// Load top nav
fetch('./src/component/top-navbar.html')
    .then(res => res.text())
    .then(data => {
        document.getElementById('top-navbar').innerHTML = data;
    });

// Load bot nav
fetch('./src/component/bottom-navbar.html')
    .then(res => res.text())
    .then(data => {
        document.getElementById('bottom-navbar').innerHTML = data;
    });