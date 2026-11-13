export type MetricKey =
  | 'impressions'
  | 'ctr'
  | 'clicks'
  | 'applyStartRate'
  | 'applyStarts'
  | 'applyCompletionRate'
  | 'applications'
  | 'applyRate'
  | 'cpc'
  | 'cpas'
  | 'cpa'
  | 'spend';

export type MetricCategory = 'volume' | 'rate' | 'cost';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  category: MetricCategory;
  unit: 'count' | 'percent' | 'yen';
  color: string;
  formulaNote: string;
}

export interface AdRecord {
  id: string; // job/ad ID e.g. '9110197'
  departmentCode: string; // e.g. '11'
  departmentName: string; // e.g. '水処理(管理)'
  dateLabel: string; // raw 集計日 e.g. '2026.9.1~6'
  monthKey: string; // e.g. '2026-09'
  monthLabel: string; // e.g. '2026年9月'
  sortDateValue: number; // numeric YYYYMMDD for chronological sorting
  sortEndValue: number; // numeric YYYYMMDD for end day tie-breaking
  impressions: number; // 表示回数
  ctr: number; // クリック率 (%)
  clicks: number; // クリック数
  applyStartRate: number; // 応募開始率 (%)
  applyStarts: number; // 応募開始数
  applyCompletionRate: number; // 応募完了率 (%)
  applications: number; // 応募数
  applyRate: number; // 応募率 (%)
  cpc: number; // クリック単価 (¥)
  cpas: number; // 応募開始単価 (¥)
  cpa: number; // 応募単価 (¥)
  spend: number; // 利用金額 (¥)
}

export interface AggregatedMetrics {
  impressions: number;
  ctr: number;
  clicks: number;
  applyStartRate: number;
  applyStarts: number;
  applyCompletionRate: number;
  applications: number;
  applyRate: number;
  cpc: number;
  cpas: number;
  cpa: number;
  spend: number;
  recordCount: number;
}

export interface MonthlySummaryRow extends AggregatedMetrics {
  key: string;
  monthKey: string;
  monthLabel: string;
  departmentCode: string;
  departmentName: string;
  adId: string;
  dateRanges: string[];
}

export interface DepartmentGroup {
  departmentCode: string;
  departmentName: string;
  ids: string[];
  recordCount: number;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    rowCount?: number;
    columnCount?: number;
  }>;
}

export interface DataSourceInfo {
  type: 'builtin' | 'csv' | 'sheets';
  label: string;
  spreadsheetId?: string;
  sheetTitle?: string;
  updatedAt: string;
}

export type ViewMode = 'period-charts' | 'all-metrics' | 'monthly-summary' | 'data-table';
