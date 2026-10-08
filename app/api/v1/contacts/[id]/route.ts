import { v1Route } from "@/lib/api-v1/handler";
import { getContact } from "@/lib/api-v1/services/contacts";

export const dynamic = "force-dynamic";

export const GET = v1Route("contacts:read", (ctx, { params }) => getContact(ctx, params.id));
