// RelationGraph と MapEditor で共通のノードコンポーネント

import { Handle, NodeResizer, Position } from '@xyflow/react';
import { User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// ── Rect Node (Group Box) ──
export function RectNode({ data, selected, id }) {
    const [editing, setEditing] = useState(false);
    const [label, setLabel] = useState(data.label || '');
    const inputRef = useRef(null);

    useEffect(() => {
        setLabel(data.label || '');
    }, [data.label]);
    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        setEditing(true);
    };

    const finishEdit = () => {
        setEditing(false);
        if (label !== data.label) data.onLabelChange?.(id, label);
    };

    return (
        <div
            className="relation-rect-node"
            onDoubleClick={handleDoubleClick}
            style={{
                backgroundColor: data.bgColor || 'rgba(187,222,186,0.45)',
                borderColor: data.borderColor || '#22c55e',
                borderWidth: `${data.borderWidth || 2}px`,
                borderRadius: `${data.borderRadius || 12}px`,
            }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={80}
                minHeight={50}
                lineClassName="relation-resize-line"
                handleClassName="relation-resize-handle"
            />
            <Handle type="source" position={Position.Top} className="relation-handle" id="top" />
            <Handle type="source" position={Position.Bottom} className="relation-handle" id="bottom" />
            <Handle type="source" position={Position.Left} className="relation-handle" id="left" />
            <Handle type="source" position={Position.Right} className="relation-handle" id="right" />
            <Handle type="target" position={Position.Top} className="relation-handle-target" id="top" />
            <Handle type="target" position={Position.Bottom} className="relation-handle-target" id="bottom" />
            <Handle type="target" position={Position.Left} className="relation-handle-target" id="left" />
            <Handle type="target" position={Position.Right} className="relation-handle-target" id="right" />
            {data.label && (
                <div className="relation-rect-label" style={{ color: data.labelColor || '#2E4C38' }}>
                    {editing ? (
                        <input
                            ref={inputRef}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onBlur={finishEdit}
                            onKeyDown={(e) => e.key === 'Enter' && finishEdit()}
                            className="relation-inline-input"
                            style={{ color: data.labelColor || '#2E4C38' }}
                        />
                    ) : (
                        <span className="font-bold text-sm">{data.label}</span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Text Node ──
export function TextNode({ data, selected, id }) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(data.label || '');
    const inputRef = useRef(null);

    useEffect(() => {
        setText(data.label || '');
    }, [data.label]);
    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        setEditing(true);
    };

    const finishEdit = () => {
        setEditing(false);
        if (text !== data.label) data.onLabelChange?.(id, text);
    };

    return (
        <div
            className={`relation-text-node ${selected ? 'relation-text-selected' : ''}`}
            onDoubleClick={handleDoubleClick}
        >
            <Handle type="source" position={Position.Top} className="relation-handle" id="top" />
            <Handle type="source" position={Position.Bottom} className="relation-handle" id="bottom" />
            <Handle type="source" position={Position.Left} className="relation-handle" id="left" />
            <Handle type="source" position={Position.Right} className="relation-handle" id="right" />
            <Handle type="target" position={Position.Top} className="relation-handle-target" id="top" />
            <Handle type="target" position={Position.Bottom} className="relation-handle-target" id="bottom" />
            <Handle type="target" position={Position.Left} className="relation-handle-target" id="left" />
            <Handle type="target" position={Position.Right} className="relation-handle-target" id="right" />
            {editing ? (
                <textarea
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={finishEdit}
                    className="relation-inline-textarea"
                    style={{
                        color: data.textColor || '#2E4C38',
                        fontSize: `${data.fontSize || 14}px`,
                        fontWeight: data.fontWeight || 'bold',
                    }}
                    rows={Math.max(1, text.split('\n').length)}
                />
            ) : (
                <span
                    style={{
                        color: data.textColor || '#2E4C38',
                        fontSize: `${data.fontSize || 14}px`,
                        fontWeight: data.fontWeight || 'bold',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {data.label || 'テキスト'}
                </span>
            )}
        </div>
    );
}

// ── Anchor Node (ラインの端点として使うドラッグ可能な点) ──
export function AnchorNode({ data, selected }) {
    const accentColor = data?.color || '#8b5cf6';
    return (
        <div
            className="relation-anchor-visible"
            style={{
                backgroundColor: selected ? accentColor : 'transparent',
                borderColor: accentColor,
            }}
        >
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={false}
                style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={false}
                style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
        </div>
    );
}

// ── エンティティノード (キャラクター / 場所 で共通の見た目) ──
// data.onSelect, data.label, data.image, data.borderColor を使用
export function EntityNode({ data, selected }) {
    const handleClick = (e) => {
        e.stopPropagation();
        data.onSelect?.(data.entityId);
    };

    return (
        <div
            className="relation-character-node"
            onClick={handleClick}
            style={{ borderColor: data.borderColor || '#8B2535' }}
        >
            <Handle type="source" position={Position.Top} className="relation-handle-dot" id="top" />
            <Handle type="source" position={Position.Bottom} className="relation-handle-dot" id="bottom" />
            <Handle type="source" position={Position.Left} className="relation-handle-dot" id="left" />
            <Handle type="source" position={Position.Right} className="relation-handle-dot" id="right" />
            <Handle type="target" position={Position.Top} className="relation-handle-target" id="top" />
            <Handle type="target" position={Position.Bottom} className="relation-handle-target" id="bottom" />
            <Handle type="target" position={Position.Left} className="relation-handle-target" id="left" />
            <Handle type="target" position={Position.Right} className="relation-handle-target" id="right" />

            {data.image ? (
                <div className="relation-char-image">
                    <img src={data.image} alt={data.label} />
                </div>
            ) : (
                <div className="relation-char-placeholder">
                    <User size={28} />
                </div>
            )}
            <div className="relation-char-name">{data.label}</div>
            {selected && <div className="relation-node-selected-ring" />}
        </div>
    );
}
