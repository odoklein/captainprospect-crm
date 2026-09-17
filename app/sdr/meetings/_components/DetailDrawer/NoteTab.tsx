interface NoteTabProps {
    note: string;
    onChange: (value: string) => void;
}

export function NoteTab({ note, onChange }: NoteTabProps) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Note interne</h3>
            <textarea
                value={note}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Ajouter une note interne..."
                className="w-full min-h-[160px] bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-700 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y"
                rows={6}
            />
        </div>
    );
}
