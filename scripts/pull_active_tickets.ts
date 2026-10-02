import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    const { data: users } = await supabase.from("User").select("id, name, email");
    const userMap = new Map((users || []).map(u => [u.id, u.name || u.email]));

    const { data: tickets } = await supabase
        .from("Ticket")
        .select("*")
        .neq("status", "COMPLETED")
        .order("priority", { ascending: false })
        .order("createdAt", { ascending: false });

    console.log(`TOTAL ACTIVE TICKETS: ${tickets?.length || 0}`);
    for (const t of tickets || []) {
        console.log(`[${t.status}] [${t.priority}] #TC-${String(t.number).padStart(4, "0")} | ${t.title} | Req: ${userMap.get(t.requesterId)} | Ass: ${userMap.get(t.assigneeId) || 'Non assigné'} | Category: ${t.category} | Created: ${t.createdAt.slice(0, 10)}`);
        console.log(`   Desc: ${t.description?.replace(/\n+/g, ' ').slice(0, 150)}`);
    }
}

main().catch(console.error);
