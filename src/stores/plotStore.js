import { create } from 'zustand';
import db from '../db/database';

const usePlotStore = create((set, get) => ({
    plots: [],

    loadPlots: async (projectId) => {
        const plots = await db.plots.where('projectId').equals(projectId).sortBy('order');
        set({ plots });
    },

    addPlot: async (projectId, title, phase = '') => {
        const { plots } = get();
        await db.plots.add({
            projectId,
            title,
            phase,
            description: '',
            order: plots.length,
            chapterIds: '[]',
        });
        await get().loadPlots(projectId);
    },

    updatePlot: async (id, updates) => {
        await db.plots.update(id, updates);
        const plot = await db.plots.get(id);
        if (plot) await get().loadPlots(plot.projectId);
    },

    deletePlot: async (id) => {
        const plot = await db.plots.get(id);
        if (!plot) return;
        await db.plots.delete(id);
        await get().loadPlots(plot.projectId);
    },

    reorderPlots: async (projectId, reorderedIds) => {
        await db.transaction('rw', db.plots, async () => {
            for (let i = 0; i < reorderedIds.length; i++) {
                await db.plots.update(reorderedIds[i], { order: i });
            }
        });
        await get().loadPlots(projectId);
    },
}));

export default usePlotStore;
