import { Check, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { generatePlaceName } from '../../utils/nameGenerators';

const GENRES = [
    { key: 'fantasy', label: 'ファンタジー風' },
    { key: 'jrpg', label: 'JRPG風' },
    { key: 'japanese_wa', label: '和風' },
    { key: 'japanese_modern', label: '現代日本風' },
    { key: 'sengoku', label: '戦国時代日本風' },
    { key: 'german', label: '現代ドイツ風' },
    { key: 'french', label: '現代フランス風' },
    { key: 'american', label: '現代アメリカ風' },
    { key: 'british', label: '現代イギリス風' },
    { key: 'russian', label: '現代ロシア風' },
    { key: 'chinese_modern', label: '現代中国風' },
    { key: 'medieval_europe', label: '中世ヨーロッパ風' },
    { key: 'ancient_chinese', label: '古代中国風' },
];

export default function PlaceNameGenerator({ onClose, onUse }) {
    const [genre, setGenre] = useState('fantasy');
    const [generated, setGenerated] = useState([]);

    const generate = () => {
        const names = Array.from({ length: 10 }, () => generatePlaceName(genre));
        setGenerated(names);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass-card p-6 w-[440px] max-h-[80vh] flex flex-col animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-emerald-400">場所名自動生成</h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-4">
                    <label className="text-xs text-text-muted">ジャンル</label>
                    <select
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-sm focus:outline-none focus:border-accent-primary mt-1"
                    >
                        {GENRES.map((g) => (
                            <option key={g.key} value={g.key}>
                                {g.label}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={generate}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-4"
                >
                    <RefreshCw size={14} /> 生成する
                </button>

                <div className="flex-1 overflow-y-auto space-y-1">
                    {generated.map((name, i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors group"
                        >
                            <span className="text-sm">{name}</span>
                            <button
                                onClick={() => onUse(name)}
                                className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1"
                            >
                                <Check size={12} /> 使用
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
