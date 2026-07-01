import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { resolveTags } from './tags.js';
import { refineScenePrompt } from './refine.js';

/** Returns current ISO timestamp */
function nowIso(): string {
  return new Date().toISOString();
}

/** Update job record */
function updateJobStatus(
  jobId: string,
  status: string,
  error: string | null = null,
  providerJobId: string | null = null
): void {
  db.prepare(
    `UPDATE jobs
       SET status = ?,
           error = ?,
           provider_job_id = COALESCE(?, provider_job_id),
           updated_at = ?
       WHERE id = ?`
  ).run(status, error, providerJobId, nowIso(), jobId);
}

/** Update panel record */
function updatePanelStatus(
  panelId: string,
  status: string,
  mergedPrompt?: string,
  refinedPrompt?: string,
  imageUrl?: string | null,
  error?: string | null
): void {
  db.prepare(
    `UPDATE panels
       SET status = ?,
           merged_prompt = COALESCE(?, merged_prompt),
           refined_prompt = COALESCE(?, refined_prompt),
           generated_image_url = COALESCE(?, generated_image_url),
           error = ?,
           updated_at = ?
       WHERE id = ?`
  ).run(
    status,
    mergedPrompt ?? null,
    refinedPrompt ?? null,
    imageUrl ?? null,
    error ?? null,
    nowIso(),
    panelId
  );
}

/** Create a new generation job and its panel */
export function createGenerationJob(rawStoryInput: string): {
  jobId: string;
  panelId: string;
} {
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

/** Process a job: tag resolution → prompt refinement → image generation */
export function processJob(jobId: string): void {
  const job = db
    .prepare('SELECT id, panel_id, status FROM jobs WHERE id = ?')
    .get(jobId) as { id: string; panel_id: string; status: string } | undefined;

  if (!job || job.status === 'cancelled') return;

  const panel = db
    .prepare('SELECT id, raw_story_input FROM panels WHERE id = ?')
    .get(job.panel_id) as { id: string; raw_story_input: string } | undefined;

  if (!panel) {
    updateJobStatus(jobId, 'failed', 'Panel not found');
    return;
  }

  try {
    // Resolve tags
    updateJobStatus(jobId, 'resolving_tags');
    updatePanelStatus(panel.id, 'refining');
    const resolved = resolveTags(panel.raw_story_input);

    // Refine prompt
    updateJobStatus(jobId, 'refining');
    const refined = refineScenePrompt(resolved.mergedPrompt);
    updatePanelStatus(panel.id, 'refining', resolved.mergedPrompt, refined.refinedPrompt);

    // Generate image
    updateJobStatus(jobId, 'generating');
    updatePanelStatus(panel.id, 'generating');

    const segmindApiKey = process.env.SEGMIND_API_KEY;
    const segmindWorkflowId = process.env.SEGMIND_WORKFLOW_ID;
    console.log('Segmind Request:', { segmindApiKey, segmindWorkflowId });

    // Development fallback when keys are missing or placeholders
    if (!segmindApiKey || segmindApiKey === 'replace_me' || !segmindWorkflowId || segmindWorkflowId === 'replace_me') {
      setTimeout(() => {
        const fallbackUrl = `https://picsum.photos/seed/${panel.id}/1024/1024`;
        updateJobStatus(jobId, 'completed');
        updatePanelStatus(panel.id, 'completed', undefined, undefined, fallbackUrl, null);
      }, 1500);
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `https://api.segmind.com/v1/workflows/${segmindWorkflowId}`,
          {
            method: 'POST',
            headers: {
              'x-api-key': segmindApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input_prompt: refined.refinedPrompt,
              negative_prompt:
                'black and white, monochrome, classic manga screentones, sketch, low quality',
              seed: -1,
            }),
          }
        );

        console.log('Segmind Response Status:', response.status);
        const contentType = response.headers.get('content-type') || '';
        let imageUrl: string | null = null;

        if (!response.ok) {
          // API error – fallback to placeholder image
          const fallbackUrl = `https://picsum.photos/seed/${panel.id}/1024/1024`;
          updateJobStatus(jobId, 'completed');
          updatePanelStatus(panel.id, 'completed', undefined, undefined, fallbackUrl, null);
          return;
        }

        if (contentType.includes('application/json')) {
          const json = await response.json();
          console.log('Segmind JSON Payload:', json);
          if (json?.output?.[0]?.url) {
            imageUrl = json.output[0].url;
          } else if (json?.image_url) {
            imageUrl = json.image_url;
          } else if (json?.image) {
            const mime = contentType.includes('png') ? 'image/png' : 'image/jpeg';
            imageUrl = `data:${mime};base64,${json.image}`;
          }
        }

        if (!imageUrl) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64 = buffer.toString('base64');
          const mime = contentType.includes('png') ? 'image/png' : 'image/jpeg';
          imageUrl = `data:${mime};base64,${base64}`;
        }

        console.log('Generated image URL length:', imageUrl?.length);
        updateJobStatus(jobId, 'completed');
        updatePanelStatus(panel.id, 'completed', undefined, undefined, imageUrl, null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Segmind execution failure';
        console.error('Segmind invocation error:', message);
        const fallbackUrl = `https://picsum.photos/seed/${panel.id}/1024/1024`;
        updateJobStatus(jobId, 'completed');
        updatePanelStatus(panel.id, 'completed', undefined, undefined, fallbackUrl, null);
      }
    })();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation failure';
    updateJobStatus(jobId, 'failed', message);
    updatePanelStatus(panel.id, 'failed', undefined, undefined, null, message);
  }
}
