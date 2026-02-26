import { useMemo } from 'react';
import useCharacterStore from '../../stores/characterStore';
import useMapStore from '../../stores/mapStore';
import useNovelStore from '../../stores/novelStore';
import { renderPreview } from '../../utils/textProcessing';

export default function NovelPreview({ scrollRef }) {
    const textBlocks = useNovelStore((s) => s.textBlocks);
    const selectedChapterId = useNovelStore((s) => s.selectedChapterId);
    const fontSize = useNovelStore((s) => s.fontSize);
    const characters = useCharacterStore((s) => s.characters);
    const locations = useMapStore((s) => s.locations);

    const variables = useMemo(
        () => [
            ...characters.map((c) => ({
                variableName: c.variableName,
                name: c.name,
                nameFirst: c.nameFirst || '',
                nameLast: c.nameLast || '',
                nameMiddle: c.nameMiddle || '',
            })),
            ...locations.map((l) => ({ variableName: l.variableName, name: l.name })),
        ],
        [characters, locations],
    );

    const previewHtml = useMemo(() => {
        if (!selectedChapterId || textBlocks.length === 0) return '';
        return textBlocks
            .map((block) => `<div class="min-h-[1.5em]">${renderPreview(block.content || '', variables)}</div>`)
            .join('');
    }, [textBlocks, variables, selectedChapterId]);

    if (!selectedChapterId) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted">
                <p className="text-sm">章を選択するとプレビューが表示されます</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="p-2 border-b border-border">
                <h3 className="text-xs font-medium text-text-secondary">プレビュー</h3>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
                <div
                    className="w-full max-w-3xl leading-loose text-text-primary px-4 sm:px-8"
                    style={{
                        fontFamily: "'Noto Serif JP', 'Yu Mincho', serif",
                        fontSize: `${fontSize}px`,
                        lineHeight: '2',
                    }}
                    dangerouslySetInnerHTML={{
                        __html:
                            previewHtml ||
                            '<span class="text-text-muted">テキストを入力するとプレビューが表示されます</span>',
                    }}
                />
                {/* エディタと下端を揃えるスペーサー */}
                <div className="h-10 w-full shrink-0" aria-hidden="true" />
            </div>
        </div>
    );
}
