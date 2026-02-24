import { create } from 'zustand';
import db from '../db/database';

const useProjectStore = create((set, get) => ({
    projects: [], // kept for compatibility, but always has max 1 project
    currentProject: null,
    autoSaveInterval: 0,
    lastAutoSave: null,
    directoryHandle: null,

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
        set({ projects: [], currentProject: null });
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
                await db.projects.add(jsonData.project);
                if (jsonData.chapters?.length) await db.chapters.bulkAdd(jsonData.chapters);
                if (jsonData.textBlocks?.length) await db.textBlocks.bulkAdd(jsonData.textBlocks);
                if (jsonData.plots?.length) await db.plots.bulkAdd(jsonData.plots);
                if (jsonData.characters?.length) await db.characters.bulkAdd(jsonData.characters);
                if (jsonData.relationships?.length) await db.relationships.bulkAdd(jsonData.relationships);
                if (jsonData.relationPatterns?.length) await db.relationPatterns.bulkAdd(jsonData.relationPatterns);
                if (jsonData.mapPatterns?.length) await db.mapPatterns.bulkAdd(jsonData.mapPatterns);
                if (jsonData.locations?.length) await db.locations.bulkAdd(jsonData.locations);
                if (jsonData.settings?.length) await db.settings.bulkAdd(jsonData.settings);
                if (jsonData.variables?.length) await db.variables.bulkAdd(jsonData.variables);
            },
        );

        const project = await db.projects.get(jsonData.project.id);
        set({ projects: [project], currentProject: project });
        return project;
    },

    closeProject: async () => {
        await get().initStore();
        set({ autoSaveInterval: 0, lastAutoSave: null, directoryHandle: null });
    },

    setAutoSaveConfig: (interval, handle) => {
        set({ autoSaveInterval: interval, directoryHandle: handle });
    },

    triggerAutoSave: async () => {
        const { currentProject, directoryHandle } = get();
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
            ];
            const data = { project: currentProject };
            for (const t of tables) {
                if (db[t]) data[t] = await db[t].where('projectId').equals(currentProject.id).toArray();
            }

            const fileName = `${currentProject.name || 'autosave'}.json`;
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();

            set({ lastAutoSave: Date.now() });
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
