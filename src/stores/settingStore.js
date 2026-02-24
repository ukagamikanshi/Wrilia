import { create } from 'zustand';
import db from '../db/database';

const useSettingStore = create((set, get) => ({
    settings: [],
    categories: [],

    loadSettings: async (projectId) => {
        const settings = await db.settings.where('projectId').equals(projectId).toArray();
        const categories = [...new Set(settings.map((s) => s.category).filter(Boolean))];
        set({ settings, categories });
    },

    addSetting: async (projectId, category, title = '新しいメモ') => {
        const id = await db.settings.add({
            projectId,
            category,
            title,
            fields: '[]',
            memo: '',
            createdAt: Date.now(),
        });
        await get().loadSettings(projectId);
        return id;
    },

    updateSetting: async (id, updates) => {
        await db.settings.update(id, updates);
        const setting = await db.settings.get(id);
        if (setting) await get().loadSettings(setting.projectId);
    },

    deleteSetting: async (id) => {
        const setting = await db.settings.get(id);
        if (!setting) return;
        await db.settings.delete(id);
        await get().loadSettings(setting.projectId);
    },

    deleteCategory: async (projectId, category) => {
        const items = await db.settings.where('projectId').equals(projectId).toArray();
        const toDelete = items.filter((s) => s.category === category);
        await Promise.all(toDelete.map((s) => db.settings.delete(s.id)));
        await get().loadSettings(projectId);
    },

    renameCategory: async (projectId, oldName, newName) => {
        const items = await db.settings.where('projectId').equals(projectId).toArray();
        const toUpdate = items.filter((s) => s.category === oldName);
        await Promise.all(toUpdate.map((s) => db.settings.update(s.id, { category: newName })));
        await get().loadSettings(projectId);
    },
}));

export default useSettingStore;
