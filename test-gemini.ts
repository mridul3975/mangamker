// test-gemini.ts
// Using Bun's built‑in fetch – no external library needed
import { fetch as bunFetch } from 'bun';

async function runTest() {
  console.log('🚀 Starting Gemini panel generation test');
  const payload = {
    rawStoryInput:
      'A hero enters a bustling night market in Seoul, neon lights reflect on wet streets, vivid colors, dynamic lighting.',
  };

  try {
    const response = await bunFetch('http://localhost:4000/api/panels/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('🔧 Response status:', response.status);
    const json = await response.json();

    if (response.ok && json.imageBase64) {
      console.log('✅ Image generated successfully!');
      // Optionally write the image to a file for inspection:
      // const buffer = Buffer.from(json.imageBase64, 'base64');
      // require('fs').writeFileSync('generated.jpg', buffer);
    } else {
      console.error('❌ Generation failed:', json.error ?? 'unknown error');
    }
  } catch (err) {
    console.error('❌ Request error:', (err as Error).message);
  }
}

runTest();
