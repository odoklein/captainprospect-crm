import {
  Ban,
  LayoutDashboard,
  Building2,
  Target,
  FileText,
  LayoutGrid,
  List,
  BarChart3,
  Users,
  FolderKanban,
  Calendar,
  Phone,
  Briefcase,
  Settings,
  UserPlus,
  Mail,
  Inbox,
  Send,
  Zap,
  MessageSquare,
  Megaphone,
  Receipt,
  Search,
  History,
  HelpCircle,
  LucideIcon,
  Database,
  FileDown,
  Activity,
  Key,
  Brain,
  UserCheck,
  UserX,
  ShieldCheck,
  ScrollText,
  Sparkles,
  LifeBuoy,
  Wallet,
  CalendarCheck,
  CalendarDays,
  MessagesSquare,
  Settings2,
  Tag,
} from "lucide-react";
import { UserRole } from "@prisma/client";

// ============================================
// NAVIGATION ITEM TYPES
// ============================================

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  permission?: string; // Permission code required to view this item
  roles?: UserRole[]; // Restrict to specific roles (if no permission set)
  badge?: string; // Optional badge text (e.g. count)
  badgeDetail?: string; // Optional secondary badge (e.g. "Proch. 31 janv.")
  /**
   * Sub-pages. An item with children is a hub: the sidebar shows the hub
   * (opening on the last tab used), the top bar shows its children as tabs.
   * A hub is visible as soon as one child is; it has no permission of its own.
   */
  children?: NavItem[];
  /** One line on what the page is for — tab and sidebar tooltips. */
  description?: string;
  openInNewTab?: boolean; // Open in new tab (e.g. email inbox)
}

export interface NavSection {
  title?: string; // Section title (optional)
  items: NavItem[];
  dividerBefore?: boolean; // Show separator above this section (for admin zone)
}

// ============================================
// MANAGER NAVIGATION — hubs
// ============================================
// 28 pages grouped into 11 entries. Routes are unchanged: only where a page
// is listed moved. The first child of a hub is where it opens the first time.

export const MANAGER_NAV: NavSection[] = [
  {
    items: [
      {
        href: "/manager/dashboard",
        icon: LayoutDashboard,
        label: "Accueil",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Production",
    items: [
      {
        href: "/manager/lists",
        icon: Target,
        label: "Prospection",
        children: [
          { href: "/manager/lists", icon: Database, label: "Listes", permission: "pages.prospects", description: "Fichiers de prospects et leur préparation" },
          { href: "/manager/prospection", icon: Phone, label: "Appels", permission: "pages.missions", description: "Activité d'appel des SDR, mission par mission" },
          { href: "/manager/exclusions", icon: Ban, label: "BlackList", permission: "pages.prospects", description: "Sociétés et contacts à ne jamais rappeler" },
        ],
      },
      {
        href: "/manager/rdv",
        icon: CalendarCheck,
        label: "Rendez-vous",
        children: [
          { href: "/manager/rdv", icon: Calendar, label: "SAS RDV", permission: "pages.analytics", description: "Confirmer les rendez-vous avant envoi au client" },
          { href: "/manager/rdv-absences", icon: UserX, label: "Signalements absents", permission: "pages.analytics", description: "Rendez-vous où le prospect ne s'est pas présenté" },
        ],
      },
      {
        href: "/manager/clients",
        icon: Building2,
        label: "Clients",
        children: [
          { href: "/manager/clients", icon: Building2, label: "Clients", permission: "pages.clients", description: "Fiches clients et leurs missions" },
          { href: "/manager/dashboard-projet", icon: UserCheck, label: "Dashboard projet", permission: "pages.clients", description: "Avancement de chaque projet client" },
          { href: "/manager/assistant", icon: Sparkles, label: "Assistant projet", permission: "pages.clients", description: "Assistant IA sur les données d'un projet" },
        ],
      },
      {
        href: "/manager/emails",
        icon: MessagesSquare,
        label: "Communication",
        children: [
          { href: "/manager/emails", icon: Mail, label: "Email Hub", permission: "pages.email", description: "Boîtes mail partagées et conversations" },
          { href: "/manager/emailing", icon: Send, label: "Emailing", permission: "pages.email", description: "Campagnes et séquences d'emails" },
          { href: "/manager/broadcasts", icon: Megaphone, label: "Broadcasts", permission: "pages.email", description: "Annonces et notifications à l'équipe ou aux clients" },
        ],
      },
    ],
  },
  {
    title: "Gestion",
    items: [
      {
        href: "/manager/planning",
        icon: Users,
        label: "RH",
        children: [
          { href: "/manager/planning", icon: Calendar, label: "Planning", permission: "pages.planning", description: "Qui travaille sur quelle mission, chaque jour" },
          { href: "/manager/utilisateurs", icon: Users, label: "Utilisateurs & accès", permission: "pages.sdrs", description: "Comptes, rôles et permissions" },
          { href: "/manager/rh", icon: Wallet, label: "Paie", permission: "pages.hr", description: "Jours travaillés, absences et rémunération" },
          { href: "/manager/sdr-feedback", icon: MessageSquare, label: "Avis SDR", permission: "pages.sdrs", description: "Retours de fin de journée des SDR" },
        ],
      },
      {
        href: "/manager/analytics",
        icon: BarChart3,
        label: "Pilotage",
        children: [
          { href: "/manager/analytics", icon: BarChart3, label: "Statistiques", permission: "pages.analytics", description: "Volumes, conversions et performance" },
          { href: "/manager/analyse-ia", icon: Brain, label: "Analyse IA", permission: "pages.analytics", description: "Analyses générées à partir des appels" },
        ],
      },
      {
        href: "/manager/billing",
        icon: Receipt,
        label: "Facturation",
        children: [
          { href: "/manager/billing", icon: LayoutDashboard, label: "Vue d'ensemble", permission: "pages.billing", description: "Encours, échéances et alertes" },
          { href: "/manager/billing/invoices", icon: FileText, label: "Factures", permission: "pages.billing", description: "Factures émises et brouillons" },
          { href: "/manager/billing/clients", icon: Building2, label: "Clients", permission: "pages.billing", description: "Coordonnées de facturation" },
          { href: "/manager/billing/offres", icon: Tag, label: "Offres & tarifs", permission: "pages.billing", description: "Catalogue d'offres et prix" },
          { href: "/manager/billing/engagements", icon: CalendarDays, label: "Engagements", permission: "pages.billing", description: "Contrats et volumes engagés" },
          { href: "/manager/billing/settings", icon: Settings, label: "Paramètres", permission: "pages.billing", description: "Mentions, numérotation et TVA" },
        ],
      },
    ],
  },
  {
    title: "Outils",
    items: [
      {
        href: "/manager/tickets",
        icon: LifeBuoy,
        label: "Support technique",
        permission: "pages.tickets",
        description: "Tickets de développement et demandes d'évolution",
      },
      {
        href: "/manager/projects",
        icon: FolderKanban,
        label: "Organisation",
        children: [
          { href: "/manager/projects", icon: FolderKanban, label: "Projets", permission: "pages.projects", description: "Projets internes et tâches" },
          { href: "/manager/files", icon: FileText, label: "Fichiers", permission: "pages.files", description: "Documents partagés" },
        ],
      },
    ],
  },
  {
    dividerBefore: true,
    items: [
      {
        href: "/manager/settings",
        icon: Settings2,
        label: "Réglages",
        children: [
          { href: "/manager/settings", icon: Mail, label: "Email", permission: "pages.sdrs", description: "Comptes d'envoi et signatures" },
          { href: "/manager/api", icon: Key, label: "API & intégrations", permission: "pages.sdrs", description: "Clés d'API et connecteurs" },
          { href: "/manager/acces", icon: ShieldCheck, label: "Coffre d'accès", permission: "pages.sdrs", description: "Identifiants partagés par mission" },
          { href: "/manager/audit", icon: ScrollText, label: "Journal d'audit", permission: "pages.sdrs", description: "Qui a fait quoi, et quand" },
        ],
      },
    ],
  },
];

// ============================================
// SDR NAVIGATION — Grouped Sections
// ============================================

export const SDR_NAV: NavSection[] = [
  {
    // No title — home
    items: [
      {
        href: "/sdr",
        icon: LayoutDashboard,
        label: "Accueil",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Actions",
    items: [
      {
        href: "/sdr/action",
        icon: Phone,
        label: "Appeler",
        permission: "pages.action",
      },
      {
        href: "/sdr/callbacks",
        icon: Calendar,
        label: "Rappels",
        permission: "pages.action",
      },
      {
        href: "/sdr/calendar",
        icon: Calendar,
        label: "Calendrier",
        permission: "pages.action",
      },
      {
        href: "/sdr/history",
        icon: History,
        label: "Historique",
        permission: "pages.action",
      },
      {
        href: "/sdr/meetings",
        icon: Calendar,
        label: "Mes RDV",
        permission: "pages.opportunities",
      },
    ],
  },
  {
    title: "Communication",
    items: [
      {
        href: "/sdr/emails",
        icon: Mail,
        label: "Email Hub",
        permission: "pages.email",
      },
    ],
  },
  {
    title: "Organisation",
    items: [
      {
        href: "/sdr/projects",
        icon: FolderKanban,
        label: "Projets",
        permission: "pages.projects",
      },
      {
        href: "/sdr/planning",
        icon: Calendar,
        label: "Planning",
        permission: "pages.planning",
      },
      {
        href: "/sdr/support-technique",
        icon: LifeBuoy,
        label: "Support technique",
        permission: "pages.ticket_requests",
      },
    ],
  },
];

// ============================================
// BOOKER NAVIGATION — Focused: Lists, Missions, Calling
// No planning, no projects, no VOIP, no comms
// ============================================

export const BOOKER_NAV: NavSection[] = [
  {
    // No title — home
    items: [
      {
        href: "/sdr",
        icon: LayoutDashboard,
        label: "Accueil",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Prospection",
    items: [
      {
        href: "/sdr/lists",
        icon: Database,
        label: "Listes",
        permission: "pages.action",
      },
      {
        href: "/sdr/action",
        icon: Phone,
        label: "Appeler",
        permission: "pages.action",
      },
    ],
  },
  {
    title: "Suivi",
    items: [
      {
        href: "/sdr/callbacks",
        icon: Calendar,
        label: "Rappels",
        permission: "pages.action",
      },
      {
        href: "/sdr/history",
        icon: History,
        label: "Historique",
        permission: "pages.action",
      },
      {
        href: "/sdr/meetings",
        icon: Calendar,
        label: "Mes RDV",
        permission: "pages.opportunities",
      },
      {
        href: "/sdr/support-technique",
        icon: LifeBuoy,
        label: "Support technique",
        permission: "pages.ticket_requests",
      },
    ],
  },
];

// ============================================
// BUSINESS DEVELOPER NAVIGATION — Grouped
// ============================================

export const BD_NAV: NavSection[] = [
  {
    // No title — home
    items: [
      {
        href: "/bd/dashboard",
        icon: LayoutDashboard,
        label: "Accueil",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Commercial",
    items: [
      {
        href: "/bd/clients",
        icon: Building2,
        label: "Mes clients",
        permission: "pages.portfolio",
      },
      {
        href: "/bd/missions",
        icon: Target,
        label: "Missions",
        permission: "pages.missions",
      },
      {
        href: "/sdr/action",
        icon: Phone,
        label: "Appeler",
        permission: "pages.action",
      },
      {
        href: "/sdr/callbacks",
        icon: Calendar,
        label: "Rappels",
        permission: "pages.action",
      },
      {
        href: "/sdr/history",
        icon: History,
        label: "Historique",
        permission: "pages.action",
      },
      {
        href: "/sdr/opportunities",
        icon: Briefcase,
        label: "Opportunites",
        permission: "pages.opportunities",
      },
      {
        href: "/bd/clients/new",
        icon: UserPlus,
        label: "Nouveau client",
        permission: "pages.onboarding",
      },
    ],
  },
  {
    title: "Communication",
    items: [
      {
        href: "/bd/settings",
        icon: Settings,
        label: "Mon profil",
        permission: "pages.settings",
      },
      {
        href: "/sdr/support-technique",
        icon: LifeBuoy,
        label: "Support technique",
        permission: "pages.ticket_requests",
      },
    ],
  },
];

// ============================================
// DEVELOPER NAVIGATION — Grouped
// ============================================

export const DEVELOPER_NAV: NavSection[] = [
  {
    // No title — home
    items: [
      {
        href: "/developer/dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Travail",
    items: [
      {
        href: "/developer/projects",
        icon: FolderKanban,
        label: "Projets",
        permission: "pages.projects",
      },
      {
        href: "/developer/tasks",
        icon: List,
        label: "Taches",
        permission: "pages.projects",
      },
      {
        href: "/developer/tickets",
        icon: LifeBuoy,
        label: "Support technique",
        permission: "pages.tickets",
      },
      {
        href: "/developer/integrations",
        icon: Settings,
        label: "Integrations",
        permission: "pages.settings",
      },
      {
        href: "/developer/settings",
        icon: Settings,
        label: "Parametres",
        permission: "pages.settings",
      },
    ],
  },
];

// ============================================
// CLIENT NAVIGATION — daily pages (Accueil, Mes RDV, Activité, Base de
// données) stand alone at the top; everything else is grouped by purpose.
// ============================================

export const CLIENT_NAV: NavSection[] = [
  {
    items: [
      {
        href: "/client/portal",
        icon: LayoutDashboard,
        label: "Accueil",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/meetings",
        icon: Calendar,
        label: "Mes RDV",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/activite",
        icon: Activity,
        label: "Activité",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/database",
        icon: Database,
        label: "Base de données",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Suivi",
    items: [
      {
        href: "/client/portal/reporting",
        icon: FileDown,
        label: "Rapports",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/exclusions",
        icon: Ban,
        label: "Ne plus contacter",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Outils",
    items: [
      {
        href: "/client/portal/emailing",
        icon: Send,
        label: "Emailing",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/email",
        icon: Mail,
        label: "Mon Email",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/files",
        icon: FileText,
        label: "Fichiers",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/sales-playbook",
        icon: Target,
        label: "Sales Playbook",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Votre espace",
    items: [
      {
        href: "/client/portal/evolutions",
        icon: Sparkles,
        label: "Évolutions",
        permission: "pages.client_roadmap",
      },
      {
        href: "/client/portal/settings",
        icon: Settings,
        label: "Paramètres",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/aide",
        icon: HelpCircle,
        label: "Aide",
        permission: "pages.dashboard",
      },
    ],
  },
];

// ============================================
// COMMERCIAL NAVIGATION — Portal for ClientInterlocuteurs
// ============================================

export const COMMERCIAL_NAV: NavSection[] = [
  {
    items: [
      {
        href: "/commercial/portal",
        icon: LayoutDashboard,
        label: "Accueil",
      },
    ],
  },
  {
    title: "Suivi",
    items: [
      {
        href: "/commercial/portal/meetings",
        icon: Calendar,
        label: "Mes RDV",
      },
      {
        href: "/commercial/portal/contacts",
        icon: Users,
        label: "Contacts",
      },
    ],
  },
  {
    title: "Compte",
    items: [
      {
        href: "/commercial/portal/settings",
        icon: Settings,
        label: "Paramètres",
      },
    ],
  },
];

// ============================================
// GET NAVIGATION BY ROLE
// ============================================

export function getNavByRole(role: UserRole): NavSection[] {
  switch (role) {
    case "MANAGER":
      return MANAGER_NAV;
    case "SDR":
      return SDR_NAV;
    case "BOOKER":
      return BOOKER_NAV;
    case "BUSINESS_DEVELOPER":
      return BD_NAV;
    case "DEVELOPER":
      return DEVELOPER_NAV;
    case "CLIENT":
      return CLIENT_NAV;
    case "COMMERCIAL":
      return COMMERCIAL_NAV;
    default:
      return [];
  }
}

// ============================================
// ROLE DISPLAY CONFIG
// ============================================

export interface RoleConfig {
  label: string;
  color: string; // Tailwind color name (e.g., "indigo", "emerald")
  gradient: string; // Full gradient class
  defaultPath: string;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  MANAGER: {
    label: "Manager",
    color: "indigo",
    gradient: "from-indigo-500 to-indigo-600",
    defaultPath: "/manager/dashboard",
  },
  SDR: {
    label: "SDR",
    color: "indigo",
    gradient: "from-indigo-500 to-indigo-600",
    defaultPath: "/sdr/action",
  },
  BOOKER: {
    label: "Booker",
    color: "indigo",
    gradient: "from-indigo-500 to-indigo-600",
    defaultPath: "/sdr/action",
  },
  BUSINESS_DEVELOPER: {
    label: "BD",
    color: "emerald",
    gradient: "from-emerald-500 to-emerald-600",
    defaultPath: "/bd/dashboard",
  },
  DEVELOPER: {
    label: "Dev",
    color: "blue",
    gradient: "from-blue-500 to-blue-600",
    defaultPath: "/developer/dashboard",
  },
  CLIENT: {
    label: "Client",
    color: "indigo",
    gradient: "from-indigo-500 to-violet-600",
    defaultPath: "/client/portal",
  },
  COMMERCIAL: {
    label: "Commercial",
    color: "emerald",
    gradient: "from-emerald-500 to-teal-600",
    defaultPath: "/commercial/portal",
  },
};
