import fs from 'fs';
import { createWorker } from 'tesseract.js';

async function ocr() {
  const worker = await createWorker('ara');
  const ret1 = await worker.recognize('C:/Users/ACER/.gemini/antigravity/brain/072369c3-be11-47ad-9973-74c97e3d4f4b/.user_uploaded/media_1791504267026_2aa3c396.png');
  console.log('--- Image 2 ---');
  console.log(ret1.data.text.substring(0, 500));
  await worker.terminate();
}

ocr();
