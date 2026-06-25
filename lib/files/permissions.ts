import type { Session } from "next-auth";
import type { UserRole } from "@prisma/client";

type SessionUser = Session["user"];

type FilePermissionSubject = {
  uploadedById: string;
  clientId?: string | null;
};

type FolderPermissionSubject = {
  clientId?: string | null;
};

function isPrivilegedRole(role: UserRole) {
  return role === "MANAGER" || role === "DEVELOPER";
}

function matchesClientScope(user: SessionUser, clientId?: string | null) {
  return Boolean(
    user.role === "CLIENT" &&
      user.clientId &&
      clientId &&
      user.clientId === clientId,
  );
}

export function canReadFile(
  user: SessionUser,
  file: FilePermissionSubject,
): boolean {
  if (isPrivilegedRole(user.role)) return true;
  if (matchesClientScope(user, file.clientId)) return true;
  return file.uploadedById === user.id;
}

export function canMutateFile(
  user: SessionUser,
  file: FilePermissionSubject,
): boolean {
  if (isPrivilegedRole(user.role)) return true;
  if (matchesClientScope(user, file.clientId)) return true;
  return file.uploadedById === user.id;
}

export function canReadFolder(
  user: SessionUser,
  folder: FolderPermissionSubject,
): boolean {
  if (isPrivilegedRole(user.role)) return true;
  if (user.role === "CLIENT") return matchesClientScope(user, folder.clientId);
  return true;
}

export function canMutateFolder(
  user: SessionUser,
  folder: FolderPermissionSubject,
): boolean {
  if (isPrivilegedRole(user.role)) return true;
  if (user.role === "CLIENT") return false;
  return !folder.clientId;
}

export function canAssignClientVisibility(user: SessionUser) {
  return isPrivilegedRole(user.role);
}
