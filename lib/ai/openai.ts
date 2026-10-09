/**
 * OpenAI API client with native tool calling support for low-cost models.
 * Defaults to `gpt-4o-mini` for lightning speed and minimal token expense.
 */

export const DEFAULT_LOW_COST_MODEL = "gpt-4o-mini";

export function getOpenAILowCostModel(): string {
    return process.env.OPENAI_ASSISTANT_MODEL || DEFAULT_LOW_COST_MODEL;
}

export interface OpenAIToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface OpenAIToolSpec {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export type OpenAIChatMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: OpenAIToolCall[];
      }
    | {
          role: "tool";
          tool_call_id: string;
          content: string;
      };

export interface OpenAIChatOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: OpenAIToolSpec[];
    toolChoice?: "auto" | "none" | "required";
}

export interface OpenAIChatResponse {
    message: {
        role: "assistant";
        content: string | null;
        tool_calls?: OpenAIToolCall[];
    };
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
}

export class OpenAIError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number = 500,
        public readonly userMessage: string = "Une erreur est survenue lors de l'appel à OpenAI."
    ) {
        super(message);
        this.name = "OpenAIError";
    }
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function openaiChat(
    apiKey: string,
    options: {
        messages: OpenAIChatMessage[];
        tools?: OpenAIToolSpec[];
        model?: string;
        temperature?: number;
        maxTokens?: number;
    }
): Promise<OpenAIChatResponse> {
    const model = options.model ?? getOpenAILowCostModel();

    const body: Record<string, unknown> = {
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1500,
    };

    if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = "auto";
    }

    let response: Response;
    try {
        response = await fetch(OPENAI_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        throw new OpenAIError(
            "NETWORK_ERROR",
            err instanceof Error ? err.message : "Network failure calling OpenAI",
            502,
            "Impossible de contacter le service d'intelligence artificielle. Vérifiez la connexion réseau."
        );
    }

    if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const rawMessage =
            (errorJson as { error?: { message?: string; code?: string } })?.error?.message ||
            response.statusText;
        const errCode = (errorJson as { error?: { code?: string } })?.error?.code || `HTTP_${response.status}`;

        if (response.status === 401) {
            throw new OpenAIError(
                "AUTH_ERROR",
                rawMessage,
                401,
                "Clé API OpenAI invalide ou expirée."
            );
        }
        if (response.status === 429) {
            throw new OpenAIError(
                "RATE_LIMITED",
                rawMessage,
                429,
                "Le quota OpenAI est dépassé ou la limite de requêtes par minute a été atteinte."
            );
        }

        throw new OpenAIError(
            errCode,
            `OpenAI API error (${response.status}): ${rawMessage}`,
            response.status,
            `Erreur OpenAI : ${rawMessage}`
        );
    }

    const data = (await response.json()) as {
        choices?: Array<{
            message?: {
                role?: string;
                content?: string | null;
                tool_calls?: OpenAIToolCall[];
            };
        }>;
        usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
        };
        model?: string;
    };

    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
        throw new OpenAIError(
            "EMPTY_RESPONSE",
            "OpenAI returned no choices in response",
            502,
            "L'assistant n'a renvoyé aucune réponse."
        );
    }

    return {
        message: {
            role: "assistant",
            content: choice.message.content ?? null,
            tool_calls: choice.message.tool_calls,
        },
        usage: data.usage
            ? {
                  promptTokens: data.usage.prompt_tokens ?? 0,
                  completionTokens: data.usage.completion_tokens ?? 0,
                  totalTokens: data.usage.total_tokens ?? 0,
              }
            : undefined,
        model: data.model ?? model,
    };
}

// Backwards compatibility for existing simple text completions
export interface OpenAIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface OpenAIChatResult {
    text: string;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    model?: string;
}

export async function openaiChatComplete(
    apiKey: string,
    messages: OpenAIMessage[],
    options: OpenAIChatOptions = {}
): Promise<OpenAIChatResult> {
    const res = await openaiChat(apiKey, {
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools: options.tools,
    });

    return {
        text: res.message.content || "",
        model: res.model,
        usage: res.usage,
    };
}
