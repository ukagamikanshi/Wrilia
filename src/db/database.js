import Dexie from 'dexie';

const db = new Dexie('NovelWriterDB');

db.version(1).stores({
    projects: '++id, name, createdAt, updatedAt',
    chapters: '++id, projectId, parentId, title, type, order, createdAt',
    textBlocks: '++id, chapterId, projectId, content, order',
    plots: '++id, projectId, title, phase, description, order, chapterIds',
    characters: '++id, projectId, name, variableName, gender, profile, detail, color, image, createdAt',
    relationships: '++id, projectId, patternId, sourceId, targetId, label, type, affinity',
    relationPatterns: '++id, projectId, name, chapterId, nodesData, edgesData, createdAt',
    maps: '++id, projectId, patternId, name, chapterId, nodesData, edgesData, createdAt',
    mapPatterns: '++id, projectId, name, chapterId, createdAt',
    locations: '++id, projectId, name, variableName, detail, createdAt',
    settings: '++id, projectId, category, title, fields, memo, createdAt',
    variables: '++id, projectId, name, value, type',
});
db.version(2)
    .stores({
        characters: '++id, projectId, name, variableName, gender, profile, detail, color, image, createdAt',
        relationships: '++id, projectId, patternId, sourceId, targetId, label, type, affinity',
        relationPatterns: '++id, projectId, name, chapterId, nodesData, edgesData, createdAt',
    })
    .upgrade((trans) => {
        trans.characters.toCollection().modify((char) => {
            if (!char.color) char.color = 'zinc';
            if (!char.image) char.image = null;
        });
        trans.relationships.toCollection().modify((rel) => {
            if (rel.affinity === undefined) rel.affinity = 0;
        });
        trans.relationPatterns.toCollection().modify((pattern) => {
            if (!pattern.nodesData) pattern.nodesData = '[]';
            if (!pattern.edgesData) pattern.edgesData = '[]';
        });
    });

db.version(3)
    .stores({
        characters:
            '++id, projectId, parentId, type, order, name, variableName, gender, profile, detail, color, image, createdAt',
    })
    .upgrade((trans) => {
        trans.characters.toCollection().modify((char) => {
            if (!char.type) char.type = 'character';
            if (char.parentId === undefined) char.parentId = null;
            if (char.order === undefined) char.order = Date.now() + Math.random();
        });
    });

db.version(4)
    .stores({
        locations: '++id, projectId, parentId, type, order, name, variableName, detail, createdAt',
        mapPatterns: '++id, projectId, name, chapterId, nodesData, edgesData, createdAt',
    })
    .upgrade((trans) => {
        trans.locations.toCollection().modify((loc) => {
            if (!loc.type) loc.type = 'location';
            if (loc.parentId === undefined) loc.parentId = null;
            if (loc.order === undefined) loc.order = Date.now() + Math.random();
        });
        trans.mapPatterns.toCollection().modify((pattern) => {
            if (!pattern.nodesData) pattern.nodesData = '[]';
            if (!pattern.edgesData) pattern.edgesData = '[]';
        });
        // Migrate data from maps to mapPatterns if it exists
        trans.maps?.toCollection().each((map) => {
            if (map.patternId) {
                trans.mapPatterns.update(map.patternId, {
                    nodesData: map.nodesData || '[]',
                    edgesData: map.edgesData || '[]',
                });
            }
        });
    });

export default db;
