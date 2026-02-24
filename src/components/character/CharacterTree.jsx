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
import { ChevronDown, ChevronRight, FolderOpen, GripVertical, Plus, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import useCharacterStore from '../../stores/characterStore';
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

function SortableCharacterItem({ character, characters, level = 0, onSelect, onDelete, selectedId, onUpdate }) {
    const children = characters.filter((c) => c.parentId === character.id).sort((a, b) => a.order - b.order);
    const [expanded, setExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(character.name);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: character.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    const isFolder = character.type === 'folder';

    const handleDragStart = (e) => {
        if (!isFolder) {
            e.dataTransfer.setData('characterId', String(character.id));
            e.dataTransfer.setData('application/reactflow', 'characterNode');
            e.dataTransfer.effectAllowed = 'copy';
            console.log('Native Drag Start:', character.name, character.id);
        }
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all group ${
                    selectedId === character.id
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
                    <User size={14} className="text-sky-400" />
                )}

                {isEditing ? (
                    <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => {
                            setIsEditing(false);
                            if (editName.trim() !== '' && editName !== character.name) {
                                onUpdate(character.id, { name: editName.trim() });
                            } else {
                                setEditName(character.name);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                            else if (e.key === 'Escape') {
                                setEditName(character.name);
                                setIsEditing(false);
                            }
                        }}
                        autoFocus
                        className="flex-1 text-xs px-1 py-0.5 border border-accent-primary/50 rounded bg-bg-primary text-text-primary outline-none"
                    />
                ) : (
                    <span
                        className="flex-1 text-xs truncate select-none cursor-pointer"
                        onClick={() => onSelect(character.id)}
                        onDoubleClick={() => setIsEditing(true)}
                        draggable={!isFolder}
                        onDragStart={handleDragStart}
                        title={
                            isFolder
                                ? 'ダブルクリックでフォルダ名を変更'
                                : 'キャンバスにドラッグして配置 / ダブルクリックで名前変更'
                        }
                    >
                        {character.name}
                    </span>
                )}

                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    <button onClick={() => onDelete(character.id)} className="p-0.5 hover:text-danger" title="削除">
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {isFolder && expanded && children.length > 0 && (
                <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    <div>
                        {children.map((child) => (
                            <SortableCharacterItem
                                key={child.id}
                                character={child}
                                characters={characters}
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
                <EmptyFolderDropZone parentId={character.id} level={level} />
            )}
        </div>
    );
}

export default function CharacterTree({ onAddCharacter }) {
    const {
        characters,
        addCharacterFolder,
        deleteCharacter,
        selectCharacter,
        selectedCharacterId,
        reorderCharacters,
        updateCharacter,
    } = useCharacterStore();
    const { currentProject } = useProjectStore();
    const [activeId, setActiveId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const rootCharacters = characters.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);

    const handleAddFolder = async () => {
        if (!currentProject) return;
        await addCharacterFolder(currentProject.id, '新しいフォルダ');
    };

    const handleDragStart = (event) => {
        if (!event.active?.data?.current?.sortable) return;
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !currentProject) return;

        const activeChar = characters.find((c) => c.id === active.id);
        if (!activeChar) return;

        let targetParentId = null;
        let newOrderIds = [];

        if (String(over.id).startsWith('empty-')) {
            targetParentId = Number(String(over.id).replace('empty-', ''));
        } else {
            const overChar = characters.find((c) => c.id === over.id);
            if (!overChar) return;

            // If dropped onto a folder, place it inside the folder
            if (overChar.type === 'folder') {
                targetParentId = overChar.id;
            } else {
                targetParentId = overChar.parentId;
            }
        }

        // Prevent dropping a folder inside itself or its descendants
        if (activeChar.type === 'folder') {
            let current = characters.find((c) => c.id === targetParentId);
            while (current) {
                if (current.id === active.id) return; // Cycle detected
                current = characters.find((c) => c.id === current.parentId);
            }
        }

        const siblings = characters.filter((c) => c.parentId === targetParentId).sort((a, b) => a.order - b.order);
        const activeIndex = siblings.findIndex((c) => c.id === active.id);
        const overIndex = siblings.findIndex((c) => c.id === over.id);

        if (activeIndex !== -1 && overIndex !== -1 && targetParentId === activeChar.parentId) {
            // Moving within the same parent
            const newSiblings = arrayMove(siblings, activeIndex, overIndex);
            newOrderIds = newSiblings.map((c) => c.id);
        } else {
            // Moving to a different parent
            const filtered = siblings.filter((c) => c.id !== active.id);
            // Insert activeChar at overIndex
            filtered.splice(overIndex >= 0 ? overIndex : 0, 0, activeChar);
            newOrderIds = filtered.map((c) => c.id);
        }

        reorderCharacters(currentProject.id, newOrderIds, targetParentId);
    };

    return (
        <div className="h-full flex flex-col bg-bg-secondary w-[200px] min-w-[150px] max-w-[400px] resize-x overflow-auto border-r border-border">
            <div className="p-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary flex items-center gap-1">
                    <User size={14} /> 人物一覧 ({characters.filter((c) => c.type !== 'folder').length})
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
                        onClick={onAddCharacter}
                        className="p-1 rounded bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
                        title="人物を追加"
                    >
                        <Plus size={12} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1 pb-20">
                {!currentProject ? (
                    <p className="text-center text-text-muted text-xs py-8">プロジェクトを選択</p>
                ) : rootCharacters.length === 0 ? (
                    <p className="text-center text-text-muted text-xs py-8">上のボタンで追加</p>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={rootCharacters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                            {rootCharacters.map((char) => (
                                <SortableCharacterItem
                                    key={char.id}
                                    character={char}
                                    characters={characters}
                                    onSelect={selectCharacter}
                                    onDelete={deleteCharacter}
                                    selectedId={selectedCharacterId}
                                    onUpdate={updateCharacter}
                                />
                            ))}
                        </SortableContext>
                        <DragOverlay>
                            {activeId ? (
                                <SortableCharacterItem
                                    character={characters.find((c) => c.id === activeId)}
                                    characters={characters}
                                />
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
