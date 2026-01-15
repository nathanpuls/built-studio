"use client";

import React from "react";
import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
    code: string;
    onChange: (value: string | undefined) => void;
    language?: string;
}

export function CodeEditor({ code, onChange, language = "html" }: CodeEditorProps) {
    const handleEditorDidMount: OnMount = (editor, monaco) => {
        // Configure editor settings
        editor.updateOptions({
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            fontFamily: "var(--font-mono)",
            formatOnPaste: true,
            formatOnType: true,
        });

        // Add custom theme if needed
        monaco.editor.defineTheme("built-light", {
            base: "vs",
            inherit: true,
            rules: [],
            colors: {
                "editor.background": "#ffffff", // white
            },
        });
        monaco.editor.setTheme("built-light");

        // Auto-focus and format
        editor.focus();
        setTimeout(() => {
            editor.getAction('editor.action.formatDocument')?.run();
        }, 100);
    };

    return (
        <div className="h-full w-full overflow-hidden md:rounded-lg md:border md:border-zinc-200 bg-white md:shadow-sm">
            <Editor
                height="100%"
                defaultLanguage={language}
                language={language}
                value={code}
                onChange={onChange}
                theme="vs"
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 16 },
                }}
                onMount={handleEditorDidMount}
            />
        </div>
    );
}
