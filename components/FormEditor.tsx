"use client";

import React, { useState } from "react";
import { Plus, Trash2, Copy, GripVertical } from "lucide-react";

interface FormEditorProps {
    state: Record<string, any>;
    onStateChange: (newState: Record<string, any>) => void;
    html?: string;
    onDelete?: (key: string) => void;
    onDuplicate?: (key: string) => void;
    focusKey?: string | null;
    onFocusConsumed?: () => void;
    onReorder?: (keyA: string, keyB: string) => void;
    repeatableKeys?: Set<string>;
    fieldGroups?: string[][];
}

export function FormEditor({ state, onStateChange, html = "", onDelete, onDuplicate, focusKey, onFocusConsumed, onReorder, repeatableKeys, fieldGroups }: FormEditorProps) {
    // Auto-focus logic
    React.useEffect(() => {
        if (focusKey) {
            // setTimeout to allow render to complete
            setTimeout(() => {
                const element = document.getElementById(focusKey);
                if (element) {
                    element.focus();
                    onFocusConsumed?.();
                }
            }, 50);
        }
    }, [focusKey, onFocusConsumed]);


    const [dragSource, setDragSource] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, key: string) => {
        setDragSource(key);
        e.dataTransfer.effectAllowed = "move";
        // Create a custom drag image if needed, but default is usually okay
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (dragSource) {
            e.dataTransfer.dropEffect = "move";
        }
    };

    const handleDragEnter = (e: React.DragEvent, key: string) => {
        e.preventDefault();
        if (dragSource && dragSource !== key) {
            setDropTarget(key);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        const related = e.relatedTarget as Node | null;
        if (!e.currentTarget.contains(related)) {
            setDropTarget(null);
        }
    };

    const handleDrop = (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        setDropTarget(null);
        if (dragSource && dragSource !== targetKey) {
            onReorder?.(dragSource, targetKey);
        }
        setDragSource(null);
    };

    // Sort keys based on appearance in HTML
    const sortedKeys = React.useMemo(() => {
        // Handle both standard {{ }} and URL-encoded %7B%7B %7D%7D (common in src/href attributes)
        const regex = /(?:{{|%7B%7B)\s*([a-zA-Z0-9_-]+)\s*(?:}}|%7D%7D)/g;
        const matches = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            matches.push(match[1]);
        }

        // Unique keys in order of appearance
        const orderedKeys = Array.from(new Set(matches));

        // Add any keys from state that weren't in HTML (e.g. manually added)
        const stateKeys = Object.keys(state);
        const remainingKeys = stateKeys.filter(k => !orderedKeys.includes(k));

        return [...orderedKeys.filter(k => state.hasOwnProperty(k)), ...remainingKeys];
    }, [html, state]);

    const handleChange = (key: string, value: any) => {
        onStateChange({
            ...state,
            [key]: value,
        });
    };

    const handleDelete = (keyToDelete: string) => {
        if (onDelete) {
            onDelete(keyToDelete);
        } else {
            const newState = { ...state };
            delete newState[keyToDelete];
            onStateChange(newState);
        }
    };

    const handleBlur = (key: string, value: any) => {
        if (typeof value === "string") {
            // 1. Check if the key indicates a URL field
            // Must end with Url, Link, Href, Website, or Src (case insensitive)
            // AND must NOT end with Label, Text, Title, Name, etc.
            const isUrlKey = /(url|link|href|src|website)$/i.test(key);
            const isLabelKey = /(label|text|title|name|desc|caption)$/i.test(key);

            // 2. Check if the value looks like a domain (e.g. "google.com", "bit.ly/foo")
            // Must have a dot, valid TLD (2+ chars), no spaces.
            const looksLikeDomain = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(value) && !value.includes(" ");

            // Apply only if it's a URL field OR purely looks like a domain, AND definitely not a label field
            if ((isUrlKey || looksLikeDomain) && !isLabelKey && value.length > 0) {
                // If it starts with 'http://' or 'https://' or 'mailto:' or '/', leave it
                if (!/^https?:\/\//i.test(value) && !/^mailto:/i.test(value) && !/^\//.test(value) && !/^tel:/.test(value)) {
                    handleChange(key, `https://${value}`);
                }
            }
        }
    };


    // Fallback: If no groups provided, use simple sorted keys
    const displayGroups = React.useMemo(() => {
        if (fieldGroups && fieldGroups.length > 0) return fieldGroups;
        return sortedKeys.map(k => [k]);
    }, [fieldGroups, sortedKeys]);

    return (
        <div className="h-full w-full overflow-y-auto p-6 pb-24 space-y-6 bg-white">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-zinc-900">Content Editor</h2>
            </div>

            <div className="space-y-6">
                {displayGroups.map((group, groupIdx) => {
                    const firstKey = group[0];
                    // A group is repeatable if its first key is in the repeatableKeys set (backward compatibility)
                    // OR if it's explicitly part of a multi-field group.
                    // Actually, EditorInterface now ensures repeatable items are grouped. 
                    const isRepeatable = group.length > 1 || repeatableKeys?.has(firstKey);
                    const isDropping = dropTarget === firstKey;

                    return (
                        <div
                            key={firstKey + groupIdx}
                            className={`space-y-4 p-4 rounded-xl border-2 transition-all relative pl-10 ${isRepeatable ? 'hover:border-zinc-100 hover:bg-zinc-50' : 'border-transparent'
                                } ${isDropping ? 'border-blue-500 bg-blue-50/50 ring-4 ring-blue-500/10 shadow-lg scale-[1.01]' : 'border-transparent'
                                } ${dragSource === firstKey ? 'opacity-30 border-dashed border-zinc-200 bg-zinc-50' : ''
                                }`}
                            draggable={isRepeatable}
                            onDragStart={(e) => isRepeatable && handleDragStart(e, firstKey)}
                            onDragOver={isRepeatable ? handleDragOver : undefined}
                            onDragEnter={(e) => isRepeatable && handleDragEnter(e, firstKey)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => isRepeatable && handleDrop(e, firstKey)}
                        >
                            {/* Drag Handle & Multi-actions */}
                            {isRepeatable && (
                                <div className="absolute left-2 top-0 bottom-0 w-6 flex flex-col items-center justify-center gap-2 group/handle">
                                    <div className="text-zinc-300 group-hover/handle:text-zinc-900 cursor-move p-1 transition-colors">
                                        <GripVertical className="w-4 h-4" />
                                    </div>
                                    <button
                                        onClick={() => onDuplicate?.(firstKey)}
                                        className="p-1.5 text-zinc-300 hover:text-blue-600 rounded-md transition-all sm:opacity-0 group-hover:opacity-100"
                                        title="Duplicate Group"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}

                            {/* Render all fields in the group */}
                            <div className="space-y-4">
                                {group.map((key) => {
                                    const value = state[key];
                                    if (value === undefined) return null;

                                    return (
                                        <div key={key} className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <label htmlFor={key} className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                                    {key}
                                                </label>
                                            </div>

                                            <div className="flex items-start gap-2 group/field">
                                                {typeof value === "string" && value.length > 50 ? (
                                                    <textarea
                                                        id={key}
                                                        value={value}
                                                        onChange={(e) => handleChange(key, e.target.value)}
                                                        className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-100 min-h-[80px] shadow-sm transition-all"
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        id={key}
                                                        value={value}
                                                        onChange={(e) => handleChange(key, e.target.value)}
                                                        onBlur={(e) => handleBlur(key, e.target.value)}
                                                        className="flex-1 max-w-[400px] rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-100 shadow-sm transition-all h-9"
                                                    />
                                                )}
                                                <button
                                                    onClick={() => handleDelete(key)}
                                                    className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all shrink-0 mt-0.5"
                                                    title="Delete field"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {Object.keys(state).length === 0 && (
                    <p className="text-zinc-500 text-sm italic">No variables yet. Add one below or use &#123;&#123;double-braces&#125;&#123;&#123; in code.</p>
                )}
            </div>


        </div>
    );
}
