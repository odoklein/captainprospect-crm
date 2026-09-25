// ============================================
// BROADCAST UNIFIED TYPES & VARIABLE REGISTRY
// ============================================

export type BroadcastType = "AUTOMATED_EVENT" | "MANUAL_CAMPAIGN";

export type BroadcastCategory = "RDV" | "SECURITY" | "ANNOUNCEMENT" | "ACCOUNT" | "CUSTOM";

export type BroadcastChannel = "EMAIL" | "IN_APP_BANNER" | "COMMS_CHANNEL";

export type EmailBlockType =
  | "header"
  | "heading"
  | "paragraph"
  | "callout"
  | "button"
  | "key_value"
  | "divider"
  | "footer";

export interface KeyValueItem {
  icon?: string;
  label: string;
  value: string;
}

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  content?: string;
  props?: {
    align?: "left" | "center" | "right";
    styleVariant?: "info" | "warning" | "success" | "accent" | "neutral";
    buttonText?: string;
    buttonUrl?: string;
    buttonColor?: string;
    badgeText?: string;
    badgeColor?: string;
    badgeTextColor?: string;
    showLogo?: boolean;
    logoSubtitle?: string;
    items?: KeyValueItem[];
  };
}

export interface VisualTemplateConfig {
  accentColor?: string;
  blocks: EmailBlock[];
}

export interface BroadcastVariable {
  key: string;
  token: string;
  label: string;
  category: "RDV" | "Sécurité" | "Contact" | "Entreprise" | "Général";
  sampleValue: string;
  description: string;
}

// ── Variables Registry ─────────────────────────────────────────────────────────

export const BROADCAST_VARIABLES_REGISTRY: Record<string, BroadcastVariable[]> = {
  rdv_notification: [
    {
      key: "contactFirstName",
      token: "{{contactFirstName}}",
      label: "Prénom du prospect",
      category: "Contact",
      sampleValue: "Jean",
      description: "Prénom du prospect ayant accepté le rendez-vous",
    },
    {
      key: "contactLastName",
      token: "{{contactLastName}}",
      label: "Nom du prospect",
      category: "Contact",
      sampleValue: "Dupont",
      description: "Nom de famille du prospect",
    },
    {
      key: "companyName",
      token: "{{companyName}}",
      label: "Nom de l'entreprise",
      category: "Entreprise",
      sampleValue: "Acme SAS",
      description: "Société cible du rendez-vous",
    },
    {
      key: "missionName",
      token: "{{missionName}}",
      label: "Nom de la mission",
      category: "Général",
      sampleValue: "Campagne Q3 Grands Comptes",
      description: "Mission de prospection concernée",
    },
    {
      key: "scheduledDate",
      token: "{{scheduledDate}}",
      label: "Date du RDV",
      category: "RDV",
      sampleValue: "Mardi 14 Octobre 2026",
      description: "Date du rendez-vous fixé",
    },
    {
      key: "scheduledTime",
      token: "{{scheduledTime}}",
      label: "Heure du RDV",
      category: "RDV",
      sampleValue: "14:30",
      description: "Heure du rendez-vous (fuseau horaire de Paris)",
    },
    {
      key: "meetingType",
      token: "{{meetingType}}",
      label: "Type de réunion",
      category: "RDV",
      sampleValue: "Visioconférence",
      description: "Visio, Présentiel ou Téléphonique",
    },
    {
      key: "meetingJoinUrl",
      token: "{{meetingJoinUrl}}",
      label: "Lien de connexion / Visio",
      category: "RDV",
      sampleValue: "https://meet.google.com/cp-abc-xyz",
      description: "Lien Google Meet, Teams ou Zoom",
    },
    {
      key: "meetingAddress",
      token: "{{meetingAddress}}",
      label: "Adresse physique",
      category: "RDV",
      sampleValue: "12 rue de la Paix, 75002 Paris",
      description: "Adresse pour un RDV en présentiel",
    },
    {
      key: "portalUrl",
      token: "{{portalUrl}}",
      label: "Lien de l'espace client",
      category: "Général",
      sampleValue: "https://app.captainprospect.fr/client/portal/meetings",
      description: "Lien direct vers la fiche RDV sur le portail client",
    },
  ],

  password_recovery: [
    {
      key: "userName",
      token: "{{userName}}",
      label: "Nom de l'utilisateur",
      category: "Contact",
      sampleValue: "Marie Laurent",
      description: "Nom complet du destinataire",
    },
    {
      key: "resetUrl",
      token: "{{resetUrl}}",
      label: "Lien de réinitialisation",
      category: "Sécurité",
      sampleValue: "https://app.captainprospect.fr/reset-password?token=example_token",
      description: "Lien sécurisé à usage unique pour choisir un nouveau mot de passe",
    },
    {
      key: "expiryMinutes",
      token: "{{expiryMinutes}}",
      label: "Durée de validité (minutes)",
      category: "Sécurité",
      sampleValue: "60",
      description: "Durée de validité du lien en minutes",
    },
  ],

  password_otp: [
    {
      key: "userName",
      token: "{{userName}}",
      label: "Nom de l'utilisateur",
      category: "Contact",
      sampleValue: "Thomas Martin",
      description: "Nom complet du destinataire",
    },
    {
      key: "otpCode",
      token: "{{otpCode}}",
      label: "Code OTP unique",
      category: "Sécurité",
      sampleValue: "849 201",
      description: "Code temporaire à 6 chiffres",
    },
    {
      key: "expiryMinutes",
      token: "{{expiryMinutes}}",
      label: "Durée de validité (minutes)",
      category: "Sécurité",
      sampleValue: "15",
      description: "Durée avant expiration du code",
    },
  ],

  general: [
    {
      key: "userName",
      token: "{{userName}}",
      label: "Nom du destinataire",
      category: "Contact",
      sampleValue: "Alexandre",
      description: "Nom ou prénom du destinataire",
    },
    {
      key: "companyName",
      token: "{{companyName}}",
      label: "Entreprise du destinataire",
      category: "Entreprise",
      sampleValue: "Tech Innovators",
      description: "Nom de la société",
    },
    {
      key: "appUrl",
      token: "{{appUrl}}",
      label: "Lien de la plateforme",
      category: "Général",
      sampleValue: "https://app.captainprospect.fr",
      description: "Lien d'accès principal au CRM",
    },
  ],
};

// ── Pre-configured System Broadcast Definitions ────────────────────────────────

export interface BroadcastDefinition {
  key: string;
  name: string;
  description: string;
  category: BroadcastCategory;
  triggerType: BroadcastType;
  triggerEventLabel: string;
  channels: BroadcastChannel[];
  isSystemLocked: boolean;
  isActive: boolean;
  defaultSubject: string;
  defaultBlocks: EmailBlock[];
  defaultHtml: string;
}

export const SYSTEM_BROADCAST_DEFINITIONS: BroadcastDefinition[] = [
  {
    key: "rdv_notification",
    name: "Notification Nouveau RDV Client",
    description: "Email automatique envoyé au client et aux commerciaux dès qu'un rendez-vous est qualifié et réservé.",
    category: "RDV",
    triggerType: "AUTOMATED_EVENT",
    triggerEventLabel: "Dès qu'un RDV est pris",
    channels: ["EMAIL", "IN_APP_BANNER"],
    isSystemLocked: true,
    isActive: true,
    defaultSubject: "✅ Nouveau RDV confirmé - {{contactFirstName}} {{contactLastName}} ({{companyName}})",
    defaultBlocks: [
      {
        id: "b_head",
        type: "header",
        props: {
          showLogo: true,
          logoSubtitle: "Notification · Nouveau Rendez-vous",
        },
      },
      {
        id: "b_badge",
        type: "callout",
        content: "✅ Nouveau rendez-vous confirmé",
        props: {
          styleVariant: "success",
          badgeText: "CONFIRMÉ",
        },
      },
      {
        id: "b_heading",
        type: "heading",
        content: "Bonne nouvelle ! Un nouveau rendez-vous a été planifié.",
        props: { align: "left" },
      },
      {
        id: "b_intro",
        type: "paragraph",
        content:
          "Notre équipe vient de confirmer un rendez-vous qualifié avec **{{contactFirstName}} {{contactLastName}}** de l'entreprise **{{companyName}}** dans le cadre de votre mission **{{missionName}}**.",
      },
      {
        id: "b_kv",
        type: "key_value",
        props: {
          items: [
            { icon: "📅", label: "Date", value: "{{scheduledDate}}" },
            { icon: "⏰", label: "Heure", value: "{{scheduledTime}} (Paris)" },
            { icon: "🎯", label: "Type", value: "{{meetingType}}" },
            { icon: "🏢", label: "Société", value: "{{companyName}}" },
          ],
        },
      },
      {
        id: "b_cta",
        type: "button",
        props: {
          buttonText: "Consulter la fiche RDV sur mon portail →",
          buttonUrl: "{{portalUrl}}",
          buttonColor: "#4f46e5",
          align: "center",
        },
      },
      {
        id: "b_foot",
        type: "footer",
        content:
          "Cet email automatique a été généré par Captain Prospect pour le suivi de votre prospection commerciale.",
      },
    ],
    defaultHtml: "",
  },
  {
    key: "password_recovery",
    name: "Récupération Mot de passe (Lien magique)",
    description: "Email automatique envoyé lorsqu'un utilisateur clique sur « Mot de passe oublié ».",
    category: "SECURITY",
    triggerType: "AUTOMATED_EVENT",
    triggerEventLabel: "Demande de mot de passe oublié",
    channels: ["EMAIL"],
    isSystemLocked: true,
    isActive: true,
    defaultSubject: "Réinitialisation de votre mot de passe - Captain Prospect",
    defaultBlocks: [
      {
        id: "sec_head",
        type: "header",
        props: {
          showLogo: true,
          logoSubtitle: "Sécurité & Accès",
        },
      },
      {
        id: "sec_heading",
        type: "heading",
        content: "Réinitialisation de votre mot de passe",
        props: { align: "left" },
      },
      {
        id: "sec_intro",
        type: "paragraph",
        content:
          "Bonjour **{{userName}}**,\n\nNous avons reçu une demande de réinitialisation de mot de passe pour votre compte Captain Prospect. Cliquez sur le bouton ci-dessous pour choisir votre nouveau mot de passe.",
      },
      {
        id: "sec_cta",
        type: "button",
        props: {
          buttonText: "Définir mon nouveau mot de passe",
          buttonUrl: "{{resetUrl}}",
          buttonColor: "#4f46e5",
          align: "center",
        },
      },
      {
        id: "sec_notice",
        type: "callout",
        content:
          "⚠️ Ce lien expire automatiquement dans **{{expiryMinutes}} minutes** pour des raisons de sécurité.",
        props: { styleVariant: "warning" },
      },
      {
        id: "sec_foot",
        type: "footer",
        content:
          "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.",
      },
    ],
    defaultHtml: "",
  },
  {
    key: "password_otp",
    name: "Code de sécurité OTP (Authentification)",
    description: "Email automatique contenant le code à 6 chiffres pour valider une connexion ou une action sensible.",
    category: "SECURITY",
    triggerType: "AUTOMATED_EVENT",
    triggerEventLabel: "Validation code à 2 facteurs / OTP",
    channels: ["EMAIL"],
    isSystemLocked: true,
    isActive: true,
    defaultSubject: "Votre code de validation de sécurité - Captain Prospect",
    defaultBlocks: [
      {
        id: "otp_head",
        type: "header",
        props: {
          showLogo: true,
          logoSubtitle: "Code de sécurité temporaire",
        },
      },
      {
        id: "otp_heading",
        type: "heading",
        content: "Votre code de vérification",
        props: { align: "center" },
      },
      {
        id: "otp_intro",
        type: "paragraph",
        content:
          "Bonjour **{{userName}}**,\n\nVoici votre code d'authentification à usage unique à saisir dans votre application :",
        props: { align: "center" },
      },
      {
        id: "otp_code",
        type: "callout",
        content: "{{otpCode}}",
        props: {
          styleVariant: "accent",
          align: "center",
        },
      },
      {
        id: "otp_warn",
        type: "callout",
        content: "⏱️ Ce code expire dans **{{expiryMinutes}} minutes**. Ne le partagez avec personne.",
        props: { styleVariant: "neutral", align: "center" },
      },
      {
        id: "otp_foot",
        type: "footer",
        content: "Captain Prospect Protection System · Si vous n'êtes pas l'auteur de cette demande, contactez immédiatement l'administrateur.",
      },
    ],
    defaultHtml: "",
  },
];
