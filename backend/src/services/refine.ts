import type { RefinedPromptResult } from '../types.js';

export function refineCharacterTraits(rawTraits: string): string {
    const cleaned = rawTraits.trim();
    return `highly detailed webtoon character design, ${cleaned}, vibrant digital coloring, crisp studio lineart, consistent facial structure`;
}

export function refineScenePrompt(input: string): RefinedPromptResult {
    const text = input.trim();
    return {
        refinedPrompt: `cinematic colored manhwa panel, ${text}, dramatic perspective, expressive facial emotion, rich environmental storytelling, dynamic panel lighting, polished webtoon rendering`,
    };
}
