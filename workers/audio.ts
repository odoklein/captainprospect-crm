import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { transcribeAudioFr } from '@/lib/ai/mistral-transcribe';
import { generateFicheFromTranscription } from '@/lib/ai/mistral-fiche';
import type { Prisma } from '@prisma/client';

const QUEUE_BASE_DIR = path.join(process.cwd(), 'private', 'queue');
const QUEUE_NAME = 'audio-processing';

async function processJob(jobFile: string) {
    const pendingPath = path.join(QUEUE_BASE_DIR, 'pending', jobFile);
    const processingPath = path.join(QUEUE_BASE_DIR, 'processing', jobFile);
    const completedPath = path.join(QUEUE_BASE_DIR, 'completed', jobFile);
    const failedPath = path.join(QUEUE_BASE_DIR, 'failed', jobFile);

    try {
        if (!fs.existsSync(pendingPath)) return;
        await fs.promises.rename(pendingPath, processingPath);

        const content = await fs.promises.readFile(processingPath, 'utf-8');
        const job = JSON.parse(content);
        const { actionId, recordingUrl, fileName, fileType } = job.data;

        console.log(`[Worker] Processing Job ${job.id} for action ${actionId}...`);

        // Fetch the file from the storage URL
        const response = await fetch(recordingUrl);
        if (!response.ok) {
            throw new Error(`Failed to download audio from ${recordingUrl}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`[Worker] Transcribing audio for action ${actionId}...`);
        const transcriptionResult = await transcribeAudioFr(buffer, fileName, fileType);
        
        if (!transcriptionResult.ok) {
            await prisma.action.update({
                where: { id: actionId },
                data: {
                    callEnrichmentAt: new Date(),
                    callEnrichmentError: `TRANSCRIPTION_FAILED: ${transcriptionResult.message}`,
                },
            });
            throw new Error(`Transcription failed: ${transcriptionResult.message}`);
        }

        const transcription = transcriptionResult.text;
        console.log(`[Worker] Generating Fiche RDV for action ${actionId}...`);
        const ficheResult = await generateFicheFromTranscription(transcription);

        await prisma.action.update({
            where: { id: actionId },
            data: {
                callTranscription: transcription,
                callEnrichmentAt: new Date(),
                callEnrichmentError: ficheResult.ok ? null : `FICHE_FAILED: ${ficheResult.message}`,
                ...(ficheResult.ok && {
                    rdvFiche: ficheResult.fiche as unknown as Prisma.InputJsonValue,
                    rdvFicheUpdatedAt: new Date(),
                }),
            },
        });

        await fs.promises.rename(processingPath, completedPath);
        console.log(`[Worker] Job ${job.id} completed successfully.`);
    } catch (err: any) {
        console.error(`[Worker] Failed to process job ${jobFile}:`, err);
        
        try {
            if (fs.existsSync(processingPath)) {
                await fs.promises.rename(processingPath, failedPath);
            }
        } catch (moveErr) {
            console.error(`[Worker] Failed to move job to failed directory:`, moveErr);
        }
    }
}

async function runWorker() {
    console.log('[Worker] Audio processing worker started. Watching for jobs...');
    
    // Ensure directories exist
    ['pending', 'processing', 'completed', 'failed'].forEach(dir => {
        const fullPath = path.join(QUEUE_BASE_DIR, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    });

    while (true) {
        try {
            const files = await fs.promises.readdir(path.join(QUEUE_BASE_DIR, 'pending'));
            const myJobs = files.filter(f => f.startsWith(QUEUE_NAME) && f.endsWith('.json'));

            if (myJobs.length > 0) {
                for (const file of myJobs) {
                    await processJob(file);
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (err) {
            console.error('[Worker] Poll error:', err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

if (require.main === module) {
    runWorker();
}
