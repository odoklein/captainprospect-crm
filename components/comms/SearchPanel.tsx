"use client";

// ============================================
// SearchPanel - Full-featured comms search
// ============================================

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Search,
    X,
    Filter,
    Star,
    Loader2,
    MessageSquare,
    FileText,
    ChevronDown,
    Bookmark,
    Trash2,
} from "lucide-react";
import type { CommsChannelType, CommsThreadStatus } from "@/lib/comms/types";

// Types matching API response
interface SearchResult {
    id: string;
    type: "message" | "thread";
    threadId: string;
    threadSubject: string;
    channelType: CommsChannelType;
    channelName: string;
    content: string;
    highlightedContent: string;
    author: { id: string; name: string };
    createdAt: string;
}

interface SearchResponse {
    results: SearchResult[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

interface SavedSearch {
    id: string;
    name: string;
    query: string;
    filters?: {
        channelType?: CommsChannelType;
        authorId?: string;
        fromDate?: string;
        toDate?: string;
        status?: CommsThreadStatus;
    };
    createdAt: string;
}

interface SearchPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onResultClick: (threadId: string, messageId?: string) => void;
    className?: string;
}

const CHANNEL_OPTIONS: { value: CommsChannelType | ""; label: string }[] = [
    { value: "", label: "Tous les canaux" },
    { value: "MISSION", label: "Missions" },
    { value: "CLIENT", label: "Clients" },
    { value: "CAMPAIGN", label: "Campagnes" },
    { value: "GROUP", label: "Groupes" },
    { value: "DIRECT", label: "Directs" },
    { value: "BROADCAST", label: "Annonces" },
];

const STATUS_OPTIONS: { value: CommsThreadStatus | ""; label: string }[] = [
    { value: "", label: "Tous les statuts" },
    { value: "OPEN", label: "Ouvert" },
    { value: "RESOLVED", label: "Résolu" },
    { value: "ARCHIVED", label: "Archivé" },
];

export function SearchPanel({
    isOpen,
    onClose,
    onResultClick,
    className,
}: SearchPanelProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // Filters
    const [showFilters, setShowFilters] = useState(false);
    const [channelType, setChannelType] = useState<CommsChannelType | "">("");
    const [status, setStatus] = useState<CommsThreadStatus | "">("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    // Saved searches
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Load saved searches on mount
    useEffect(() => {
        if (isOpen) {
            fetchSavedSearches();
        }
    }, [isOpen]);

    const fetchSavedSearches = async () => {
        try {
            const res = await fetch("/api/comms/saved-searches");
            if (res.ok) {
                const data = await res.json();
                setSavedSearches(data);
            }
        } catch (error) {
            console.error("Failed to fetch saved searches:", error);
        }
    };

    const performSearch = useCallback(
        async (searchQuery: string, pageNum = 1, append = false) => {
            if (searchQuery.trim().length < 2) {
                if (!append) {
                    setResults([]);
                    setTotal(0);
                }
                return;
            }

            setIsLoading(true);

            try {
                const params = new URLSearchParams({
                    q: searchQuery,
                    page: String(pageNum),
                    pageSize: "20",
                });

                if (channelType) params.set("type", channelType);
                if (status) params.set("status", status);
                if (fromDate) params.set("from", fromDate);
                if (toDate) params.set("to", toDate);

                const res = await fetch(`/api/comms/search?${params}`);

                if (res.ok) {
                    const data: SearchResponse = await res.json();
                    if (append) {
                        setResults((prev) => [...prev, ...data.results]);
                    } else {
                        setResults(data.results);
                    }
                    setTotal(data.total);
                    setHasMore(data.hasMore);
                    setPage(pageNum);
                }
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setIsLoading(false);
            }
        },
        [channelType, status, fromDate, toDate]
    );

    // Debounced search
    const handleQueryChange = (value: string) => {
        setQuery(value);

        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        searchTimeout.current = setTimeout(() => {
            performSearch(value);
        }, 300);
    };

    const handleLoadMore = () => {
        if (!isLoading && hasMore) {
            performSearch(query, page + 1, true);
        }
    };

    const handleResultClick = (result: SearchResult) => {
        onResultClick(
            result.threadId,
            result.type === "message" ? result.id : undefined
        );
        onClose();
    };

    const handleSaveSearch = async () => {
        if (!saveName.trim() || !query.trim()) return;

        try {
            const res = await fetch("/api/comms/saved-searches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: saveName,
                    query,
                    filters: {
                        channelType: channelType || undefined,
                        status: status || undefined,
                        fromDate: fromDate || undefined,
                        toDate: toDate || undefined,
                    },
                }),
            });

            if (res.ok) {
                setSaveName("");
                setShowSaveDialog(false);
                fetchSavedSearches();
            }
        } catch (error) {
            console.error("Failed to save search:", error);
        }
    };

    const handleDeleteSavedSearch = async (searchId: string) => {
        try {
            await fetch(`/api/comms/saved-searches?id=${searchId}`, {
                method: "DELETE",
            });
            setSavedSearches((prev) => prev.filter((s) => s.id !== searchId));
        } catch (error) {
            console.error("Failed to delete saved search:", error);
        }
    };

    const handleLoadSavedSearch = (saved: SavedSearch) => {
        setQuery(saved.query);
        setChannelType(saved.filters?.channelType || "");
        setStatus(saved.filters?.status || "");
        setFromDate(saved.filters?.fromDate || "");
        setToDate(saved.filters?.toDate || "");
        setShowSaved(false);
        performSearch(saved.query);
    };

    const handleClear = () => {
        setQuery("");
        setResults([]);
        setTotal(0);
        setChannelType("");
        setStatus("");
        setFromDate("");
        setToDate("");
    };

    if (!isOpen) return null;

    return (
        <div
            className={cn(
                "fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20",
                className
            )}
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <Search className="w-5 h-5 text-slate-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder="Rechercher dans les messages..."
                            className="flex-1 bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
                        />
                        {isLoading && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
                        {query && (
                            <button
                                onClick={handleClear}
                                className="p-1 rounded hover:bg-slate-100"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        )}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                showFilters
                                    ? "bg-primary-100 text-primary-600"
                                    : "hover:bg-slate-100 text-slate-500"
                            )}
                        >
                            <Filter className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowSaved(!showSaved)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                showSaved
                                    ? "bg-amber-100 text-amber-600"
                                    : "hover:bg-slate-100 text-slate-500"
                            )}
                        >
                            <Bookmark className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Filters */}
                    {showFilters && (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Canal</label>
                                <select
                                    value={channelType}
                                    onChange={(e) => {
                                        setChannelType(e.target.value as CommsChannelType | "");
                                        if (query) performSearch(query);
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                >
                                    {CHANNEL_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Statut</label>
                                <select
                                    value={status}
                                    onChange={(e) => {
                                        setStatus(e.target.value as CommsThreadStatus | "");
                                        if (query) performSearch(query);
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Du</label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => {
                                        setFromDate(e.target.value);
                                        if (query) performSearch(query);
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Au</label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => {
                                        setToDate(e.target.value);
                                        if (query) performSearch(query);
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {/* Saved searches dropdown */}
                    {showSaved && (
                        <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-600 flex items-center justify-between">
                                <span>Recherches sauvegardées</span>
                                {query && (
                                    <button
                                        onClick={() => setShowSaveDialog(true)}
                                        className="text-primary-600 hover:text-primary-700"
                                    >
                                        + Sauvegarder
                                    </button>
                                )}
                            </div>
                            {savedSearches.length === 0 ? (
                                <div className="px-3 py-4 text-sm text-slate-400 text-center">
                                    Aucune recherche sauvegardée
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                    {savedSearches.map((saved) => (
                                        <div
                                            key={saved.id}
                                            className="px-3 py-2 flex items-center justify-between hover:bg-slate-50"
                                        >
                                            <button
                                                onClick={() => handleLoadSavedSearch(saved)}
                                                className="flex-1 text-left"
                                            >
                                                <div className="text-sm font-medium text-slate-700">
                                                    {saved.name}
                                                </div>
                                                <div className="text-xs text-slate-400">{saved.query}</div>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSavedSearch(saved.id)}
                                                className="p-1 text-slate-400 hover:text-red-500"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {showSaveDialog && (
                                <div className="p-3 border-t border-slate-200 bg-slate-50">
                                    <input
                                        type="text"
                                        value={saveName}
                                        onChange={(e) => setSaveName(e.target.value)}
                                        placeholder="Nom de la recherche..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2"
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowSaveDialog(false)}
                                            className="flex-1 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded"
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            onClick={handleSaveSearch}
                                            disabled={!saveName.trim()}
                                            className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded disabled:opacity-50"
                                        >
                                            Sauvegarder
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {results.length === 0 && query.length >= 2 && !isLoading ? (
                        <div className="p-8 text-center text-slate-400">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>Aucun résultat pour "{query}"</p>
                        </div>
                    ) : results.length === 0 && query.length < 2 ? (
                        <div className="p-8 text-center text-slate-400">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>Tapez au moins 2 caractères pour rechercher</p>
                        </div>
                    ) : (
                        <>
                            {total > 0 && (
                                <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                                    {total} résultat{total > 1 ? "s" : ""}
                                </div>
                            )}
                            <div className="divide-y divide-slate-100">
                                {results.map((result) => (
                                    <button
                                        key={`${result.type}-${result.id}`}
                                        onClick={() => handleResultClick(result)}
                                        className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                                    result.type === "thread"
                                                        ? "bg-primary-100 text-primary-600"
                                                        : "bg-slate-100 text-slate-600"
                                                )}
                                            >
                                                {result.type === "thread" ? (
                                                    <FileText className="w-4 h-4" />
                                                ) : (
                                                    <MessageSquare className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-medium text-slate-900 truncate">
                                                        {result.threadSubject}
                                                    </span>
                                                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                                                        {result.channelName}
                                                    </span>
                                                </div>
                                                <div
                                                    className="text-sm text-slate-600 line-clamp-2"
                                                    dangerouslySetInnerHTML={{
                                                        __html: result.highlightedContent,
                                                    }}
                                                />
                                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                                    <span>{result.author.name}</span>
                                                    <span>•</span>
                                                    <span>
                                                        {format(new Date(result.createdAt), "d MMM yyyy", {
                                                            locale: fr,
                                                        })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {hasMore && (
                                <div className="p-4 text-center">
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={isLoading}
                                        className="px-4 py-2 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 inline mr-1" />
                                        )}
                                        Charger plus
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SearchPanel;
