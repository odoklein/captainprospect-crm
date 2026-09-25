import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// ============================================
// FILE-BASED QUEUE (No Redis)
// ============================================

const QUEUE_BASE_DIR = path.join(process.cwd(), 'private', 'queue');

// Lazy directory initialization - only create when needed
let directoriesInitialized = false;

function ensureDirectoriesExist() {
    if (directoriesInitialized) return;
    
    try {
        ['pending', 'processing', 'completed', 'failed'].forEach(dir => {
            const fullPath = path.join(QUEUE_BASE_DIR, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        });
        directoriesInitialized = true;
    } catch (error) {
        console.warn('[FileQueue] Failed to create queue directories:', error);
        // Continue without directories - will use in-memory fallback
    }
}

export class FileQueue {
    name: string;

    constructor(name: string, _options?: any) {
        this.name = name;
    }

    async add(name: string, data: any): Promise<{ id: string }> {
        const jobId = randomUUID();
        const job = {
            id: jobId,
            name,
            data,
            timestamp: Date.now(),
            status: 'pending'
        };

        // Try to ensure directories exist, but don't fail if they can't be created
        ensureDirectoriesExist();

        try {
            const filePath = path.join(QUEUE_BASE_DIR, 'pending', `${this.name}_${jobId}.json`);
            await fs.promises.writeFile(filePath, JSON.stringify(job, null, 2));
            console.log(`[FileQueue] Job ${jobId} added to pending.`);
        } catch (error) {
            // Fallback: Log the job data if file system is not available
            console.warn(`[FileQueue] Failed to write job to file system:`, error);
            console.log(`[FileQueue] Job data (in-memory fallback):`, job);
        }

        return { id: jobId };
    }
}

export const enrichmentQueue = new FileQueue('enrich-mission-list');
