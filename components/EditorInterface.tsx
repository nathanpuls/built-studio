"use client";

import React, { useState, useEffect } from "react";
import { Code, LayoutTemplate, Save, Check, ExternalLink, Loader2, Home, Settings, Trash2, Undo2, Redo2, Type } from "lucide-react";
import { CodeEditor } from "@/components/CodeEditor";
import { Preview } from "@/components/Preview";
import { FormEditor } from "@/components/FormEditor";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

interface EditorInterfaceProps {
    projectId: string;
    initialHtml: string;
    initialState: Record<string, any>;
}

export function EditorInterface({ projectId, initialHtml, initialState }: EditorInterfaceProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const [refreshKey, setRefreshKey] = useState(0);

    // Initialize tab from URL or default to 'content'
    const initialTab = (searchParams.get("tab") as "code" | "content") || "content";
    const [activeTab, setActiveTabState] = useState<"code" | "content">(initialTab);

    const [html, setHtmlState] = useState(initialHtml);
    const [state, setState] = useState(initialState);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Undo/Redo History
    const [history, setHistory] = useState<string[]>([initialHtml]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const setHtml = (newHtml: string | ((prev: string) => string), skipHistory = false) => {
        setHtmlState(prev => {
            const next = typeof newHtml === 'function' ? newHtml(prev) : newHtml;
            if (!skipHistory && next !== prev) {
                const newHistory = history.slice(0, historyIndex + 1);
                newHistory.push(next);
                if (newHistory.length > 100) newHistory.shift();
                setHistory(newHistory);
                setHistoryIndex(newHistory.length - 1);
            }
            return next;
        });
    };

    const undo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setHtmlState(history[newIndex]);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setHtmlState(history[newIndex]);
        }
    };

    const GOOGLE_FONTS = [
        "Inter", "Roboto", "Open Sans", "Montserrat", "Lato",
        "Poppins", "Playfair Display", "Lora", "Nunito", "Oswald"
    ];

    const setActiveTab = (tab: "code" | "content") => {
        setActiveTabState(tab);
        const params = new URLSearchParams(searchParams);
        params.set("tab", tab);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleSave = async () => {
        if (!projectId) return;
        setIsSaving(true);
        try {
            await setDoc(doc(db, "projects", projectId), {
                html,
                state,
                updatedAt: new Date(),
            }, { merge: true });

            setLastSaved(new Date());

            // Artificial delay for UX
            setTimeout(() => setIsSaving(false), 800);
        } catch (error) {
            console.error("Error saving:", error);
            setIsSaving(false);
            alert("Failed to save changes.");
        }
    };

    // Keyboard shortcut for save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [html, state]);

    // Automatic parsing of new variables from HTML with Debounce and Rename tracking
    useEffect(() => {
        const timer = setTimeout(() => {
            // Updated regex to handle both standard and URL-encoded braces, now with hyphens
            const regex = /(?:{{|%7B%7B)\s*([a-zA-Z0-9_-]+)\s*(?:}}|%7D%7D)/g;
            let match;
            const foundKeys: Set<string> = new Set();

            while ((match = regex.exec(html)) !== null) {
                foundKeys.add(match[1]);
            }

            setState(prevState => {
                const newState = { ...prevState };
                let hasChanges = false;

                const currentKeys = Object.keys(newState);
                const addedKeys = Array.from(foundKeys).filter(k => !currentKeys.includes(k));
                const removedKeys = currentKeys.filter(k => !foundKeys.has(k));

                // 1. Rename Detection / Migration
                // If we exactly one key was removed and one was added, it's a rename.
                // Or if we have multiple, try to find the "best" match (e.g. link3 -> link300)
                if (addedKeys.length > 0 && removedKeys.length > 0) {
                    addedKeys.forEach(newKey => {
                        // Find a removed key that looks like a relative (simplified heuristic)
                        // If the old key had custom content (not default [key]) and the new key is just initialized
                        const sourceKey = removedKeys.find(oldKey => {
                            const isCustom = newState[oldKey] !== `[${oldKey}]`;
                            // Basic heuristic: either substring or just "the only one removed"
                            return isCustom && (newKey.includes(oldKey) || oldKey.includes(newKey) || removedKeys.length === 1);
                        });

                        if (sourceKey) {
                            newState[newKey] = newState[sourceKey];
                            delete newState[sourceKey];
                            removedKeys.splice(removedKeys.indexOf(sourceKey), 1);
                            hasChanges = true;
                        }
                    });
                }

                // 2. Add remaining new keys that weren't migrated
                foundKeys.forEach(key => {
                    if (!newState.hasOwnProperty(key)) {
                        newState[key] = `[${key}]`; // Default value
                        hasChanges = true;
                    }
                });

                // 3. Remove stale keys 
                // Only remove if the key is NOT in foundKeys AND the value is still the default.
                // This prevents deleting content the user actually wrote even if rename detection fails.
                Object.keys(newState).forEach(key => {
                    if (!foundKeys.has(key)) {
                        const isDefaultValue = newState[key] === `[${key}]`;
                        if (isDefaultValue) {
                            delete newState[key];
                            hasChanges = true;
                        }
                    }
                });

                return hasChanges ? newState : prevState;
            });
        }, 800);

        return () => clearTimeout(timer);
    }, [html]);

    const [showThemeSettings, setShowThemeSettings] = useState(false);
    const [detectedColors, setDetectedColors] = useState<{ bg: string[], text: string[], border: string[] }>({ bg: [], text: [], border: [] });

    // Sync detection when HTML changes
    useEffect(() => {
        const detectMainColors = () => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const bgSet = new Set<string>();
            const textSet = new Set<string>();
            const borderSet = new Set<string>();
            const fontSet = new Set<string>();

            // Check body font first
            const bodyStyle = doc.body.getAttribute('style') || '';
            const bodyFontMatch = bodyStyle.match(/font-family:\s*([^;]+)/);
            if (bodyFontMatch) fontSet.add(bodyFontMatch[1].split(',')[0].replace(/['"]/g, '').trim());

            const all = doc.querySelectorAll('*');
            all.forEach(el => {
                const htmlEl = el as HTMLElement;
                // 1. Check Tailwind Classes
                el.classList.forEach(cls => {
                    if (cls.startsWith('bg-')) bgSet.add(cls);
                    if (cls.startsWith('text-')) textSet.add(cls);
                    if (cls.startsWith('border-')) borderSet.add(cls);
                });
                // 2. Check Inline Styles
                const style = htmlEl.style;
                if (style.backgroundColor) bgSet.add(rgbToHex(style.backgroundColor));
                if (style.color) textSet.add(rgbToHex(style.color));
                if (style.borderColor) borderSet.add(rgbToHex(style.borderColor));
                if (style.fontFamily) fontSet.add(style.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
            });

            setDetectedColors({
                bg: Array.from(bgSet).slice(0, 8),
                text: Array.from(textSet).slice(0, 8),
                border: Array.from(borderSet).slice(0, 8)
            });

            // Detect global font from style tag if exists
            const styleMatch = html.match(/body\s*{\s*font-family:\s*['"]?([^'",;]+)/);
            if (styleMatch) fontSet.add(styleMatch[1].trim());

            setDetectedFonts(Array.from(fontSet));
        };
        detectMainColors();
    }, [html]);

    const handlePageFontUpdate = (newFont: string) => {
        setHtml(prev => {
            // Normalize: Remove ALL existing site-font tags to prevent duplication
            let next = prev.replace(/<style id=["']site-font["']>[\s\S]*?<\/style>/gi, "");

            if (newFont !== "") {
                const fontUrl = `https://fonts.googleapis.com/css2?family=${newFont.replace(/\s+/g, '+')}&display=swap`;
                const fontCss = `@import url('${fontUrl}');\nbody, #app, #app * { font-family: '${newFont}', sans-serif !important; }`;
                const newStyleTag = `<style id="site-font">${fontCss}</style>`;
                next = newStyleTag + next;
            }

            return next;
        });
    };

    const handleGlobalThemeUpdate = (oldVal: string, newVal: string) => {
        if (!oldVal || !newVal || oldVal === newVal) return;

        setHtml(prev => {
            let next = prev;
            const escapedOld = oldVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Case 1: Typography replacement (targeted to avoid text collision)
            const isFont = GOOGLE_FONTS.includes(oldVal);
            if (isFont) {
                // Update the @import URL if it exists
                const fontUrl = `https://fonts.googleapis.com/css2?family=${newVal.replace(/\s+/g, '+')}&display=swap`;
                next = next.replace(/@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=[^']+'\);/, `@import url('${fontUrl}');`);

                const regex = new RegExp(`(font-family:\\s*['"]?)${escapedOld}(['"]?[^;]*)`, 'gi');
                next = next.replace(regex, `$1${newVal}$2`);
                return next;
            }

            // Case 2: Tailwind Class replace (e.g. bg-blue-600 or bg-white -> bg-[#ff0000])
            const isTailwind = (oldVal.startsWith('bg-') || oldVal.startsWith('text-') || oldVal.startsWith('border-') ||
                oldVal.startsWith('ring-') || oldVal.startsWith('fill-') || oldVal.startsWith('stroke-') ||
                ['bg-white', 'bg-black', 'bg-transparent', 'text-white', 'text-black', 'text-transparent'].includes(oldVal));

            if (isTailwind && !oldVal.startsWith('#') && !oldVal.startsWith('rgb')) {
                const prefixMatch = oldVal.match(/^(bg|text|border|ring|fill|stroke|outline)/);
                const prefix = prefixMatch ? prefixMatch[1] : null;

                // Better regex that looks for word boundary OR quotes/brackets for the end
                const regex = new RegExp(`\\b${escapedOld}(?=[\\s"'\\>\\]]|$)`, 'g');

                const replacement = (prefix && newVal.startsWith('#')) ? `${prefix}-[${newVal}]` : newVal;
                next = next.replace(regex, replacement);
            } else {
                // Case 3: Hex/RGB or Arbitrary Value replace
                const regex = new RegExp(escapedOld, 'gi');
                next = next.replace(regex, newVal);
            }
            return next;
        });
    };

    const tailwindToHex = (cls: string): string => {
        if (cls.includes('#')) {
            const match = cls.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
            return match ? `#${match[1]}` : "#3b82f6";
        }
        if (cls.includes('white')) return "#ffffff";
        if (cls.includes('black')) return "#000000";
        if (cls.includes('blue')) return "#3b82f6";
        if (cls.includes('red')) return "#ef4444";
        if (cls.includes('green')) return "#22c55e";
        if (cls.includes('yellow')) return "#eab308";
        if (cls.includes('purple')) return "#a855f7";
        if (cls.includes('pink')) return "#ec4899";
        if (cls.includes('indigo')) return "#6366f1";
        if (cls.includes('zinc') || cls.includes('slate') || cls.includes('gray')) return "#71717a";
        return "#3b82f6";
    };

    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [selectedInfo, setSelectedInfo] = useState<{
        tagName: string,
        color: string,
        bgColor: string,
        fontFamily: string,
        classList: string[]
    } | null>(null);
    const [detectedFonts, setDetectedFonts] = useState<string[]>([]);

    const cleanFontName = (font: string) => {
        if (!font) return "";
        return font.split(',')[0].replace(/['"]/g, '').trim();
    };



    const rgbToHex = (rgb: string) => {
        if (!rgb) return "#000000";
        if (rgb.startsWith('#')) return rgb;
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return "#000000";
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };

    const handleUpdateStyle = (type: 'color' | 'bgColor', value: string) => {
        if (!selectedPath) return;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const findByPath = (el: Element, path: string): Element | null => {
                const parts = path.split('.').map(Number);
                let current: Element | null = el;
                for (const index of parts) {
                    if (!current) return null;
                    current = current.children[index] || null;
                }
                return current;
            };

            const target = findByPath(doc.body, selectedPath);
            if (target) {
                const el = target as HTMLElement;
                if (type === 'color') el.style.color = value;
                if (type === 'bgColor') el.style.backgroundColor = value;

                setHtml(doc.body.innerHTML);
                setSelectedInfo(prev => prev ? {
                    ...prev,
                    [type]: value
                } : null);
            }
        } catch (e) { console.error(e); }
    };

    const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

    const showToast = (message: string, onUndo?: () => void) => {
        setToast({ message, onUndo });
        setTimeout(() => setToast(null), 3000);
    };

    const [focusKey, setFocusKey] = useState<string | null>(null);

    const getRepeatableParent = (node: Node | null): HTMLElement | null => {
        if (!node || !node.parentElement) return null;
        let current = node.parentElement;
        const stopTags = ['BODY', 'MAIN', 'SECTION'];

        while (current && current.parentElement && !stopTags.includes(current.tagName)) {
            const parent = current.parentElement;

            // Siblings of the same tag. 
            // In modern apps, classes can change (active/hover/etc), so we check tag mostly.
            const siblings = Array.from(parent.children).filter(c =>
                c !== current && c.tagName === current.tagName
            );

            // Confident markers for lists
            if (['LI', 'TR'].includes(current.tagName)) {
                return current;
            }

            // For DIV/ARTICLE/etc, check if it's part of a group of 2+ items
            if (['DIV', 'ARTICLE', 'SECTION'].includes(current.tagName) && siblings.length > 0) {
                // Check if it's a "real" list item (siblings share similar structure or at least tag)
                return current;
            }

            current = current.parentElement as HTMLElement;
        }
        return null;
    };

    const handleSwapVariables = (keyA: string, keyB: string) => {
        if (keyA === keyB) return;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const findElementWithKey = (k: string) => {
                const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent?.includes(`{{${k}}}`)) return node;
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const el = node as HTMLElement;
                        for (let i = 0; i < el.attributes.length; i++) {
                            const val = el.attributes[i].value;
                            if (val.includes(`{{${k}}}`) || val.includes(`%7B%7B${k}%7D%7D`)) return el;
                        }
                    }
                }
                return null;
            };

            const nodeA = findElementWithKey(keyA);
            const nodeB = findElementWithKey(keyB);

            if (!nodeA || !nodeB) {
                console.warn("Could not find nodes for swap:", { keyA, nodeA: !!nodeA, keyB, nodeB: !!nodeB });
                return;
            }

            const parentA = getRepeatableParent(nodeA);
            const parentB = getRepeatableParent(nodeB);

            if (parentA && parentB) {
                if (parentA.parentElement === parentB.parentElement) {
                    const parent = parentA.parentElement;
                    if (!parent) return;
                    let aIndex = -1, bIndex = -1;
                    const children = Array.from(parent.children);
                    for (let i = 0; i < children.length; i++) {
                        if (children[i] === parentA) aIndex = i;
                        if (children[i] === parentB) bIndex = i;
                    }

                    if (aIndex !== -1 && bIndex !== -1) {
                        if (aIndex < bIndex) {
                            parent.insertBefore(parentA, parentB.nextSibling);
                        } else {
                            parent.insertBefore(parentA, parentB);
                        }
                        setHtml(doc.body.innerHTML);
                    }
                } else {
                    showToast("Items must be in the same list to reorder.");
                }
            } else {
                console.warn("Could not find repeatable parents for swap", { parentA: !!parentA, parentB: !!parentB });
                showToast("Could not identify the list structure for these items.");
            }

        } catch (e) {
            console.error("Swap error:", e);
        }
    };

    const [fieldGroups, setFieldGroups] = useState<string[][]>([]);
    const [repeatableKeys, setRepeatableKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        const scanGroups = () => {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                const groups: string[][] = [];
                const processedKeys = new Set<string>();
                const processedParents = new Set<HTMLElement>();

                const regex = /(?:{{|%7B%7B)\s*([a-zA-Z0-9_-]+)\s*(?:}}|%7D%7D)/g;

                const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
                let currentNode;
                const finalOrderedKeys: { key: string, node: Node, parent: HTMLElement | null }[] = [];

                while (currentNode = walker.nextNode()) {
                    if (currentNode.nodeType === Node.TEXT_NODE) {
                        const text = currentNode.textContent || "";
                        let match;
                        const localRegex = new RegExp(regex);
                        while ((match = localRegex.exec(text)) !== null) {
                            finalOrderedKeys.push({
                                key: match[1],
                                node: currentNode,
                                parent: getRepeatableParent(currentNode)
                            });
                        }
                    } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                        const el = currentNode as HTMLElement;
                        Array.from(el.attributes).forEach(attr => {
                            let match;
                            const attrRegex = new RegExp(regex);
                            while ((match = attrRegex.exec(attr.value)) !== null) {
                                finalOrderedKeys.push({
                                    key: match[1],
                                    node: el,
                                    parent: getRepeatableParent(el)
                                });
                            }
                        });
                    }
                }

                for (const item of finalOrderedKeys) {
                    if (processedKeys.has(item.key)) continue;

                    if (item.parent) {
                        if (processedParents.has(item.parent)) continue;

                        const group: string[] = [];
                        const siblingsWithSameParent = finalOrderedKeys.filter(k => k.parent === item.parent);

                        siblingsWithSameParent.forEach(sib => {
                            if (!processedKeys.has(sib.key)) {
                                group.push(sib.key);
                                processedKeys.add(sib.key);
                            }
                        });

                        if (group.length > 0) {
                            groups.push(group);
                            processedParents.add(item.parent);
                        }
                    } else {
                        groups.push([item.key]);
                        processedKeys.add(item.key);
                    }
                }

                const processedKeysWithParent = new Set<string>();
                finalOrderedKeys.forEach(item => {
                    if (item.parent) processedKeysWithParent.add(item.key);
                });

                setFieldGroups(groups);
                setRepeatableKeys(processedKeysWithParent);
            } catch (e) { console.error(e); }
        };
        const t = setTimeout(scanGroups, 300);
        return () => clearTimeout(t);
    }, [html]); // Dep on HTML only (state changes don't affect structure)

    const handleDuplicateVariable = (keyToDuplicate: string) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const findElementWithKey = (k: string) => {
                const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent?.includes(`{{${k}}}`)) return node;
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const el = node as HTMLElement;
                        for (let i = 0; i < el.attributes.length; i++) {
                            const val = el.attributes[i].value;
                            if (val.includes(`{{${k}}}`) || val.includes(`%7B%7B${k}%7D%7D`)) return el;
                        }
                    }
                }
                return null;
            };

            const node = findElementWithKey(keyToDuplicate);

            if (!node) {
                showToast("Could not find element to duplicate.");
                return;
            }

            // Find repeatable parent using the strict helper
            const targetElement = getRepeatableParent(node);

            if (!targetElement) {
                showToast("This item is not part of a list.");
                return;
            }

            const clone = targetElement.cloneNode(true) as HTMLElement;

            // Find all variables in the clone to rename
            const deepHtml = clone.innerHTML;
            // Scan for {{key}} AND %7B%7Bkey%7D%7D (attributes)
            const varRegex = /(?:{{|%7B%7B)\s*([a-zA-Z0-9_-]+)\s*(?:}}|%7D%7D)/g;
            const newKeysMap: Record<string, string> = {};

            let match;
            while ((match = varRegex.exec(deepHtml)) !== null) {
                const oldKey = match[1];
                if (!newKeysMap[oldKey]) {
                    // Generate new key: clean base + random suffix
                    // If key is 'brandName_1234', base is 'brandName'.
                    // If key is 'brandName', base is 'brandName'.
                    const baseName = oldKey.replace(/_\d+$/, "");
                    const randomSuffix = Math.floor(Math.random() * 10000);
                    newKeysMap[oldKey] = `${baseName}_${randomSuffix}`;
                }
            }

            // Update HTML in clone
            let newInnerHtml = deepHtml;
            Object.keys(newKeysMap).forEach(oldKey => {
                const newKey = newKeysMap[oldKey];
                // Replace unencoded {{ }}
                const keyRegex = new RegExp(`{{\\s*${oldKey}\\s*}}`, 'g');
                newInnerHtml = newInnerHtml.replace(keyRegex, `{{${newKey}}}`);
                // Replace encoded %7B%7B %7D%7D
                const encKeyRegex = new RegExp(`%7B%7B\\s*${oldKey}\\s*%7D%7D`, 'gi');
                newInnerHtml = newInnerHtml.replace(encKeyRegex, `{{${newKey}}}`);
            });
            clone.innerHTML = newInnerHtml;

            // Insert clone after target
            targetElement.insertAdjacentElement("afterend", clone);

            // Update State
            const nextState = { ...state };
            let firstNewKey: string | null = null;
            Object.keys(newKeysMap).forEach((oldKey, index) => {
                const newKey = newKeysMap[oldKey];
                if (index === 0) firstNewKey = newKey;
                // Initialize as blank for fresh editing
                nextState[newKey] = "";
            });

            setState(nextState);
            setHtml(doc.body.innerHTML);
            if (firstNewKey) {
                setFocusKey(firstNewKey);
            }
            showToast("Duplicated item!");

        } catch (e) {
            console.error("Error duplicating:", e);
            showToast("Error duplicating item.");
        }
    };

    const handleDeleteVariable = (keyToDelete: string) => {
        // Capture screenshot of state for Undo
        const prevHtml = html;
        const prevState = { ...state };

        // 1. Remove from State
        setState(prev => {
            const next = { ...prev };
            delete next[keyToDelete];
            return next;
        });

        // 2. Remove element from HTML intelligently
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            // XPath to find text nodes containing the key
            const xpath = `//*[text()[contains(.,'{{${keyToDelete}}}')]] | //*[text()[contains(.,'{{ ${keyToDelete} }}')]]`;
            const result = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const node = result.singleNodeValue;

            if (node && node.parentElement) {
                node.parentNode?.removeChild(node);
                setHtml(doc.body.innerHTML);
            } else {
                setHtml(prevHtml => {
                    const regex = new RegExp(`{{\\s*${keyToDelete}\\s*}}`, 'g');
                    return prevHtml.replace(regex, '');
                });
            }
        } catch (e) {
            console.error("Error parsing HTML for delete:", e);
            setHtml(prevHtml => {
                const regex = new RegExp(`{{\\s*${keyToDelete}\\s*}}`, 'g');
                return prevHtml.replace(regex, '');
            });
        }

        showToast(`Deleted variable "${keyToDelete}"`, () => {
            // UNDO ACTION directly restores the captured snapshot
            setHtml(prevHtml);
            setState(prevState);
            setToast(null);
        });
    };

    const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");

    return (
        <main className="h-[100dvh] w-screen bg-zinc-50 text-zinc-900 flex flex-col overflow-hidden">
            {/* ... (Header and Main Split View remain unchanged) ... */}

            {/* Header */}
            <header className="h-14 border-b border-zinc-200 flex items-center justify-between px-4 bg-white/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
                    <Link href="/" className="text-zinc-900 hover:text-zinc-600 transition">Built.at</Link>
                    <span className="hidden md:flex text-zinc-500 text-sm font-mono ml-2 border border-zinc-200 px-2 py-0.5 rounded items-center gap-2">
                        {projectId}
                    </span>

                    <div className="flex items-center gap-1 ml-2 border-l border-zinc-200 pl-4 hidden xl:flex">
                        <button
                            onClick={undo}
                            disabled={historyIndex <= 0}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-all disabled:opacity-20"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={redo}
                            disabled={historyIndex >= history.length - 1}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-all disabled:opacity-20"
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Mobile Unified Tabs (Code | Content | Preview) */}
                <div className="flex md:hidden items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                    <button
                        onClick={() => { setActiveTab("code"); setMobileView("edit"); }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            mobileView === "edit" && activeTab === "code" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5" : "text-zinc-500"
                        )}
                    >
                        Code
                    </button>
                    <button
                        onClick={() => { setActiveTab("content"); setMobileView("edit"); }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            mobileView === "edit" && activeTab === "content" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5" : "text-zinc-500"
                        )}
                    >
                        Content
                    </button>
                    <button
                        onClick={() => setMobileView("preview")}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            mobileView === "preview" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5" : "text-zinc-500"
                        )}
                    >
                        Live
                    </button>
                </div>

                {/* Desktop Tabs */}
                <div className="hidden md:flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                    <button
                        onClick={() => setActiveTab("code")}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            activeTab === "code" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5" : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        <Code className="w-4 h-4" />
                        <span className="hidden sm:inline">Code</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("content")}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                            activeTab === "content" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5" : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        <LayoutTemplate className="w-4 h-4" />
                        <span className="hidden sm:inline">Content</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <button
                        onClick={() => setRefreshKey(k => k + 1)}
                        className="p-2 text-zinc-500 hover:text-zinc-900 transition-colors hidden sm:block"
                        title="Reset App"
                    >
                        <Home className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowThemeSettings(!showThemeSettings)}
                        className={cn(
                            "p-2 transition-colors rounded-lg",
                            showThemeSettings ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"
                        )}
                        title="Theme Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    <Link
                        href={`/app/${projectId}`}
                        target="_blank"
                        className="hidden sm:flex items-center gap-2 px-3 py-2 text-zinc-500 text-sm font-medium hover:text-zinc-900 transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                        View Live
                    </Link>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-3 md:px-4 py-2 bg-zinc-900 text-white text-sm font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (lastSaved && !isSaving ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />)}
                        <span className="hidden md:inline">{isSaving ? "Saving..." : "Save"}</span>
                    </button>
                </div>
            </header>

            {/* Main Split View */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left Pane: Editor */}
                <div className={cn(
                    "flex-1 w-full md:w-1/2 md:border-r border-zinc-200 p-0 flex flex-col bg-white min-h-0",
                    mobileView === "preview" ? "hidden md:flex" : "flex"
                )}>
                    <div className="flex-1 overflow-hidden relative min-h-0">
                        {activeTab === "code" ? (
                            <div className="relative h-full w-full group">
                                <CodeEditor
                                    code={html}
                                    onChange={(val) => setHtml(val || "")}
                                />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(html);
                                        showToast("Code copied to clipboard!");
                                    }}
                                    className="absolute bottom-6 right-6 p-2 bg-white text-zinc-500 rounded-full shadow-lg border border-zinc-200 hover:text-zinc-900 hover:border-zinc-300 transition-all z-10"
                                    title="Copy Code"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                </button>
                            </div>
                        ) : (
                            <FormEditor
                                state={state}
                                onStateChange={setState}
                                html={html}
                                onDelete={handleDeleteVariable}
                                onDuplicate={handleDuplicateVariable}
                                focusKey={focusKey}
                                onFocusConsumed={() => setFocusKey(null)}
                                onReorder={handleSwapVariables}
                                fieldGroups={fieldGroups}
                                repeatableKeys={repeatableKeys}
                            />
                        )}
                    </div>
                </div>

                {/* Right Pane: Preview */}
                <div className={cn(
                    "flex-1 w-full md:w-1/2 p-0 md:p-2 bg-zinc-50 flex flex-col min-h-0",
                    mobileView === "edit" ? "hidden md:flex" : "flex"
                )}>
                    <div className="flex-1 overflow-hidden relative bg-white md:rounded-lg md:border border-zinc-200 md:shadow-sm min-h-0">
                        <Preview
                            html={html}
                            state={state}
                            refreshKey={refreshKey}
                            className="bg-white"
                            selectedPath={selectedPath}
                            onElementSelect={(path, info) => {
                                setSelectedPath(path);
                                setSelectedInfo(info);
                            }}
                        />



                        {/* Theme Settings Sidebar */}
                        {showThemeSettings && (
                            <div className="absolute inset-y-0 right-0 w-72 bg-white/95 backdrop-blur-xl border-l border-zinc-200 shadow-2xl p-6 z-40 animate-in slide-in-from-right duration-300 flex flex-col overflow-y-auto font-sans">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="space-y-1">
                                        <h3 className="text-base font-bold text-zinc-900">Theme Engine</h3>
                                        <p className="text-xs text-zinc-500">Global color detection & overrides</p>
                                    </div>
                                    <button
                                        onClick={() => setShowThemeSettings(false)}
                                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <div className="space-y-8">
                                    {/* Background Colors */}
                                    {detectedColors.bg.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Background Colors</h4>
                                            <div className="space-y-2">
                                                {detectedColors.bg.map((color, idx) => {
                                                    const isMatching = selectedInfo?.classList?.includes(color) || rgbToHex(selectedInfo?.bgColor || '') === color;
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "flex items-center justify-between group p-2 rounded-lg border transition-all",
                                                            isMatching ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/20 shadow-sm" : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                                                        )}>
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className={cn("w-6 h-6 rounded border border-zinc-200 shadow-sm", color.startsWith('bg-') ? color : "")}
                                                                    style={!color.startsWith('bg-') ? { backgroundColor: color } : {}}
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-mono text-zinc-600 leading-none">{color}</span>
                                                                    {isMatching && <span className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter mt-0.5">Active on selection</span>}
                                                                </div>
                                                            </div>
                                                            <input
                                                                type="color"
                                                                value={color.startsWith('#') ? color : tailwindToHex(color)}
                                                                onInput={(e: any) => handleGlobalThemeUpdate(color, e.target.value)}
                                                                className="w-4 h-4 rounded cursor-pointer border-0 p-0 overflow-hidden bg-transparent"
                                                                title="Replace globally"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Text Colors */}
                                    {detectedColors.text.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Text Colors</h4>
                                            <div className="space-y-2">
                                                {detectedColors.text.map((color, idx) => {
                                                    const isMatching = selectedInfo?.classList?.includes(color) || rgbToHex(selectedInfo?.color || '') === color;
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "flex items-center justify-between group p-2 rounded-lg border transition-all",
                                                            isMatching ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/20 shadow-sm" : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                                                        )}>
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className={cn("w-6 h-6 rounded border border-zinc-200 shadow-sm", color.startsWith('text-') ? color.replace('text-', 'bg-') : "")}
                                                                    style={!color.startsWith('text-') ? { backgroundColor: color } : {}}
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-mono text-zinc-600 leading-none">{color}</span>
                                                                    {isMatching && <span className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter mt-0.5">Active on selection</span>}
                                                                </div>
                                                            </div>
                                                            <input
                                                                type="color"
                                                                value={color.startsWith('#') ? color : tailwindToHex(color)}
                                                                onInput={(e: any) => handleGlobalThemeUpdate(color, e.target.value)}
                                                                className="w-4 h-4 rounded cursor-pointer border-0 p-0 overflow-hidden bg-transparent"
                                                                title="Replace globally"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Global Fonts */}
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Global Typography</h4>

                                        <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100 space-y-2">
                                            <label className="text-[10px] font-bold text-zinc-400 uppercase">Primary Page Font</label>
                                            <select
                                                value={detectedFonts[0] || ""}
                                                onInput={(e: any) => handlePageFontUpdate(e.target.value)}
                                                className="w-full bg-white border border-zinc-200 rounded px-2 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                            >
                                                <option value="">Select Font...</option>
                                                {GOOGLE_FONTS.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {detectedFonts.length > 1 && (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase px-1">Other Detected Fonts</label>
                                                {detectedFonts.slice(1).map((font, idx) => {
                                                    const isMatching = cleanFontName(selectedInfo?.fontFamily || '') === font;
                                                    return (
                                                        <div key={idx} className={cn(
                                                            "space-y-1.5 p-2 rounded-lg border transition-all",
                                                            isMatching ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/20 shadow-sm" : "bg-zinc-50 border-zinc-100"
                                                        )}>
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold text-zinc-600 truncate max-w-[120px]">{font}</span>
                                                                    {isMatching && <span className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter">Active on selection</span>}
                                                                </div>
                                                                <Type className="w-3 h-3 text-zinc-300" />
                                                            </div>
                                                            <select
                                                                value={font}
                                                                onChange={(e) => handleGlobalThemeUpdate(font, e.target.value)}
                                                                className="w-full bg-white border border-zinc-200 rounded px-1.5 py-1 text-[10px] outline-none"
                                                            >
                                                                {GOOGLE_FONTS.map(f => (
                                                                    <option key={f} value={f}>{f}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-auto pt-8 border-t border-zinc-100">
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                                            <b>Pro Tip:</b> Changing a color here will update EVERY instance of that color across your entire codebase instantly.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-3 bg-zinc-900 text-white text-sm font-semibold rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-5 z-50 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        {!toast.onUndo && <Check className="w-4 h-4 text-green-400" />}
                        {toast.message}
                    </div>
                    {toast.onUndo && (
                        <button
                            onClick={toast.onUndo}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1 rounded-md text-xs transition-colors"
                        >
                            Undo
                        </button>
                    )}
                </div>
            )}
        </main>
    );
}
