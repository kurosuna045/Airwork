import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import { AdRecord } from '../types/analytics';
import { formatMetricValue, recordsToCsv } from '../utils/aggregator';

interface DataTableViewProps {
  records: AdRecord[];
}

export const DataTableView: React.FC<DataTableViewProps> = ({ records }) => {
  const [query, setQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [sortField, setSortField] = useState<keyof AdRecord>('sortDateValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const months = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => map.set(r.monthKey, r.monthLabel));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => {
        if (monthFilter !== 'ALL' && r.monthKey !== monthFilter) return false;
        if (!q) return true;
        return (
          r.departmentName.toLowerCase().includes(q) ||
          r.departmentCode.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.dateLabel.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
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
  }, [records, query, monthFilter, sortField, sortDir]);

  const handleSort = (field: keyof AdRecord) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'sortDateValue' || field === 'departmentCode' ? 'asc' : 'desc');
    }
  };

  const handleDownload = () => {
    const csv = recordsToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `集計日別明細_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="部署・ID・集計日で検索"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-800"
          >
            <option value="ALL">すべての月</option>
            {months.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>

          <span className="text-xs text-slate-500 font-mono-tabular">
            表示 {filtered.length} / {records.length} 件
          </span>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>CSVダウンロード</span>
        </button>
      </div>

      <div className="overflow-x-auto max-h-[620px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              {[
                { key: 'departmentCode', label: '部署コード', align: 'left' },
                { key: 'departmentName', label: '部署', align: 'left' },
                { key: 'id', label: 'ID', align: 'left' },
                { key: 'sortDateValue', label: '集計日', align: 'left' },
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
                  onClick={() => handleSort(col.key as keyof AdRecord)}
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
            {filtered.map((r, i) => (
              <tr
                key={`${r.departmentCode}-${r.id}-${r.dateLabel}-${i}`}
                className="hover:bg-slate-50/80 transition-colors h-9"
              >
                <td className="px-3 py-1.5 whitespace-nowrap font-mono-tabular text-slate-500">
                  {r.departmentCode}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-slate-800">
                  {r.departmentName}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono-tabular text-slate-700">
                  {r.id}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono-tabular text-slate-900">
                  {r.dateLabel}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-900">
                  {formatMetricValue('impressions', r.impressions)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('ctr', r.ctr)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-900">
                  {formatMetricValue('clicks', r.clicks)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('applyStartRate', r.applyStartRate)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-900">
                  {formatMetricValue('applyStarts', r.applyStarts)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('applyCompletionRate', r.applyCompletionRate)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular font-semibold text-slate-900">
                  {formatMetricValue('applications', r.applications)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('applyRate', r.applyRate)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('cpc', r.cpc)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('cpas', r.cpas)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular text-slate-700">
                  {formatMetricValue('cpa', r.cpa)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular font-semibold text-slate-900">
                  {formatMetricValue('spend', r.spend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
