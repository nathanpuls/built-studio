"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Preview } from "@/components/Preview";
import { Loader2 } from "lucide-react";

export default function AppViewPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [data, setData] = useState<{ html: string; state: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!projectId) return;

        const fetchData = async () => {
            try {
                const docRef = doc(db, "projects", projectId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const projectData = docSnap.data();
                    setData({
                        html: projectData.html || "",
                        state: projectData.state || {},
                    });
                } else {
                    setError("App not found");
                }
            } catch (err) {
                console.error("Error fetching project:", err);
                setError("Failed to load app");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [projectId]);

    if (loading) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-50 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-white text-zinc-900 gap-4">
                <h1 className="text-xl font-semibold">{error || "Something went wrong"}</h1>
            </div>
        );
    }

    // Render purely the preview component fullscreen
    return (
        <main className="h-screen w-screen overflow-hidden bg-white relative">
            <Preview html={data.html} state={data.state} className="rounded-none border-0" showHomeButton={false} />
            <a
                href="/"
                target="_blank"
                className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-bold tracking-tight text-zinc-900 bg-white px-3 py-1.5 rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
                built.at
            </a>
        </main>
    );
}
