"use client";

import React, { useEffect, useRef, useState } from "react";
import { Home } from "lucide-react";

interface PreviewProps {
  html: string;
  state: Record<string, any>;
  className?: string;
  refreshKey: number;
}

interface PreviewProps {
  html: string;
  state: Record<string, any>;
  className?: string;
  refreshKey: number;
  onElementSelect?: (path: string, elementInfo: { tagName: string, color: string, bgColor: string }) => void;
  selectedPath?: string | null;
}

export function Preview({ html, state, className, refreshKey, onElementSelect, selectedPath }: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState("");

  // Helper to safely replace placeholders and add data-path attributes
  const getProcessedHtml = (rawHtml: string, currentState: Record<string, any>) => {
    // Parse the raw HTML to add data-paths
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    const addPaths = (el: Element, path: string) => {
      el.setAttribute('data-path', path);
      Array.from(el.children).forEach((child, i) => addPaths(child, `${path}.${i}`));
    };

    if (doc.body.children.length > 0) {
      Array.from(doc.body.children).forEach((child, i) => addPaths(child, `${i}`));
    }

    // Include head content (styles, imports) + body content
    let hydrated = (doc.head.innerHTML || '') + doc.body.innerHTML;
    Object.entries(currentState).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      hydrated = hydrated.replace(regex, () => String(value ?? ""));
    });
    return hydrated;
  };

  const constructDoc = (content: string) => {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lato:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;600;700&family=Nunito:wght@400;600;700&family=Open+Sans:wght@400;600;700&family=Oswald:wght@400;700&family=Playfair+Display:wght@400;700&family=Poppins:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { margin: 0; padding: 0; min-height: 100vh; }
          #app { min-height: 100vh; }
        </style>
      </head>
      <body>
        <div id="app" class="relative hover:outline-none">${content}</div>
        <script>
            let hoveredElement = null;
            let selectedPath = ${JSON.stringify(selectedPath)};

            window.parent.postMessage({ type: 'IFRAME_LOADED' }, '*');



            document.addEventListener('click', (e) => {
                const target = e.target.closest('[data-path]');
                if (target) {
                    e.preventDefault();
                    e.stopPropagation();
                    const path = target.getAttribute('data-path');
                    const styles = window.getComputedStyle(target);
                    
                    window.parent.postMessage({ 
                        type: 'ELEMENT_SELECTED', 
                        path,
                        tagName: target.tagName,
                        color: styles.color,
                        bgColor: styles.backgroundColor,
                        fontFamily: styles.fontFamily,
                        classList: Array.from(target.classList)
                    }, '*');
                }
            });

            window.addEventListener('message', (event) => {
                const { type, data, path } = event.data;
                if (type === 'UPDATE_HTML') {
                    const parser = new DOMParser();
                    const newDoc = parser.parseFromString(data.html, 'text/html');
                    
                    // 1. Sync the #app container (efficiently)
                    const app = document.getElementById('app');
                    const newApp = newDoc.getElementById('app');
                    if (newApp && app) {
                        if (app.innerHTML !== newApp.innerHTML) {
                            app.innerHTML = newApp.innerHTML;
                        }
                    } else if (app) {
                        app.innerHTML = data.html;
                    }

                    // 2. Sync the global font style specifically for instant feedback
                    const newSiteFont = newDoc.getElementById('site-font');
                    let existingSiteFont = document.getElementById('site-font');
                    if (newSiteFont) {
                        if (!existingSiteFont) {
                            existingSiteFont = document.createElement('style');
                            existingSiteFont.id = 'site-font';
                            document.head.appendChild(existingSiteFont);
                        }
                        if (existingSiteFont.textContent !== newSiteFont.textContent) {
                            existingSiteFont.textContent = newSiteFont.textContent;
                        }
                    } else if (existingSiteFont) {
                        existingSiteFont.remove();
                    }
                    
                    // Re-syncing app content and styles
                    // No highlight logic needed here anymore
                } else if (type === 'SET_SELECTED_PATH') {
                    // Visual highlighing disabled for now
                }
            });
        </script>
      </body>
      </html>
    `;
  };

  // 1. Initial Load
  useEffect(() => {
    const processedHtml = getProcessedHtml(html, state);
    setSrcDoc(constructDoc(processedHtml));
  }, [refreshKey]);

  // 2. Message Handlers
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'IFRAME_LOADED') {
        updateIframe();
      } else if (event.data.type === 'ELEMENT_SELECTED') {
        onElementSelect?.(event.data.path, {
          tagName: event.data.tagName,
          color: event.data.color,
          bgColor: event.data.bgColor,
          fontFamily: event.data.fontFamily,
          classList: event.data.classList
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [html, state, onElementSelect]);

  const updateIframe = () => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      const processedHtml = getProcessedHtml(html, state);
      iframe.contentWindow.postMessage({
        type: 'UPDATE_HTML',
        path: selectedPath,
        data: { html: processedHtml }
      }, '*');
    }
  };

  // 3. Sync HTML/State
  useEffect(() => {
    updateIframe();
  }, [html, state]);

  // 4. Highlight Selected Path
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'SET_SELECTED_PATH',
        path: selectedPath
      }, '*');
    }
  }, [selectedPath]);

  return (
    <div className={`h-full w-full overflow-hidden bg-white relative group ${className}`}>
      <iframe
        key={refreshKey}
        ref={iframeRef}
        srcDoc={srcDoc}
        title="Live Preview"
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
