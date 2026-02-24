import {
    applyEdgeChanges,
    applyNodeChanges,
    Background,
    Controls,
    MarkerType,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import {
    AlignHorizontalSpaceAround,
    Copy,
    Heart,
    Layers,
    Minus,
    Redo2,
    ThumbsDown,
    ThumbsUp,
    Trash2,
    Undo2,
    UserPlus,
    X,
} from 'lucide-react';
import db from '../../db/database';
import useCharacterStore from '../../stores/characterStore';
import useProjectStore from '../../stores/projectStore';
import { DrawingOverlay } from '../shared/graphEditor/DrawingOverlay';
import { LabeledEdge } from '../shared/graphEditor/LabeledEdge';
import { PropertiesPanel } from '../shared/graphEditor/PropertiesPanel';
// 共有コンポーネント
import { AnchorNode, EntityNode, RectNode, TextNode } from '../shared/graphEditor/SharedNodes';
import { serializeEdges, serializeNodes } from '../shared/graphEditor/serialization';
import { ToolPalette } from '../shared/graphEditor/ToolPalette';
import CharacterDetail from './CharacterDetail';
import CharacterTree from './CharacterTree';

// ── 人物ノード (EntityNode に characterId を entityId として渡すラッパー) ──
function CharacterNode({ data, selected }) {
    return <EntityNode data={{ ...data, entityId: data.characterId }} selected={selected} />;
}

const nodeTypes = { characterNode: CharacterNode, rectNode: RectNode, textNode: TextNode, anchorNode: AnchorNode };
const edgeTypes = { labeled: LabeledEdge };

// 人物相関図固有のシンボルツール (感情記号)
const SYMBOL_TOOLS = [
    { mode: 'symbol-heart', icon: Heart, label: '♥' },
    { mode: 'symbol-like', icon: ThumbsUp, label: '好き' },
    { mode: 'symbol-dislike', icon: ThumbsDown, label: '嫌い' },
];

// キャラクターカラー名から枠色 hex を返す
function getCharBorderColor(colorName) {
    const map = {
        zinc: '#71717a',
        emerald: '#10b981',
        sky: '#0ea5e9',
        amber: '#f59e0b',
        rose: '#f43f5e',
        purple: '#a855f7',
        pink: '#ec4899',
        indigo: '#6366f1',
        teal: '#14b8a6',
        orange: '#f97316',
    };
    return map[colorName] || '#8B2535';
}

// ── メインコンポーネント ──
function RelationGraphInner() {
    const {
        characters,
        loadCharacters,
        addCharacter,
        selectedCharacterId,
        selectCharacter,
        relationPatterns,
        loadRelationPatterns,
        addRelationPattern,
        deleteRelationPattern,
        loadRelationships,
    } = useCharacterStore();
    const currentProject = useProjectStore((s) => s.currentProject);
    const [selectedPatternId, setSelectedPatternId] = useState(null);
    const [showDetail, setShowDetail] = useState(false);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [drawMode, setDrawMode] = useState('select');
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [rectBgColor, setRectBgColor] = useState('rgba(187,222,186,0.45)');
    const [selectedNodeIds, setSelectedNodeIds] = useState([]);
    const [selectedEdgeIds, setSelectedEdgeIds] = useState([]);
    const [showAlignPanel, setShowAlignPanel] = useState(false);
    const [alignGapX, setAlignGapX] = useState(180);
    const [alignGapY, setAlignGapY] = useState(160);

    // パターン追加/複製モーダル
    const [showPatternModal, setShowPatternModal] = useState(false);
    const [patternNameInput, setPatternNameInput] = useState('');
    const [patternModalMode, setPatternModalMode] = useState('add');

    const saveTimer = useRef(null);
    const skipSave = useRef(true);
    const graphBuilt = useRef(false);

    // Undo/Redo 履歴
    const history = useRef([]);
    const historyIndex = useRef(-1);
    const isUndoRedoAction = useRef(false);

    const reactFlowInstance = useReactFlow();
    const reactFlowWrapper = useRef(null);

    // ── ノード/エッジへのコールバック注入 ──
    const onSelectChar = useCallback(
        (id) => {
            selectCharacter(id);
            setShowDetail(true);
        },
        [selectCharacter],
    );

    const onLabelChange = useCallback((nodeId, newLabel) => {
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n)));
    }, []);

    const onEdgeLabelChange = useCallback((edgeId, newLabel) => {
        setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, label: newLabel } } : e)));
    }, []);

    const nodesWithCallbacks = useMemo(() => {
        return nodes.map((n) => {
            if (n.type === 'characterNode') {
                return { ...n, data: { ...n.data, onSelect: onSelectChar } };
            }
            return { ...n, data: { ...n.data, onLabelChange } };
        });
    }, [nodes, onSelectChar, onLabelChange]);

    const handleDragLine = useCallback(
        (edgeId, dxScreen, dyScreen) => {
            const edge = edges.find((e) => e.id === edgeId);
            if (!edge) return;
            const viewport = reactFlowInstance.getViewport();
            const dx = dxScreen / viewport.zoom;
            const dy = dyScreen / viewport.zoom;
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id === edge.source || n.id === edge.target) {
                        return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
                    }
                    return n;
                }),
            );
        },
        [edges, reactFlowInstance],
    );

    const edgesWithCallbacks = useMemo(() => {
        return edges.map((e) => ({
            ...e,
            data: { ...e.data, onLabelChange: onEdgeLabelChange, onDragLine: handleDragLine },
        }));
    }, [edges, onEdgeLabelChange, handleDragLine]);

    // ── 初期化: DBからグラフを読み込む ──
    useEffect(() => {
        if (!currentProject) return;
        let cancelled = false;
        skipSave.current = true;
        graphBuilt.current = false;

        const init = async () => {
            const projectId = currentProject.id;
            await loadCharacters(projectId);
            await loadRelationPatterns(projectId);
            if (cancelled) return;

            let patterns = await db.relationPatterns.where('projectId').equals(projectId).toArray();
            if (patterns.length === 0) {
                await db.relationPatterns.add({
                    projectId,
                    name: 'メイン',
                    chapterId: null,
                    nodesData: '[]',
                    edgesData: '[]',
                    createdAt: Date.now(),
                });
                await loadRelationPatterns(projectId);
                patterns = await db.relationPatterns.where('projectId').equals(projectId).toArray();
            }
            if (patterns.length === 0 || cancelled) return;

            const patternId = patterns[0].id;
            setSelectedPatternId(patternId);
            await loadRelationships(patternId);
            if (cancelled) return;

            const chars = await db.characters.where('projectId').equals(projectId).toArray();
            const pattern = patterns[0];

            let savedNodes = [],
                savedEdges = [];
            try {
                savedNodes = JSON.parse(pattern.nodesData || '[]');
            } catch {}
            try {
                savedEdges = JSON.parse(pattern.edgesData || '[]');
            } catch {}
            const savedMap = new Map(savedNodes.map((n) => [n.id, n]));

            // 保存済みキャラクターノードを復元
            const charNodes = [];
            chars
                .filter((c) => c.type !== 'folder')
                .forEach((char) => {
                    const nodeId = `char-${char.id}`;
                    const saved = savedMap.get(nodeId);
                    if (saved) {
                        savedMap.delete(nodeId);
                        charNodes.push({
                            ...saved,
                            data: {
                                ...saved.data,
                                label: char.name,
                                image: char.image,
                                characterId: char.id,
                                borderColor: char.color ? getCharBorderColor(char.color) : '#8B2535',
                            },
                        });
                    }
                });

            // その他のノードを復元 (旧ノード種別の移行も含む)
            const otherNodes = [];
            savedMap.forEach((saved) => {
                const node = { ...saved };
                if (node.type === 'shapeNode') {
                    node.type = 'rectNode';
                    node.data = {
                        label: node.data?.label || '',
                        bgColor: node.data?.bgColor || 'rgba(187,222,186,0.45)',
                        borderColor: node.data?.borderColor || '#22c55e',
                        borderWidth: 2,
                        borderRadius: 12,
                        labelColor: '#2E4C38',
                    };
                } else if (node.type === 'group') {
                    node.type = 'rectNode';
                    node.data = {
                        label: node.data?.label || '',
                        bgColor: node.style?.backgroundColor || 'rgba(124,58,237,0.06)',
                        borderColor: '#8b5cf6',
                        borderWidth: 2,
                        borderRadius: 16,
                        labelColor: '#2E4C38',
                    };
                    node.zIndex = -1;
                }
                if (node.type === 'rectNode' || node.type === 'shapeNode' || node.type === 'group') {
                    node.zIndex = -1;
                }
                otherNodes.push(node);
            });

            if (cancelled) return;
            const finalNodes = [...charNodes, ...otherNodes];
            const validNodeIds = new Set(finalNodes.map((n) => n.id));
            const validEdges = savedEdges
                .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
                .map((e) => {
                    const sn = finalNodes.find((n) => n.id === e.source);
                    const tn = finalNodes.find((n) => n.id === e.target);
                    let sh = e.sourceHandle;
                    let th = e.targetHandle;
                    if (sn?.type === 'anchorNode') sh = undefined;
                    if (tn?.type === 'anchorNode') th = undefined;
                    return { ...e, sourceHandle: sh, targetHandle: th };
                });

            setNodes(finalNodes);
            setEdges(validEdges);
            // 初期スナップショットを記録 (最初のユーザー操作後すぐにUndoが使えるように)
            history.current = [{ nodes: serializeNodes(finalNodes), edges: serializeEdges(validEdges) }];
            historyIndex.current = 0;
            graphBuilt.current = true;
            setTimeout(() => {
                skipSave.current = false;
            }, 500);
        };

        init();
        return () => {
            cancelled = true;
        };
    }, [currentProject]);

    // ── キャラクターデータ変更の同期 ──
    useEffect(() => {
        if (!graphBuilt.current) return;
        const removedIds = [];
        setNodes((prev) => {
            let changed = false;
            const updated = prev
                .map((n) => {
                    if (n.type !== 'characterNode') return n;
                    const char = characters.find((c) => c.id === n.data.characterId);
                    if (!char || char.type === 'folder') {
                        changed = true;
                        removedIds.push(n.id);
                        return null;
                    }
                    const newBc = char.color ? getCharBorderColor(char.color) : '#8B2535';
                    if (n.data.label !== char.name || n.data.image !== char.image || n.data.borderColor !== newBc) {
                        changed = true;
                        return { ...n, data: { ...n.data, label: char.name, image: char.image, borderColor: newBc } };
                    }
                    return n;
                })
                .filter(Boolean);

            if (changed && removedIds.length > 0) {
                setTimeout(() => {
                    setEdges((eds) =>
                        eds.filter((e) => !removedIds.includes(e.source) && !removedIds.includes(e.target)),
                    );
                }, 0);
            }
            return changed ? updated : prev;
        });
    }, [characters]);

    // ── 自動保存 (debounce) ──
    useEffect(() => {
        if (skipSave.current || !selectedPatternId) return;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            db.relationPatterns.update(selectedPatternId, {
                nodesData: JSON.stringify(serializeNodes(nodes)),
                edgesData: JSON.stringify(serializeEdges(edges)),
            });
        }, 600);
        return () => clearTimeout(saveTimer.current);
    }, [nodes, edges, selectedPatternId]);

    // ── Undo/Redo 履歴の記録 ──
    useEffect(() => {
        if (!graphBuilt.current || skipSave.current) return;
        if (isUndoRedoAction.current) {
            isUndoRedoAction.current = false;
            return;
        }
        const timer = setTimeout(() => {
            const snap = { nodes: serializeNodes(nodes), edges: serializeEdges(edges) };
            const currentStr = JSON.stringify(snap);
            const prevSnapStr =
                historyIndex.current >= 0 && history.current[historyIndex.current]
                    ? JSON.stringify(history.current[historyIndex.current])
                    : null;
            if (currentStr === prevSnapStr) return;

            history.current = history.current.slice(0, historyIndex.current + 1);
            history.current.push(snap);
            if (history.current.length > 20) {
                history.current.shift();
            } else {
                historyIndex.current++;
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [nodes, edges]);

    // ── ハンドラ ──
    const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
    const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

    const onConnect = useCallback(
        (params) => {
            const edgeId = `edge-${Date.now()}`;
            const finalConnection = { ...params };

            const srcNode = nodes.find((n) => n.id === params.source);
            const tgtNode = nodes.find((n) => n.id === params.target);

            if (srcNode && tgtNode) {
                const sx = srcNode.position.x + (srcNode.measured?.width || 120) / 2;
                const sy = srcNode.position.y + (srcNode.measured?.height || 140) / 2;
                const tx = tgtNode.position.x + (tgtNode.measured?.width || 120) / 2;
                const ty = tgtNode.position.y + (tgtNode.measured?.height || 140) / 2;

                if (!params.targetHandle && tgtNode.type !== 'anchorNode') {
                    let th = ty > sy ? 'top' : 'bottom';
                    if (Math.abs(tx - sx) > Math.abs(ty - sy)) th = tx > sx ? 'left' : 'right';
                    finalConnection.targetHandle = th;
                } else if (tgtNode.type === 'anchorNode') {
                    finalConnection.targetHandle = undefined;
                }
                if (!params.sourceHandle && srcNode.type !== 'anchorNode') {
                    let sh = ty > sy ? 'bottom' : 'top';
                    if (Math.abs(tx - sx) > Math.abs(ty - sy)) sh = tx > sx ? 'right' : 'left';
                    finalConnection.sourceHandle = sh;
                } else if (srcNode.type === 'anchorNode') {
                    finalConnection.sourceHandle = undefined;
                }
            }

            // ノードペアの正準方向 (ID 辞書順で小さい方を source とみなす)
            // buildEdgePath は "source→target 方向の左側" を正の curvature とするため、
            // 逆向きエッジは垂直ベクトルが反転する。正準 source = edge.source の場合は
            // offset をそのまま使い、逆向きの場合は符号を反転することで
            // 両エッジが正準方向から見て同じ側に膨らむようにする。
            const canonFirst = params.source < params.target ? params.source : params.target;

            // 同じノードペア間の既存エッジを収集
            const pairEdges = edges.filter(
                (e) =>
                    (e.source === params.source && e.target === params.target) ||
                    (e.source === params.target && e.target === params.source),
            );
            const totalCount = pairEdges.length + 1;
            const spacing = 50;
            const getOffsetAmt = (idx, total) => Math.round((idx - (total - 1) / 2) * spacing);
            // エッジが正準方向かどうかに応じて curvature の符号を決定
            const toCurvature = (offsetAmt, edgeSource) =>
                edgeSource === canonFirst ? offsetAmt : -offsetAmt;

            setEdges((eds) => {
                // 重複チェック
                const isDuplicate = eds.some(
                    (e) =>
                        e.source === finalConnection.source &&
                        e.target === finalConnection.target &&
                        (e.sourceHandle ?? null) === (finalConnection.sourceHandle ?? null) &&
                        (e.targetHandle ?? null) === (finalConnection.targetHandle ?? null),
                );
                if (isDuplicate) return eds;

                // 既存ペアエッジの curvature を再割り当て
                const updated = eds.map((e) => {
                    const slotIdx = pairEdges.findIndex((pe) => pe.id === e.id);
                    if (slotIdx === -1) return e;
                    const curvature = toCurvature(getOffsetAmt(slotIdx, totalCount), e.source);
                    return { ...e, data: { ...e.data, curvature } };
                });

                // 新エッジを追加
                const newCurvature = toCurvature(getOffsetAmt(pairEdges.length, totalCount), finalConnection.source);
                return [
                    ...updated,
                    {
                        ...finalConnection,
                        id: edgeId,
                        type: 'labeled',
                        data: { label: '', color: drawColor, strokeWidth: 2.5, curvature: newCurvature },
                        style: { stroke: drawColor, strokeWidth: 2.5 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: drawColor },
                    },
                ];
            });
            setDrawMode('select');
        },
        [drawColor, nodes, edges],
    );

    const onSelectionChange = useCallback(({ nodes: sn, edges: se }) => {
        setSelectedNodeIds(sn.map((n) => n.id));
        setSelectedEdgeIds(se.map((e) => e.id));
    }, []);

    const handleAddCharacter = async (position) => {
        if (!currentProject) return;
        const id = await addCharacter(currentProject.id, { name: '新キャラクター' });
        const char = useCharacterStore.getState().characters.find((c) => c.id === id) || { name: '新キャラクター' };
        const pos = position || { x: 150, y: 150 };
        setNodes((nds) => [
            ...nds,
            {
                id: `char-${id}`,
                type: 'characterNode',
                position: pos,
                data: { label: char.name, image: null, characterId: id, borderColor: '#8B2535' },
            },
        ]);
        selectCharacter(id);
        setShowDetail(true);
        setDrawMode('select');
    };

    const handlePaneClick = useCallback(
        (event) => {
            if (drawMode === 'text') {
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                setNodes((nds) => [
                    ...nds,
                    {
                        id: `text-${Date.now()}`,
                        type: 'textNode',
                        position,
                        data: { label: 'テキスト', textColor: drawColor, fontSize: 14, fontWeight: 'bold' },
                    },
                ]);
                setDrawMode('select');
            } else if (drawMode === 'character') {
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                handleAddCharacter(position);
            } else if (drawMode.startsWith('symbol-')) {
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                const symbolMap = {
                    'symbol-heart': { label: '♥', color: '#ef4444', size: 28 },
                    'symbol-like': { label: '👍', color: '#22c55e', size: 28 },
                    'symbol-dislike': { label: '👎', color: '#3b82f6', size: 28 },
                };
                const sym = symbolMap[drawMode] || { label: '♥', color: '#ef4444', size: 28 };
                setNodes((nds) => [
                    ...nds,
                    {
                        id: `symbol-${Date.now()}`,
                        type: 'textNode',
                        position: { x: position.x - 14, y: position.y - 14 },
                        data: { label: sym.label, textColor: sym.color, fontSize: sym.size, fontWeight: 'normal' },
                    },
                ]);
                setDrawMode('select');
            }
        },
        [drawMode, reactFlowInstance, drawColor, currentProject],
    );

    const handleFinishRect = useCallback(
        ({ x, y, width, height }) => {
            setNodes((nds) => [
                ...nds,
                {
                    id: `rect-${Date.now()}`,
                    type: 'rectNode',
                    position: { x, y },
                    style: { width, height },
                    data: {
                        label: '',
                        bgColor: rectBgColor,
                        borderColor: drawColor,
                        borderWidth: 2,
                        borderRadius: 12,
                        labelColor: '#2E4C38',
                    },
                    zIndex: -1,
                },
            ]);
            setDrawMode('select');
        },
        [drawColor, rectBgColor],
    );

    const handleFinishLine = useCallback(
        (startPos, endPos, isArrow) => {
            let startTargetChar = null;
            let endTargetChar = null;

            nodes.forEach((n) => {
                if (n.type !== 'characterNode') return;
                const w = n.measured?.width || 120;
                const h = n.measured?.height || 140;
                const pad = 20;
                if (
                    startPos.x >= n.position.x - pad &&
                    startPos.x <= n.position.x + w + pad &&
                    startPos.y >= n.position.y - pad &&
                    startPos.y <= n.position.y + h + pad
                ) {
                    startTargetChar = n;
                }
                if (
                    endPos.x >= n.position.x - pad &&
                    endPos.x <= n.position.x + w + pad &&
                    endPos.y >= n.position.y - pad &&
                    endPos.y <= n.position.y + h + pad
                ) {
                    endTargetChar = n;
                }
            });

            const startId = startTargetChar ? startTargetChar.id : `anchor-${Date.now()}-s`;
            const endId = endTargetChar ? endTargetChar.id : `anchor-${Date.now()}-e`;
            const edgeId = `edge-${Date.now()}`;
            let sourceHandle, targetHandle;

            if (startTargetChar) {
                const cx = startTargetChar.position.x + (startTargetChar.measured?.width || 120) / 2;
                const cy = startTargetChar.position.y + (startTargetChar.measured?.height || 140) / 2;
                const dx = startPos.x - cx,
                    dy = startPos.y - cy;
                if (Math.abs(dx) > Math.abs(dy)) sourceHandle = dx > 0 ? 'right' : 'left';
                else sourceHandle = dy > 0 ? 'bottom' : 'top';
            }
            if (endTargetChar) {
                const cx = endTargetChar.position.x + (endTargetChar.measured?.width || 120) / 2;
                const cy = endTargetChar.position.y + (endTargetChar.measured?.height || 140) / 2;
                const dx = endPos.x - cx,
                    dy = endPos.y - cy;
                if (Math.abs(dx) > Math.abs(dy)) targetHandle = dx > 0 ? 'right' : 'left';
                else targetHandle = dy > 0 ? 'bottom' : 'top';
            }

            const anchorStyle = { width: 10, height: 10 };
            const newAnchors = [];
            if (!startTargetChar)
                newAnchors.push({
                    id: startId,
                    type: 'anchorNode',
                    position: startPos,
                    data: { color: drawColor },
                    style: anchorStyle,
                    draggable: true,
                });
            if (!endTargetChar)
                newAnchors.push({
                    id: endId,
                    type: 'anchorNode',
                    position: endPos,
                    data: { color: drawColor },
                    style: anchorStyle,
                    draggable: true,
                });
            if (newAnchors.length > 0) setNodes((nds) => [...nds, ...newAnchors]);

            setEdges((eds) => [
                ...eds,
                {
                    id: edgeId,
                    source: startId,
                    target: endId,
                    type: 'labeled',
                    sourceHandle,
                    targetHandle,
                    data: { label: '', color: drawColor, strokeWidth: 2.5 },
                    style: { stroke: drawColor, strokeWidth: 2.5 },
                    ...(isArrow ? { markerEnd: { type: MarkerType.ArrowClosed, color: drawColor } } : {}),
                },
            ]);
            setDrawMode('select');
        },
        [drawColor, nodes],
    );

    const handleUpdateNode = useCallback((nodeId, updates) => {
        setNodes((nds) =>
            nds.map((n) =>
                n.id !== nodeId
                    ? n
                    : {
                          ...n,
                          ...(updates.style ? { style: { ...n.style, ...updates.style } } : {}),
                          data: updates.data ? { ...updates.data } : n.data,
                      },
            ),
        );
    }, []);

    const handleUpdateEdge = useCallback((edgeId, updates) => {
        setEdges((eds) =>
            eds.map((e) => {
                if (e.id !== edgeId) return e;
                const updated = { ...e };
                if (updates.style) updated.style = { ...e.style, ...updates.style };
                if ('markerEnd' in updates) updated.markerEnd = updates.markerEnd || undefined;
                if (updates.data) updated.data = { ...updates.data };
                return updated;
            }),
        );
    }, []);

    const handleDeleteNode = useCallback((nodeId) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    }, []);

    const handleDeleteEdge = useCallback((edgeId) => {
        setEdges((eds) => {
            const target = eds.find((e) => e.id === edgeId);
            if (!target) return eds;

            const remaining = eds.filter((e) => e.id !== edgeId);

            // 削除後のペアエッジ曲率を再分配 (1本になれば直線に戻る)
            const pairEdges = remaining.filter(
                (e) =>
                    (e.source === target.source && e.target === target.target) ||
                    (e.source === target.target && e.target === target.source),
            );
            if (pairEdges.length === 0) return remaining;

            const canonFirst = target.source < target.target ? target.source : target.target;
            const spacing = 50;
            const getOffsetAmt = (idx, total) => Math.round((idx - (total - 1) / 2) * spacing);

            return remaining.map((e) => {
                const slotIdx = pairEdges.findIndex((pe) => pe.id === e.id);
                if (slotIdx === -1) return e;
                const offsetAmt = getOffsetAmt(slotIdx, pairEdges.length);
                const curvature = e.source === canonFirst ? offsetAmt : -offsetAmt;
                return { ...e, data: { ...e.data, curvature } };
            });
        });
    }, []);

    const handleReverseEdge = useCallback((edgeId) => {
        setEdges((eds) =>
            eds.map((e) => {
                if (e.id !== edgeId) return e;
                let sh = e.targetHandle;
                let th = e.sourceHandle;
                if (sh === 'bottom-source') sh = 'bottom';
                if (sh === 'right-source') sh = 'right';
                if (sh === 'left-target') sh = 'left';
                if (th === 'bottom-source') th = 'bottom';
                if (th === 'right-source') th = 'right';
                if (th === 'left-target') th = 'left';
                return { ...e, source: e.target, target: e.source, sourceHandle: sh, targetHandle: th };
            }),
        );
    }, []);

    const handleDisconnectEdge = useCallback(
        (edgeId, side) => {
            const edge = edges.find((e) => e.id === edgeId);
            if (!edge) return;
            const nodeId = side === 'source' ? edge.source : edge.target;
            const charNode = nodes.find((n) => n.id === nodeId);
            if (!charNode || charNode.type !== 'characterNode') return;

            const anchorId = `anchor-${Date.now()}-disc`;
            const offset = side === 'source' ? { x: -30, y: 0 } : { x: 30, y: 0 };
            const anchorPos = {
                x: charNode.position.x + (charNode.measured?.width || 100) / 2 + offset.x,
                y: charNode.position.y + (charNode.measured?.height || 80) / 2 + offset.y,
            };
            const edgeColor = edge.data?.color || edge.style?.stroke || '#8b5cf6';

            setNodes((nds) => [
                ...nds,
                {
                    id: anchorId,
                    type: 'anchorNode',
                    position: anchorPos,
                    data: { color: edgeColor },
                    style: { width: 14, height: 14 },
                    draggable: true,
                },
            ]);
            setEdges((eds) =>
                eds.map((e) => {
                    if (e.id !== edgeId) return e;
                    if (side === 'source') return { ...e, source: anchorId, sourceHandle: undefined };
                    return { ...e, target: anchorId, targetHandle: undefined };
                }),
            );
        },
        [edges, nodes],
    );

    const onNodeDragStop = useCallback(
        (_event, node) => {
            if (node.type !== 'anchorNode') return;
            const targetChar = reactFlowInstance
                .getIntersectingNodes(node, true)
                .find((n) => n.type === 'characterNode');
            if (targetChar) {
                setEdges((eds) => {
                    let changed = false;
                    const newEdges = eds.map((e) => {
                        const cx = targetChar.position.x + (targetChar.measured?.width || 120) / 2;
                        const cy = targetChar.position.y + (targetChar.measured?.height || 140) / 2;
                        const ax = node.position.x + 7;
                        const ay = node.position.y + 7;
                        if (e.source === node.id) {
                            changed = true;
                            const useRight = ax > cx && ay > cy - 50;
                            return { ...e, source: targetChar.id, sourceHandle: useRight ? 'right' : 'bottom' };
                        }
                        if (e.target === node.id) {
                            changed = true;
                            const useLeft = ax < cx && ay > cy - 50;
                            return { ...e, target: targetChar.id, targetHandle: useLeft ? 'left' : 'top' };
                        }
                        return e;
                    });
                    if (changed) setNodes((nds) => nds.filter((n) => n.id !== node.id));
                    return newEdges;
                });
            }
        },
        [reactFlowInstance],
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            const charId = event.dataTransfer.getData('characterId');
            if (type === 'characterNode' && charId) {
                const char = characters.find((c) => c.id === Number(charId));
                if (!char) return;
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                const nodeId = `char-${char.id}`;
                if (nodes.find((n) => n.id === nodeId)) {
                    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, position } : n)));
                    return;
                }
                setNodes((nds) => [
                    ...nds,
                    {
                        id: nodeId,
                        type: 'characterNode',
                        position,
                        data: {
                            label: char.name,
                            image: char.image,
                            characterId: char.id,
                            borderColor: char.color ? getCharBorderColor(char.color) : '#8B2535',
                        },
                    },
                ]);
            }
        },
        [characters, nodes, reactFlowInstance],
    );

    const handleAutoAlign = () => {
        const charNodes = nodes.filter((n) => n.type === 'characterNode');
        if (charNodes.length === 0) return;
        const cols = Math.max(1, Math.ceil(Math.sqrt(charNodes.length)));
        const startX = 120,
            startY = 100;
        setNodes((nds) =>
            nds.map((n) => {
                if (n.type !== 'characterNode') return n;
                const idx = charNodes.findIndex((cn) => cn.id === n.id);
                if (idx < 0) return n;
                return {
                    ...n,
                    position: { x: startX + (idx % cols) * alignGapX, y: startY + Math.floor(idx / cols) * alignGapY },
                };
            }),
        );
    };

    const handlePatternChange = useCallback(
        async (newId) => {
            if (selectedPatternId && !skipSave.current) {
                await db.relationPatterns.update(selectedPatternId, {
                    nodesData: JSON.stringify(serializeNodes(nodes)),
                    edgesData: JSON.stringify(serializeEdges(edges)),
                });
            }
            skipSave.current = true;
            graphBuilt.current = false;
            // パターン切り替え時はUndoRedo履歴をリセット (旧パターンの履歴が混入するのを防ぐ)
            history.current = [];
            historyIndex.current = -1;
            setSelectedPatternId(newId);

            const pattern = await db.relationPatterns.get(newId);
            const chars = await db.characters.where('projectId').equals(currentProject.id).toArray();
            await loadRelationships(newId);

            let savedNodes = [],
                savedEdges = [];
            try {
                savedNodes = JSON.parse(pattern?.nodesData || '[]');
            } catch {}
            try {
                savedEdges = JSON.parse(pattern?.edgesData || '[]');
            } catch {}
            const savedMap = new Map(savedNodes.map((n) => [n.id, n]));

            const charNodes = [];
            chars.forEach((char) => {
                const nodeId = `char-${char.id}`;
                const saved = savedMap.get(nodeId);
                if (saved) {
                    savedMap.delete(nodeId);
                    charNodes.push({
                        id: nodeId,
                        type: 'characterNode',
                        position: saved.position,
                        data: {
                            label: char.name,
                            image: char.image,
                            characterId: char.id,
                            borderColor: char.color ? getCharBorderColor(char.color) : '#8B2535',
                        },
                    });
                }
            });
            const otherNodes = [];
            savedMap.forEach((saved) => {
                otherNodes.push(saved);
            });

            const nextNodes = [...charNodes, ...otherNodes];
            setNodes(nextNodes);
            setEdges(savedEdges);
            // パターン切り替え後の初期スナップショットを記録 (最初の操作からUndoが使えるように)
            history.current = [{ nodes: serializeNodes(nextNodes), edges: serializeEdges(savedEdges) }];
            historyIndex.current = 0;
            graphBuilt.current = true;
            setTimeout(() => {
                skipSave.current = false;
            }, 500);
        },
        [selectedPatternId, nodes, edges, currentProject, loadRelationships],
    );

    const handleAddPatternClick = () => {
        if (!currentProject) return;
        setPatternNameInput('');
        setPatternModalMode('add');
        setShowPatternModal(true);
    };

    const handleCopyPatternClick = () => {
        if (!currentProject || !selectedPatternId) return;
        const currentPattern = relationPatterns.find((p) => p.id === selectedPatternId);
        if (!currentPattern) return;
        setPatternNameInput(currentPattern.name + '（コピー）');
        setPatternModalMode('copy');
        setShowPatternModal(true);
    };

    const submitPatternModal = async () => {
        if (!patternNameInput.trim() || !currentProject) return;
        setShowPatternModal(false);
        const name = patternNameInput.trim();
        if (patternModalMode === 'add') {
            const newId = await addRelationPattern(currentProject.id, name);
            handlePatternChange(newId);
        } else if (patternModalMode === 'copy') {
            await db.relationPatterns.update(selectedPatternId, {
                nodesData: JSON.stringify(serializeNodes(nodes)),
                edgesData: JSON.stringify(serializeEdges(edges)),
            });
            const newId = await addRelationPattern(currentProject.id, name);
            await db.relationPatterns.update(newId, {
                nodesData: JSON.stringify(serializeNodes(nodes)),
                edgesData: JSON.stringify(serializeEdges(edges)),
            });
            handlePatternChange(newId);
        }
    };

    const handleDeletePatternClick = async () => {
        if (!selectedPatternId) return;
        if (!window.confirm('現在のパターンを完全に削除しますか？\n（この操作は取り消せません）')) return;
        await deleteRelationPattern(selectedPatternId);
        const remaining = relationPatterns.filter((p) => p.id !== selectedPatternId);
        handlePatternChange(remaining.length > 0 ? remaining[0].id : null);
    };

    const handleUndo = useCallback(() => {
        if (historyIndex.current > 0) {
            isUndoRedoAction.current = true;
            historyIndex.current--;
            const snap = history.current[historyIndex.current];
            setNodes(snap.nodes.map((n) => ({ ...n, position: { ...n.position } })));
            setEdges(snap.edges.map((e) => ({ ...e })));
        }
    }, []);

    const handleRedo = useCallback(() => {
        if (historyIndex.current < history.current.length - 1) {
            isUndoRedoAction.current = true;
            historyIndex.current++;
            const snap = history.current[historyIndex.current];
            setNodes(snap.nodes.map((n) => ({ ...n, position: { ...n.position } })));
            setEdges(snap.edges.map((e) => ({ ...e })));
        }
    }, []);

    const handleClearAll = useCallback(() => {
        if (
            !window.confirm('現在の相関図の全要素を削除しますか？\n（人物も含め全てリセットされます。※元に戻せません）')
        )
            return;
        setNodes([]);
        setEdges([]);
        history.current = [];
        historyIndex.current = -1;
    }, []);

    // ── キーボードショートカット ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                selectedNodeIds.forEach((id) => {
                    const node = nodes.find((n) => n.id === id);
                    if (node && node.type !== 'characterNode') handleDeleteNode(id);
                });
                selectedEdgeIds.forEach((id) => {
                    handleDeleteEdge(id);
                });
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeIds, selectedEdgeIds, nodes, handleDeleteNode, handleDeleteEdge, handleUndo, handleRedo]);

    if (!currentProject) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted">
                <p>プロジェクトを選択してください</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* ヘッダー */}
            <div className="relation-header">
                <h2 className="relation-title">人物相関図</h2>
                <div className="relation-header-actions">
                    <select
                        value={selectedPatternId || ''}
                        onChange={(e) => handlePatternChange(Number(e.target.value))}
                        className="relation-pattern-select"
                    >
                        {relationPatterns.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <button onClick={handleAddPatternClick} className="relation-header-btn" title="パターン追加">
                        <Layers size={14} />
                    </button>
                    <button
                        onClick={handleDeletePatternClick}
                        className="relation-header-btn"
                        title="現在のパターンを削除"
                        style={{ color: '#ef4444' }}
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        onClick={handleUndo}
                        className="relation-header-btn"
                        title="元に戻す (Ctrl+Z)"
                        disabled={historyIndex.current <= 0}
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={handleRedo}
                        className="relation-header-btn"
                        title="やり直す (Ctrl+Y/Shift+Ctrl+Z)"
                        disabled={historyIndex.current >= history.current.length - 1}
                    >
                        <Redo2 size={14} />
                    </button>
                    <button
                        onClick={handleCopyPatternClick}
                        className="relation-header-btn"
                        title="現在のパターンを複製"
                    >
                        <Copy size={14} />
                    </button>
                    <button
                        onClick={() => setShowAlignPanel((p) => !p)}
                        className="relation-header-btn"
                        title="自動整列"
                    >
                        <AlignHorizontalSpaceAround size={14} />
                    </button>
                    <button
                        onClick={handleClearAll}
                        className="relation-header-btn"
                        title="全要素を一括削除"
                        style={{ color: '#ef4444' }}
                    >
                        <Trash2 size={14} />
                    </button>
                    <button onClick={handleAddCharacter} className="relation-header-btn relation-add-char-btn">
                        <UserPlus size={14} /> 人物追加
                    </button>
                </div>
            </div>

            {/* ツールパレット */}
            <ToolPalette
                drawMode={drawMode}
                setDrawMode={setDrawMode}
                drawColor={drawColor}
                setDrawColor={setDrawColor}
                rectBgColor={rectBgColor}
                setRectBgColor={setRectBgColor}
                entityMode="character"
                entityToolLabel="人物追加"
                symbolTools={SYMBOL_TOOLS}
            />

            {/* 自動整列パネル */}
            {showAlignPanel && (
                <div className="relation-align-panel">
                    <div className="relation-align-row">
                        <label>横間隔: {alignGapX}px</label>
                        <input
                            type="range"
                            min={100}
                            max={400}
                            value={alignGapX}
                            onChange={(e) => setAlignGapX(Number(e.target.value))}
                        />
                    </div>
                    <div className="relation-align-row">
                        <label>縦間隔: {alignGapY}px</label>
                        <input
                            type="range"
                            min={100}
                            max={400}
                            value={alignGapY}
                            onChange={(e) => setAlignGapY(Number(e.target.value))}
                        />
                    </div>
                    <button onClick={handleAutoAlign} className="relation-align-btn">
                        <AlignHorizontalSpaceAround size={14} /> 人物を自動整列
                    </button>
                </div>
            )}

            {/* メインコンテンツ: ツリー + キャンバス */}
            <div className="flex-1 flex overflow-hidden min-h-0 items-stretch bg-bg-primary">
                <CharacterTree
                    onAddCharacter={() => {
                        const newId = addCharacter(currentProject.id, { name: '新規キャラクター' });
                        selectCharacter(newId);
                    }}
                />

                <div className="flex-1 relative flex flex-col min-w-0" ref={reactFlowWrapper}>
                    <div className="flex-1 relative h-full w-full">
                        {graphBuilt.current && (
                            <ReactFlow
                                nodes={nodesWithCallbacks}
                                edges={edgesWithCallbacks}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onDragOver={onDragOver}
                                onDrop={onDrop}
                                onSelectionChange={onSelectionChange}
                                onNodeDragStop={onNodeDragStop}
                                elevateNodesOnSelect={false}
                                fitView
                                className="relation-canvas"
                                fitViewOptions={{ padding: 0.2 }}
                                minZoom={0.1}
                                maxZoom={2}
                                onPaneClick={handlePaneClick}
                                onEdgeClick={(_e, edge) => {
                                    setDrawMode('select');
                                    setSelectedEdgeIds([edge.id]);
                                }}
                            >
                                <Background color="#d4d0c8" gap={24} size={1} />
                                <Controls className="relation-controls" />
                                <MiniMap
                                    className="relation-minimap"
                                    nodeColor={(n) =>
                                        n.type === 'characterNode'
                                            ? '#8B2535'
                                            : n.type === 'rectNode'
                                              ? 'transparent'
                                              : '#6b7280'
                                    }
                                    nodeStrokeColor={(n) => (n.type === 'rectNode' ? '#22c55e' : 'transparent')}
                                    nodeStrokeWidth={2}
                                />
                            </ReactFlow>
                        )}
                        <DrawingOverlay
                            drawMode={drawMode}
                            drawColor={drawColor}
                            rectBgColor={rectBgColor}
                            reactFlowInstance={reactFlowInstance}
                            onFinishRect={handleFinishRect}
                            onFinishLine={handleFinishLine}
                        />
                    </div>

                    <PropertiesPanel
                        selectedNodes={selectedNodeIds}
                        selectedEdges={selectedEdgeIds}
                        nodes={nodes}
                        edges={edges}
                        onUpdateNode={handleUpdateNode}
                        onUpdateEdge={handleUpdateEdge}
                        onDeleteNode={handleDeleteNode}
                        onDeleteEdge={handleDeleteEdge}
                        onReverseEdge={handleReverseEdge}
                        onDisconnectEdge={handleDisconnectEdge}
                        entityNodeType="characterNode"
                    />
                </div>
            </div>

            {/* 人物詳細モーダル */}
            {showDetail && selectedCharacterId && (
                <CharacterDetail
                    characterId={selectedCharacterId}
                    onClose={() => setShowDetail(false)}
                    isModal={true}
                />
            )}

            {/* パターン追加/複製モーダル */}
            {showPatternModal && (
                <div className="relation-modal-overlay">
                    <div className="relation-modal" style={{ width: 400 }}>
                        <div className="relation-modal-header">
                            <h3>{patternModalMode === 'copy' ? 'パターンの複製' : '新規パターン追加'}</h3>
                            <button onClick={() => setShowPatternModal(false)} className="relation-modal-close">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="relation-modal-body" style={{ padding: '20px' }}>
                            <input
                                type="text"
                                value={patternNameInput}
                                onChange={(e) => setPatternNameInput(e.target.value)}
                                placeholder="パターン名を入力"
                                autoFocus
                                className="w-full p-2 border rounded"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') submitPatternModal();
                                }}
                            />
                        </div>
                        <div
                            className="relation-modal-actions"
                            style={{ padding: '15px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
                        >
                            <button
                                onClick={() => setShowPatternModal(false)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm transition-colors text-gray-800"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={submitPatternModal}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                                disabled={!patternNameInput.trim()}
                            >
                                {patternModalMode === 'copy' ? '複製' : '追加'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RelationGraph() {
    return (
        <ReactFlowProvider>
            <RelationGraphInner />
        </ReactFlowProvider>
    );
}
