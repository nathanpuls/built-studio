"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatGPTHandshake } from "@/components/ChatGPTHandshake";
import { generateId } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function Page() {
  const router = useRouter();
  const [appIdea, setAppIdea] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  // Default Blueprint
  const defaultHtml = `<div class="flex flex-col items-center justify-center min-h-screen bg-zinc-50 text-zinc-900 p-4">
  <div class="max-w-md text-center space-y-4">
    <h1 class="text-4xl font-bold tracking-tight">{{title}}</h1>
    <p class="text-zinc-500">{{description}}</p>
    <button class="px-6 py-3 bg-zinc-900 text-white font-semibold rounded-lg hover:bg-zinc-700 transition">
      {{buttonText}}
    </button>
  </div>
</div>`;

  const defaultState = {
    title: "Welcome to Built.at",
    description: "This is your starting point. Edit the code on the left or the content form.",
    buttonText: "Get Started"
  };

  const createAndRedirect = async (html: string, state: any) => {
    setIsCreating(true);
    const newId = generateId();
    try {
      await setDoc(doc(db, "projects", newId), {
        html,
        state,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      router.push(`/studio/${newId}`);
    } catch (e) {
      console.error("Error creating project:", e);
      setIsCreating(false);
      alert("Failed to create project");
    }
  };

  const handleComplete = (html: string, state: any) => {
    createAndRedirect(html, state);
  };

  return (
    <main className="h-screen w-screen bg-zinc-50 text-zinc-900 flex flex-col">
      <header className="h-14 border-b border-zinc-200 flex items-center justify-between px-6 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="text-zinc-900">Built.at</span>
          <span className="text-zinc-500 font-normal">/ Studio</span>
        </div>

        <button
          onClick={() => setShowPaste(true)}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          Paste Blueprint
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center relative">
        {isCreating && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="animate-pulse text-xl font-medium text-zinc-900">Initializing your workspace...</div>
          </div>
        )}
        <ChatGPTHandshake
          appIdea={appIdea}
          setAppIdea={setAppIdea}
          onComplete={handleComplete}
          onStartCoding={() => createAndRedirect(defaultHtml, defaultState)}
          showPaste={showPaste}
          setShowPaste={setShowPaste}
        />
      </div>
    </main>
  );
}
