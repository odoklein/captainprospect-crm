/**
 * The agent's own tools, for the registry to list (integrator: spread
 * `AGENT_RUN_TOOLS` and `REPORTING_TOOLS` into ASSISTANT_TOOLS). This file
 * must not import the registry: the registry imports it.
 *
 * Until they are registered, the runtime cannot advertise the run-scoped
 * tools; the playbooks degrade (the report seeds its dataset as evidence, the
 * mission turns refused writes into proposals itself) and
 * lib/agent/tools/resolve.ts still resolves them for approvals.
 */

import type { AnyToolDefinition } from "@/lib/ai/tools/types";
import { getReportDataset } from "../reports/dataset-tool";
import { proposeAction } from "./propose_action";
import { recordFinding } from "./record_finding";

export const AGENT_RUN_TOOLS: AnyToolDefinition[] = [getReportDataset, proposeAction, recordFinding];

export { AGENT_RUN_PERMISSION, withRunTools, deriveRunContext, getRunScope, findRunScope } from "./with-run-tools";
export type { RunToolScope, ProposalInput, FindingInput } from "./with-run-tools";
