import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

function ModalOverlay({ children, onClose }) {
    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center animate-fade-in p-4">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative bg-bg-primary border border-border rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
                {children}
            </div>
        </div>
    );
}

export function RubyModal({ isOpen, onClose, onInsert, initialBaseText = '' }) {
    const [baseText, setBaseText] = useState('');
    const [rubyText, setRubyText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setBaseText(initialBaseText);
            setRubyText('');
        }
    }, [isOpen, initialBaseText]);

    const handleInsert = () => {
        if (!baseText || !rubyText) return;
        const insertText = `|${baseText}《${rubyText}》`;
        onInsert(insertText);
        setBaseText('');
        setRubyText('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClose={onClose}>
            <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-sm font-medium text-text-primary">ルビを挿入する</h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors">
                    <X size={16} />
                </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">ルビを振る文字</label>
                    <input
                        type="text"
                        value={baseText}
                        onChange={(e) => setBaseText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && baseText && rubyText) handleInsert(); }}
                        placeholder="10文字以内で入力"
                        maxLength={10}
                        className="w-full px-3 py-2 bg-bg-card border border-border rounded text-sm focus:outline-none focus:border-accent-primary transition-colors"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">ルビ</label>
                    <input
                        type="text"
                        value={rubyText}
                        onChange={(e) => setRubyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && baseText && rubyText) handleInsert(); }}
                        placeholder="10文字以内で入力"
                        maxLength={10}
                        className="w-full px-3 py-2 bg-bg-card border border-border rounded text-sm focus:outline-none focus:border-accent-primary transition-colors"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">プレビュー</label>
                    <div
                        className="w-full min-h-[40px] px-3 py-2 bg-bg-secondary rounded text-base border border-transparent flex items-center"
                        style={{ fontFamily: "'Noto Serif JP', serif" }}
                    >
                        {!baseText ? (
                            <span className="text-text-muted text-sm">プレビュー</span>
                        ) : !rubyText ? (
                            <span>{baseText}</span>
                        ) : (
                            <ruby>{baseText}<rt>{rubyText}</rt></ruby>
                        )}
                    </div>
                </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded text-sm border border-border hover:bg-bg-hover transition-colors"
                >
                    キャンセル
                </button>
                <button
                    onClick={handleInsert}
                    disabled={!baseText || !rubyText}
                    className="px-4 py-2 rounded text-sm bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ルビを挿入
                </button>
            </div>
        </ModalOverlay>
    );
}

export function EmphasisModal({ isOpen, onClose, onInsert, initialBaseText = '' }) {
    const [baseText, setBaseText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setBaseText(initialBaseText);
        }
    }, [isOpen, initialBaseText]);

    const handleInsert = () => {
        if (!baseText) return;
        const insertText = baseText
            .split('')
            .map((char) => `|${char}《・》`)
            .join('');
        onInsert(insertText, initialBaseText);
        setBaseText('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClose={onClose}>
            <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-sm font-medium text-text-primary">傍点を挿入する</h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors">
                    <X size={16} />
                </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">傍点を振る文字</label>
                    <input
                        type="text"
                        value={baseText}
                        onChange={(e) => setBaseText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && baseText) handleInsert(); }}
                        className="w-full px-3 py-2 bg-bg-card border border-border rounded text-sm focus:outline-none focus:border-accent-primary transition-colors"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">プレビュー</label>
                    <div
                        className="w-full min-h-[40px] px-3 py-2 bg-bg-secondary rounded text-base border border-transparent flex items-center"
                        style={{ fontFamily: "'Noto Serif JP', serif" }}
                    >
                        {!baseText ? (
                            <span className="text-text-muted text-sm">プレビュー</span>
                        ) : (
                            <span>
                                {baseText.split('').map((char, i) => (
                                    <span key={i} className="emphasis-dot">{char}</span>
                                ))}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded text-sm border border-border hover:bg-bg-hover transition-colors"
                >
                    キャンセル
                </button>
                <button
                    onClick={handleInsert}
                    disabled={!baseText}
                    className="px-4 py-2 rounded text-sm bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    傍点を挿入
                </button>
            </div>
        </ModalOverlay>
    );
}
