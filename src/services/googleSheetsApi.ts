import { AdRecord, MonthlySummaryRow, SpreadsheetMeta } from '../types/analytics';
import { clearAccessToken } from './googleSheetsAuth';

/**
 * Extracts spreadsheetId from either a full Google Sheets URL or raw spreadsheet ID.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

async function sheetsFetch(url: string, accessToken: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearAccessToken();
    throw new Error('認証の有効期限が切れました。再度Googleでサインインしてください。');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      errBody?.error?.message || `Google Sheets APIエラー (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return res.json();
}

/**
 * Fetches spreadsheet metadata including actual tab titles (never assumes "Sheet1").
 */
export async function fetchSpreadsheetMeta(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMeta> {
  const fields = encodeURIComponent(
    'properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))'
  );
  const data = await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${fields}`,
    accessToken
  );

  return {
    spreadsheetId,
    title: data.properties?.title ?? '名称未設定スプレッドシート',
    sheets: (data.sheets ?? []).map((s: any) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? '',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount,
    })),
  };
}

/**
 * Reads all values from the selected sheet tab.
 */
export async function fetchSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<string[][]> {
  const range = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'`);
  const data = await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    accessToken
  );
  return (data.values ?? []) as string[][];
}

function recordsToSheetMatrix(records: AdRecord[]): (string | number)[][] {
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

  const rows = records.map((r) => [
    r.departmentCode,
    r.departmentName,
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
  ]);

  return [header, ...rows];
}

function monthlyToSheetMatrix(summaries: MonthlySummaryRow[]): (string | number)[][] {
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

  const rows = summaries.map((r) => [
    r.monthLabel,
    r.departmentCode,
    r.departmentName,
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
  ]);

  return [header, ...rows];
}

/**
 * Creates a brand new Google Spreadsheet containing both period detail and monthly summary tabs.
 */
export async function createSpreadsheetReport(
  title: string,
  records: AdRecord[],
  monthlyRows: MonthlySummaryRow[],
  accessToken: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const created = await sheetsFetch('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: '集計日別データ' } },
        { properties: { title: '月単位集計' } },
      ],
    }),
  });

  const spreadsheetId = created.spreadsheetId as string;
  const spreadsheetUrl = created.spreadsheetUrl as string;

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'集計日別データ'!A1`,
            values: recordsToSheetMatrix(records),
          },
          {
            range: `'月単位集計'!A1`,
            values: monthlyToSheetMatrix(monthlyRows),
          },
        ],
      }),
    }
  );

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Writes monthly summary rows into a dedicated tab in an existing spreadsheet.
 * Creates the tab if it doesn't exist yet, clears it, and writes fresh values.
 */
export async function writeMonthlySummaryToSpreadsheet(
  meta: SpreadsheetMeta,
  targetTabTitle: string,
  monthlyRows: MonthlySummaryRow[],
  accessToken: string
): Promise<void> {
  const exists = meta.sheets.some((s) => s.title === targetTabTitle);
  if (!exists) {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(meta.spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: { title: targetTabTitle },
              },
            },
          ],
        }),
      }
    );
  } else {
    const clearRange = encodeURIComponent(`'${targetTabTitle.replace(/'/g, "''")}'`);
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(meta.spreadsheetId)}/values/${clearRange}:clear`,
      accessToken,
      { method: 'POST', body: JSON.stringify({}) }
    );
  }

  const updateRange = encodeURIComponent(`'${targetTabTitle.replace(/'/g, "''")}'!A1`);
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(meta.spreadsheetId)}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: monthlyToSheetMatrix(monthlyRows),
      }),
    }
  );
}
