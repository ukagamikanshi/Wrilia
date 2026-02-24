import { Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import useCharacterStore from '../../stores/characterStore';
import useMapStore from '../../stores/mapStore';

const COLOR_OPTIONS = {
    zinc: 'グレー',
    emerald: 'エメラルド',
    sky: '空色',
    amber: '琥珀',
    rose: 'ローズ',
    purple: '紫',
    pink: 'ピンク',
    indigo: '藍色',
    teal: 'ティール',
    orange: 'オレンジ',
};

export default function LocationDetail({ locationId, onClose, isModal = false }) {
    const characters = useCharacterStore((s) => s.characters);
    const { locations, updateLocation, deleteLocation } = useMapStore();
    const location = locations.find((l) => l.id === locationId);
    const autoSaveTimer = useRef(null);

    // Snapshot for cancel: save initial state when opening
    const snapshot = useRef(null);
    useEffect(() => {
        if (location && !snapshot.current) {
            snapshot.current = {
                name: location.name || '',
                variableName: location.variableName || '',
                detail: location.detail || '',
                color: location.color || 'emerald',
            };
        }
    }, [location?.id]);

    const [localFields, setLocalFields] = useState({
        name: location?.name || '',
        variableName: location?.variableName || '',
        detail: location?.detail || '',
    });

    useEffect(() => {
        if (location) {
            setLocalFields({
                name: location.name || '',
                variableName: location.variableName || '',
                detail: location.detail || '',
            });
            // Reset snapshot when location changes
            snapshot.current = {
                name: location.name || '',
                variableName: location.variableName || '',
                detail: location.detail || '',
                color: location.color || 'emerald',
            };
        }
    }, [location?.id]);

    // 変数名の重複チェック: 自分以外の場所・キャラクターと被っていないか確認
    const isVarNameDuplicate = (value) => {
        if (!value) return false;
        return (
            locations.some((l) => l.id !== locationId && l.variableName === value) ||
            characters.some((c) => c.variableName === value)
        );
    };

    const varNameError = isVarNameDuplicate(localFields.variableName) ? 'この変数名はすでに使用されています' : '';

    // Auto-save with debounce
    const autoSave = (key, value) => {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
            updateLocation(locationId, { [key]: value });
        }, 300);
    };

    const handleLocalChange = (key, value) => {
        setLocalFields((prev) => ({ ...prev, [key]: value }));
        // 変数名が重複する場合は DB に保存しない
        if (key === 'variableName' && isVarNameDuplicate(value)) return;
        autoSave(key, value);
    };

    // Cancel: revert to snapshot
    const handleCancel = useCallback(() => {
        if (snapshot.current) {
            clearTimeout(autoSaveTimer.current);
            updateLocation(locationId, snapshot.current);
        }
        onClose();
    }, [locationId, onClose, updateLocation]);

    // OK: flush pending saves and close
    const handleOk = useCallback(() => {
        // 変数名が重複している間は保存・クローズしない
        const isDup =
            !!localFields.variableName &&
            (locations.some((l) => l.id !== locationId && l.variableName === localFields.variableName) ||
                characters.some((c) => c.variableName === localFields.variableName));
        if (isDup) return;
        clearTimeout(autoSaveTimer.current);
        updateLocation(locationId, localFields);
        onClose();
    }, [locationId, localFields, onClose, updateLocation, locations, characters]);

    // Enter key handler (close with OK)
    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                handleOk();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, handleOk]);

    if (!location) return null;

    const content = (
        <div className={isModal ? 'char-detail-modal-content' : 'char-detail-sidebar'}>
            {/* Header */}
            <div className="char-detail-header">
                <h3 style={{ color: '#10b981' }}>場所詳細</h3>
                <button onClick={handleOk} className="char-detail-close">
                    <X size={16} />
                </button>
            </div>

            {/* Fields */}
            <div className="char-detail-fields">
                <div className="char-detail-field-row">
                    <div className="char-detail-field">
                        <label>場所名</label>
                        <input value={localFields.name} onChange={(e) => handleLocalChange('name', e.target.value)} />
                    </div>
                    <div className="char-detail-field">
                        <label>テーマカラー</label>
                        <select
                            value={location.color || 'emerald'}
                            onChange={(e) => updateLocation(locationId, { color: e.target.value })}
                        >
                            {Object.entries(COLOR_OPTIONS).map(([val, label]) => (
                                <option key={val} value={val}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="char-detail-field">
                    <label>変数名</label>
                    <input
                        value={localFields.variableName}
                        onChange={(e) => handleLocalChange('variableName', e.target.value)}
                        placeholder="city_name"
                        className={`font-mono${varNameError ? ' border-red-500 focus:border-red-500' : ''}`}
                    />
                    {varNameError && <p className="text-xs text-red-500 mt-0.5">{varNameError}</p>}
                </div>

                {/* Detail */}
                <div className="char-detail-section">
                    <label>詳細（文化・気候・歴史など）</label>
                    <textarea
                        value={localFields.detail}
                        onChange={(e) => handleLocalChange('detail', e.target.value)}
                        placeholder="この場所の文化、気候、歴史などを自由に記述..."
                        rows={6}
                    />
                </div>

                <button onClick={handleOk} disabled={!!varNameError} className="char-detail-ok-btn disabled:opacity-40 disabled:cursor-not-allowed">
                    OK
                </button>

                <button onClick={handleCancel} className="char-detail-cancel-btn">
                    キャンセル
                </button>

                <button
                    onClick={() => {
                        deleteLocation(locationId);
                        onClose();
                    }}
                    className="char-detail-delete-btn"
                >
                    <Trash2 size={14} /> この場所を削除
                </button>
            </div>
        </div>
    );

    if (isModal) {
        return (
            <div className="char-detail-modal-backdrop" onClick={handleOk}>
                <div onClick={(e) => e.stopPropagation()}>{content}</div>
            </div>
        );
    }

    return content;
}
