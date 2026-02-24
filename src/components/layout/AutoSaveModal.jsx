import { AlertTriangle, FolderOpen, Save } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const intervals = [
    { value: 0, label: '自動保存しない' },
    { value: 1, label: '1分ごと' },
    { value: 5, label: '5分ごと' },
    { value: 10, label: '10分ごと' },
    { value: 15, label: '15分ごと' },
    { value: 30, label: '30分ごと' },
    { value: 60, label: '1時間ごと' },
];

const AutoSaveModal = ({ isOpen, onClose, onSave, initialInterval, initialHandle }) => {
    const [interval, setInterval] = useState(initialInterval || 0);
    const [directoryHandle, setDirectoryHandle] = useState(initialHandle || null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setInterval(initialInterval || 0);
            setDirectoryHandle(initialHandle || null);
        }
    }, [isOpen, initialInterval, initialHandle]);

    if (!isOpen) return null;

    const handleSelectDirectory = async () => {
        try {
            setError('');
            if (!window.showDirectoryPicker) {
                setError('お使いのブラウザはフォルダ選択に対応していません。');
                return;
            }
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setDirectoryHandle(handle);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Failed to select directory:', error);
            }
        }
    };

    const handleConfirm = () => {
        if (interval > 0 && !directoryHandle) {
            setError('自動保存を有効にするには、保存先フォルダを選択してください。');
            return;
        }
        setError('');
        onSave(interval, directoryHandle);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-10 py-8 max-w-md w-full mx-4 animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 rounded-xl bg-accent-primary/10">
                        <Save size={24} className="text-accent-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-text-primary">自動保存設定</h3>
                        <p className="text-xs text-text-muted mt-1">
                            作業中の作品を指定したフォルダに定期的に<br />バックアップします。
                        </p>
                    </div>
                </div>

                <div className="mb-6 bg-warning/10 border border-warning/20 rounded-lg p-4 text-sm text-text-secondary leading-relaxed space-y-2">
                    <p>
                        <span className="text-warning font-bold">重要:</span> 
                        <br />
                        Wriliaは <strong>「完全ローカル・ブラウザ上」</strong>で動作し、外部サーバー等との通信を行いません。
                        <br />
                        そのため手動で「保存（JSON）」を行う前にブラウザを閉じたりページを再読み込みすると、
                        <br />
                        <strong>編集中のデータはすべて消去されてしまいます。</strong>
                    </p>
                    <p>
                        データの消失を防ぐため、自動保存を有効にする
                        <br />
                        ことを推奨します。
                        <br />
                        <span className="text-text-muted">※Google Chrome・Microsoft Edgeのみ利用可能 </span>
                    </p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">自動保存の間隔</label>
                        <select
                            value={interval}
                            onChange={(e) => setInterval(Number(e.target.value))}
                            className="w-full px-4 py-2.5 rounded-lg bg-bg-card border border-border text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors cursor-pointer appearance-none"
                        >
                            {intervals.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div
                        className={`transition-opacity duration-200 ${interval === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                    >
                        <label className="block text-sm font-medium text-text-secondary mb-2">保存先フォルダ</label>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleSelectDirectory}
                                className="w-full px-4 py-3 border border-border rounded-lg bg-bg-secondary hover:bg-bg-hover flex items-center justify-center gap-2 transition-colors group"
                            >
                                <FolderOpen
                                    size={18}
                                    className="text-text-secondary group-hover:text-accent-primary transition-colors"
                                />
                                <span className="text-sm font-medium text-text-primary">
                                    {directoryHandle ? 'フォルダを変更する' : '保存先フォルダを選択'}
                                </span>
                            </button>
                            {directoryHandle ? (
                                <div className="text-xs px-2 py-1.5 bg-accent-primary/5 text-accent-primary rounded-md border border-accent-primary/20 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse shrink-0"></span>
                                    選択中: {directoryHandle.name}
                                </div>
                            ) : (
                                <div className="text-xs px-2 py-1 text-danger flex items-center gap-1.5">
                                    <AlertTriangle size={12} />
                                    <span>フォルダが選択されていません</span>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-text-secondary font-medium mt-2 leading-relaxed bg-bg-secondary p-2.5 rounded-lg border border-border">
                            ※
                            安全かつ確実に保存を行うため、PC内の大切なファイルが含まれる「ドキュメント」フォルダ等ではなく、
                            <strong>本アプリ専用の新しい空フォルダ（例：Wrilia_Data）を作成して指定する</strong>
                            ことを推奨します。
                            <br />
                            <span className="text-text-muted text-[11px] mt-1 block font-normal">
                                ※
                                ブラウザの仕様上、ページを再読み込みした場合は再度フォルダの自動保存許可操作が必要になります。
                            </span>
                        </p>
                        {error && (
                            <p className="text-sm text-danger mt-3 font-medium bg-danger/10 px-3 py-2 rounded-lg border border-danger/20">
                                {error}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors"
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-6 py-2.5 rounded-lg text-sm bg-accent-primary text-white hover:bg-accent-primary/80 transition-colors font-medium"
                    >
                        設定を保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AutoSaveModal;
