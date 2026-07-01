import type { CharacterProfile, JobResponse } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function parseJson<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return (await res.json()) as T;
}

export async function listCharacters(): Promise<CharacterProfile[]> {
    const res = await fetch(`${API_BASE}/api/characters`);
    return parseJson<CharacterProfile[]>(res);
}

export async function createCharacter(payload: {
    name: string;
    role: 'mc' | 'fmc' | 'side';
    rawTraits: string;
}): Promise<CharacterProfile> {
    const res = await fetch(`${API_BASE}/api/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return parseJson<CharacterProfile>(res);
}

// Update an existing character by ID
export async function updateCharacter(id: string, payload: {
    name: string;
    role: 'mc' | 'fmc' | 'side';
    rawTraits: string;
}): Promise<CharacterProfile> {
    const res = await fetch(`${API_BASE}/api/characters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return parseJson<CharacterProfile>(res);
}


export async function refineCharacter(id: string): Promise<{ id: string; refinedTraits: string; updatedAt: string }> {
    const res = await fetch(`${API_BASE}/api/characters/${id}/refine`, {
        method: 'POST',
    });
    return parseJson<{ id: string; refinedTraits: string; updatedAt: string }>(res);
}

export async function createPanelJob(rawStoryInput: string): Promise<{ jobId: string; panelId: string }> {
    const res = await fetch(`${API_BASE}/api/panels/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawStoryInput }),
    });
    return parseJson<{ jobId: string; panelId: string }>(res);
}

export async function getJob(jobId: string): Promise<JobResponse> {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
    return parseJson<JobResponse>(res);
}
