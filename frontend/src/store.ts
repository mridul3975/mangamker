import { create } from 'zustand';
import { createCharacter, createPanelJob, getJob, listCharacters, refineCharacter } from './api';
import type { CharacterProfile, ManhwaPanel } from './types';

interface CharacterVaultState {
    characters: CharacterProfile[];
    loading: boolean;
    error: string | null;
    load: () => Promise<void>;
    add: (payload: { name: string; role: 'mc' | 'fmc' | 'side'; rawTraits: string }) => Promise<void>;
    refine: (id: string) => Promise<void>;
}

interface PanelGeneratorState {
    rawStoryInput: string;
    panel: ManhwaPanel | null;
    jobId: string | null;
    loading: boolean;
    error: string | null;
    setRawStoryInput: (value: string) => void;
    generate: () => Promise<void>;
}

export const useCharacterVaultStore = create<CharacterVaultState>((set, get) => ({
    characters: [],
    loading: false,
    error: null,
    load: async () => {
        set({ loading: true, error: null });
        try {
            const characters = await listCharacters();
            set({ characters, loading: false });
        } catch (error) {
            set({ loading: false, error: error instanceof Error ? error.message : 'Failed to load characters' });
        }
    },
    add: async (payload) => {
        set({ loading: true, error: null });
        try {
            await createCharacter(payload);
            const characters = await listCharacters();
            set({ characters, loading: false });
        } catch (error) {
            set({ loading: false, error: error instanceof Error ? error.message : 'Failed to create character' });
        }
    },
    refine: async (id) => {
        set({ loading: true, error: null });
        try {
            await refineCharacter(id);
            await get().load();
            set({ loading: false });
        } catch (error) {
            set({ loading: false, error: error instanceof Error ? error.message : 'Failed to refine character' });
        }
    },
}));

export const usePanelGeneratorStore = create<PanelGeneratorState>((set, get) => ({
    rawStoryInput: '',
    panel: null,
    jobId: null,
    loading: false,
    error: null,
    setRawStoryInput: (value) => set({ rawStoryInput: value }),
    generate: async () => {
        const input = get().rawStoryInput.trim();
        if (!input) {
            set({ error: 'Enter a story beat first.' });
            return;
        }

        set({ loading: true, error: null, panel: null, jobId: null });
        try {
            const created = await createPanelJob(input);
            set({ jobId: created.jobId });

            let done = false;
            while (!done) {
                const status = await getJob(created.jobId);
                set({ panel: status.panel });
                if (status.job.status === 'completed' || status.job.status === 'failed' || status.job.status === 'cancelled') {
                    done = true;
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            set({ loading: false });
        } catch (error) {
            set({ loading: false, error: error instanceof Error ? error.message : 'Generation failed' });
        }
    },
}));
