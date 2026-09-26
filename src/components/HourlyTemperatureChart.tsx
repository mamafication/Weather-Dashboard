import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  ComposedChart
} from 'recharts';
import { ArrowUp, ArrowDown, Thermometer, CloudSun } from 'lucide-react';
import { getWeatherIcon } from '../lib/utils';

export interface HourlyChartDataPoint {
  timeLabel: string;
  fullTime: string;
  temp: number;
  displayTemp: number;
  code: number;
  desc: string;
  isDay: number;
}

interface HourlyTemperatureChartProps {
  data: HourlyChartDataPoint[];
  isDark: boolean;
}

export const HourlyTemperatureChart: React.FC<HourlyTemperatureChartProps> = ({ data, isDark }) => {
  if (!data || data.length === 0) {
    return (
      <div className={`h-56 flex items-center justify-center rounded-2xl border ${isDark ? 'border-white/5 bg-slate-800/20 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
        <p className="text-sm">No hourly temperature data available</p>
      </div>
    );
  }

  const temps = data.map(d => d.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const avgTemp = Math.round(temps.reduce((acc, curr) => acc + curr, 0) / temps.length);

  const minPoint = data.find(d => d.temp === minTemp);
  const maxPoint = data.find(d => d.temp === maxTemp);

  // Pad domain slightly for visual elegance
  const yDomainMin = Math.floor(minTemp - 1.5);
  const yDomainMax = Math.ceil(maxTemp + 1.5);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item: HourlyChartDataPoint = payload[0].payload;
      const Icon = getWeatherIcon(item.code, item.isDay);

      return (
        <div
          className={`p-3 rounded-2xl shadow-xl border backdrop-blur-md transition-all ${
            isDark
              ? 'bg-slate-900/90 border-slate-700/80 text-white shadow-black/40'
              : 'bg-white/95 border-slate-200/90 text-slate-900 shadow-slate-200/50'
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {item.fullTime}
            </span>
            <Icon className="w-4 h-4 text-blue-500 shrink-0" />
          </div>
          
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold tracking-tight text-blue-500">
              {item.displayTemp}°
            </span>
            <span className={`text-xs font-medium capitalize ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {item.desc}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* 24-Hour Stats Row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div
          className={`p-3 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-800/40 border-white/5' : 'bg-slate-50 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-rose-500 font-medium">
            <ArrowUp className="w-3.5 h-3.5" />
            <span>High</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-lg sm:text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {Math.round(maxTemp)}°
            </span>
            {maxPoint && (
              <span className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                at {maxPoint.timeLabel}
              </span>
            )}
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-800/40 border-white/5' : 'bg-slate-50 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-sky-500 font-medium">
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Low</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-lg sm:text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {Math.round(minTemp)}°
            </span>
            {minPoint && (
              <span className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                at {minPoint.timeLabel}
              </span>
            )}
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-800/40 border-white/5' : 'bg-slate-50 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
            <Thermometer className="w-3.5 h-3.5" />
            <span>Average</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-lg sm:text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {avgTemp}°
            </span>
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              next 24h
            </span>
          </div>
        </div>
      </div>

      {/* Line Chart */}
      <div className={`p-4 pt-6 rounded-2xl border ${isDark ? 'bg-slate-800/20 border-white/5' : 'bg-slate-50/50 border-slate-200/60'}`}>
        <div className="w-full h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 12, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="temperatureAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={isDark ? 0.35 : 0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}
              />

              <XAxis
                dataKey="timeLabel"
                stroke={isDark ? '#64748b' : '#94a3b8'}
                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: 500 }}
                tickLine={false}
                axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                interval="preserveStartEnd"
                minTickGap={24}
              />

              <YAxis
                domain={[yDomainMin, yDomainMax]}
                stroke={isDark ? '#64748b' : '#94a3b8'}
                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${Math.round(val)}°`}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: isDark ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)',
                  strokeWidth: 1.5,
                  strokeDasharray: '4 4'
                }}
              />

              {/* Gradient Area Fill under the line */}
              <Area
                type="monotone"
                dataKey="temp"
                fill="url(#temperatureAreaGradient)"
                stroke="none"
                isAnimationActive={true}
              />

              {/* Main Temperature Line */}
              <Line
                type="monotone"
                dataKey="temp"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{
                  r: 3,
                  fill: isDark ? '#1e293b' : '#ffffff',
                  stroke: '#3b82f6',
                  strokeWidth: 2
                }}
                activeDot={{
                  r: 6,
                  fill: '#3b82f6',
                  stroke: isDark ? '#0f172a' : '#ffffff',
                  strokeWidth: 3
                }}
                isAnimationActive={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
