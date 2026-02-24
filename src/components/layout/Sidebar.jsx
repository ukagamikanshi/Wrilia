import encoding from 'encoding-japanese';
import {
    AlertTriangle,
    BookOpen,
    FileDown,
    FileText,
    FileUp,
    FolderOpen,
    HelpCircle,
    Image as ImageIcon,
    Map as MapIcon,
    PenTool,
    Save,
    Settings,
    Upload,
    Users,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import db from '../../db/database';
import useNovelStore from '../../stores/novelStore';
import useProjectStore from '../../stores/projectStore';
import { convertEmphasisForExport, resolveVariables } from '../../utils/textProcessing';
import AutoSaveModal from './AutoSaveModal';
import ImageExportModal from './ImageExportModal';

const navItems = [
    { path: '/novel', icon: PenTool, label: '小説執筆' },
    { path: '/plot', icon: BookOpen, label: 'プロット' },
    { path: '/characters', icon: Users, label: '人物相関図' },
    { path: '/map', icon: MapIcon, label: '地図' },
    { path: '/settings', icon: Settings, label: '設定管理' },
];

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(true);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // { type: 'create' | 'open', data?: any }
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportEncoding, setExportEncoding] = useState('UTF8'); // 'UTF8' or 'SJIS'
    const [exportChapters, setExportChapters] = useState([]);
    const [selectedExportIds, setSelectedExportIds] = useState(new Set());
    const [exportFileName, setExportFileName] = useState('');
    const [exportIncludeNovel, setExportIncludeNovel] = useState(true);
    const [exportIncludePlot, setExportIncludePlot] = useState(false);
    const [exportIncludeSettings, setExportIncludeSettings] = useState(false);
    const [exportIncludeCharacters, setExportIncludeCharacters] = useState(false);
    const [exportIncludeLocations, setExportIncludeLocations] = useState(false);
    const [exportRelationPatterns, setExportRelationPatterns] = useState([]);
    const [exportMapPatterns, setExportMapPatterns] = useState([]);
    const [selectedExportRelationPatternIds, setSelectedExportRelationPatternIds] = useState(new Set());
    const [selectedExportMapPatternIds, setSelectedExportMapPatternIds] = useState(new Set());
    const [convertEmphasis, setConvertEmphasis] = useState(false);
    const [novelExportFilter, setNovelExportFilter] = useState('all'); // 'all' | 'dialogue' | 'narration'
    const [showImageExportModal, setShowImageExportModal] = useState(false);
    const [showSvgExportModal, setShowSvgExportModal] = useState(false);
    const [showAutoSaveModal, setShowAutoSaveModal] = useState(false);
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [permissionHandle, setPermissionHandle] = useState(null);
    const [saveFileHandle, setSaveFileHandle] = useState(null);
    const fileInputRef = useRef(null);
    const textImportRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const {
        currentProject,
        createProject,
        importProject,
        closeProject,
        autoSaveInterval,
        lastAutoSave,
        directoryHandle,
        setAutoSaveConfig,
        triggerAutoSave,
    } = useProjectStore();
    const { loadChapters } = useNovelStore();

    // プロジェクトが切り替わったら保存先ファイルハンドルをリセット
    useEffect(() => {
        setSaveFileHandle(null);
    }, [currentProject?.id]);

    useEffect(() => {
        if (!currentProject || autoSaveInterval === 0 || !directoryHandle) return;
        if (showPermissionModal) return; // Pause auto-save if waiting for permission

        const intervalId = setInterval(
            async () => {
                const result = await triggerAutoSave();
                if (result?.needsPermission) {
                    setPermissionHandle(result.directoryHandle);
                    setShowPermissionModal(true);
                }
            },
            autoSaveInterval * 60 * 1000,
        );

        return () => clearInterval(intervalId);
    }, [currentProject, autoSaveInterval, directoryHandle, triggerAutoSave, showPermissionModal]);

    const handleTextImport = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length || !currentProject) return;

        setIsImporting(true);
        try {
            for (const file of files) {
                // エンコーディングを自動検出して Unicode に変換（SJIS 対応）
                const buffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(buffer);
                const detected = encoding.detect(uint8Array) || 'UTF8';
                const unicodeArray = encoding.convert(uint8Array, { to: 'UNICODE', from: detected });
                const text = encoding.codeToString(unicodeArray);

                // ファイル名から拡張子を除いた名前を「話」のタイトルにする
                const title = file.name.replace(/\.[^.]+$/, '');

                // 章の order を計算して DB に直接追加（ID を取得するため）
                const siblings = await db.chapters
                    .where('projectId')
                    .equals(currentProject.id)
                    .filter((c) => c.parentId === null)
                    .toArray();
                const chapterId = await db.chapters.add({
                    projectId: currentProject.id,
                    parentId: null,
                    title,
                    type: 'chapter',
                    order: siblings.length,
                    createdAt: Date.now(),
                });

                // 改行ごとにカードを作成（\r\n・\n 両対応）
                const lines = text.split(/\r?\n/);
                await db.textBlocks.bulkAdd(
                    lines.map((content, idx) => ({
                        chapterId,
                        projectId: currentProject.id,
                        content,
                        order: idx,
                    })),
                );
            }
            // チャプターツリーを更新
            await loadChapters(currentProject.id);
        } finally {
            setIsImporting(false);
        }
    };

    const handleGrantPermission = async () => {
        if (permissionHandle) {
            try {
                const options = { mode: 'readwrite' };
                if ((await permissionHandle.requestPermission(options)) === 'granted') {
                    triggerAutoSave();
                }
            } catch (error) {
                console.error('Failed to request permission:', error);
            }
        }
        setShowPermissionModal(false);
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;
        if (currentProject) {
            setPendingAction({ type: 'create' });
            setShowOverwriteModal(true);
            return;
        }
        await executeCreateProject();
    };

    const executeCreateProject = async () => {
        await createProject(newProjectName.trim());
        setNewProjectName('');
        setShowProjectModal(false);
        setShowAutoSaveModal(true);
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (currentProject) {
            setPendingAction({ type: 'open', file });
            e.target.value = ''; // reset so the same file can be selected again if canceled
            setShowOverwriteModal(true);
            return;
        }
        await executeOpenFile(file);
        e.target.value = ''; // reset
    };

    const executeOpenFile = async (file) => {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            // 最低限の構造チェック（projectキーがないファイルは拒否）
            if (!data || typeof data !== 'object' || !data.project) {
                alert('有効なプロジェクトファイルではありません。\nWriliaで保存したJSONファイルを選択してください。');
                return;
            }
            await importProject(data);
            setShowProjectModal(false);
            setShowAutoSaveModal(true);
        } catch (err) {
            console.error('Failed to parse JSON', err);
            alert('ファイルの読み込みに失敗しました。');
        }
    };

    const handleConfirmOverwrite = async () => {
        setShowOverwriteModal(false);
        if (pendingAction?.type === 'create') {
            await executeCreateProject();
        } else if (pendingAction?.type === 'open') {
            await executeOpenFile(pendingAction.file);
        }
        setPendingAction(null);
    };

    // ── Export helpers ──
    const collectProjectData = async (projectId) => {
        const tables = [
            'chapters',
            'textBlocks',
            'plots',
            'characters',
            'relationships',
            'relationPatterns',
            'mapPatterns',
            'locations',
            'settings',
        ];
        const data = { project: await db.projects.get(projectId) };
        for (const t of tables) {
            if (db[t]) data[t] = await db[t].where('projectId').equals(projectId).toArray();
        }
        return data;
    };

    // 指定したファイルハンドルにプロジェクトデータを書き込む共通処理
    const saveToFileHandle = async (fileHandle) => {
        const data = await collectProjectData(currentProject.id);
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    };

    // OS ネイティブの「名前を付けて保存」ダイアログで JSON を保存する。
    // suggestedName はダイアログに初期表示するファイル名。
    // 上書き確認は OS ダイアログが担当する。
    // 保存に成功した場合はファイルハンドルを返す。キャンセル・失敗時は null を返す。
    const saveWithPicker = async (suggestedName) => {
        if (!currentProject) return null;
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: `${suggestedName}.json`,
                types: [{ description: 'JSON ファイル', accept: { 'application/json': ['.json'] } }],
            });
            await saveToFileHandle(fileHandle);
            return fileHandle;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('保存に失敗しました:', err);
                alert('保存に失敗しました。');
            }
            return null;
        }
    };

    // 保存（JSON）: 前回と同じファイルに上書き保存。初回のみダイアログを表示。
    const handleSave = async () => {
        if (!currentProject) return;
        if (saveFileHandle) {
            try {
                await saveToFileHandle(saveFileHandle);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('保存に失敗しました:', err);
                    alert('保存に失敗しました。');
                }
            }
        } else {
            const handle = await saveWithPicker(currentProject?.name ?? 'project');
            if (handle) setSaveFileHandle(handle);
        }
    };

    // 別名保存: 常にダイアログを表示し、新しいファイルに保存。以後そのファイルが保存先になる。
    const handleSaveAs = async () => {
        const handle = await saveWithPicker(currentProject?.name ?? 'project');
        if (handle) setSaveFileHandle(handle);
    };

    const handleExportTxtClick = async () => {
        if (!currentProject) return;
        try {
            const chapters = await db.chapters.where('projectId').equals(currentProject.id).sortBy('order');
            setExportChapters(chapters);
            setSelectedExportIds(new Set());
            setExportIncludeNovel(true);
            setExportIncludePlot(false);
            setExportIncludeSettings(false);
            setExportIncludeCharacters(false);
            setExportIncludeLocations(false);
            let relationPatterns = [];
            let mapPatterns = [];
            try {
                relationPatterns = await db.relationPatterns.where('projectId').equals(currentProject.id).toArray();
                relationPatterns.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            } catch {
                /* パターンが取得できなくても続行 */
            }
            try {
                mapPatterns = await db.mapPatterns.where('projectId').equals(currentProject.id).toArray();
                mapPatterns.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            } catch {
                /* パターンが取得できなくても続行 */
            }
            setExportRelationPatterns(relationPatterns);
            setExportMapPatterns(mapPatterns);
            setSelectedExportRelationPatternIds(new Set());
            setSelectedExportMapPatternIds(new Set());
            setExportFileName(currentProject.name || '書き出し');
            setNovelExportFilter('all');
            setShowExportModal(true);
        } catch (err) {
            console.error('書き出しモーダルの初期化に失敗しました:', err);
            alert('書き出しモーダルを開けませんでした。');
        }
    };

    const handleSelectAllExport = () => {
        setSelectedExportIds(new Set(exportChapters.map((c) => c.id)));
    };

    const handleDeselectAllExport = () => {
        setSelectedExportIds(new Set());
    };

    const toggleExportSelection = (id, isSelected) => {
        const newSelected = new Set(selectedExportIds);

        const getDescendants = (parentId) => {
            let desc = [];
            const children = exportChapters.filter((c) => c.parentId === parentId);
            for (const child of children) {
                desc.push(child.id);
                desc = desc.concat(getDescendants(child.id));
            }
            return desc;
        };

        const toggleIds = [id, ...getDescendants(id)];

        toggleIds.forEach((tId) => {
            if (isSelected) {
                newSelected.add(tId);
            } else {
                newSelected.delete(tId);
            }
        });
        setSelectedExportIds(newSelected);
    };

    const handleConfirmExportTxt = async () => {
        if (!currentProject) return;
        try {
            // Fetch all novel data, plus characters and locations for variables
            const textBlocks = await db.textBlocks.where('projectId').equals(currentProject.id).toArray();
            const characters = await db.characters.where('projectId').equals(currentProject.id).toArray();
            const locations = await db.locations.where('projectId').equals(currentProject.id).toArray();
            const variables = [...characters, ...locations];

            // Object to hold text content for each selected type
            const exportsToCreate = {}; // { suffix: string, content: string }

            // --- 1. Export Novel Content ---
            if (exportIncludeNovel) {
                // 会話文カードの判定: カードの内容が「または『で始まる場合
                const isDialogueBlock = (content) => {
                    const trimmed = (content || '').trim();
                    return trimmed.startsWith('「') || trimmed.startsWith('『');
                };

                let txtContent = `${currentProject.name} - 本文\n${'='.repeat(20)}\n\n`;

                const buildChapterText = (parentId, level) => {
                    const children = exportChapters.filter((c) => c.parentId === parentId);
                    let combined = '';

                    for (const child of children) {
                        if (selectedExportIds.has(child.id)) {
                            if (level === 0) combined += `【 ${child.title || '無題'} 】\n\n`;
                            else if (level === 1) combined += `■ ${child.title || '無題'}\n\n`;
                            else combined += `${''.padStart(level, '・')}${child.title || '無題'}\n\n`;

                            const allBlocks = textBlocks
                                .filter((b) => b.chapterId === child.id)
                                .sort((a, b) => a.order - b.order);

                            // フィルタリング
                            const filteredBlocks = allBlocks.filter((b) => {
                                if (!b.content?.trim()) return false;
                                if (novelExportFilter === 'dialogue') return isDialogueBlock(b.content);
                                if (novelExportFilter === 'narration') return !isDialogueBlock(b.content);
                                return true;
                            });

                            for (const b of filteredBlocks) {
                                const resolvedTxt = resolveVariables(b.content, variables);
                                combined += resolvedTxt + '\n';
                            }
                        }

                        const childContent = buildChapterText(child.id, level + 1);
                        if (childContent) combined += (combined ? '\n' : '') + childContent;
                    }
                    return combined;
                };

                const novelContent = buildChapterText(null, 0);
                if (novelContent.trim()) {
                    txtContent += novelContent + '\n';
                    exportsToCreate['本文'] = txtContent;
                }
            }

            // --- 2. Export Plot Content ---
            if (exportIncludePlot) {
                const plots = await db.plots.where('projectId').equals(currentProject.id).sortBy('order');
                if (plots && plots.length > 0) {
                    let txtContent = `${currentProject.name} - プロット\n${'='.repeat(20)}\n\n`;
                    for (const plot of plots) {
                        txtContent += `[${plot.phase || '未設定'}] ${plot.title || '無題'}\n`;
                        if (plot.description) txtContent += `${plot.description}\n`;

                        let linkedChapters = [];
                        try {
                            linkedChapters = JSON.parse(plot.chapterIds || '[]');
                        } catch {}
                        if (linkedChapters.length > 0) {
                            const linkedTitles = linkedChapters
                                .map((id) => {
                                    const ch = exportChapters.find((c) => c.id === id);
                                    return ch ? ch.title : null;
                                })
                                .filter(Boolean);

                            if (linkedTitles.length > 0) txtContent += `(紐づけ: ${linkedTitles.join(' / ')})\n`;
                        }
                        txtContent += '\n';
                    }
                    exportsToCreate['プロット'] = txtContent;
                }
            }

            // --- 3. Export Settings Content ---
            if (exportIncludeSettings) {
                const settings = await db.settings.where('projectId').equals(currentProject.id).sortBy('createdAt');
                if (settings && settings.length > 0) {
                    let txtContent = `${currentProject.name} - 設定・メモ\n${'='.repeat(20)}\n\n`;
                    const settingsByCategory = {};
                    settings.forEach((s) => {
                        const cat = s.category || '未分類';
                        if (!settingsByCategory[cat]) settingsByCategory[cat] = [];
                        settingsByCategory[cat].push(s);
                    });

                    for (const cat of Object.keys(settingsByCategory).sort()) {
                        txtContent += `■ ${cat}\n\n`;
                        for (const s of settingsByCategory[cat]) {
                            txtContent += `【${s.title || '無題'}】\n`;

                            let fields = [];
                            try {
                                fields = JSON.parse(s.fields || '[]');
                            } catch {}
                            if (fields.length > 0) {
                                for (const f of fields) {
                                    if (f.key || f.value) txtContent += `・${f.key || '無題'}: ${f.value || ''}\n`;
                                }
                            }

                            if (s.memo) {
                                if (fields.length > 0) txtContent += '\n';
                                txtContent += `${s.memo}\n`;
                            }
                            txtContent += '\n';
                        }
                    }
                    exportsToCreate['設定メモ'] = txtContent;
                }
            }

            // --- 4. Export Character Details ---
            if (exportIncludeCharacters) {
                const allCharacters = await db.characters.where('projectId').equals(currentProject.id).sortBy('order');
                const charMap = new Map(allCharacters.map((c) => [c.id, c]));

                const formatCharacter = (char, indent) => {
                    let s = `${indent}【 ${char.name || '名前未設定'} 】\n`;
                    if (char.variableName) s += `${indent}変数名: ${char.variableName}\n`;
                    if (char.gender) s += `${indent}性別: ${char.gender}\n`;
                    let fields = [];
                    try {
                        fields = JSON.parse(char.profile || '[]');
                    } catch {}
                    if (fields.length > 0) {
                        s += '\n';
                        for (const f of fields) {
                            if (f.key || f.value) s += `${indent}・${f.key || '項目'}: ${f.value || ''}\n`;
                        }
                    }
                    if (char.detail) s += '\n' + char.detail + '\n';
                    return s + '\n';
                };

                let bodyContent = '';
                if (selectedExportRelationPatternIds.size > 0) {
                    const selectedPatterns = exportRelationPatterns.filter((p) =>
                        selectedExportRelationPatternIds.has(p.id),
                    );
                    for (const pattern of selectedPatterns) {
                        bodyContent += `■ ${pattern.name || '無題パターン'}\n\n`;
                        let nodes = [];
                        try {
                            nodes = JSON.parse(pattern.nodesData || '[]');
                        } catch {}
                        const charIds = [
                            ...new Set(
                                nodes
                                    .filter((n) => n.type === 'characterNode' && n.data?.characterId)
                                    .map((n) => n.data.characterId),
                            ),
                        ];
                        if (charIds.length === 0) {
                            bodyContent += '（このパターンに人物はいません）\n\n';
                        } else {
                            for (const cid of charIds) {
                                const char = charMap.get(cid);
                                if (char) bodyContent += formatCharacter(char, '');
                            }
                        }
                    }
                } else {
                    const buildCharacterText = (parentId, level) => {
                        const items = allCharacters.filter((c) => c.parentId === parentId);
                        let combined = '';
                        for (const item of items) {
                            const indent = '　'.repeat(level);
                            if (item.type === 'folder') {
                                combined += `${indent}■ ${item.name || '無題フォルダ'}\n\n`;
                                combined += buildCharacterText(item.id, level + 1);
                            } else {
                                combined += formatCharacter(item, indent);
                            }
                        }
                        return combined;
                    };
                    bodyContent = buildCharacterText(null, 0);
                }
                if (bodyContent.trim()) {
                    exportsToCreate['人物詳細'] =
                        `${currentProject.name} - 人物詳細\n${'='.repeat(20)}\n\n${bodyContent}`;
                }
            }

            // --- 5. Export Location Details ---
            if (exportIncludeLocations) {
                const allLocations = await db.locations.where('projectId').equals(currentProject.id).sortBy('order');
                const locMap = new Map(allLocations.map((l) => [l.id, l]));

                const formatLocation = (loc, indent) => {
                    let s = `${indent}【 ${loc.name || '名前未設定'} 】\n`;
                    if (loc.variableName) s += `${indent}変数名: ${loc.variableName}\n`;
                    if (loc.detail) s += '\n' + loc.detail + '\n';
                    return s + '\n';
                };

                let bodyContent = '';
                if (selectedExportMapPatternIds.size > 0) {
                    const selectedPatterns = exportMapPatterns.filter((p) => selectedExportMapPatternIds.has(p.id));
                    for (const pattern of selectedPatterns) {
                        bodyContent += `■ ${pattern.name || '無題パターン'}\n\n`;
                        let nodes = [];
                        try {
                            nodes = JSON.parse(pattern.nodesData || '[]');
                        } catch {}
                        const locIds = [
                            ...new Set(
                                nodes
                                    .filter((n) => n.type === 'locationNode' && n.data?.locationId)
                                    .map((n) => n.data.locationId),
                            ),
                        ];
                        if (locIds.length === 0) {
                            bodyContent += '（このパターンに場所はいません）\n\n';
                        } else {
                            for (const lid of locIds) {
                                const loc = locMap.get(lid);
                                if (loc) bodyContent += formatLocation(loc, '');
                            }
                        }
                    }
                } else {
                    const buildLocationText = (parentId, level) => {
                        const items = allLocations.filter((l) => l.parentId === parentId);
                        let combined = '';
                        for (const item of items) {
                            const indent = '　'.repeat(level);
                            if (item.type === 'folder') {
                                combined += `${indent}■ ${item.name || '無題フォルダ'}\n\n`;
                                combined += buildLocationText(item.id, level + 1);
                            } else {
                                combined += formatLocation(item, indent);
                            }
                        }
                        return combined;
                    };
                    bodyContent = buildLocationText(null, 0);
                }
                if (bodyContent.trim()) {
                    exportsToCreate['場所詳細'] =
                        `${currentProject.name} - 場所詳細\n${'='.repeat(20)}\n\n${bodyContent}`;
                }
            }

            // Check if anything was selected to export
            const exportKeys = Object.keys(exportsToCreate);
            if (exportKeys.length === 0) {
                alert('書き出す内容が存在しません。');
                return;
            }

            const baseFileName = exportFileName.trim() || currentProject.name || 'export';

            // エンコード変換済み Blob を生成するヘルパー
            const buildBlob = (content) => {
                let c = content;
                if (convertEmphasis) c = convertEmphasisForExport(c);
                if (exportEncoding === 'SJIS') {
                    const unicodeArray = encoding.stringToCode(c);
                    const sjisArray = encoding.convert(unicodeArray, 'SJIS', 'UNICODE');
                    return new Blob([new Uint8Array(sjisArray)], { type: 'text/plain;charset=shift_jis' });
                }
                // TextEncoder で明示的に UTF-8 バイト列に変換し、BOM (EF BB BF) を先頭に付加する
                // ※ Blob へ文字列を直接渡す方法は環境により挙動が異なるため、バイト操作で確実に処理する
                const encoder = new TextEncoder(); // 常に UTF-8
                const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf]);
                const contentBytes = encoder.encode(c);
                const result = new Uint8Array(bomBytes.length + contentBytes.length);
                result.set(bomBytes, 0);
                result.set(contentBytes, bomBytes.length);
                return new Blob([result], { type: 'text/plain;charset=utf-8' });
            };

            try {
                if (exportKeys.length === 1) {
                    // 1ファイル: OS「名前を付けて保存」ダイアログ（上書き確認付き）
                    const key = exportKeys[0];
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: `${baseFileName}_${key}.txt`,
                        types: [{ description: 'テキストファイル', accept: { 'text/plain': ['.txt'] } }],
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(buildBlob(exportsToCreate[key]));
                    await writable.close();
                    setShowExportModal(false);
                    alert('テキストの書き出しが完了しました。');
                } else {
                    // 複数ファイル: OS フォルダ選択ダイアログ
                    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                    for (const key of exportKeys) {
                        const fileHandle = await dirHandle.getFileHandle(`${baseFileName}_${key}.txt`, {
                            create: true,
                        });
                        const writable = await fileHandle.createWritable();
                        await writable.write(buildBlob(exportsToCreate[key]));
                        await writable.close();
                    }
                    setShowExportModal(false);
                    alert(
                        `${exportKeys.length}個のテキストファイルの書き出しが完了しました。\n保存先: ${dirHandle.name}`,
                    );
                }
            } catch (error) {
                console.error('Error saving text file(s):', error);
                if (error.name !== 'AbortError') {
                    alert('ファイルの保存に失敗しました。');
                }
            }
        } catch (err) {
            console.error('書き出し処理に失敗しました:', err);
            alert(`書き出し処理中にエラーが発生しました。\n${err?.message || err}`);
        }
    };

    const handleClose = () => {
        if (!currentProject) return;
        setShowCloseModal(true);
    };

    const handleCloseConfirm = async () => {
        await closeProject();
        setShowCloseModal(false);
    };
    return (
        <>
            <aside
                className={`h-full flex flex-col border-r border-border transition-all duration-300 overflow-hidden bg-bg-secondary ${
                    collapsed ? 'w-16' : 'w-60'
                }`}
                onMouseEnter={() => setCollapsed(false)}
                onMouseLeave={() => setCollapsed(true)}
            >
                {/* ヘッダー */}
                <div className="flex items-center justify-center py-2 px-3 border-b border-border gap-2">
                    <img
                        src="/favicon.svg"
                        alt="Wrilia"
                        className={`shrink-0 transition-all duration-300 ${collapsed ? 'w-6 h-6' : 'w-7 h-7'}`}
                    />
                    <h1 className={`font-bold bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent truncate whitespace-nowrap text-xl transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>
                        Wrilia
                    </h1>
                </div>

                {/* 作品選択 */}
                <div className="px-2 py-2 border-b border-border bg-bg-secondary/50 space-y-1">
                    <button
                        onClick={() => setShowProjectModal(true)}
                        className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg bg-accent-primary/10 hover:bg-accent-primary/20 border border-accent-primary/30 transition-all text-sm font-semibold shadow-sm overflow-hidden"
                    >
                        <FolderOpen size={18} className="text-accent-primary shrink-0" />
                        <span className={`truncate text-accent-secondary whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>
                            {currentProject ? currentProject.name : '作品を開く'}
                        </span>
                    </button>
                    <button
                        onClick={() => textImportRef.current?.click()}
                        disabled={!currentProject || isImporting}
                        className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-semibold shadow-sm overflow-hidden ${
                            !currentProject || isImporting
                                ? 'opacity-40 cursor-not-allowed bg-accent-primary/5 border-accent-primary/20'
                                : 'bg-accent-primary/10 hover:bg-accent-primary/20 border-accent-primary/30'
                        }`}
                        title="テキストファイルを取り込む"
                    >
                        <FileUp size={18} className="text-accent-primary shrink-0" />
                        <span className={`truncate text-accent-secondary whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>
                            {isImporting ? '取り込み中…' : 'テキスト取り込み'}
                        </span>
                    </button>
                    <input
                        ref={textImportRef}
                        type="file"
                        accept=".txt"
                        multiple
                        className="hidden"
                        onChange={handleTextImport}
                    />
                </div>

                {/* ナビゲーション */}
                <nav className="flex-1 min-h-0 px-2 py-1.5 space-y-0.5 overflow-y-auto overflow-x-hidden">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group whitespace-nowrap ${
                                    isActive
                                        ? 'bg-accent-primary/15 text-accent-secondary border border-accent-primary/30 shadow-sm shadow-accent-primary/5'
                                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-transparent'
                                }`
                            }
                        >
                            <item.icon size={18} className="shrink-0" />
                            <span className={`text-sm font-medium transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>{item.label}</span>
                        </NavLink>
                    ))}
                    <div className="border-t border-border mt-1 pt-1">
                        <button
                            onClick={() => window.open('/取扱説明書.html', '_blank')}
                            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap w-full text-text-muted hover:bg-bg-hover hover:text-text-secondary border border-transparent"
                            title="取扱説明書"
                        >
                            <HelpCircle size={15} className="shrink-0" />
                            <span className={`text-xs transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>取扱説明書</span>
                        </button>
                    </div>
                </nav>

                {/* ファイルメニュー (Always visible) */}
                <div className="border-t border-border px-2 py-1.5 space-y-0.5">
                    <button
                        onClick={handleSave}
                        disabled={!currentProject}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${!currentProject ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                    >
                        <Save size={15} className="shrink-0" />
                        <span className={`text-xs whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>保存（JSON）</span>
                    </button>
                    <button
                        onClick={handleSaveAs}
                        disabled={!currentProject}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${!currentProject ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                    >
                        <FileDown size={15} className="shrink-0" />
                        <span className={`text-xs whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>別名保存</span>
                    </button>
                    <button
                        onClick={handleExportTxtClick}
                        disabled={!currentProject}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${!currentProject ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                    >
                        <FileText size={15} className="shrink-0" />
                        <span className={`text-xs whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>書き出し（TXT）</span>
                    </button>
                    <button
                        onClick={() => setShowImageExportModal(true)}
                        disabled={!currentProject}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${!currentProject ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                    >
                        <ImageIcon size={15} className="shrink-0" />
                        <span className={`text-xs whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>書き出し（画像）</span>
                    </button>
                    <button
                        onClick={() => setShowSvgExportModal(true)}
                        disabled={!currentProject}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${!currentProject ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                    >
                        <ImageIcon size={15} className="shrink-0" />
                        <span className={`text-xs whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>書き出し（SVG）</span>
                    </button>
                    <button
                        onClick={handleClose}
                        disabled={!currentProject}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${!currentProject ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:bg-bg-hover hover:text-danger'}`}
                    >
                        <X size={15} className="shrink-0" />
                        <span className={`text-xs whitespace-nowrap transition-all duration-300 overflow-hidden ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}>作品を閉じる</span>
                    </button>
                </div>

                {/* 自動保存ステータス */}
                <div className={`overflow-hidden transition-all duration-300 shrink-0 ${!collapsed && currentProject ? 'max-h-20' : 'max-h-0'}`}>
                    <div className="border-t border-border px-3 py-2 text-xs w-full">
                        <div className="flex justify-between items-center mb-1 whitespace-nowrap">
                            <span className="font-medium text-text-secondary">
                                自動保存: {autoSaveInterval > 0 ? `${autoSaveInterval}分` : 'オフ'}
                            </span>
                            <button
                                onClick={() => setShowAutoSaveModal(true)}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-bg-secondary hover:bg-bg-hover text-text-primary"
                            >
                                設定変更
                            </button>
                        </div>
                        {autoSaveInterval > 0 && (
                            <div className="text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">
                                最終保存: {lastAutoSave ? formatDate(lastAutoSave) : '未実行'}
                            </div>
                        )}
                    </div>
                </div>

                {/* フッター */}
                <div className={`overflow-hidden transition-all duration-300 shrink-0 ${collapsed ? 'max-h-0' : 'max-h-24'}`}>
                    <div className="px-3 py-2 border-t border-border text-[10px] text-text-muted text-left leading-relaxed">
                        <div>完全ローカル動作 — データはこのブラウザにのみ保存されます。</div>
                        <div>消失防止のため「保存（JSON）」で定期的にバックアップしてください。</div>
                    </div>
                </div>
            </aside>

            {/* 作品を開くモーダル */}
            {showProjectModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowProjectModal(false)}
                >
                    <div
                        className="glass-card w-full max-w-[460px] mx-4 animate-fade-in p-8 flex flex-col gap-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* タイトルエリア */}
                        <div>
                            <h2 className="text-xl font-bold text-text-primary leading-snug">
                                作品を開く / 新規作成
                            </h2>
                            <p className="text-xs text-text-muted mt-2 leading-relaxed">
                                保存済みのファイルを開くか、新しい作品を作成してください。
                            </p>
                        </div>

                        {/* 既存の作品を開く */}
                        <div className="flex flex-col gap-3">
                            <p className="text-sm font-semibold text-text-primary">既存の作品を開く</p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-accent-primary hover:bg-accent-primary/5 text-text-secondary hover:text-text-primary transition-all"
                            >
                                <Upload size={18} className="text-accent-primary shrink-0" />
                                <span className="text-sm font-medium">JSON ファイルを選択</span>
                            </button>
                            <input
                                type="file"
                                accept=".json"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </div>

                        {/* 区切り線 */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-xs text-text-muted">または</span>
                            <div className="flex-1 h-px bg-border" />
                        </div>

                        {/* 新しい作品を作成 */}
                        <div className="flex flex-col gap-3">
                            <p className="text-sm font-semibold text-text-primary">新しい作品を作成</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                                    placeholder="作品名を入力..."
                                    className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-bg-primary border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-all"
                                />
                                <button
                                    onClick={handleCreateProject}
                                    disabled={!newProjectName.trim()}
                                    className="px-5 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm shrink-0 transition-all"
                                >
                                    作成
                                </button>
                            </div>
                        </div>

                        {/* キャンセルボタン（右下） */}
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowProjectModal(false)}
                                className="px-5 py-2.5 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border transition-all"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* 作品を閉じる確認モーダル */}
            {showCloseModal && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowCloseModal(false)}
                >
                    <div
                        className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-10 py-8 max-w-md w-full mx-4 animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 rounded-full bg-danger/10">
                                <AlertTriangle size={26} className="text-danger" />
                            </div>
                            <h3 className="text-lg font-bold text-text-primary">作品を閉じる</h3>
                        </div>
                        <p className="text-sm text-text-secondary mb-8 leading-relaxed pl-1">
                            作品を閉じてよろしいですか？
                            <br />
                            <br />
                            <span className="text-danger">
                                作品を閉じるとメモリ上の作業データがすべて完全に消去され、アプリ初期状態に戻ります。（未保存のデータは消えるので、必ず事前に「保存（JSON）」を行ってください）
                            </span>
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowCloseModal(false)}
                                className="px-6 py-2.5 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleCloseConfirm}
                                className="px-6 py-2.5 rounded-lg text-sm bg-danger text-white hover:bg-danger/80 transition-colors font-medium"
                            >
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* 上書き確認モーダル */}
            {showOverwriteModal && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => {
                        setShowOverwriteModal(false);
                        setPendingAction(null);
                    }}
                >
                    <div
                        className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-10 py-8 max-w-md w-full mx-4 animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 rounded-full bg-danger/10">
                                <AlertTriangle size={26} className="text-danger" />
                            </div>
                            <h3 className="text-lg font-bold text-text-primary">編集中のデータ破棄の確認</h3>
                        </div>
                        <p className="text-sm text-text-secondary mb-8 leading-relaxed pl-1">
                            現在編集中の作品を保存せずに別の作品を開いた（または新規作成した）場合は、
                            <span className="text-danger font-medium">編集中のデータは消去されます。</span>
                            <br />
                            <br />
                            別の作品を開いてもよろしいですか？
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowOverwriteModal(false);
                                    setPendingAction(null);
                                }}
                                className="px-6 py-2.5 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleConfirmOverwrite}
                                className="px-6 py-2.5 rounded-lg text-sm bg-danger text-white hover:bg-danger/80 transition-colors font-medium"
                            >
                                開く
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* テキスト書き出しモーダル */}
            {showExportModal && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowExportModal(false)}
                >
                    <div
                        className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-6 py-5 max-w-2xl w-full mx-4 flex flex-col max-h-[90vh] animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-base font-bold text-text-primary mb-3">テキストファイル書き出し</h3>

                        <div className="mb-3">
                            <label className="block text-xs font-medium text-text-secondary mb-1.5">ファイル名</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={exportFileName}
                                    onChange={(e) => setExportFileName(e.target.value)}
                                    className="flex-1 px-3 py-1.5 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-accent-primary transition-colors"
                                    placeholder="書き出すファイル名"
                                />
                                <span className="text-sm text-text-muted">.txt</span>
                            </div>
                        </div>

                        <div className="flex gap-4 overflow-hidden min-h-0 flex-1">
                            <div className="flex-1 flex flex-col min-h-0">
                                <label className="block text-xs font-medium text-text-secondary mb-2 shrink-0">
                                    書き出す内容
                                </label>

                                <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                                    {/* 本文エリア */}
                                    <div className="border border-border rounded-lg bg-bg-secondary/30 p-2.5">
                                        <label className="flex items-center gap-2 cursor-pointer group mb-2">
                                            <input
                                                type="checkbox"
                                                checked={exportIncludeNovel}
                                                onChange={(e) => setExportIncludeNovel(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                            />
                                            <span className="text-sm font-bold text-text-primary">小説本文</span>
                                        </label>

                                        {exportIncludeNovel && (
                                            <div className="pl-6">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs text-text-muted">
                                                        章・エピソードを選択
                                                    </span>
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            onClick={handleSelectAllExport}
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary hover:bg-bg-hover transition-colors border border-border"
                                                        >
                                                            全選択
                                                        </button>
                                                        <button
                                                            onClick={handleDeselectAllExport}
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary hover:bg-bg-hover transition-colors border border-border"
                                                        >
                                                            全解除
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="max-h-32 overflow-y-auto bg-bg-card rounded border border-border/50 p-2 pr-1">
                                                    {(() => {
                                                        const renderExportNode = (parentId, level) => {
                                                            const children = exportChapters.filter(
                                                                (c) => c.parentId === parentId,
                                                            );
                                                            if (children.length === 0) return null;
                                                            return (
                                                                <div
                                                                    className={`space-y-1 ${level > 0 ? 'ml-3 pl-2 border-l border-border/50 mt-1' : ''}`}
                                                                >
                                                                    {children.map((child) => (
                                                                        <div key={child.id}>
                                                                            <label className="flex items-center gap-2 cursor-pointer group py-0.5">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={selectedExportIds.has(
                                                                                        child.id,
                                                                                    )}
                                                                                    onChange={(e) =>
                                                                                        toggleExportSelection(
                                                                                            child.id,
                                                                                            e.target.checked,
                                                                                        )
                                                                                    }
                                                                                    className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                                                                />
                                                                                <span
                                                                                    className={`text-xs ${level === 0 ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                                                                                >
                                                                                    {child.title || '無題'}
                                                                                </span>
                                                                            </label>
                                                                            {renderExportNode(child.id, level + 1)}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        };
                                                        return renderExportNode(null, 0);
                                                    })()}
                                                </div>

                                                {/* 本文フィルタ */}
                                                <div className="mt-2">
                                                    <span className="text-xs text-text-muted block mb-1">書き出すカード</span>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {[
                                                            { value: 'all', label: 'すべて' },
                                                            { value: 'dialogue', label: '会話文のみ' },
                                                            { value: 'narration', label: '地の文のみ' },
                                                        ].map((opt) => (
                                                            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name="novelExportFilter"
                                                                    value={opt.value}
                                                                    checked={novelExportFilter === opt.value}
                                                                    onChange={() => setNovelExportFilter(opt.value)}
                                                                    className="w-3.5 h-3.5 text-accent-primary"
                                                                />
                                                                <span className="text-xs text-text-secondary">{opt.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* プロット */}
                                    <div className="border border-border rounded-lg bg-bg-secondary/30 p-2.5">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={exportIncludePlot}
                                                onChange={(e) => setExportIncludePlot(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                            />
                                            <div>
                                                <div className="text-sm font-bold text-text-primary">プロット</div>
                                                <div className="text-xs text-text-muted">
                                                    フェーズ・詳細などのプロット全体を書き出します。
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    {/* 設定管理 */}
                                    <div className="border border-border rounded-lg bg-bg-secondary/30 p-2.5">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={exportIncludeSettings}
                                                onChange={(e) => setExportIncludeSettings(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                            />
                                            <div>
                                                <div className="text-sm font-bold text-text-primary">設定・メモ</div>
                                                <div className="text-xs text-text-muted">
                                                    作成した設定カテゴリ・カスタムフィールド・メモを書き出します。
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    {/* 人物詳細 */}
                                    <div className="border border-border rounded-lg bg-bg-secondary/30 p-2.5">
                                        <label className="flex items-center gap-2 cursor-pointer group mb-2">
                                            <input
                                                type="checkbox"
                                                checked={exportIncludeCharacters}
                                                onChange={(e) => setExportIncludeCharacters(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                            />
                                            <div>
                                                <div className="text-sm font-bold text-text-primary">人物詳細</div>
                                                <div className="text-xs text-text-muted">
                                                    人物相関図で作成した人物の名前・性別・プロフィール・詳細を書き出します。
                                                </div>
                                            </div>
                                        </label>
                                        {exportIncludeCharacters && (
                                            <div className="pl-6">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs text-text-muted">
                                                        パターンを選択（未選択時は全人物を書き出し）
                                                    </span>
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            onClick={() =>
                                                                setSelectedExportRelationPatternIds(
                                                                    new Set(exportRelationPatterns.map((p) => p.id)),
                                                                )
                                                            }
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary hover:bg-bg-hover transition-colors border border-border"
                                                        >
                                                            全選択
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                setSelectedExportRelationPatternIds(new Set())
                                                            }
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary hover:bg-bg-hover transition-colors border border-border"
                                                        >
                                                            全解除
                                                        </button>
                                                    </div>
                                                </div>
                                                {exportRelationPatterns.length === 0 ? (
                                                    <p className="text-xs text-text-muted italic">
                                                        パターンがありません（全人物が書き出されます）
                                                    </p>
                                                ) : (
                                                    <div className="max-h-32 overflow-y-auto bg-bg-card rounded border border-border/50 p-2 space-y-1">
                                                        {exportRelationPatterns.map((p) => (
                                                            <label
                                                                key={p.id}
                                                                className="flex items-center gap-2 cursor-pointer py-0.5"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedExportRelationPatternIds.has(p.id)}
                                                                    onChange={(e) => {
                                                                        const next = new Set(
                                                                            selectedExportRelationPatternIds,
                                                                        );
                                                                        if (e.target.checked) next.add(p.id);
                                                                        else next.delete(p.id);
                                                                        setSelectedExportRelationPatternIds(next);
                                                                    }}
                                                                    className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                                                />
                                                                <span className="text-xs text-text-secondary">
                                                                    {p.name || '無題パターン'}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* 場所詳細 */}
                                    <div className="border border-border rounded-lg bg-bg-secondary/30 p-2.5">
                                        <label className="flex items-center gap-2 cursor-pointer group mb-2">
                                            <input
                                                type="checkbox"
                                                checked={exportIncludeLocations}
                                                onChange={(e) => setExportIncludeLocations(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                            />
                                            <div>
                                                <div className="text-sm font-bold text-text-primary">場所詳細</div>
                                                <div className="text-xs text-text-muted">
                                                    地図モードで作成した場所の名前・詳細を書き出します。
                                                </div>
                                            </div>
                                        </label>
                                        {exportIncludeLocations && (
                                            <div className="pl-6">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs text-text-muted">
                                                        パターンを選択（未選択時は全場所を書き出し）
                                                    </span>
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            onClick={() =>
                                                                setSelectedExportMapPatternIds(
                                                                    new Set(exportMapPatterns.map((p) => p.id)),
                                                                )
                                                            }
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary hover:bg-bg-hover transition-colors border border-border"
                                                        >
                                                            全選択
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedExportMapPatternIds(new Set())}
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-secondary hover:bg-bg-hover transition-colors border border-border"
                                                        >
                                                            全解除
                                                        </button>
                                                    </div>
                                                </div>
                                                {exportMapPatterns.length === 0 ? (
                                                    <p className="text-xs text-text-muted italic">
                                                        パターンがありません（全場所が書き出されます）
                                                    </p>
                                                ) : (
                                                    <div className="max-h-32 overflow-y-auto bg-bg-card rounded border border-border/50 p-2 space-y-1">
                                                        {exportMapPatterns.map((p) => (
                                                            <label
                                                                key={p.id}
                                                                className="flex items-center gap-2 cursor-pointer py-0.5"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedExportMapPatternIds.has(p.id)}
                                                                    onChange={(e) => {
                                                                        const next = new Set(
                                                                            selectedExportMapPatternIds,
                                                                        );
                                                                        if (e.target.checked) next.add(p.id);
                                                                        else next.delete(p.id);
                                                                        setSelectedExportMapPatternIds(next);
                                                                    }}
                                                                    className="w-3.5 h-3.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary"
                                                                />
                                                                <span className="text-xs text-text-secondary">
                                                                    {p.name || '無題パターン'}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 右側: 文字コード選択 */}
                            <div className="w-52 shrink-0 flex flex-col">
                                <label className="block text-xs font-medium text-text-secondary mb-2 shrink-0">
                                    文字コードを選択
                                </label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-bg-hover transition-colors">
                                        <input
                                            type="radio"
                                            name="encoding"
                                            value="UTF8"
                                            checked={exportEncoding === 'UTF8'}
                                            onChange={() => setExportEncoding('UTF8')}
                                            className="w-3.5 h-3.5 text-accent-primary"
                                        />
                                        <div>
                                            <div className="text-xs font-medium text-text-primary">Unicode (UTF-8)</div>
                                            <div className="text-[11px] text-text-muted">
                                                スマートフォンやPC向け。
                                            </div>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-bg-hover transition-colors">
                                        <input
                                            type="radio"
                                            name="encoding"
                                            value="SJIS"
                                            checked={exportEncoding === 'SJIS'}
                                            onChange={() => setExportEncoding('SJIS')}
                                            className="w-3.5 h-3.5 text-accent-primary"
                                        />
                                        <div>
                                            <div className="text-xs font-medium text-text-primary">Shift_JIS</div>
                                            <div className="text-[11px] text-text-muted">古いWindows環境向け。</div>
                                        </div>
                                    </label>
                                </div>

                                <label className="block text-xs font-medium text-text-secondary mt-4 mb-2 shrink-0">
                                    オプション
                                </label>
                                <div className="space-y-2">
                                    <label className="flex items-start gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-bg-hover transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={convertEmphasis}
                                            onChange={(e) => setConvertEmphasis(e.target.checked)}
                                            className="w-3.5 h-3.5 mt-0.5 rounded border-border text-accent-primary focus:ring-accent-primary/20 bg-bg-primary shrink-0"
                                        />
                                        <div className="flex-1">
                                            <div className="text-xs font-medium text-text-primary">
                                                傍点を《《》》形式に変更
                                            </div>
                                            <div className="text-[11px] text-text-muted mt-1 leading-relaxed whitespace-pre-wrap">
                                                {`単体: |字《・》 → 《《字》》
連続: |あ《・》|い《・》|う《・》 → 《《あいう》》`}
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end mt-3 pt-3 border-t border-border shrink-0">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleConfirmExportTxt}
                                className="px-4 py-2 rounded-lg text-sm bg-accent-primary text-white hover:bg-accent-primary/80 transition-colors font-medium"
                            >
                                書き出し
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* フォルダアクセス許可モーダル */}
            {showPermissionModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-bg-primary border border-border rounded-2xl shadow-2xl px-10 py-8 max-w-sm w-full mx-4 animate-fade-in text-center">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 rounded-full bg-accent-primary/10">
                                <AlertTriangle size={32} className="text-accent-primary" />
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-text-primary mb-3">フォルダへのアクセス許可</h3>
                        <p className="text-sm text-text-secondary mb-8 leading-relaxed">
                            ブラウザの仕様により、自動保存を継続するには選択したフォルダへのアクセス許可が必要です。
                            <br />
                            「許可する」を押してアクセスを許可してください。
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setShowPermissionModal(false)}
                                className="px-6 py-2.5 rounded-lg text-sm border border-border hover:bg-bg-hover transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleGrantPermission}
                                className="px-6 py-2.5 rounded-lg text-sm bg-accent-primary text-white hover:bg-accent-primary/80 transition-colors font-medium"
                            >
                                許可する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 画像書き出しモーダル */}
            {showImageExportModal && (
                <ImageExportModal
                    isOpen={showImageExportModal}
                    onClose={() => setShowImageExportModal(false)}
                    exportMode="image"
                />
            )}

            {/* SVG書き出しモーダル */}
            {showSvgExportModal && (
                <ImageExportModal
                    isOpen={showSvgExportModal}
                    onClose={() => setShowSvgExportModal(false)}
                    exportMode="svg"
                />
            )}

            {/* 自動保存設定モーダル */}
            <AutoSaveModal
                isOpen={showAutoSaveModal}
                onClose={() => setShowAutoSaveModal(false)}
                onSave={setAutoSaveConfig}
                initialInterval={autoSaveInterval}
                initialHandle={directoryHandle}
            />
        </>
    );
}
