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
export type JobStatus = 'received' | 'resolving_tags' | 'refining' | 'generating' | 'completed' | 'failed' | 'cancelled';

export interface ManhwaPanel {
    id: string;
    rawStoryInput: string;
    mergedPrompt: string;
    refinedPrompt: string;
    generatedImageUrl: string | null;
    status: PanelStatus;
    error: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface GenerationJob {
    id: string;
    panelId: string;
    status: JobStatus;
    providerJobId: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TagResolutionResult {
    detectedTags: string[];
    unresolvedTags: string[];
    mergedPrompt: string;
}

export interface RefinedPromptResult {
    refinedPrompt: string;
}
