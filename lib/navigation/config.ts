import {
  LayoutDashboard,
  Building2,
  Target,
  FileText,
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
  Receipt,
  Search,
  History,
  HelpCircle,
  LucideIcon,
  Database,
  FileDown,
  Activity,
  Key,
  Trophy,
  User,
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
  children?: NavItem[]; // Sub-items for nested navigation
  openInNewTab?: boolean; // Open in new tab (e.g. email inbox)
}

export interface NavSection {
  title?: string; // Section title (optional)
  items: NavItem[];
  dividerBefore?: boolean; // Show separator above this section (for admin zone)
}

// ============================================
// MANAGER NAVIGATION — Grouped Sections
// ============================================

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
    title: "Prospection",
    items: [
      {
        href: "/manager/lists",
        icon: Database,
        label: "Listes & Prospection",
        permission: "pages.prospects",
      },
      {
        href: "/manager/missions",
        icon: Target,
        label: "Missions",
        permission: "pages.missions",
      },
      {
        href: "/manager/prospection",
        icon: Phone,
        label: "Appels",
        permission: "pages.missions",
      },
    ],
  },
  {
    title: "Suivi",
    items: [
      {
        href: "/manager/clients",
        icon: Building2,
        label: "Clients",
        permission: "pages.clients",
      },
      {
        href: "/manager/rdv",
        icon: Calendar,
        label: "SAS RDV",
        permission: "pages.analytics",
      },
      {
        href: "/manager/analytics",
        icon: BarChart3,
        label: "Statistiques",
        permission: "pages.analytics",
      },
      {
        href: "/manager/emails",
        icon: Mail,
        label: "Email Hub",
        permission: "pages.email",
      },
      {
        href: "/manager/comms",
        icon: MessageSquare,
        label: "Messages",
        permission: "pages.comms",
      },
    ],
  },
  {
    title: "Équipe",
    items: [
      {
        href: "/manager/team",
        icon: BarChart3,
        label: "Performance",
        permission: "pages.sdrs",
      },
      {
        href: "/manager/users",
        icon: Users,
        label: "Réglages équipe",
        permission: "pages.sdrs",
      },
      {
        href: "/manager/planning",
        icon: Calendar,
        label: "Planning",
        permission: "pages.planning",
      },
      {
        href: "/manager/projects",
        icon: FolderKanban,
        label: "Projets",
        permission: "pages.projects",
      },
    ],
  },
  {
    title: "",
    dividerBefore: true,
    items: [
      {
        href: "/manager/settings",
        icon: Settings,
        label: "Paramètres",
        permission: "pages.sdrs",
      },
      {
        href: "/manager/api",
        icon: Key,
        label: "API & Intégrations",
        permission: "pages.sdrs",
      },
      {
        href: "/manager/billing",
        icon: Receipt,
        label: "Facturation",
        permission: "pages.billing",
      },
      {
        href: "/manager/files",
        icon: FileText,
        label: "Fichiers",
        permission: "pages.files",
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
      {
        href: "/sdr/comms",
        icon: MessageSquare,
        label: "Messages",
        permission: "pages.comms",
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
    ],
  },
  {
    title: "Compte",
    items: [
      {
        href: "/sdr/profile",
        icon: User,
        label: "Mon Profil",
        permission: "pages.dashboard",
      },
      {
        href: "/sdr/leaderboard",
        icon: Trophy,
        label: "Classement",
        permission: "pages.dashboard",
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
        href: "/bd/comms",
        icon: MessageSquare,
        label: "Messages",
        permission: "pages.comms",
      },
      {
        href: "/bd/settings",
        icon: Settings,
        label: "Mon profil",
        permission: "pages.settings",
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
// CLIENT NAVIGATION — Portal + Outils groups
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
        href: "/client/portal/reporting",
        icon: FileDown,
        label: "Rapports",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/activite",
        icon: Activity,
        label: "Activité",
        permission: "pages.dashboard",
      },
      {
        href: "/client/contact",
        icon: MessageSquare,
        label: "Messages",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Outils",
    items: [
      {
        href: "/client/portal/email",
        icon: Mail,
        label: "Mon Email",
        permission: "pages.dashboard",
      },
      {
        href: "/client/portal/database",
        icon: Database,
        label: "Base de donnees",
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
      {
        href: "/client/portal/aide",
        icon: HelpCircle,
        label: "Aide",
        permission: "pages.dashboard",
      },
    ],
  },
  {
    title: "Compte",
    items: [
      {
        href: "/client/portal/settings",
        icon: Settings,
        label: "Parametres",
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
    label: "Sales",
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
