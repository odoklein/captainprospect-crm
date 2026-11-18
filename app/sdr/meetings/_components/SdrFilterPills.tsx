import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { StatusFilter } from "../_types";

interface SdrFilterPillsProps {
    statusFilter: StatusFilter;
    onSelect: (filter: StatusFilter) => void;
    counts: Record<StatusFilter, number>;
}

const FILTERS = [
    { key: "all" as const, label: "Tous" },
    { key: "upcoming" as const, label: "À venir" },
    { key: "past" as const, label: "Passés" },
    { key: "valid" as const, label: "Valides" },
    { key: "absent" as const, label: "Absents" },
    { key: "negative" as const, label: "Négatifs" },
    { key: "cancelled" as const, label: "Annulés" },
    { key: "setAside" as const, label: "Mis de côté" },
];

export function SdrFilterPills({ statusFilter, onSelect, counts }: SdrFilterPillsProps) {
    return (
        <SegmentedControl<StatusFilter>
            value={statusFilter}
            onChange={onSelect}
            ariaLabel="Statut des rendez-vous"
            options={FILTERS.map(({ key, label }) => ({
                value: key,
                label,
                count: counts[key],
                alert: key === "absent" && counts.absent > 0,
            }))}
            sliding
        />
    );
}
