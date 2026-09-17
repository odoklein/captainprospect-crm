import { ConfirmModal } from "@/components/ui";

interface DeleteMeetingConfirmDialogProps {
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function DeleteMeetingConfirmDialog({ isOpen, isLoading, onClose, onConfirm }: DeleteMeetingConfirmDialogProps) {
    return (
        <ConfirmModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title="Supprimer ce rendez-vous ?"
            message="Cette action est irréversible. Le rendez-vous sera définitivement supprimé."
            confirmText="Supprimer"
            variant="danger"
            isLoading={isLoading}
        />
    );
}
