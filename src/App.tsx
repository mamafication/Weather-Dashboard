import { useEffect, useState } from 'react';
import { Search, MapPin, Wind, Droplets, Thermometer, Cloud, LocateFixed, AlertTriangle, Sunrise, Sunset, Sun, Moon, Info, X, TrendingUp, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { WeatherData, LocationData, AlertData } from './types';
import { getWeatherIcon, getWeatherDescription } from './lib/utils';
import { HourlyTemperatureChart } from './components/HourlyTemperatureChart';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('weather_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }
    return 'dark';
  });

  const isDark = theme === 'dark';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('weather_theme', theme);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme, isDark]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [location, setLocation] = useState<LocationData>({
    name: 'Kanpur',
    lat: 26.4499,
    lon: 80.3319,
    country: 'India',
    admin1: 'Uttar Pradesh'
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);
  
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<{ type: 'info' | 'warning'; message: string } | null>(null);

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || data.address?.municipality || 'Current Location';
        const state = data.address?.state || '';
        const country = data.address?.country || '';
        return { name: city, admin1: state, country };
      }
    } catch {
      // Fallback
    }

    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      if (res.ok) {
        const data = await res.json();
        return {
          name: data.locality || data.city || 'Current Location',
          admin1: data.principalSubdivision || '',
          country: data.countryName || ''
        };
      }
    } catch {
      // Fallback
    }

    return { name: 'Current Location', admin1: '', country: '' };
  };

  const handleGetLocation = async () => {
    setIsLocating(true);
    setLocationNotice(null);

    const tryIpFallback = async (reason?: string) => {
      try {
        const ipRes = await fetch('/api/ip-location');
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          if (ipData.lat && ipData.lon) {
            setLocation({
              name: ipData.name || 'Current Location',
              lat: ipData.lat,
              lon: ipData.lon,
              country: ipData.country || '',
              admin1: ipData.admin1 || ''
            });
            setLocationNotice({
              type: 'info',
              message: 'Approximate location detected via network.'
            });
            return true;
          }
        }
      } catch {
        // Fall through
      }

      setLocationNotice({
        type: 'warning',
        message: reason || 'Unable to access device location. Please search for your city above.'
      });
      return false;
    };

    if (!('geolocation' in navigator)) {
      await tryIpFallback('Geolocation is not supported by your browser.');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const geo = await reverseGeocode(latitude, longitude);
          setLocation({
            name: geo.name,
            lat: latitude,
            lon: longitude,
            country: geo.country,
            admin1: geo.admin1
          });
        } catch {
          setLocation({
            name: 'Current Location',
            lat: latitude,
            lon: longitude,
          });
        } finally {
          setIsLocating(false);
          setSearchQuery('');
          setSearchResults([]);
        }
      },
      async (error) => {
        // Safe logging of geolocation status code
        const errMessage = error?.message || (error?.code === 1 ? 'Permission denied' : error?.code === 2 ? 'Position unavailable' : 'Timed out');
        console.warn('Browser geolocation notice:', errMessage);
        
        // Attempt automatic IP location fallback seamlessly
        await tryIpFallback();
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);

  useEffect(() => {
    if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') return;

    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/alerts?lat=${location.lat}&lon=${location.lon}`);
        
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType?.includes("application/json")) {
          const errorText = await res.text();
          throw new Error(`Invalid response (${res.status}): ${errorText.substring(0, 50)}`);
        }

        const data = await res.json();
        if (data.active) {
          setAlerts(data.alerts || []);
        } else {
          setAlerts([]);
        }
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
      }
    };
    
    // Initial fetch
    fetchAlerts();
    
    // Poll every 5 minutes
    const intervalId = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [location.lat, location.lon]);

  useEffect(() => {
    if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') return;

    const fetchWeather = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/weather?lat=${location.lat}&lon=${location.lon}`);
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const errorBody = await res.text();
          console.error("Server returned HTML instead of JSON:", errorBody);
          throw new Error("Server returned non-JSON response (likely an HTML error page)");
        }

        const data = await res.json();
        
        if (!res.ok) {
           if (res.status === 401) {
             setErrorMsg("Please add your Google Maps API Key to your .env file to enable the Google Weather API.");
           } else {
             setErrorMsg(data.error || "Failed to fetch weather data.");
           }
           setWeather(null);
           setLoading(false);
           return;
        }

        setWeather(data);
      } catch (err: any) {
        console.error('Error fetching weather:', err);
        setErrorMsg(`Failed to connect to the weather service: ${err.message}`);
      }
      setLoading(false);
    };
    
    fetchWeather();
  }, [location.lat, location.lon]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&language=en&format=json`);
        const data = await res.json();
        if (data.results) {
          setSearchResults(data.results.map((r: any) => ({
            name: r.name,
            lat: r.latitude,
            lon: r.longitude,
            country: r.country,
            admin1: r.admin1
          })));
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error(err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const CurrentIcon = weather ? getWeatherIcon(weather.current.weatherCode, weather.current.isDay) : Cloud;
  const currentDesc = weather ? getWeatherDescription(weather.current.weatherCode) : '';
  const now = new Date();

  const [hourlyViewMode, setHourlyViewMode] = useState<'both' | 'chart' | 'cards'>('both');

  const hourlyDisplayItems = (() => {
    if (!weather?.hourly?.time) return [];
    const items = weather.hourly.time.map((timeStr, i) => {
      let dateObj: Date;
      try {
        dateObj = parseISO(timeStr);
      } catch {
        dateObj = new Date(timeStr);
      }
      return {
        time: dateObj,
        timeStr,
        temp: weather.hourly.temperature[i] ?? 0,
        code: weather.hourly.weatherCode[i] ?? 0,
      };
    });

    const filtered = items.filter(
      item => item.time >= now || (now.getHours() === item.time.getHours() && now.getDate() === item.time.getDate())
    );

    return filtered.length >= 6 ? filtered.slice(0, 24) : items.slice(0, 24);
  })();

  const hourlyChartData = hourlyDisplayItems.map((item, i) => {
    const isNow = i === 0;
    return {
      timeLabel: isNow ? 'Now' : format(item.time, 'h a'),
      fullTime: isNow ? `Now (${format(item.time, 'h:mm a')})` : format(item.time, 'EEEE, h:mm a'),
      temp: Math.round(item.temp * 10) / 10,
      displayTemp: Math.round(item.temp),
      code: item.code,
      desc: getWeatherDescription(item.code),
      isDay: item.time.getHours() >= 6 && item.time.getHours() < 19 ? 1 : 0
    };
  });

  const formatSunTime = (timeStr?: string | null) => {
    if (!timeStr) return '--';
    try {
      return format(parseISO(timeStr), 'h:mm a');
    } catch {
      return timeStr;
    }
  };
  
  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans p-4 md:p-8 ${isDark ? 'bg-slate-950 text-slate-50 selection:bg-blue-500/30' : 'bg-slate-100 text-slate-900 selection:bg-blue-500/20'}`}>
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-50">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className={`w-12 h-12 bg-gradient-to-br from-blue-500 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg ${isDark ? 'shadow-blue-500/20' : 'shadow-blue-500/30'} shrink-0 overflow-hidden p-2`}>
              <img src="/favicon.svg" alt="Weather Dashboard" className="w-full h-full object-contain drop-shadow-sm" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Weather Dashboard</h1>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{format(now, 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>
          
          <div className="w-full md:w-auto flex items-center gap-2 relative z-[60]">
            <div className="relative flex-1 md:w-80">
              <div className="relative group">
                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-slate-400 group-focus-within:text-blue-400' : 'text-slate-400 group-focus-within:text-blue-500'} transition-colors`} />
                <input
                  type="text"
                  placeholder="Search location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full ${isDark ? 'bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 shadow-sm'} border rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all`}
                />
              </div>
              
              {searchQuery.length >= 2 && searchResults.length > 0 && (
                <div className={`absolute top-full left-0 right-0 mt-2 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xl'} border rounded-2xl shadow-xl overflow-hidden z-[60]`}>
                  {searchResults.map((res, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setLocation(res);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className={`w-full flex flex-col text-left px-5 py-3.5 ${isDark ? 'hover:bg-slate-800/50 border-slate-800/50 text-slate-200' : 'hover:bg-slate-50 border-slate-100 text-slate-900'} transition-colors border-b last:border-0`}
                    >
                      <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{res.name}</span>
                      <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                        {[res.admin1, res.country].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={handleGetLocation}
              disabled={isLocating}
              className={`p-3.5 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-blue-400 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 shadow-sm'} border rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all flex items-center justify-center shrink-0 disabled:opacity-50`}
              title="Use current location"
            >
              <LocateFixed className={`w-5 h-5 ${isLocating ? 'animate-pulse text-blue-500' : ''}`} />
            </button>

            <button
              onClick={toggleTheme}
              className={`p-3.5 ${isDark ? 'bg-slate-900 border-slate-800 text-amber-400 hover:text-amber-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:text-blue-600 hover:bg-slate-50 shadow-sm'} border rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all flex items-center justify-center shrink-0 cursor-pointer`}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle dark and light theme"
            >
              {isDark ? (
                <Sun className="w-5 h-5 transition-transform duration-300 hover:rotate-45" />
              ) : (
                <Moon className="w-5 h-5 transition-transform duration-300 hover:-rotate-12" />
              )}
            </button>
          </div>
        </header>

        {locationNotice && (
          <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 border transition-all duration-300 ${
            locationNotice.type === 'warning'
              ? (isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800')
              : (isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800')
          }`}>
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <Info className="w-4 h-4 shrink-0" />
              <span>{locationNotice.message}</span>
            </div>
            <button
              onClick={() => setLocationNotice(null)}
              className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              aria-label="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
            <div className="p-4 md:p-6 flex items-start gap-4">
              <div className="shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6 text-red-500 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-red-500 font-semibold text-lg flex items-center gap-2">
                  Active Weather {alerts.length > 1 ? 'Alerts' : 'Alert'}
                  <span className="text-xs bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full font-medium">
                    {alerts.length}
                  </span>
                </h3>
                <div className="mt-3 space-y-4">
                  {alerts.map((alert, idx) => (
                    <div key={idx} className="space-y-1">
                      <h4 className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{alert.event}</h4>
                      {alert.headline && (
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{alert.headline}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {errorMsg ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-lg mx-auto">
             <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-3xl">
               <h2 className="text-xl font-semibold mb-2">Configuration Required</h2>
               <p className={isDark ? "text-slate-300" : "text-slate-600"}>{errorMsg}</p>
             </div>
          </div>
        ) : loading || !weather ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <main className="max-w-3xl mx-auto space-y-6 md:space-y-8">
              
              <div className={`${isDark ? 'bg-gradient-to-br from-slate-900 to-slate-900/80 border-white/5 shadow-xl text-white' : 'bg-gradient-to-br from-white to-slate-50 border-slate-200/80 shadow-xl shadow-slate-200/50 text-slate-900'} rounded-3xl p-6 md:p-8 border relative overflow-hidden group transition-all duration-300`}>
                <div className={`absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 ${isDark ? 'bg-blue-500/10 group-hover:bg-blue-500/20' : 'bg-blue-500/5 group-hover:bg-blue-500/10'} rounded-full blur-3xl transition-colors duration-700`}></div>
                
                <div className="relative z-10">
                  <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'} mb-6 md:mb-8`}>
                    <MapPin className="w-5 h-5 text-blue-500" />
                    <h2 className={`font-medium text-lg ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {location.name}{location.admin1 ? `, ${location.admin1}` : ''}
                    </h2>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    <div>
                      <div className={`text-[4rem] md:text-[5rem] font-bold tracking-tighter leading-none ${isDark ? 'text-white' : 'text-slate-900'} flex items-start`}>
                        {Math.round(weather.current.temperature)}
                        <span className="text-3xl md:text-4xl text-blue-500 mt-2 ml-1">°</span>
                      </div>
                      <p className={`text-lg md:text-xl ${isDark ? 'text-slate-300' : 'text-slate-600'} font-medium mt-4 capitalize`}>
                        {currentDesc}
                      </p>
                    </div>
                    <div className="w-28 h-28 md:w-40 md:h-40 relative">
                      <CurrentIcon className="w-full h-full text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.25)]" strokeWidth={1.5} />
                    </div>
                  </div>
                  
                  <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-8 md:mt-10 pt-6 md:pt-8 border-t ${isDark ? 'border-slate-800/50' : 'border-slate-200'}`}>
                    <div className="flex flex-col gap-2">
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'} text-xs md:text-sm font-medium`}>
                        <Thermometer className="w-4 h-4 text-blue-500" /> <span>Feels Like</span>
                      </div>
                      <span className={`text-lg md:text-xl font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{Math.round(weather.current.feelsLike)}°</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'} text-xs md:text-sm font-medium`}>
                        <Wind className="w-4 h-4 text-blue-500" /> <span>Wind</span>
                      </div>
                      <span className={`text-lg md:text-xl font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{Math.round(weather.current.windSpeed)} <span className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'} font-normal`}>km/h</span></span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'} text-xs md:text-sm font-medium`}>
                        <Droplets className="w-4 h-4 text-blue-500" /> <span>Humidity</span>
                      </div>
                      <span className={`text-lg md:text-xl font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{weather.current.humidity}<span className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'} font-normal`}>%</span></span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'} text-xs md:text-sm font-medium`}>
                        <Sunrise className="w-4 h-4 text-amber-500" /> <span>Sunrise</span>
                      </div>
                      <span className={`text-base md:text-lg font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        {formatSunTime(weather.current.sunrise)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'} text-xs md:text-sm font-medium`}>
                        <Sunset className="w-4 h-4 text-orange-500" /> <span>Sunset</span>
                      </div>
                      <span className={`text-base md:text-lg font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        {formatSunTime(weather.current.sunset)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isDark ? 'bg-slate-900/50 border-white/5' : 'bg-white border-slate-200 shadow-sm'} rounded-3xl p-6 md:p-8 border transition-all duration-300`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h3 className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'} flex items-center gap-2 text-lg`}>
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50"></span>
                    24-Hour Forecast
                  </h3>

                  {/* View switcher tabs */}
                  <div className={`flex items-center p-1 rounded-xl self-start sm:self-auto border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-100 border-slate-200/80'}`}>
                    <button
                      type="button"
                      onClick={() => setHourlyViewMode('both')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        hourlyViewMode === 'both'
                          ? (isDark ? 'bg-blue-600 text-white shadow' : 'bg-white text-blue-600 shadow-sm')
                          : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      onClick={() => setHourlyViewMode('chart')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                        hourlyViewMode === 'chart'
                          ? (isDark ? 'bg-blue-600 text-white shadow' : 'bg-white text-blue-600 shadow-sm')
                          : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Chart</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHourlyViewMode('cards')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                        hourlyViewMode === 'cards'
                          ? (isDark ? 'bg-blue-600 text-white shadow' : 'bg-white text-blue-600 shadow-sm')
                          : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Cards</span>
                    </button>
                  </div>
                </div>
                
                {/* 24-Hour Temperature Line Chart using Recharts */}
                {(hourlyViewMode === 'both' || hourlyViewMode === 'chart') && (
                  <div className={hourlyViewMode === 'both' ? 'mb-8' : ''}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'} flex items-center gap-1.5`}>
                        <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                        Temperature Trend
                      </span>
                      <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        Hover points for details
                      </span>
                    </div>
                    <HourlyTemperatureChart data={hourlyChartData} isDark={isDark} />
                  </div>
                )}

                {/* Horizontal scrollable cards */}
                {(hourlyViewMode === 'both' || hourlyViewMode === 'cards') && (
                  <div>
                    {hourlyViewMode === 'both' && (
                      <div className="flex items-center justify-between mb-3 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'} flex items-center gap-1.5`}>
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          Hourly Timeline
                        </span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          Scroll for 24 hours →
                        </span>
                      </div>
                    )}
                    <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar snap-x snap-mandatory">
                      {hourlyDisplayItems.map((item, i) => {
                        const Icon = getWeatherIcon(item.code, 1);
                        return (
                          <div key={i} className={`flex-shrink-0 flex flex-col items-center justify-between p-4 ${isDark ? 'bg-slate-800/30 hover:bg-slate-800/60 border-white/5 hover:border-white/10' : 'bg-slate-50 hover:bg-white border-slate-200/70 hover:border-slate-300 hover:shadow-md'} rounded-2xl w-28 h-40 snap-start border hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group`}>
                            <div className="flex flex-col items-center gap-0.5 text-center">
                              <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} text-sm font-semibold`}>
                                {i === 0 ? 'Now' : format(item.time, 'h:mm a')}
                              </span>
                              <span className={`${isDark ? 'text-slate-500' : 'text-slate-400'} text-xs font-medium`}>
                                {format(item.time, 'MMM d')}
                              </span>
                            </div>
                            <Icon className="w-8 h-8 text-blue-500 my-2 group-hover:scale-110 group-hover:text-blue-600 transition-all duration-300" />
                            <span className={`text-xl font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                              {Math.round(item.temp)}°
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 5-Day Daily Forecast Section */}
              {weather.daily && (
                <div className="mt-8">
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'} mb-4`}>5-Day Forecast</h2>
                  <div className={`${isDark ? 'bg-slate-800/30 border-white/5' : 'bg-white border-slate-200 shadow-sm'} border rounded-2xl overflow-hidden flex flex-col transition-all duration-300`}>
                    {weather.daily.time.slice(0, 5).map((timeStr, idx) => {
                      const dailyTime = parseISO(timeStr);
                      const maxTemp = weather.daily!.temperatureMax[idx];
                      const minTemp = weather.daily!.temperatureMin[idx];
                      const wCode = weather.daily!.weatherCode[idx];
                      const DailyIcon = getWeatherIcon(wCode, 1);
                      
                      return (
                        <div 
                          key={idx} 
                          className={`flex items-center justify-between p-4 ${idx !== 4 ? (isDark ? 'border-b border-white/5' : 'border-b border-slate-100') : ''} ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/80'} transition-colors group cursor-pointer`}
                        >
                          <div className="w-24 shrink-0">
                            <span className={`${isDark ? 'text-slate-200' : 'text-slate-800'} font-semibold text-lg`}>
                              {idx === 0 ? 'Today' : format(dailyTime, 'EEEE')}
                            </span>
                          </div>
                          
                          <div className="flex-1 flex items-center justify-start ml-4 gap-3">
                            <DailyIcon className="w-7 h-7 text-blue-500 group-hover:scale-110 transition-transform" />
                            <span className={`${isDark ? 'text-slate-400' : 'text-slate-600'} text-sm hidden sm:block`}>
                              {getWeatherDescription(wCode)}
                            </span>
                          </div>

                          <div className="flex items-center justify-end gap-4 min-w-[100px]">
                            <span className={`${isDark ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
                              {Math.round(minTemp)}°
                            </span>
                            <div className={`w-16 h-1.5 ${isDark ? 'bg-slate-700/50' : 'bg-slate-200'} rounded-full overflow-hidden shrink-0 hidden sm:block`}>
                               <div className="h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full" style={{ width: '100%' }}></div>
                            </div>
                            <span className={`${isDark ? 'text-slate-100' : 'text-slate-900'} font-bold`}>
                              {Math.round(maxTemp)}°
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            
          </main>
        )}
      </div>
    </div>
  );
}
