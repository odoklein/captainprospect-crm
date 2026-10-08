// ============================================
// COMMS AI SERVICE
// AI-powered features: summarization, suggestions
// ============================================

import { prisma } from "@/lib/prisma";

// ============================================
// TYPES
// ============================================

export interface ThreadSummary {
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    participants: { name: string; messageCount: number }[];
    sentiment: "positive" | "neutral" | "negative";
}

export interface MessageSuggestion {
    content: string;
    type: "quick_reply" | "follow_up" | "clarification";
    confidence: number;
}

// ============================================
// THREAD SUMMARIZATION
// ============================================

/**
 * Generate a summary of a thread's conversation.
 * Uses OpenAI API if available, otherwise falls back to extractive summary.
 */
export async function summarizeThread(threadId: string): Promise<ThreadSummary> {
    // Fetch thread with messages
    const thread = await prisma.commsThread.findUnique({
        where: { id: threadId },
        include: {
            messages: {
                where: { isDeleted: false },
                orderBy: { createdAt: "asc" },
                include: {
                    author: { select: { id: true, name: true } },
                },
            },
            participants: {
                include: {
                    user: { select: { id: true, name: true } },
                },
            },
        },
    });

    if (!thread || thread.messages.length === 0) {
        return {
            summary: "Aucun message dans cette conversation.",
            keyPoints: [],
            actionItems: [],
            participants: [],
            sentiment: "neutral",
        };
    }

    // Calculate participant stats
    const participantStats = new Map<string, { name: string; count: number }>();
    for (const msg of thread.messages) {
        const existing = participantStats.get(msg.author.id);
        if (existing) {
            existing.count++;
        } else {
            participantStats.set(msg.author.id, { name: msg.author.name, count: 1 });
        }
    }

    const participants = Array.from(participantStats.values())
        .map((p) => ({ name: p.name, messageCount: p.count }))
        .sort((a, b) => b.messageCount - a.messageCount);

    // Check for OpenAI API key
    const openaiKey = process.env.OPENAI_API_KEY;

    if (openaiKey) {
        try {
            return await generateAISummary(thread.messages, participants, openaiKey);
        } catch (error) {
            console.error("AI summarization failed, using fallback:", error);
        }
    }

    // Fallback: extractive summary
    return generateExtractriveSummary(thread.messages, participants);
}

/**
 * Generate AI-powered summary using OpenAI
 */
async function generateAISummary(
    messages: Array<{
        content: string;
        author: { name: string };
        createdAt: Date;
    }>,
    participants: { name: string; messageCount: number }[],
    apiKey: string
): Promise<ThreadSummary> {
    const conversation = messages
        .map((m) => `${m.author.name}: ${m.content}`)
        .join("\n");

    const prompt = `Analyze this conversation and provide a JSON response with:
1. "summary": A concise 2-3 sentence summary in French
2. "keyPoints": Array of 3-5 key discussion points in French
3. "actionItems": Array of action items mentioned (if any) in French
4. "sentiment": Overall sentiment ("positive", "neutral", or "negative")

Conversation:
${conversation.slice(0, 4000)}

Respond only with valid JSON.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that summarizes conversations. Always respond in French and return valid JSON only.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    try {
        const parsed = JSON.parse(content);
        return {
            summary: parsed.summary || "Résumé non disponible.",
            keyPoints: parsed.keyPoints || [],
            actionItems: parsed.actionItems || [],
            participants,
            sentiment: parsed.sentiment || "neutral",
        };
    } catch {
        throw new Error("Failed to parse AI response");
    }
}

/**
 * Fallback extractive summary without AI
 */
function generateExtractriveSummary(
    messages: Array<{
        content: string;
        author: { name: string };
        createdAt: Date;
    }>,
    participants: { name: string; messageCount: number }[]
): ThreadSummary {
    const totalMessages = messages.length;
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];

    // Extract first sentence of first message as summary base
    const firstSentence = firstMessage.content.split(/[.!?]/)[0].trim();
    const summary =
        totalMessages === 1
            ? `${firstMessage.author.name} a écrit: "${firstSentence.slice(0, 100)}${firstSentence.length > 100 ? "..." : ""}"`
            : `Conversation de ${totalMessages} messages entre ${participants.map((p) => p.name).join(", ")}. Commencée par ${firstMessage.author.name}.`;

    // Extract key points from longer messages
    const keyPoints: string[] = [];
    const significantMessages = messages
        .filter((m) => m.content.length > 50)
        .slice(0, 5);

    for (const msg of significantMessages) {
        const point = msg.content.slice(0, 80).trim();
        if (point) keyPoints.push(`${msg.author.name}: "${point}..."`);
    }

    // Look for action items (simple heuristic)
    const actionItems: string[] = [];
    const actionKeywords = [
        "faire",
        "envoyer",
        "appeler",
        "préparer",
        "créer",
        "planifier",
        "confirmer",
        "vérifier",
    ];

    for (const msg of messages) {
        const lower = msg.content.toLowerCase();
        for (const keyword of actionKeywords) {
            if (lower.includes(keyword)) {
                const excerpt = msg.content.slice(0, 100);
                if (!actionItems.includes(excerpt)) {
                    actionItems.push(excerpt);
                }
                break;
            }
        }
        if (actionItems.length >= 3) break;
    }

    return {
        summary,
        keyPoints: keyPoints.slice(0, 5),
        actionItems: actionItems.slice(0, 3),
        participants,
        sentiment: "neutral",
    };
}

// ============================================
// MESSAGE SUGGESTIONS
// ============================================

const MISTRAL_API_URL = "https://api.openai.com/v1/chat/completions";
const MISTRAL_MODEL = "gpt-4o-mini";

/**
 * Generate reply suggestions based on thread context.
 * Sends the last 10 messages to OpenAI and returns contextual reply suggestions.
 */
export async function generateMessageSuggestions(
    threadId: string,
    userId: string
): Promise<MessageSuggestion[]> {
    // Fetch last 10 messages (newest first, then reverse for chronological order)
    const messages = await prisma.commsMessage.findMany({
        where: { threadId, isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
            author: { select: { id: true, name: true } },
        },
    });

    if (messages.length === 0) {
        return [];
    }

    const chronological = [...messages].reverse();
    const lastMessage = messages[0];

    // Don't suggest replies to own messages
    if (lastMessage.authorId === userId) {
        return [];
    }

    const mistralKey = process.env.OPENAI_API_KEY;
    if (mistralKey) {
        try {
            return await generateMistralSuggestions(chronological, mistralKey);
        } catch (error) {
            console.error("Mistral suggestions failed, trying fallback:", error);
        }
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        try {
            return await generateAISuggestions(chronological, openaiKey);
        } catch (error) {
            console.error("AI suggestions failed, using fallback:", error);
        }
    }

    // Fallback: simple quick replies
    return generateQuickReplies(lastMessage.content);
}

/**
 * Generate reply suggestions using OpenAI API with last 10 messages context.
 */
async function generateMistralSuggestions(
    messages: Array<{ content: string; author: { name: string } }>,
    apiKey: string
): Promise<MessageSuggestion[]> {
    const conversation = messages
        .map((m) => `${m.author.name}: ${m.content}`)
        .join("\n");

    const prompt = `Voici les 10 derniers messages d'une conversation (du plus ancien au plus récent).
Génère 3 suggestions de réponses courtes et pertinentes en français, adaptées au contexte.

Conversation:
${conversation.slice(0, 6000)}

Réponds UNIQUEMENT avec un JSON valide, tableau d'objets avec "content" (texte de la suggestion) et "type" ("quick_reply", "follow_up" ou "clarification"):
[{"content": "...", "type": "quick_reply"}, ...]`;

    const response = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [
                {
                    role: "system",
                    content: "Tu es un assistant qui propose des réponses courtes et professionnelles pour des messages internes. Réponds uniquement en JSON valide (tableau d'objets).",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.6,
            max_tokens: 400,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || `Mistral API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "[]";

    const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    try {
        const parsed = JSON.parse(cleaned);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr.slice(0, 5).map((s: { content?: string; type?: string }) => ({
            content: s.content || "",
            type: (s.type === "follow_up" || s.type === "clarification" ? s.type : "quick_reply") as MessageSuggestion["type"],
            confidence: 0.85,
        }));
    } catch {
        return [];
    }
}

/**
 * Generate AI-powered suggestions (OpenAI) using last 10 messages context.
 */
async function generateAISuggestions(
    messages: Array<{
        content: string;
        author: { name: string };
    }>,
    apiKey: string
): Promise<MessageSuggestion[]> {
    const conversation = messages
        .slice(-10)
        .map((m) => `${m.author.name}: ${m.content}`)
        .join("\n");

    const prompt = `Based on this conversation, suggest 3 possible replies in French.
Return a JSON array with objects containing "content" (the reply text) and "type" (one of: "quick_reply", "follow_up", "clarification").

Conversation:
${conversation}

Respond only with valid JSON array.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that suggests message replies. Always respond in French and return valid JSON array only.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 300,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    try {
        const parsed = JSON.parse(content);
        return parsed.map((s: { content: string; type: string }) => ({
            content: s.content,
            type: s.type || "quick_reply",
            confidence: 0.8,
        }));
    } catch {
        return [];
    }
}

/**
 * Simple fallback quick replies
 */
function generateQuickReplies(lastMessageContent: string): MessageSuggestion[] {
    const lower = lastMessageContent.toLowerCase();

    // Question detection
    if (lower.includes("?")) {
        return [
            { content: "Oui, c'est correct.", type: "quick_reply", confidence: 0.6 },
            { content: "Non, pas encore.", type: "quick_reply", confidence: 0.6 },
            { content: "Je vérifie et je reviens vers vous.", type: "follow_up", confidence: 0.7 },
        ];
    }

    // Meeting/call related
    if (lower.includes("réunion") || lower.includes("appel") || lower.includes("rdv")) {
        return [
            { content: "C'est noté, merci !", type: "quick_reply", confidence: 0.7 },
            { content: "Je confirme ma disponibilité.", type: "quick_reply", confidence: 0.7 },
            { content: "Pouvez-vous proposer un autre créneau ?", type: "clarification", confidence: 0.6 },
        ];
    }

    // Gratitude
    if (lower.includes("merci")) {
        return [
            { content: "De rien !", type: "quick_reply", confidence: 0.8 },
            { content: "Avec plaisir !", type: "quick_reply", confidence: 0.8 },
        ];
    }

    // Default suggestions
    return [
        { content: "Merci pour l'info !", type: "quick_reply", confidence: 0.5 },
        { content: "Bien reçu, je m'en occupe.", type: "quick_reply", confidence: 0.5 },
        { content: "Pouvez-vous préciser ?", type: "clarification", confidence: 0.5 },
    ];
}
