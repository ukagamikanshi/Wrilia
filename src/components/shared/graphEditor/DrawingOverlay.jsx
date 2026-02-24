// RelationGraph と MapEditor で共通の描画オーバーレイ
// rect / arrow / line モード時にキャンバス上にドラッグ描画を提供する
import { useRef, useState } from 'react';

export function DrawingOverlay({ drawMode, drawColor, rectBgColor, reactFlowInstance, onFinishRect, onFinishLine }) {
    const [drawing, setDrawing] = useState(false);
    const [start, setStart] = useState(null);
    const [current, setCurrent] = useState(null);
    const overlayRef = useRef(null);

    if (drawMode !== 'rect' && drawMode !== 'arrow' && drawMode !== 'line') return null;

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        const screenPos = { x: e.clientX, y: e.clientY };
        setStart(screenPos);
        setCurrent(screenPos);
        setDrawing(true);
    };

    const handleMouseMove = (e) => {
        if (!drawing) return;
        setCurrent({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e) => {
        if (!drawing || !start) return;
        setDrawing(false);

        if (drawMode === 'rect') {
            const x1 = Math.min(start.x, e.clientX);
            const y1 = Math.min(start.y, e.clientY);
            const w = Math.abs(e.clientX - start.x);
            const h = Math.abs(e.clientY - start.y);
            if (w > 10 && h > 10) {
                const pos1 = reactFlowInstance.screenToFlowPosition({ x: x1, y: y1 });
                const pos2 = reactFlowInstance.screenToFlowPosition({ x: x1 + w, y: y1 + h });
                onFinishRect({ x: pos1.x, y: pos1.y, width: pos2.x - pos1.x, height: pos2.y - pos1.y });
            }
        } else {
            const startPos = reactFlowInstance.screenToFlowPosition({ x: start.x, y: start.y });
            const endPos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
            if (dist > 10) {
                onFinishLine(startPos, endPos, drawMode === 'arrow');
            }
        }

        setStart(null);
        setCurrent(null);
    };

    const renderPreview = () => {
        if (!drawing || !start || !current) return null;
        if (drawMode === 'rect') {
            const x = Math.min(start.x, current.x);
            const y = Math.min(start.y, current.y);
            const w = Math.abs(current.x - start.x);
            const h = Math.abs(current.y - start.y);
            return (
                <div
                    style={{
                        position: 'fixed',
                        left: x,
                        top: y,
                        width: w,
                        height: h,
                        border: `2px dashed ${drawColor}`,
                        backgroundColor: rectBgColor,
                        borderRadius: '8px',
                        pointerEvents: 'none',
                    }}
                />
            );
        } else {
            return (
                <svg
                    style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                >
                    <defs>
                        {drawMode === 'arrow' && (
                            <marker
                                id="preview-arrow"
                                markerWidth="10"
                                markerHeight="7"
                                refX="10"
                                refY="3.5"
                                orient="auto"
                            >
                                <polygon points="0 0, 10 3.5, 0 7" fill={drawColor} />
                            </marker>
                        )}
                    </defs>
                    <line
                        x1={start.x}
                        y1={start.y}
                        x2={current.x}
                        y2={current.y}
                        stroke={drawColor}
                        strokeWidth={2.5}
                        markerEnd={drawMode === 'arrow' ? 'url(#preview-arrow)' : undefined}
                    />
                </svg>
            );
        }
    };

    return (
        <div
            ref={overlayRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10,
                cursor: 'crosshair',
            }}
        >
            {renderPreview()}
        </div>
    );
}
