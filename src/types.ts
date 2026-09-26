export interface AlertData {
  event: string;
  headline: string;
  description: string;
  severity: string;
}

export interface WeatherData {
  current: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    weatherCode: number;
    isDay: number;
    sunrise?: string | null;
    sunset?: string | null;
  };
  hourly: {
    time: string[];
    temperature: number[];
    weatherCode: number[];
  };
  daily?: {
    time: string[];
    temperatureMax: number[];
    temperatureMin: number[];
    weatherCode: number[];
  };
}

export interface LocationData {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string; // State/Province
}
