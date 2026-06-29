export type CharacterRole = 'mc' | 'fmc' | 'side';

export interface CharacterProfile {
    id: string;
    name: string;
    role: CharacterRole;
    rawTraits: string;
    refinedTraits: string;
    createdAt: string;
    updatedAt: string;
}

export type PanelStatus = 'idle' | 'refining' | 'generating' | 'completed' | 'failed';

export interface ManhwaPanel {
    id: string;
    rawStoryInput: string;
    mergedPrompt: string;
    refinedPrompt: string;
    generatedImageUrl: string | null;
    status: PanelStatus;
    error: string | null;
}

export interface JobResponse {
    job: {
        id: string;
        status: string;
        error: string | null;
    };
    panel: ManhwaPanel;
}
