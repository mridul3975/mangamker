import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mangamaker.db');
export const db = new Database(dbPath);

export function initDb(): void {
    db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      raw_traits TEXT NOT NULL,
      refined_traits TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS panels (
      id TEXT PRIMARY KEY,
      raw_story_input TEXT NOT NULL,
      merged_prompt TEXT NOT NULL,
      refined_prompt TEXT NOT NULL,
      generated_image_url TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      panel_id TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_job_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(panel_id) REFERENCES panels(id)
    );
  `);
}
