import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, initDb } from './db.js';
// Google Generative AI SDK – replaces Segmind workflow
import { GoogleGenerativeAI } from '@google/generative-ai';
import { refineCharacterTraits } from './services/refine.js';

initDb();

const app = express();
app.use(cors());
app.use(express.json());

const characterSchema = z.object({
    name: z.string().trim().min(2).max(32),
    role: z.enum(['mc', 'fmc', 'side']),
    rawTraits: z.string().trim().min(10).max(2000),
});

const storySchema = z.object({
    rawStoryInput: z.string().trim().min(5).max(4000),
});

app.get('/', (_req, res) => {
    res.send('<h1>MangaMaker Backend is running</h1><p>Please open the frontend at <a href="http://localhost:5173/">http://localhost:5173/</a> to use the app.</p>');
});

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'mangamaker-backend' });
});

app.get('/api/characters', (_req, res) => {
    const rows = db
        .prepare('SELECT id, name, role, raw_traits, refined_traits, created_at, updated_at FROM characters ORDER BY created_at DESC')
        .all() as Array<{
            id: string;
            name: string;
            role: 'mc' | 'fmc' | 'side';
            raw_traits: string;
            refined_traits: string;
            created_at: string;
            updated_at: string;
        }>;

    res.json(
        rows.map((r) => ({
            id: r.id,
            name: r.name,
            role: r.role,
            rawTraits: r.raw_traits,
            refinedTraits: r.refined_traits,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }))
    );
});

app.put('/api/characters/:id', async (req, res) => {
    const { id } = req.params;
    const parsed = characterSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const row = db.prepare('SELECT id FROM characters WHERE id = ?').get(id) as { id: string } | undefined;
    if (!row) {
        return res.status(404).json({ error: 'Character not found' });
    }

    const now = new Date().toISOString();
    const refinedTraits = refineCharacterTraits(parsed.data.rawTraits);
    db.prepare(
        `UPDATE characters SET name = ?, role = ?, raw_traits = ?, refined_traits = ?, updated_at = ? WHERE id = ?`
    ).run(
        parsed.data.name.toLowerCase(),
        parsed.data.role,
        parsed.data.rawTraits,
        refinedTraits,
        now,
        id
    );

    return res.json({
        id,
        name: parsed.data.name.toLowerCase(),
        role: parsed.data.role,
        rawTraits: parsed.data.rawTraits,
        refinedTraits,
        updatedAt: now,
    });
});

app.post('/api/characters', (req, res) => {
    const parsed = characterSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const normalizedName = parsed.data.name.toLowerCase();
    const refinedTraits = refineCharacterTraits(parsed.data.rawTraits);

    try {
        db.prepare(
            `INSERT INTO characters (id, name, role, raw_traits, refined_traits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, normalizedName, parsed.data.role, parsed.data.rawTraits, refinedTraits, now, now);

        return res.status(201).json({
            id,
            name: normalizedName,
            role: parsed.data.role,
            rawTraits: parsed.data.rawTraits,
            refinedTraits,
            createdAt: now,
            updatedAt: now,
        });
    } catch {
        return res.status(409).json({ error: 'Character name already exists' });
    }
});

app.post('/api/characters/:id/refine', (req, res) => {
    const row = db.prepare('SELECT id, raw_traits FROM characters WHERE id = ?').get(req.params.id) as { id: string; raw_traits: string } | undefined;
    if (!row) {
        return res.status(404).json({ error: 'Character not found' });
    }

    const refinedTraits = refineCharacterTraits(row.raw_traits);
    const updatedAt = new Date().toISOString();
    db.prepare('UPDATE characters SET refined_traits = ?, updated_at = ? WHERE id = ?').run(refinedTraits, updatedAt, row.id);

    return res.json({ id: row.id, refinedTraits, updatedAt });
});

app.post('/api/panels/generate', async (req, res) => {
  const parsed = storySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Stage 1: Refine the raw story into a detailed visual prompt
    const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const geminiResp = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: parsed.data.rawStoryInput }] }],
    });
    const refinedPrompt = geminiResp.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!refinedPrompt) {
      throw new Error('Gemini did not return a refined prompt');
    }

    // Stage 2: Generate the image from the refined prompt using Pollinations API
    const pollinationsApiKey = process.env.POLLINATIONS_API_KEY;
    if (!pollinationsApiKey) {
      throw new Error('POLLINATIONS_API_KEY is not set in environment variables');
    }

    const pollinationsResponse = await fetch('https://gen.pollinations.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pollinationsApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: refinedPrompt,
        model: 'gptimage',
        response_format: 'b64_json',
      }),
    });

    if (!pollinationsResponse.ok) {
      const errorText = await pollinationsResponse.text();
      throw new Error(`Pollinations API error: ${pollinationsResponse.status} ${errorText}`);
    }

    const pollinationsData = (await pollinationsResponse.json()) as {
      data: Array<{ b64_json: string }>;
    };

    const imageBase64 = pollinationsData.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error('Pollinations API failed to return base64 image data');
    }

    return res.status(200).json({ imageBase64 });
  } catch (err) {
    console.error('Panel generation error:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});


app.get('/api/jobs/:jobId', (req, res) => {
    const row = db
        .prepare(
            `SELECT j.id as job_id, j.status as job_status, j.error as job_error,
              p.id as panel_id, p.raw_story_input, p.merged_prompt, p.refined_prompt,
              p.generated_image_url, p.status as panel_status, p.error as panel_error
       FROM jobs j
       INNER JOIN panels p ON p.id = j.panel_id
       WHERE j.id = ?`
        )
        .get(req.params.jobId) as
        | {
            job_id: string;
            job_status: string;
            job_error: string | null;
            panel_id: string;
            raw_story_input: string;
            merged_prompt: string;
            refined_prompt: string;
            generated_image_url: string | null;
            panel_status: string;
            panel_error: string | null;
        }
        | undefined;

    if (!row) {
        return res.status(404).json({ error: 'Job not found' });
    }

    return res.json({
        job: {
            id: row.job_id,
            status: row.job_status,
            error: row.job_error,
        },
        panel: {
            id: row.panel_id,
            rawStoryInput: row.raw_story_input,
            mergedPrompt: row.merged_prompt,
            refinedPrompt: row.refined_prompt,
            generatedImageUrl: row.generated_image_url,
            status: row.panel_status,
            error: row.panel_error,
        },
    });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
