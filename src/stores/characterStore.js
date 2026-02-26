import { create } from 'zustand';
import db from '../db/database';

const useCharacterStore = create((set, get) => ({
    characters: [],
    relationPatterns: [],
    relationships: [],
    selectedCharacterId: null,

    loadCharacters: async (projectId) => {
        const characters = await db.characters.where('projectId').equals(projectId).toArray();
        characters.sort((a, b) => (a.order || 0) - (b.order || 0));
        set({ characters });
    },

    addCharacter: async (projectId, data) => {
        const id = await db.characters.add({
            projectId,
            parentId: data.parentId || null,
            type: 'character',
            order: Date.now(),
            name: data.name || '新しいキャラクター',
            variableName: data.variableName || '',
            nameFirst: data.nameFirst || '',
            nameLast: data.nameLast || '',
            nameMiddle: data.nameMiddle || '',
            gender: data.gender || '',
            profile: data.profile || '{}',
            detail: data.detail || '',
            color: data.color || 'zinc',
            image: data.image || null,
            createdAt: Date.now(),
        });
        await get().loadCharacters(projectId);
        return id;
    },

    addCharacterFolder: async (projectId, name, parentId = null) => {
        const id = await db.characters.add({
            projectId,
            parentId,
            type: 'folder',
            order: Date.now(),
            name: name || '新しいフォルダ',
            variableName: '',
            nameFirst: '',
            nameLast: '',
            nameMiddle: '',
            gender: '',
            profile: '{}',
            detail: '',
            color: 'zinc',
            image: null,
            createdAt: Date.now(),
        });
        await get().loadCharacters(projectId);
        return id;
    },

    reorderCharacters: async (projectId, orderedIds, parentId) => {
        const updates = orderedIds.map((id, index) => ({
            id,
            changes: { order: index, parentId },
        }));
        await Promise.all(updates.map((u) => db.characters.update(u.id, u.changes)));
        await get().loadCharacters(projectId);
    },

    updateCharacter: async (id, updates) => {
        await db.characters.update(id, updates);
        const char = await db.characters.get(id);
        if (char) await get().loadCharacters(char.projectId);
    },

    deleteCharacter: async (id) => {
        const char = await db.characters.get(id);
        if (!char) return;
        await db.characters.delete(id);
        await db.relationships.where('sourceId').equals(id).delete();
        await db.relationships.where('targetId').equals(id).delete();
        await get().loadCharacters(char.projectId);
    },

    selectCharacter: (id) => set({ selectedCharacterId: id }),

    // Relation Patterns (進行度別)
    loadRelationPatterns: async (projectId) => {
        const patterns = await db.relationPatterns.where('projectId').equals(projectId).toArray();
        set({ relationPatterns: patterns });
    },

    addRelationPattern: async (projectId, name, chapterId = null) => {
        const id = await db.relationPatterns.add({
            projectId,
            name,
            chapterId,
            nodesData: '[]',
            edgesData: '[]',
            createdAt: Date.now(),
        });
        await get().loadRelationPatterns(projectId);
        return id;
    },

    updateRelationPattern: async (id, updates) => {
        await db.relationPatterns.update(id, updates);
        const pattern = await db.relationPatterns.get(id);
        if (pattern) await get().loadRelationPatterns(pattern.projectId);
    },

    deleteRelationPattern: async (id) => {
        const pattern = await db.relationPatterns.get(id);
        if (!pattern) return;
        await db.relationships.where('patternId').equals(id).delete();
        await db.relationPatterns.delete(id);
        await get().loadRelationPatterns(pattern.projectId);
    },

    // Relationships
    loadRelationships: async (patternId) => {
        const relationships = await db.relationships.where('patternId').equals(patternId).toArray();
        set({ relationships });
    },

    addRelationship: async (projectId, patternId, sourceId, targetId, label = '', type = 'default') => {
        await db.relationships.add({
            projectId,
            patternId,
            sourceId,
            targetId,
            label,
            type,
            affinity: 0,
        });
        await get().loadRelationships(patternId);
    },

    updateRelationship: async (id, updates) => {
        await db.relationships.update(id, updates);
        const rel = await db.relationships.get(id);
        if (rel) await get().loadRelationships(rel.patternId);
    },

    deleteRelationship: async (id) => {
        const rel = await db.relationships.get(id);
        if (!rel) return;
        await db.relationships.delete(id);
        await get().loadRelationships(rel.patternId);
    },
}));

export default useCharacterStore;
