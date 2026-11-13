import React, { useState } from 'react';
import { RotateCcw, Upload, X } from 'lucide-react';
import { AdRecord } from '../types/analytics';
import { parseCsvToGrid, parseGridToRecords } from '../utils/csvParser';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (records: AdRecord[], label: string, warnings: string[]) => void;
  onResetDefault: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  onResetDefault,
}) => {
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const processCsvText = (text: string, sourceLabel: string) => {
    setError(null);
    const grid = parseCsvToGrid(text);
    const { records, warnings } = parseGridToRecords(grid);
    if (records.length === 0) {
      setError(warnings[0] || '有効なデータ行が見つかりませんでした。');
      return;
    }
    onImport(records, sourceLabel, warnings);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      processCsvText(content, file.name);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">CSVデータ読み込み</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:bg-slate-50 transition-colors">
              <Upload className="w-6 h-6 text-slate-400 mb-2" />
              <span className="text-xs font-medium text-slate-800">
                CSVファイルを選択してアップロード
              </span>
              <span className="text-[11px] text-slate-500 mt-1">
                UTF-8形式（部署コード, 部署, ID, 集計日, ... 利用金額）
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              またはCSVテキストを直接貼り付け
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={6}
              placeholder="部署コード,部署,ID,集計日,表示回数,クリック率,..."
              className="w-full text-xs font-mono-tabular border border-slate-200 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onResetDefault();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>初期データに戻す</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!csvText.trim()}
                onClick={() => processCsvText(csvText, '貼り付けCSVデータ')}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                読み込んで反映
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
