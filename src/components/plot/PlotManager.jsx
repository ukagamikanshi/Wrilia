import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    GripVertical,
    Link2,
    Plus,
    Settings,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import useNovelStore from '../../stores/novelStore';
import usePlotStore from '../../stores/plotStore';
import useProjectStore from '../../stores/projectStore';

export const PLOT_COLORS = {
    emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    sky: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
    amber: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-700 border-rose-500/30',
    purple: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
    pink: 'bg-pink-500/10 text-pink-700 border-pink-500/30',
    indigo: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30',
    teal: 'bg-teal-500/10 text-teal-700 border-teal-500/30',
    orange: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
    zinc: 'bg-zinc-500/10 text-zinc-700 border-zinc-500/30',
};

export const COLOR_NAMES = {
    emerald: 'エメラルド',
    sky: '空色',
    amber: '琥珀',
    rose: 'ローズ',
    purple: '紫',
    pink: 'ピンク',
    indigo: '藍色',
    teal: 'ティール',
    orange: 'オレンジ',
    zinc: 'グレー',
};

const DEFAULT_PHASES = [
    { id: 'p1', name: '起', color: 'emerald' },
    { id: 'p2', name: '承', color: 'sky' },
    { id: 'p3', name: '転', color: 'amber' },
    { id: 'p4', name: '結', color: 'rose' },
];

function SortablePlotCard({ plot, chapters, phases, onUpdate, onDelete }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: plot.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const [expanded, setExpanded] = useState(false);
    const [linkedChapters, setLinkedChapters] = useState([]);

    // IME入力バグを防ぐためのローカルState
    const [localTitle, setLocalTitle] = useState(plot.title || '');
    const [localDesc, setLocalDesc] = useState(plot.description || '');

    useEffect(() => {
        setLocalTitle(plot.title || '');
        setLocalDesc(plot.description || '');
    }, [plot.title, plot.description]);

    useEffect(() => {
        try {
            setLinkedChapters(JSON.parse(plot.chapterIds || '[]'));
        } catch {
            setLinkedChapters([]);
        }
    }, [plot.chapterIds]);

    const phaseObj = phases.find((p) => p.name === plot.phase);
    const colorClass = phaseObj ? PLOT_COLORS[phaseObj.color] : 'bg-bg-card text-text-secondary border-border';

    const toggleChapter = (chapterId) => {
        const newLinked = linkedChapters.includes(chapterId)
            ? linkedChapters.filter((id) => id !== chapterId)
            : [...linkedChapters, chapterId];
        setLinkedChapters(newLinked);
        onUpdate(plot.id, { chapterIds: JSON.stringify(newLinked) });
    };

    return (
        <div ref={setNodeRef} style={style} className={`glass-card p-4 mb-3 border ${colorClass} animate-fade-in`}>
            <div className="flex items-start gap-2">
                <button {...attributes} {...listeners} className="mt-1 cursor-grab shrink-0">
                    <GripVertical size={14} className="text-text-muted" />
                </button>
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                        <select
                            value={plot.phase}
                            onChange={(e) => onUpdate(plot.id, { phase: e.target.value })}
                            className="px-2 py-1 rounded text-xs bg-bg-primary border border-border focus:outline-none focus:border-accent-primary"
                        >
                            <option value="">フェーズ選択</option>
                            {phases.map((p) => (
                                <option key={p.id} value={p.name}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <input
                            value={localTitle}
                            onChange={(e) => setLocalTitle(e.target.value)}
                            onBlur={() => onUpdate(plot.id, { title: localTitle })}
                            className="flex-1 px-2 py-1 rounded text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent-primary focus:outline-none font-medium text-text-primary placeholder:text-text-muted"
                            placeholder="プロットタイトル"
                        />
                        <button onClick={() => onDelete(plot.id)} className="hover:text-danger shrink-0">
                            <Trash2 size={14} className="text-text-muted hover:text-danger" />
                        </button>
                    </div>
                    <textarea
                        value={localDesc}
                        onChange={(e) => setLocalDesc(e.target.value)}
                        onBlur={() => onUpdate(plot.id, { description: localDesc })}
                        className="w-full px-2 py-1.5 rounded bg-bg-primary/50 border border-border text-xs resize-y focus:outline-none focus:border-accent-primary min-h-[60px] text-text-primary placeholder:text-text-muted"
                        placeholder="プロットの詳細・展開..."
                        rows={3}
                    />
                    {/* 章との紐づけ */}
                    <div>
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
                        >
                            <Link2 size={12} />
                            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            紐づけ済み: {linkedChapters.length}件
                        </button>
                        {expanded && (
                            <div className="mt-2 space-y-1 pl-4">
                                {chapters.map((ch) => (
                                    <label
                                        key={ch.id}
                                        className="flex items-center gap-2 text-xs cursor-pointer hover:text-text-primary"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={linkedChapters.includes(ch.id)}
                                            onChange={() => toggleChapter(ch.id)}
                                            className="accent-accent-primary"
                                        />
                                        <span
                                            className={
                                                linkedChapters.includes(ch.id)
                                                    ? 'text-accent-secondary'
                                                    : 'text-text-muted'
                                            }
                                        >
                                            {ch.title}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PlotManager() {
    const { plots, loadPlots, addPlot, updatePlot, deletePlot, reorderPlots } = usePlotStore();
    const { chapters, loadChapters } = useNovelStore();
    const { currentProject, updateProject } = useProjectStore();
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    useEffect(() => {
        if (currentProject) {
            loadPlots(currentProject.id);
            loadChapters(currentProject.id);
        }
    }, [currentProject]);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id || !currentProject) return;
        const oldIndex = plots.findIndex((p) => p.id === active.id);
        const newIndex = plots.findIndex((p) => p.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = arrayMove(plots, oldIndex, newIndex);
            reorderPlots(
                currentProject.id,
                newOrder.map((p) => p.id),
            );
        }
    };

    if (!currentProject) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted">
                <p className="text-sm">プロジェクトを選択してください</p>
            </div>
        );
    }

    const phases = currentProject.plotPhases || DEFAULT_PHASES;

    const handleSavePhases = async (newPhases) => {
        await updateProject(currentProject.id, { plotPhases: newPhases });
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <h2 className="text-lg font-bold bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
                        プロット管理
                    </h2>
                    <button
                        onClick={() => addPlot(currentProject.id, '新しいプロット')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-primary text-white hover:bg-accent-secondary transition-colors text-sm font-medium shadow-sm"
                    >
                        <Plus size={14} /> プロット追加
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* タイムラインビュー */}
                <div className="flex-1 overflow-y-auto p-4">
                    {plots.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-text-muted text-sm mb-3">プロットがありません</p>
                            <button
                                onClick={() => addPlot(currentProject.id, '最初のプロット', phases[0]?.name || '')}
                                className="px-4 py-2 rounded-lg bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/20 transition-colors text-sm"
                            >
                                最初のプロットを作成
                            </button>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto relative">
                            {/* タイムライン線 */}
                            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-accent-primary/50 via-accent-secondary/30 to-transparent" />
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={plots.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                                    {plots.map((plot, index) => (
                                        <div key={plot.id} className="relative pl-10">
                                            {/* タイムラインドット */}
                                            <div className="absolute left-4.5 top-5 w-3 h-3 rounded-full bg-accent-primary border-2 border-bg-primary z-10" />
                                            <SortablePlotCard
                                                plot={plot}
                                                chapters={chapters}
                                                phases={phases}
                                                onUpdate={updatePlot}
                                                onDelete={deletePlot}
                                            />
                                        </div>
                                    ))}
                                </SortableContext>
                            </DndContext>
                        </div>
                    )}
                </div>

                {/* 右側：フェーズ設定パレット */}
                <PhaseSettingsPanel phases={phases} onSave={handleSavePhases} />
            </div>
        </div>
    );
}

function PhaseSettingsPanel({ phases, onSave }) {
    const [localPhases, setLocalPhases] = useState([...phases]);

    useEffect(() => {
        setLocalPhases([...phases]);
    }, [phases]);

    const addPhase = () => {
        const newPhases = [...localPhases, { id: crypto.randomUUID(), name: '新規フェーズ', color: 'zinc' }];
        setLocalPhases(newPhases);
        onSave(newPhases);
    };

    const updatePhase = (index, key, value, saveImmediately = false) => {
        const newPhases = [...localPhases];
        newPhases[index][key] = value;
        setLocalPhases(newPhases);
        if (saveImmediately) {
            onSave(newPhases);
        }
    };

    const removePhase = (index) => {
        if (localPhases.length <= 1) return;
        const newPhases = [...localPhases];
        newPhases.splice(index, 1);
        setLocalPhases(newPhases);
        onSave(newPhases);
    };

    const movePhase = (index, dir) => {
        if (index + dir < 0 || index + dir >= localPhases.length) return;
        const newPhases = [...localPhases];
        const temp = newPhases[index];
        newPhases[index] = newPhases[index + dir];
        newPhases[index + dir] = temp;
        setLocalPhases(newPhases);
        onSave(newPhases);
    };

    return (
        <div className="w-80 shrink-0 bg-bg-card border-l border-border flex flex-col h-full">
            <div className="p-4 border-b border-border flex items-center">
                <h2 className="font-bold text-text-primary text-sm flex items-center gap-2">
                    <Settings size={16} className="text-accent-primary" />
                    プロットフェーズ設定
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <p className="text-xs text-text-muted mb-4 border-b border-border pb-2">
                    プロットの各フェーズ（起承転結など）の名前と色をカスタマイズできます。
                </p>

                {localPhases.map((p, i) => (
                    <div
                        key={p.id}
                        className="flex items-center gap-2 bg-bg-secondary p-2 rounded-lg border border-border"
                    >
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => movePhase(i, -1)}
                                disabled={i === 0}
                                className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                            >
                                <ArrowUp size={14} />
                            </button>
                            <button
                                onClick={() => movePhase(i, 1)}
                                disabled={i === localPhases.length - 1}
                                className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                            >
                                <ArrowDown size={14} />
                            </button>
                        </div>

                        <input
                            value={p.name}
                            onChange={(e) => updatePhase(i, 'name', e.target.value, false)}
                            onBlur={() => onSave(localPhases)}
                            className="flex-1 px-2 py-1.5 rounded bg-bg-card border border-border text-xs focus:border-accent-primary focus:outline-none"
                            placeholder="フェーズ名"
                        />

                        <select
                            value={p.color}
                            onChange={(e) => updatePhase(i, 'color', e.target.value, true)}
                            className={`px-1 py-1.5 rounded border border-border text-xs focus:border-accent-primary focus:outline-none ${PLOT_COLORS[p.color]}`}
                        >
                            {Object.entries(COLOR_NAMES).map(([key, label]) => (
                                <option key={key} value={key} className="bg-bg-card text-text-primary">
                                    {label}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={() => removePhase(i)}
                            disabled={localPhases.length <= 1}
                            className="p-1.5 text-danger/70 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}

                <button
                    onClick={addPhase}
                    className="w-full py-2.5 mt-2 rounded-lg border-2 border-dashed border-border text-text-muted hover:text-accent-primary hover:border-accent-primary hover:bg-accent-primary/5 transition-all flex items-center justify-center gap-1 text-xs font-medium"
                >
                    <Plus size={16} /> フェーズを追加
                </button>
            </div>
        </div>
    );
}
