import express from "express";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

function mapGoogleConditionToWMO(condition: string | undefined): number {
  if (!condition) return 0;
  condition = condition.toUpperCase();
  if (condition.includes("CLEAR") || condition.includes("SUNNY")) return 0;
  if (condition.includes("PARTLY_CLOUDY")) return 2;
  if (condition.includes("MOSTLY_CLOUDY") || condition.includes("CLOUDY")) return 3;
  if (condition.includes("FOG") || condition.includes("HAZE") || condition.includes("MIST")) return 45;
  if (condition.includes("DRIZZLE")) return 51;
  if (condition.includes("RAIN") || condition.includes("SHOWER")) return 61;
  if (condition.includes("SNOW") || condition.includes("ICE") || condition.includes("FLURRIES")) return 71;
  if (condition.includes("THUNDERSTORM") || condition.includes("STORM")) return 95;
  return 0;
}

const app = express();
const PORT = 3000;

// Middleware to parse JSON
app.use(express.json());

// API Route for Google Weather
app.get("/api/weather", async (req, res) => {
    try {
      const lat = req.query.lat;
      const lon = req.query.lon;
      
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "API Key Not Found", message: "Please configure GOOGLE_MAPS_API_KEY in your .env file." });
      }

      if (!lat || !lon) {
        return res.status(400).json({ error: "Missing latitude or longitude" });
      }

      // Fetch Current Conditions
      const currentRes = await fetch(
        `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lon}`
      );
      
      if (!currentRes.ok) {
        throw new Error(`Google Weather API error (current): ${currentRes.status} ${await currentRes.text()}`);
      }
      const currentData = await currentRes.json();

      // Fetch Hourly Forecast (next 24 hours)
      const hourlyRes = await fetch(
        `https://weather.googleapis.com/v1/forecast/hours:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lon}&pageSize=24`
      );

      if (!hourlyRes.ok) {
        throw new Error(`Google Weather API error (hourly): ${hourlyRes.status} ${await hourlyRes.text()}`);
      }
      const hourlyData = await hourlyRes.json();

      // Fetch Daily Forecast (next 5 days)
      const dailyRes = await fetch(
        `https://weather.googleapis.com/v1/forecast/days:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lon}&days=5`
      );

      if (!dailyRes.ok) {
        throw new Error(`Google Weather API error (daily): ${dailyRes.status} ${await dailyRes.text()}`);
      }
      const dailyData = await dailyRes.json();

      // Extract sunrise and sunset from today's forecast
      const todaySunEvents = dailyData.forecastDays?.[0]?.sunEvents;
      const sunrise = todaySunEvents?.sunriseTime || todaySunEvents?.sunrise_time || null;
      const sunset = todaySunEvents?.sunsetTime || todaySunEvents?.sunset_time || null;

      // Transform Google Weather API response to match the existing Open-Meteo format expected by the frontend
      const mappedData = {
        current: {
          temperature: currentData.temperature?.degrees ?? 0,
          feelsLike: currentData.feelsLikeTemperature?.degrees ?? 0,
          humidity: currentData.relativeHumidity ?? 0,
          windSpeed: currentData.wind?.speed?.value ?? 0,
          weatherCode: mapGoogleConditionToWMO(currentData.weatherCondition?.type),
          isDay: currentData.isDaytime ? 1 : 0,
          sunrise,
          sunset
        },
        hourly: {
          time: hourlyData.forecastHours?.map((h: any) => h.interval?.startTime || h.displayDateTime?.year + '-' + String(h.displayDateTime?.month).padStart(2, '0') + '-' + String(h.displayDateTime?.day).padStart(2, '0') + 'T' + String(h.displayDateTime?.hours || 0).padStart(2, '0') + ':00:00Z') || [],
          temperature: hourlyData.forecastHours?.map((h: any) => h.temperature?.degrees ?? 0) || [],
          weatherCode: hourlyData.forecastHours?.map((h: any) => mapGoogleConditionToWMO(h.weatherCondition?.type)) || []
        },
        daily: {
          time: dailyData.forecastDays?.map((d: any) => d.interval?.startTime || d.displayDate?.year + '-' + String(d.displayDate?.month).padStart(2, '0') + '-' + String(d.displayDate?.day).padStart(2, '0') + 'T00:00:00Z') || [],
          temperatureMax: dailyData.forecastDays?.map((d: any) => d.maxTemperature?.degrees ?? 0) || [],
          temperatureMin: dailyData.forecastDays?.map((d: any) => d.minTemperature?.degrees ?? 0) || [],
          weatherCode: dailyData.forecastDays?.map((d: any) => mapGoogleConditionToWMO(d.daytimeForecast?.weatherCondition?.type)) || []
        }
      };

      res.json(mappedData);

    } catch (error: any) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ error: error.message || "Failed to fetch weather data" });
    }
  });

  // API Route for IP-based geolocation fallback
  app.get("/api/ip-location", async (req, res) => {
    try {
      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress;
      const ipQuery = clientIp && !clientIp.includes("127.0.0.1") && !clientIp.includes("::1") ? `/${clientIp}` : "";
      
      const response不易 = await fetch(`https://ipwho.is${ipQuery}`);
      if (response不易.ok) {
        const data = await response不易.json();
        if (data.success) {
          return res.json({
            name: data.city || data.region || "Current Location",
            lat: data.latitude,
            lon: data.longitude,
            country: data.country || "",
            admin1: data.region || ""
          });
        }
      }
      
      // Secondary fallback
      const ipApiRes = await fetch("https://ipapi.co/json/");
      if (ipApiRes.ok) {
        const data = await ipApiRes.json();
        if (data.latitude && data.longitude) {
          return res.json({
            name: data.city || data.region || "Current Location",
            lat: data.latitude,
            lon: data.longitude,
            country: data.country_name || "",
            admin1: data.region || ""
          });
        }
      }

      res.status(404).json({ error: "Unable to detect IP location" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "IP location error" });
    }
  });

  // API Route for Weather Alerts (Uses NWS for US, mocks for other regions as Open-Meteo lacks an alerts API)
  app.get("/api/alerts", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Missing or invalid latitude/longitude" });
      }

      // Check if the location is roughly in the US
      const isUS = lat > 24 && lat < 50 && lon > -125 && lon < -66;
      
      if (isUS) {
        const response = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
          headers: {
            "User-Agent": "WeatherDashboard/1.0"
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            return res.json({
              active: true,
              alerts: data.features.map((f: any) => ({
                event: f.properties.event,
                headline: f.properties.headline,
                description: f.properties.description,
                severity: f.properties.severity
              }))
            });
          }
        }
      }

      // Default to no alerts if outside US or no active alerts found
      res.json({ active: false, alerts: [] });

    } catch (error: any) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch weather alerts" });
    }
  });

// Vite middleware for development
async function startDevServer() {
  if (process.env.VERCEL) {
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    // Hide from static analyzers
    const viteName = "vite";
    const { createServer: createViteServer } = await import(viteName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startDevServer();

export default app;
