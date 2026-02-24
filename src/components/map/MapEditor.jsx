import {
    addEdge,
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
import { AlignHorizontalSpaceAround, Copy, Layers, Minus, Redo2, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import db from '../../db/database';
import useMapStore from '../../stores/mapStore';
import useProjectStore from '../../stores/projectStore';
import { DrawingOverlay } from '../shared/graphEditor/DrawingOverlay';
import { LabeledEdge } from '../shared/graphEditor/LabeledEdge';
import { PropertiesPanel } from '../shared/graphEditor/PropertiesPanel';
import { AnchorNode, EntityNode, RectNode, TextNode } from '../shared/graphEditor/SharedNodes';
import { serializeEdges, serializeNodes } from '../shared/graphEditor/serialization';
import { ToolPalette } from '../shared/graphEditor/ToolPalette';
import LocationDetail from './LocationDetail';
import LocationTree from './LocationTree';

// 場所カラー名から枠色 hex を返す
function getLocBorderColor(colorName) {
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
    return map[colorName] || '#10b981';
}

// ── Location Node (thin wrapper around EntityNode) ──
function LocationNode({ data, selected }) {
    return <EntityNode data={{ ...data, entityId: data.locationId }} selected={selected} />;
}

const SYMBOL_TOOLS = [
    { mode: 'symbol-village', label: '村' },
    { mode: 'symbol-town', label: '町' },
    { mode: 'symbol-city', label: '街' },
    { mode: 'symbol-castle', label: '城' },
    { mode: 'symbol-church', label: '教会' },
    { mode: 'symbol-house', label: '家' },
    { mode: 'symbol-dungeon', label: 'ダンジョン' },
    { mode: 'symbol-woods', label: '林' },
    { mode: 'symbol-forest', label: '森' },
    { mode: 'symbol-river', label: '川' },
    { mode: 'symbol-pond', label: '池' },
    { mode: 'symbol-lake', label: '湖' },
    { mode: 'symbol-waterfall', label: '滝' },
    { mode: 'symbol-sea', label: '海' },
    { mode: 'symbol-hill', label: '丘' },
    { mode: 'symbol-mountain', label: '山' },
];

const nodeTypes = { locationNode: LocationNode, rectNode: RectNode, textNode: TextNode, anchorNode: AnchorNode };
const edgeTypes = { labeled: LabeledEdge };

// ── Main Component ──
function MapEditorInner() {
    const {
        locations,
        loadLocations,
        addLocation,
        selectedLocationId,
        selectLocation,
        mapPatterns,
        loadMapPatterns,
        addMapPattern,
        deleteMapPattern,
    } = useMapStore();
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

    // Pattern Modal State
    const [showPatternModal, setShowPatternModal] = useState(false);
    const [patternNameInput, setPatternNameInput] = useState('');
    const [patternModalMode, setPatternModalMode] = useState('add');

    const saveTimer = useRef(null);
    const skipSave = useRef(true);
    const graphBuilt = useRef(false);

    // Undo/Redo history
    const history = useRef([]);
    const historyIndex = useRef(-1);
    const isUndoRedoAction = useRef(false);

    const reactFlowInstance = useReactFlow();
    const reactFlowWrapper = useRef(null);

    // callbacks that nodes/edges use
    const onSelectChar = useCallback(
        (id) => {
            selectLocation(id);
            setShowDetail(true);
        },
        [selectLocation],
    );

    const onLabelChange = useCallback((nodeId, newLabel) => {
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n)));
    }, []);

    const onEdgeLabelChange = useCallback((edgeId, newLabel) => {
        setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, label: newLabel } } : e)));
    }, []);

    // Inject callbacks into node data
    const nodesWithCallbacks = useMemo(() => {
        return nodes.map((n) => {
            if (n.type === 'locationNode') {
                return { ...n, data: { ...n.data, onSelect: onSelectChar } };
            }
            return { ...n, data: { ...n.data, onLabelChange } };
        });
    }, [nodes, onSelectChar, onLabelChange]);

    // Handler for dragging entire line (move both anchor nodes)
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

    // ── Init: load graph from DB ──
    useEffect(() => {
        if (!currentProject) return;
        let cancelled = false;
        skipSave.current = true;
        graphBuilt.current = false;

        const init = async () => {
            try {
                const projectId = currentProject.id;
                await loadLocations(projectId);
                await loadMapPatterns(projectId);
                if (cancelled) return;

                let patterns = await db.mapPatterns.where('projectId').equals(projectId).toArray();
                if (patterns.length === 0) {
                    await db.mapPatterns.add({
                        projectId,
                        name: 'メイン',
                        chapterId: null,
                        nodesData: '[]',
                        edgesData: '[]',
                        createdAt: Date.now(),
                    });
                    await loadMapPatterns(projectId);
                    patterns = await db.mapPatterns.where('projectId').equals(projectId).toArray();
                }
                if (patterns.length === 0 || cancelled) return;

                const patternId = patterns[0].id;
                setSelectedPatternId(patternId);
                if (cancelled) return;

                const locs = await db.locations.where('projectId').equals(projectId).toArray();
                const pattern = patterns[0];

                let savedNodes = [],
                    savedEdges = [];
                try {
                    savedNodes = JSON.parse(pattern.nodesData || '[]');
                } catch {}
                try {
                    savedEdges = JSON.parse(pattern.edgesData || '[]');
                } catch {}

                // Migrate legacy char-* node IDs to loc-* IDs
                savedNodes = savedNodes.map((n) => {
                    if (n.id && n.id.startsWith('char-') && n.type === 'locationNode') {
                        const oldId = n.id;
                        const numId = oldId.replace('char-', '');
                        const newId = `loc-${numId}`;
                        const data = { ...n.data };
                        if (data.characterId !== undefined) {
                            data.locationId = data.characterId;
                            delete data.characterId;
                        }
                        savedEdges = savedEdges.map((e) => ({
                            ...e,
                            source: e.source === oldId ? newId : e.source,
                            target: e.target === oldId ? newId : e.target,
                        }));
                        return { ...n, id: newId, data };
                    }
                    return n;
                });

                const savedMap = new Map(savedNodes.map((n) => [n.id, n]));

                const locNodes = [];
                locs.filter((c) => c.type !== 'folder').forEach((loc) => {
                    const nodeId = `loc-${loc.id}`;
                    const saved = savedMap.get(nodeId);
                    if (saved) {
                        savedMap.delete(nodeId);
                        locNodes.push({
                            ...saved,
                            data: {
                                ...saved.data,
                                label: loc.name,
                                image: loc.image,
                                locationId: loc.id,
                                borderColor: loc.color ? getLocBorderColor(loc.color) : '#10b981',
                            },
                        });
                    }
                });

                const otherNodes = [];
                savedMap.forEach((saved) => {
                    const node = { ...saved };
                    if (node.type === 'locationNode') return;
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
                const finalNodes = [...locNodes, ...otherNodes];
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
                graphBuilt.current = true;
                setTimeout(() => {
                    skipSave.current = false;
                }, 500);
            } catch (err) {
                console.error('MapEditor init error:', err);
                graphBuilt.current = true;
                setTimeout(() => {
                    skipSave.current = false;
                }, 500);
            }
        };

        init();
        return () => {
            cancelled = true;
        };
    }, [currentProject]);

    // ── Sync location data changes ──
    useEffect(() => {
        if (!graphBuilt.current) return;
        const removedIds = [];
        setNodes((prev) => {
            let changed = false;
            const updated = prev
                .map((n) => {
                    if (n.type !== 'locationNode') return n;
                    const loc = locations.find((c) => c.id === n.data.locationId);
                    if (!loc || loc.type === 'folder') {
                        changed = true;
                        removedIds.push(n.id);
                        return null;
                    }
                    const newBc = loc.color ? getLocBorderColor(loc.color) : '#10b981';
                    if (n.data.label !== loc.name || n.data.image !== loc.image || n.data.borderColor !== newBc) {
                        changed = true;
                        return { ...n, data: { ...n.data, label: loc.name, image: loc.image, borderColor: newBc } };
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
    }, [locations]);

    // ── Save: debounced ──
    useEffect(() => {
        if (skipSave.current || !selectedPatternId) return;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            db.mapPatterns.update(selectedPatternId, {
                nodesData: JSON.stringify(serializeNodes(nodes)),
                edgesData: JSON.stringify(serializeEdges(edges)),
            });
        }, 600);
        return () => clearTimeout(saveTimer.current);
    }, [nodes, edges, selectedPatternId]);

    // ── Handlers ──
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

            setEdges((eds) =>
                addEdge(
                    {
                        ...finalConnection,
                        id: edgeId,
                        type: 'labeled',
                        data: { label: '', color: drawColor, strokeWidth: 2.5 },
                        style: { stroke: drawColor, strokeWidth: 2.5 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: drawColor },
                    },
                    eds,
                ),
            );
            setDrawMode('select');
        },
        [drawColor, nodes, setDrawMode],
    );

    const onSelectionChange = useCallback(({ nodes: sn, edges: se }) => {
        setSelectedNodeIds(sn.map((n) => n.id));
        setSelectedEdgeIds(se.map((e) => e.id));
    }, []);

    const handleAddLocation = async (position) => {
        if (!currentProject) return;
        const id = await addLocation(currentProject.id, { name: '新しい場所' });
        const loc = locations.find((c) => c.id === id) || { name: '新しい場所' };
        const pos = position || { x: 150, y: 150 };
        const nodeId = `loc-${id}`;
        setNodes((nds) => [
            ...nds,
            {
                id: nodeId,
                type: 'locationNode',
                position: pos,
                data: { label: loc.name, image: null, locationId: id, borderColor: '#10b981' },
            },
        ]);
        selectLocation(id);
        setShowDetail(true);
        setDrawMode('select');
    };

    const handlePaneClick = useCallback(
        (event) => {
            if (drawMode === 'text') {
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                const id = `text-${Date.now()}`;
                setNodes((nds) => [
                    ...nds,
                    {
                        id,
                        type: 'textNode',
                        position,
                        data: { label: 'テキスト', textColor: drawColor, fontSize: 14, fontWeight: 'bold' },
                    },
                ]);
                setDrawMode('select');
            } else if (drawMode === 'location') {
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                handleAddLocation(position);
            } else if (drawMode.startsWith('symbol-')) {
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                const id = `symbol-${Date.now()}`;
                const symbolMap = {
                    'symbol-village': { label: '村', color: '#78350f', size: 22 },
                    'symbol-town': { label: '町', color: '#92400e', size: 22 },
                    'symbol-city': { label: '街', color: '#1e3a5f', size: 22 },
                    'symbol-castle': { label: '城', color: '#6b21a8', size: 22 },
                    'symbol-church': { label: '教会', color: '#854d0e', size: 18 },
                    'symbol-house': { label: '家', color: '#78350f', size: 22 },
                    'symbol-dungeon': { label: 'ダンジョン', color: '#7f1d1d', size: 14 },
                    'symbol-woods': { label: '林', color: '#166534', size: 22 },
                    'symbol-forest': { label: '森', color: '#14532d', size: 22 },
                    'symbol-river': { label: '川', color: '#1d4ed8', size: 22 },
                    'symbol-pond': { label: '池', color: '#0369a1', size: 22 },
                    'symbol-lake': { label: '湖', color: '#0e7490', size: 22 },
                    'symbol-waterfall': { label: '滝', color: '#0284c7', size: 22 },
                    'symbol-sea': { label: '海', color: '#1e40af', size: 22 },
                    'symbol-hill': { label: '丘', color: '#65a30d', size: 22 },
                    'symbol-mountain': { label: '山', color: '#57534e', size: 22 },
                };
                const sym = symbolMap[drawMode] || {
                    label: drawMode.replace('symbol-', ''),
                    color: '#374151',
                    size: 22,
                };
                setNodes((nds) => [
                    ...nds,
                    {
                        id,
                        type: 'textNode',
                        position: { x: position.x - 14, y: position.y - 14 },
                        data: { label: sym.label, textColor: sym.color, fontSize: sym.size, fontWeight: 'normal' },
                    },
                ]);
                setDrawMode('select');
            }
        },
        [drawMode, reactFlowInstance, drawColor, currentProject, setDrawMode],
    );

    const handleFinishRect = useCallback(
        ({ x, y, width, height }) => {
            const id = `rect-${Date.now()}`;
            setNodes((nds) => [
                ...nds,
                {
                    id,
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
        [drawColor, rectBgColor, setDrawMode],
    );

    const handleFinishLine = useCallback(
        (startPos, endPos, isArrow) => {
            let startTargetChar = null;
            let endTargetChar = null;

            nodes.forEach((n) => {
                if (n.type !== 'locationNode') return;
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

            let sourceHandle;
            let targetHandle;

            if (startTargetChar) {
                const cx = startTargetChar.position.x + (startTargetChar.measured?.width || 120) / 2;
                const cy = startTargetChar.position.y + (startTargetChar.measured?.height || 140) / 2;
                const dx = startPos.x - cx;
                const dy = startPos.y - cy;
                if (Math.abs(dx) > Math.abs(dy)) sourceHandle = dx > 0 ? 'right' : 'left';
                else sourceHandle = dy > 0 ? 'bottom' : 'top';
            }
            if (endTargetChar) {
                const cx = endTargetChar.position.x + (endTargetChar.measured?.width || 120) / 2;
                const cy = endTargetChar.position.y + (endTargetChar.measured?.height || 140) / 2;
                const dx = endPos.x - cx;
                const dy = endPos.y - cy;
                if (Math.abs(dx) > Math.abs(dy)) targetHandle = dx > 0 ? 'right' : 'left';
                else targetHandle = dy > 0 ? 'bottom' : 'top';
            }

            const newAnchors = [];
            const anchorStyle = { width: 10, height: 10 };
            if (!startTargetChar) {
                newAnchors.push({
                    id: startId,
                    type: 'anchorNode',
                    position: startPos,
                    data: { color: drawColor },
                    style: anchorStyle,
                    draggable: true,
                });
            }
            if (!endTargetChar) {
                newAnchors.push({
                    id: endId,
                    type: 'anchorNode',
                    position: endPos,
                    data: { color: drawColor },
                    style: anchorStyle,
                    draggable: true,
                });
            }
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
        [drawColor, nodes, setDrawMode],
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
        setEdges((eds) => eds.filter((e) => e.id !== edgeId));
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
            if (!charNode || charNode.type !== 'locationNode') return;

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

    // Connect dragged anchor node to location node
    const onNodeDragStop = useCallback(
        (_event, node) => {
            if (node.type !== 'anchorNode') return;
            const targetChar = reactFlowInstance
                .getIntersectingNodes(node, true)
                .find((n) => n.type === 'locationNode');
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
        [reactFlowInstance, setEdges, setNodes],
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            const locIdStr = event.dataTransfer.getData('locationId');
            if (type === 'locationNode' && locIdStr) {
                const loc = locations.find((c) => c.id === Number(locIdStr));
                if (!loc) return;
                const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                const nodeId = `loc-${loc.id}`;
                if (nodes.find((n) => n.id === nodeId)) {
                    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, position } : n)));
                    return;
                }
                setNodes((nds) => [
                    ...nds,
                    {
                        id: nodeId,
                        type: 'locationNode',
                        position,
                        data: { label: loc.name, image: loc.image, locationId: loc.id, borderColor: '#10b981' },
                    },
                ]);
            }
        },
        [locations, nodes, reactFlowInstance, setNodes],
    );

    const handleAddPatternClick = () => {
        if (!currentProject) return;
        setPatternNameInput('');
        setPatternModalMode('add');
        setShowPatternModal(true);
    };

    const handleCopyPatternClick = () => {
        if (!currentProject || !selectedPatternId) return;
        const currentPattern = mapPatterns.find((p) => p.id === selectedPatternId);
        if (!currentPattern) return;
        setPatternNameInput(currentPattern.name + '（コピー）');
        setPatternModalMode('copy');
        setShowPatternModal(true);
    };

    const handlePatternChange = useCallback(
        async (newId) => {
            if (selectedPatternId && !skipSave.current) {
                await db.mapPatterns.update(selectedPatternId, {
                    nodesData: JSON.stringify(serializeNodes(nodes)),
                    edgesData: JSON.stringify(serializeEdges(edges)),
                });
            }
            skipSave.current = true;
            graphBuilt.current = false;
            setSelectedPatternId(newId);

            const pattern = await db.mapPatterns.get(newId);
            const locs = await db.locations.where('projectId').equals(currentProject.id).toArray();

            let savedNodes = [],
                savedEdges = [];
            try {
                savedNodes = JSON.parse(pattern?.nodesData || '[]');
            } catch {}
            try {
                savedEdges = JSON.parse(pattern?.edgesData || '[]');
            } catch {}
            const savedMap = new Map(savedNodes.map((n) => [n.id, n]));

            const locNodes = [];
            locs.filter((c) => c.type !== 'folder').forEach((loc) => {
                const nodeId = `loc-${loc.id}`;
                const saved = savedMap.get(nodeId);
                if (saved) {
                    savedMap.delete(nodeId);
                    locNodes.push({
                        id: nodeId,
                        type: 'locationNode',
                        position: saved.position,
                        data: { label: loc.name, image: loc.image, locationId: loc.id, borderColor: '#10b981' },
                    });
                }
            });
            const otherNodes = [];
            savedMap.forEach((saved) => {
                otherNodes.push(saved);
            });

            setNodes([...locNodes, ...otherNodes]);
            setEdges(savedEdges);
            graphBuilt.current = true;
            setTimeout(() => {
                skipSave.current = false;
            }, 500);
        },
        [selectedPatternId, nodes, edges, currentProject],
    );

    const submitPatternModal = async () => {
        if (!patternNameInput.trim() || !currentProject) return;
        setShowPatternModal(false);
        const name = patternNameInput.trim();
        if (patternModalMode === 'add') {
            const newId = await addMapPattern(currentProject.id, name);
            handlePatternChange(newId);
        } else if (patternModalMode === 'copy') {
            await db.mapPatterns.update(selectedPatternId, {
                nodesData: JSON.stringify(serializeNodes(nodes)),
                edgesData: JSON.stringify(serializeEdges(edges)),
            });
            const newId = await addMapPattern(currentProject.id, name);
            await db.mapPatterns.update(newId, {
                nodesData: JSON.stringify(serializeNodes(nodes)),
                edgesData: JSON.stringify(serializeEdges(edges)),
            });
            handlePatternChange(newId);
        }
    };

    const handleDeletePatternClick = async () => {
        if (!selectedPatternId) return;
        if (!window.confirm('現在のパターンを完全に削除しますか？\n（この操作は取り消せません）')) return;
        await deleteMapPattern(selectedPatternId);
        const remaining = mapPatterns.filter((p) => p.id !== selectedPatternId);
        handlePatternChange(remaining.length > 0 ? remaining[0].id : null);
    };

    // Auto-align location nodes
    const [showAlignPanel, setShowAlignPanel] = useState(false);
    const [alignGapX, setAlignGapX] = useState(180);
    const [alignGapY, setAlignGapY] = useState(160);
    const handleAutoAlign = () => {
        const locNodes = nodes.filter((n) => n.type === 'locationNode');
        if (locNodes.length === 0) return;
        const cols = Math.max(1, Math.ceil(Math.sqrt(locNodes.length)));
        const startX = 120,
            startY = 100;
        setNodes((nds) =>
            nds.map((n) => {
                if (n.type !== 'locationNode') return n;
                const idx = locNodes.findIndex((cn) => cn.id === n.id);
                if (idx < 0) return n;
                return {
                    ...n,
                    position: {
                        x: startX + (idx % cols) * alignGapX,
                        y: startY + Math.floor(idx / cols) * alignGapY,
                    },
                };
            }),
        );
    };

    // ── Undo / Redo History ──
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

    const handleUndo = useCallback(() => {
        if (historyIndex.current > 0) {
            isUndoRedoAction.current = true;
            historyIndex.current--;
            const snap = history.current[historyIndex.current];
            setNodes(snap.nodes.map((n) => ({ ...n, position: { ...n.position } })));
            setEdges(snap.edges.map((e) => ({ ...e })));
        }
    }, [setNodes, setEdges]);

    const handleRedo = useCallback(() => {
        if (historyIndex.current < history.current.length - 1) {
            isUndoRedoAction.current = true;
            historyIndex.current++;
            const snap = history.current[historyIndex.current];
            setNodes(snap.nodes.map((n) => ({ ...n, position: { ...n.position } })));
            setEdges(snap.edges.map((e) => ({ ...e })));
        }
    }, [setNodes, setEdges]);

    const handleClearAll = useCallback(() => {
        if (
            !window.confirm('現在の相関図の全要素を削除しますか？\n（場所も含め全てリセットされます。※元に戻せません）')
        )
            return;
        setNodes([]);
        setEdges([]);
        history.current = [];
        historyIndex.current = -1;
    }, [setNodes, setEdges]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                selectedNodeIds.forEach((id) => {
                    const node = nodes.find((n) => n.id === id);
                    if (node && node.type !== 'locationNode') handleDeleteNode(id);
                });
                selectedEdgeIds.forEach((id) => { handleDeleteEdge(id); });
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
            {/* Header */}
            <div className="relation-header">
                <h2 className="relation-title">地図</h2>
                <div className="relation-header-actions">
                    <select
                        value={selectedPatternId || ''}
                        onChange={(e) => handlePatternChange(Number(e.target.value))}
                        className="relation-pattern-select"
                    >
                        {mapPatterns.map((p) => (
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
                    <button onClick={handleAddLocation} className="relation-header-btn relation-add-char-btn">
                        <UserPlus size={14} /> 場所追加
                    </button>
                </div>
            </div>

            {/* Tool Palette */}
            <ToolPalette
                drawMode={drawMode}
                setDrawMode={setDrawMode}
                drawColor={drawColor}
                setDrawColor={setDrawColor}
                rectBgColor={rectBgColor}
                setRectBgColor={setRectBgColor}
                entityMode="location"
                entityToolLabel="場所追加"
                symbolTools={SYMBOL_TOOLS}
            />

            {/* Auto-align panel */}
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
                        <AlignHorizontalSpaceAround size={14} /> 場所を自動整列
                    </button>
                </div>
            )}

            {/* Main content: Tree left + Canvas right */}
            <div className="flex-1 flex overflow-hidden min-h-0 items-stretch bg-bg-primary">
                {/* Left Sidebar: Location List */}
                <LocationTree
                    onAddLocation={() => {
                        const newId = addLocation(currentProject.id, { name: '新規場所' });
                        selectLocation(newId);
                    }}
                />

                {/* Main Graph Area */}
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
                                    nodeColor={(n) => {
                                        if (n.type === 'locationNode') return '#8B2535';
                                        if (n.type === 'rectNode') return 'transparent';
                                        return '#6b7280';
                                    }}
                                    nodeStrokeColor={(n) => {
                                        if (n.type === 'rectNode') return '#22c55e';
                                        return 'transparent';
                                    }}
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
                        entityNodeType="locationNode"
                    />
                </div>
            </div>

            {/* Location Detail Modal */}
            {showDetail && selectedLocationId && (
                <LocationDetail locationId={selectedLocationId} onClose={() => setShowDetail(false)} isModal={true} />
            )}

            {/* Pattern Modal */}
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

export default function MapEditor() {
    return (
        <ReactFlowProvider>
            <MapEditorInner />
        </ReactFlowProvider>
    );
}
