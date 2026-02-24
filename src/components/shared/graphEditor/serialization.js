// ノード / エッジのシリアライズ (コールバック関数を除去してDBに安全に保存できる形に変換)

export function serializeNodes(nodes) {
    return nodes.map((n) => {
        const { onSelect, onLabelChange, onDelete, ...safeData } = n.data || {};
        return {
            id: n.id,
            type: n.type,
            position: n.position,
            data: safeData,
            style: n.style,
            width: n.width,
            height: n.height,
            measured: n.measured,
            zIndex: n.zIndex,
        };
    });
}

export function serializeEdges(edges) {
    return edges.map((e) => {
        const { onLabelChange, onDragLine, ...safeData } = e.data || {};
        return {
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type,
            data: safeData,
            style: e.style,
            markerEnd: e.markerEnd,
            markerStart: e.markerStart,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
        };
    });
}
