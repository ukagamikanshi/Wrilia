// RelationGraph と MapEditor で共通のツールパレット
// symbolTools prop で各エディタ固有のシンボルツールを受け取る
import { ArrowUpRight, MousePointer2, Slash, Square, Type, User } from 'lucide-react';
import { DRAW_COLORS, RECT_BG_COLORS } from './constants';

const BASE_TOOLS = [
    { mode: 'select', icon: MousePointer2, label: '選択' },
    { mode: 'entity', icon: User, label: '追加' }, // label は各エディタで上書き
    { mode: 'rect', icon: Square, label: '矩形' },
    { mode: 'text', icon: Type, label: 'テキスト' },
    { mode: 'arrow', icon: ArrowUpRight, label: '矢印線' },
    { mode: 'line', icon: Slash, label: '直線' },
];

/**
 * @param {object} props
 * @param {string}   props.drawMode
 * @param {Function} props.setDrawMode
 * @param {string}   props.drawColor
 * @param {Function} props.setDrawColor
 * @param {string}   props.rectBgColor
 * @param {Function} props.setRectBgColor
 * @param {string}   props.entityToolLabel   - エンティティ追加ボタンのラベル (例: '人物追加' / '場所追加')
 * @param {string}   props.entityMode        - エンティティ追加のモード名 (例: 'character' / 'location')
 * @param {Array}    props.symbolTools       - 固有シンボルツール一覧: { mode, label, icon? }[]
 */
export function ToolPalette({
    drawMode,
    setDrawMode,
    drawColor,
    setDrawColor,
    rectBgColor,
    setRectBgColor,
    entityToolLabel,
    entityMode,
    symbolTools = [],
}) {
    const tools = BASE_TOOLS.map((t) => (t.mode === 'entity' ? { ...t, mode: entityMode, label: entityToolLabel } : t));

    return (
        <div className="relation-tool-palette-horizontal">
            <div className="relation-tool-hgroup">
                {tools.map(({ mode, icon: Icon, label }) => (
                    <button
                        key={mode}
                        className={`relation-tool-btn-h ${drawMode === mode ? 'active' : ''}`}
                        onClick={() => setDrawMode(mode)}
                        title={label}
                    >
                        <Icon size={16} />
                        <span>{label}</span>
                    </button>
                ))}
            </div>
            <div className="relation-tool-vsep" />
            <div className="relation-tool-hgroup">
                {DRAW_COLORS.map((c) => (
                    <button
                        key={c.value}
                        className={`relation-color-swatch-sm ${drawColor === c.value ? 'active' : ''}`}
                        style={{ backgroundColor: c.value, border: c.value === '#ffffff' ? '1px solid #ccc' : 'none' }}
                        onClick={() => setDrawColor(c.value)}
                        title={c.name}
                    />
                ))}
            </div>
            <div className="relation-tool-vsep" />
            <div className="relation-tool-hgroup">
                {RECT_BG_COLORS.slice(0, 6).map((c) => (
                    <button
                        key={c.value}
                        className={`relation-color-swatch-sm ${rectBgColor === c.value ? 'active' : ''}`}
                        style={{ backgroundColor: c.value, border: '1px solid #ccc' }}
                        onClick={() => setRectBgColor(c.value)}
                        title={c.name}
                    />
                ))}
            </div>
            {symbolTools.length > 0 && (
                <>
                    <div className="relation-tool-vsep" />
                    <div className="relation-tool-hgroup">
                        {symbolTools.map(({ mode, label, icon: Icon }) => (
                            <button
                                key={mode}
                                className={`relation-tool-btn-h ${drawMode === mode ? 'active' : ''}`}
                                onClick={() => setDrawMode(mode)}
                                title={label}
                            >
                                {Icon && <Icon size={16} />}
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
