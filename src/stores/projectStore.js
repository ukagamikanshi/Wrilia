import { create } from 'zustand';
import db, { CURRENT_SCHEMA_VERSION } from '../db/database';

// 古いスキーマのJSONデータを現在のスキーマに正規化する（インポート前処理）
function normalizeJsonData(jsonData) {
    const schemaVersion = jsonData.schemaVersion || 0;
    // v5 未満: キャラクターに nameFirst/nameLast/nameMiddle を補完
    if (schemaVersion < 5 && jsonData.characters?.length) {
        jsonData.characters = jsonData.characters.map((char) => ({
            nameFirst: '',
            nameLast: '',
            nameMiddle: '',
            ...char,
        }));
    }
    return jsonData;
}

const useProjectStore = create((set, get) => ({
    projects: [], // kept for compatibility, but always has max 1 project
    currentProject: null,
    autoSaveInterval: 0,
    lastAutoSave: null,
    directoryHandle: null,
    // Plan B: 自動保存の異常検知用。前回保存時のデータ件数を記録する
    lastSaveStats: null, // { chapterCount: number, textBlockCount: number } | null
    // Plan C: 起動後の初回自動保存時にのみタイムスタンプ付きバックアップを作成するフラグ
    sessionBackupDone: false,

    // Plan A: 起動時に IndexedDB から既存プロジェクトを復元する。
    // 明示的な「新規作成」「インポート」「閉じる」操作以外ではデータを消去しない。
    loadExistingProject: async () => {
        const count = await db.projects.count();
        if (count === 0) return; // プロジェクトなし
        const project = await db.projects.toCollection().first();
        if (!project) return;
        set({ projects: [project], currentProject: project });
    },

    // Clear all tables
    initStore: async () => {
        await Promise.all([
            db.projects.clear(),
            db.chapters.clear(),
            db.textBlocks.clear(),
            db.plots.clear(),
            db.characters.clear(),
            db.relationships.clear(),
            db.relationPatterns.clear(),
            db.maps?.clear?.(), // Handle older schema version gracefully
            db.mapPatterns.clear(),
            db.locations.clear(),
            db.settings.clear(),
            db.variables.clear(),
        ]);
        set({ projects: [], currentProject: null, lastSaveStats: null, sessionBackupDone: false });
    },

    createProject: async (name) => {
        // Clear DB first to ensure only one project exists
        await get().initStore();

        const defaultPhases = [
            { id: 'p1', name: '起', color: 'emerald' },
            { id: 'p2', name: '承', color: 'sky' },
            { id: 'p3', name: '転', color: 'amber' },
            { id: 'p4', name: '結', color: 'rose' },
        ];
        const id = await db.projects.add({
            name,
            plotPhases: defaultPhases,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // デフォルト構成の作成（巻 -> 章 -> 話）
        const volId = await db.chapters.add({
            projectId: id,
            parentId: null,
            title: '第1巻',
            type: 'volume',
            order: 0,
            createdAt: Date.now(),
        });
        const chapId = await db.chapters.add({
            projectId: id,
            parentId: volId,
            title: '第1章',
            type: 'chapter',
            order: 0,
            createdAt: Date.now(),
        });
        await db.chapters.add({
            projectId: id,
            parentId: chapId,
            title: '第1話',
            type: 'episode',
            order: 0,
            createdAt: Date.now(),
        });

        const project = await db.projects.get(id);
        set({ projects: [project], currentProject: project });
        return project;
    },

    importProject: async (jsonData) => {
        await get().initStore();
        if (!jsonData || !jsonData.project) throw new Error('Invalid project data');

        // 古いスキーマのデータを現在のスキーマに正規化する
        const normalized = normalizeJsonData(jsonData);

        await db.transaction(
            'rw',
            db.projects,
            db.chapters,
            db.textBlocks,
            db.plots,
            db.characters,
            db.relationships,
            db.relationPatterns,
            db.mapPatterns,
            db.locations,
            db.settings,
            db.variables,
            async () => {
                await db.projects.add(normalized.project);
                if (normalized.chapters?.length) await db.chapters.bulkAdd(normalized.chapters);
                if (normalized.textBlocks?.length) await db.textBlocks.bulkAdd(normalized.textBlocks);
                if (normalized.plots?.length) await db.plots.bulkAdd(normalized.plots);
                if (normalized.characters?.length) await db.characters.bulkAdd(normalized.characters);
                if (normalized.relationships?.length) await db.relationships.bulkAdd(normalized.relationships);
                if (normalized.relationPatterns?.length) await db.relationPatterns.bulkAdd(normalized.relationPatterns);
                if (normalized.mapPatterns?.length) await db.mapPatterns.bulkAdd(normalized.mapPatterns);
                if (normalized.locations?.length) await db.locations.bulkAdd(normalized.locations);
                if (normalized.settings?.length) await db.settings.bulkAdd(normalized.settings);
                if (normalized.variables?.length) await db.variables.bulkAdd(normalized.variables);
            },
        );

        const project = await db.projects.get(normalized.project.id);
        set({ projects: [project], currentProject: project });
        return project;
    },

    closeProject: async () => {
        await get().initStore();
        set({ autoSaveInterval: 0, lastAutoSave: null, directoryHandle: null, lastSaveStats: null });
    },

    setAutoSaveConfig: (interval, handle) => {
        set({ autoSaveInterval: interval, directoryHandle: handle });
    },

    triggerAutoSave: async () => {
        const { currentProject, directoryHandle, lastSaveStats, sessionBackupDone } = get();
        if (!currentProject || !directoryHandle) return;

        try {
            // Check permissions before attempting to write
            const options = { mode: 'readwrite' };
            if ((await directoryHandle.queryPermission(options)) !== 'granted') {
                return { needsPermission: true, directoryHandle };
            }

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
                'variables', // 以前は保存漏れがあったため追加
            ];
            const data = { project: currentProject };
            for (const t of tables) {
                if (db[t]) data[t] = await db[t].where('projectId').equals(currentProject.id).toArray();
            }

            // Plan B: データ整合性チェック ─ 章が0件は異常（プロジェクトが開いている限り必ず1件以上存在する）
            const chapterCount = data.chapters?.length ?? 0;
            if (chapterCount === 0) {
                console.warn('[AutoSave] blocked: no chapters found. Possible data corruption, skipping write.');
                return;
            }

            // Plan B: textBlocks が前回保存時の5%未満（かつ前回が50件以上）なら異常として書き込みをスキップ
            const textBlockCount = data.textBlocks?.length ?? 0;
            if (lastSaveStats && lastSaveStats.textBlockCount >= 50) {
                if (textBlockCount < lastSaveStats.textBlockCount * 0.05) {
                    console.warn('[AutoSave] blocked: suspicious reduction in text blocks.', {
                        previous: lastSaveStats.textBlockCount,
                        current: textBlockCount,
                    });
                    return;
                }
            }

            const fileName = `${currentProject.name || 'autosave'}.json`;

            // Plan C: 起動後の初回自動保存時のみ、タイムスタンプ付きバックアップを作成する
            // ファイルが増え続けないよう、同日のバックアップが既に存在する場合は作成しない
            if (!sessionBackupDone) {
                try {
                    const today = new Date();
                    const pad = (n) => String(n).padStart(2, '0');
                    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
                    const bakFileName = `${currentProject.name || 'autosave'}.bak.${dateStr}.json`;
                    // 同日バックアップが既にある場合は作成しない
                    let bakExists = false;
                    try {
                        await directoryHandle.getFileHandle(bakFileName);
                        bakExists = true;
                    } catch {
                        // ファイルなし → 作成へ
                    }
                    if (!bakExists) {
                        try {
                            const existingHandle = await directoryHandle.getFileHandle(fileName);
                            const existingFile = await existingHandle.getFile();
                            const existingContent = await existingFile.text();
                            if (existingContent && existingContent.length > 10) {
                                const bakHandle = await directoryHandle.getFileHandle(bakFileName, { create: true });
                                const bakWritable = await bakHandle.createWritable();
                                await bakWritable.write(existingContent);
                                await bakWritable.close();
                            }
                        } catch {
                            // メインファイルが存在しない（初回保存）場合はスキップ
                        }
                    }
                } catch {
                    // バックアップ失敗は保存処理を止めない
                } finally {
                    set({ sessionBackupDone: true });
                }
            }

            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, ...data }, null, 2));
            await writable.close();

            // Plan B: 保存成功後に件数を記録
            set({ lastAutoSave: Date.now(), lastSaveStats: { chapterCount, textBlockCount } });
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    },

    updateProject: async (id, updates) => {
        await db.projects.update(id, { ...updates, updatedAt: Date.now() });
        const { currentProject } = get();
        if (currentProject?.id === id) {
            const project = await db.projects.get(id);
            set({ currentProject: project });
        }
    },
}));

export default useProjectStore;
