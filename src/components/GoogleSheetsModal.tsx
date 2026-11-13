import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  AdRecord,
  MonthlySummaryRow,
  SpreadsheetMeta,
} from '../types/analytics';
import {
  createSpreadsheetReport,
  extractSpreadsheetId,
  fetchSpreadsheetMeta,
  fetchSheetValues,
  writeMonthlySummaryToSpreadsheet,
} from '../services/googleSheetsApi';
import { googleSignIn, logoutGoogle } from '../services/googleSheetsAuth';
import { parseGridToRecords } from '../utils/csvParser';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  initialTab?: 'import' | 'export';
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  needsAuth: boolean;
  onAuthUpdated: (user: User | null, token: string | null) => void;
  records: AdRecord[];
  monthlyRowsToExport: MonthlySummaryRow[];
  exportGranularityLabel: string;
  onImportSuccess: (
    records: AdRecord[],
    meta: SpreadsheetMeta,
    sheetTitle: string,
    warnings: string[]
  ) => void;
}

type PendingConfirmation =
  | {
      mode: 'create-new';
      spreadsheetTitle: string;
      detailCount: number;
      monthlyCount: number;
    }
  | {
      mode: 'update-existing';
      spreadsheetId: string;
      spreadsheetTitle: string;
      targetTabTitle: string;
      tabExists: boolean;
      monthlyCount: number;
    };

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  initialTab = 'import',
  onClose,
  user,
  accessToken,
  needsAuth,
  onAuthUpdated,
  records,
  monthlyRowsToExport,
  exportGranularityLabel,
  onImportSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>(initialTab);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [loadedMeta, setLoadedMeta] = useState<SpreadsheetMeta | null>(null);
  const [selectedSheetTitle, setSelectedSheetTitle] = useState('');
  const [newSpreadsheetTitle, setNewSpreadsheetTitle] = useState(
    `採用広告集計レポート_${new Date().toISOString().slice(0, 10)}`
  );
  const [exportTabTitle, setExportTabTitle] = useState('月単位集計');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    url?: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setSuccessInfo(null);
      setPendingConfirm(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        onAuthUpdated(res.user, res.accessToken);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Googleサインインに失敗しました。');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutGoogle();
    onAuthUpdated(null, null);
    setLoadedMeta(null);
    setSelectedSheetTitle('');
  };

  const handleFetchMeta = async () => {
    if (!accessToken) {
      setErrorMsg('先にGoogleアカウントでサインインしてください。');
      return;
    }
    const id = extractSpreadsheetId(sheetUrlInput);
    if (!id) {
      setErrorMsg('GoogleスプレッドシートのURLまたはIDを入力してください。');
      return;
    }

    setIsBusy(true);
    setErrorMsg(null);
    setSuccessInfo(null);
    try {
      const meta = await fetchSpreadsheetMeta(id, accessToken);
      setLoadedMeta(meta);
      if (meta.sheets.length > 0) {
        setSelectedSheetTitle(meta.sheets[0].title);
      } else {
        setSelectedSheetTitle('');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'スプレッドシート情報の取得に失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadValues = async () => {
    if (!accessToken || !loadedMeta || !selectedSheetTitle) return;
    setIsBusy(true);
    setErrorMsg(null);
    setSuccessInfo(null);
    try {
      const values = await fetchSheetValues(
        loadedMeta.spreadsheetId,
        selectedSheetTitle,
        accessToken
      );
      const { records: parsed, warnings } = parseGridToRecords(values);
      if (parsed.length === 0) {
        setErrorMsg(
          warnings[0] ||
            '有効な集計データ行が見つかりませんでした。ヘッダー行（部署・ID・集計日等）をご確認ください。'
        );
        return;
      }
      onImportSuccess(parsed, loadedMeta, selectedSheetTitle, warnings);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'シートデータの読み込みに失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const requestCreateNewExport = () => {
    if (!accessToken) {
      setErrorMsg('先にGoogleアカウントでサインインしてください。');
      return;
    }
    const trimmed = newSpreadsheetTitle.trim() || '採用広告集計レポート';
    setPendingConfirm({
      mode: 'create-new',
      spreadsheetTitle: trimmed,
      detailCount: records.length,
      monthlyCount: monthlyRowsToExport.length,
    });
  };

  const requestUpdateExistingExport = () => {
    if (!accessToken || !loadedMeta) return;
    const trimmedTab = exportTabTitle.trim() || '月単位集計';
    const tabExists = loadedMeta.sheets.some((s) => s.title === trimmedTab);
    setPendingConfirm({
      mode: 'update-existing',
      spreadsheetId: loadedMeta.spreadsheetId,
      spreadsheetTitle: loadedMeta.title,
      targetTabTitle: trimmedTab,
      tabExists,
      monthlyCount: monthlyRowsToExport.length,
    });
  };

  const executeConfirmedWrite = async () => {
    if (!pendingConfirm || !accessToken) return;
    const confirmation = pendingConfirm;
    setPendingConfirm(null);
    setIsBusy(true);
    setErrorMsg(null);
    setSuccessInfo(null);

    try {
      if (confirmation.mode === 'create-new') {
        const created = await createSpreadsheetReport(
          confirmation.spreadsheetTitle,
          records,
          monthlyRowsToExport,
          accessToken
        );
        setSuccessInfo({
          message: `新しいスプレッドシート「${confirmation.spreadsheetTitle}」を作成し、集計日別データ(${confirmation.detailCount}行)と月単位集計(${confirmation.monthlyCount}行)を書き出しました。`,
          url: created.spreadsheetUrl,
        });
      } else {
        await writeMonthlySummaryToSpreadsheet(
          loadedMeta!,
          confirmation.targetTabTitle,
          monthlyRowsToExport,
          accessToken
        );
        const refreshed = await fetchSpreadsheetMeta(loadedMeta!.spreadsheetId, accessToken);
        setLoadedMeta(refreshed);
        setSuccessInfo({
          message: `スプレッドシート「${confirmation.spreadsheetTitle}」の「${confirmation.targetTabTitle}」タブに月単位集計(${confirmation.monthlyCount}行)を書き込みました。`,
          url: `https://docs.google.com/spreadsheets/d/${confirmation.spreadsheetId}`,
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google Sheetsへの書き込みに失敗しました。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">Google Sheets 連携</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Google Auth Section */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            {needsAuth || !accessToken ? (
              <>
                <div className="text-xs text-slate-600">
                  Google Sheetsのデータを読み込み・書き出しするには、Googleアカウントでサインインしてください。
                </div>
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'サインイン中...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </>
            ) : (
              <>
                <div className="text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">
                    {user?.displayName || 'Googleアカウント接続済み'}
                  </div>
                  <div className="text-slate-500 mt-0.5">{user?.email}</div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>サインアウト</span>
                </button>
              </>
            )}
          </div>

          {/* Mode Tabs */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'import'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              スプレッドシートから読み込み
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'export'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              集計結果をスプレッドシートへ書き出し
            </button>
          </div>

          {/* Error & Success banners */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {successInfo && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{successInfo.message}</span>
              </div>
              {successInfo.url && (
                <div>
                  <a
                    href={successInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-emerald-800 underline hover:text-emerald-950"
                  >
                    <span>Google Sheetsで開く</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Confirmation Dialog for Mutating / Creating Spreadsheets */}
          {pendingConfirm && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-md space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 space-y-1.5">
                  <div className="font-semibold text-sm">
                    Google Sheetsへの書き出し確認
                  </div>
                  {pendingConfirm.mode === 'create-new' ? (
                    <p>
                      新規スプレッドシート「<strong>{pendingConfirm.spreadsheetTitle}</strong>」を作成し、
                      「集計日別データ」（<span className="font-mono-tabular">{pendingConfirm.detailCount}</span>行）および
                      「月単位集計」（<span className="font-mono-tabular">{pendingConfirm.monthlyCount}</span>行）を書き込みます。よろしいですか？
                    </p>
                  ) : (
                    <p>
                      スプレッドシート「<strong>{pendingConfirm.spreadsheetTitle}</strong>」の
                      「<strong>{pendingConfirm.targetTabTitle}</strong>」タブ
                      {pendingConfirm.tabExists
                        ? 'の既存データをクリアして上書き更新します'
                        : 'を新規追加して書き込みます'}
                      （月単位集計 <span className="font-mono-tabular">{pendingConfirm.monthlyCount}</span>行）。よろしいですか？
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={executeConfirmedWrite}
                  disabled={isBusy}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isBusy ? '書き込み中...' : '確認して書き出す'}
                </button>
              </div>
            </div>
          )}

          {/* Import Panel */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Google スプレッドシート URL または スプレッドシートID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 text-xs border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleFetchMeta}
                    disabled={isBusy || !accessToken}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                    <span>シート一覧を取得</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  「部署コード, 部署, ID, 集計日, 表示回数, クリック率, ... 利用金額」のヘッダーを含むシートを読み込みます。
                </p>
              </div>

              {loadedMeta && (
                <div className="p-4 border border-slate-200 rounded-md space-y-3 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500">スプレッドシート名</div>
                      <div className="text-sm font-semibold text-slate-900">{loadedMeta.title}</div>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-slate-500">
                      {loadedMeta.sheets.length} タブ
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      読み込むシートタブを選択
                    </label>
                    <select
                      value={selectedSheetTitle}
                      onChange={(e) => setSelectedSheetTitle(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-800"
                    >
                      {loadedMeta.sheets.map((s) => (
                        <option key={s.sheetId} value={s.title}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleLoadValues}
                      disabled={isBusy || !selectedSheetTitle}
                      className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isBusy ? '読み込み中...' : 'このシートをグラフに反映'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Export Panel */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 border border-slate-200 rounded-md space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    新規Googleスプレッドシートを作成して書き出し
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    現在の表示データ（明細 <span className="font-mono-tabular">{records.length}</span>件）と
                    月単位集計（{exportGranularityLabel}・<span className="font-mono-tabular">{monthlyRowsToExport.length}</span>行）を2つのタブに出力します。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newSpreadsheetTitle}
                    onChange={(e) => setNewSpreadsheetTitle(e.target.value)}
                    placeholder="新しいスプレッドシート名"
                    className="flex-1 min-w-[200px] text-xs border border-slate-200 rounded-md px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={requestCreateNewExport}
                    disabled={isBusy || !accessToken || records.length === 0}
                    className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    新規作成して書き出し
                  </button>
                </div>
              </div>

              {loadedMeta && (
                <div className="p-4 border border-slate-200 rounded-md space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      読み込み済みスプレッドシートへ月単位集計を追加・更新
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      対象: <strong>{loadedMeta.title}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={exportTabTitle}
                      onChange={(e) => setExportTabTitle(e.target.value)}
                      placeholder="書き出し先タブ名（例: 月単位集計）"
                      className="flex-1 min-w-[180px] text-xs border border-slate-200 rounded-md px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={requestUpdateExistingExport}
                      disabled={isBusy || !accessToken || monthlyRowsToExport.length === 0}
                      className="px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      指定タブに書き込む
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
