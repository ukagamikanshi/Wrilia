import { ImagePlus, Trash2, X } from 'lucide-react';
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

export default function CharacterDetail({ characterId, onClose, isModal = false }) {
    const { characters, updateCharacter, deleteCharacter } = useCharacterStore();
    const locations = useMapStore((s) => s.locations);
    const character = characters.find((c) => c.id === characterId);
    const fileInputRef = useRef(null);
    const autoSaveTimer = useRef(null);

    // Snapshot for cancel: save initial state when opening
    const snapshot = useRef(null);
    useEffect(() => {
        if (character && !snapshot.current) {
            snapshot.current = {
                name: character.name || '',
                variableName: character.variableName || '',
                detail: character.detail || '',
                color: character.color || 'zinc',
                gender: character.gender || '',
                image: character.image || null,
                profile: character.profile || '{}',
            };
        }
    }, [character?.id]);

    const [localChars, setLocalChars] = useState({
        name: character?.name || '',
        variableName: character?.variableName || '',
        detail: character?.detail || '',
    });
    const [localProfile, setLocalProfile] = useState({});

    useEffect(() => {
        if (character) {
            setLocalChars({
                name: character.name || '',
                variableName: character.variableName || '',
                detail: character.detail || '',
            });
            try {
                setLocalProfile(JSON.parse(character.profile || '{}'));
            } catch {
                setLocalProfile({});
            }
            // Reset snapshot when character changes
            snapshot.current = {
                name: character.name || '',
                variableName: character.variableName || '',
                detail: character.detail || '',
                color: character.color || 'zinc',
                gender: character.gender || '',
                image: character.image || null,
                profile: character.profile || '{}',
            };
        }
    }, [character?.id]);

    // 変数名の重複チェック: 自分以外のキャラクター・場所と被っていないか確認
    const isVarNameDuplicate = (value) => {
        if (!value) return false;
        return (
            characters.some((c) => c.id !== characterId && c.variableName === value) ||
            locations.some((l) => l.variableName === value)
        );
    };

    const varNameError = isVarNameDuplicate(localChars.variableName) ? 'この変数名はすでに使用されています' : '';

    // Auto-save with debounce
    const autoSave = (key, value) => {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
            updateCharacter(characterId, { [key]: value });
        }, 300);
    };

    const handleLocalChange = (key, value) => {
        setLocalChars((prev) => ({ ...prev, [key]: value }));
        // 変数名が重複する場合は DB に保存しない
        if (key === 'variableName' && isVarNameDuplicate(value)) return;
        autoSave(key, value);
    };

    const handleProfileChange = (key, value) => {
        const newProfile = { ...localProfile, [key]: value };
        setLocalProfile(newProfile);
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
            updateCharacter(characterId, { profile: JSON.stringify(newProfile) });
        }, 300);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            updateCharacter(characterId, { image: reader.result });
        };
        reader.readAsDataURL(file);
    };

    const addProfileField = () => {
        const key = prompt('フィールド名:');
        if (key) {
            const newProfile = { ...localProfile, [key]: '' };
            setLocalProfile(newProfile);
            updateCharacter(characterId, { profile: JSON.stringify(newProfile) });
        }
    };

    const deleteProfileField = (key) => {
        const newProfile = { ...localProfile };
        delete newProfile[key];
        setLocalProfile(newProfile);
        updateCharacter(characterId, { profile: JSON.stringify(newProfile) });
    };

    // Cancel: revert to snapshot
    const handleCancel = useCallback(() => {
        if (snapshot.current) {
            clearTimeout(autoSaveTimer.current);
            updateCharacter(characterId, snapshot.current);
        }
        onClose();
    }, [characterId, onClose, updateCharacter]);

    // OK: flush pending saves and close
    const handleOk = useCallback(() => {
        // 変数名が重複している間は保存・クローズしない
        const isDup =
            !!localChars.variableName &&
            (characters.some((c) => c.id !== characterId && c.variableName === localChars.variableName) ||
                locations.some((l) => l.variableName === localChars.variableName));
        if (isDup) return;
        clearTimeout(autoSaveTimer.current);
        updateCharacter(characterId, {
            ...localChars,
            profile: JSON.stringify(localProfile),
        });
        onClose();
    }, [characterId, localChars, localProfile, onClose, updateCharacter, characters, locations]);

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

    if (!character) return null;

    const content = (
        <div className={isModal ? 'char-detail-modal-content' : 'char-detail-sidebar'}>
            {/* Header */}
            <div className="char-detail-header">
                <h3>人物詳細</h3>
                <button onClick={handleOk} className="char-detail-close">
                    <X size={16} />
                </button>
            </div>

            {/* Image */}
            <div className="char-detail-image-section">
                <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                />
                <div onClick={() => fileInputRef.current?.click()} className="char-detail-image-upload">
                    {character.image ? (
                        <>
                            <img src={character.image} alt="character" />
                            <div className="char-detail-image-overlay">
                                <span>変更</span>
                            </div>
                        </>
                    ) : (
                        <div className="char-detail-image-placeholder">
                            <ImagePlus size={28} />
                            <span>画像登録</span>
                        </div>
                    )}
                </div>
                {character.image && (
                    <button
                        onClick={() => updateCharacter(characterId, { image: null })}
                        className="char-detail-image-remove"
                    >
                        画像を削除
                    </button>
                )}
            </div>

            {/* Fields */}
            <div className="char-detail-fields">
                <div className="char-detail-field">
                    <label>名前</label>
                    <input value={localChars.name} onChange={(e) => handleLocalChange('name', e.target.value)} />
                </div>
                <div className="char-detail-field-row">
                    <div className="char-detail-field">
                        <label>テーマカラー</label>
                        <select
                            value={character.color || 'zinc'}
                            onChange={(e) => updateCharacter(characterId, { color: e.target.value })}
                        >
                            {Object.entries(COLOR_OPTIONS).map(([val, label]) => (
                                <option key={val} value={val}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="char-detail-field">
                        <label>性別</label>
                        <select
                            value={character.gender || ''}
                            onChange={(e) => updateCharacter(characterId, { gender: e.target.value })}
                        >
                            <option value="">未設定</option>
                            <option value="男">男</option>
                            <option value="女">女</option>
                            <option value="その他">その他</option>
                        </select>
                    </div>
                </div>
                <div className="char-detail-field">
                    <label>変数名</label>
                    <input
                        value={localChars.variableName}
                        onChange={(e) => handleLocalChange('variableName', e.target.value)}
                        placeholder="hero_name"
                        className={`font-mono${varNameError ? ' border-red-500 focus:border-red-500' : ''}`}
                    />
                    {varNameError && <p className="text-xs text-red-500 mt-0.5">{varNameError}</p>}
                </div>

                {/* Profile fields */}
                <div className="char-detail-section">
                    <div className="char-detail-section-header">
                        <label>プロフィール</label>
                        <button onClick={addProfileField} className="char-detail-add-field">
                            + 追加
                        </button>
                    </div>
                    {Object.entries(localProfile).map(([key, value]) => (
                        <div key={key} className="char-detail-profile-field">
                            <div className="char-detail-profile-header">
                                <span>{key}</span>
                                <button onClick={() => deleteProfileField(key)} className="char-detail-profile-delete">
                                    削除
                                </button>
                            </div>
                            <input value={value} onChange={(e) => handleProfileChange(key, e.target.value)} />
                        </div>
                    ))}
                </div>

                {/* Detail */}
                <div className="char-detail-section">
                    <label>詳細・背景</label>
                    <textarea
                        value={localChars.detail}
                        onChange={(e) => handleLocalChange('detail', e.target.value)}
                        placeholder="キャラクターの背景や詳細設定..."
                        rows={5}
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
                        deleteCharacter(characterId);
                        onClose();
                    }}
                    className="char-detail-delete-btn"
                >
                    <Trash2 size={14} /> この人物を削除
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
