import { create } from 'zustand';
import db from '../db/database';

const useMapStore = create((set, get) => ({
    mapPatterns: [],
    locations: [],
    selectedLocationId: null,

    // Map Patterns (進行度別)
    loadMapPatterns: async (projectId) => {
        const patterns = await db.mapPatterns.where('projectId').equals(projectId).toArray();
        set({ mapPatterns: patterns });
    },

    addMapPattern: async (projectId, name, chapterId = null) => {
        const id = await db.mapPatterns.add({
            projectId,
            name,
            chapterId,
            nodesData: '[]',
            edgesData: '[]',
            createdAt: Date.now(),
        });
        await get().loadMapPatterns(projectId);
        return id;
    },

    updateMapPattern: async (id, updates) => {
        await db.mapPatterns.update(id, updates);
        const pattern = await db.mapPatterns.get(id);
        if (pattern) await get().loadMapPatterns(pattern.projectId);
    },

    deleteMapPattern: async (id) => {
        const pattern = await db.mapPatterns.get(id);
        if (!pattern) return;
        await db.mapPatterns.delete(id);
        await get().loadMapPatterns(pattern.projectId);
    },

    // Locations
    loadLocations: async (projectId) => {
        const locations = await db.locations.where('projectId').equals(projectId).toArray();
        locations.sort((a, b) => (a.order || 0) - (b.order || 0));
        set({ locations });
    },

    addLocation: async (projectId, data) => {
        const id = await db.locations.add({
            projectId,
            parentId: data.parentId || null,
            type: 'location',
            order: Date.now(),
            name: data.name || '新しい場所',
            variableName: data.variableName || '',
            detail: data.detail || '',
            createdAt: Date.now(),
        });
        await get().loadLocations(projectId);
        return id;
    },

    addLocationFolder: async (projectId, name, parentId = null) => {
        const id = await db.locations.add({
            projectId,
            parentId,
            type: 'folder',
            order: Date.now(),
            name: name || '新しいフォルダ',
            variableName: '',
            detail: '',
            createdAt: Date.now(),
        });
        await get().loadLocations(projectId);
        return id;
    },

    reorderLocations: async (projectId, orderedIds, parentId) => {
        const updates = orderedIds.map((id, index) => ({
            id,
            changes: { order: index, parentId },
        }));
        await Promise.all(updates.map((u) => db.locations.update(u.id, u.changes)));
        await get().loadLocations(projectId);
    },

    updateLocation: async (id, updates) => {
        await db.locations.update(id, updates);
        const loc = await db.locations.get(id);
        if (loc) await get().loadLocations(loc.projectId);
    },

    deleteLocation: async (id) => {
        const loc = await db.locations.get(id);
        if (!loc) return;
        await db.locations.delete(id);
        await get().loadLocations(loc.projectId);
    },

    selectLocation: (id) => set({ selectedLocationId: id }),
}));

export default useMapStore;
