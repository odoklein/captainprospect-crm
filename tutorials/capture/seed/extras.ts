// Page-specific fictional data, added as each tutorial needs it.
import { prisma, ids, at, pick, int } from "./core";

/** SAS RDV: bookings made this morning are still waiting for the manager (the API auto-confirms after 24 h). */
async function pendingMeetings() {
    const notes = [
        "RDV visio avec la DAF : remplacement de l'outil de suivi des expéditions d'ici juin.",
        "Découverte du besoin, 30 min. Le DG veut comparer avec son prestataire actuel.",
        "Besoin confirmé : 3 sites à équiper, budget voté en janvier.",
        "Intéressée par un audit, souhaite la présence de son responsable technique.",
    ];
    const contacts = ids.contacts.filter((_, i) => i % 7 === 3).slice(0, 4);
    const now = new Date();
    for (const [k, c] of contacts.entries()) {
        const company = await prisma.company.findUniqueOrThrow({ where: { id: c.companyId }, include: { list: true } });
        const campaign = await prisma.campaign.findFirstOrThrow({ where: { missionId: company.list.missionId } });
        const assignment = await prisma.sDRAssignment.findFirst({ where: { missionId: company.list.missionId } });
        const booked = new Date(now.getTime() - (k + 1) * 47 * 60_000);
        await prisma.action.create({
            data: {
                contactId: c.id, companyId: c.companyId, sdrId: assignment?.sdrId ?? ids.sdrs[0], campaignId: campaign.id,
                channel: "CALL", result: "MEETING_BOOKED", note: notes[k], duration: int(180, 420), createdAt: booked,
                callbackDate: at(-(k + 2), 10 + k, k % 2 ? 30 : 0), meetingType: k === 2 ? "PHYSIQUE" : "VISIO",
                meetingCategory: k % 2 ? "BESOIN" : "EXPLORATOIRE", meetingJoinUrl: k === 2 ? null : "https://meet.demo.example/rdv",
                meetingAddress: k === 2 ? "12 rue des Tanneurs, 69002 Lyon" : null,
                confirmationStatus: "PENDING", interlocuteurId: pick(ids.interlocuteurs),
                callSummary: `${notes[k]} Le prospect a validé le créneau et attend l'invitation.`,
            },
        });
    }
}

export async function seedExtras() {
    await pendingMeetings();
}
