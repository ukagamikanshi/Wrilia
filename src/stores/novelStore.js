import { create } from 'zustand';
import db from '../db/database';

// DB から読み込んだブロックに安定したクライアントキーを付与するヘルパー
// _key は React の key / dnd-kit ID として使用し、DB の id とは独立している
const withKey = (block) => ({ ...block, _key: String(block.id) });

// ユニークなクライアント生成キーを作成
let _keyCounter = 0;
const genKey = () => `k${Date.now()}_${++_keyCounter}`;

// ─── undo/redo 用ヘルパー ─────────────────────────────────────────────────────
// Zustand state ではなくモジュールスコープで管理してre-renderを回避する
let _historyLastBlockKey = null;
let _historyLastPushTime = 0;

// textBlocks のスナップショット（DB保存に必要な最小フィールドのみ）を作成する
const takeSnapshot = (textBlocks) =>
    textBlocks.map(({ id, _key, content, order, chapterId, projectId }) => ({
        id,
        _key,
        content,
        order,
        chapterId,
        projectId,
    }));

// スナップショットを DB に適用する（既存ブロックを削除して再挿入）
const applySnapshotToDB = async (chapterId, snapshot) => {
    await db.transaction('rw', db.textBlocks, async () => {
        await db.textBlocks.where('chapterId').equals(chapterId).delete();
        for (const block of snapshot) {
            await db.textBlocks.add({
                chapterId: block.chapterId,
                projectId: block.projectId,
                content: block.content,
                order: block.order,
            });
        }
    });
};
// ─────────────────────────────────────────────────────────────────────────────

const useNovelStore = create((set, get) => ({
    chapters: [],
    textBlocks: [],
    selectedChapterId: null,
    fontSize: 14,
    undoStack: [], // textBlocks スナップショットの配列（最大20件）
    redoStack: [],

    setFontSize: (size) => set({ fontSize: size }),

    // 現在の textBlocks 状態をアンドゥスタックに積む（上限20件・リドゥはクリア）
    pushToHistory: () => {
        const { textBlocks, undoStack } = get();
        _historyLastBlockKey = null;
        _historyLastPushTime = Date.now();
        set({
            undoStack: [...undoStack, takeSnapshot(textBlocks)].slice(-20),
            redoStack: [],
        });
    },

    undo: async () => {
        const { undoStack, redoStack, textBlocks, selectedChapterId } = get();
        if (undoStack.length === 0 || !selectedChapterId) return;
        const previous = undoStack[undoStack.length - 1];
        const current = takeSnapshot(textBlocks);
        _historyLastBlockKey = null;
        _historyLastPushTime = 0;
        set({
            undoStack: undoStack.slice(0, -1),
            redoStack: [...redoStack, current].slice(-20),
        });
        await applySnapshotToDB(selectedChapterId, previous);
        await get().loadTextBlocks(selectedChapterId);
    },

    redo: async () => {
        const { undoStack, redoStack, textBlocks, selectedChapterId } = get();
        if (redoStack.length === 0 || !selectedChapterId) return;
        const next = redoStack[redoStack.length - 1];
        const current = takeSnapshot(textBlocks);
        _historyLastBlockKey = null;
        _historyLastPushTime = 0;
        set({
            undoStack: [...undoStack, current].slice(-20),
            redoStack: redoStack.slice(0, -1),
        });
        await applySnapshotToDB(selectedChapterId, next);
        await get().loadTextBlocks(selectedChapterId);
    },

    loadChapters: async (projectId) => {
        let chapters = await db.chapters.where('projectId').equals(projectId).sortBy('order');

        let fixed = false;
        for (const chapter of chapters) {
            let current = chapter;
            const path = new Set();
            let isCycle = false;

            while (current && current.parentId) {
                path.add(current.id);
                current = chapters.find((c) => c.id === current.parentId);

                if (current && path.has(current.id)) {
                    isCycle = true;
                    break;
                }
            }

            if (isCycle) {
                console.warn(`Fixing cyclic chapter: ${chapter.id}`);
                await db.chapters.update(chapter.id, { parentId: null });
                fixed = true;
            }
        }

        // Reload if repaired
        if (fixed) {
            chapters = await db.chapters.where('projectId').equals(projectId).sortBy('order');
        }

        set({ chapters });
    },

    addChapter: async (projectId, title, type = 'chapter', parentId = null) => {
        const { chapters } = get();
        const siblings = chapters.filter((c) => c.parentId === parentId && c.type === type);
        const order = siblings.length;
        await db.chapters.add({
            projectId,
            parentId,
            title,
            type,
            order,
            createdAt: Date.now(),
        });
        await get().loadChapters(projectId);
    },

    updateChapter: async (id, updates) => {
        await db.chapters.update(id, updates);
        const chapter = await db.chapters.get(id);
        if (chapter) await get().loadChapters(chapter.projectId);
    },

    duplicateChapter: async (id) => {
        const chapter = await db.chapters.get(id);
        if (!chapter) return;

        // IndexedDB は null をキーとして受け付けないため、parentId が null の場合は
        // projectId で絞り込んだ上で JS 側でフィルタする
        const getSiblings = async (projectId, parentId) => {
            if (parentId === null || parentId === undefined) {
                const all = await db.chapters.where('projectId').equals(projectId).toArray();
                return all.filter((c) => c.parentId === null || c.parentId === undefined);
            }
            return db.chapters.where('parentId').equals(parentId).toArray();
        };

        // 再帰的に複製する
        // isRoot=true のときのみタイトルに「(コピー)」を付加し、元アイテムの直後に挿入する
        const duplicateRecursive = async (srcId, destParentId, isRoot) => {
            const src = await db.chapters.get(srcId);
            if (!src) return;

            let newOrder;
            if (isRoot) {
                // 同じ親の兄弟を取得して、元アイテムより後ろのものを1つずらして直後に挿入する
                const siblings = await getSiblings(src.projectId, destParentId);
                const toShift = siblings.filter((s) => s.order > src.order);
                for (const s of toShift) {
                    await db.chapters.update(s.id, { order: s.order + 1 });
                }
                newOrder = src.order + 1;
            } else {
                // 子要素は末尾に追加
                const existingChildren = await getSiblings(src.projectId, destParentId);
                newOrder = existingChildren.length;
            }

            const newTitle = isRoot ? src.title + ' (コピー)' : src.title;
            const newId = await db.chapters.add({
                projectId: src.projectId,
                parentId: destParentId,
                title: newTitle,
                type: src.type,
                order: newOrder,
                createdAt: Date.now(),
            });

            // 話の場合はテキストブロックも複製する
            if (src.type === 'episode') {
                const blocks = await db.textBlocks.where('chapterId').equals(srcId).sortBy('order');
                for (const block of blocks) {
                    await db.textBlocks.add({
                        chapterId: newId,
                        projectId: src.projectId,
                        content: block.content,
                        order: block.order,
                    });
                }
            }

            // 子チャプターを再帰的に複製する
            const childChapters = await db.chapters.where('parentId').equals(srcId).sortBy('order');
            for (const child of childChapters) {
                await duplicateRecursive(child.id, newId, false);
            }
        };

        await duplicateRecursive(id, chapter.parentId, true);
        await get().loadChapters(chapter.projectId);
    },

    deleteChapter: async (id) => {
        const chapter = await db.chapters.get(id);
        if (!chapter) return;
        const deleteRecursive = async (chapterId) => {
            const children = await db.chapters.where('parentId').equals(chapterId).toArray();
            for (const child of children) {
                await deleteRecursive(child.id);
            }
            await db.textBlocks.where('chapterId').equals(chapterId).delete();
            await db.chapters.delete(chapterId);
        };
        await deleteRecursive(id);
        await get().loadChapters(chapter.projectId);
    },

    reorderChapters: async (projectId, reorderedIds, parentId = null) => {
        await db.transaction('rw', db.chapters, async () => {
            for (let i = 0; i < reorderedIds.length; i++) {
                await db.chapters.update(reorderedIds[i], { order: i, parentId });
            }
        });
        await get().loadChapters(projectId);
    },

    // チャプター切り替え時はアンドゥ履歴をクリアする
    selectChapter: async (chapterId) => {
        _historyLastBlockKey = null;
        _historyLastPushTime = 0;
        set({ selectedChapterId: chapterId, undoStack: [], redoStack: [] });
        if (chapterId) {
            const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            set({ textBlocks: blocks.map(withKey) });
        } else {
            set({ textBlocks: [] });
        }
    },

    loadTextBlocks: async (chapterId) => {
        const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
        set({ textBlocks: blocks.map(withKey) });
    },

    // 同期関数: _key を即座に返し DB 操作はバックグラウンドで行う
    // afterKey: 挿入位置を _key で指定（連続 Enter 押下でも正確な位置を保つため）
    addTextBlock: (chapterId, projectId, content = '', afterOrder = null, afterKey = null) => {
        get().pushToHistory();

        const currentBlocks = get().textBlocks;
        const order = afterOrder !== null ? afterOrder + 1 : currentBlocks.length;
        const _key = genKey();

        // 即座に楽観的更新（DB を一切待たない）
        // splice で挿入し既存ブロックのオブジェクト参照を変えない → React.memo 効果を維持
        set((state) => {
            let insertIndex;
            if (afterKey !== null) {
                // _key 基準で挿入位置を決める（order が一時的に重複していても正確）
                const idx = state.textBlocks.findIndex((b) => b._key === afterKey);
                insertIndex = idx === -1 ? state.textBlocks.length : idx + 1;
            } else if (afterOrder !== null) {
                const idx = state.textBlocks.findIndex((b) => b.order > afterOrder);
                insertIndex = idx === -1 ? state.textBlocks.length : idx;
            } else {
                insertIndex = state.textBlocks.length;
            }
            const next = [...state.textBlocks];
            next.splice(insertIndex, 0, { id: null, _key, chapterId, projectId, content, order });
            return { textBlocks: next };
        });

        // バックグラウンド: DB に永続化
        (async () => {
            // 既存ブロックの order を DB に反映
            if (afterOrder !== null) {
                const toUpdate = currentBlocks.filter((b) => b.order >= order && b.id != null);
                if (toUpdate.length > 0) {
                    await db.transaction('rw', db.textBlocks, async () => {
                        for (const b of toUpdate) {
                            await db.textBlocks.update(b.id, { order: b.order + 1 });
                        }
                    });
                }
            }
            // 新ブロックを DB に追加
            const id = await db.textBlocks.add({ chapterId, projectId, content, order });
            // _key を保ちつつ DB の id を付与（コンポーネントは_key で安定しているのでアンマウントされない）
            set((state) => ({
                textBlocks: state.textBlocks.map((b) => (b._key === _key ? { ...b, id } : b)),
            }));
            // DB 追加中にユーザーが入力した内容をフラッシュ
            const latest = get().textBlocks.find((b) => b._key === _key);
            if (latest && latest.content !== content) {
                await db.textBlocks.update(id, { content: latest.content });
            }
        })().catch((err) => console.error('addTextBlock: 永続化失敗', err));

        return _key;
    },

    // key は _key（安定したクライアントキー）を受け取る
    // テキスト編集はデバウンス後に呼ばれる。同じブロックへの連続編集は3秒間コアレスして
    // アンドゥスタックを1エントリにまとめる（無限にスタックが増えないようにするため）
    updateTextBlock: async (_key, content) => {
        const now = Date.now();
        const { textBlocks, undoStack } = get();
        const block = textBlocks.find((b) => b._key === _key);

        if (block && block.content !== content) {
            const shouldPush = _historyLastBlockKey !== _key || now - _historyLastPushTime > 3000;
            if (shouldPush) {
                set({
                    undoStack: [...undoStack, takeSnapshot(textBlocks)].slice(-20),
                    redoStack: [],
                });
            } else {
                // 同じブロックへの連続編集でもリドゥスタックはクリアする
                const { redoStack } = get();
                if (redoStack.length > 0) set({ redoStack: [] });
            }
            _historyLastBlockKey = _key;
            _historyLastPushTime = now;
        }

        // 楽観的更新: DB 書き込みを待たず即座に state を更新
        set((state) => ({
            textBlocks: state.textBlocks.map((b) => (b._key === _key ? { ...b, content } : b)),
        }));
        // バックグラウンドで DB に書き込み（id が確定している場合のみ）
        const updated = get().textBlocks.find((b) => b._key === _key);
        if (updated?.id != null) {
            await db.textBlocks.update(updated.id, { content });
        }
    },

    // _key で指定されたブロックをその直後に複製する
    duplicateTextBlock: (_key) => {
        get().pushToHistory();

        const currentBlocks = get().textBlocks;
        const srcBlock = currentBlocks.find((b) => b._key === _key);
        if (!srcBlock) return;

        const newKey = genKey();
        const newOrder = srcBlock.order + 1;

        // 楽観的更新: 元ブロックの直後に挿入
        set((state) => {
            const idx = state.textBlocks.findIndex((b) => b._key === _key);
            const next = [...state.textBlocks];
            next.splice(idx + 1, 0, {
                id: null,
                _key: newKey,
                chapterId: srcBlock.chapterId,
                projectId: srcBlock.projectId,
                content: srcBlock.content,
                order: newOrder,
            });
            return { textBlocks: next };
        });

        // バックグラウンドで DB に永続化し、完了後に state を DB から再同期する
        // 連続複製時に state の order 値が陳腐化すると次の pushToHistory が
        // 重複 order を含むスナップショットを記録してしまい、undo/redo 後に
        // ブロックの順序が崩れるバグを防ぐため、DB 操作後は loadTextBlocks で再取得する
        (async () => {
            // 元ブロック以降の order を +1 ずらす
            const toUpdate = currentBlocks.filter((b) => b.order >= newOrder && b.id != null);
            if (toUpdate.length > 0) {
                await db.transaction('rw', db.textBlocks, async () => {
                    for (const b of toUpdate) {
                        await db.textBlocks.update(b.id, { order: b.order + 1 });
                    }
                });
            }
            await db.textBlocks.add({
                chapterId: srcBlock.chapterId,
                projectId: srcBlock.projectId,
                content: srcBlock.content,
                order: newOrder,
            });
            // DB から再取得して state の order 値を正確な値に更新する
            await get().loadTextBlocks(srcBlock.chapterId);
        })().catch((err) => console.error('duplicateTextBlock: 永続化失敗', err));
    },

    // key は _key（安定したクライアントキー）を受け取る
    deleteTextBlock: (_key) => {
        get().pushToHistory();
        const block = get().textBlocks.find((b) => b._key === _key);
        set((state) => ({ textBlocks: state.textBlocks.filter((b) => b._key !== _key) }));
        if (block?.id != null) {
            db.textBlocks.delete(block.id).catch((err) => console.error('deleteTextBlock: DB削除失敗', err));
        }
    },

    // upperKey のカードと lowerKey のカードを '\n' で結合し lowerKey を削除する。
    // pushToHistory を1回だけ呼んで Undo/Redo を1操作にまとめる。
    mergeBlocks: (upperKey, lowerKey) => {
        get().pushToHistory();
        const blocks = get().textBlocks;
        const upperBlock = blocks.find((b) => b._key === upperKey);
        const lowerBlock = blocks.find((b) => b._key === lowerKey);
        if (!upperBlock || !lowerBlock) return;

        const mergedContent = upperBlock.content + '\n' + lowerBlock.content;

        set((state) => ({
            textBlocks: state.textBlocks
                .filter((b) => b._key !== lowerKey)
                .map((b) => (b._key === upperKey ? { ...b, content: mergedContent } : b)),
        }));

        if (upperBlock.id != null) {
            db.textBlocks
                .update(upperBlock.id, { content: mergedContent })
                .catch((err) => console.error('mergeBlocks: upper更新失敗', err));
        }
        if (lowerBlock.id != null) {
            db.textBlocks
                .delete(lowerBlock.id)
                .catch((err) => console.error('mergeBlocks: lower削除失敗', err));
        }
    },

    insertBlankLinesBetweenAllBlocks: async (chapterId, projectId) => {
        get().pushToHistory();
        await db.transaction('rw', db.textBlocks, async () => {
            const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            let orderCtr = 0;
            for (let i = 0; i < blocks.length; i++) {
                await db.textBlocks.update(blocks[i].id, { order: orderCtr++ });
                if (i < blocks.length - 1) {
                    const cur = blocks[i];
                    const next = blocks[i + 1];
                    if (cur.content.trim() !== '' && next.content.trim() !== '') {
                        await db.textBlocks.add({ chapterId, projectId, content: '', order: orderCtr++ });
                    }
                }
            }
        });
        await get().loadTextBlocks(chapterId);
    },

    deleteAllEmptyTextBlocks: async (chapterId) => {
        get().pushToHistory();
        await db.transaction('rw', db.textBlocks, async () => {
            const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            const emptyIds = blocks.filter((b) => b.content.trim() === '').map((b) => b.id);
            if (emptyIds.length === 0) return;
            await db.textBlocks.bulkDelete(emptyIds);
            const remaining = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            for (let i = 0; i < remaining.length; i++) {
                await db.textBlocks.update(remaining[i].id, { order: i });
            }
        });
        await get().loadTextBlocks(chapterId);
    },

    // 会話文（「...」）のブロックをすべて削除する
    deleteAllDialogueBlocks: async (chapterId) => {
        get().pushToHistory();
        const isDialogue = (content) => content.trim().startsWith('「') && content.trim().endsWith('」');
        await db.transaction('rw', db.textBlocks, async () => {
            const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            const idsToDelete = blocks.filter((b) => isDialogue(b.content)).map((b) => b.id);
            if (idsToDelete.length === 0) return;
            await db.textBlocks.bulkDelete(idsToDelete);
            const remaining = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            for (let i = 0; i < remaining.length; i++) {
                await db.textBlocks.update(remaining[i].id, { order: i });
            }
        });
        await get().loadTextBlocks(chapterId);
    },

    // 地の文（会話文以外）のブロックをすべて削除する
    deleteAllNarrativeBlocks: async (chapterId) => {
        get().pushToHistory();
        const isDialogue = (content) => content.trim().startsWith('「') && content.trim().endsWith('」');
        await db.transaction('rw', db.textBlocks, async () => {
            const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            const idsToDelete = blocks.filter((b) => !isDialogue(b.content)).map((b) => b.id);
            if (idsToDelete.length === 0) return;
            await db.textBlocks.bulkDelete(idsToDelete);
            const remaining = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');
            for (let i = 0; i < remaining.length; i++) {
                await db.textBlocks.update(remaining[i].id, { order: i });
            }
        });
        await get().loadTextBlocks(chapterId);
    },

    reorderTextBlocks: async (chapterId, reorderedIds) => {
        get().pushToHistory();
        await db.transaction('rw', db.textBlocks, async () => {
            for (let i = 0; i < reorderedIds.length; i++) {
                await db.textBlocks.update(reorderedIds[i], { order: i });
            }
        });
        await get().loadTextBlocks(chapterId);
    },

    formatDialogueSpacing: async (chapterId, projectId, mode) => {
        get().pushToHistory();
        await db.transaction('rw', db.textBlocks, async () => {
            const blocks = await db.textBlocks.where('chapterId').equals(chapterId).sortBy('order');

            const isD = (b) => b && b.content.trim().startsWith('「') && b.content.trim().endsWith('」');
            const isE = (b) => b && b.content.trim() === '';
            const isN = (b) => b && !isD(b) && !isE(b);

            if (mode === 'add') {
                let orderCtr = 0;
                for (let i = 0; i < blocks.length; i++) {
                    const current = blocks[i];
                    await db.textBlocks.update(current.id, { order: orderCtr++ });

                    if (i < blocks.length - 1) {
                        const next = blocks[i + 1];
                        if ((isD(current) && isN(next)) || (isN(current) && isD(next))) {
                            await db.textBlocks.add({ chapterId, projectId, content: '', order: orderCtr++ });
                        }
                    }
                }
            } else if (mode === 'remove') {
                const newBlocks = [];
                for (let i = 0; i < blocks.length; i++) {
                    if (isE(blocks[i])) {
                        let leftIdx = i - 1;
                        while (leftIdx >= 0 && isE(blocks[leftIdx])) leftIdx--;
                        let rightIdx = i + 1;
                        while (rightIdx < blocks.length && isE(blocks[rightIdx])) rightIdx++;

                        const left = leftIdx >= 0 ? blocks[leftIdx] : null;
                        const right = rightIdx < blocks.length ? blocks[rightIdx] : null;

                        if ((isD(left) && isN(right)) || (isN(left) && isD(right))) {
                            await db.textBlocks.delete(blocks[i].id);
                            continue;
                        }
                    }
                    newBlocks.push(blocks[i]);
                }

                for (let i = 0; i < newBlocks.length; i++) {
                    await db.textBlocks.update(newBlocks[i].id, { order: i });
                }
            }
        });
        await get().loadTextBlocks(chapterId);
    },
}));

export default useNovelStore;
