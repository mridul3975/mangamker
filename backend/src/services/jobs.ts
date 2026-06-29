import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { resolveTags } from './tags.js';
import { refineScenePrompt } from './refine.js';

function nowIso(): string {
    return new Date().toISOString();
}

function updateJobStatus(jobId: string, status: string, error: string | null = null, providerJobId: string | null = null): void {
    db.prepare(
        `UPDATE jobs
     SET status = ?, error = ?, provider_job_id = COALESCE(?, provider_job_id), updated_at = ?
     WHERE id = ?`
    ).run(status, error, providerJobId, nowIso(), jobId);
}

function updatePanelStatus(panelId: string, status: string, mergedPrompt?: string, refinedPrompt?: string, imageUrl?: string | null, error?: string | null): void {
    db.prepare(
        `UPDATE panels
     SET status = ?,
         merged_prompt = COALESCE(?, merged_prompt),
         refined_prompt = COALESCE(?, refined_prompt),
         generated_image_url = COALESCE(?, generated_image_url),
         error = ?,
         updated_at = ?
     WHERE id = ?`
    ).run(status, mergedPrompt ?? null, refinedPrompt ?? null, imageUrl ?? null, error ?? null, nowIso(), panelId);
}

export function createGenerationJob(rawStoryInput: string): { jobId: string; panelId: string } {
    const panelId = randomUUID();
    const jobId = randomUUID();
    const now = nowIso();

    db.prepare(
        `INSERT INTO panels (id, raw_story_input, merged_prompt, refined_prompt, generated_image_url, status, error, created_at, updated_at)
     VALUES (?, ?, '', '', NULL, 'idle', NULL, ?, ?)`
    ).run(panelId, rawStoryInput, now, now);

    db.prepare(
        `INSERT INTO jobs (id, panel_id, status, provider_job_id, error, created_at, updated_at)
     VALUES (?, ?, 'received', NULL, NULL, ?, ?)`
    ).run(jobId, panelId, now, now);

    return { jobId, panelId };
}

export function processJob(jobId: string): void {
    const job = db.prepare('SELECT id, panel_id, status FROM jobs WHERE id = ?').get(jobId) as { id: string; panel_id: string; status: string } | undefined;
    if (!job || job.status === 'cancelled') {
        return;
    }

    const panel = db.prepare('SELECT id, raw_story_input FROM panels WHERE id = ?').get(job.panel_id) as { id: string; raw_story_input: string } | undefined;
    if (!panel) {
        updateJobStatus(jobId, 'failed', 'Panel not found');
        return;
    }

    try {
        updateJobStatus(jobId, 'resolving_tags');
        updatePanelStatus(panel.id, 'refining');
        const resolved = resolveTags(panel.raw_story_input);

        updateJobStatus(jobId, 'refining');
        const refined = refineScenePrompt(resolved.mergedPrompt);
        updatePanelStatus(panel.id, 'refining', resolved.mergedPrompt, refined.refinedPrompt, null, null);

        updateJobStatus(jobId, 'generating');
        updatePanelStatus(panel.id, 'generating');

        const segmindApiKey = process.env.SEGMIND_API_KEY;
        const segmindWorkflowId = process.env.SEGMIND_WORKFLOW_ID;

        if (!segmindApiKey || segmindApiKey === 'replace_me' || !segmindWorkflowId || segmindWorkflowId === 'replace_me') {
            // Simulate async provider callback driven generation lifecycle for development fallback
            setTimeout(() => {
                const imageUrl = `https://picsum.photos/seed/${panel.id}/1024/1024`;
                updateJobStatus(jobId, 'completed');
                updatePanelStatus(panel.id, 'completed', undefined, undefined, imageUrl, null);
            }, 1500);
            return;
        }

        // Perform actual Segmind API call asynchronously
        (async () => {
            try {
                const response = await fetch(`https://api.segmind.com/v1/workflows/${segmindWorkflowId}`, {
                    method: 'POST',
                    headers: {
                        'x-api-key': segmindApiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        input_prompt: refined.refinedPrompt,
                        negative_prompt: "black and white, monochrome, classic manga screentones, sketch, low quality",
                        seed: -1
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Segmind API failed: ${response.status} - ${text}`);
                }

                const contentType = response.headers.get('content-type') || '';
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Image = buffer.toString('base64');
                
                // Determine mime type, default to image/jpeg if not found
                const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
                const imageUrl = `data:${mimeType};base64,${base64Image}`;

                updateJobStatus(jobId, 'completed');
                updatePanelStatus(panel.id, 'completed', undefined, undefined, imageUrl, null);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Segmind execution failure';
                updateJobStatus(jobId, 'failed', message);
                updatePanelStatus(panel.id, 'failed', undefined, undefined, null, message);
            }
        })();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown generation failure';
        updateJobStatus(jobId, 'failed', message);
        updatePanelStatus(panel.id, 'failed', undefined, undefined, null, message);
    }
}
