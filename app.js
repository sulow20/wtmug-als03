"use strict";

const $ = id => document.getElementById(id);

const STORAGE_KEY = "hava-durumu-verisi-v1";
const THEME_KEY = "hava-durumu-tema";
let requestId = 0;
let installPrompt = null;

const weatherCodes = {
  0: ["Açık", "☀️"],
  1: ["Çoğunlukla açık", "🌤️"],
  2: ["Parçalı bulutlu", "⛅"],
  3: ["Kapalı", "☁️"],
  45: ["Sisli", "🌫️"],
  48: ["Kırağılı sis", "🌫️"],
  51: ["Hafif çisenti", "🌦️"],
  53: ["Çisenti", "🌦️"],
  55: ["Yoğun çisenti", "🌧️"],
  56: ["Dondurucu çisenti", "🌧️"],
  57: ["Yoğun dondurucu çisenti", "🌧️"],
  61: ["Hafif yağmur", "🌧️"],
  63: ["Yağmur", "🌧️"],
  65: ["Kuvvetli yağmur", "🌧️"],
  66: ["Dondurucu yağmur", "🌧️"],
  67: ["Kuvvetli dondurucu yağmur", "🌧️"],
  71: ["Hafif kar", "🌨️"],
  73: ["Kar", "🌨️"],
  75: ["Yoğun kar", "❄️"],
  77: ["Kar taneleri", "🌨️"],
  80: ["Hafif sağanak", "🌦️"],
  81: ["Sağanak", "🌧️"],
  82: ["Kuvvetli sağanak", "⛈️"],
  85: ["Kar sağanağı", "🌨️"],
  86: ["Yoğun kar sağanağı", "❄️"],
  95: ["Gök gürültülü fırtına", "⛈️"],
  96: ["Dolu ihtimalli fırtına", "⛈️"],
  99: ["Kuvvetli dolulu fırtına", "⛈️"]
};

function weatherInfo(code) {
  return weatherCodes[code] || ["Bilinmeyen hava durumu", "🌡️"];
}

function showError(message) {
  $("errorMessage").textContent = message;
  $("errorMessage").classList.add("show");
}

function clearError() {
  $("errorMessage").textContent = "";
  $("errorMessage").classList.remove("show");
}

function setBusy(busy) {
  $("searchButton").disabled = busy;
  $("locationButton").disabled = busy;
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Sunucu hatası: " + response.status);
  }

  return response.json();
}

function formatDay(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(date);
}

function renderWeather(data, isOffline = false) {
  const current = data.weather.current;
  const daily = data.weather.daily;
  const [description, icon] = weatherInfo(current.weather_code);

  $("cityName").textContent = data.place;
  $("localTime").textContent =
    "Yerel saat: " + current.time.replace("T", " ");

  $("currentIcon").textContent = icon;
  $("temperature").textContent =
    Math.round(current.temperature_2m) + "°C";

  $("description").textContent = description;
  $("feelsLike").textContent =
    "Hissedilen sıcaklık: " +
    Math.round(current.apparent_temperature) + "°C";

  $("humidity").textContent =
    Math.round(current.relative_humidity_2m) + "%";

  $("wind").textContent =
    Math.round(current.wind_speed_10m) + " km/sa";

  const list = $("forecastList");
  list.replaceChildren();

  daily.time.forEach((date, index) => {
    const [dayDescription, dayIcon] =
      weatherInfo(daily.weather_code[index]);

    const row = document.createElement("div");
    row.className = "forecast-day";

    const details = document.createElement("div");

    const name = document.createElement("div");
    name.className = "day-name";
    name.textContent = index === 0 ? "Bugün" : formatDay(date);

    const descriptionEl = document.createElement("div");
    descriptionEl.className = "day-description";
    descriptionEl.textContent = dayDescription;

    details.append(name, descriptionEl);

    const iconEl = document.createElement("div");
    iconEl.className = "day-icon";
    iconEl.textContent = dayIcon;

    const temps = document.createElement("div");
    temps.className = "temperatures";
    temps.textContent =
      Math.round(daily.temperature_2m_max[index]) + "°";

    const min = document.createElement("span");
    min.className = "min-temperature";
    min.textContent =
      Math.round(daily.temperature_2m_min[index]) + "°";

    temps.appendChild(min);
    row.append(details, iconEl, temps);
    list.appendChild(row);
  });

  $("weatherContent").classList.remove("hidden");

  const updated = new Date(data.fetchedAt).toLocaleString("tr-TR");

  $("updatedAt").textContent = isOffline
    ? "Son başarılı güncelleme: " + updated + " (kaydedilmiş veri)"
    : "Son güncelleme: " + updated;

  $("offlineNotice").classList.toggle(
    "show",
    isOffline || !navigator.onLine
  );
}

function showSavedWeather() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);

    if (!data?.weather?.current || !data?.weather?.daily) {
      return false;
    }

    renderWeather(data, true);
    return true;
  } catch (error) {
    console.error("Kayıtlı veri okunamadı:", error);
    return false;
  }
}

async function getWeather(place, latitude, longitude) {
  const thisRequest = ++requestId;
  clearError();

  if (!navigator.onLine) {
    $("offlineNotice").classList.add("show");

    if (!showSavedWeather()) {
      showError("İnternet yok ve kayıtlı hava durumu bulunamadı.");
    }

    return;
  }

  setBusy(true);

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "weather_code",
        "wind_speed_10m"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min"
      ].join(","),
      temperature_unit: "celsius",
      wind_speed_unit: "kmh",
      timezone: "auto",
      forecast_days: "7"
    });

    const weather = await fetchJSON(
      "https://api.open-meteo.com/v1/forecast?" + params
    );

    if (thisRequest !== requestId) return;

    if (
      !weather.current ||
      !weather.daily ||
      !Array.isArray(weather.daily.time) ||
      weather.daily.time.length < 5
    ) {
      throw new Error("Hava tahmini verisi eksik.");
    }

    const data = {
      place,
      weather,
      fetchedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderWeather(data, false);
    clearError();
  } catch (error) {
    if (thisRequest !== requestId) return;

    console.error("Hava durumu hatası:", error);
    showSavedWeather();

    showError(
      navigator.onLine
        ? "Hava durumu alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
        : "İnternet bağlantısı yok. Gösterilen kayıtlı veri güncel olmayabilir."
    );
  } finally {
    if (thisRequest === requestId) setBusy(false);
  }
}

async function searchCity(cityName) {
  const name = cityName.trim();

  if (name.length < 2) {
    showError("En az 2 karakterli bir şehir adı girin.");
    return;
  }

  if (!navigator.onLine) {
    $("offlineNotice").classList.add("show");
    showError("Şehir aramak için internet bağlantısı gerekiyor.");
    return;
  }

  clearError();
  $("searchResults").replaceChildren();
  setBusy(true);

  try {
    const params = new URLSearchParams({
      name,
      count: "10",
      language: "tr",
      format: "json"
    });

    const result = await fetchJSON(
      "https://geocoding-api.open-meteo.com/v1/search?" + params
    );

    const cities = result.results || [];

    if (cities.length === 0) {
      showError(
        "Şehir bulunamadı. Şehir adını kontrol edip tekrar deneyin."
      );
      return;
    }

    cities.forEach(city => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary city-result";

      const title = document.createElement("strong");
      title.textContent = city.name;

      const details = document.createElement("span");
      details.textContent =
        [city.admin1, city.country].filter(Boolean).join(", ");

      button.append(title, details);

      button.addEventListener("click", () => {
        $("cityInput").value = city.name;
        $("searchResults").replaceChildren();

        const place = [
          city.name,
          city.admin1,
          city.country
        ].filter(Boolean).join(", ");

        getWeather(place, city.latitude, city.longitude);
      });

      $("searchResults").appendChild(button);
    });
  } catch (error) {
    console.error("Şehir arama hatası:", error);
    showError(
      "Şehir araması yapılamadı. İnternet bağlantınızı kontrol edin."
    );
  } finally {
    setBusy(false);
  }
}

$("searchForm").addEventListener("submit", event => {
  event.preventDefault();
  searchCity($("cityInput").value);
});

$("locationButton").addEventListener("click", () => {
  clearError();

  if (!navigator.geolocation) {
    showError("Tarayıcınız konum özelliğini desteklemiyor.");
    return;
  }

  if (!navigator.onLine) {
    $("offlineNotice").classList.add("show");
    showError("Konum hava durumunu almak için internet gerekir.");
    return;
  }

  setBusy(true);

  navigator.geolocation.getCurrentPosition(
    position => {
      getWeather(
        "Bulunduğum konum",
        position.coords.latitude,
        position.coords.longitude
      );
    },
    error => {
      setBusy(false);

      if (error.code === 1) {
        showError("Konum izni reddedildi. Tarayıcı ayarlarından izin verin.");
      } else if (error.code === 2) {
        showError("Konum bulunamadı. Cihazın konum ayarlarını kontrol edin.");
      } else {
        showError("Konum isteği zaman aşımına uğradı. Tekrar deneyin.");
      }
    },
    {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 300000
    }
  );
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeButton").textContent = theme === "dark" ? "☀️" : "🌙";

  $("themeButton").setAttribute(
    "aria-label",
    theme === "dark" ? "Açık moda geç" : "Koyu moda geç"
  );

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.warn("Tema tercihi kaydedilemedi:", error);
  }
}

let initialTheme = "light";

try {
  initialTheme = localStorage.getItem(THEME_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
} catch {}

setTheme(initialTheme);

$("themeButton").addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark"
      ? "light"
      : "dark";

  setTheme(nextTheme);
});

function updateConnectionStatus() {
  const offline = !navigator.onLine;
  $("offlineNotice").classList.toggle("show", offline);

  if (offline) {
    showError("İnternet bağlantısı yok. Yeni tahmin alınamaz.");
  } else {
    clearError();
  }
}

window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("online", updateConnectionStatus);

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("installButton").classList.remove("hidden");
});

$("installButton").addEventListener("click", async () => {
  if (!installPrompt) return;

  installPrompt.prompt();
  await installPrompt.userChoice;

  installPrompt = null;
  $("installButton").classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  $("installButton").classList.add("hidden");
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js")
    .catch(error => console.error("Service worker hatası:", error));
}

if (!navigator.onLine) {
  $("offlineNotice").classList.add("show");

  if (!showSavedWeather()) {
    showError("Çevrimdışısınız. Hava durumu için internete bağlanın.");
  }
} else {
  searchCity("İstanbul");
}

updateConnectionStatus();