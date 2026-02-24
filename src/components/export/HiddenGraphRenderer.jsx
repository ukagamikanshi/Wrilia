import {
    Background,
    getStraightPath,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
} from '@xyflow/react';
// import '@xyflow/react/dist/style.css'; // Removed to avoid html-to-image CORS/inlining issues with remote CSS
import { toJpeg, toPng, toSvg } from 'html-to-image';
import { User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import db from '../../db/database';
import useCharacterStore from '../../stores/characterStore';

// ── Export Nodes ──
function CharacterNode({ data }) {
    return (
        <div
            className="relation-character-node pointer-events-none"
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
            <Handle type="source" position={Position.Top} id="top-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} id="bottom-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Left} id="left-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right-source" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Top} id="top-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Left} id="left-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Right} id="right-target" style={{ opacity: 0 }} />

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
        </div>
    );
}

function RectNode({ data }) {
    return (
        <div
            className="relation-rect-node pointer-events-none"
            style={{
                backgroundColor: data.bgColor || 'rgba(187,222,186,0.45)',
                borderColor: data.borderColor || '#22c55e',
                borderWidth: `${data.borderWidth || 2}px`,
                borderRadius: `${data.borderRadius || 12}px`,
            }}
        >
            {data.label && (
                <div className="relation-rect-label" style={{ color: data.labelColor || '#2E4C38' }}>
                    <span className="font-bold text-sm">{data.label}</span>
                </div>
            )}
            <Handle type="source" position={Position.Top} className="relation-handle" id="top" style={{ opacity: 0 }} />
            <Handle
                type="source"
                position={Position.Bottom}
                className="relation-handle"
                id="bottom"
                style={{ opacity: 0 }}
            />
            <Handle
                type="source"
                position={Position.Left}
                className="relation-handle"
                id="left"
                style={{ opacity: 0 }}
            />
            <Handle
                type="source"
                position={Position.Right}
                className="relation-handle"
                id="right"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Top}
                className="relation-handle-target"
                id="top"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                className="relation-handle-target"
                id="bottom"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Left}
                className="relation-handle-target"
                id="left"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Right}
                className="relation-handle-target"
                id="right"
                style={{ opacity: 0 }}
            />
            <Handle type="source" position={Position.Top} id="top-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} id="bottom-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Left} id="left-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right-source" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Top} id="top-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Left} id="left-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Right} id="right-target" style={{ opacity: 0 }} />
        </div>
    );
}

function TextNode({ data }) {
    return (
        <div className="relation-text-node pointer-events-none">
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
            <Handle type="source" position={Position.Top} className="relation-handle" id="top" style={{ opacity: 0 }} />
            <Handle
                type="source"
                position={Position.Bottom}
                className="relation-handle"
                id="bottom"
                style={{ opacity: 0 }}
            />
            <Handle
                type="source"
                position={Position.Left}
                className="relation-handle"
                id="left"
                style={{ opacity: 0 }}
            />
            <Handle
                type="source"
                position={Position.Right}
                className="relation-handle"
                id="right"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Top}
                className="relation-handle-target"
                id="top"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                className="relation-handle-target"
                id="bottom"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Left}
                className="relation-handle-target"
                id="left"
                style={{ opacity: 0 }}
            />
            <Handle
                type="target"
                position={Position.Right}
                className="relation-handle-target"
                id="right"
                style={{ opacity: 0 }}
            />
            <Handle type="source" position={Position.Top} id="top-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} id="bottom-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Left} id="left-source" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right-source" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Top} id="top-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Left} id="left-target" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Right} id="right-target" style={{ opacity: 0 }} />
        </div>
    );
}

function AnchorNode({ data }) {
    const accentColor = data?.color || '#8b5cf6';
    return (
        <div
            className="relation-anchor-visible"
            style={{
                backgroundColor: 'transparent',
                borderColor: accentColor,
            }}
        >
            <Handle type="source" position={Position.Bottom} isConnectable={false} style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Top} isConnectable={false} style={{ opacity: 0 }} />
        </div>
    );
}

const exportNodeTypes = {
    characterNode: CharacterNode,
    locationNode: CharacterNode, // Location nodes map perfectly to the same UI format as CharacterNodes
    rectNode: RectNode,
    textNode: TextNode,
    anchorNode: AnchorNode,
};

// ── Export Edge ──
function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, data, style, markerEnd, markerStart }) {
    const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    const edgeColor = style?.stroke || data?.color || '#8b5cf6';

    return (
        <>
            <path
                d={edgePath}
                fill="none"
                stroke={edgeColor}
                strokeWidth={style?.strokeWidth || data?.strokeWidth || 2.5}
                markerEnd={markerEnd}
                markerStart={markerStart}
            />
            {data?.label && (
                <foreignObject x={midX - 60} y={midY - 14} width={120} height={28} style={{ overflow: 'visible' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%',
                            height: '100%',
                        }}
                    >
                        <span className="relation-edge-label" style={{ color: data?.labelColor || '#1f2937' }}>
                            {data.label}
                        </span>
                    </div>
                </foreignObject>
            )}
        </>
    );
}

const exportEdgeTypes = {
    labeled: LabeledEdge,
    default: LabeledEdge,
};

export default function HiddenGraphRenderer({
    project,
    patterns,
    fileNames,
    format,
    fileHandle,
    directoryHandle,
    onProgress,
    onComplete,
}) {
    const { characters, loadCharacters } = useCharacterStore();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentNodes, setCurrentNodes, onNodesChange] = useNodesState([]);
    const [currentEdges, setCurrentEdges, onEdgesChange] = useEdgesState([]);
    const [isRendering, setIsRendering] = useState(false);
    const flowRef = useRef(null);
    const hasStarted = useRef(false);

    useEffect(() => {
        if (!project) return;
        loadCharacters(project.id);
    }, [project]);

    useEffect(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        if (patterns.length === 0) {
            onComplete();
            return;
        }

        processPattern(0);
    }, [patterns]);

    const processPattern = async (index) => {
        if (index >= patterns.length) {
            onComplete();
            return;
        }

        setCurrentIndex(index);
        const pattern = patterns[index];

        try {
            // Load exact react-flow nodes and edges for this pattern
            let nodes = [];
            let edges = [];

            try {
                nodes = JSON.parse(pattern.nodesData || '[]');
                edges = JSON.parse(pattern.edgesData || '[]');
            } catch (err) {
                console.error('Failed to parse pattern data:', err);
            }

            // Ensure images exist inside data payload if possible, though ReactFlow JSON
            // from RelationGraph has the data correctly embedded if it existed.
            // Note: Since `useCharacterStore` keeps `characters` in memory, we could cross-reference
            // if needed, but since nodesData saves `image` property it shouldn't be essential.

            // Map location nodes vs characters are handled under the hood because MapEditor and RelationEditor
            // store them identically except for 'type' string (locationNode vs characterNode).

            // Clean up missing nodes and corrupted anchor handles directly from legacy DB
            const validNodeIds = new Set(nodes.map((n) => n.id));
            const validEdges = edges
                .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
                .map((e) => {
                    const sn = nodes.find((n) => n.id === e.source);
                    const tn = nodes.find((n) => n.id === e.target);
                    let sh = e.sourceHandle;
                    let th = e.targetHandle;
                    if (sn?.type === 'anchorNode') sh = undefined;
                    if (tn?.type === 'anchorNode') th = undefined;
                    return { ...e, sourceHandle: sh, targetHandle: th };
                });

            setCurrentNodes(nodes);
            setCurrentEdges(validEdges);
            setIsRendering(true);

            // Give ReactFlow time to render, load images, and fit view.
            setTimeout(() => {
                captureAndSave(index);
            }, 2000);
        } catch (error) {
            console.error('Failed to process pattern:', pattern.name, error);
            onProgress(index + 1);
            processPattern(index + 1); // Skip and continue
        }
    };

    const captureAndSave = async (index) => {
        if (!flowRef.current) {
            onProgress(index + 1);
            processPattern(index + 1);
            return;
        }

        const pattern = patterns[index];
        const fileNameBase = fileNames[pattern._key] || pattern.name || 'export';
        const fileName = `${fileNameBase}.${format}`;

        try {
            const flowElement = flowRef.current.querySelector('.react-flow');
            if (!flowElement) {
                throw new Error('ReactFlow element not found');
            }

            // Add a filter to avoid rendering react-flow controls in the background
            const filter = (node) => {
                const exclusionClasses = ['react-flow__controls'];
                if (node.classList && exclusionClasses.some((cls) => node.classList.contains(cls))) return false;
                return true;
            };

            const exportFunc = format === 'jpeg' ? toJpeg : format === 'svg' ? toSvg : toPng;

            const dataUrl = await exportFunc(flowElement, {
                backgroundColor: '#ffffff',
                cacheBust: true,
                filter: filter,
                fontEmbedCSS: '', // Disables inline fetching of external fonts which causes SecurityError
                style: {
                    width: '100%',
                    height: '100%',
                    transform: 'none',
                },
            });

            // Convert to blob safely without fetch (bypasses URL length limits)
            const arr = dataUrl.split(',');
            const meta = arr[0];
            const mimeMatch = meta.match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : format === 'svg' ? 'image/svg+xml' : 'image/png';

            let blob;
            if (meta.includes('base64')) {
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                blob = new Blob([u8arr], { type: mime });
            } else {
                // toSvg typically returns a URL-encoded string data URL rather than base64
                const decoded = decodeURIComponent(arr[1]);
                blob = new Blob([decoded], { type: mime });
            }

            // Save: fileHandle = 1件選択, directoryHandle = 複数選択
            if (fileHandle) {
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else if (directoryHandle) {
                const fh = await directoryHandle.getFileHandle(fileName, { create: true });
                const writable = await fh.createWritable();
                await writable.write(blob);
                await writable.close();
            }

            onProgress(index + 1);
            setIsRendering(false);
            processPattern(index + 1);
        } catch (err) {
            console.error('Export failed for', fileName, err);
            alert(`${fileName} の書き出しに失敗しました: ${err.message}`);
            onProgress(index + 1);
            setIsRendering(false);
            processPattern(index + 1);
        }
    };

    // Keep it in the DOM behind the main layout (zIndex -9999) so browsers do not optimize it away (which causes blank images)
    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '2560px',
                height: '1440px',
                zIndex: -9999,
                pointerEvents: 'none',
            }}
        >
            <div ref={flowRef} style={{ width: '100%', height: '100%', background: 'white' }}>
                <ReactFlowProvider>
                    {isRendering && (
                        <ReactFlow
                            nodes={currentNodes}
                            edges={currentEdges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            nodeTypes={exportNodeTypes}
                            edgeTypes={exportEdgeTypes}
                            fitView
                            fitViewOptions={{ padding: 0.1, duration: 0 }}
                            minZoom={0.1}
                            maxZoom={4}
                            attributionPosition="bottom-right"
                            contentEditable={false}
                            panOnDrag={false}
                            zoomOnScroll={false}
                            nodesDraggable={false}
                            nodesConnectable={false}
                            elementsSelectable={false}
                            onlyRenderVisibleElements={false} // Force render all nodes for export
                            preventScrolling={false}
                        >
                            <Background color="#ccc" gap={16} />
                        </ReactFlow>
                    )}
                </ReactFlowProvider>
            </div>
        </div>
    );
}
