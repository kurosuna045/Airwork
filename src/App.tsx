import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  BarChart3,
  CalendarRange,
  ChevronRight,
  FileSpreadsheet,
  LayoutGrid,
  Menu,
  Table2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { INITIAL_CSV_DATA } from './data/initialCsvData';
import {
  AdRecord,
  DataSourceInfo,
  MetricKey,
  MonthlySummaryRow,
  SpreadsheetMeta,
  ViewMode,
} from './types/analytics';
import { parseCsvToGrid, parseGridToRecords } from './utils/csvParser';
import {
  buildMonthlySummaries,
  computeAggregatedMetrics,
  formatMetricValue,
  getDepartmentGroups,
  getMetricDef,
  getSortedDatePeriods,
  METRIC_DEFINITIONS,
  SERIES_PALETTE,
} from './utils/aggregator';
import { initAuth } from './services/googleSheetsAuth';
import { ChartSeries, InteractiveChart } from './components/InteractiveChart';
import { AllMetricsGrid } from './components/AllMetricsGrid';
import { MonthlySummaryView } from './components/MonthlySummaryView';
import { DataTableView } from './components/DataTableView';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { CsvImportModal } from './components/CsvImportModal';

export default function App() {
  const initialParsed = useMemo(() => {
    const grid = parseCsvToGrid(INITIAL_CSV_DATA);
    return parseGridToRecords(grid).records;
  }, []);

  const [records, setRecords] = useState<AdRecord[]>(initialParsed);
  const [dataSource, setDataSource] = useState<DataSourceInfo>({
    type: 'builtin',
    label: '読み込み済みレポートデータ',
    updatedAt: '初期読込',
  });
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // Workspace navigation & filtering
  const [viewMode, setViewMode] = useState<ViewMode>('period-charts');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string>('ALL');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Focus Chart state
  const [focusMetric, setFocusMetric] = useState<MetricKey>('spend');
  const [secondaryMetric, setSecondaryMetric] = useState<MetricKey | 'NONE'>('clicks');
  const [focusAxisMode, setFocusAxisMode] = useState<'period' | 'monthly'>('period');
  const [focusChartType, setFocusChartType] = useState<'line' | 'bar'>('bar');

  // Google Sheets OAuth & Modals
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);
  const [sheetsModalTab, setSheetsModalTab] = useState<'import' | 'export'>('import');
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [exportRowsOverride, setExportRowsOverride] = useState<{
    rows: MonthlySummaryRow[];
    label: string;
  } | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setAuthUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      (user) => {
        setAuthUser(user);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const departmentGroups = useMemo(() => getDepartmentGroups(records), [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (
        selectedDepartment !== 'ALL' &&
        `${r.departmentCode}::${r.departmentName}` !== selectedDepartment
      ) {
        return false;
      }
      if (selectedId !== 'ALL' && r.id !== selectedId) {
        return false;
      }
      return true;
    });
  }, [records, selectedDepartment, selectedId]);

  const activeSummary = useMemo(
    () => computeAggregatedMetrics(filteredRecords),
    [filteredRecords]
  );

  const defaultMonthlyExportRows = useMemo(
    () => buildMonthlySummaries(filteredRecords, 'dept-id'),
    [filteredRecords]
  );

  // Build Focus Chart series grouped by Department & ID (or Department)
  const focusChartData = useMemo(() => {
    type Bucket = { id: string; label: string; filterFn: (r: AdRecord) => boolean };
    const buckets: Bucket[] = [];

    if (selectedId !== 'ALL') {
      const sample = filteredRecords[0];
      buckets.push({
        id: selectedId,
        label: sample ? `${sample.departmentName} / ${selectedId}` : `ID ${selectedId}`,
        filterFn: (r) => r.id === selectedId,
      });
    } else if (selectedDepartment !== 'ALL') {
      const ids = Array.from(new Set(filteredRecords.map((r) => r.id))).sort();
      ids.forEach((id) => {
        buckets.push({
          id,
          label: `ID ${id}`,
          filterFn: (r) => r.id === id,
        });
      });
    } else {
      // Group by department so chart remains readable across all 8 departments
      departmentGroups.forEach((d) => {
        const key = `${d.departmentCode}::${d.departmentName}`;
        buckets.push({
          id: key,
          label: `${d.departmentCode} ${d.departmentName}`,
          filterFn: (r) => `${r.departmentCode}::${r.departmentName}` === key,
        });
      });
    }

    if (focusAxisMode === 'period') {
      const periods = getSortedDatePeriods(filteredRecords);
      const xLabels = periods.map((p) => p.dateLabel);
      const xSubLabels = periods.map((p) => p.monthLabel);

      const series: ChartSeries[] = buckets.map((bucket, idx) => {
        const bRows = filteredRecords.filter(bucket.filterFn);
        const values = periods.map((p) => {
          const matching = bRows.filter((r) => r.dateLabel === p.dateLabel);
          if (matching.length === 0) return null;
          return computeAggregatedMetrics(matching)[focusMetric];
        });
        return {
          id: bucket.id,
          label: bucket.label,
          color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          values,
        };
      });

      const secondaryValues =
        secondaryMetric === 'NONE'
          ? undefined
          : periods.map((p) => {
              const matching = filteredRecords.filter((r) => r.dateLabel === p.dateLabel);
              if (matching.length === 0) return null;
              return computeAggregatedMetrics(matching)[secondaryMetric];
            });

      return { xLabels, xSubLabels, series, secondaryValues };
    } else {
      const months = Array.from(
        new Map(filteredRecords.map((r) => [r.monthKey, r.monthLabel])).entries()
      )
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monthKey, monthLabel]) => ({ monthKey, monthLabel }));

      const xLabels = months.map((m) => m.monthLabel);

      const series: ChartSeries[] = buckets.map((bucket, idx) => {
        const bRows = filteredRecords.filter(bucket.filterFn);
        const monthly = buildMonthlySummaries(bRows, 'overall');
        const values = months.map((m) => {
          const found = monthly.find((row) => row.monthKey === m.monthKey);
          return found ? found[focusMetric] : null;
        });
        return {
          id: bucket.id,
          label: bucket.label,
          color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          values,
        };
      });

      const secondaryValues =
        secondaryMetric === 'NONE'
          ? undefined
          : months.map((m) => {
              const matching = filteredRecords.filter((r) => r.monthKey === m.monthKey);
              if (matching.length === 0) return null;
              return computeAggregatedMetrics(matching)[secondaryMetric];
            });

      return { xLabels, xSubLabels: undefined, series, secondaryValues };
    }
  }, [
    filteredRecords,
    departmentGroups,
    selectedDepartment,
    selectedId,
    focusAxisMode,
    focusMetric,
    secondaryMetric,
  ]);

  // Period Breakdown Table for the active Focus Chart selection
  const periodSummaryRows = useMemo(() => {
    const periods = getSortedDatePeriods(filteredRecords);
    return periods.map((p) => {
      const matching = filteredRecords.filter((r) => r.dateLabel === p.dateLabel);
      return {
        ...p,
        ...computeAggregatedMetrics(matching),
      };
    });
  }, [filteredRecords]);

  const handleSelectDepartment = (deptKey: string) => {
    setSelectedDepartment(deptKey);
    setSelectedId('ALL');
    setSidebarOpen(false);
  };

  const handleSelectId = (deptKey: string, id: string) => {
    setSelectedDepartment(deptKey);
    setSelectedId(id);
    setSidebarOpen(false);
  };

  const handleResetFilters = () => {
    setSelectedDepartment('ALL');
    setSelectedId('ALL');
  };

  const activeScopeLabel = useMemo(() => {
    if (selectedDepartment === 'ALL') return '全部署 · 全ID';
    const [code, name] = selectedDepartment.split('::');
    if (selectedId === 'ALL') return `${code} ${name} · 全ID`;
    return `${code} ${name} · ID ${selectedId}`;
  }, [selectedDepartment, selectedId]);

  const handleSheetsImportSuccess = (
    nextRecords: AdRecord[],
    meta: SpreadsheetMeta,
    sheetTitle: string,
    warnings: string[]
  ) => {
    setRecords(nextRecords);
    setSelectedDepartment('ALL');
    setSelectedId('ALL');
    setImportWarnings(warnings);
    setDataSource({
      type: 'sheets',
      label: `${meta.title} (${sheetTitle})`,
      spreadsheetId: meta.spreadsheetId,
      sheetTitle,
      updatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const handleCsvImportSuccess = (
    nextRecords: AdRecord[],
    label: string,
    warnings: string[]
  ) => {
    setRecords(nextRecords);
    setSelectedDepartment('ALL');
    setSelectedId('ALL');
    setImportWarnings(warnings);
    setDataSource({
      type: 'csv',
      label,
      updatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const handleResetBuiltin = () => {
    setRecords(initialParsed);
    setSelectedDepartment('ALL');
    setSelectedId('ALL');
    setImportWarnings([]);
    setDataSource({
      type: 'builtin',
      label: '読み込み済みレポートデータ',
      updatedAt: '初期読込',
    });
  };

  const navItems: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    {
      id: 'period-charts',
      label: '集計日別グラフ',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: 'all-metrics',
      label: '全12項目グラフ一覧',
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      id: 'monthly-summary',
      label: '月単位集計',
      icon: <CalendarRange className="w-4 h-4" />,
    },
    {
      id: 'data-table',
      label: '明細データ',
      icon: <Table2 className="w-4 h-4" />,
    },
  ];

  const currentViewTitle = navItems.find((n) => n.id === viewMode)?.label ?? '';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (260px) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[264px] shrink-0 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            RecruitPulse
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-700"
            aria-label="メニューを閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Primary Navigation */}
          <div>
            <div className="px-2 mb-2 text-xs font-medium text-slate-500">分析ビュー</div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const active = viewMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setViewMode(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Department & ID Selector Tree */}
          <div>
            <div className="px-2 mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">部署・ID 絞り込み</span>
              {(selectedDepartment !== 'ALL' || selectedId !== 'ALL') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                >
                  すべて解除
                </button>
              )}
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={handleResetFilters}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-md transition-colors ${
                  selectedDepartment === 'ALL'
                    ? 'bg-slate-900 text-white font-medium'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="truncate">全部署・全ID</span>
                <span className="font-mono-tabular text-[11px] opacity-75">
                  {records.length}
                </span>
              </button>

              {departmentGroups.map((dept) => {
                const deptKey = `${dept.departmentCode}::${dept.departmentName}`;
                const isDeptActive = selectedDepartment === deptKey;

                return (
                  <div key={deptKey} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => handleSelectDepartment(deptKey)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-md transition-colors ${
                        isDeptActive && selectedId === 'ALL'
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : isDeptActive
                          ? 'bg-slate-100 text-slate-900 font-medium'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate text-left">
                        <span className="font-mono-tabular text-slate-400 mr-1.5">
                          {dept.departmentCode}
                        </span>
                        {dept.departmentName}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-slate-400 ml-2 shrink-0">
                        {dept.ids.length}ID
                      </span>
                    </button>

                    {/* Nested IDs */}
                    <div className="pl-5 space-y-0.5">
                      {dept.ids.map((id) => {
                        const isIdActive = isDeptActive && selectedId === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleSelectId(deptKey, id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-mono-tabular rounded-md transition-colors ${
                              isIdActive
                                ? 'bg-blue-600 text-white font-medium'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span>ID {id}</span>
                            {isIdActive && <ChevronRight className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Data Source Footer inside Sidebar */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-2">
          <div className="text-[11px] text-slate-500">
            <div className="truncate font-medium text-slate-700">{dataSource.label}</div>
            <div className="mt-0.5 font-mono-tabular">
              {records.length}行 · {departmentGroups.length}部署
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setCsvModalOpen(true)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 whitespace-nowrap"
            >
              <Upload className="w-3 h-3" />
              <span>CSV読込</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setExportRowsOverride(null);
                setSheetsModalTab('import');
                setSheetsModalOpen(true);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 bg-white border border-emerald-200 rounded hover:bg-emerald-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Sheets</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (3-zone contract) */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0">
          {/* Zone 1: Context / Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
              aria-label="メニューを開く"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="font-semibold text-slate-900 whitespace-nowrap shrink-0">
                {currentViewTitle}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="text-xs text-slate-600 truncate">{activeScopeLabel}</span>
            </div>
          </div>

          {/* Zone 2: Quick View Links */}
          <nav className="hidden xl:flex items-center gap-6 text-xs font-medium text-slate-600">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setViewMode(item.id)}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  viewMode === item.id
                    ? 'text-blue-700 underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setExportRowsOverride(null);
                setSheetsModalTab('import');
                setSheetsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {needsAuth || !accessToken ? 'Google Sheets連携' : 'Google Sheets同期'}
              </span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto space-y-5">
          {importWarnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-center justify-between gap-3">
              <span>読み込み時の注意: {importWarnings[0]}</span>
              <button
                type="button"
                onClick={() => setImportWarnings([])}
                className="text-amber-700 hover:text-amber-950 font-medium whitespace-nowrap"
              >
                閉じる
              </button>
            </div>
          )}

          {/* Top KPI Summary Strip (Clean 1-level hairline grid) */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: '利用金額合計',
                val: formatMetricValue('spend', activeSummary.spend),
                sub: `クリック単価 ${formatMetricValue('cpc', activeSummary.cpc)}`,
              },
              {
                label: '表示回数',
                val: formatMetricValue('impressions', activeSummary.impressions),
                sub: `対象レコード ${activeSummary.recordCount}件`,
              },
              {
                label: 'クリック数',
                val: formatMetricValue('clicks', activeSummary.clicks),
                sub: `クリック率 ${formatMetricValue('ctr', activeSummary.ctr)}`,
              },
              {
                label: '応募開始数',
                val: formatMetricValue('applyStarts', activeSummary.applyStarts),
                sub: `開始率 ${formatMetricValue('applyStartRate', activeSummary.applyStartRate)}`,
              },
              {
                label: '応募数',
                val: formatMetricValue('applications', activeSummary.applications),
                sub: `完了率 ${formatMetricValue('applyCompletionRate', activeSummary.applyCompletionRate)}`,
              },
              {
                label: '応募単価 (CPA)',
                val:
                  activeSummary.applications > 0
                    ? formatMetricValue('cpa', activeSummary.cpa)
                    : '—',
                sub: `応募率 ${formatMetricValue('applyRate', activeSummary.applyRate)}`,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white border border-slate-200 rounded-lg px-4 py-3"
              >
                <div className="text-[11px] font-medium text-slate-500">{kpi.label}</div>
                <div className="text-lg font-semibold font-mono-tabular text-slate-900 mt-1">
                  {kpi.val}
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
                  {kpi.sub}
                </div>
              </div>
            ))}
          </section>

          {/* View 1: Primary Period Charts View */}
          {viewMode === 'period-charts' && (
            <div className="space-y-5">
              {/* Filter & Metric Controls */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {focusAxisMode === 'period' ? '集計日別' : '月単位'} パフォーマンス推移（
                      {getMetricDef(focusMetric).label}）
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedId !== 'ALL'
                        ? `選択中のID (${selectedId}) の推移を表示`
                        : selectedDepartment !== 'ALL'
                        ? `選択中の部署内の各IDを比較表示`
                        : `全部署を部署別に比較表示（左サイドバーから部署・IDで絞り込み可能）`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Time Axis Toggle */}
                    <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
                      <button
                        type="button"
                        onClick={() => setFocusAxisMode('period')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                          focusAxisMode === 'period'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        集計日ごと
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusAxisMode('monthly')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                          focusAxisMode === 'monthly'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        月単位
                      </button>
                    </div>

                    {/* Chart Type Toggle */}
                    <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
                      <button
                        type="button"
                        onClick={() => setFocusChartType('bar')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                          focusChartType === 'bar'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>棒</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusChartType('line')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                          focusChartType === 'line'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>折れ線</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Metric Selector Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {METRIC_DEFINITIONS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setFocusMetric(m.key)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          focusMetric === m.key
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      合計重ね線(右軸):
                    </span>
                    <select
                      value={secondaryMetric}
                      onChange={(e) =>
                        setSecondaryMetric(e.target.value as MetricKey | 'NONE')
                      }
                      className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-800"
                    >
                      <option value="NONE">なし</option>
                      {METRIC_DEFINITIONS.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Main SVG Chart */}
                <div className="pt-2">
                  <InteractiveChart
                    xLabels={focusChartData.xLabels}
                    xSubLabels={focusChartData.xSubLabels}
                    series={focusChartData.series}
                    metricKey={focusMetric}
                    secondaryMetricKey={
                      secondaryMetric === 'NONE' ? null : secondaryMetric
                    }
                    secondaryValues={focusChartData.secondaryValues}
                    chartType={focusChartType}
                    height={360}
                  />
                </div>
              </div>

              {/* Period Summary Table below the chart */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    集計日別サマリー（{activeScopeLabel}）
                  </h3>
                  <button
                    type="button"
                    onClick={() => setViewMode('all-metrics')}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    全12項目を同時にグラフで見る →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">
                          集計日
                        </th>
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">
                          集計月
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          表示回数
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          クリック率
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          クリック数
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募開始率
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募開始数
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募完了率
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募数
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募率
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          クリック単価
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募開始単価
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          応募単価
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                          利用金額
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodSummaryRows.map((p) => (
                        <tr key={p.dateLabel} className="hover:bg-slate-50/80 h-9">
                          <td className="px-3 py-1.5 whitespace-nowrap font-mono-tabular font-medium text-slate-900">
                            {p.dateLabel}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">
                            {p.monthLabel}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('impressions', p.impressions)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('ctr', p.ctr)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('clicks', p.clicks)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('applyStartRate', p.applyStartRate)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('applyStarts', p.applyStarts)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('applyCompletionRate', p.applyCompletionRate)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular font-semibold">
                            {formatMetricValue('applications', p.applications)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('applyRate', p.applyRate)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('cpc', p.cpc)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('cpas', p.cpas)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular">
                            {formatMetricValue('cpa', p.cpa)}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right font-mono-tabular font-semibold">
                            {formatMetricValue('spend', p.spend)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* View 2: All 12 Metrics Grid */}
          {viewMode === 'all-metrics' && (
            <AllMetricsGrid
              records={filteredRecords}
              selectedDepartment={
                selectedDepartment === 'ALL'
                  ? 'ALL'
                  : selectedDepartment.split('::')[1] ?? selectedDepartment
              }
              selectedId={selectedId}
              onFocusMetric={(metric, axisMode) => {
                setFocusMetric(metric);
                setFocusAxisMode(axisMode);
                setViewMode('period-charts');
              }}
            />
          )}

          {/* View 3: Monthly Summary */}
          {viewMode === 'monthly-summary' && (
            <MonthlySummaryView
              records={filteredRecords}
              onOpenSheetsExport={(rows, label) => {
                setExportRowsOverride({ rows, label });
                setSheetsModalTab('export');
                setSheetsModalOpen(true);
              }}
            />
          )}

          {/* View 4: Raw Data Table */}
          {viewMode === 'data-table' && <DataTableView records={filteredRecords} />}
        </main>
      </div>

      {/* Modals */}
      <GoogleSheetsModal
        isOpen={sheetsModalOpen}
        initialTab={sheetsModalTab}
        onClose={() => setSheetsModalOpen(false)}
        user={authUser}
        accessToken={accessToken}
        needsAuth={needsAuth}
        onAuthUpdated={(user, token) => {
          setAuthUser(user);
          setAccessToken(token);
          setNeedsAuth(!token);
        }}
        records={filteredRecords}
        monthlyRowsToExport={exportRowsOverride?.rows ?? defaultMonthlyExportRows}
        exportGranularityLabel={exportRowsOverride?.label ?? '部署・ID別月次'}
        onImportSuccess={handleSheetsImportSuccess}
      />

      <CsvImportModal
        isOpen={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImport={handleCsvImportSuccess}
        onResetDefault={handleResetBuiltin}
      />
    </div>
  );
}
