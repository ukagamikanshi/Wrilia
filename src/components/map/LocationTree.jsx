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
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, FolderOpen, GripVertical, MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import useMapStore from '../../stores/mapStore';
import useProjectStore from '../../stores/projectStore';

function EmptyFolderDropZone({ parentId, level }) {
    const { setNodeRef, isOver } = useDroppable({ id: `empty-${parentId}` });
    return (
        <div
            ref={setNodeRef}
            className={`py-3 px-4 text-[10px] italic select-none transition-colors border border-dashed ${isOver ? 'text-accent-primary bg-accent-primary/10 border-accent-primary' : 'text-text-muted border-transparent'}`}
            style={{ paddingLeft: `${level * 16 + 24}px` }}
        >
            このフォルダにドロップ
        </div>
    );
}

function SortableLocationItem({ location, locations, level = 0, onSelect, onDelete, selectedId, onUpdate }) {
    const children = locations.filter((c) => c.parentId === location.id).sort((a, b) => a.order - b.order);
    const [expanded, setExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(location.name);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: location.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    const isFolder = location.type === 'folder';

    const handleDragStart = (e) => {
        if (!isFolder) {
            e.dataTransfer.setData('locationId', String(location.id));
            e.dataTransfer.setData('application/reactflow', 'locationNode');
            e.dataTransfer.effectAllowed = 'copy';
        }
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all group ${
                    selectedId === location.id
                        ? 'bg-accent-primary/20 text-accent-secondary border border-accent-primary/30'
                        : 'hover:bg-bg-hover text-text-secondary border border-transparent'
                }`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity flex items-center p-1"
                >
                    <GripVertical size={12} className="text-text-muted" />
                </div>
                {isFolder && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="shrink-0 text-text-muted hover:text-text-primary"
                    >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                )}
                {isFolder ? (
                    <FolderOpen size={14} className="text-amber-400" />
                ) : (
                    <MapPin size={14} className="text-emerald-400" />
                )}

                {isEditing ? (
                    <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => {
                            setIsEditing(false);
                            if (editName.trim() !== '' && editName !== location.name) {
                                onUpdate(location.id, { name: editName.trim() });
                            } else {
                                setEditName(location.name);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                            else if (e.key === 'Escape') {
                                setEditName(location.name);
                                setIsEditing(false);
                            }
                        }}
                        autoFocus
                        className="flex-1 text-xs px-1 py-0.5 border border-accent-primary/50 rounded bg-bg-primary text-text-primary outline-none"
                    />
                ) : (
                    <span
                        className="flex-1 text-xs truncate select-none cursor-pointer"
                        onClick={() => onSelect(location.id)}
                        onDoubleClick={() => setIsEditing(true)}
                        draggable={!isFolder}
                        onDragStart={handleDragStart}
                        title={
                            isFolder
                                ? 'ダブルクリックでフォルダ名を変更'
                                : 'キャンバスにドラッグして配置 / ダブルクリックで名前変更'
                        }
                    >
                        {location.name}
                    </span>
                )}

                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    <button onClick={() => onDelete(location.id)} className="p-0.5 hover:text-danger" title="削除">
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {isFolder && expanded && children.length > 0 && (
                <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    <div>
                        {children.map((child) => (
                            <SortableLocationItem
                                key={child.id}
                                location={child}
                                locations={locations}
                                level={level + 1}
                                onSelect={onSelect}
                                onDelete={onDelete}
                                selectedId={selectedId}
                                onUpdate={onUpdate}
                            />
                        ))}
                    </div>
                </SortableContext>
            )}
            {isFolder && expanded && children.length === 0 && (
                <EmptyFolderDropZone parentId={location.id} level={level} />
            )}
        </div>
    );
}

export default function LocationTree({ onAddLocation }) {
    const {
        locations,
        addLocationFolder,
        deleteLocation,
        selectLocation,
        selectedLocationId,
        reorderLocations,
        updateLocation,
    } = useMapStore();
    const { currentProject } = useProjectStore();
    const [activeId, setActiveId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const rootLocations = locations.filter((c) => !c.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));

    const handleAddFolder = async () => {
        if (!currentProject) return;
        await addLocationFolder(currentProject.id, '新しいフォルダ');
    };

    const handleDragStart = (event) => {
        if (!event.active?.data?.current?.sortable) return;
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !currentProject) return;

        const activeLoc = locations.find((c) => c.id === active.id);
        if (!activeLoc) return;

        let targetParentId = null;
        let newOrderIds = [];

        if (String(over.id).startsWith('empty-')) {
            targetParentId = Number(String(over.id).replace('empty-', ''));
        } else {
            const overLoc = locations.find((c) => c.id === over.id);
            if (!overLoc) return;

            if (overLoc.type === 'folder') {
                targetParentId = overLoc.id;
            } else {
                targetParentId = overLoc.parentId;
            }
        }

        if (activeLoc.type === 'folder') {
            let current = locations.find((c) => c.id === targetParentId);
            while (current) {
                if (current.id === active.id) return;
                current = locations.find((c) => c.id === current.parentId);
            }
        }

        const siblings = locations
            .filter((c) => c.parentId === targetParentId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const activeIndex = siblings.findIndex((c) => c.id === active.id);
        const overIndex = siblings.findIndex((c) => c.id === over.id);

        if (activeIndex !== -1 && overIndex !== -1 && targetParentId === activeLoc.parentId) {
            const newSiblings = arrayMove(siblings, activeIndex, overIndex);
            newOrderIds = newSiblings.map((c) => c.id);
        } else {
            const filtered = siblings.filter((c) => c.id !== active.id);
            filtered.splice(overIndex >= 0 ? overIndex : 0, 0, activeLoc);
            newOrderIds = filtered.map((c) => c.id);
        }

        reorderLocations(currentProject.id, newOrderIds, targetParentId);
    };

    return (
        <div className="h-full flex flex-col bg-bg-secondary w-[200px] min-w-[150px] max-w-[400px] resize-x overflow-auto border-r border-border">
            <div className="p-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary flex items-center gap-1">
                    <MapPin size={14} /> 場所一覧 ({locations.filter((c) => c.type !== 'folder').length})
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleAddFolder}
                        className="p-1 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                        title="フォルダを追加"
                    >
                        <FolderOpen size={12} />
                    </button>
                    <button
                        onClick={onAddLocation}
                        className="p-1 rounded bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
                        title="場所を追加"
                    >
                        <Plus size={12} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1 pb-20">
                {!currentProject ? (
                    <p className="text-center text-text-muted text-xs py-8">プロジェクトを選択</p>
                ) : rootLocations.length === 0 ? (
                    <p className="text-center text-text-muted text-xs py-8">上のボタンで追加</p>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={rootLocations.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                            {rootLocations.map((loc) => (
                                <SortableLocationItem
                                    key={loc.id}
                                    location={loc}
                                    locations={locations}
                                    onSelect={selectLocation}
                                    onDelete={deleteLocation}
                                    selectedId={selectedLocationId}
                                    onUpdate={updateLocation}
                                />
                            ))}
                        </SortableContext>
                        <DragOverlay>
                            {activeId ? (
                                <SortableLocationItem
                                    location={locations.find((c) => c.id === activeId)}
                                    locations={locations}
                                />
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
