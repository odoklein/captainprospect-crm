"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import {
    ArrowLeft,
    Building2,
    User,
    Globe,
    Loader2,
    ChevronRight,
} from "lucide-react";

interface ContactInCompany {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
}

interface CompanyDetail {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    contacts: ContactInCompany[];
    list?: {
        id: string;
        name: string;
        mission: { id: string; name: string; client: { id: string; name: string } };
    };
    _count: { contacts: number; opportunities: number };
}

export default function SDRCompanyFichePage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    const [company, setCompany] = useState<CompanyDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const fetchCompany = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/companies/${id}`);
                const json = await res.json();
                if (json.success) {
                    setCompany(json.data);
                } else {
                    setError(json.error || "Société non trouvée");
                }
            } catch (err) {
                setError("Impossible de charger la société");
            } finally {
                setLoading(false);
            }
        };
        fetchCompany();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
        );
    }

    if (error || !company) {
        return (
            <div className="p-6 max-w-lg mx-auto text-center">
                <p className="text-slate-600 mb-4">{error || "Société non trouvée"}</p>
                <Button variant="primary" onClick={() => router.push("/sdr")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour au dashboard
                </Button>
            </div>
        );
    }

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
                        <Building2 className="w-7 h-7 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-slate-900">{company.name}</h1>
                        {company.industry && (
                            <p className="text-slate-500 text-sm mt-0.5">{company.industry}</p>
                        )}
                        {company.list?.mission && (
                            <p className="text-slate-400 text-xs mt-1">
                                {company.list.mission.client.name} · {company.list.mission.name}
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-6">
                    {company.website && (
                        <div className="flex items-center gap-3">
                            <Globe className="w-5 h-5 text-slate-400" />
                            <a
                                href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-700 hover:text-primary-600"
                            >
                                {company.website}
                            </a>
                        </div>
                    )}
                    {company.country && (
                        <div className="flex items-center gap-3">
                            <span className="text-slate-500 text-sm">Pays : {company.country}</span>
                        </div>
                    )}
                    {company.size && (
                        <div className="flex items-center gap-3">
                            <span className="text-slate-500 text-sm">Effectif : {company.size}</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-4 mt-6 pt-4 border-t border-slate-100 text-sm text-slate-500">
                    <span>{company._count.contacts} contact(s)</span>
                    <span>{company._count.opportunities} opportunité(s)</span>
                </div>
            </Card>

            {company.contacts && company.contacts.length > 0 && (
                <Card className="!p-6">
                    <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-primary-500" />
                        Contacts
                    </h2>
                    <ul className="space-y-2">
                        {company.contacts.map((contact) => {
                            const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Sans nom";
                            return (
                                <li key={contact.id}>
                                    <Link
                                        href={`/sdr/contacts/${contact.id}`}
                                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-primary-50 transition-colors group"
                                    >
                                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                            <User className="w-4 h-4 text-slate-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-900 group-hover:text-primary-600 truncate">
                                                {fullName}
                                            </p>
                                            {contact.title && (
                                                <p className="text-xs text-slate-500 truncate">{contact.title}</p>
                                            )}
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            )}
        </div>
    );
}
