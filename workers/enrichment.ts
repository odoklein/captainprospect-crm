import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { bulkEnrichCompanies, ExploriumSearchFilters } from '@/lib/explorium';
import { isSuspendedInstance } from '@/lib/license/server';
import { ListType } from '@prisma/client';

// ============================================
// CONFIG
// ============================================

const QUEUE_BASE_DIR = path.join(process.cwd(), 'private', 'queue');
const QUEUE_NAME = 'enrich-mission-list';

// ============================================
// WORKER PROCESSOR (File Based)
// ============================================

async function processJob(jobFile: string) {
    const pendingPath = path.join(QUEUE_BASE_DIR, 'pending', jobFile);
    const processingPath = path.join(QUEUE_BASE_DIR, 'processing', jobFile);
    const completedPath = path.join(QUEUE_BASE_DIR, 'completed', jobFile);
    const failedPath = path.join(QUEUE_BASE_DIR, 'failed', jobFile);

    try {
        // 1. Move to Processing
        if (!fs.existsSync(pendingPath)) return; // Already taken
        await fs.promises.rename(pendingPath, processingPath);

        const content = await fs.promises.readFile(processingPath, 'utf-8');
        const job = JSON.parse(content);
        const { missionId, filters } = job.data;

        console.log(`[Worker] Processing Job ${job.id} for mission ${missionId}...`);
        console.log(`[Worker] Filters:`, JSON.stringify(filters, null, 2));

        // Get mission details for better list naming
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { name: true }
        });

        const missionName = mission?.name || 'Mission';
        const listName = `${missionName} - Explorium (${new Date().toLocaleDateString('fr-FR')})`;

        // 2. Perform Task (Enrichment) - Fetch companies from Explorium
        console.log(`[Worker] Fetching companies from Explorium...`);
        const enrichedCompanies = await bulkEnrichCompanies(filters);
        console.log(`[Worker] Found ${enrichedCompanies.length} companies from Explorium.`);

        if (enrichedCompanies.length === 0) {
            console.warn(`[Worker] No companies found for filters. Creating empty list.`);
        }

        // 3. Create List
        const list = await prisma.list.create({
            data: {
                missionId,
                name: listName,
                type: ListType.SUZALI, // Use SUZALI for Explorium-sourced lists
                source: "EXPLORIUM"
            }
        });

        console.log(`[Worker] Created list: ${list.id} - ${listName}`);

        // 4. Add companies to the list
        let companiesAdded = 0;
        let companiesSkipped = 0;
        const errors: string[] = [];

        for (const companyData of enrichedCompanies) {
            try {
                // Validate required fields
                if (!companyData.name || companyData.name.trim() === '') {
                    companiesSkipped++;
                    continue;
                }

                // Check for duplicates
                const existing = await prisma.company.findFirst({
                    where: {
                        name: companyData.name,
                        listId: list.id,
                    },
                });

                if (existing) {
                    companiesSkipped++;
                    continue;
                }

                // Determine status based on available data
                const hasWebsite = companyData.website && companyData.website.trim() !== '';
                const status = hasWebsite ? 'ACTIONABLE' : 'INCOMPLETE';

                // Create company
                await prisma.company.create({
                    data: {
                        listId: list.id,
                        name: companyData.name.trim(),
                        industry: companyData.industry || null,
                        size: companyData.size || null,
                        website: companyData.website || null,
                        country: companyData.headquarters || null,
                        status: status,
                        // Create a placeholder contact for each company
                        contacts: {
                            create: {
                                lastName: "À compléter",
                                title: "Prospect",
                                status: "INCOMPLETE"
                            }
                        }
                    }
                });
                companiesAdded++;
            } catch (err: any) {
                const errorMsg = `Failed to add company ${companyData.name}: ${err.message}`;
                console.error(`[Worker] ${errorMsg}`);
                errors.push(errorMsg);
            }
        }

        console.log(`[Worker] Finished. Added ${companiesAdded} companies, skipped ${companiesSkipped} duplicates/invalid.`);

        if (errors.length > 0) {
            console.warn(`[Worker] Encountered ${errors.length} errors during processing.`);
        }

        // 5. Move to Completed
        await fs.promises.rename(processingPath, completedPath);
        console.log(`[Worker] Job ${job.id} completed successfully.`);

    } catch (err: any) {
        console.error(`[Worker] Failed to process job ${jobFile}:`, err);
        console.error(`[Worker] Error details:`, err.stack);
        
        // Move to Failed
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
    console.log('[Worker] File-based worker started. Watching for jobs...');

    while (true) {
        try {
            // Suspended by the Console: read-only, jobs wait in "pending" until it is reactivated.
            if (await isSuspendedInstance()) {
                await new Promise(resolve => setTimeout(resolve, 30_000));
                continue;
            }
            const files = await fs.promises.readdir(path.join(QUEUE_BASE_DIR, 'pending'));

            // Filter only jobs for this queue
            const myJobs = files.filter(f => f.startsWith(QUEUE_NAME) && f.endsWith('.json'));

            if (myJobs.length > 0) {
                // Process one by one
                for (const file of myJobs) {
                    await processJob(file);
                }
            } else {
                // Wait before polling again
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (err) {
            console.error('[Worker] Poll error:', err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Auto-start
if (require.main === module) {
    runWorker();
}
