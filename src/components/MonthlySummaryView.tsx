import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileSpreadsheet } from 'lucide-react';
import { AdRecord, MetricKey, MonthlySummaryRow } from '../types/analytics';
import {
  buildMonthlySummaries,
  formatMetricValue,
  getMetricDef,
  METRIC_DEFINITIONS,
  MonthlyGranularity,
  monthlySummariesToCsv,
  SERIES_PALETTE,
} from '../utils/aggregator';
import { ChartSeries, InteractiveChart } from './InteractiveChart';

interface MonthlySummaryViewProps {
  records: AdRecord[];
  onOpenSheetsExport: (monthlyRows: MonthlySummaryRow[], granularityLabel: string) => void;
}

export const MonthlySummaryView: React.FC<MonthlySummaryViewProps> = ({
  records,
  onOpenSheetsExport,
}) => {
  const [granularity, setGranularity] = useState<MonthlyGranularity>('dept-id');
  const [chartMetric, setChartMetric] = useState<MetricKey>('spend');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<keyof MonthlySummaryRow>('monthKey');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const availableMonths = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      map.set(r.monthKey, r.monthLabel);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, label]) => ({ key, label }));
  }, [records]);

  const overallMonthly = useMemo(
    () => buildMonthlySummaries(records, 'overall'),
    [records]
  );

  const summaryRows = useMemo(() => {
    const base = buildMonthlySummaries(records, granularity);
    const filtered =
      monthFilter === 'ALL' ? base : base.filter((r) => r.monthKey === monthFilter);

    return [...filtered].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), 'ja', { numeric: true });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [records, granularity, monthFilter, sortField, sortDir]);

  // Build chart data comparing months per Department / ID or Department
  const monthlyChartData = useMemo(() => {
    const allSummary = buildMonthlySummaries(records, granularity);
    const entityKeys = Array.from(
      new Set(
        allSummary.map((r) =>
          granularity === 'dept-id'
            ? `${r.departmentCode} ${r.departmentName} / ${r.adId}`
            : granularity === 'dept'
            ? `${r.departmentCode} ${r.departmentName}`
            : '全体合計'
        )
      )
    );

    const series: ChartSeries[] = availableMonths.map((m, mIdx) => {
      const values = entityKeys.map((ek) => {
        const found = allSummary.find((r) => {
          const rowEntity =
            granularity === 'dept-id'
              ? `${r.departmentCode} ${r.departmentName} / ${r.adId}`
              : granularity === 'dept'
              ? `${r.departmentCode} ${r.departmentName}`
              : '全体合計';
          return r.monthKey === m.key && rowEntity === ek;
        });
        return found ? found[chartMetric] : 0;
      });
      return {
        id: m.key,
        label: m.label,
        color: SERIES_PALETTE[mIdx % SERIES_PALETTE.length],
        values,
      };
    });

    return { xLabels: entityKeys, series };
  }, [records, granularity, availableMonths, chartMetric]);

  const handleSort = (field: keyof MonthlySummaryRow) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'monthKey' || field === 'departmentCode' ? 'asc' : 'desc');
    }
  };

  const handleDownloadCsv = () => {
    const csv = monthlySummariesToCsv(summaryRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `月単位集計_${granularity}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const granularityLabel =
    granularity === 'dept-id'
      ? '部署・ID別月次'
      : granularity === 'dept'
      ? '部署別月次'
      : '月別全体合計';

  return (
    <div className="space-y-5">
      {/* Monthly Overview Comparison Strip */}
      {overallMonthly.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {overallMonthly.map((mRow, idx) => {
            const prevRow = idx > 0 ? overallMonthly[idx - 1] : null;
            const spendDelta =
              prevRow && prevRow.spend > 0
                ? ((mRow.spend - prevRow.spend) / prevRow.spend) * 100
                : null;
            const clicksDelta =
              prevRow && prevRow.clicks > 0
                ? ((mRow.clicks - prevRow.clicks) / prevRow.clicks) * 100
                : null;

            return (
              <div
                key={mRow.monthKey}
                className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{mRow.monthLabel}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      集計期間 {mRow.dateRanges.length}区分
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      明細 <span className="font-mono-tabular">{mRow.recordCount}</span>行
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-semibold font-mono-tabular text-slate-900">
                      {formatMetricValue('spend', mRow.spend)}
                    </div>
                    {spendDelta !== null && (
                      <div
                        className={`text-[11px] font-mono-tabular ${
                          spendDelta >= 0 ? 'text-slate-600' : 'text-teal-700'
                        }`}
                      >
                        前月比 {spendDelta >= 0 ? '+' : ''}
                        {spendDelta.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 text-[11px]">表示回数</div>
                    <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                      {formatMetricValue('impressions', mRow.impressions)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">クリック数 / CTR</div>
                    <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                      {formatMetricValue('clicks', mRow.clicks)}
                      <span className="text-slate-400 font-normal ml-1">
                        ({mRow.ctr.toFixed(2)}%)
                      </span>
                    </div>
                    {clicksDelta !== null && (
                      <div className="text-[10px] font-mono-tabular text-slate-500">
                        前月比 {clicksDelta >= 0 ? '+' : ''}
                        {clicksDelta.toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">開始 / 応募数</div>
                    <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                      {mRow.applyStarts} / {mRow.applications}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-slate-500">
                      CPC {formatMetricValue('cpc', mRow.cpc)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly Bar Chart Comparison */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              月別比較グラフ（{getMetricDef(chartMetric).label}）
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              集計日の開始年月を基準に、合計値および加重平均（率・単価）で月次集計しています
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chartMetric}
              onChange={(e) => setChartMetric(e.target.value as MetricKey)}
              className="text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {METRIC_DEFINITIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <InteractiveChart
          xLabels={monthlyChartData.xLabels}
          series={monthlyChartData.series}
          metricKey={chartMetric}
          chartType="bar"
          height={290}
        />
      </div>

      {/* Monthly Aggregated Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
              {(
                [
                  { id: 'dept-id', label: '部署 × ID別' },
                  { id: 'dept', label: '部署別合計' },
                  { id: 'overall', label: '月別全体' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGranularity(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    granularity === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-800"
            >
              <option value="ALL">すべての月 ({availableMonths.length})</option>
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV出力</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSheetsExport(summaryRows, granularityLabel)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Sheetsに書き出し</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                {[
                  { key: 'monthKey', label: '集計月', align: 'left' },
                  { key: 'departmentCode', label: '部署コード', align: 'left' },
                  { key: 'departmentName', label: '部署', align: 'left' },
                  { key: 'adId', label: 'ID', align: 'left' },
                  { key: 'impressions', label: '表示回数', align: 'right' },
                  { key: 'ctr', label: 'クリック率', align: 'right' },
                  { key: 'clicks', label: 'クリック数', align: 'right' },
                  { key: 'applyStartRate', label: '応募開始率', align: 'right' },
                  { key: 'applyStarts', label: '応募開始数', align: 'right' },
                  { key: 'applyCompletionRate', label: '応募完了率', align: 'right' },
                  { key: 'applications', label: '応募数', align: 'right' },
                  { key: 'applyRate', label: '応募率', align: 'right' },
                  { key: 'cpc', label: 'クリック単価', align: 'right' },
                  { key: 'cpas', label: '応募開始単価', align: 'right' },
                  { key: 'cpa', label: '応募単価', align: 'right' },
                  { key: 'spend', label: '利用金額', align: 'right' },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key as keyof MonthlySummaryRow)}
                    className={`px-3 py-2.5 font-medium whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{col.label}</span>
                      {sortField === col.key &&
                        (sortDir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-blue-600" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaryRows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/80 transition-colors h-10">
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-900">
                    {row.monthLabel}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono-tabular text-slate-500">
                    {row.departmentCode}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-800">
                    {row.departmentName}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono-tabular text-slate-700">
                    {row.adId}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-900">
                    {formatMetricValue('impressions', row.impressions)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('ctr', row.ctr)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-900">
                    {formatMetricValue('clicks', row.clicks)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('applyStartRate', row.applyStartRate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-900">
                    {formatMetricValue('applyStarts', row.applyStarts)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('applyCompletionRate', row.applyCompletionRate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular font-semibold text-slate-900">
                    {formatMetricValue('applications', row.applications)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('applyRate', row.applyRate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('cpc', row.cpc)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('cpas', row.cpas)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                    {formatMetricValue('cpa', row.cpa)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular font-semibold text-slate-900">
                    {formatMetricValue('spend', row.spend)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
