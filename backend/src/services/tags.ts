import { db } from '../db.js';
import type { TagResolutionResult } from '../types.js';

const tagRegex = /@([a-zA-Z0-9_\-]+)/g;

export function resolveTags(rawStoryInput: string): TagResolutionResult {
    const detected = new Set<string>();
    const unresolved = new Set<string>();

    const mergedPrompt = rawStoryInput.replace(tagRegex, (_, tag: string) => {
        const normalized = tag.toLowerCase();
        detected.add(normalized);
        const row = db
            .prepare('SELECT refined_traits FROM characters WHERE name = ?')
            .get(normalized) as { refined_traits: string } | undefined;

        if (!row) {
            unresolved.add(normalized);
            return `@${normalized}`;
        }

        return row.refined_traits;
    });

    return {
        detectedTags: Array.from(detected),
        unresolvedTags: Array.from(unresolved),
        mergedPrompt,
    };
}
