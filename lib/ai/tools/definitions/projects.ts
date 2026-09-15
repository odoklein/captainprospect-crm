/**
 * Projet — structure and context.
 *
 * `list_projects` is the only tool in the catalogue that ignores the binding:
 * it exists precisely to help choose one.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { primaryEmailOf } from "@/lib/vault/portalAccounts";
import { sanitizeUntrusted } from "../redact";
import { requireProject } from "../context";
import { defineReadTool, frDate, NO_PARAMS, params } from "../helpers";

export const listProjects = defineReadTool({
    name: "list_projects",
    label: "Liste des projets",
    description:
        "Liste les clients et leurs missions (= projets). À utiliser quand aucun projet n'est sélectionné, ou quand l'utilisateur parle d'un autre client que le projet actif.",
    parameters: params({
        search: { type: "string", description: "Filtre sur le nom du client" },
    }),
    schema: z.object({ search: z.string().max(120).optional() }),
    requiresProject: false,
    execute: async (args) => {
        const clients = await prisma.client.findMany({
            where: {
                archivedAt: null,
                ...(args.search ? { name: { contains: args.search, mode: "insensitive" } } : {}),
            },
            orderBy: { name: "asc" },
            take: 40,
            select: {
                id: true,
                name: true,
                missions: {
                    where: { isActive: true },
                    orderBy: { startDate: "desc" },
                    select: { id: true, name: true, status: true },
                    take: 20,
                },
            },
        });

        return {
            clients: clients.map((c) => ({
                clientId: c.id,
                name: c.name,
                missions: c.missions.map((m) => ({
                    missionId: m.id,
                    name: m.name,
                    status: m.status,
                })),
            })),
        };
    },
});

export const getProjectOverview = defineReadTool({
    name: "get_project_overview",
    label: "Fiche du projet",
    description:
        "Vue d'ensemble du projet actif : client, mission, dates, objectif, canaux, SDR affectés, commerciaux du client avec l'état de leur accès portail, boîte mail par défaut. Le point de départ de presque toute question.",
    parameters: NO_PARAMS,
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        const [client, missions, interlocuteurs] = await Promise.all([
            prisma.client.findUnique({
                where: { id: project.clientId },
                select: {
                    id: true,
                    name: true,
                    industry: true,
                    status: true,
                    contractedDaysPerWeek: true,
                    bookingUrl: true,
                    defaultMailbox: { select: { email: true } },
                },
            }),
            prisma.mission.findMany({
                where: {
                    clientId: project.clientId,
                    ...(project.missionId ? { id: project.missionId } : {}),
                },
                orderBy: { startDate: "desc" },
                take: 20,
                select: {
                    id: true,
                    name: true,
                    objective: true,
                    status: true,
                    channels: true,
                    startDate: true,
                    endDate: true,
                    totalContractDays: true,
                    defaultMailbox: { select: { email: true } },
                    defaultInterlocuteur: { select: { firstName: true, lastName: true } },
                    teamLeadSdr: { select: { id: true, name: true } },
                    sdrAssignments: { select: { sdr: { select: { id: true, name: true } } } },
                },
            }),
            prisma.clientInterlocuteur.findMany({
                where: { clientId: project.clientId, isActive: true },
                orderBy: [{ lastName: "asc" }],
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    title: true,
                    emails: true,
                    bookingLinks: true,
                    portalUser: { select: { id: true, email: true, isActive: true } },
                },
            }),
        ]);

        return {
            client: client
                ? {
                    clientId: client.id,
                    name: client.name,
                    industry: client.industry,
                    status: client.status,
                    joursParSemaineContractualises: client.contractedDaysPerWeek,
                    lienReservation: client.bookingUrl,
                    boiteMailParDefaut: client.defaultMailbox?.email ?? null,
                }
                : null,
            missions: missions.map((m) => ({
                missionId: m.id,
                nom: m.name,
                objectif: sanitizeUntrusted(m.objective),
                statut: m.status,
                canaux: m.channels,
                debut: frDate(m.startDate),
                fin: frDate(m.endDate),
                joursContractualises: m.totalContractDays,
                boiteMail: m.defaultMailbox?.email ?? null,
                commercialParDefaut: m.defaultInterlocuteur
                    ? `${m.defaultInterlocuteur.firstName} ${m.defaultInterlocuteur.lastName}`.trim()
                    : null,
                teamLead: m.teamLeadSdr?.name ?? null,
                sdrAffectes: m.sdrAssignments.map((a) => ({
                    sdrId: a.sdr.id,
                    nom: a.sdr.name,
                })),
            })),
            commerciaux: interlocuteurs.map((i) => ({
                interlocuteurId: i.id,
                nom: `${i.firstName} ${i.lastName}`.trim(),
                fonction: i.title,
                email: primaryEmailOf(i.emails),
                lienAgenda: Array.isArray(i.bookingLinks) && i.bookingLinks.length > 0
                    ? String((i.bookingLinks as Array<{ value?: string }>)[0]?.value ?? "")
                    : null,
                aUnAccesPortail: !!i.portalUser,
                emailPortail: i.portalUser?.email ?? null,
                portailActif: i.portalUser?.isActive ?? null,
            })),
        };
    },
});

export const listTaskBoards = defineReadTool({
    name: "list_task_boards",
    label: "Tableaux de tâches",
    description:
        "Les tableaux de projet (module Projets/Tâches) rattachés au client actif, avec leur id. Nécessaire avant de créer une tâche.",
    parameters: NO_PARAMS,
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        const boards = await prisma.project.findMany({
            where: { clientId: project.clientId, archivedAt: null },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
                id: true,
                name: true,
                status: true,
                owner: { select: { name: true } },
                _count: { select: { tasks: true } },
            },
        });

        return {
            boards: boards.map((b) => ({
                projectId: b.id,
                nom: b.name,
                statut: b.status,
                responsable: b.owner.name,
                nombreDeTaches: b._count.tasks,
            })),
        };
    },
});
