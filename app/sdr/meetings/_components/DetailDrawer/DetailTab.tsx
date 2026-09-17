import {
    ArrowRight,
    Building2,
    CalendarClock,
    Linkedin,
    Loader2,
    Mail,
    MapPin,
    Phone,
    RotateCcw,
    User,
    Video,
} from "lucide-react";
import { Button, DateTimePicker, Select } from "@/components/ui";
import { getMeetingCancellationLabel } from "@/lib/constants/meetingCancellationReasons";
import { formatScheduledDate } from "../../_lib/formatters";
import type { Meeting, MeetingResult } from "../../_types";
import type { SdrDetailDrawerState } from "../../_hooks/useSdrDetailDrawer";

interface DetailTabProps {
    meeting: Meeting;
    drawer: SdrDetailDrawerState;
    isCancelling: boolean;
    onOpenReschedule: (meeting: Meeting) => void;
    onOpenCancel: (meeting: Meeting) => void;
}

export function DetailTab({ meeting, drawer, isCancelling, onOpenReschedule, onOpenCancel }: DetailTabProps) {
    const {
        editNote, setEditNote,
        editResult, setEditResult,
        editCallbackDate, setEditCallbackDate,
        editMeetingType, setEditMeetingType,
        editMeetingCategory, setEditMeetingCategory,
        editMeetingAddress, setEditMeetingAddress,
        editMeetingJoinUrl, setEditMeetingJoinUrl,
        editMeetingPhone, setEditMeetingPhone,
    } = drawer;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Left column: Main content */}
            <div className="space-y-6">
                {/* Contact */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Contact</h3>
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                        <p className="text-lg font-semibold text-slate-900">
                            {meeting.contact.firstName} {meeting.contact.lastName}
                        </p>
                        {meeting.contact.title && (
                            <p className="text-slate-500 text-sm mb-4">
                                <span className="font-semibold uppercase text-xs tracking-wide text-slate-400 mr-1">
                                    Fonction
                                </span>
                                <span className="text-slate-600 normal-case text-sm">
                                    {meeting.contact.title}
                                </span>
                            </p>
                        )}
                        <div className="space-y-2">
                            {meeting.contact.email && (
                                <a href={`mailto:${meeting.contact.email}`} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                        <Mail className="w-4 h-4 text-slate-500 group-hover:text-indigo-600" />
                                    </div>
                                    <span className="text-sm text-slate-700 group-hover:text-indigo-700">{meeting.contact.email}</span>
                                </a>
                            )}
                            {meeting.contact.phone && (
                                <a href={`tel:${meeting.contact.phone}`} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                        <Phone className="w-4 h-4 text-slate-500 group-hover:text-indigo-600" />
                                    </div>
                                    <span className="text-sm text-slate-700 group-hover:text-indigo-700">{meeting.contact.phone}</span>
                                </a>
                            )}
                            {(meeting.contact.linkedin ? (
                                <a href={meeting.contact.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                        <Linkedin className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-sm text-slate-700 group-hover:text-blue-700">Voir le profil LinkedIn</span>
                                </a>
                            ) : (
                                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 text-slate-400">
                                    <Linkedin className="w-4 h-4" />
                                    <span className="text-sm">Non renseigné</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Société */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Société</h3>
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                <Building2 className="w-6 h-6 text-slate-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900 text-lg">{meeting.contact.company.name}</p>
                                {meeting.contact.company.website && (
                                    <a href={meeting.contact.company.website} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                                        {meeting.contact.company.website.replace(/^https?:\/\//, "")} <ArrowRight className="w-3 h-3" />
                                    </a>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {meeting.contact.company.industry && (
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-xs text-slate-500 uppercase font-medium">Secteur</p>
                                    <p className="font-medium text-slate-900 text-sm mt-0.5">{meeting.contact.company.industry}</p>
                                </div>
                            )}
                            {meeting.contact.company.country && (
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-xs text-slate-500 uppercase font-medium">Pays</p>
                                    <p className="font-medium text-slate-900 text-sm mt-0.5">{meeting.contact.company.country}</p>
                                </div>
                            )}
                            {meeting.contact.company.size && (
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-xs text-slate-500 uppercase font-medium">Effectif</p>
                                    <p className="font-medium text-slate-900 text-sm mt-0.5">{meeting.contact.company.size}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Infos du RDV */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Informations du RDV</h3>
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
                        <DateTimePicker
                            label="Date & heure"
                            value={editCallbackDate}
                            onChange={setEditCallbackDate}
                            placeholder="Choisir date et heure…"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Format</label>
                                <Select
                                    value={editMeetingType}
                                    onChange={(v) => setEditMeetingType(v as "" | "VISIO" | "PHYSIQUE" | "TELEPHONIQUE")}
                                    options={[
                                        { value: "", label: "Non précisé" },
                                        { value: "VISIO", label: "Visio" },
                                        { value: "PHYSIQUE", label: "Physique" },
                                        { value: "TELEPHONIQUE", label: "Téléphonique" },
                                    ]}
                                    className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Catégorie</label>
                                <Select
                                    value={editMeetingCategory}
                                    onChange={(v) => setEditMeetingCategory(v as "" | "EXPLORATOIRE" | "BESOIN")}
                                    options={[
                                        { value: "", label: "Non précisée" },
                                        { value: "EXPLORATOIRE", label: "Exploratoire" },
                                        { value: "BESOIN", label: "Analyse de besoin" },
                                    ]}
                                    className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2"
                                />
                            </div>
                        </div>
                        {(editMeetingType === "PHYSIQUE" || (!editMeetingType && meeting.meetingAddress)) && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Adresse</label>
                                <input
                                    value={editMeetingAddress}
                                    onChange={(e) => setEditMeetingAddress(e.target.value)}
                                    placeholder="Adresse du rendez-vous"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                />
                            </div>
                        )}
                        {(editMeetingType === "VISIO" || (!editMeetingType && meeting.meetingJoinUrl)) && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Lien visio</label>
                                <input
                                    value={editMeetingJoinUrl}
                                    onChange={(e) => setEditMeetingJoinUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                />
                            </div>
                        )}
                        {(editMeetingType === "TELEPHONIQUE" || (!editMeetingType && (meeting.meetingPhone || meeting.contact.phone))) && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Téléphone RDV</label>
                                <input
                                    value={editMeetingPhone}
                                    onChange={(e) => setEditMeetingPhone(e.target.value)}
                                    placeholder={meeting.contact.phone ?? "+33 ..."}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Note de prise de RDV */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Note de prise de RDV</h3>
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4">
                        <textarea
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Ajouter ou modifier une note..."
                            className="w-full min-h-[100px] bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-700 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y"
                            rows={3}
                        />
                    </div>
                </div>
            </div>

            {/* Right column: Summary */}
            <div className="space-y-5">
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Récapitulatif</h3>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-medium mb-0.5">Date & Heure</p>
                            <p className="font-semibold text-slate-900">{editCallbackDate ? new Date(editCallbackDate).toLocaleString("fr-FR") : formatScheduledDate(meeting)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-medium mb-2">Statut</p>
                            <Select
                                value={editResult}
                                onChange={(v) => {
                                    if (v === "MEETING_CANCELLED") onOpenCancel(meeting);
                                    else setEditResult(v as MeetingResult);
                                }}
                                options={[
                                    { value: "MEETING_BOOKED", label: "Confirmé" },
                                    { value: "MEETING_CANCELLED", label: "Annulé" },
                                ]}
                                className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2"
                            />
                        </div>
                        {editResult === "MEETING_CANCELLED" && (
                            <div className="space-y-2">
                                {meeting.cancellationReason && (
                                    <p className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
                                        Raison : {getMeetingCancellationLabel(meeting.cancellationReason)}
                                    </p>
                                )}
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    Le contact redevient disponible dans la file de prospection.
                                </p>
                            </div>
                        )}
                        <div className="pt-3 border-t border-slate-200 space-y-2">
                            <p className="text-xs text-slate-500 uppercase font-medium">Lieu</p>
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                                {editMeetingType === "VISIO" && <><Video className="w-4 h-4 text-indigo-500 shrink-0" /><span>Visio Conférence</span></>}
                                {editMeetingType === "PHYSIQUE" && <><User className="w-4 h-4 text-indigo-500 shrink-0" /><span>Physique {editMeetingAddress ? `(${editMeetingAddress})` : ""}</span></>}
                                {editMeetingType === "TELEPHONIQUE" && <><Phone className="w-4 h-4 text-indigo-500 shrink-0" /><span>Appel téléphonique</span></>}
                                {!editMeetingType && <><Video className="w-4 h-4 text-indigo-500 shrink-0" /><span>Visio Conférence</span></>}
                            </div>
                            {editMeetingType === "VISIO" && editMeetingJoinUrl && (
                                <a href={editMeetingJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
                                    <Video className="w-4 h-4" /> Rejoindre
                                </a>
                            )}
                            {editMeetingType === "PHYSIQUE" && editMeetingAddress && (
                                <a href={`https://maps.google.com/?q=${encodeURIComponent(editMeetingAddress)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                                    <MapPin className="w-4 h-4" /> Itinéraire
                                </a>
                            )}
                            {editMeetingType === "TELEPHONIQUE" && (editMeetingPhone || meeting.contact.phone) && (
                                <a href={`tel:${editMeetingPhone || meeting.contact.phone}`} className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                                    <Phone className="w-4 h-4" /> Appeler
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {meeting.mission && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Mission</h3>
                        <div className="space-y-2">
                            <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                <span className="text-sm font-medium text-slate-700">{meeting.mission.name}</span>
                            </div>
                            {meeting.mission.client && (
                                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-2">
                                    <User className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="text-sm font-medium text-slate-700">{meeting.mission.client.name}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {editResult === "MEETING_BOOKED" && (
                    <div className="space-y-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenReschedule(meeting)}
                            className="w-full justify-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg"
                        >
                            <CalendarClock className="w-4 h-4" />
                            Reprogrammer le RDV
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenCancel(meeting)}
                            disabled={isCancelling}
                            className="w-full justify-center gap-2 text-amber-700 hover:bg-amber-50 rounded-lg"
                        >
                            {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            Annuler le RDV
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
