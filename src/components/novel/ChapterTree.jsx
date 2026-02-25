import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    BookOpen,
    ChevronDown,
    ChevronRight,
    Copy,
    FileText,
    FolderPlus,
    GripVertical,
    Layers,
    Plus,
    Trash2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import useNovelStore from '../../stores/novelStore';
import useProjectStore from '../../stores/projectStore';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return <div className="text-red-500 p-2 text-xs">Error: {this.state.error?.message}</div>;
        }
        return this.props.children;
    }
}

// chapters 配列をツリー順にフラット化し、各アイテムの深さ (level) を付与する
function flattenTree(chapters) {
    const roots = chapters.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
    const result = [];
    function traverse(ch, level) {
        result.push({ chapter: ch, level });
        chapters
            .filter((c) => c.parentId === ch.id)
            .sort((a, b) => a.order - b.order)
            .forEach((child) => {
                traverse(child, level + 1);
            });
    }
    roots.forEach((ch) => {
        traverse(ch, 0);
    });
    return result;
}

// 収納時に表示するアイコンのみのツリーアイテム
function CollapsedTreeItem({ chapter, level, selectedId, onSelect }) {
    const typeIcon = {
        volume: <BookOpen size={14} className="text-amber-700 shrink-0" />,
        chapter: <Layers size={14} className="text-sky-700 shrink-0" />,
        episode: <FileText size={14} className="text-emerald-700 shrink-0" />,
    };
    return (
        <div
            className={`flex items-center justify-center py-1 rounded cursor-pointer transition-colors ${
                selectedId === chapter.id ? 'bg-accent-primary/20' : 'hover:bg-bg-hover'
            }`}
            style={{ paddingLeft: `${level * 8 + 6}px`, paddingRight: '6px' }}
            onClick={() => onSelect?.(chapter.id)}
            title={chapter.title}
        >
            {typeIcon[chapter.type] ?? typeIcon.episode}
        </div>
    );
}

function EmptyDropZone({ parentId, level }) {
    const { setNodeRef, isOver } = useDroppable({ id: `empty-${parentId}` });
    return (
        <div
            ref={setNodeRef}
            className={`py-3 px-4 text-[10px] italic select-none transition-colors border border-dashed ${isOver ? 'text-accent-primary bg-accent-primary/10 border-accent-primary' : 'text-text-muted border-transparent'}`}
            style={{ paddingLeft: `${level * 16 + 24}px` }}
        >
            この中にドロップ
        </div>
    );
}

function SortableTreeItem({
    chapter,
    chapters,
    level = 0,
    onSelect,
    onDelete,
    onDuplicate,
    selectedId,
    onAddChild,
    onUpdate,
}) {
    const children = chapters.filter((c) => c.parentId === chapter.id).sort((a, b) => a.order - b.order);
    const [expanded, setExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(chapter.title);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    const typeIcon = {
        volume: <BookOpen size={14} className="text-amber-700" />,
        chapter: <Layers size={14} className="text-sky-700" />,
        episode: <FileText size={14} className="text-emerald-700" />,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <div
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-all group ${
                    selectedId === chapter.id
                        ? 'bg-accent-primary/20 text-accent-secondary border border-accent-primary/30'
                        : 'hover:bg-bg-hover text-text-secondary border border-transparent'
                }`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => onSelect(chapter.id)}
            >
                <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <GripVertical size={12} className="text-text-muted" />
                </span>
                {children.length > 0 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="shrink-0"
                    >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                )}
                {typeIcon[chapter.type] || typeIcon.episode}
                {isEditing ? (
                    <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => {
                            setIsEditing(false);
                            if (editTitle.trim() !== '' && editTitle !== chapter.title) {
                                onUpdate(chapter.id, { title: editTitle.trim() });
                            } else {
                                setEditTitle(chapter.title);
                            }
                        }}
                        onKeyDown={(e) => {
                            e.stopPropagation(); // KeyboardSensorへの伝播を防ぐ(Enterキーでドラッグが誤作動しないように)
                            if (e.key === 'Enter') {
                                e.target.blur();
                            } else if (e.key === 'Escape') {
                                setEditTitle(chapter.title);
                                setIsEditing(false);
                            }
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()} // PointerSensorへの伝播を防ぐ
                        className="flex-1 text-xs px-1 py-0.5 border border-accent-primary/50 rounded bg-bg-primary text-text-primary outline-none"
                    />
                ) : (
                    <span
                        className="flex-1 text-xs truncate select-none"
                        onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                        title="ダブルクリックで名前を変更"
                    >
                        {chapter.title}
                    </span>
                )}
                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    {chapter.type !== 'episode' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddChild(chapter.id, chapter.type); }}
                            className="p-0.5 hover:text-accent-primary"
                        >
                            <Plus size={12} />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDuplicate(chapter.id); }}
                        className="p-0.5 hover:text-accent-primary"
                        title="複製"
                    >
                        <Copy size={12} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(chapter.id); }}
                        className="p-0.5 hover:text-danger"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
            {expanded && children.length > 0 && (
                <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    <div>
                        {children.map((child) => (
                            <ErrorBoundary key={child.id}>
                                <SortableTreeItem
                                    chapter={child}
                                    chapters={chapters}
                                    level={level + 1}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    onDuplicate={onDuplicate}
                                    selectedId={selectedId}
                                    onAddChild={onAddChild}
                                    onUpdate={onUpdate}
                                />
                            </ErrorBoundary>
                        ))}
                    </div>
                </SortableContext>
            )}
            {expanded && children.length === 0 && chapter.type !== 'episode' && (
                <EmptyDropZone parentId={chapter.id} level={level} />
            )}
        </div>
    );
}

export default function ChapterTree({ collapsed = false }) {
    const {
        chapters,
        loadChapters,
        addChapter,
        duplicateChapter,
        deleteChapter,
        selectChapter,
        selectedChapterId,
        reorderChapters,
        updateChapter,
    } = useNovelStore();
    const { currentProject } = useProjectStore();
    const [activeId, setActiveId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor),
    );

    useEffect(() => {
        if (currentProject) loadChapters(currentProject.id);
    }, [currentProject]);

    const rootChapters = chapters.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);

    const handleSmartAdd = async (type) => {
        if (!currentProject) return;
        const labels = { volume: '新しい巻', chapter: '新しい章', episode: '新しい話' };
        let targetParentId = null;

        if (selectedChapterId) {
            const selected = chapters.find((c) => c.id === selectedChapterId);
            if (selected) {
                if (type === 'volume') {
                    targetParentId = null;
                } else if (type === 'chapter') {
                    if (selected.type === 'volume') {
                        targetParentId = selected.id;
                    } else if (selected.type === 'chapter') {
                        targetParentId = selected.parentId;
                    } else if (selected.type === 'episode') {
                        const parentChapter = chapters.find((c) => c.id === selected.parentId);
                        targetParentId = parentChapter ? parentChapter.parentId : null;
                    }
                } else if (type === 'episode') {
                    if (selected.type === 'volume' || selected.type === 'chapter') {
                        targetParentId = selected.id;
                    } else if (selected.type === 'episode') {
                        targetParentId = selected.parentId;
                    }
                }
            }
        }

        await addChapter(currentProject.id, labels[type], type, targetParentId);
    };

    const handleAddChild = async (parentId, parentType) => {
        if (!currentProject) return;
        const childType = parentType === 'volume' ? 'chapter' : 'episode';
        const labels = { chapter: '新しい章', episode: '新しい話' };
        await addChapter(currentProject.id, labels[childType], childType, parentId);
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !currentProject) return;

        const activeItem = chapters.find((c) => c.id === active.id);
        if (!activeItem) return;

        let targetParentId = null;

        if (String(over.id).startsWith('empty-')) {
            targetParentId = Number(String(over.id).replace('empty-', ''));
        } else {
            const overItem = chapters.find((c) => c.id === over.id);
            if (!overItem) return;

            if (overItem.type === 'volume' || overItem.type === 'chapter') {
                targetParentId = overItem.id;
            } else {
                targetParentId = overItem.parentId;
            }
        }

        // Cycle detection
        if (activeItem.type === 'volume' || activeItem.type === 'chapter') {
            let current = chapters.find((c) => c.id === targetParentId);
            while (current) {
                if (current.id === active.id) {
                    return;
                }
                current = chapters.find((c) => c.id === current.parentId);
            }
        }

        const siblings = chapters.filter((c) => c.parentId === targetParentId).sort((a, b) => a.order - b.order);
        const newOrder = [...siblings];

        // 移動元・移動先の元インデックスを記録してドラッグ方向を判定する
        const activeOriginalIndex = newOrder.findIndex((c) => c.id === active.id);
        const overOriginalIndex = newOrder.findIndex((c) => c.id === over.id);

        // 同じ親内のアクティブアイテムを削除
        if (activeOriginalIndex !== -1) newOrder.splice(activeOriginalIndex, 1);

        // 削除後の over 位置を再取得
        const overIndexAfterRemoval = newOrder.findIndex((c) => c.id === over.id);

        let insertPos;
        if (overIndexAfterRemoval !== -1) {
            // 同じ親内を下方向にドラッグした場合は over の後ろへ挿入
            if (activeOriginalIndex !== -1 && activeOriginalIndex < overOriginalIndex) {
                insertPos = overIndexAfterRemoval + 1;
            } else {
                // 上方向ドラッグまたは異なる親からのドラッグは over の前へ挿入
                insertPos = overIndexAfterRemoval;
            }
        } else {
            insertPos = newOrder.length;
        }

        newOrder.splice(insertPos, 0, activeItem);

        const newOrderIds = newOrder.map((c) => c.id);
        reorderChapters(currentProject.id, newOrderIds, targetParentId);
    };

    return (
        <div className="h-full flex flex-col">
            {collapsed ? (
                // 収納時: アイコンのみ縦並びツールバー
                <div className="p-1 border-b border-border flex flex-col items-center gap-1">
                    <button
                        onClick={() => handleSmartAdd('volume')}
                        className="p-1 rounded hover:bg-bg-hover transition-colors"
                        title="巻を追加"
                    >
                        <FolderPlus size={14} className="text-amber-700" />
                    </button>
                    <button
                        onClick={() => handleSmartAdd('chapter')}
                        className="p-1 rounded hover:bg-bg-hover transition-colors"
                        title="章を追加"
                    >
                        <Layers size={14} className="text-sky-700" />
                    </button>
                    <button
                        onClick={() => handleSmartAdd('episode')}
                        className="p-1 rounded hover:bg-bg-hover transition-colors"
                        title="話を追加"
                    >
                        <FileText size={14} className="text-emerald-700" />
                    </button>
                </div>
            ) : (
                // 展開時: 通常のツールバー
                <div className="px-2 pt-2 pb-1.5 border-b border-border">
                    <h2 className="text-sm font-bold bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent mb-1.5">小説執筆</h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleSmartAdd('volume')}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-700/10 text-amber-700 hover:bg-amber-700/20 transition-colors"
                            title="巻を追加"
                        >
                            <FolderPlus size={12} /> 巻
                        </button>
                        <button
                            onClick={() => handleSmartAdd('chapter')}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-sky-700/10 text-sky-700 hover:bg-sky-700/20 transition-colors"
                            title="章を追加"
                        >
                            <Plus size={12} /> 章
                        </button>
                        <button
                            onClick={() => handleSmartAdd('episode')}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-700/10 text-emerald-700 hover:bg-emerald-700/20 transition-colors"
                            title="話を追加"
                        >
                            <Plus size={12} /> 話
                        </button>
                    </div>
                </div>
            )}

            {collapsed ? (
                // 収納時: DnD なしのフラットアイコンリスト
                <div className="flex-1 overflow-y-auto p-1">
                    {!currentProject
                        ? null
                        : flattenTree(chapters).map(({ chapter, level }) => (
                              <CollapsedTreeItem
                                  key={chapter.id}
                                  chapter={chapter}
                                  level={level}
                                  selectedId={selectedChapterId}
                                  onSelect={selectChapter}
                              />
                          ))}
                </div>
            ) : (
                // 展開時: 通常の DnD ツリー
                <div className="flex-1 overflow-y-auto p-1">
                    {!currentProject ? (
                        <p className="text-center text-text-muted text-xs py-8">プロジェクトを選択してください</p>
                    ) : rootChapters.length === 0 ? (
                        <p className="text-center text-text-muted text-xs py-8">上のボタンで章を追加</p>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={rootChapters.map((c) => c.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {rootChapters.map((chapter) => (
                                    <ErrorBoundary key={chapter.id}>
                                        <SortableTreeItem
                                            chapter={chapter}
                                            chapters={chapters}
                                            onSelect={selectChapter}
                                            onDelete={deleteChapter}
                                            onDuplicate={duplicateChapter}
                                            selectedId={selectedChapterId}
                                            onAddChild={handleAddChild}
                                            onUpdate={updateChapter}
                                        />
                                    </ErrorBoundary>
                                ))}
                            </SortableContext>
                            <DragOverlay>
                                {activeId ? (
                                    <SortableTreeItem
                                        chapter={chapters.find((c) => c.id === activeId)}
                                        chapters={chapters}
                                    />
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>
            )}
        </div>
    );
}
