import { Download, Search, Upload } from "lucide-react";
import { Button, PageHeader } from "@/components/ui";

interface SdrMeetingsHeaderProps {
    query: string;
    onQueryChange: (value: string) => void;
    onImport: () => void;
}

export function SdrMeetingsHeader({ query, onQueryChange, onImport }: SdrMeetingsHeaderProps) {
    return (
        <PageHeader
            title="Mes rendez-vous"
            subtitle="Consultez, qualifiez et gérez vos rendez-vous dans une vue proche du portail client."
            actions={
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[280px]">
                        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => onQueryChange(e.target.value)}
                            placeholder="Contact, entreprise, mission..."
                            aria-label="Rechercher un rendez-vous"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 shadow-sm shrink-0"
                        onClick={onImport}
                    >
                        <Upload className="w-4 h-4" />
                        Importer
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled
                        title="Export bientôt disponible"
                        className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 shadow-sm shrink-0"
                    >
                        <Download className="w-4 h-4" />
                        Exporter
                    </Button>
                </div>
            }
        />
    );
}
