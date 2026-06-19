import { enrichActionFromCallProvider, type EnrichActionOptions } from "./enrich-action";

type EnrichmentJob = {
  actionId: string;
  options?: EnrichActionOptions;
  resolve: () => void;
};

const MAX_AUTO_ENRICHMENT_CONCURRENCY = Math.min(
  3,
  Math.max(1, parseInt(process.env.CALL_ENRICHMENT_AUTO_CONCURRENCY ?? "1", 10) || 1),
);

let activeJobs = 0;
const queue: EnrichmentJob[] = [];

function runNext() {
  while (activeJobs < MAX_AUTO_ENRICHMENT_CONCURRENCY) {
    const job = queue.shift();
    if (!job) return;

    activeJobs += 1;
    enrichActionFromCallProvider(job.actionId, job.options)
      .catch((err) => {
        console.error("[call-enrichment]", job.actionId, err);
      })
      .finally(() => {
        activeJobs -= 1;
        job.resolve();
        runNext();
      });
  }
}

export function enqueueActionCallEnrichment(actionId: string, options?: EnrichActionOptions): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ actionId, options, resolve });
    runNext();
  });
}
