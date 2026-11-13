import {
  AdRecord,
  AggregatedMetrics,
  DepartmentGroup,
  MetricDefinition,
  MetricKey,
  MonthlySummaryRow,
} from '../types/analytics';

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'impressions',
    label: '表示回数',
    shortLabel: '表示回数',
    category: 'volume',
    unit: 'count',
    color: '#2563EB',
    formulaNote: '合計値',
  },
  {
    key: 'ctr',
    label: 'クリック率',
    shortLabel: 'CTR',
    category: 'rate',
    unit: 'percent',
    color: '#0D9488',
    formulaNote: 'クリック数 ÷ 表示回数',
  },
  {
    key: 'clicks',
    label: 'クリック数',
    shortLabel: 'クリック',
    category: 'volume',
    unit: 'count',
    color: '#0284C7',
    formulaNote: '合計値',
  },
  {
    key: 'applyStartRate',
    label: '応募開始率',
    shortLabel: '開始率',
    category: 'rate',
    unit: 'percent',
    color: '#7C3AED',
    formulaNote: '応募開始数 ÷ クリック数',
  },
  {
    key: 'applyStarts',
    label: '応募開始数',
    shortLabel: '開始数',
    category: 'volume',
    unit: 'count',
    color: '#9333EA',
    formulaNote: '合計値',
  },
  {
    key: 'applyCompletionRate',
    label: '応募完了率',
    shortLabel: '完了率',
    category: 'rate',
    unit: 'percent',
    color: '#059669',
    formulaNote: '応募数 ÷ 応募開始数',
  },
  {
    key: 'applications',
    label: '応募数',
    shortLabel: '応募数',
    category: 'volume',
    unit: 'count',
    color: '#16A34A',
    formulaNote: '合計値',
  },
  {
    key: 'applyRate',
    label: '応募率',
    shortLabel: '応募率',
    category: 'rate',
    unit: 'percent',
    color: '#D97706',
    formulaNote: '応募数 ÷ クリック数',
  },
  {
    key: 'cpc',
    label: 'クリック単価',
    shortLabel: 'CPC',
    category: 'cost',
    unit: 'yen',
    color: '#475569',
    formulaNote: '利用金額 ÷ クリック数',
  },
  {
    key: 'cpas',
    label: '応募開始単価',
    shortLabel: '開始単価',
    category: 'cost',
    unit: 'yen',
    color: '#E11D48',
    formulaNote: '利用金額 ÷ 応募開始数',
  },
  {
    key: 'cpa',
    label: '応募単価',
    shortLabel: 'CPA',
    category: 'cost',
    unit: 'yen',
    color: '#DC2626',
    formulaNote: '利用金額 ÷ 応募数',
  },
  {
    key: 'spend',
    label: '利用金額',
    shortLabel: '利用金額',
    category: 'cost',
    unit: 'yen',
    color: '#0F172A',
    formulaNote: '合計値',
  },
];

export const SERIES_PALETTE = [
  '#2563EB', // Cobalt
  '#0D9488', // Teal
  '#D97706', // Amber
  '#7C3AED', // Violet
  '#E11D48', // Rose
  '#059669', // Emerald
  '#0284C7', // Sky
  '#9333EA', // Purple
  '#EA580C', // Orange
  '#475569', // Slate
  '#4F46E5', // Indigo
  '#0891B2', // Cyan
  '#BE123C', // Crimson
];

export function getMetricDef(key: MetricKey): MetricDefinition {
  return METRIC_DEFINITIONS.find((m) => m.key === key) ?? METRIC_DEFINITIONS[0];
}

export function formatMetricValue(key: MetricKey, value: number, compact = false): string {
  const def = getMetricDef(key);
  if (!Number.isFinite(value)) return '0';
  if (def.unit === 'percent') {
    return `${value.toFixed(2)}%`;
  }
  if (def.unit === 'yen') {
    if (compact && Math.abs(value) >= 100000) {
      return `¥${(value / 10000).toFixed(1)}万`;
    }
    return `¥${Math.round(value).toLocaleString('ja-JP')}`;
  }
  if (compact && Math.abs(value) >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return Math.round(value).toLocaleString('ja-JP');
}

/**
 * Computes weighted metrics from an array of AdRecord rows.
 * Additive counts/spend are summed; rates & unit costs are recalculated from sums.
 */
export function computeAggregatedMetrics(rows: AdRecord[]): AggregatedMetrics {
  let impressions = 0;
  let clicks = 0;
  let applyStarts = 0;
  let applications = 0;
  let spend = 0;

  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    applyStarts += r.applyStarts;
    applications += r.applications;
    spend += r.spend;
  }

  return {
    impressions,
    clicks,
    applyStarts,
    applications,
    spend,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    applyStartRate: clicks > 0 ? (applyStarts / clicks) * 100 : 0,
    applyCompletionRate: applyStarts > 0 ? (applications / applyStarts) * 100 : 0,
    applyRate: clicks > 0 ? (applications / clicks) * 100 : 0,
    cpc: clicks > 0 ? Math.round(spend / clicks) : 0,
    cpas: applyStarts > 0 ? Math.round(spend / applyStarts) : 0,
    cpa: applications > 0 ? Math.round(spend / applications) : 0,
    recordCount: rows.length,
  };
}

export function getDepartmentGroups(records: AdRecord[]): DepartmentGroup[] {
  const map = new Map<string, DepartmentGroup & { idSet: Set<string> }>();
  for (const r of records) {
    const key = `${r.departmentCode}::${r.departmentName}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        departmentCode: r.departmentCode,
        departmentName: r.departmentName,
        ids: [],
        idSet: new Set<string>(),
        recordCount: 0,
      };
      map.set(key, entry);
    }
    entry.idSet.add(r.id);
    entry.recordCount += 1;
  }

  return Array.from(map.values())
    .map(({ idSet, ...rest }) => ({
      ...rest,
      ids: Array.from(idSet).sort(),
    }))
    .sort((a, b) => {
      const codeCmp = a.departmentCode.localeCompare(b.departmentCode, undefined, { numeric: true });
      if (codeCmp !== 0) return codeCmp;
      return a.departmentName.localeCompare(b.departmentName, 'ja');
    });
}

export type MonthlyGranularity = 'dept-id' | 'dept' | 'overall';

export function buildMonthlySummaries(
  records: AdRecord[],
  granularity: MonthlyGranularity
): MonthlySummaryRow[] {
  const groups = new Map<string, AdRecord[]>();

  for (const r of records) {
    let key = '';
    if (granularity === 'dept-id') {
      key = `${r.monthKey}::${r.departmentCode}::${r.departmentName}::${r.id}`;
    } else if (granularity === 'dept') {
      key = `${r.monthKey}::${r.departmentCode}::${r.departmentName}`;
    } else {
      key = `${r.monthKey}`;
    }

    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const summaries: MonthlySummaryRow[] = [];
  for (const [key, rows] of groups.entries()) {
    const first = rows[0];
    const agg = computeAggregatedMetrics(rows);
    const uniqueRanges = Array.from(new Set(rows.map((r) => r.dateLabel)));
    summaries.push({
      key,
      monthKey: first.monthKey,
      monthLabel: first.monthLabel,
      departmentCode: granularity === 'overall' ? '-' : first.departmentCode,
      departmentName: granularity === 'overall' ? '全体合計' : first.departmentName,
      adId: granularity === 'dept-id' ? first.id : granularity === 'dept' ? '全部署ID合算' : '全ID合算',
      dateRanges: uniqueRanges,
      ...agg,
    });
  }

  return summaries.sort((a, b) => {
    const mCmp = a.monthKey.localeCompare(b.monthKey);
    if (mCmp !== 0) return mCmp;
    const cCmp = a.departmentCode.localeCompare(b.departmentCode, undefined, { numeric: true });
    if (cCmp !== 0) return cCmp;
    const dCmp = a.departmentName.localeCompare(b.departmentName, 'ja');
    if (dCmp !== 0) return dCmp;
    return a.adId.localeCompare(b.adId);
  });
}

/**
 * Returns chronologically ordered unique date labels for a set of records.
 */
export function getSortedDatePeriods(records: AdRecord[]): Array<{
  dateLabel: string;
  monthKey: string;
  monthLabel: string;
  sortDateValue: number;
  sortEndValue: number;
}> {
  const map = new Map<
    string,
    {
      dateLabel: string;
      monthKey: string;
      monthLabel: string;
      sortDateValue: number;
      sortEndValue: number;
    }
  >();

  for (const r of records) {
    if (!map.has(r.dateLabel)) {
      map.set(r.dateLabel, {
        dateLabel: r.dateLabel,
        monthKey: r.monthKey,
        monthLabel: r.monthLabel,
        sortDateValue: r.sortDateValue,
        sortEndValue: r.sortEndValue,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.sortDateValue !== b.sortDateValue) return a.sortDateValue - b.sortDateValue;
    return a.sortEndValue - b.sortEndValue;
  });
}

/**
 * Exports rows to CSV string (with BOM for Excel compatibility).
 */
export function recordsToCsv(records: AdRecord[]): string {
  const header = [
    '部署コード',
    '部署',
    'ID',
    '集計日',
    '表示回数',
    'クリック率',
    'クリック数',
    '応募開始率',
    '応募開始数',
    '応募完了率',
    '応募数',
    '応募率',
    'クリック単価',
    '応募開始単価',
    '応募単価',
    '利用金額',
  ];

  const lines = records.map((r) =>
    [
      r.departmentCode,
      `"${r.departmentName.replace(/"/g, '""')}"`,
      r.id,
      r.dateLabel,
      r.impressions,
      `${r.ctr.toFixed(2)}%`,
      r.clicks,
      `${r.applyStartRate.toFixed(2)}%`,
      r.applyStarts,
      `${r.applyCompletionRate.toFixed(2)}%`,
      r.applications,
      `${r.applyRate.toFixed(2)}%`,
      r.cpc,
      r.cpas,
      r.cpa,
      r.spend,
    ].join(',')
  );

  return '\uFEFF' + [header.join(','), ...lines].join('\n');
}

export function monthlySummariesToCsv(rows: MonthlySummaryRow[]): string {
  const header = [
    '集計月',
    '部署コード',
    '部署',
    'ID',
    '集計期間数',
    '表示回数',
    'クリック率',
    'クリック数',
    '応募開始率',
    '応募開始数',
    '応募完了率',
    '応募数',
    '応募率',
    'クリック単価',
    '応募開始単価',
    '応募単価',
    '利用金額',
  ];

  const lines = rows.map((r) =>
    [
      r.monthLabel,
      r.departmentCode,
      `"${r.departmentName.replace(/"/g, '""')}"`,
      r.adId,
      r.recordCount,
      r.impressions,
      `${r.ctr.toFixed(2)}%`,
      r.clicks,
      `${r.applyStartRate.toFixed(2)}%`,
      r.applyStarts,
      `${r.applyCompletionRate.toFixed(2)}%`,
      r.applications,
      `${r.applyRate.toFixed(2)}%`,
      r.cpc,
      r.cpas,
      r.cpa,
      r.spend,
    ].join(',')
  );

  return '\uFEFF' + [header.join(','), ...lines].join('\n');
}
