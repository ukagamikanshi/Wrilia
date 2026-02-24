// RelationGraph と MapEditor で共通のエッジコンポーネント

import { getStraightPath } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

// curvature (px) が 0 でない場合は中点を垂直方向にオフセットした二次ベジェ曲線を返す
function buildEdgePath(sourceX, sourceY, targetX, targetY, curvature) {
    if (!curvature) {
        return getStraightPath({ sourceX, sourceY, targetX, targetY })[0];
    }
    const mx = (sourceX + targetX) / 2;
    const my = (sourceY + targetY) / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // 垂直方向の単位ベクトル
    const px = -dy / len;
    const py = dx / len;
    const cx = mx + px * curvature;
    const cy = my + py * curvature;
    return `M ${sourceX} ${sourceY} Q ${cx} ${cy} ${targetX} ${targetY}`;
}

// 二次ベジェ (t=0.5) の座標: ラベル配置用
function getCurveLabel(sourceX, sourceY, targetX, targetY, curvature) {
    if (!curvature) {
        return { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
    }
    const mx = (sourceX + targetX) / 2;
    const my = (sourceY + targetY) / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const cx = mx + px * curvature;
    const cy = my + py * curvature;
    return {
        x: 0.25 * sourceX + 0.5 * cx + 0.25 * targetX,
        y: 0.25 * sourceY + 0.5 * cy + 0.25 * targetY,
    };
}

// ── エッジ (インラインラベル編集・ドラッグ移動対応) ──
export function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, data, style, markerEnd, markerStart, selected }) {
    const [editing, setEditing] = useState(false);
    const [label, setLabel] = useState(data?.label || '');
    const inputRef = useRef(null);
    const dragStart = useRef(null);

    useEffect(() => {
        setLabel(data?.label || '');
    }, [data?.label]);
    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const curvature = data?.curvature || 0;
    const edgePath = buildEdgePath(sourceX, sourceY, targetX, targetY, curvature);
    const { x: midX, y: midY } = getCurveLabel(sourceX, sourceY, targetX, targetY, curvature);

    const finishEdit = () => {
        setEditing(false);
        if (label !== (data?.label || '')) data?.onLabelChange?.(id, label);
    };

    const edgeColor = style?.stroke || data?.color || '#8b5cf6';

    // ライン全体をドラッグ (両端の anchor ノードを同時移動)
    const handleLineMouseDown = (e) => {
        if (e.button !== 0 || editing) return;
        e.stopPropagation();
        dragStart.current = { x: e.clientX, y: e.clientY };
        const handleMouseMove = (ev) => {
            if (!dragStart.current) return;
            const dx = ev.clientX - dragStart.current.x;
            const dy = ev.clientY - dragStart.current.y;
            dragStart.current = { x: ev.clientX, y: ev.clientY };
            data?.onDragLine?.(id, dx, dy);
        };
        const handleMouseUp = () => {
            dragStart.current = null;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <>
            <path
                d={edgePath}
                fill="none"
                stroke={edgeColor}
                strokeWidth={style?.strokeWidth || data?.strokeWidth || 2.5}
                markerEnd={markerEnd}
                markerStart={markerStart}
                className={selected ? 'relation-edge-selected' : ''}
            />
            {/* クリック・ドラッグしやすくするための透明な太パス */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                onMouseDown={handleLineMouseDown}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditing(true);
                }}
                style={{ cursor: 'grab' }}
            />
            {(data?.label || editing) && (
                <foreignObject
                    x={midX - 60}
                    y={midY - 14}
                    width={120}
                    height={28}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditing(true);
                    }}
                    style={{ overflow: 'visible', pointerEvents: 'all' }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%',
                            height: '100%',
                        }}
                    >
                        {editing ? (
                            <input
                                ref={inputRef}
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                onBlur={finishEdit}
                                onKeyDown={(e) => e.key === 'Enter' && finishEdit()}
                                className="relation-edge-label-input"
                                style={{ color: edgeColor }}
                            />
                        ) : (
                            <div
                                className="relation-edge-label"
                                style={{
                                    color: edgeColor,
                                    backgroundColor: 'rgba(253,251,240,0.9)',
                                    padding: '1px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                }}
                            >
                                {data.label}
                            </div>
                        )}
                    </div>
                </foreignObject>
            )}
        </>
    );
}
