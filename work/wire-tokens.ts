import { estimateWireTokens, slimToolSchema, toRawProviderTools } from "@/lib/ai/tools/registry";
import { toolGroupOf } from "@/lib/ai/tools/profiles";
import type { AssistantContext } from "@/lib/ai/tools/types";
const ctx: AssistantContext = { userId:"u", userName:"A", role:"MANAGER", isActive:true, permissions:[], project:null, resolvedAt:new Date(), autoWriteBudget:3, conversationId:null };
const rows = toRawProviderTools(ctx).map(t => ({name:t.name, group:toolGroupOf(t.name), wire:estimateWireTokens([slimToolSchema(t,ctx)])})).sort((a,b)=>b.wire-a.wire);
console.log(rows.slice(0,20).map(r=>`${r.name}\t${r.group}\t${r.wire}`).join("\n"));
const mem = rows.filter(r=>r.group==="core" && ["remember","update_memory","forget","list_memories","load_tool_group"].includes(r.name));
console.log("memory+loader:", mem.reduce((s,r)=>s+r.wire,0), mem.map(r=>r.name+":"+r.wire).join(" "));
console.log("total", rows.reduce((s,r)=>s+r.wire,0));
