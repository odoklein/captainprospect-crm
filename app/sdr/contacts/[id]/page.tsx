"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import {
    ArrowLeft,
    User,
    Mail,
    Phone,
    Building2,
    Linkedin,
    Loader2,
    ExternalLink,
} from "lucide-react";

interface ContactDetail {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    linkedin: string | null;
    company: {
        id: string;
        name: string;
        industry: string | null;
        list?: {
            id: string;
            name: string;
            mission: { id: string; name: string; client: { id: string; name: string } };
        };
    };
    _count: { actions: number; opportunities: number };
}

export default function SDRContactFichePage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    const [contact, setContact] = useState<ContactDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const fetchContact = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/contacts/${id}`);
                const json = await res.json();
                if (json.success) {
                    setContact(json.data);
                } else {
                    setError(json.error || "Contact non trouvé");
                }
            } catch (err) {
                setError("Impossible de charger le contact");
            } finally {
                setLoading(false);
            }
        };
        fetchContact();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
        );
    }

    if (error || !contact) {
        return (
            <div className="p-6 max-w-lg mx-auto text-center">
                <p className="text-slate-600 mb-4">{error || "Contact non trouvé"}</p>
                <Button variant="primary" onClick={() => router.push("/sdr")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour au dashboard
                </Button>
            </div>
        );
    }

    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Sans nom";

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/sdr">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Retour
                    </Button>
                </Link>
            </div>

            <Card className="!p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <User className="w-7 h-7 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-slate-900">{fullName}</h1>
                        {contact.title && (
                            <p className="text-slate-500 text-sm mt-0.5">{contact.title}</p>
                        )}
                        {contact.company && (
                            <Link
                                href={`/sdr/companies/${contact.company.id}`}
                                className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm mt-2"
                            >
                                <Building2 className="w-4 h-4" />
                                Voir la fiche entreprise · {contact.company.name}
                                <ExternalLink className="w-3 h-3" />
                            </Link>
                        )}
                    </div>
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-6">
                    {contact.email && (
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-slate-400" />
                            <a href={`mailto:${contact.email}`} className="text-slate-700 hover:text-primary-600">
                                {contact.email}
                            </a>
                        </div>
                    )}
                    {contact.phone && (
                        <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-slate-400" />
                            <a href={`tel:${contact.phone}`} className="text-slate-700 hover:text-primary-600">
                                {contact.phone}
                            </a>
                        </div>
                    )}
                    {contact.linkedin && (
                        <div className="flex items-center gap-3">
                            <Linkedin className="w-5 h-5 text-slate-400" />
                            <a
                                href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-700 hover:text-primary-600"
                            >
                                Profil LinkedIn
                            </a>
                        </div>
                    )}
                    {!contact.email && !contact.phone && !contact.linkedin && (
                        <p className="text-slate-500 text-sm">Aucune coordonnée renseignée</p>
                    )}
                </div>

                <div className="flex gap-4 mt-6 pt-4 border-t border-slate-100 text-sm text-slate-500">
                    <span>{contact._count.actions} action(s)</span>
                    <span>{contact._count.opportunities} opportunité(s)</span>
                </div>
            </Card>
        </div>
    );
}
