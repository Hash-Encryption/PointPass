/**
 * Location entitlement types and fallback formatters.
 *
 * NOTE: The PostgreSQL function `public.business_location_entitlement(...)`
 * is the authoritative source of truth for location limits, enforced concurrently
 * with transactional advisory locks in database triggers.
 *
 * This client helper provides TypeScript interfaces and fallback formatting for UI display.
 */

export const CONFIGURED_MULTI_LIMIT = 10;

export type PlanType = "single_location" | "multi_location" | "starter" | "growth" | "enterprise";

export interface LocationEntitlement {
  plan: string;
  maxLocations: number;
  multiLocation: boolean;
  locationComparison: boolean;
}

export function getLocationEntitlement(plan: string | null | undefined): LocationEntitlement {
  const normalized = (plan || "starter").trim().toLowerCase();
  switch (normalized) {
    case "multi_location":
    case "growth":
    case "enterprise":
      return {
        plan: normalized,
        maxLocations: CONFIGURED_MULTI_LIMIT,
        multiLocation: true,
        locationComparison: true,
      };
    case "single_location":
    case "starter":
    default:
      return {
        plan: normalized,
        maxLocations: 1,
        multiLocation: false,
        locationComparison: false,
      };
  }
}

export function canAddLocation(activeCount: number, plan: string | null | undefined): boolean {
  const entitlement = getLocationEntitlement(plan);
  return activeCount < entitlement.maxLocations;
}
