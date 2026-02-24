import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus, StickyNote, Tag, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import useProjectStore from '../../stores/projectStore';
import useSettingStore from '../../stores/settingStore';

// ── Confirm Modal ──
function ConfirmModal({ message, onConfirm, onCancel }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div
                className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-10 py-8 max-w-md w-full mx-4 animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-full bg-danger/10">
                        <AlertTriangle size={26} className="text-danger" />
                    </div>
                    <h3 className="text-lg font-bold text-text-primary">削除の確認</h3>
                </div>
                <p className="text-sm text-text-secondary mb-8 leading-relaxed pl-1">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2.5 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors"
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2.5 rounded-lg text-sm bg-danger text-white hover:bg-danger/80 transition-colors font-medium"
                    >
                        削除
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SettingsManager() {
    const {
        settings,
        categories,
        loadSettings,
        addSetting,
        updateSetting,
        deleteSetting,
        deleteCategory,
        renameCategory,
    } = useSettingStore();
    const { currentProject } = useProjectStore();
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedSettingId, setSelectedSettingId] = useState(null);
    const [newCategory, setNewCategory] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [editingCategoryName, setEditingCategoryName] = useState('');
    const [confirmAction, setConfirmAction] = useState(null); // { message, action }
    const autoSaveTimer = useRef(null);

    // Local state for editing (debounced save)
    const [localTitle, setLocalTitle] = useState('');
    const [localMemo, setLocalMemo] = useState('');
    const [localFields, setLocalFields] = useState([]);

    useEffect(() => {
        if (currentProject) loadSettings(currentProject.id);
    }, [currentProject]);

    const selectedSetting = settings.find((s) => s.id === selectedSettingId);

    // Sync local state when selection changes
    useEffect(() => {
        if (selectedSetting) {
            setLocalTitle(selectedSetting.title || '');
            setLocalMemo(selectedSetting.memo || '');
            try {
                setLocalFields(JSON.parse(selectedSetting.fields || '[]'));
            } catch {
                setLocalFields([]);
            }
        }
    }, [selectedSettingId, selectedSetting?.id]);

    // Debounced auto-save helper
    const debouncedSave = useCallback(
        (id, updates) => {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = setTimeout(() => {
                updateSetting(id, { ...updates, updatedAt: Date.now() });
            }, 400);
        },
        [updateSetting],
    );

    const handleTitleChange = (value) => {
        setLocalTitle(value);
        if (selectedSettingId) debouncedSave(selectedSettingId, { title: value });
    };

    const handleMemoChange = (value) => {
        setLocalMemo(value);
        if (selectedSettingId) debouncedSave(selectedSettingId, { memo: value });
    };

    const handleAddCategory = async () => {
        const name = newCategory.trim();
        if (!name || !currentProject) return;
        const id = await addSetting(currentProject.id, name, '新しいメモ');
        setNewCategory('');
        setSelectedCategory(name);
        setSelectedSettingId(id);
    };

    const handleAddSetting = async () => {
        if (!currentProject || !selectedCategory) return;
        const id = await addSetting(currentProject.id, selectedCategory, '新しいメモ');
        setSelectedSettingId(id);
    };

    const handleDeleteCategory = (cat) => {
        if (!currentProject) return;
        setConfirmAction({
            message: `カテゴリ「${cat}」内のすべてのメモが削除されます。よろしいですか？`,
            action: async () => {
                await deleteCategory(currentProject.id, cat);
                if (selectedCategory === cat) {
                    setSelectedCategory(null);
                    setSelectedSettingId(null);
                }
            },
        });
    };

    const handleRenameCategory = async (oldName) => {
        const newName = editingCategoryName.trim();
        if (!newName || !currentProject || newName === oldName) {
            setEditingCategory(null);
            return;
        }
        await renameCategory(currentProject.id, oldName, newName);
        if (selectedCategory === oldName) setSelectedCategory(newName);
        setEditingCategory(null);
    };

    const handleDeleteSetting = () => {
        if (!selectedSetting) return;
        setConfirmAction({
            message: `「${selectedSetting.title}」を削除しますか？`,
            action: () => {
                deleteSetting(selectedSetting.id);
                setSelectedSettingId(null);
            },
        });
    };

    // ── Field editing (all local, debounced save) ──
    const updateFieldLocal = (index, key, value) => {
        const updated = localFields.map((f, i) => (i === index ? { ...f, [key]: value } : f));
        setLocalFields(updated);
        if (selectedSettingId) debouncedSave(selectedSettingId, { fields: JSON.stringify(updated) });
    };

    const addField = () => {
        const updated = [...localFields, { key: '項目名', value: '' }];
        setLocalFields(updated);
        if (selectedSettingId)
            updateSetting(selectedSettingId, { fields: JSON.stringify(updated), updatedAt: Date.now() });
    };

    const removeField = (index) => {
        const updated = localFields.filter((_, i) => i !== index);
        setLocalFields(updated);
        if (selectedSettingId)
            updateSetting(selectedSettingId, { fields: JSON.stringify(updated), updatedAt: Date.now() });
    };

    if (!currentProject) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted">
                <p>プロジェクトを選択してください</p>
            </div>
        );
    }

    return (
        <div className="h-full flex">
            {/* カテゴリ・設定リスト */}
            <div className="w-72 border-r border-border flex flex-col bg-bg-secondary/50">
                <div className="p-3 border-b border-border">
                    <h2 className="text-lg font-bold bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent mb-3">
                        設定管理
                    </h2>
                    <div className="flex gap-1">
                        <input
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                            placeholder="新しいカテゴリ名..."
                            className="flex-1 px-3 py-2 rounded bg-bg-card border border-border text-sm focus:outline-none focus:border-accent-primary"
                        />
                        <button
                            onClick={handleAddCategory}
                            className="px-3 py-2 rounded text-sm bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/20 transition-colors font-medium whitespace-nowrap"
                        >
                            追加
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {categories.map((cat) => {
                        const catSettings = settings.filter((s) => s.category === cat);
                        const isEditing = editingCategory === cat;
                        return (
                            <div key={cat}>
                                <div className="flex items-center group">
                                    {isEditing ? (
                                        <div className="flex-1 flex items-center gap-1 px-2 py-1.5">
                                            <input
                                                value={editingCategoryName}
                                                onChange={(e) => setEditingCategoryName(e.target.value)}
                                                onBlur={() => handleRenameCategory(cat)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameCategory(cat);
                                                    if (e.key === 'Escape') setEditingCategory(null);
                                                }}
                                                autoFocus
                                                className="flex-1 px-2 py-0.5 rounded bg-bg-card border border-accent-primary text-sm focus:outline-none"
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                                            className={`flex-1 flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${selectedCategory === cat ? 'bg-accent-primary/15 text-accent-secondary font-medium' : 'hover:bg-bg-hover text-text-secondary'}`}
                                        >
                                            {selectedCategory === cat ? (
                                                <ChevronDown size={14} />
                                            ) : (
                                                <ChevronRight size={14} />
                                            )}
                                            <Tag size={14} />
                                            <span className="font-medium truncate">{cat}</span>
                                            <span className="ml-auto text-text-muted text-xs">
                                                {catSettings.length}
                                            </span>
                                        </button>
                                    )}
                                    {!isEditing && (
                                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 pr-1 transition-opacity">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingCategory(cat);
                                                    setEditingCategoryName(cat);
                                                }}
                                                className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
                                                title="名前変更"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteCategory(cat);
                                                }}
                                                className="p-1 rounded hover:bg-danger/10 text-text-muted hover:text-danger"
                                                title="カテゴリ削除"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {selectedCategory === cat && (
                                    <div className="pl-6 space-y-0.5 mt-0.5">
                                        {catSettings.map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() => setSelectedSettingId(s.id)}
                                                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${selectedSettingId === s.id ? 'bg-accent-primary/15 text-accent-secondary font-medium' : 'hover:bg-bg-hover text-text-muted'}`}
                                            >
                                                <StickyNote size={12} className="inline mr-1.5 opacity-50" />
                                                {s.title}
                                            </button>
                                        ))}
                                        <button
                                            onClick={handleAddSetting}
                                            className="w-full text-left px-3 py-1.5 rounded text-sm text-text-muted hover:text-accent-secondary hover:bg-bg-hover transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={12} /> メモ追加
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {categories.length === 0 && (
                        <div className="text-text-muted text-sm text-center py-8 px-4">
                            <StickyNote size={32} className="mx-auto mb-3 opacity-20" />
                            <p className="mb-2">カテゴリを作成してください</p>
                            <p className="text-xs opacity-70">例: 世界観、アイテム、魔法体系</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 設定詳細 */}
            <div className="flex-1 overflow-y-auto">
                {selectedSetting ? (
                    <div className="p-6 max-w-3xl mx-auto animate-fade-in h-full flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <input
                                value={localTitle}
                                onChange={(e) => handleTitleChange(e.target.value)}
                                className="flex-1 text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-border focus:border-accent-primary focus:outline-none transition-colors py-1"
                                placeholder="タイトルを入力..."
                            />
                            <button
                                onClick={handleDeleteSetting}
                                className="p-2 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                title="このメモを削除"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        {/* 日時情報 */}
                        <div className="flex items-center gap-4 mb-6 text-xs text-text-muted">
                            <span>作成: {formatDate(selectedSetting.createdAt)}</span>
                            {selectedSetting.updatedAt && <span>更新: {formatDate(selectedSetting.updatedAt)}</span>}
                        </div>

                        {/* カスタムフィールド */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                    <Tag size={14} /> カスタムフィールド
                                </h3>
                                <button
                                    onClick={addField}
                                    className="px-3 py-1.5 rounded text-sm bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/20 transition-colors flex items-center gap-1"
                                >
                                    <Plus size={14} /> 項目追加
                                </button>
                            </div>
                            <div className="space-y-2">
                                {localFields.map((field, i) => (
                                    <div key={i} className="flex items-center gap-2 group">
                                        <input
                                            value={field.key}
                                            onChange={(e) => updateFieldLocal(i, 'key', e.target.value)}
                                            className="w-36 shrink-0 px-3 py-2 rounded bg-bg-card border border-border text-sm font-medium focus:outline-none focus:border-accent-primary"
                                            placeholder="項目名"
                                        />
                                        <input
                                            value={field.value}
                                            onChange={(e) => updateFieldLocal(i, 'value', e.target.value)}
                                            className="flex-1 px-3 py-2 rounded bg-bg-card border border-border text-sm focus:outline-none focus:border-accent-primary"
                                            placeholder="値"
                                        />
                                        <button
                                            onClick={() => removeField(i)}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-danger transition-all"
                                            title="削除"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* メモ */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2 mb-3 shrink-0">
                                <StickyNote size={14} /> メモ
                            </h3>
                            <textarea
                                value={localMemo}
                                onChange={(e) => handleMemoChange(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-accent-primary resize-none flex-1 leading-relaxed"
                                placeholder="自由にメモを記述..."
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-text-muted">
                        <div className="text-center">
                            <StickyNote size={48} className="mx-auto mb-3 opacity-20" />
                            <p className="text-sm">左のリストからメモを選択してください</p>
                        </div>
                    </div>
                )}
            </div>

            {/* 削除確認モーダル */}
            {confirmAction && (
                <ConfirmModal
                    message={confirmAction.message}
                    onConfirm={() => {
                        confirmAction.action();
                        setConfirmAction(null);
                    }}
                    onCancel={() => setConfirmAction(null)}
                />
            )}
        </div>
    );
}
