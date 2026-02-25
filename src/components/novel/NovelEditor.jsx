import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    AlignLeft,
    Copy,
    GripVertical,
    MessageSquare,
    Plus,
    Redo2,
    Replace,
    Search,
    Sparkles,
    Trash2,
    Type,
    Undo2,
} from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useCharacterStore from '../../stores/characterStore';
import useMapStore from '../../stores/mapStore';
import useNovelStore from '../../stores/novelStore';
import useProjectStore from '../../stores/projectStore';
import { applyIndentation, removeIndentation, replaceAllWords } from '../../utils/textProcessing';
import { EmphasisModal, RubyModal } from './FormatModals';

const SortableBlock = memo(function SortableBlock({
    block,
    onUpdate,
    onDelete,
    onDuplicate,
    onKeyDown,
    isFocused,
    focusOption,
    onFocusComplete,
    onFocus,
    onSelectionChange,
    fontSize,
    cursorTarget,
    onCursorSet,
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block._key });

    const [localContent, setLocalContent] = useState(block.content);
    const textareaRef = useRef(null);
    const pendingCursorRef = useRef(null);

    useEffect(() => {
        if (isFocused && textareaRef.current) {
            textareaRef.current.focus();
            if (focusOption === 'end') {
                const len = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(len, len);
            } else if (focusOption === 'start') {
                textareaRef.current.setSelectionRange(0, 0);
            }
            onFocusComplete?.();
        }
    }, [isFocused, focusOption, onFocusComplete]);

    useEffect(() => {
        if (cursorTarget !== null && cursorTarget !== undefined) {
            pendingCursorRef.current = cursorTarget;
        }
    }, [cursorTarget]);

    useEffect(() => {
        if (localContent !== block.content) {
            setLocalContent(block.content);
        }
    }, [block.content]);

    // Zustand ストアへの保存 (debounce)
    useEffect(() => {
        const handler = setTimeout(() => {
            if (localContent !== block.content) {
                onUpdate(block._key, localContent);
            }
        }, 300);
        return () => clearTimeout(handler);
    }, [localContent, block._key, onUpdate]);

    // テキストエリアの高さ自動調整
    // useLayoutEffect でペイント前に同期実行することで、「高さが大きいまま一瞬表示される」
    // ちらつきを防ぐ。height='0px' にリセットしてから scrollHeight を測定することで、
    // DnD の transform アニメーション中や複数ブロック同時レンダリング時でも
    // 正確なコンテンツ高さを取得できる（height='auto' は状況によって誤った値を返す）。
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = '0px';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, [localContent, fontSize]);

    // テキストエリアの幅変化時に高さを再計算
    // JSON読み込み直後などはマウント時点でテキストエリアの幅が未確定の場合があり、
    // useLayoutEffect での scrollHeight 測定が誤った値を返す（折り返しが正しく計算されない）。
    // ResizeObserver で幅確定・ウィンドウリサイズを監視し、幅が変わった時点で再計算する。
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        let prevWidth = textarea.offsetWidth;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = Math.round(entry.contentRect.width);
                if (newWidth !== prevWidth) {
                    prevWidth = newWidth;
                    textarea.style.height = '0px';
                    textarea.style.height = `${textarea.scrollHeight}px`;
                }
            }
        });
        observer.observe(textarea);
        return () => observer.disconnect();
    }, []); // マウント時のみ（observer が以降の変化を監視し続ける）

    // 変数挿入後のカーソル設定（高さ調整とは独立して同期実行）
    useEffect(() => {
        if (pendingCursorRef.current !== null && textareaRef.current) {
            const pos = pendingCursorRef.current;
            pendingCursorRef.current = null;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(pos, pos);
            onSelectionChange?.(block._key, pos, pos, '');
            onCursorSet?.();
        }
    }, [localContent, block._key, onSelectionChange, onCursorSet]);

    const handleSave = () => {
        if (localContent !== block.content) {
            onUpdate(block._key, localContent);
        }
    };

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const isDialogue = localContent.trim().startsWith('「') && localContent.trim().endsWith('」');
    const isEmpty = localContent === '';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-start gap-1 animate-fade-in ${isDragging ? 'z-50' : ''}`}
        >
            <button
                {...attributes}
                {...listeners}
                className="mt-0.5 cursor-grab opacity-0 group-hover:opacity-100 transition-all shrink-0 flex items-center justify-center w-6 h-6 hover:bg-accent-primary/10 rounded text-text-muted hover:text-accent-secondary"
                tabIndex={-1}
            >
                <GripVertical size={16} />
            </button>
            <div className="flex-1 relative">
                <textarea
                    ref={textareaRef}
                    value={localContent}
                    onChange={(e) => setLocalContent(e.target.value)}
                    onFocus={(e) => {
                        onFocus?.(block._key);
                        if (e.target.selectionStart !== e.target.selectionEnd) {
                            onSelectionChange?.(
                                block._key,
                                e.target.selectionStart,
                                e.target.selectionEnd,
                                e.target.value.substring(e.target.selectionStart, e.target.selectionEnd),
                            );
                        }
                    }}
                    onSelect={(e) => {
                        onSelectionChange?.(
                            block._key,
                            e.target.selectionStart,
                            e.target.selectionEnd,
                            e.target.value.substring(e.target.selectionStart, e.target.selectionEnd),
                        );
                    }}
                    onBlur={() => handleSave()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            // 分割前に localContent を即座に beforeContent へ更新する。
                            // useEffect 経由の非同期更新を待つと 300ms デバウンスが
                            // full_content でストアを上書きしてしまうケースがあるため。
                            const selStart = e.target.selectionStart;
                            setLocalContent(localContent.substring(0, selStart).replace(/\n$/, ''));
                        }
                        onKeyDown(e, block, localContent);
                    }}
                    className={`w-full px-2 py-0.5 rounded-md border resize-none focus:outline-none focus:border-accent-primary transition-colors leading-relaxed min-h-[28px] overflow-hidden ${isEmpty ? 'bg-bg-primary border-transparent' : isDialogue ? 'bg-[var(--color-dialogue-bg)] border-[var(--color-dialogue-border)] shadow-sm' : 'bg-bg-card border-border shadow-sm'} text-text-primary`}
                    rows={1}
                    placeholder=""
                    style={{ fontFamily: "'Noto Serif JP', serif", fontSize: `${fontSize}px` }}
                />
            </div>
            <button
                onClick={() => onDuplicate(block._key)}
                className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                tabIndex={-1}
                title="複製"
            >
                <Copy size={14} className="text-text-muted hover:text-accent-secondary" />
            </button>
            <button
                onClick={() => onDelete(block._key)}
                className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:text-danger"
                tabIndex={-1}
            >
                <Trash2 size={14} className="text-text-muted hover:text-danger" />
            </button>
        </div>
    );
});

export default function NovelEditor({ onScroll }) {
    // [Fix 3] セレクターで必要なフィールドのみ購読。
    // セレクターなしで useXxxStore() を呼ぶと store の全フィールドを購読するため、
    // 無関係なフィールド（chapters, selectedCharacterId など）の変化でも再レンダリングされる。
    const textBlocks = useNovelStore((s) => s.textBlocks);
    const chapters = useNovelStore((s) => s.chapters);
    const selectedChapterId = useNovelStore((s) => s.selectedChapterId);
    const fontSize = useNovelStore((s) => s.fontSize);
    const addTextBlock = useNovelStore((s) => s.addTextBlock);
    const updateTextBlock = useNovelStore((s) => s.updateTextBlock);
    const deleteTextBlock = useNovelStore((s) => s.deleteTextBlock);
    const splitBlock = useNovelStore((s) => s.splitBlock);
    const mergeBlocks = useNovelStore((s) => s.mergeBlocks);
    const reorderTextBlocks = useNovelStore((s) => s.reorderTextBlocks);
    const setFontSize = useNovelStore((s) => s.setFontSize);
    const formatDialogueSpacing = useNovelStore((s) => s.formatDialogueSpacing);
    const deleteAllEmptyTextBlocks = useNovelStore((s) => s.deleteAllEmptyTextBlocks);
    const insertBlankLinesBetweenAllBlocks = useNovelStore((s) => s.insertBlankLinesBetweenAllBlocks);
    const duplicateTextBlock = useNovelStore((s) => s.duplicateTextBlock);
    const deleteAllDialogueBlocks = useNovelStore((s) => s.deleteAllDialogueBlocks);
    const deleteAllNarrativeBlocks = useNovelStore((s) => s.deleteAllNarrativeBlocks);
    const undoStack = useNovelStore((s) => s.undoStack);
    const redoStack = useNovelStore((s) => s.redoStack);
    const undo = useNovelStore((s) => s.undo);
    const redo = useNovelStore((s) => s.redo);
    const currentProject = useProjectStore((s) => s.currentProject);
    const characters = useCharacterStore((s) => s.characters); // selectedCharacterId 変化で再レンダリングしない
    const locations = useMapStore((s) => s.locations); // selectedPatternId 変化で再レンダリングしない

    const [showToolbar, setShowToolbar] = useState(true);
    const [searchWord, setSearchWord] = useState('');
    const [replaceWord, setReplaceWord] = useState('');
    const [focusedBlockId, setFocusedBlockId] = useState(null);
    const [lastFocusedBlockKey, setLastFocusedBlockKey] = useState(null);
    const [textSelection, setTextSelection] = useState({ blockId: null, start: 0, end: 0, text: '' });
    const [pendingCursor, setPendingCursor] = useState(null);
    const [formatSelection, setFormatSelection] = useState(null);

    const [isRubyModalOpen, setIsRubyModalOpen] = useState(false);
    const [isEmphasisModalOpen, setIsEmphasisModalOpen] = useState(false);
    const [activeVarCategory, setActiveVarCategory] = useState(null); // 'char' | 'loc' | null

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const textBlocksRef = useRef(textBlocks);
    useEffect(() => {
        textBlocksRef.current = textBlocks;
    }, [textBlocks]);

    const charCount = useMemo(() => textBlocks.reduce((sum, b) => sum + (b.content || '').length, 0), [textBlocks]);

    const handleFocusComplete = useCallback(() => setFocusedBlockId(null), []);
    const handleFocus = useCallback((key) => setLastFocusedBlockKey(key), []);
    const handleSelectionChange = useCallback(
        (blockKey, start, end, text) => setTextSelection({ blockId: blockKey, start, end, text }),
        [],
    );
    const handleCursorSet = useCallback(() => setPendingCursor(null), []);

    // グローバルキーボードショートカット（Ctrl+Z: アンドゥ、Ctrl+Y: リドゥ）
    // IME変換中・検索置換フィールド(INPUT)はスキップ。TEXTAREA はZustandのUndo/Redoを優先する。
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.isComposing) return;
            if (e.target.tagName === 'INPUT') return;
            if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
                e.preventDefault();
                undo();
            } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                redo();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [undo, redo]);

    const handleKeyDown = useCallback(
        (e, block, localContent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const selStart = e.target.selectionStart;
                // カーソルが '\n' の直後にある場合、beforeContent に末尾改行が残るため除去する
                const beforeCursor = localContent.substring(0, selStart).replace(/\n$/, '');
                // mergeBlocks 後のコンテンツ(upper+'\n'+lower)をカーソル前の'\n'で分割した場合、
                // afterContent が '\n...' になり新カード先頭に空白行が生まれるため先頭の\n1文字を除去する
                const afterCursor = localContent.substring(selStart).replace(/^\n/, '');
                // splitBlock でアトミックに分割（updateTextBlock + addTextBlock の2重更新を避ける）
                const key = splitBlock(block._key, beforeCursor, afterCursor);
                if (key) setFocusedBlockId({ id: key, option: 'start' });
            } else if (e.key === 'Backspace') {
                const selStart = e.target.selectionStart;
                const selEnd = e.target.selectionEnd;
                // カーソルが先頭かつ範囲選択なしのときのみカード間結合を処理
                if (selStart === 0 && selEnd === 0) {
                    e.preventDefault();
                    const currentIndex = textBlocksRef.current.findIndex((b) => b._key === block._key);
                    if (currentIndex > 0) {
                        const prevBlock = textBlocksRef.current[currentIndex - 1];
                        if (localContent === '') {
                            // 現在カードが空 → 削除して前カードの末尾へフォーカス
                            deleteTextBlock(block._key);
                            setFocusedBlockId({ id: prevBlock._key, option: 'end' });
                        } else if (prevBlock.content === '') {
                            // 前カードが空 → 前カードを削除して現在のカードにとどまる
                            deleteTextBlock(prevBlock._key);
                        } else {
                            // 両方テキストあり → 前カードの末尾に '\n' で結合
                            // カーソルは '\n' の直後（元の現在カードのテキスト先頭）へ
                            const cursorPos = prevBlock.content.length + 1;
                            mergeBlocks(prevBlock._key, block._key);
                            setFocusedBlockId({ id: prevBlock._key });
                            setPendingCursor({ blockId: prevBlock._key, pos: cursorPos });
                        }
                    }
                }
            } else if (e.key === 'ArrowUp') {
                // カーソルより前に '\n' がなければ先頭行にいる → 上のカードの末尾へ移動
                const isOnFirstLine = !e.target.value.substring(0, e.target.selectionStart).includes('\n');
                if (isOnFirstLine) {
                    const currentIndex = textBlocksRef.current.findIndex((b) => b._key === block._key);
                    if (currentIndex > 0) {
                        e.preventDefault();
                        const prevBlock = textBlocksRef.current[currentIndex - 1];
                        setFocusedBlockId({ id: prevBlock._key, option: 'end' });
                    }
                }
            } else if (e.key === 'ArrowDown') {
                // カーソルより後に '\n' がなければ最終行にいる → 下のカードの先頭へ移動
                const isOnLastLine = !e.target.value.substring(e.target.selectionStart).includes('\n');
                if (isOnLastLine) {
                    const currentIndex = textBlocksRef.current.findIndex((b) => b._key === block._key);
                    if (currentIndex < textBlocksRef.current.length - 1) {
                        e.preventDefault();
                        const nextBlock = textBlocksRef.current[currentIndex + 1];
                        setFocusedBlockId({ id: nextBlock._key, option: 'start' });
                    }
                }
            } else if (e.key === 'Delete') {
                const selStart = e.target.selectionStart;
                const selEnd = e.target.selectionEnd;
                // カーソルが末尾かつ範囲選択なしのときのみカード間結合を処理
                if (selStart === localContent.length && selEnd === localContent.length) {
                    e.preventDefault();
                    const currentIndex = textBlocksRef.current.findIndex((b) => b._key === block._key);
                    if (currentIndex < textBlocksRef.current.length - 1) {
                        const nextBlock = textBlocksRef.current[currentIndex + 1];
                        if (nextBlock.content === '') {
                            // 次カードが空 → 次カードを削除して現在のカードにとどまる
                            deleteTextBlock(nextBlock._key);
                        } else if (localContent === '') {
                            // 現在カードが空 → 現在カードを削除して次カードの先頭へフォーカス
                            deleteTextBlock(block._key);
                            setFocusedBlockId({ id: nextBlock._key, option: 'start' });
                        } else {
                            // 両方テキストあり → 次カードを現在カードの末尾に '\n' で結合
                            // カーソルは '\n' の直前（現在カードの末尾）に留まる
                            const cursorPos = localContent.length;
                            mergeBlocks(block._key, nextBlock._key);
                            setPendingCursor({ blockId: block._key, pos: cursorPos });
                        }
                    }
                }
            }
        },
        [splitBlock, deleteTextBlock, mergeBlocks],
    );

    const handleAddBlock = useCallback(() => {
        if (currentProject && selectedChapterId) {
            const key = addTextBlock(selectedChapterId, currentProject.id);
            setFocusedBlockId({ id: key });
        }
    }, [currentProject, selectedChapterId, addTextBlock]);

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id || !selectedChapterId) return;
        const oldIndex = textBlocks.findIndex((b) => b._key === active.id);
        const newIndex = textBlocks.findIndex((b) => b._key === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = arrayMove(textBlocks, oldIndex, newIndex);
            const reorderedIds = newOrder.map((b) => b.id).filter((id) => id != null);
            reorderTextBlocks(selectedChapterId, reorderedIds);
        }
    };

    const handleReplaceAll = () => {
        if (!searchWord) return;
        textBlocks.forEach((block) => {
            const newContent = replaceAllWords(block.content, searchWord, replaceWord);
            if (newContent !== block.content) updateTextBlock(block._key, newContent);
        });
    };

    const handleDialogueSpacing = async (mode) => {
        if (!currentProject || !selectedChapterId) return;
        await formatDialogueSpacing(selectedChapterId, currentProject.id, mode);
    };

    const handleIndentation = (mode) => {
        textBlocks.forEach((block) => {
            const fn = mode === 'remove' ? removeIndentation : applyIndentation;
            const newContent = fn(block.content, mode);
            if (newContent !== block.content) updateTextBlock(block._key, newContent);
        });
    };

    const handleInsertBlanksBetweenAll = async () => {
        if (!currentProject || !selectedChapterId) return;
        await insertBlankLinesBetweenAllBlocks(selectedChapterId, currentProject.id);
    };

    const handleDeleteAllEmpty = async () => {
        if (!selectedChapterId) return;
        await deleteAllEmptyTextBlocks(selectedChapterId);
    };

    const handleDuplicateBlock = useCallback(
        (_key) => {
            duplicateTextBlock(_key);
        },
        [duplicateTextBlock],
    );

    const handleDeleteAllDialogue = async () => {
        if (!selectedChapterId) return;
        await deleteAllDialogueBlocks(selectedChapterId);
    };

    const handleDeleteAllNarrative = async () => {
        if (!selectedChapterId) return;
        await deleteAllNarrativeBlocks(selectedChapterId);
    };

    const insertVariable = (varName) => {
        const variableText = `{{${varName}}}`;
        const selectionToUse = textSelection;
        let targetKey = selectionToUse.blockId || lastFocusedBlockKey;

        if (!targetKey && textBlocks.length > 0) {
            targetKey = textBlocks[textBlocks.length - 1]._key;
        }

        if (targetKey) {
            const targetBlock = textBlocks.find((b) => b._key === targetKey);
            if (targetBlock) {
                let before, after;
                if (selectionToUse.blockId === targetKey && selectionToUse.start !== selectionToUse.end) {
                    before = targetBlock.content.substring(0, selectionToUse.start);
                    after = targetBlock.content.substring(selectionToUse.end);
                    setTextSelection({ blockId: null, start: 0, end: 0, text: '' });
                } else {
                    const pos =
                        selectionToUse.blockId === targetKey ? selectionToUse.start : targetBlock.content.length;
                    before = targetBlock.content.substring(0, pos);
                    after = targetBlock.content.substring(pos);
                }
                updateTextBlock(targetKey, before + variableText + after);
                setPendingCursor({ blockId: targetKey, pos: before.length + variableText.length });
            }
        }
    };

    const insertFormat = (formatText) => {
        const selectionToUse = formatSelection || textSelection;
        let targetKey = selectionToUse.blockId || lastFocusedBlockKey;
        if (!targetKey && textBlocks.length > 0) {
            targetKey = textBlocks[textBlocks.length - 1]._key;
        }
        if (targetKey) {
            const targetBlock = textBlocks.find((b) => b._key === targetKey);
            if (targetBlock) {
                if (selectionToUse.blockId === targetKey && selectionToUse.start !== selectionToUse.end) {
                    const before = targetBlock.content.substring(0, selectionToUse.start);
                    const after = targetBlock.content.substring(selectionToUse.end);
                    updateTextBlock(targetKey, before + formatText + after);
                    setTextSelection({ blockId: null, start: 0, end: 0, text: '' });
                } else {
                    const pos =
                        selectionToUse.blockId === targetKey ? selectionToUse.start : targetBlock.content.length;
                    const before = targetBlock.content.substring(0, pos);
                    const after = targetBlock.content.substring(pos);
                    updateTextBlock(targetKey, before + formatText + after);
                }
            }
        }
    };

    // カーソル位置に記号を挿入してカーソルを挿入後の位置に移動する
    // cursorOffset: 挿入テキスト先頭からのカーソル位置。省略時は末尾
    const handleInsertSymbol = (text, cursorOffset = text.length) => {
        let targetKey = textSelection.blockId || lastFocusedBlockKey;
        if (!targetKey && textBlocks.length > 0) {
            targetKey = textBlocks[textBlocks.length - 1]._key;
        }
        if (targetKey) {
            const targetBlock = textBlocks.find((b) => b._key === targetKey);
            if (targetBlock) {
                const pos = textSelection.blockId === targetKey ? textSelection.start : targetBlock.content.length;
                const before = targetBlock.content.substring(0, pos);
                const after = targetBlock.content.substring(pos);
                updateTextBlock(targetKey, before + text + after);
                setPendingCursor({ blockId: targetKey, pos: before.length + cursorOffset });
            }
        }
    };

    if (!selectedChapterId) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                    <PenIcon className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">左のツリーから章・話を選択してください</p>
                </div>
            </div>
        );
    }

    const selectedChapterType = chapters.find((c) => c.id === selectedChapterId)?.type;
    if (selectedChapterType && selectedChapterType !== 'episode') {
        const label = selectedChapterType === 'volume' ? '巻' : '章';
        return (
            <div className="h-full flex items-center justify-center text-text-muted">
                <div className="text-center">
                    <PenIcon className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">「{label}」はフォルダーです</p>
                    <p className="text-xs mt-1">カードを作成するには「話」を選択してください</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* ツールバー全体: 高さ上限 30vh、はみ出す場合はスクロール */}
            <div className="border-b border-border overflow-y-auto" style={{ maxHeight: '30vh' }}>
                {/* 常時表示バー */}
                <div className="px-2 py-1 flex items-center gap-2 flex-wrap sticky top-0 bg-bg-primary z-10 border-b border-border/50">
                    <button
                        onClick={() => setShowToolbar(!showToolbar)}
                        className="px-2 py-1 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap font-medium"
                    >
                        <Sparkles size={13} /> {showToolbar ? '隠す' : 'ツール'}
                    </button>
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={undo}
                            disabled={undoStack.length === 0}
                            className="px-1.5 py-1 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-0.5"
                            title={`元に戻す (Ctrl+Z)${undoStack.length > 0 ? ` — ${undoStack.length}件` : ''}`}
                        >
                            <Undo2 size={13} />
                            <span className="text-xs text-text-muted tabular-nums w-3 text-center leading-none">
                                {undoStack.length || ''}
                            </span>
                        </button>
                        <button
                            onClick={redo}
                            disabled={redoStack.length === 0}
                            className="px-1.5 py-1 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-0.5"
                            title={`やり直し (Ctrl+Y)${redoStack.length > 0 ? ` — ${redoStack.length}件` : ''}`}
                        >
                            <Redo2 size={13} />
                            <span className="text-xs text-text-muted tabular-nums w-3 text-center leading-none">
                                {redoStack.length || ''}
                            </span>
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        <Type size={13} className="text-text-muted" />
                        <input
                            type="range"
                            min="10"
                            max="24"
                            value={fontSize}
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-20 accent-accent-primary h-1.5"
                        />
                        <span className="text-xs text-text-muted w-8">{fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-1 border-l border-border pl-2">
                        <span className="text-xs text-text-muted shrink-0">記法:</span>
                        <button
                            onClick={() => {
                                setFormatSelection(textSelection);
                                setIsRubyModalOpen(true);
                            }}
                            className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors font-medium whitespace-nowrap"
                        >
                            ルビ
                        </button>
                        <button
                            onClick={() => {
                                setFormatSelection(textSelection);
                                setIsEmphasisModalOpen(true);
                            }}
                            className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors font-medium whitespace-nowrap"
                        >
                            傍点
                        </button>
                        <button
                            onClick={() => handleInsertSymbol('……')}
                            className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors font-medium whitespace-nowrap"
                        >
                            ……
                        </button>
                        <button
                            onClick={() => handleInsertSymbol('――')}
                            className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors font-medium whitespace-nowrap"
                        >
                            ――
                        </button>
                        <button
                            onClick={() => handleInsertSymbol('「」', 1)}
                            className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors font-medium whitespace-nowrap"
                            title="会話文括弧を挿入（カーソルは括弧内に移動）"
                        >
                            「」
                        </button>
                    </div>
                    <div className="ml-auto text-xs text-text-muted">{charCount}文字</div>
                    <button
                        onClick={handleAddBlock}
                        className="px-2 py-1 rounded text-xs bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/20 transition-colors flex items-center gap-1 font-medium whitespace-nowrap"
                    >
                        <Plus size={13} /> 追加
                    </button>
                </div>

                {/* 展開ツールバー */}
                {showToolbar && (
                    <div className="px-2 py-1.5 space-y-1.5 bg-bg-secondary/50 animate-fade-in">
                        {/* 検索・置換 */}
                        <div className="flex items-center gap-1.5">
                            <Search size={13} className="text-text-muted shrink-0" />
                            <input
                                value={searchWord}
                                onChange={(e) => setSearchWord(e.target.value)}
                                placeholder="検索..."
                                className="px-2 py-0.5 rounded bg-bg-card border border-border text-xs flex-1 focus:outline-none focus:border-accent-primary"
                            />
                            <Replace size={13} className="text-text-muted shrink-0" />
                            <input
                                value={replaceWord}
                                onChange={(e) => setReplaceWord(e.target.value)}
                                placeholder="置換..."
                                className="px-2 py-0.5 rounded bg-bg-card border border-border text-xs flex-1 focus:outline-none focus:border-accent-primary"
                            />
                            <button
                                onClick={handleReplaceAll}
                                className="px-2 py-0.5 rounded text-xs bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/20 transition-colors whitespace-nowrap font-medium"
                            >
                                一括変換
                            </button>
                        </div>
                        {/* 整形ボタン群 */}
                        <div className="flex gap-1 flex-wrap">
                            <button
                                onClick={() => handleDialogueSpacing('add')}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <MessageSquare size={12} /> 会話文前後空行挿入
                            </button>
                            <button
                                onClick={() => handleDialogueSpacing('remove')}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <MessageSquare size={12} /> 会話文空行削除
                            </button>
                            <button
                                onClick={() => handleIndentation('auto')}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <AlignLeft size={12} /> 自動字下げ
                            </button>
                            <button
                                onClick={() => handleIndentation('remove')}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <AlignLeft size={12} /> 字下げ解除
                            </button>
                            <button
                                onClick={handleInsertBlanksBetweenAll}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <AlignLeft size={12} /> カード間空白行挿入
                            </button>
                            <button
                                onClick={handleDeleteAllEmpty}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <Trash2 size={12} /> 空白行をすべて削除
                            </button>
                            <button
                                onClick={handleDeleteAllDialogue}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <Trash2 size={12} /> 会話文をすべて削除
                            </button>
                            <button
                                onClick={handleDeleteAllNarrative}
                                className="px-2 py-0.5 rounded text-xs bg-bg-card border border-border hover:bg-bg-hover transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                                <Trash2 size={12} /> 地の文をすべて削除
                            </button>
                        </div>
                        {/* 変数挿入: カテゴリタブ切り替え（変数未登録時も常に表示） */}
                        <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs text-text-muted shrink-0">変数:</span>
                            <button
                                onClick={() => setActiveVarCategory((v) => (v === 'char' ? null : 'char'))}
                                className={`px-2 py-0.5 rounded text-xs border transition-colors font-medium ${activeVarCategory === 'char' ? 'bg-rose-700/15 text-rose-700 border-rose-700/40' : 'bg-bg-card border-border hover:bg-bg-hover text-text-primary'}`}
                            >
                                人物名 {activeVarCategory === 'char' ? '▴' : '▾'}
                            </button>
                            <button
                                onClick={() => setActiveVarCategory((v) => (v === 'loc' ? null : 'loc'))}
                                className={`px-2 py-0.5 rounded text-xs border transition-colors font-medium ${activeVarCategory === 'loc' ? 'bg-emerald-700/15 text-emerald-700 border-emerald-700/40' : 'bg-bg-card border-border hover:bg-bg-hover text-text-primary'}`}
                            >
                                場所名 {activeVarCategory === 'loc' ? '▴' : '▾'}
                            </button>
                            {activeVarCategory === 'char' &&
                                (characters.some((c) => c.variableName) ? (
                                    characters
                                        .filter((c) => c.variableName)
                                        .map((c, i) => (
                                            <button
                                                key={`char-${i}`}
                                                onClick={() => insertVariable(c.variableName)}
                                                className="px-2 py-0.5 rounded text-xs bg-rose-700/10 text-rose-700 hover:bg-rose-700/20 transition-colors"
                                            >
                                                {`{{${c.variableName}}}`}={c.name}
                                            </button>
                                        ))
                                ) : (
                                    <span className="text-xs text-text-muted italic">
                                        人物相関図モードで人物に変数名を登録してください
                                    </span>
                                ))}
                            {activeVarCategory === 'loc' &&
                                (locations.some((l) => l.variableName) ? (
                                    locations
                                        .filter((l) => l.variableName)
                                        .map((l, i) => (
                                            <button
                                                key={`loc-${i}`}
                                                onClick={() => insertVariable(l.variableName)}
                                                className="px-2 py-0.5 rounded text-xs bg-emerald-700/10 text-emerald-700 hover:bg-emerald-700/20 transition-colors"
                                            >
                                                {`{{${l.variableName}}}`}={l.name}
                                            </button>
                                        ))
                                ) : (
                                    <span className="text-xs text-text-muted italic">
                                        地図モードで場所に変数名を登録してください
                                    </span>
                                ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3" onScroll={onScroll}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={textBlocks.map((b) => b._key)} strategy={verticalListSortingStrategy}>
                        {textBlocks.map((block) => (
                            <SortableBlock
                                key={block._key}
                                block={block}
                                onUpdate={updateTextBlock}
                                onDelete={deleteTextBlock}
                                onDuplicate={handleDuplicateBlock}
                                onKeyDown={handleKeyDown}
                                isFocused={focusedBlockId?.id === block._key}
                                focusOption={focusedBlockId?.id === block._key ? focusedBlockId.option : undefined}
                                onFocusComplete={handleFocusComplete}
                                onFocus={handleFocus}
                                onSelectionChange={handleSelectionChange}
                                fontSize={fontSize}
                                cursorTarget={pendingCursor?.blockId === block._key ? pendingCursor.pos : null}
                                onCursorSet={handleCursorSet}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
                {textBlocks.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-text-muted text-sm mb-3">テキストブロックがありません</p>
                        <button
                            onClick={handleAddBlock}
                            className="px-4 py-2 rounded-lg bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/20 transition-colors text-sm"
                        >
                            最初のブロックを追加
                        </button>
                    </div>
                )}
                {/* 最下部カードの下に余白を確保するスペーサー */}
                <div className="h-10" aria-hidden="true" />
            </div>

            <RubyModal
                isOpen={isRubyModalOpen}
                initialBaseText={formatSelection?.text || ''}
                onClose={() => {
                    setIsRubyModalOpen(false);
                    setFormatSelection(null);
                }}
                onInsert={insertFormat}
            />
            <EmphasisModal
                isOpen={isEmphasisModalOpen}
                initialBaseText={formatSelection?.text || ''}
                onClose={() => {
                    setIsEmphasisModalOpen(false);
                    setFormatSelection(null);
                }}
                onInsert={insertFormat}
            />
        </div>
    );
}

function PenIcon({ className }) {
    return (
        <svg
            className={className}
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
        </svg>
    );
}
