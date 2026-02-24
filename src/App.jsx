import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RelationGraph from './components/character/RelationGraph';
import Layout from './components/layout/Layout';
import MapEditor from './components/map/MapEditor';
// Pages
import ChapterTree from './components/novel/ChapterTree';
import NovelEditor from './components/novel/NovelEditor';
import NovelPreview from './components/novel/NovelPreview';
import PlotManager from './components/plot/PlotManager';
import SettingsManager from './components/settings/SettingsManager';
import useCharacterStore from './stores/characterStore';
import useMapStore from './stores/mapStore';
import useNovelStore from './stores/novelStore';
import usePlotStore from './stores/plotStore';
import useProjectStore from './stores/projectStore';
import useSettingStore from './stores/settingStore';

const TREE_COLLAPSED_WIDTH = 44;

function NovelPage() {
    const [treeWidth, setTreeWidth] = useState(250);
    const [previewWidth, setPreviewWidth] = useState(400);
    const [isTreeHovered, setIsTreeHovered] = useState(false);
    const isResizingRef = useRef(false);
    const previewScrollRef = useRef(null);

    // エディタのスクロール位置をプレビューに同期する（スクロール率を使用）
    const handleEditorScroll = useCallback((e) => {
        const el = e.target;
        const { scrollTop, scrollHeight, clientHeight } = el;
        if (scrollHeight <= clientHeight) return;
        const ratio = scrollTop / (scrollHeight - clientHeight);
        if (previewScrollRef.current) {
            const pEl = previewScrollRef.current;
            pEl.scrollTop = ratio * (pEl.scrollHeight - pEl.clientHeight);
        }
    }, []);

    const handleTreeDrag = (e) => {
        isResizingRef.current = true;
        const startX = e.clientX;
        const startWidth = treeWidth;

        const onMouseMove = (moveEvent) => {
            const newWidth = Math.max(150, Math.min(startWidth + moveEvent.clientX - startX, 600));
            setTreeWidth(newWidth);
        };
        const onMouseUp = () => {
            isResizingRef.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handlePreviewDrag = (e) => {
        const startX = e.clientX;
        const startWidth = previewWidth;

        const onMouseMove = (moveEvent) => {
            const newWidth = Math.max(200, Math.min(startWidth - (moveEvent.clientX - startX), 800));
            setPreviewWidth(newWidth);
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    return (
        <div className="h-full flex overflow-hidden">
            <div
                style={{ width: isTreeHovered ? treeWidth : TREE_COLLAPSED_WIDTH }}
                className="bg-bg-secondary/30 shrink-0 relative flex transition-[width] duration-200 ease-in-out"
                onMouseEnter={() => setIsTreeHovered(true)}
                onMouseLeave={() => {
                    if (!isResizingRef.current) setIsTreeHovered(false);
                }}
            >
                <div className="flex-1 overflow-hidden min-w-0">
                    <ChapterTree collapsed={!isTreeHovered} />
                </div>
                {isTreeHovered && (
                    <div
                        onMouseDown={handleTreeDrag}
                        className="w-1.5 cursor-col-resize bg-border hover:bg-accent-primary/60 active:bg-accent-primary transition-colors z-10 shrink-0"
                    />
                )}
            </div>
            <div className="flex-1 min-w-0 relative flex">
                <div className="flex-1 overflow-hidden min-w-0">
                    <NovelEditor onScroll={handleEditorScroll} />
                </div>
                <div
                    onMouseDown={handlePreviewDrag}
                    className="w-1.5 cursor-col-resize bg-border hover:bg-accent-primary/60 active:bg-accent-primary transition-colors z-10 shrink-0"
                />
            </div>
            <div style={{ width: previewWidth }} className="shrink-0 overflow-hidden min-w-0 bg-bg-primary">
                <NovelPreview scrollRef={previewScrollRef} />
            </div>
        </div>
    );
}

function App() {
    const { initStore, currentProject } = useProjectStore();
    const { loadCharacters } = useCharacterStore();
    const { loadLocations } = useMapStore();

    useEffect(() => {
        initStore();
    }, []);

    useEffect(() => {
        if (currentProject) {
            loadCharacters(currentProject.id);
            loadLocations(currentProject.id);
        } else {
            useNovelStore.setState({ chapters: [], textBlocks: [], selectedChapterId: null });
            useCharacterStore.setState({
                characters: [],
                selectedCharacterId: null,
                relationships: [],
                selectedPatternId: null,
            });
            useMapStore.setState({ mapPatterns: [], locations: [], selectedPatternId: null });
            usePlotStore.setState({ plots: [], selectedPlotId: null });
            useSettingStore.setState({ settings: [], selectedCategory: null, selectedSettingId: null });
        }
    }, [currentProject]);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Navigate to="/novel" replace />} />
                    <Route path="novel" element={<NovelPage />} />
                    <Route path="plot" element={<PlotManager />} />
                    <Route path="characters" element={<RelationGraph />} />
                    <Route path="map" element={<MapEditor />} />
                    <Route path="settings" element={<SettingsManager />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
