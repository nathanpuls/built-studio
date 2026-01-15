"use client";

import React, { useState } from "react";
import { Copy, ArrowRight, Wand2 } from "lucide-react";

interface ChatGPTHandshakeProps {
    appIdea: string;
    setAppIdea: (val: string) => void;
    onComplete: (html: string, state: any) => void;
    onStartCoding: () => void;
    showPaste: boolean;
    setShowPaste: (val: boolean) => void;
}

export function ChatGPTHandshake({ appIdea, setAppIdea, onComplete, onStartCoding, showPaste, setShowPaste }: ChatGPTHandshakeProps) {
    const [error, setError] = useState<string | null>(null);
    const [jsonInput, setJsonInput] = useState("");

    const handleSendToGPT = () => {
        // ... existing handleSendToGPT logic ...
        // 1. Construct the prompt
        const architectPrompt = `
You are an expert web architect. I need you to build a single-page web application based on this idea: "${appIdea}".

Return a Single Valid JSON Object inside a Markdown code block ( \`\`\`json ).
The JSON must have exactly two keys:
1. "htmlLines": An ARRAY of strings, where each string represents a line of HTML code.
   - Break the HTML into many lines (e.g. one line per element) to create a "typing" effect as you generate content.
   - Use Tailwind CSS classes for styling.
   - For ANY lists or repeated items (features, cards, links), you MUST use a consistent repeating structure (e.g. <ul><li>...</li></ul> or repeating <div class='card'>...</div>) so our "Duplicate Item" feature can scan and replicate them. If the user mentions multiple items, ensure they are rendered as such lists.
   - Do not include <html>, <head>, or <body> tags. Just the inner content.
   - CRITICAL: Why you use double quotes inside the HTML string you MUST escape them (e.g. class=\\"text-red-500\\") OR use single quotes for HTML attributes (e.g. class='text-red-500').
2. "state": A flat JSON object containing default text content, labels, or URLs for images/audio. 
   - IMPORTANT: ALL media (images, audio, video) must be represented as TEXT URLs. Do NOT use file inputs (<input type="file">) or mention file uploading.
   - Use placeholder URLs for default media (e.g. 'https://placehold.co/600x400' for images).

Example Response:
\`\`\`json
{
  "htmlLines": [
    "<div class='p-4'>",
    "  <h1 class='text-2xl'>{{title}}</h1>",
    "</div>"
  ],
  "state": { "title": "My App" }
}
\`\`\`
    `;

        // 2. Copy to clipboard
        navigator.clipboard.writeText(architectPrompt).then(() => {
            console.log("Prompt copied to clipboard");
        });

        // 3. Redirect to ChatGPT
        const encodedPrompt = encodeURIComponent(architectPrompt);
        window.open(`https://chatgpt.com/?q=${encodedPrompt}`, "_blank");

        // 4. Switch view state
        setShowPaste(true);
    };

    const handleInject = () => {
        try {
            setError(null);
            // 1. Clean up common markdown wrapping (```json ... ```)
            let cleaned = jsonInput.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replace(/^```(json)?/, "").replace(/```$/, "");
            }
            // Attempt to repair truncated JSON (basic check)
            const openBraces = (cleaned.match(/{/g) || []).length;
            const closeBraces = (cleaned.match(/}/g) || []).length;
            if (openBraces > closeBraces) {
                // Heuristic: Append closing text if mistakenly cut off? 
                // Hard to guess perfectly, but let's try appending standard closing
                // if it looks like the user pasted a partial block
                // cleaned += "}"; 
                // Actually, let's just warn the user first in the catch block
            }

            const data = JSON.parse(cleaned);

            // Handle new "htmlLines" array format or fallback to "html" string
            let finalHtml = "";
            if (Array.isArray(data.htmlLines)) {
                finalHtml = data.htmlLines.join("\n");
            } else if (typeof data.html === "string") {
                finalHtml = data.html;
            } else {
                throw new Error("Missing 'htmlLines' or 'html' key in JSON.");
            }

            if (!data.state) {
                throw new Error("Missing 'state' key in JSON.");
            }

            onComplete(finalHtml, data.state);
        } catch (e: any) {
            console.error("JSON Parse Error:", e);
            setError("Whoops! That didn't look like valid JSON. Did you paste the entire response? Try copying the code block again. Error: " + e.message);
        }
    };

    // ... existing if (!hasSentToGPT) check ...
    if (!showPaste) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-full max-w-2xl mx-auto space-y-8 animate-fade-in text-center">
                <div className="space-y-4">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-500">
                        What do you want to build?
                    </h1>
                    <p className="text-zinc-500 text-lg">
                        Describe your dream app and let AI handle the architecture.
                    </p>
                </div>

                <textarea
                    value={appIdea}
                    onChange={(e) => setAppIdea(e.target.value)}
                    placeholder="e.g. A landing page for a dog walking service with a pricing table and a contact form..."
                    className="w-full h-40 p-4 rounded-xl border border-zinc-200 bg-white text-lg focus:ring-2 focus:ring-black/5 focus:border-zinc-300 outline-none transition-all resize-none placeholder:text-zinc-400 shadow-sm"
                    autoFocus
                />

                <div className="flex gap-4 w-full">
                    <button
                        onClick={handleSendToGPT}
                        className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-4 rounded-xl font-semibold hover:bg-zinc-700 transition-colors shadow-sm"
                    >
                        <Wand2 className="w-5 h-5" />
                        Send to ChatGPT
                    </button>
                    <button
                        onClick={onStartCoding}
                        className="flex-1 flex items-center justify-center gap-2 bg-white text-zinc-700 px-6 py-4 rounded-xl font-medium border border-zinc-200 hover:bg-zinc-50 transition-colors shadow-sm"
                    >
                        Skip & Code Manually
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center p-8 h-full max-w-2xl mx-auto space-y-6 animate-fade-in text-center">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-zinc-900">Paste the Blueprint</h2>
                <p className="text-zinc-500">
                    ChatGPT has generated your app structure. Copy the JSON response and paste it below.
                </p>
            </div>

            <div className="w-full relative space-y-2">
                <textarea
                    value={jsonInput}
                    onChange={(e) => {
                        setJsonInput(e.target.value);
                        if (error) setError(null);
                    }}
                    placeholder='Paste JSON here... { "html": "...", "state": {...} }'
                    className={`w-full h-64 p-4 font-mono text-sm rounded-xl border bg-white focus:ring-2 outline-none resize-none shadow-sm ${error ? "border-red-500 focus:ring-red-500/20" : "border-zinc-200 focus:ring-black/5 focus:border-zinc-300"
                        }`}
                    autoFocus
                />

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start text-left animate-in fade-in slide-in-from-top-2">
                        <span>{error}</span>
                    </div>
                )}
            </div>

            <button
                onClick={handleInject}
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-4 rounded-xl font-semibold hover:bg-zinc-700 transition-colors shadow-sm"
            >
                <ArrowRight className="w-5 h-5" />
                Inject & Build
            </button>

            <button
                onClick={() => setShowPaste(false)}
                className="text-zinc-500 hover:text-zinc-800 text-sm transition-colors"
            >
                Back to Idea
            </button>
        </div>
    );
}
