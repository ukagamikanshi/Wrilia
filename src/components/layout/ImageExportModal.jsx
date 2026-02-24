import { CheckSquare, Download, Image as ImageIcon, Map as MapIcon, Square, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import db from '../../db/database';
import useProjectStore from '../../stores/projectStore';
import HiddenGraphRenderer from '../export/HiddenGraphRenderer';

export default function ImageExportModal({ isOpen, onClose, exportMode = 'image' }) {
    const { currentProject } = useProjectStore();
    const [format, setFormat] = useState(exportMode === 'svg' ? 'svg' : 'png'); // 'png', 'jpeg', or 'svg'
    const [patterns, setPatterns] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [fileNames, setFileNames] = useState({});
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    useEffect(() => {
        if (!isOpen || !currentProject) return;

        const loadPatterns = async () => {
            const relPatterns = await db.relationPatterns.where('projectId').equals(currentProject.id).toArray();
            const mapPatterns = await db.mapPatterns.where('projectId').equals(currentProject.id).toArray();

            const combined = [
                ...relPatterns.map((p) => ({ ...p, _type: 'relation', _key: `relation-${p.id}` })),
                ...mapPatterns.map((p) => ({ ...p, _type: 'map', _key: `map-${p.id}` })),
            ].sort((a, b) => a.createdAt - b.createdAt);

            setPatterns(combined);

            // 初期ファイル名を設定
            const initialNames = {};
            combined.forEach((p) => {
                initialNames[p._key] = p.name;
            });
            setFileNames(initialNames);
            setSelectedIds(new Set()); // Default empty
            setExportProgress(0);
        };

        loadPatterns();
    }, [isOpen, currentProject]);

    if (!isOpen) return null;

    const toggleSelection = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === patterns.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(patterns.map((p) => p._key)));
        }
    };

    const handleNameChange = (id, newName) => {
        setFileNames((prev) => ({ ...prev, [id]: newName }));
    };

    const selectedPatterns = useMemo(() => {
        return patterns.filter((p) => selectedIds.has(p._key));
    }, [patterns, selectedIds]);

    const [directoryHandle, setDirectoryHandle] = useState(null);
    const [singleFileHandle, setSingleFileHandle] = useState(null);

    const handleExport = async () => {
        if (selectedIds.size === 0) return;

        if (selectedPatterns.length === 1) {
            // 1件: showSaveFilePicker でファイル名を指定
            const pattern = selectedPatterns[0];
            const name = fileNames[pattern._key] || pattern.name || 'export';
            const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;
            try {
                const fh = await window.showSaveFilePicker({
                    suggestedName: `${name}.${format}`,
                    types: [
                        { description: `${format.toUpperCase()} ファイル`, accept: { [mimeType]: [`.${format}`] } },
                    ],
                });
                setSingleFileHandle(fh);
                setDirectoryHandle(null);
            } catch (err) {
                if (err.name !== 'AbortError') console.error('ファイル選択に失敗しました:', err);
                return;
            }
        } else {
            // 複数件: showDirectoryPicker でフォルダを選択
            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                setDirectoryHandle(handle);
                setSingleFileHandle(null);
            } catch (error) {
                if (error.name !== 'AbortError') console.error('フォルダ選択に失敗しました:', error);
                return;
            }
        }

        setIsExporting(true);
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={!isExporting ? onClose : undefined}
        >
            <div
                className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-8 py-6 max-w-2xl w-full mx-4 animate-fade-in flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-accent-primary/10">
                            <ImageIcon size={24} className="text-accent-primary" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-text-primary mb-1">
                                {exportMode === 'svg' ? 'SVGとして書き出し' : '画像として書き出し'}
                            </h3>
                            <p className="text-xs text-text-muted">
                                {exportMode === 'svg'
                                    ? '人物相関図や地図をベクター画像（SVG）として保存します。'
                                    : '人物相関図や地図をPNG/JPEG画像として保存します。'}
                            </p>
                        </div>
                    </div>
                    {!isExporting && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-bg-hover rounded-xl text-text-muted transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                    {/* Format Selection - Only for Image Mode */}
                    {exportMode === 'image' && (
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-3">
                                画像フォーマット
                            </label>
                            <div className="flex gap-4">
                                <label
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-xl cursor-pointer transition-colors ${format === 'png' ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover'}`}
                                >
                                    <input
                                        type="radio"
                                        name="format"
                                        value="png"
                                        checked={format === 'png'}
                                        onChange={() => setFormat('png')}
                                        className="hidden"
                                    />
                                    <span className="font-medium">PNG</span>
                                </label>
                                <label
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-xl cursor-pointer transition-colors ${format === 'jpeg' ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover'}`}
                                >
                                    <input
                                        type="radio"
                                        name="format"
                                        value="jpeg"
                                        checked={format === 'jpeg'}
                                        onChange={() => setFormat('jpeg')}
                                        className="hidden"
                                    />
                                    <span className="font-medium">JPEG</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Pattern Selection List */}
                    <div>
                        <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
                            <label className="text-sm font-medium text-text-secondary">書き出すパターンを選択</label>
                            <button
                                onClick={toggleAll}
                                className="text-xs text-accent-primary hover:text-accent-secondary flex items-center gap-1"
                            >
                                {selectedIds.size === patterns.length ? (
                                    <Square size={14} />
                                ) : (
                                    <CheckSquare size={14} />
                                )}
                                {selectedIds.size === patterns.length ? '全選択解除' : 'すべて選択'}
                            </button>
                        </div>

                        {patterns.length === 0 ? (
                            <div className="text-center py-8 text-text-muted text-sm bg-bg-secondary rounded-xl border border-border">
                                書き出せるパターンがありません。
                                <br />
                                人物相関図や地図画面でパターンを作成してください。
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* 人物相関図 */}
                                {patterns.some((p) => p._type === 'relation') && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 px-1 flex items-center gap-2">
                                            <Users size={14} /> 人物相関図
                                        </h4>
                                        {patterns
                                            .filter((p) => p._type === 'relation')
                                            .map((p) => (
                                                <div
                                                    key={p._key}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedIds.has(p._key) ? 'border-accent-primary/50 bg-accent-primary/5' : 'border-border bg-bg-card hover:bg-bg-hover'}`}
                                                >
                                                    <button
                                                        onClick={() => toggleSelection(p._key)}
                                                        className={`p-1 rounded flex-shrink-0 ${selectedIds.has(p._key) ? 'text-accent-primary' : 'text-border hover:text-text-muted'}`}
                                                    >
                                                        {selectedIds.has(p._key) ? (
                                                            <CheckSquare size={20} />
                                                        ) : (
                                                            <Square size={20} />
                                                        )}
                                                    </button>

                                                    <div className="flex-1 flex items-center gap-2">
                                                        <input
                                                            value={fileNames[p._key] || ''}
                                                            onChange={(e) => handleNameChange(p._key, e.target.value)}
                                                            disabled={!selectedIds.has(p._key)}
                                                            className={`flex-1 min-w-0 bg-transparent border-b text-sm py-1 focus:outline-none focus:border-accent-primary ${selectedIds.has(p._key) ? 'border-border text-text-primary' : 'border-transparent text-text-muted cursor-not-allowed'}`}
                                                            placeholder="ファイル名"
                                                        />
                                                        <span className="text-xs text-text-muted flex-shrink-0">
                                                            .{format}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}

                                {/* 地図 */}
                                {patterns.some((p) => p._type === 'map') && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 px-1 flex items-center gap-2 mt-4">
                                            <MapIcon size={14} /> 地図
                                        </h4>
                                        {patterns
                                            .filter((p) => p._type === 'map')
                                            .map((p) => (
                                                <div
                                                    key={p._key}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedIds.has(p._key) ? 'border-accent-primary/50 bg-accent-primary/5' : 'border-border bg-bg-card hover:bg-bg-hover'}`}
                                                >
                                                    <button
                                                        onClick={() => toggleSelection(p._key)}
                                                        className={`p-1 rounded flex-shrink-0 ${selectedIds.has(p._key) ? 'text-accent-primary' : 'text-border hover:text-text-muted'}`}
                                                    >
                                                        {selectedIds.has(p._key) ? (
                                                            <CheckSquare size={20} />
                                                        ) : (
                                                            <Square size={20} />
                                                        )}
                                                    </button>

                                                    <div className="flex-1 flex items-center gap-2">
                                                        <input
                                                            value={fileNames[p._key] || ''}
                                                            onChange={(e) => handleNameChange(p._key, e.target.value)}
                                                            disabled={!selectedIds.has(p._key)}
                                                            className={`flex-1 min-w-0 bg-transparent border-b text-sm py-1 focus:outline-none focus:border-accent-primary ${selectedIds.has(p._key) ? 'border-border text-text-primary' : 'border-transparent text-text-muted cursor-not-allowed'}`}
                                                            placeholder="ファイル名"
                                                        />
                                                        <span className="text-xs text-text-muted flex-shrink-0">
                                                            .{format}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {isExporting && (
                    <div className="mt-6 mb-2">
                        <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                            <div
                                className="bg-accent-primary h-full transition-all duration-300"
                                style={{ width: `${(exportProgress / selectedIds.size) * 100}%` }}
                            />
                        </div>
                        <p className="text-xs text-center text-text-muted mt-2">
                            {exportProgress} / {selectedIds.size} 件を書き出し中...
                        </p>
                    </div>
                )}

                <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-border shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="px-5 py-2.5 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors disabled:opacity-50"
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={selectedIds.size === 0 || isExporting}
                        className="px-6 py-2.5 rounded-lg text-sm bg-accent-primary text-white hover:bg-accent-secondary transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        {isExporting ? (
                            <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        ) : (
                            <Download size={16} />
                        )}
                        {selectedIds.size}件を書き出し
                    </button>
                </div>

                {/* Hidden Graph Renderer Instance */}
                {isExporting && (
                    <HiddenGraphRenderer
                        project={currentProject}
                        patterns={selectedPatterns}
                        fileNames={fileNames}
                        format={format}
                        fileHandle={singleFileHandle}
                        directoryHandle={directoryHandle}
                        onProgress={(done) => setExportProgress(done)}
                        onComplete={() => {
                            setIsExporting(false);
                            setTimeout(() => {
                                alert(
                                    exportMode === 'svg'
                                        ? 'SVGの書き出しが完了しました。'
                                        : '画像書き出しが完了しました。',
                                );
                            }, 100);
                            onClose();
                        }}
                    />
                )}
            </div>
        </div>
    );
}
