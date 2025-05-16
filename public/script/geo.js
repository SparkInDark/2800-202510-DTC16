// public/script/geo.js
// This is frontend GEO API to get location data from user's browser.

document.addEventListener('DOMContentLoaded', function() {
    const weatherDiv = document.getElementById('weather-content');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                fetch(`/weather?lat=${position.coords.latitude}&lon=${position.coords.longitude}`)
                    .then(res => {
                        if (!res.ok) throw new Error('Network response was not ok');
                        return res.json();
                    })
                    .then(weather => {
                        weatherDiv.innerHTML = `
                            <div class="flex items-center space-x-2">
                                <img src="https://openweathermap.org/img/wn/${weather.icon}.png" alt="${weather.weather}" class="w-6 h-6">
                                <div>
                                    <div class="font-semibold">${weather.temp}°C - ${weather.weather}</div>
                                    <div class="text-sm">${weather.city}</div>
                                </div>
                            </div>
                        `;
                    })
                    .catch(() => {
                        weatherDiv.innerText = 'Loading weather...';
                    });
            },
            function(error) {
                weatherDiv.innerText = 'Loading weather...';
            }
        );
    } else {
        weatherDiv.innerText = 'Loading weather...';
    }
});