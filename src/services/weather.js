// src/services/weather.js
// changed weather.js from a frontend code to backend code

const axios = require('axios');

/**
 * Fetch weather data from OpenWeatherMap by latitude and longitude.
 * Returns an object: { temp, weather, icon, city }
 * Throws an error if the request fails.
 */
async function getWeather(lat, lon) {
    const apiKey = process.env.OPENWEATHER_API_KEY; // Store your API key in .env as OPENWEATHER_API_KEY
    if (!apiKey) {
        throw new Error('Missing OPENWEATHER_API_KEY in environment variables');
    }
    if (!lat || !lon) {
        throw new Error('Latitude and longitude are required');
    }
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    try {
        const response = await axios.get(url);
        const data = response.data;
        return {
            temp: Math.round(data.main.temp),
            weather: data.weather[0].main,
            icon: data.weather[0].icon,
            city: data.name
        };
    } catch (err) {
        console.error('Error fetching weather:', err.message);
        throw new Error('Unable to fetch weather data');
    }
}

module.exports = { getWeather };
