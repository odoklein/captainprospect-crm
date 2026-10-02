import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log("=== PULLING SUPPORT TICKETS FROM SUPABASE ===");

    // 1. Fetch Users
    const { data: users } = await supabase.from("User").select("id, name, email, role");
    const userMap = new Map((users || []).map(u => [u.id, u]));

    // 2. Fetch Clients & Missions
    const { data: clients } = await supabase.from("Client").select("id, name");
    const clientMap = new Map((clients || []).map(c => [c.id, c.name]));

    const { data: missions } = await supabase.from("Mission").select("id, name");
    const missionMap = new Map((missions || []).map(m => [m.id, m.name]));

    // 3. Fetch Tickets (excluding COMPLETED)
    const { data: tickets, error: ticketErr } = await supabase
        .from("Ticket")
        .select(`
            id,
            number,
            title,
            description,
            category,
            scope,
            priority,
            status,
            validation,
            clientId,
            missionId,
            requesterId,
            assigneeId,
            dueDate,
            completedAt,
            createdAt,
            updatedAt
        `)
        .neq("status", "COMPLETED")
        .order("priority", { ascending: false })
        .order("createdAt", { ascending: false });

    if (ticketErr) {
        console.error("Error fetching tickets:", ticketErr);
    } else {
        console.log(`Found ${tickets?.length || 0} non-completed tickets in Ticket table.`);
    }

    // 4. Also fetch active SupportConversations (client portal support)
    const { data: supportConvs, error: convErr } = await supabase
        .from("SupportConversation")
        .select(`
            id,
            subject,
            status,
            clientId,
            createdById,
            messageCount,
            lastMessageAt,
            createdAt,
            updatedAt
        `)
        .neq("status", "RESOLVED")
        .neq("status", "CLOSED");

    if (convErr) {
        console.error("Error fetching support conversations:", convErr);
    } else {
        console.log(`Found ${supportConvs?.length || 0} active support conversations.`);
    }

    console.log("\n=== DETAILED TICKETS DUMP ===");
    for (const t of tickets || []) {
        console.log(JSON.stringify({
            number: `#TC-${String(t.number).padStart(4, "0")}`,
            title: t.title,
            status: t.status,
            priority: t.priority,
            category: t.category,
            scope: t.scope,
            validation: t.validation,
            client: t.clientId ? clientMap.get(t.clientId) : null,
            mission: t.missionId ? missionMap.get(t.missionId) : null,
            requester: userMap.get(t.requesterId)?.name || userMap.get(t.requesterId)?.email,
            assignee: t.assigneeId ? (userMap.get(t.assigneeId)?.name || userMap.get(t.assigneeId)?.email) : "Unassigned",
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            description: t.description?.slice(0, 200)
        }, null, 2));
    }

    if ((supportConvs || []).length > 0) {
        console.log("\n=== ACTIVE CLIENT SUPPORT CONVERSATIONS ===");
        for (const c of supportConvs || []) {
            console.log(JSON.stringify({
                id: c.id,
                subject: c.subject,
                status: c.status,
                client: clientMap.get(c.clientId),
                creator: userMap.get(c.createdById)?.name || userMap.get(c.createdById)?.email,
                lastMessageAt: c.lastMessageAt,
                messageCount: c.messageCount
            }, null, 2));
        }
    }
}

main().catch(console.error);
