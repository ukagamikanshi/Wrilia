# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動 (localhost, strictPort)
npm run build        # tsc + vite build (型チェック込み)
npm run preview      # ビルド成果物の確認

# リント / フォーマット (Biome 2.x)
npm run lint         # lint のみ (src/ 対象)
npm run format       # フォーマット自動修正 (src/ 対象)
npm run check        # lint + フォーマットチェック (CI向け)

# テスト (Vitest 4.x)
npm run test         # 単発実行 (テストファイルがない場合も 0 で終了)
npm run test:watch   # ウォッチモード
```

テストファイルは `src/**/*.{test,spec}.{js,jsx,ts,tsx}` に配置する。セットアップファイルは `src/test/setup.js`（`@testing-library/jest-dom` をインポート済み）。

## プロジェクト概要

**Wrilia** — 完全ローカル・ブラウザオンリーの日本語小説執筆アプリ。バックエンドなし、ネットワーク通信なし。

**技術スタック:** React + Vite + Tailwind CSS v4 + Dexie (IndexedDB) + Zustand + @xyflow/react + @dnd-kit

## アーキテクチャ

### 単一プロジェクトモデル

DBには常に1プロジェクトのみ存在する。`projectStore.initStore()` はすべてのテーブルをクリアするため、**新規プロジェクト作成・インポート・クローズ時に必ず全データが消去される**。

### データベース (`src/db/database.js`)

Dexie v4。スキーマ変更は必ず `db.version(N+1).stores({...}).upgrade(trans => {...})` で追加すること。現在 v4。

主要テーブル:
- `projects` — プロジェクトメタ（plotPhases含む）
- `chapters` — 階層構造（volume > chapter > episode）、`parentId` で木構造、`type` で種別
- `textBlocks` — 段落単位のテキスト。`chapterId` で紐づき、`order` で順序管理
- `characters` — キャラクターとフォルダを同テーブルで管理（`type: 'character' | 'folder'`）
- `relationships` — キャラクター間の関係データ（`patternId` で関係パターンに紐づく）
- `relationPatterns` / `mapPatterns` — グラフエディタのノード・エッジをJSONシリアライズして保存
- `locations` — 場所・地名（キャラと同じ木構造）
- `variables` — `{{varName}}` で本文中に展開される変数

### Zustand ストア (`src/stores/`)

各ストアはDB操作後に自身の `load*` メソッドを呼んでstateを更新するパターン。外部からstateを直接更新する場合は `useXxxStore.setState({...})` を使用（`App.jsx` 参照）。

- `projectStore` — プロジェクト管理、自動保存（File System Access API）、JSON import/export
- `novelStore` — チャプター・テキストブロック操作
- `characterStore` — キャラクター・関係パターン
- `mapStore` — 地図パターン・場所
- `plotStore` — プロット管理
- `settingStore` — 世界観設定

### ルーティングとページ構成 (`src/App.jsx`)

```
/ → /novel  (デフォルトリダイレクト)
Layout (Sidebar + Outlet)
  /novel      → NovelPage: ChapterTree | NovelEditor | NovelPreview (3ペイン・リサイズ可)
  /plot       → PlotManager
  /characters → RelationGraph
  /map        → MapEditor
  /settings   → SettingsManager
```

### テキストエディタ (`src/components/novel/NovelEditor.jsx`)

- テキストブロック（段落）単位で管理。ブロックはDnDでリオーダー可能
- ローカルstate → 300ms debounce → Zustand/Dexie の流れで保存（IME対策）
- `src/utils/textProcessing.js` に書式変換ユーティリティ集約

### テキスト記法

| 記法 | 意味 |
|------|------|
| `\|漢字《かんじ》` | ルビ |
| `\|文字《・》` | 傍点 |
| `{{varName}}` | 変数展開（`variables` テーブルから参照） |
| `「...」` | 会話文（行頭字下げ・空白行制御の対象） |

書き出し時に傍点は `《《文字》》` 形式に変換される（`convertEmphasisForExport`）。

### 共有グラフエディタ (`src/components/shared/graphEditor/`)

`RelationGraph`（人物相関図）と `MapEditor`（地図）が共通で使うコンポーネント群。

- `SharedNodes.jsx` — キャラクターノード、矩形ノード、テキストノード、アンカーノード
- `LabeledEdge.jsx` — ラベル付き有向エッジ
- `DrawingOverlay.jsx` — フリーハンド描画レイヤー
- `ToolPalette.jsx` — ツール切り替えパレット
- `PropertiesPanel.jsx` — 選択ノード/エッジのプロパティ編集
- `serialization.js` — ノード/エッジからコールバック関数を除去してDB保存可能な形式に変換
- `constants.js` — グラフエディタ共通の定数定義

グラフデータはJSON文字列として `nodesData` / `edgesData` カラムに保存。

### スタイリング

Tailwind CSS v4 を使用。`src/index.css` の `@theme` ブロックでセマンティックカラートークンを定義。

```css
/* 使用するクラス例 */
bg-bg-primary / bg-bg-secondary / bg-bg-card
text-text-primary / text-text-muted
accent-primary (#475569 Slate 600)
border / border-active
```

コンポーネント固有の複雑なスタイルは `src/index.css` に `.relation-*` / `.char-detail-*` クラスとして定義されている（グラフエディタ・キャラクター詳細パネル等）。

### エクスポート機能

- **JSON保存/自動保存:** File System Access API で指定ディレクトリにJSONファイルを定期書き込み
- **テキスト書き出し:** 本文テキストを整形してダウンロード（人物詳細・場所詳細を付記可）
- **画像エクスポート:** `html-to-image` + `HiddenGraphRenderer` でグラフを画像化
