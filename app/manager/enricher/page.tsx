'use client';
// brand-check-ignore-file: intentional neon "terminal" UI, deliberately off-brand

import React, { useCallback, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Download, FileSpreadsheet, Pause, Phone, Play, X } from 'lucide-react';

const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 2;

const FAKE_NUMBERS = new Set([
    '0000000000', '1111111111', '2222222222', '3333333333', '4444444444',
    '5555555555', '6666666666', '7777777777', '8888888888', '9999999999',
    '1234567890', '0123456789', '0606060606',
]);

function isValidPhone(phone: string): boolean {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return false;
    if (FAKE_NUMBERS.has(digits)) return false;
    if (/^(.)\1{6,}$/.test(digits)) return false;
    return true;
}

function normalizePhone(phone: string): string {
    if (!phone) return '';
    if (/^\+\d{8,15}$/.test(phone.replace(/\s/g, ''))) return phone.replace(/\s/g, '');
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('33') && digits.length === 11) return '+' + digits;
    if (digits.startsWith('0') && digits.length === 10 && /^0[1-9]/.test(digits)) {
        return '+33' + digits.substring(1);
    }
    return phone;
}

function esc(str: string): string {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fuzzyScore(fieldName: string, keywords: string[]): number {
    const name = String(fieldName || '').toLowerCase().replace(/[\s\-_]+/g, '');
    let best = 0;
    for (const kw of keywords) {
        const k = kw.toLowerCase().replace(/[\s\-_]+/g, '');
        if (name === k) return 100;
        if (name.includes(k) || k.includes(name)) best = Math.max(best, 80);
        const words = name.split(/_|-|\s/);
        if (words.includes(k) || words.some((w) => w.startsWith(k))) best = Math.max(best, 70);
        if (name.startsWith(k) || k.startsWith(name)) best = Math.max(best, 50);
    }
    return best;
}

interface EnrichRow {
    index: number;
    original: Record<string, unknown>;
    status: 'pending' | 'processing' | 'found' | 'not_found' | 'error';
    phone_number: string;
    phone_source: string;
    confidence_score: number;
    log: string[];
    expanded: boolean;
}

export default function EnricherPage() {
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [results, setResults] = useState<EnrichRow[]>([]);
    const [detectedFormat, setDetectedFormat] = useState('');
    const [columnMapping, setColumnMapping] = useState({ company: '', website: '', address: '' });
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [logEntries, setLogEntries] = useState<{ ts: string; type: string; msg: string }[]>([
        { ts: '+0.0s', type: 'info', msg: '// Pipeline initialisé — en attente du démarrage' },
    ]);
    const shouldStopRef = useRef(false);
    const isPausedRef = useRef(false);
    const startTimeRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    isPausedRef.current = isPaused;

    const addLog = useCallback((type: string, msg: string) => {
        const elapsed = startTimeRef.current ? ((Date.now() - startTimeRef.current) / 1000).toFixed(1) : '0.0';
        setLogEntries((prev) => [...prev, { ts: `+${elapsed}s`, type, msg }]);
    }, []);

    const detectFormat = useCallback((fields: string[]): string => {
        const f = fields.map((x) => x.toLowerCase().trim());
        if (f.includes('website') && f.includes('company_name')) return 'Format A (company_name + website)';
        if (f.includes('address') && f.includes('company_name')) return 'Format B (company_name + address)';
        if (f.includes('website') && !f.includes('company_name')) return 'Format C (website only)';
        if (f.includes('company_name') && !f.includes('website') && !f.includes('address')) return 'Format D (company_name only)';
        if (f.some((x) => x.includes('web') || x.includes('url') || x.includes('site'))) return 'Format A/C (website détecté)';
        return 'Inconnu (Format D)';
    }, []);

    const buildColumnMapping = useCallback(
        (fields: string[]) => {
            const companyKw = ['company_name', 'company', 'companyname', 'name', 'nom', 'firma', 'entreprise', 'organization'];
            const websiteKw = ['website', 'url', 'web', 'site', 'domain', 'website_url', 'site_url', 'homepage', 'link'];
            const addressKw = ['address', 'adresse', 'addr', 'location', 'street', 'adres', 'adr', 'lieu'];

            function findBest(f: string[], keywords: string[]): string {
                let best = '';
                let bestScore = 0;
                for (const field of f) {
                    const score = fuzzyScore(field, keywords);
                    if (score > bestScore) {
                        bestScore = score;
                        best = field;
                    }
                }
                return best;
            }

            const map = {
                company: findBest(fields, companyKw),
                website: findBest(fields, websiteKw),
                address: findBest(fields, addressKw),
            };
            setColumnMapping(map);
            addLog('info', `Mapping: Company→${map.company || '—'}, Website→${map.website || '—'}, Address→${map.address || '—'}`);
        },
        [addLog]
    );

    const handleFile = useCallback(
        (file: File) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (parsed) => {
                    const data = parsed.data as Record<string, unknown>[];
                    const fields = parsed.meta.fields || [];
                    const fmt = detectFormat(fields);
                    setRows(data);
                    setDetectedFormat(fmt);
                    setResults(
                        data.map((r, i) => ({
                            index: i,
                            original: r,
                            status: 'pending' as const,
                            phone_number: '',
                            phone_source: '',
                            confidence_score: 0,
                            log: [],
                            expanded: false,
                        }))
                    );
                    buildColumnMapping(fields);
                    addLog('info', `Fichier chargé: ${file.name} — ${data.length} lignes — Format: ${fmt}`);
                },
                error: (err) => alert('Erreur CSV: ' + (err as Error).message),
            });
        },
        [detectFormat, buildColumnMapping, addLog]
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file?.name.endsWith('.csv')) handleFile(file);
        },
        [handleFile]
    );

    const enrichRow = useCallback(
        async (item: EnrichRow): Promise<void> => {
            const row = item.original;
            const getMapped = (key: keyof typeof columnMapping) => {
                const col = columnMapping[key];
                if (!col || !(col in row)) return '';
                const val = row[col];
                return val != null && String(val).trim() ? String(val).trim() : '';
            };
            const getField = (names: string[]) => {
                for (const n of names) {
                    const key = Object.keys(row).find((k) => k.toLowerCase().trim() === n.toLowerCase());
                    if (key && row[key]) return String(row[key]).trim();
                }
                return '';
            };

            const company = getMapped('company') || getField(['company_name', 'company', 'name', 'nom']);
            const address = getMapped('address') || getField(['address', 'adresse', 'addr']);
            const website = getMapped('website') || getField(['website', 'url', 'site', 'domain', 'web']);

            const strategy = website ? 'website scrape' : 'web search fallback';
            item.log.push(`[START] company="${company}" website="${website}" strategy="${strategy}"`);

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const resp = await fetch('/api/enricher/serp-lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            company_name: company || undefined,
                            address: address || undefined,
                            website: website || undefined,
                        }),
                    });
                    const json = await resp.json();
                    if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);

                    const data = json.data as { phone_number?: string; source?: string; confidence?: number };
                    if (data.phone_number && isValidPhone(data.phone_number)) {
                        item.phone_number = normalizePhone(data.phone_number);
                        item.phone_source = data.source || 'website_scrape';
                        item.confidence_score = Math.min(100, Math.max(0, data.confidence || 50));
                        item.status = 'found';
                        item.log.push(`[SUCCESS] ${item.phone_number} via ${data.source} (${item.confidence_score}%)`);
                        return;
                    }
                    item.log.push('[NOT FOUND] Aucun téléphone trouvé');
                    item.status = 'not_found';
                    return;
                } catch (e) {
                    item.log.push(`[RETRY ${attempt + 1}] ${(e as Error).message}`);
                    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                    else {
                        item.status = 'error';
                        item.log.push(`[ERROR] ${(e as Error).message}`);
                    }
                }
            }
        },
        [columnMapping]
    );

    const startEnrichment = useCallback(async () => {
        if (isRunning) return;
        setIsRunning(true);
        setIsPaused(false);
        shouldStopRef.current = false;
        startTimeRef.current = Date.now();
        addLog('info', 'Enrichissement démarré — Website Scraper + Web Search fallback');

        const pending = results.filter((r) => r.status === 'pending');
        let idx = 0;

        async function worker() {
            while (idx < pending.length && !shouldStopRef.current) {
                if (isPausedRef.current) {
                    await new Promise((r) => setTimeout(r, 300));
                    continue;
                }
                const item = pending[idx++];
                if (!item) continue;

                setResults((prev) =>
                    prev.map((r) => (r.index === item.index ? { ...r, status: 'processing' } : r))
                );
                try {
                    await enrichRow(item);
                    setResults((prev) =>
                        prev.map((r) => (r.index === item.index ? { ...r, ...item } : r))
                    );
                    addLog(
                        item.status === 'found' ? 'ok' : 'warn',
                        `Ligne ${item.index + 1} [${item.original[columnMapping.company] || item.original[columnMapping.website]}] → ${item.status === 'found' ? item.phone_number : 'non trouvé'}`
                    );
                } catch (e) {
                    setResults((prev) =>
                        prev.map((r) => (r.index === item.index ? { ...r, status: 'error' } : r))
                    );
                    addLog('err', `Ligne ${item.index + 1}: Erreur — ${(e as Error).message}`);
                }
            }
        }

        const workers = Array(MAX_CONCURRENCY).fill(0).map(() => worker());
        await Promise.all(workers);

        setIsRunning(false);
        const found = pending.filter((r) => r.status === 'found').length;
        addLog('ok', `Terminé — ${found}/${rows.length} téléphones trouvés`);
    }, [isRunning, isPaused, results, rows.length, enrichRow, columnMapping, addLog]);

    const pauseEnrichment = useCallback(() => {
        if (!isRunning) return;
        setIsPaused((p) => !p);
        addLog('warn', isPaused ? 'Repris' : 'Pause');
    }, [isRunning, isPaused, addLog]);

    const exportCSV = useCallback(() => {
        const origFields = results[0] ? Object.keys(results[0].original) : [];
        const allFields = [...origFields, 'phone_number', 'phone_source', 'confidence_score', 'status'];
        const data = results.map((r) => ({
            ...r.original,
            phone_number: r.phone_number || '',
            phone_source: r.phone_source || '',
            confidence_score: r.confidence_score || 0,
            status: r.status,
        }));
        const csv = Papa.unparse(data, { columns: allFields });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enriched_phones_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('ok', `Export ${results.length} lignes`);
    }, [results, addLog]);

    const resetAll = useCallback(() => {
        shouldStopRef.current = true;
        setIsRunning(false);
        setRows([]);
        setResults([]);
        setColumnMapping({ company: '', website: '', address: '' });
        setLogEntries([{ ts: '+0.0s', type: 'info', msg: '// Pipeline initialisé' }]);
    }, []);

    const toggleLog = useCallback((i: number) => {
        setResults((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, expanded: !r.expanded } : r))
        );
    }, []);

    const processed = results.filter((r) => !['pending', 'processing'].includes(r.status)).length;
    const found = results.filter((r) => r.status === 'found').length;
    const notFound = results.filter((r) => r.status === 'not_found').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const pct = rows.length ? Math.round((processed / rows.length) * 100) : 0;
    const showProcessing = rows.length > 0;
    const origFields = results[0] ? Object.keys(results[0].original) : [];
    const fieldsForSelect = origFields.length > 0 ? origFields : [];

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] p-6 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="mb-12">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-md bg-[#00ff88] flex items-center justify-center text-black"><Phone className="w-4 h-4" /></div>
                        <h1 className="text-xl font-semibold font-mono">
                            Company Phone Enricher{' '}
                            <span className="text-xs px-2 py-0.5 rounded border border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88] ml-2">
                                Website Scraper
                            </span>
                        </h1>
                    </div>
                    <p className="text-sm text-[#666680] font-mono">
                        // Enrichissement téléphone via scraping du site web — fallback web search si pas de site
                    </p>
                </div>

                {/* Upload zone */}
                {!showProcessing && (
                    <div
                        className="border-2 border-dashed border-[#2a2a3a] rounded-xl p-12 text-center cursor-pointer hover:border-[#00ff88] hover:bg-[#00ff88]/5 transition-all bg-[#111118]"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-[#666680]" />
                        <div className="font-mono text-base mb-2">Déposez votre fichier CSV</div>
                        <div className="text-sm text-[#666680] mb-4">
                            ou cliquez pour parcourir — mapping auto des colonnes Company, Website, Address
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                            }}
                        />
                        <button
                            type="button"
                            className="mt-4 px-6 py-2.5 rounded-md bg-[#00ff88] text-black font-mono font-semibold text-sm hover:bg-[#00dd77]"
                        >
                            Choisir un fichier
                        </button>
                    </div>
                )}

                {/* Processing section */}
                {showProcessing && (
                    <div className="space-y-6">
                        {/* Column mapping */}
                        <div className="bg-[#111118] border border-[#2a2a3a] rounded-lg p-4">
                            <div className="text-xs font-mono uppercase tracking-wider text-[#666680] mb-4">01 — Map des colonnes</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-[#666680] mb-1">Company *</label>
                                    <select
                                        className="w-full bg-[#0a0a0f] border border-[#2a2a3a] text-white px-3 py-2 rounded text-sm font-mono"
                                        value={columnMapping.company}
                                        onChange={(e) => setColumnMapping((m) => ({ ...m, company: e.target.value }))}
                                    >
                                        <option value="">— sélectionner —</option>
                                        {fieldsForSelect.map((f) => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-[#666680] mb-1">Website</label>
                                    <select
                                        className="w-full bg-[#0a0a0f] border border-[#2a2a3a] text-white px-3 py-2 rounded text-sm font-mono"
                                        value={columnMapping.website}
                                        onChange={(e) => setColumnMapping((m) => ({ ...m, website: e.target.value }))}
                                    >
                                        <option value="">— sélectionner —</option>
                                        {fieldsForSelect.map((f) => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-mono text-[#666680] mb-1">Address</label>
                                    <select
                                        className="w-full bg-[#0a0a0f] border border-[#2a2a3a] text-white px-3 py-2 rounded text-sm font-mono"
                                        value={columnMapping.address}
                                        onChange={(e) => setColumnMapping((m) => ({ ...m, address: e.target.value }))}
                                    >
                                        <option value="">— sélectionner —</option>
                                        {fieldsForSelect.map((f) => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-5 gap-3">
                            {[
                                { v: rows.length, l: 'Total', c: '' },
                                { v: processed, l: 'Traités', c: 'text-[#0088ff]' },
                                { v: found, l: 'Trouvés', c: 'text-[#00ff88]' },
                                { v: notFound, l: 'Non trouvés', c: 'text-[#ffaa00]' },
                                { v: errors, l: 'Erreurs', c: 'text-[#ff4455]' },
                            ].map(({ v, l, c }) => (
                                <div key={l} className="bg-[#111118] border border-[#2a2a3a] rounded-lg p-4 text-center">
                                    <div className={`font-mono text-2xl font-semibold ${c}`}>{v}</div>
                                    <div className="text-xs text-[#666680] font-mono uppercase">{l}</div>
                                </div>
                            ))}
                        </div>

                        {/* Progress */}
                        <div>
                            <div className="flex justify-between text-xs font-mono mb-1">
                                <span className="text-[#666680]">
                                    {isRunning ? `En cours… (${processed}/${rows.length})` : processed === rows.length ? 'Terminé' : 'Prêt'}
                                </span>
                                <span className="text-[#00ff88] font-semibold">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-[#1a1a24] rounded overflow-hidden">
                                <div
                                    className="h-full bg-[#00ff88] rounded transition-all duration-300"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={startEnrichment}
                                disabled={isRunning}
                                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md bg-[#00ff88] text-black font-mono font-medium text-sm disabled:opacity-40"
                            >
                                <Play className="w-4 h-4 shrink-0" />
                                Démarrer
                            </button>
                            {isRunning && (
                                <button
                                    type="button"
                                    onClick={pauseEnrichment}
                                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md border border-[#2a2a3a] text-[#666680] font-mono text-sm"
                                >
                                    {isPaused ? <Play className="w-4 h-4 shrink-0" /> : <Pause className="w-4 h-4 shrink-0" />}
                                    {isPaused ? 'Reprendre' : 'Pause'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={exportCSV}
                                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md border border-[#2a2a3a] text-[#666680] font-mono text-sm hover:border-[#0088ff] hover:text-white"
                            >
                                <Download className="w-4 h-4 shrink-0" />
                                Export CSV
                            </button>
                            <button
                                type="button"
                                onClick={resetAll}
                                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md border border-[#ff4455]/30 text-[#ff4455] font-mono text-sm hover:bg-[#ff4455]/10"
                            >
                                <X className="w-4 h-4 shrink-0" />
                                Reset
                            </button>
                        </div>

                        {/* Log */}
                        <div className="bg-[#111118] border border-[#2a2a3a] rounded-lg p-4 max-h-40 overflow-y-auto font-mono text-xs">
                            <div className="text-[#666680] mb-2 uppercase tracking-wider">03 — Log</div>
                            {logEntries.map((e, i) => (
                                <div key={i} className="flex gap-2 py-0.5">
                                    <span className="text-[#333344] flex-shrink-0">{e.ts}</span>
                                    <span
                                        className={
                                            e.type === 'ok' ? 'text-[#00ff88]' :
                                                e.type === 'warn' ? 'text-[#ffaa00]' :
                                                    e.type === 'err' ? 'text-[#ff4455]' :
                                                        'text-[#0088ff]'
                                        }
                                    >
                                        {e.msg}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Table */}
                        <div className="bg-[#111118] border border-[#2a2a3a] rounded-lg overflow-hidden">
                            <div className="flex justify-between items-center px-4 py-3 border-b border-[#2a2a3a] bg-[#1a1a24] text-xs font-mono text-[#666680]">
                                <span>{rows.length} lignes</span>
                                <span>Format: <span className="text-[#00ff88]">{detectedFormat}</span></span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs font-mono">
                                    <thead>
                                        <tr className="bg-[#1a1a24] text-[#666680] uppercase text-[10px] tracking-wider">
                                            {origFields.map((c) => (
                                                <th key={c} className="px-3 py-2.5 text-left whitespace-nowrap">{c}</th>
                                            ))}
                                            <th className="px-3 py-2.5 text-left">phone_number</th>
                                            <th className="px-3 py-2.5 text-left">phone_source</th>
                                            <th className="px-3 py-2.5 text-left">confidence</th>
                                            <th className="px-3 py-2.5 text-left">status</th>
                                            <th className="px-3 py-2.5 text-left">log</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((r, i) => (
                                            <React.Fragment key={r.index}>
                                                <tr className="border-b border-[#333344] hover:bg-white/5">
                                                    {origFields.map((f) => (
                                                        <td key={f} className="px-3 py-2.5 max-w-[200px] truncate" title={String(r.original[f] ?? '')}>
                                                            {esc(String(r.original[f] ?? '—'))}
                                                        </td>
                                                    ))}
                                                    <td className={`px-3 py-2.5 ${r.phone_number ? 'text-[#00ff88] font-medium' : ''}`}>
                                                        {r.phone_number || '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        {r.phone_source ? (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1a24] border border-[#2a2a3a]">{r.phone_source}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5">{r.confidence_score || '—'}</td>
                                                    <td className="px-3 py-2.5">
                                                        <span
                                                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                                                r.status === 'found' ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' :
                                                                    r.status === 'not_found' ? 'bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20' :
                                                                        r.status === 'error' ? 'bg-[#ff4455]/10 text-[#ff4455] border border-[#ff4455]/20' :
                                                                            r.status === 'processing' ? 'bg-[#0088ff]/15 text-[#0088ff] border border-[#0088ff]/30' :
                                                                                'bg-[#0088ff]/10 text-[#0088ff] border border-[#0088ff]/20'
                                                            }`}
                                                        >
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleLog(i)}
                                                            className="text-[#0088ff] text-[10px] hover:underline"
                                                        >
                                                            {r.log.length} étapes
                                                        </button>
                                                    </td>
                                                </tr>
                                                {r.expanded && r.log.length > 0 && (
                                                    <tr key={`${r.index}-log`} className="bg-[#0088ff]/5 border-b border-[#333344]">
                                                        <td colSpan={999} className="px-10 py-2 text-[11px] text-[#666680] whitespace-pre-wrap">
                                                            {r.log.join('\n')}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}