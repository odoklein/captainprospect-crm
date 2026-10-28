// ============================================
// EMAIL AI SERVICE
// AI-powered email analysis and suggestions
// ============================================

import { prisma } from '@/lib/prisma';
import { integrationKey } from "@/lib/integrations/keys";

// ============================================
// TYPES
// ============================================

export interface SentimentAnalysis {
    sentiment: 'positive' | 'neutral' | 'negative';
    confidence: number;
    signals: string[];
}

export interface PriorityClassification {
    priority: 'urgent' | 'high' | 'medium' | 'low';
    confidence: number;
    reasons: string[];
}

export interface ThreadSummary {
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    nextSteps?: string;
}

export interface ReplySuggestion {
    type: 'positive' | 'neutral' | 'decline' | 'follow_up' | 'schedule';
    subject?: string;
    body: string;
    confidence: number;
}

export interface EmailRiskAssessment {
    spamRisk: number;
    deliverabilityScore: number;
    issues: string[];
    suggestions: string[];
}

// ============================================
// AI SERVICE CLASS
// ============================================

export class EmailAIService {
    private model: string = 'gpt-4o';

    // Read on each call: the key can be changed from Paramètres without a restart.
    private get openaiApiKey(): string | undefined {
        return integrationKey("OPENAI_API_KEY");
    }

    // ============================================
    // CHECK IF AI IS AVAILABLE
    // ============================================

    isAvailable(): boolean {
        return !!this.openaiApiKey;
    }

    // ============================================
    // SENTIMENT ANALYSIS
    // ============================================

    async analyzeSentiment(text: string): Promise<SentimentAnalysis> {
        if (!this.isAvailable()) {
            // Fallback to simple keyword analysis
            return this.simpleSentimentAnalysis(text);
        }

        try {
            const response = await this.callOpenAI({
                messages: [
                    {
                        role: 'system',
                        content: `You are an email sentiment analyzer. Analyze the sentiment of email text and respond in JSON format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0-1.0,
  "signals": ["signal1", "signal2"]
}

Be concise with signals (max 3).`,
                    },
                    {
                        role: 'user',
                        content: text.substring(0, 2000),
                    },
                ],
            });

            return JSON.parse(response);
        } catch (error) {
            console.error('Sentiment analysis error:', error);
            return this.simpleSentimentAnalysis(text);
        }
    }

    private simpleSentimentAnalysis(text: string): SentimentAnalysis {
        const lowerText = text.toLowerCase();
        const positiveWords = ['thank', 'great', 'excellent', 'happy', 'pleased', 'merci', 'parfait', 'excellent'];
        const negativeWords = ['disappointed', 'issue', 'problem', 'frustrated', 'urgent', 'déçu', 'problème', 'urgent'];

        let positiveScore = 0;
        let negativeScore = 0;
        const signals: string[] = [];

        for (const word of positiveWords) {
            if (lowerText.includes(word)) {
                positiveScore++;
                signals.push(`Contains "${word}"`);
            }
        }
        for (const word of negativeWords) {
            if (lowerText.includes(word)) {
                negativeScore++;
                signals.push(`Contains "${word}"`);
            }
        }

        let sentiment: 'positive' | 'neutral' | 'negative';
        if (positiveScore > negativeScore) {
            sentiment = 'positive';
        } else if (negativeScore > positiveScore) {
            sentiment = 'negative';
        } else {
            sentiment = 'neutral';
        }

        return {
            sentiment,
            confidence: Math.min(0.8, (positiveScore + negativeScore) * 0.2 + 0.3),
            signals: signals.slice(0, 3),
        };
    }

    // ============================================
    // PRIORITY CLASSIFICATION
    // ============================================

    async classifyPriority(text: string, metadata?: {
        senderDomain?: string;
        hasAttachments?: boolean;
        isReply?: boolean;
    }): Promise<PriorityClassification> {
        if (!this.isAvailable()) {
            return this.simplePriorityClassification(text, metadata);
        }

        try {
            const context = metadata ? `
Sender domain: ${metadata.senderDomain || 'unknown'}
Has attachments: ${metadata.hasAttachments ? 'yes' : 'no'}
Is reply: ${metadata.isReply ? 'yes' : 'no'}
` : '';

            const response = await this.callOpenAI({
                messages: [
                    {
                        role: 'system',
                        content: `You are an email priority classifier for a B2B sales/CRM context. Analyze the email and respond in JSON:
{
  "priority": "urgent" | "high" | "medium" | "low",
  "confidence": 0.0-1.0,
  "reasons": ["reason1", "reason2"]
}

Priority levels:
- urgent: Immediate action required, deadline today, critical issue
- high: Important client request, time-sensitive opportunity
- medium: Standard business communication requiring response
- low: FYI, newsletters, non-actionable`,
                    },
                    {
                        role: 'user',
                        content: `${context}\nEmail content:\n${text.substring(0, 2000)}`,
                    },
                ],
            });

            return JSON.parse(response);
        } catch (error) {
            console.error('Priority classification error:', error);
            return this.simplePriorityClassification(text, metadata);
        }
    }

    private simplePriorityClassification(text: string, metadata?: {
        senderDomain?: string;
        hasAttachments?: boolean;
        isReply?: boolean;
    }): PriorityClassification {
        const lowerText = text.toLowerCase();
        const urgentKeywords = ['urgent', 'asap', 'immediately', 'deadline today', 'critical', 'urgence'];
        const highKeywords = ['important', 'priority', 'decision', 'proposal', 'contract', 'meeting tomorrow'];
        
        const reasons: string[] = [];
        let priority: PriorityClassification['priority'] = 'medium';

        for (const keyword of urgentKeywords) {
            if (lowerText.includes(keyword)) {
                priority = 'urgent';
                reasons.push(`Contains urgent keyword: "${keyword}"`);
                break;
            }
        }

        if (priority !== 'urgent') {
            for (const keyword of highKeywords) {
                if (lowerText.includes(keyword)) {
                    priority = 'high';
                    reasons.push(`Contains high-priority keyword: "${keyword}"`);
                    break;
                }
            }
        }

        if (metadata?.isReply) {
            reasons.push('Is a reply (conversation continuation)');
        }
        if (metadata?.hasAttachments) {
            reasons.push('Has attachments');
        }

        return {
            priority,
            confidence: 0.6,
            reasons: reasons.slice(0, 3),
        };
    }

    // ============================================
    // THREAD SUMMARIZATION
    // ============================================

    async summarizeThread(emails: {
        from: string;
        to: string[];
        body: string;
        date: Date;
    }[]): Promise<ThreadSummary> {
        if (!this.isAvailable()) {
            return this.simpleThreadSummary(emails);
        }

        try {
            const emailsText = emails
                .map((e, i) => `[${i + 1}] From: ${e.from}\nTo: ${e.to.join(', ')}\nDate: ${e.date.toISOString()}\n${e.body.substring(0, 500)}`)
                .join('\n---\n');

            const response = await this.callOpenAI({
                messages: [
                    {
                        role: 'system',
                        content: `You are an email thread summarizer. Summarize the conversation and respond in JSON:
{
  "summary": "Brief 1-2 sentence summary",
  "keyPoints": ["point1", "point2", "point3"],
  "actionItems": ["action1", "action2"],
  "nextSteps": "Suggested next step if applicable"
}

Be concise and focus on business-relevant information.`,
                    },
                    {
                        role: 'user',
                        content: emailsText.substring(0, 4000),
                    },
                ],
            });

            return JSON.parse(response);
        } catch (error) {
            console.error('Thread summarization error:', error);
            return this.simpleThreadSummary(emails);
        }
    }

    private simpleThreadSummary(emails: {
        from: string;
        to: string[];
        body: string;
        date: Date;
    }[]): ThreadSummary {
        const lastEmail = emails[emails.length - 1];
        const firstEmail = emails[0];
        
        return {
            summary: `Conversation with ${emails.length} messages between ${firstEmail.from} and ${firstEmail.to[0]}.`,
            keyPoints: [
                `Started on ${firstEmail.date.toLocaleDateString()}`,
                `Most recent message from ${lastEmail.from}`,
            ],
            actionItems: [],
            nextSteps: 'Review latest message and respond if needed.',
        };
    }

    // ============================================
    // REPLY SUGGESTIONS
    // ============================================

    async generateReplySuggestions(
        email: { from: string; subject: string; body: string },
        context?: { senderName?: string; companyName?: string }
    ): Promise<ReplySuggestion[]> {
        if (!this.isAvailable()) {
            return this.simpleReplySuggestions(email, context);
        }

        try {
            const response = await this.callOpenAI({
                messages: [
                    {
                        role: 'system',
                        content: `You are an email reply assistant for a B2B context. Generate 3 reply suggestions in JSON array format:
[
  {
    "type": "positive" | "neutral" | "decline" | "follow_up" | "schedule",
    "subject": "Re: ...",
    "body": "Reply text in French",
    "confidence": 0.0-1.0
  }
]

Keep replies professional, concise, and in French. Include greeting and signature placeholder.`,
                    },
                    {
                        role: 'user',
                        content: `From: ${email.from}
Subject: ${email.subject}
${context?.senderName ? `Sender name: ${context.senderName}` : ''}
${context?.companyName ? `Company: ${context.companyName}` : ''}

Email content:
${email.body.substring(0, 1500)}`,
                    },
                ],
            });

            return JSON.parse(response);
        } catch (error) {
            console.error('Reply suggestions error:', error);
            return this.simpleReplySuggestions(email, context);
        }
    }

    private simpleReplySuggestions(
        email: { from: string; subject: string; body: string },
        context?: { senderName?: string; companyName?: string }
    ): ReplySuggestion[] {
        const greeting = context?.senderName 
            ? `Bonjour ${context.senderName},` 
            : 'Bonjour,';

        return [
            {
                type: 'positive',
                subject: `Re: ${email.subject}`,
                body: `${greeting}\n\nMerci pour votre message. Je reviens vers vous très rapidement.\n\nCordialement,`,
                confidence: 0.7,
            },
            {
                type: 'follow_up',
                subject: `Re: ${email.subject}`,
                body: `${greeting}\n\nSuite à votre message, seriez-vous disponible pour en discuter lors d'un appel rapide ?\n\nCordialement,`,
                confidence: 0.6,
            },
            {
                type: 'schedule',
                subject: `Re: ${email.subject}`,
                body: `${greeting}\n\nMerci pour votre intérêt. Voici mes disponibilités pour un échange :\n- [Date 1]\n- [Date 2]\n\nCordialement,`,
                confidence: 0.5,
            },
        ];
    }

    // ============================================
    // SPAM/DELIVERABILITY RISK ASSESSMENT
    // ============================================

    async assessEmailRisk(email: {
        subject: string;
        body: string;
        hasLinks?: boolean;
        hasImages?: boolean;
        attachmentTypes?: string[];
    }): Promise<EmailRiskAssessment> {
        const issues: string[] = [];
        const suggestions: string[] = [];
        let spamRisk = 0;
        let deliverabilityScore = 100;

        // Check subject
        const subject = email.subject.toLowerCase();
        if (subject.includes('free') || subject.includes('gratuit')) {
            issues.push('Subject contains spam trigger word');
            spamRisk += 15;
            suggestions.push('Avoid using "free" or "gratuit" in subject');
        }
        if (/!{2,}/.test(email.subject) || /\${2,}/.test(email.subject)) {
            issues.push('Subject contains excessive punctuation');
            spamRisk += 10;
            suggestions.push('Reduce exclamation marks and special characters');
        }
        if (email.subject === email.subject.toUpperCase() && email.subject.length > 10) {
            issues.push('Subject is all caps');
            spamRisk += 20;
            suggestions.push('Use normal capitalization in subject');
        }

        // Check body
        const body = email.body.toLowerCase();
        const spamWords = ['click here', 'buy now', 'limited time', 'act now', 'free offer', 'cliquez ici', 'achetez maintenant'];
        for (const word of spamWords) {
            if (body.includes(word)) {
                issues.push(`Body contains spam phrase: "${word}"`);
                spamRisk += 10;
            }
        }

        // Check links
        const linkCount = (email.body.match(/https?:\/\//g) || []).length;
        if (linkCount > 5) {
            issues.push('Too many links in email');
            spamRisk += 15;
            suggestions.push('Reduce number of links to 3-5 maximum');
        }

        // Check images
        if (email.hasImages) {
            const imageRatio = email.body.length < 500 ? 'high' : 'normal';
            if (imageRatio === 'high') {
                issues.push('Low text-to-image ratio');
                spamRisk += 10;
                suggestions.push('Add more text content to balance images');
            }
        }

        // Check attachments
        if (email.attachmentTypes?.some(t => ['exe', 'zip', 'js'].includes(t))) {
            issues.push('Contains potentially risky attachment types');
            spamRisk += 25;
            suggestions.push('Avoid sending .exe, .zip, or .js attachments');
        }

        // Calculate deliverability
        deliverabilityScore = Math.max(0, 100 - spamRisk);

        return {
            spamRisk: Math.min(100, spamRisk),
            deliverabilityScore,
            issues,
            suggestions,
        };
    }

    // ============================================
    // OPENAI API CALL
    // ============================================

    private async callOpenAI(params: {
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    }): Promise<string> {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.openaiApiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: params.messages,
                temperature: 0.3,
                max_tokens: 1000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    // ============================================
    // ANALYZE THREAD (BATCH)
    // ============================================

    async analyzeThread(threadId: string): Promise<{
        sentiment: SentimentAnalysis;
        priority: PriorityClassification;
        summary: ThreadSummary;
    }> {
        const thread = await prisma.emailThread.findUnique({
            where: { id: threadId },
            include: {
                emails: {
                    orderBy: { receivedAt: 'asc' },
                    select: {
                        fromAddress: true,
                        toAddresses: true,
                        bodyText: true,
                        receivedAt: true,
                        direction: true,
                    },
                },
            },
        });

        if (!thread) {
            throw new Error('Thread not found');
        }

        const lastEmail = thread.emails[thread.emails.length - 1];
        const allText = thread.emails.map(e => e.bodyText || '').join('\n---\n');

        const [sentiment, priority, summary] = await Promise.all([
            this.analyzeSentiment(lastEmail?.bodyText || allText),
            this.classifyPriority(allText, {
                isReply: thread.emails.length > 1,
            }),
            this.summarizeThread(thread.emails.map(e => ({
                from: e.fromAddress,
                to: e.toAddresses,
                body: e.bodyText || '',
                date: e.receivedAt || new Date(),
            }))),
        ]);

        // Update thread with analysis
        await prisma.emailThread.update({
            where: { id: threadId },
            data: {
                sentiment: sentiment.sentiment,
                priority: priority.priority,
                summary: summary.summary,
            },
        });

        return { sentiment, priority, summary };
    }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const emailAIService = new EmailAIService();
