// ============================================
// PERMISSION TYPES
// ============================================

// All available permission codes
export type PermissionCode =
    // Pages
    | "pages.dashboard"
    | "pages.clients"
    | "pages.missions"
    | "pages.campaigns"
    | "pages.lists"
    | "pages.analytics"
    | "pages.planning"
    | "pages.files"
    | "pages.users"
    | "pages.sdrs"
    | "pages.projects"
    | "pages.action"
    | "pages.opportunities"
    | "pages.settings"
    | "pages.portfolio"
    | "pages.onboarding"
    // Email Hub Pages
    | "pages.email"
    | "pages.email_inbox"
    | "pages.email_team"
    | "pages.email_sequences"
    | "pages.email_mailboxes"
    | "pages.email_analytics"
    // Features - Mission
    | "features.create_mission"
    | "features.edit_mission"
    | "features.delete_mission"
    | "features.assign_sdr"
    // Features - List
    | "features.create_list"
    | "features.edit_list"
    | "features.delete_list"
    | "features.import_lists"
    | "features.export_data"
    // Features - Campaign
    | "features.create_campaign"
    | "features.edit_campaign"
    | "features.delete_campaign"
    // Features - Client
    | "features.create_client"
    | "features.edit_client"
    | "features.delete_client"
    // Features - User
    | "features.create_user"
    | "features.edit_user"
    | "features.delete_user"
    | "features.manage_permissions"
    | "features.ban_user"
    // Features - Files
    | "features.upload_files"
    | "features.delete_files"
    | "features.manage_folders"
    // Features - Email Hub
    | "features.connect_mailbox"
    | "features.manage_mailboxes"
    | "features.send_email"
    | "features.send_as"
    | "features.create_sequence"
    | "features.edit_sequence"
    | "features.delete_sequence"
    | "features.enroll_contacts"
    | "features.view_email_analytics"
    | "features.manage_team_inbox"
    // Actions
    | "actions.make_calls"
    | "actions.send_emails"
    | "actions.send_linkedin"
    | "actions.book_meetings"
    | "actions.create_opportunity"
    | "actions.edit_contacts"
    // Internal Communication Module
    | "pages.comms"
    | "pages.comms_inbox"
    | "pages.comms_threads"
    | "pages.comms_groups"
    | "pages.comms_broadcasts"
    | "features.comms_create_thread"
    | "features.comms_create_group"
    | "features.comms_create_broadcast"
    | "features.comms_resolve_thread"
    | "features.comms_delete_message"
    | "features.comms_manage_groups"
    // Support Technique — development tickets
    | "pages.tickets"
    | "pages.client_roadmap"
    | "features.create_ticket"
    | "features.assign_ticket"
    | "features.publish_ticket_roadmap"
    | "features.delete_ticket"
    // Billing Module
    | "pages.billing"
    | "features.create_invoice"
    | "features.validate_invoice"
    | "features.sync_payments"
    | "features.confirm_payment"
    // RH (Ressources Humaines) Module
    | "pages.hr"
    | "features.hr_view"
    | "features.hr_configure"
    | "features.hr_calculate"
    | "features.hr_validate"
    | "features.hr_day_decision"
    | "features.hr_reopen";

// Permission object from API
export interface Permission {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string;
}

// User permission state
export interface UserPermissions {
    permissions: Set<string>;
    isLoading: boolean;
    error: string | null;
}

// Permission context value
export interface PermissionContextValue {
    permissions: Set<string>;
    isLoading: boolean;
    error: string | null;
    hasPermission: (code: string) => boolean;
    hasAnyPermission: (codes: string[]) => boolean;
    hasAllPermissions: (codes: string[]) => boolean;
    refreshPermissions: () => Promise<void>;
}
