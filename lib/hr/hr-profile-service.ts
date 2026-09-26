import { prisma } from "@/lib/prisma";
import { ContractType, RemunerationMode, HrProfileData } from "./hr-types";

export class HrProfileService {
  /**
   * Get HR profile for a specific user, or default values if none exists yet.
   */
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        managerId: true,
        manager: {
          select: { id: true, name: true, email: true },
        },
        hrProfile: {
          include: {
            snapshots: {
              orderBy: { changedAt: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("Utilisateur introuvable");
    }

    if (user.hrProfile) {
      return {
        user,
        profile: user.hrProfile,
      };
    }

    // Default profile draft
    return {
      user,
      profile: {
        id: null,
        userId: user.id,
        contractType: ContractType.SALARIE,
        remunerationMode: RemunerationMode.FIXE,
        fixedSalaryCents: 0,
        variablePerRdvCents: 0,
        dailyQuota: user.role === "SDR" || user.role === "BOOKER" ? 80 : 0,
        effectiveFrom: new Date(),
        snapshots: [],
      },
    };
  }

  /**
   * List all team members eligible for HR with their profiles.
   * Eligible: all active users except CLIENT and COMMERCIAL.
   */
  async listProfiles() {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          notIn: ["CLIENT", "COMMERCIAL"],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        managerId: true,
        manager: {
          select: { id: true, name: true },
        },
        hrProfile: true,
      },
      orderBy: [
        { role: "asc" },
        { name: "asc" },
      ],
    });

    return users;
  }

  /**
   * Create or update HR profile for a user.
   * Automatically takes a snapshot when updating an existing profile.
   */
  async upsertProfile(data: HrProfileData, actorId: string, reason?: string) {
    const effectiveDate = new Date(data.effectiveFrom);

    // Update manager on User if provided
    if (data.managerId !== undefined) {
      await prisma.user.update({
        where: { id: data.userId },
        data: { managerId: data.managerId || null },
      });
    }

    const existing = await prisma.hrProfile.findUnique({
      where: { userId: data.userId },
    });

    if (!existing) {
      // Create new profile
      const newProfile = await prisma.hrProfile.create({
        data: {
          userId: data.userId,
          contractType: data.contractType,
          remunerationMode: data.remunerationMode,
          fixedSalaryCents: data.fixedSalaryCents,
          variablePerRdvCents: data.variablePerRdvCents,
          dailyQuota: data.dailyQuota,
          effectiveFrom: effectiveDate,
        },
      });

      // Audit log
      await prisma.hrAuditLog.create({
        data: {
          userId: data.userId,
          actorId,
          action: "PROFILE_CREATED",
          details: {
            contractType: data.contractType,
            remunerationMode: data.remunerationMode,
            fixedSalaryCents: data.fixedSalaryCents,
            variablePerRdvCents: data.variablePerRdvCents,
            dailyQuota: data.dailyQuota,
            effectiveFrom: data.effectiveFrom,
          },
        },
      });

      return newProfile;
    }

    // Save snapshot of previous values before update
    await prisma.hrProfileSnapshot.create({
      data: {
        hrProfileId: existing.id,
        contractType: existing.contractType,
        remunerationMode: existing.remunerationMode,
        fixedSalaryCents: existing.fixedSalaryCents,
        variablePerRdvCents: existing.variablePerRdvCents,
        dailyQuota: existing.dailyQuota,
        effectiveFrom: existing.effectiveFrom,
        changedById: actorId,
        reason: reason || "Mise à jour du profil RH",
      },
    });

    // Update profile
    const updatedProfile = await prisma.hrProfile.update({
      where: { id: existing.id },
      data: {
        contractType: data.contractType,
        remunerationMode: data.remunerationMode,
        fixedSalaryCents: data.fixedSalaryCents,
        variablePerRdvCents: data.variablePerRdvCents,
        dailyQuota: data.dailyQuota,
        effectiveFrom: effectiveDate,
      },
    });

    // Audit log
    await prisma.hrAuditLog.create({
      data: {
        userId: data.userId,
        actorId,
        action: "PROFILE_UPDATED",
        details: {
          previous: {
            contractType: existing.contractType,
            remunerationMode: existing.remunerationMode,
            fixedSalaryCents: existing.fixedSalaryCents,
            variablePerRdvCents: existing.variablePerRdvCents,
            dailyQuota: existing.dailyQuota,
          },
          current: {
            contractType: data.contractType,
            remunerationMode: data.remunerationMode,
            fixedSalaryCents: data.fixedSalaryCents,
            variablePerRdvCents: data.variablePerRdvCents,
            dailyQuota: data.dailyQuota,
            effectiveFrom: data.effectiveFrom,
          },
          reason,
        },
      },
    });

    return updatedProfile;
  }
}

export const hrProfileService = new HrProfileService();
