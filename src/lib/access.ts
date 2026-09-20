/**
 * Centralized role and access authorization helpers.
 *
 * Canonical client roles:
 *   Owner: full business-wide scope across all locations and business settings.
 *   Manager: location-scoped to explicitly assigned branch(es).
 *   Cashier: restricted to terminal scanning and loyalty actions.
 *
 * Legacy roles:
 *   admin, staff, owner mapped safely for backward compatibility.
 */

export type OperationalRole = "owner" | "manager" | "cashier" | "staff" | "admin";

export interface OperationsAccess {
  operational_role: OperationalRole | string;
  can_manage: boolean;
  can_manage_business?: boolean;
  managed_branch_ids?: string[];
}

export function isOwner(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isManager(role: string | undefined): boolean {
  return role === "manager";
}

export function isCashier(role: string | undefined): boolean {
  return role === "cashier";
}

export function canManageBusiness(access?: OperationsAccess | null): boolean {
  if (!access) return false;
  return access.can_manage_business ?? access.can_manage ?? false;
}

export function canManageBranch(branchId: string, access?: OperationsAccess | null): boolean {
  if (!access) return false;
  if (canManageBusiness(access)) return true;
  if (!branchId || !access.managed_branch_ids) return false;
  return access.managed_branch_ids.includes(branchId);
}
