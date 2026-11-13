import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MetricKey } from '../types/analytics';
import { formatMetricValue, getMetricDef, SERIES_PALETTE } from '../utils/aggregator';

export interface ChartSeries {
  id: string;
  label: string;
  color?: string;
  values: Array<number | null>; // aligned with xLabels
}

interface InteractiveChartProps {
  xLabels: string[];
  xSubLabels?: string[];
  series: ChartSeries[];
  metricKey: MetricKey;
  secondaryMetricKey?: MetricKey | null;
  secondaryValues?: Array<number | null>;
  chartType: 'line' | 'bar';
  height?: number;
  compact?: boolean;
  hideLegend?: boolean;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  xLabels,
  xSubLabels,
  series,
  metricKey,
  secondaryMetricKey,
  secondaryValues,
  chartType,
  height = 320,
  compact = false,
  hideLegend = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(640);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth(next);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset hidden series if series list changes drastically
  useEffect(() => {
    setHiddenSeriesIds((prev) => {
      const validIds = new Set(series.map((s) => s.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [series]);

  const visibleSeries = useMemo(
    () => series.filter((s) => !hiddenSeriesIds.has(s.id)),
    [series, hiddenSeriesIds]
  );

  const toggleSeries = (id: string) => {
    setHiddenSeriesIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < series.length - 1) {
        next.add(id);
      }
      return next;
    });
  };

  const margin = compact
    ? { top: 12, right: 12, bottom: 26, left: 48 }
    : { top: 20, right: secondaryMetricKey ? 64 : 20, bottom: 48, left: 66 };

  const innerW = Math.max(120, width - margin.left - margin.right);
  const innerH = Math.max(80, height - margin.top - margin.bottom);

  const { yMin, yMax, yTicks } = useMemo(() => {
    let maxVal = 0;
    let hasData = false;
    for (const s of visibleSeries) {
      for (const v of s.values) {
        if (v !== null && Number.isFinite(v)) {
          hasData = true;
          if (v > maxVal) maxVal = v;
        }
      }
    }
    if (!hasData || maxVal <= 0) {
      return { yMin: 0, yMax: 10, yTicks: [0, 2.5, 5, 7.5, 10] };
    }
    const paddedMax = maxVal * 1.12;
    const tickCount = compact ? 3 : 4;
    const rawStep = paddedMax / tickCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let niceStep = magnitude;
    if (normalized <= 1) niceStep = magnitude;
    else if (normalized <= 2) niceStep = 2 * magnitude;
    else if (normalized <= 2.5) niceStep = 2.5 * magnitude;
    else if (normalized <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const niceMax = Math.ceil(paddedMax / niceStep) * niceStep;
    const ticks: number[] = [];
    for (let t = 0; t <= niceMax + niceStep * 0.001; t += niceStep) {
      ticks.push(Number(t.toFixed(4)));
    }
    return { yMin: 0, yMax: niceMax, yTicks: ticks };
  }, [visibleSeries, compact]);

  const secBounds = useMemo(() => {
    if (!secondaryMetricKey || !secondaryValues) return null;
    let maxVal = 0;
    for (const v of secondaryValues) {
      if (v !== null && Number.isFinite(v) && v > maxVal) maxVal = v;
    }
    const niceMax = maxVal > 0 ? maxVal * 1.15 : 10;
    return { min: 0, max: niceMax };
  }, [secondaryMetricKey, secondaryValues]);

  const xCount = xLabels.length;

  const getX = (idx: number): number => {
    if (xCount <= 1) return margin.left + innerW / 2;
    if (chartType === 'bar') {
      const bandW = innerW / xCount;
      return margin.left + bandW * idx + bandW / 2;
    }
    return margin.left + (innerW * idx) / (xCount - 1);
  };

  const getY = (val: number): number => {
    if (yMax === yMin) return margin.top + innerH;
    const ratio = (val - yMin) / (yMax - yMin);
    return margin.top + innerH - ratio * innerH;
  };

  const getSecY = (val: number): number => {
    if (!secBounds || secBounds.max === secBounds.min) return margin.top + innerH;
    const ratio = (val - secBounds.min) / (secBounds.max - secBounds.min);
    return margin.top + innerH - ratio * innerH;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (xCount === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < margin.left - 12 || relX > width - margin.right + 12) {
      setHoverIndex(null);
      return;
    }
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < xCount; i++) {
      const dist = Math.abs(relX - getX(i));
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    setHoverIndex(bestIdx);
  };

  if (xCount === 0) {
    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500"
      >
        表示対象のデータがありません
      </div>
    );
  }

  const labelStep = compact
    ? Math.max(1, Math.ceil(xCount / 4))
    : Math.max(1, Math.ceil(xCount / Math.max(4, Math.floor(innerW / 86))));

  const activeMetricDef = getMetricDef(metricKey);
  const secMetricDef = secondaryMetricKey ? getMetricDef(secondaryMetricKey) : null;

  return (
    <div ref={containerRef} className="w-full relative select-none">
      {!hideLegend && series.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
          {series.map((s, idx) => {
            const color = s.color ?? SERIES_PALETTE[idx % SERIES_PALETTE.length];
            const isHidden = hiddenSeriesIds.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSeries(s.id)}
                className={`inline-flex items-center gap-1.5 text-xs transition-opacity whitespace-nowrap ${
                  isHidden ? 'opacity-40 line-through text-slate-400' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span>{s.label}</span>
              </button>
            );
          })}
          {secMetricDef && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 ml-auto">
              <span className="w-3 h-0.5 bg-amber-500 inline-block" />
              <span>右軸: {secMetricDef.label}</span>
            </span>
          )}
        </div>
      )}

      <div className="relative">
        <svg
          width={width}
          height={height}
          className="overflow-visible block"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Horizontal grid lines & left Y-axis ticks */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={margin.left}
                  x2={width - margin.right}
                  y1={y}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '2,3'}
                />
                <text
                  x={margin.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono-tabular"
                >
                  {formatMetricValue(metricKey, tick, true)}
                </text>
              </g>
            );
          })}

          {/* Secondary Y-axis ticks if active */}
          {secBounds && secondaryMetricKey && !compact && (
            <>
              {[0, 0.5, 1].map((ratio) => {
                const val = secBounds.min + (secBounds.max - secBounds.min) * ratio;
                const y = getSecY(val);
                return (
                  <text
                    key={ratio}
                    x={width - margin.right + 8}
                    y={y + 3.5}
                    textAnchor="start"
                    className="fill-amber-700 text-[10px] font-mono-tabular"
                  >
                    {formatMetricValue(secondaryMetricKey, val, true)}
                  </text>
                );
              })}
            </>
          )}

          {/* Hover vertical guide */}
          {hoverIndex !== null && (
            <line
              x1={getX(hoverIndex)}
              x2={getX(hoverIndex)}
              y1={margin.top}
              y2={margin.top + innerH}
              stroke="#94A3B8"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {/* Bars mode */}
          {chartType === 'bar' &&
            (() => {
              const bandW = innerW / xCount;
              const groupPad = Math.max(4, bandW * 0.22);
              const usableW = Math.max(4, bandW - groupPad);
              const count = Math.max(1, visibleSeries.length);
              const barW = Math.max(2, Math.min(36, usableW / count - (count > 1 ? 2 : 0)));
              const totalBarsW = count * barW + (count - 1) * 2;

              return xLabels.map((_, xi) => {
                const centerX = getX(xi);
                const startX = centerX - totalBarsW / 2;

                return (
                  <g key={xi}>
                    {visibleSeries.map((s, si) => {
                      const val = s.values[xi];
                      if (val === null || !Number.isFinite(val)) return null;
                      const origIdx = series.findIndex((o) => o.id === s.id);
                      const color = s.color ?? SERIES_PALETTE[origIdx % SERIES_PALETTE.length];
                      const barX = startX + si * (barW + 2);
                      const barY = getY(val);
                      const barH = Math.max(0, margin.top + innerH - barY);
                      const isHovered = hoverIndex === xi;

                      return (
                        <rect
                          key={s.id}
                          x={barX}
                          y={barY}
                          width={barW}
                          height={barH}
                          rx={2}
                          fill={color}
                          opacity={hoverIndex === null || isHovered ? 0.92 : 0.45}
                        />
                      );
                    })}
                  </g>
                );
              });
            })()}

          {/* Lines mode */}
          {chartType === 'line' &&
            visibleSeries.map((s) => {
              const origIdx = series.findIndex((o) => o.id === s.id);
              const color = s.color ?? SERIES_PALETTE[origIdx % SERIES_PALETTE.length];
              const points: Array<{ x: number; y: number; val: number; idx: number }> = [];
              s.values.forEach((v, idx) => {
                if (v !== null && Number.isFinite(v)) {
                  points.push({ x: getX(idx), y: getY(v), val: v, idx });
                }
              });

              if (points.length === 0) return null;

              const pathD = points
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                .join(' ');

              const areaD =
                visibleSeries.length === 1 && points.length > 1
                  ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(margin.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(margin.top + innerH).toFixed(1)} Z`
                  : null;

              return (
                <g key={s.id}>
                  {areaD && <path d={areaD} fill={color} opacity={0.07} />}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={compact ? 1.8 : 2.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {points.map((p) => {
                    const isHovered = hoverIndex === p.idx;
                    return (
                      <circle
                        key={p.idx}
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? (compact ? 4 : 5) : compact ? 2.2 : 3}
                        fill={isHovered ? '#FFFFFF' : color}
                        stroke={color}
                        strokeWidth={isHovered ? 2.5 : 1.5}
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* Secondary Overlay Line */}
          {secondaryMetricKey && secondaryValues && secBounds && (
            <g>
              {(() => {
                const pts: Array<{ x: number; y: number; idx: number }> = [];
                secondaryValues.forEach((v, idx) => {
                  if (v !== null && Number.isFinite(v)) {
                    pts.push({ x: getX(idx), y: getSecY(v), idx });
                  }
                });
                if (pts.length === 0) return null;
                const d = pts
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                  .join(' ');
                return (
                  <>
                    <path
                      d={d}
                      fill="none"
                      stroke="#D97706"
                      strokeWidth={2}
                      strokeDasharray="4,3"
                    />
                    {pts.map((p) => (
                      <circle
                        key={p.idx}
                        cx={p.x}
                        cy={p.y}
                        r={hoverIndex === p.idx ? 4.5 : 2.5}
                        fill="#FFFFFF"
                        stroke="#D97706"
                        strokeWidth={2}
                      />
                    ))}
                  </>
                );
              })()}
            </g>
          )}

          {/* X-axis labels */}
          {xLabels.map((lbl, idx) => {
            if (idx % labelStep !== 0 && idx !== xCount - 1) return null;
            const x = getX(idx);
            const displayLbl = lbl.replace(/^2026\./, '').replace(/^2026年/, '');
            return (
              <g key={idx}>
                <text
                  x={x}
                  y={margin.top + innerH + 15}
                  textAnchor="middle"
                  className={`text-[10px] font-mono-tabular ${
                    hoverIndex === idx ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                  }`}
                >
                  {displayLbl}
                </text>
                {!compact && xSubLabels?.[idx] && (
                  <text
                    x={x}
                    y={margin.top + innerH + 28}
                    textAnchor="middle"
                    className="fill-slate-400 text-[9px]"
                  >
                    {xSubLabels[idx]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoverIndex !== null && (
          <div
            className="pointer-events-none absolute z-20 top-2 bg-slate-900 text-white rounded-md shadow-lg px-3 py-2 text-xs min-w-[180px] max-w-[280px]"
            style={{
              left:
                getX(hoverIndex) > width * 0.58
                  ? Math.max(8, getX(hoverIndex) - 210)
                  : Math.min(width - 210, getX(hoverIndex) + 14),
            }}
          >
            <div className="flex items-center justify-between gap-3 pb-1.5 mb-1.5 border-b border-slate-700">
              <span className="font-mono-tabular font-semibold text-slate-100">
                {xLabels[hoverIndex]}
              </span>
              {xSubLabels?.[hoverIndex] && (
                <span className="text-[11px] text-slate-400">{xSubLabels[hoverIndex]}</span>
              )}
            </div>
            <div className="space-y-1">
              {visibleSeries
                .map((s) => {
                  const origIdx = series.findIndex((o) => o.id === s.id);
                  return {
                    s,
                    val: s.values[hoverIndex],
                    color: s.color ?? SERIES_PALETTE[origIdx % SERIES_PALETTE.length],
                  };
                })
                .filter((item) => item.val !== null)
                .sort((a, b) => (b.val ?? 0) - (a.val ?? 0))
                .slice(0, 8)
                .map((item) => (
                  <div key={item.s.id} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 truncate text-slate-200">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate">{item.s.label}</span>
                    </span>
                    <span className="font-mono-tabular font-medium text-white shrink-0">
                      {formatMetricValue(metricKey, item.val ?? 0)}
                    </span>
                  </div>
                ))}

              {secondaryMetricKey &&
                secondaryValues &&
                secondaryValues[hoverIndex] !== null && (
                  <div className="flex items-center justify-between gap-3 pt-1 mt-1 border-t border-slate-700 text-amber-300">
                    <span>{secMetricDef?.label}</span>
                    <span className="font-mono-tabular font-medium">
                      {formatMetricValue(secondaryMetricKey, secondaryValues[hoverIndex] ?? 0)}
                    </span>
                  </div>
                )}
            </div>
            {visibleSeries.length > 0 && (
              <div className="mt-1.5 pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                指標: {activeMetricDef.label}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
