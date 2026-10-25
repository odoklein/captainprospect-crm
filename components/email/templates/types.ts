export interface MissionOption {
    id: string;
    name: string;
    status: string;
    client: { id: string; name: string } | null;
}

export interface EmailTemplateRow {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText: string | null;
    category: string;
    isShared: boolean;
    variables: string[];
    useCount: number;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: { id: string; name: string } | null;
    missionTemplates: { missionId: string; mission: MissionOption }[];
}
