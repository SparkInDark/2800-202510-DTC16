document.addEventListener("DOMContentLoaded", function () {
    navigator.geolocation.getCurrentPosition(success, error);
});

function success(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    getWeather(lat, lon);
}

function error() {
    document.getElementById("location-info").textContent = "Location unavailable";
}

function getWeather(lat, lon) {
    const apiKey = "9dcc9fb97f488c1743e4627229a7ad6a";
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            const temp = Math.round(data.main.temp);
            const weather = data.weather[0].main;
            const icon = data.weather[0].icon;
            const city = data.name;
            displayWeather(temp, weather, icon, city);
        })
        .catch(() => {
            document.getElementById("location-info").textContent = "Weather info not available";
        });
}

function displayWeather(temp, weather, icon, city) {
    const iconUrl = `https://openweathermap.org/img/wn/${icon}.png`;
    const infoDiv = document.getElementById("location-info");
    infoDiv.innerHTML = `
    <div class="flex items-center space-x-2">
      <img src="${iconUrl}" alt="${weather}" class="w-6 h-6">
      <div>
        <div class="font-semibold">${temp}°C - ${weather}</div>
        <div class="text-sm">${city}</div>
      </div>
    </div>
  `;
}
