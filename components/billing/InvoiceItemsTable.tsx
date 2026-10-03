"use client";

import { useState } from "react";
import { Trash2, Plus, GripVertical, Package } from "lucide-react";
import { Button, Input } from "@/components/ui";

export interface InvoiceItem {
    id?: string;
    description: string;
    quantity: number;
    unitPriceHt: number;
    vatRate: number;
    totalHt?: number;
    totalVat?: number;
    totalTtc?: number;
}

interface InvoiceItemsTableProps {
    items: InvoiceItem[];
    onChange: (items: InvoiceItem[]) => void;
    readOnly?: boolean;
}

export function InvoiceItemsTable({ items, onChange, readOnly = false }: InvoiceItemsTableProps) {
    const addItem = () => {
        onChange([
            ...items,
            {
                description: "",
                quantity: 1,
                unitPriceHt: 0,
                vatRate: 20,
            },
        ]);
    };

    const removeItem = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };

        const quantity = Number(updated[index].quantity) || 0;
        const unitPriceHt = Number(updated[index].unitPriceHt) || 0;
        const vatRate = Number(updated[index].vatRate) || 0;

        const totalHt = quantity * unitPriceHt;
        const totalVat = totalHt * (vatRate / 100);
        const totalTtc = totalHt + totalVat;

        updated[index] = {
            ...updated[index],
            totalHt: Math.round(totalHt * 100) / 100,
            totalVat: Math.round(totalVat * 100) / 100,
            totalTtc: Math.round(totalTtc * 100) / 100,
        };

        onChange(updated);
    };

    const calculateTotals = () => {
        const totals = items.reduce(
            (acc, item) => ({
                totalHt: acc.totalHt + (item.totalHt || 0),
                totalVat: acc.totalVat + (item.totalVat || 0),
                totalTtc: acc.totalTtc + (item.totalTtc || 0),
            }),
            { totalHt: 0, totalVat: 0, totalTtc: 0 }
        );

        return {
            totalHt: Math.round(totals.totalHt * 100) / 100,
            totalVat: Math.round(totals.totalVat * 100) / 100,
            totalTtc: Math.round(totals.totalTtc * 100) / 100,
        };
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

    const totals = calculateTotals();

    if (items.length === 0 && readOnly) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Package className="w-10 h-10 mb-3" />
                <p className="text-sm">Aucun article</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50">
                            {!readOnly && <th className="w-8" />}
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Description
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                                Qté
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                                Prix unit. HT
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                                TVA
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">
                                Total HT
                            </th>
                            {!readOnly && <th className="w-12" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.map((item, index) => (
                            <tr
                                key={index}
                                className="group transition-colors duration-150 hover:bg-primary-50/30"
                            >
                                {!readOnly && (
                                    <td className="px-2 py-3">
                                        <GripVertical className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </td>
                                )}
                                <td className="px-4 py-3">
                                    {readOnly ? (
                                        <span className="text-slate-900 font-medium">{item.description}</span>
                                    ) : (
                                        <input
                                            value={item.description}
                                            onChange={(e) => updateItem(index, "description", e.target.value)}
                                            placeholder="Description de la prestation..."
                                            className="w-full bg-transparent border-0 p-0 text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-0 text-sm"
                                        />
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {readOnly ? (
                                        <div className="text-right text-slate-700 tabular-nums">{Number(item.quantity).toFixed(2)}</div>
                                    ) : (
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                                            className="w-full bg-transparent border-0 p-0 text-right text-slate-700 focus:outline-none focus:ring-0 text-sm tabular-nums"
                                        />
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {readOnly ? (
                                        <div className="text-right text-slate-700 tabular-nums">{formatCurrency(Number(item.unitPriceHt))}</div>
                                    ) : (
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={item.unitPriceHt}
                                            onChange={(e) => updateItem(index, "unitPriceHt", parseFloat(e.target.value) || 0)}
                                            className="w-full bg-transparent border-0 p-0 text-right text-slate-700 focus:outline-none focus:ring-0 text-sm tabular-nums"
                                        />
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {readOnly ? (
                                        <div className="text-right">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium tabular-nums">
                                                {Number(item.vatRate).toFixed(0)}%
                                            </span>
                                        </div>
                                    ) : (
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            value={item.vatRate}
                                            onChange={(e) => updateItem(index, "vatRate", parseFloat(e.target.value) || 0)}
                                            className="w-full bg-transparent border-0 p-0 text-right text-slate-700 focus:outline-none focus:ring-0 text-sm tabular-nums"
                                        />
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-right font-semibold text-slate-900 tabular-nums">
                                        {formatCurrency(item.totalHt || 0)}
                                    </div>
                                </td>
                                {!readOnly && (
                                    <td className="px-2 py-3">
                                        <button
                                            onClick={() => removeItem(index)}
                                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-150"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
                <div className="w-72 space-y-2">
                    <div className="flex justify-between items-center text-sm text-slate-500 px-2">
                        <span>Sous-total HT</span>
                        <span className="tabular-nums font-medium text-slate-700">{formatCurrency(totals.totalHt)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-slate-500 px-2">
                        <span>TVA</span>
                        <span className="tabular-nums font-medium text-slate-700">{formatCurrency(totals.totalVat)}</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex justify-between items-center px-2 py-1">
                        <span className="text-base font-bold text-slate-900">Total TTC</span>
                        <span className="text-lg font-bold text-primary-600 tabular-nums">{formatCurrency(totals.totalTtc)}</span>
                    </div>
                </div>
            </div>

            {/* Add button */}
            {!readOnly && (
                <button
                    onClick={addItem}
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-medium text-slate-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Ajouter un article
                </button>
            )}
        </div>
    );
}
