/**
 * テキスト処理ユーティリティ
 * ルビ記法: |漢字《かんじ》
 * 傍点記法: |文《・》（1文字ずつ）
 */

// HTML特殊文字をエスケープする（XSS対策）
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ルビ記法をHTMLに変換（プレビュー用）
export function convertRubyToHtml(text) {
    // |漢字《ふりがな》 → <ruby>漢字<rt>ふりがな</rt></ruby>
    // 傍点: |文《・》 → <span class="emphasis-dot">文</span>
    return text.replace(/\|(.+?)《(.+?)》/g, (match, base, reading) => {
        if (reading === '・') {
            // 傍点: emphasis dot above character
            return `<span class="emphasis-dot">${base}</span>`;
        }
        return `<ruby>${base}<rt>${reading}</rt></ruby>`;
    });
}

// 変数を実際の値に展開
// サフィックス構文: {{varName:last}} → 姓, {{varName:first}} → 名, {{varName:middle}} → ミドルネーム
// サフィックスなし: {{varName}} → フルネーム (name フィールド)
export function resolveVariables(text, variables) {
    return text.replace(/\{\{(.+?)\}\}/g, (match, varName) => {
        const trimmed = varName.trim();
        const colonIdx = trimmed.lastIndexOf(':');
        let baseName = trimmed;
        let suffix = null;
        if (colonIdx !== -1) {
            baseName = trimmed.substring(0, colonIdx);
            suffix = trimmed.substring(colonIdx + 1);
        }
        const variable = variables.find((v) => v.variableName === baseName);
        if (variable) {
            if (suffix === 'last') return variable.nameLast || variable.name || match;
            if (suffix === 'first') return variable.nameFirst || variable.name || match;
            if (suffix === 'middle') return variable.nameMiddle || variable.name || match;
            return variable.name || variable.value || match;
        }
        return match;
    });
}

// テキストを完全にHTMLに変換（ルビ + 変数展開）
export function renderPreview(text, variables = []) {
    // (1) 変数展開（プレーンテキストのまま処理）
    let result = resolveVariables(text, variables);
    // (2) HTMLエスケープ（<>などの特殊文字を無害化）
    result = escapeHtml(result);
    // (3) ルビ・傍点記法をHTMLに変換（テキストはエスケープ済みで安全）
    result = convertRubyToHtml(result);
    // (4) 改行をbrタグに変換
    result = result.replace(/\n/g, '<br/>');
    return result;
}

// 会話文の前後に空白行を挿入
export function insertBlankLinesAroundDialogue(text) {
    const lines = text.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isDialogue = /^「.*」$/.test(line.trim()) || /^『.*』$/.test(line.trim());
        if (isDialogue) {
            // 前に空行がなければ追加
            if (result.length > 0 && result[result.length - 1].trim() !== '') {
                result.push('');
            }
            result.push(line);
            // 次の行が空行でなく、かつ次がある場合
            if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
                result.push('');
            }
        } else {
            result.push(line);
        }
    }
    return result.join('\n');
}

// 会話文の前後の空白行を削除
export function removeBlankLinesAroundDialogue(text) {
    const lines = text.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1];
        const prevLine = result[result.length - 1];
        // 空行かつ、次が会話文 → スキップ
        if (line.trim() === '' && nextLine) {
            const nextIsDialogue = /^「.*」$/.test(nextLine.trim()) || /^『.*』$/.test(nextLine.trim());
            if (nextIsDialogue) continue;
        }
        // 空行かつ、前が会話文 → スキップ
        if (line.trim() === '' && prevLine) {
            const prevIsDialogue = /^「.*」$/.test(prevLine.trim()) || /^『.*』$/.test(prevLine.trim());
            if (prevIsDialogue) continue;
        }
        result.push(line);
    }
    return result.join('\n');
}

// 単語一括変換
export function replaceAllWords(text, searchWord, replaceWord) {
    if (!searchWord) return text;
    const escaped = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'g'), replaceWord);
}

// 行頭字下げ
export function applyIndentation(text, mode = 'auto') {
    const lines = text.split('\n');
    return lines
        .map((line) => {
            if (line.trim() === '') return line;
            const isDialogue = /^[「『（]/.test(line.trim());
            if (mode === 'auto') {
                // 会話文以外に字下げ
                if (!isDialogue && !line.startsWith('　')) {
                    return '　' + line;
                }
            } else if (mode === 'all') {
                if (!line.startsWith('　')) {
                    return '　' + line;
                }
            }
            return line;
        })
        .join('\n');
}

// 字下げを除去
export function removeIndentation(text) {
    const lines = text.split('\n');
    return lines
        .map((line) => {
            if (line.startsWith('　')) {
                return line.substring(1);
            }
            return line;
        })
        .join('\n');
}

// 連続する傍点を《《》》の形式に変換（書き出し用）
export function convertEmphasisForExport(text) {
    if (!text) return text;
    // 「|文字《・》」が1つ以上連続している部分を抽出
    return text.replace(/(?:\|[^|《]+《・》)+/g, (match) => {
        // マッチした文字列から `|` と `《・》` を取り除き、文字だけを結合
        const cleaned = match.replace(/\|/g, '').replace(/《・》/g, '');
        return `《《${cleaned}》》`;
    });
}
