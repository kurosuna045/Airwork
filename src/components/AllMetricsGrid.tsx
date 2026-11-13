import React, { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AdRecord, MetricCategory, MetricKey } from '../types/analytics';
import {
  buildMonthlySummaries,
  computeAggregatedMetrics,
  formatMetricValue,
  getSortedDatePeriods,
  METRIC_DEFINITIONS,
  SERIES_PALETTE,
} from '../utils/aggregator';
import { ChartSeries, InteractiveChart } from './InteractiveChart';

interface AllMetricsGridProps {
  records: AdRecord[];
  selectedDepartment: string;
  selectedId: string;
  onFocusMetric: (metric: MetricKey, axisMode: 'period' | 'monthly') => void;
}

export const AllMetricsGrid: React.FC<AllMetricsGridProps> = ({
  records,
  selectedDepartment,
  selectedId,
  onFocusMetric,
}) => {
  const [timeAxis, setTimeAxis] = useState<'period' | 'monthly'>('period');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MetricCategory>('all');

  const summary = useMemo(() => computeAggregatedMetrics(records), [records]);

  const metricsToShow = useMemo(() => {
    if (categoryFilter === 'all') return METRIC_DEFINITIONS;
    return METRIC_DEFINITIONS.filter((m) => m.category === categoryFilter);
  }, [categoryFilter]);

  const { xLabels, xSubLabels, seriesByMetric } = useMemo(() => {
    // Determine grouping entities:
    // If specific ID is selected -> single series for that ID
    // If specific department is selected -> one series per ID in that department
    // If all departments -> one series per department (or aggregated if too many)
    const isSingleId = selectedId !== 'ALL';
    const isSingleDept = selectedDepartment !== 'ALL';

    type GroupBucket = { id: string; label: string; filterFn: (r: AdRecord) => boolean };
    const buckets: GroupBucket[] = [];

    if (isSingleId) {
      buckets.push({
        id: selectedId,
        label: `ID ${selectedId}`,
        filterFn: (r) => r.id === selectedId,
      });
    } else if (isSingleDept) {
      const ids = Array.from(new Set(records.map((r) => r.id))).sort();
      ids.forEach((id) => {
        buckets.push({
          id,
          label: `ID ${id}`,
          filterFn: (r) => r.id === id,
        });
      });
    } else {
      const depts = Array.from(
        new Set(records.map((r) => `${r.departmentCode} ${r.departmentName}`))
      ).sort();
      depts.forEach((dLabel) => {
        buckets.push({
          id: dLabel,
          label: dLabel,
          filterFn: (r) => `${r.departmentCode} ${r.departmentName}` === dLabel,
        });
      });
    }

    if (timeAxis === 'period') {
      const periods = getSortedDatePeriods(records);
      const xLbls = periods.map((p) => p.dateLabel);
      const xSubs = periods.map((p) => p.monthLabel);

      const map = {} as Record<MetricKey, ChartSeries[]>;
      for (const mDef of METRIC_DEFINITIONS) {
        map[mDef.key] = buckets.map((bucket, bIdx) => {
          const bucketRecords = records.filter(bucket.filterFn);
          const values = periods.map((p) => {
            const matching = bucketRecords.filter((r) => r.dateLabel === p.dateLabel);
            if (matching.length === 0) return null;
            const agg = computeAggregatedMetrics(matching);
            return agg[mDef.key];
          });
          return {
            id: bucket.id,
            label: bucket.label,
            color: buckets.length === 1 ? mDef.color : SERIES_PALETTE[bIdx % SERIES_PALETTE.length],
            values,
          };
        });
      }
      return { xLabels: xLbls, xSubLabels: xSubs, seriesByMetric: map };
    } else {
      // Monthly axis
      const months = Array.from(
        new Map(records.map((r) => [r.monthKey, r.monthLabel])).entries()
      )
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monthKey, monthLabel]) => ({ monthKey, monthLabel }));

      const xLbls = months.map((m) => m.monthLabel);
      const map = {} as Record<MetricKey, ChartSeries[]>;
      for (const mDef of METRIC_DEFINITIONS) {
        map[mDef.key] = buckets.map((bucket, bIdx) => {
          const bucketRecords = records.filter(bucket.filterFn);
          const monthlyAggs = buildMonthlySummaries(bucketRecords, 'overall');
          const values = months.map((m) => {
            const found = monthlyAggs.find((row) => row.monthKey === m.monthKey);
            return found ? found[mDef.key] : null;
          });
          return {
            id: bucket.id,
            label: bucket.label,
            color: buckets.length === 1 ? mDef.color : SERIES_PALETTE[bIdx % SERIES_PALETTE.length],
            values,
          };
        });
      }
      return { xLabels: xLbls, xSubLabels: undefined, seriesByMetric: map };
    }
  }, [records, selectedDepartment, selectedId, timeAxis]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setTimeAxis('period')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                timeAxis === 'period'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              集計日別推移
            </button>
            <button
              type="button"
              onClick={() => setTimeAxis('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                timeAxis === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              月単位推移
            </button>
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
            {(
              [
                { id: 'all', label: '全12項目' },
                { id: 'volume', label: '回数・数 (4)' },
                { id: 'rate', label: '率 (4)' },
                { id: 'cost', label: '単価・金額 (4)' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === cat.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {selectedId !== 'ALL'
            ? `対象ID: ${selectedId}`
            : selectedDepartment !== 'ALL'
            ? `部署内ID別比較 (${selectedDepartment})`
            : '部署別比較'}
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          <span className="font-mono-tabular">{records.length}件</span>
        </div>
      </div>

      {/* 12-Item Small Multiples Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {metricsToShow.map((mDef) => {
          const metricSeries = seriesByMetric[mDef.key] ?? [];
          const summaryVal = summary[mDef.key];

          return (
            <div
              key={mDef.key}
              className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span>{mDef.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{mDef.formulaNote}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold font-mono-tabular text-slate-900">
                    {formatMetricValue(mDef.key, summaryVal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onFocusMetric(mDef.key, timeAxis)}
                    className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 hover:text-blue-800 font-medium mt-0.5"
                  >
                    <span>拡大</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <InteractiveChart
                xLabels={xLabels}
                xSubLabels={xSubLabels}
                series={metricSeries}
                metricKey={mDef.key}
                chartType={timeAxis === 'monthly' ? 'bar' : 'line'}
                height={180}
                compact
                hideLegend={metricSeries.length <= 1 || metricSeries.length > 6}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
