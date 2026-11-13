import { AdRecord } from '../types/analytics';

/**
 * Parses a CSV string into a 2D string array, supporting quoted fields with commas.
 */
export function parseCsvToGrid(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((cell) => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses numbers formatted with ¥, commas, or % signs.
 */
function parseNumericCell(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val == null) return 0;
  const cleaned = String(val).replace(/[¥￥,\s%％]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '—') return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parses aggregation date string such as:
 * - "2026.9.1~6"
 * - "2026.10.1~1"
 * - "2026.9.28~10.4"
 * - "2026/9/1" or "2026-09-01"
 */
export function parseAggregationDate(dateRaw: string): {
  monthKey: string;
  monthLabel: string;
  sortDateValue: number;
  sortEndValue: number;
} {
  const s = dateRaw.trim();
  // Match YYYY.M.D~E or YYYY/M/D~E or YYYY-M-D
  const match = s.match(
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s*[~〜～-]\s*(?:(\d{4})[./-])?(?:(\d{1,2})[./-])?(\d{1,2}))?/
  );

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const startDay = Number(match[3]);
    const endYear = match[4] ? Number(match[4]) : year;
    const endMonth = match[5] ? Number(match[5]) : month;
    const endDay = match[6] ? Number(match[6]) : startDay;

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthLabel = `${year}年${month}月`;
    const sortDateValue = year * 10000 + month * 100 + startDay;
    const sortEndValue = endYear * 10000 + endMonth * 100 + endDay;

    return { monthKey, monthLabel, sortDateValue, sortEndValue };
  }

  // Fallback for YYYY年M月 or YYYY-MM
  const ymMatch = s.match(/^(\d{4})[./年-](\d{1,2})/);
  if (ymMatch) {
    const year = Number(ymMatch[1]);
    const month = Number(ymMatch[2]);
    return {
      monthKey: `${year}-${String(month).padStart(2, '0')}`,
      monthLabel: `${year}年${month}月`,
      sortDateValue: year * 10000 + month * 100 + 1,
      sortEndValue: year * 10000 + month * 100 + 1,
    };
  }

  return {
    monthKey: 'unknown',
    monthLabel: '不明',
    sortDateValue: 99999999,
    sortEndValue: 99999999,
  };
}

const HEADER_ALIASES: Record<string, string[]> = {
  departmentCode: ['部署コード', 'dept_code', 'code'],
  departmentName: ['部署', '部署名', 'department'],
  id: ['ID', 'id', '求人ID', '案件ID'],
  dateLabel: ['集計日', '日付', '期間', 'date'],
  impressions: ['表示回数', 'impressions', 'imp'],
  ctr: ['クリック率', 'ctr'],
  clicks: ['クリック数', 'clicks'],
  applyStartRate: ['応募開始率', 'asr'],
  applyStarts: ['応募開始数', 'apply_starts'],
  applyCompletionRate: ['応募完了率', 'acr'],
  applications: ['応募数', 'applications', 'cv'],
  applyRate: ['応募率', 'cvr'],
  cpc: ['クリック単価', 'cpc'],
  cpas: ['応募開始単価', 'cpas'],
  cpa: ['応募単価', 'cpa'],
  spend: ['利用金額', '金額', '費用', 'cost', 'spend'],
};

/**
 * Converts a 2D array (from CSV or Google Sheets API) into normalized AdRecord[].
 */
export function parseGridToRecords(grid: string[][]): {
  records: AdRecord[];
  warnings: string[];
} {
  if (!grid || grid.length < 2) {
    return { records: [], warnings: ['データ行が見つかりませんでした。'] };
  }

  const headers = grid[0].map((h) => String(h ?? '').trim());
  const colIndex: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) =>
      aliases.some((alias) => h.toLowerCase() === alias.toLowerCase())
    );
    if (idx !== -1) {
      colIndex[field] = idx;
    }
  }

  const requiredFields = ['departmentName', 'id', 'dateLabel'];
  const missing = requiredFields.filter((f) => colIndex[f] === undefined);
  if (missing.length > 0) {
    return {
      records: [],
      warnings: [
        `必須列（部署・ID・集計日）が見つかりません。現在のヘッダー: ${headers.join(', ')}`,
      ],
    };
  }

  const records: AdRecord[] = [];
  const warnings: string[] = [];

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => !String(c ?? '').trim())) continue;

    const getCell = (field: string): string => {
      const idx = colIndex[field];
      return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
    };

    const departmentName = getCell('departmentName');
    const id = getCell('id');
    const dateLabel = getCell('dateLabel');

    if (!departmentName || !id || !dateLabel) {
      warnings.push(`${r + 1}行目: 部署・ID・集計日のいずれかが空のためスキップしました。`);
      continue;
    }

    const departmentCode = getCell('departmentCode') || '-';
    const parsedDate = parseAggregationDate(dateLabel);

    records.push({
      departmentCode,
      departmentName,
      id,
      dateLabel,
      monthKey: parsedDate.monthKey,
      monthLabel: parsedDate.monthLabel,
      sortDateValue: parsedDate.sortDateValue,
      sortEndValue: parsedDate.sortEndValue,
      impressions: parseNumericCell(getCell('impressions')),
      ctr: parseNumericCell(getCell('ctr')),
      clicks: parseNumericCell(getCell('clicks')),
      applyStartRate: parseNumericCell(getCell('applyStartRate')),
      applyStarts: parseNumericCell(getCell('applyStarts')),
      applyCompletionRate: parseNumericCell(getCell('applyCompletionRate')),
      applications: parseNumericCell(getCell('applications')),
      applyRate: parseNumericCell(getCell('applyRate')),
      cpc: parseNumericCell(getCell('cpc')),
      cpas: parseNumericCell(getCell('cpas')),
      cpa: parseNumericCell(getCell('cpa')),
      spend: parseNumericCell(getCell('spend')),
    });
  }

  records.sort((a, b) => {
    if (a.sortDateValue !== b.sortDateValue) return a.sortDateValue - b.sortDateValue;
    if (a.sortEndValue !== b.sortEndValue) return a.sortEndValue - b.sortEndValue;
    if (a.departmentCode !== b.departmentCode) return a.departmentCode.localeCompare(b.departmentCode);
    return a.id.localeCompare(b.id);
  });

  return { records, warnings };
}
