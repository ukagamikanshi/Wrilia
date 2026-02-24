// RelationGraph と MapEditor で共通のプロパティパネル
// entityNodeType prop で各エディタのエンティティノード種別を判別する

import { MarkerType } from '@xyflow/react';
import { ArrowRight, Minus, RotateCw, Trash2, Unlink } from 'lucide-react';
import { DRAW_COLORS, RECT_BG_COLORS } from './constants';

/**
 * @param {object} props
 * @param {string[]} props.selectedNodes
 * @param {string[]} props.selectedEdges
 * @param {object[]} props.nodes
 * @param {object[]} props.edges
 * @param {Function} props.onUpdateNode
 * @param {Function} props.onUpdateEdge
 * @param {Function} props.onDeleteNode
 * @param {Function} props.onDeleteEdge
 * @param {Function} props.onReverseEdge
 * @param {Function} props.onDisconnectEdge
 * @param {string}   props.entityNodeType - 例: 'characterNode' / 'locationNode'
 */
export function PropertiesPanel({
    selectedNodes,
    selectedEdges,
    nodes,
    edges,
    onUpdateNode,
    onUpdateEdge,
    onDeleteNode,
    onDeleteEdge,
    onReverseEdge,
    onDisconnectEdge,
    entityNodeType,
}) {
    const node = selectedNodes.length === 1 ? nodes.find((n) => n.id === selectedNodes[0]) : null;
    const edge = selectedEdges.length === 1 ? edges.find((e) => e.id === selectedEdges[0]) : null;

    if (!node && !edge) return null;

    if (node) {
        // エンティティノード (キャラクター / 場所) は別途モーダルで編集するためここでは表示しない
        if (node.type === entityNodeType) return null;
        const isRect = node.type === 'rectNode';
        const isText = node.type === 'textNode';
        return (
            <div className="relation-props-panel">
                <div className="relation-props-header">
                    <span>{isRect ? '矩形の設定' : 'テキストの設定'}</span>
                    <button onClick={() => onDeleteNode(node.id)} className="relation-props-delete" title="削除">
                        <Trash2 size={14} />
                    </button>
                </div>
                {isRect && (
                    <div className="relation-props-body">
                        <label>ラベル</label>
                        <input
                            value={node.data.label || ''}
                            onChange={(e) => onUpdateNode(node.id, { data: { ...node.data, label: e.target.value } })}
                        />
                        <label>枠色</label>
                        <div className="relation-color-grid">
                            {DRAW_COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    className={`relation-color-swatch ${(node.data.borderColor || '#22c55e') === c.value ? 'active' : ''}`}
                                    style={{
                                        backgroundColor: c.value,
                                        border: c.value === '#ffffff' ? '1px solid #ccc' : 'none',
                                    }}
                                    onClick={() =>
                                        onUpdateNode(node.id, { data: { ...node.data, borderColor: c.value } })
                                    }
                                />
                            ))}
                        </div>
                        <label>背景色</label>
                        <div className="relation-color-grid">
                            {RECT_BG_COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    className={`relation-color-swatch ${(node.data.bgColor || 'rgba(187,222,186,0.45)') === c.value ? 'active' : ''}`}
                                    style={{ backgroundColor: c.value, border: '1px solid #ccc' }}
                                    onClick={() => onUpdateNode(node.id, { data: { ...node.data, bgColor: c.value } })}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {isText && (
                    <div className="relation-props-body">
                        <label>テキスト</label>
                        <textarea
                            value={node.data.label || ''}
                            rows={3}
                            onChange={(e) => onUpdateNode(node.id, { data: { ...node.data, label: e.target.value } })}
                        />
                        <label>文字色</label>
                        <div className="relation-color-grid">
                            {DRAW_COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    className={`relation-color-swatch ${(node.data.textColor || '#2E4C38') === c.value ? 'active' : ''}`}
                                    style={{
                                        backgroundColor: c.value,
                                        border: c.value === '#ffffff' ? '1px solid #ccc' : 'none',
                                    }}
                                    onClick={() =>
                                        onUpdateNode(node.id, { data: { ...node.data, textColor: c.value } })
                                    }
                                />
                            ))}
                        </div>
                        <label>サイズ: {node.data.fontSize || 14}px</label>
                        <input
                            type="range"
                            min={10}
                            max={36}
                            value={node.data.fontSize || 14}
                            onChange={(e) =>
                                onUpdateNode(node.id, { data: { ...node.data, fontSize: Number(e.target.value) } })
                            }
                        />
                    </div>
                )}
            </div>
        );
    }

    if (edge) {
        const hasArrow = !!edge.markerEnd;
        const edgeColor = edge.data?.color || '#8b5cf6';
        return (
            <div className="relation-props-panel">
                <div className="relation-props-header">
                    <span>線の設定</span>
                    <button onClick={() => onDeleteEdge(edge.id)} className="relation-props-delete" title="削除">
                        <Trash2 size={14} />
                    </button>
                </div>
                <div className="relation-props-body">
                    <label>ラベル</label>
                    <input
                        value={edge.data?.label || ''}
                        onChange={(e) => onUpdateEdge(edge.id, { data: { ...edge.data, label: e.target.value } })}
                    />
                    <label>矢印</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            className="relation-arrow-btn"
                            title="矢印の向きを反転"
                            onClick={() => onReverseEdge(edge.id)}
                        >
                            <RotateCw size={13} /> 反転
                        </button>
                        <button
                            className="relation-arrow-btn"
                            title={hasArrow ? '矢印を消す' : '矢印を付ける'}
                            onClick={() =>
                                onUpdateEdge(edge.id, {
                                    markerEnd: hasArrow
                                        ? undefined
                                        : { type: MarkerType.ArrowClosed, color: edgeColor },
                                })
                            }
                        >
                            {hasArrow ? (
                                <>
                                    <Minus size={13} /> 矢印OFF
                                </>
                            ) : (
                                <>
                                    <ArrowRight size={13} /> 矢印ON
                                </>
                            )}
                        </button>
                    </div>
                    <label>色</label>
                    <div className="relation-color-grid">
                        {DRAW_COLORS.map((c) => (
                            <button
                                key={c.value}
                                className={`relation-color-swatch ${(edge.data?.color || '#8b5cf6') === c.value ? 'active' : ''}`}
                                style={{
                                    backgroundColor: c.value,
                                    border: c.value === '#ffffff' ? '1px solid #ccc' : 'none',
                                }}
                                onClick={() =>
                                    onUpdateEdge(edge.id, {
                                        data: { ...edge.data, color: c.value },
                                        style: { ...edge.style, stroke: c.value },
                                        markerEnd: edge.markerEnd ? { ...edge.markerEnd, color: c.value } : undefined,
                                    })
                                }
                            />
                        ))}
                    </div>
                    <label>太さ: {edge.data?.strokeWidth || 2.5}px</label>
                    <input
                        type="range"
                        min={1}
                        max={8}
                        step={0.5}
                        value={edge.data?.strokeWidth || 2.5}
                        onChange={(e) =>
                            onUpdateEdge(edge.id, {
                                data: { ...edge.data, strokeWidth: Number(e.target.value) },
                                style: { ...edge.style, strokeWidth: Number(e.target.value) },
                            })
                        }
                    />
                    {/* エンティティノードへの接続解除 */}
                    {(() => {
                        const srcNode = nodes.find((n) => n.id === edge.source);
                        const tgtNode = nodes.find((n) => n.id === edge.target);
                        const srcIsEntity = srcNode?.type === entityNodeType;
                        const tgtIsEntity = tgtNode?.type === entityNodeType;
                        if (!srcIsEntity && !tgtIsEntity) return null;
                        return (
                            <>
                                <label>接続解除</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {srcIsEntity && (
                                        <button
                                            className="relation-arrow-btn"
                                            onClick={() => onDisconnectEdge(edge.id, 'source')}
                                        >
                                            <Unlink size={13} /> {srcNode.data.label || '始点'}を解除
                                        </button>
                                    )}
                                    {tgtIsEntity && (
                                        <button
                                            className="relation-arrow-btn"
                                            onClick={() => onDisconnectEdge(edge.id, 'target')}
                                        >
                                            <Unlink size={13} /> {tgtNode.data.label || '終点'}を解除
                                        </button>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>
        );
    }

    return null;
}
