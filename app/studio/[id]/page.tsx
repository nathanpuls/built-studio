"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { EditorInterface } from "@/components/EditorInterface";
import { Loader2 } from "lucide-react";

export default function StudioPage() {
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
                    setError("Project not found");
                }
            } catch (err) {
                console.error("Error fetching project:", err);
                setError("Failed to load project");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [projectId]);

    if (loading) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                <p className="text-zinc-500 animate-pulse">Loading studio...</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-white gap-4">
                <h1 className="text-xl font-semibold text-red-500">{error || "Something went wrong"}</h1>
                <a href="/" className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition">Go Home</a>
            </div>
        );
    }

    return (
        <EditorInterface
            projectId={projectId}
            initialHtml={data.html}
            initialState={data.state}
        />
    );
}
