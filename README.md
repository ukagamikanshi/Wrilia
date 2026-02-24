# Wrilia

**ブラウザだけで動く日本語小説執筆ツール**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Note for English speakers:**
> I am a Japanese speaker and a beginner in programming. This app was developed with the help of AI (Claude Code / Antigravity). I use AI for English translation, so my English might be slightly unnatural. Issues and pull requests are welcome in both English and Japanese!

> アカウント登録不要・インターネット接続不要。あなたの作品データはブラウザの外に出ません。

---

## このアプリについて

このアプリは **Claude Code（AI）を使用して作成しました**。

私はコードの専門家ではないため、ライセンスの確認にはAIと自動ツールを使用しています。

もし意図せずライセンスに違反している箇所や、不適切な依存関係を見つけた場合は、**Issue で優しく教えていただけると大変助かります**。速やかに修正または公開停止の対応をとります。

---

## 特徴

- **完全ローカル** — サーバーへのデータ送信は一切なし。IndexedDB にのみ保存
- **オフライン対応** — インターネット接続なしで動作
- **アカウント不要** — インストール・登録なしですぐ使える
- **JSON エクスポート** — 全データをファイルに書き出してバックアップ・移行が可能
- **自動保存** — 指定フォルダへの定期自動保存（Chrome / Edge のみ）

## 機能

| 機能 | 説明 |
|---|---|
| **執筆モード** | 章・話・段落のツリー管理、リアルタイムプレビュー、Undo/Redo |
| **プロット管理** | プロット構成の整理・管理 |
| **人物相関図** | キャラクター・関係性のグラフ表示・編集 |
| **地図エディタ** | 舞台となる場所・地名の管理とグラフ表示 |
| **世界観設定** | 作品設定のドキュメント管理 |
| **変数展開** | `{{varName}}` で本文中に設定値を埋め込み |
| **ルビ・傍点** | `\|漢字《かんじ》` / `\|文字《・》` 記法に対応 |
| **テキスト書き出し** | 小説本文を整形してダウンロード |

## デモ

**[https://wrilia.vercel.app/](https://wrilia.vercel.app/)**

## 利用上の注意

- **ブラウザの「閲覧データを削除」を行うとデータが消えます** — 定期的に JSON 保存してください
- 1つのブラウザにつき **1作品** のみ管理できます
- 複数タブで同時に開かないでください

詳しくは [ABOUT.md](ABOUT.md) をご覧ください。

## 開発者向け: ローカルで動かす

```bash
git clone https://github.com/ukagamikanshi/Wrilia.git
cd Wrilia
npm install
npm run dev
```

## 技術スタック

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Dexie](https://dexie.org/) (IndexedDB)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [@xyflow/react](https://reactflow.dev/) (グラフエディタ)
- [@dnd-kit](https://dndkit.com/) (ドラッグ&ドロップ)

## ライセンス

[MIT](LICENSE) © 2026 ukagamikanshi

利用している外部ライブラリのライセンスについては [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) を参照してください。
