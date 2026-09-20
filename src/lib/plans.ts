/**
 * Authoritative PointPass Plan Catalog & Entitlement Types
 *
 * Truthful architectural model:
 *   - starter: 1 active Location
 *   - growth: 10 active Locations
 *   - enterprise: 10 active Locations (custom / high-volume)
 *
 * Invariants:
 *   - Zero fabricated pricing (no invented SAR prices, no fake free tier, no fake trial).
 *   - Compatibility aliases: 'single_location' -> starter, 'multi_location' -> growth.
 */

export type CanonicalPlanCode = "starter" | "growth" | "enterprise";
export type HistoricalPlanCode = CanonicalPlanCode | "single_location" | "multi_location";

export interface PlanDefinition {
  code: CanonicalPlanCode;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  maxLocations: number;
  multiLocation: boolean;
  isActive: boolean;
}

export const PLAN_CATALOG: Record<CanonicalPlanCode, PlanDefinition> = {
  starter: {
    code: "starter",
    nameAr: "الباقة الأساسية",
    nameEn: "Starter Plan",
    descriptionAr: "مصممة لإدارة فرع واحد مع بطاقات الولاء الرقمية ورمز الانضمام السريع.",
    descriptionEn: "Single-location operations with digital passes, QR join, and scanner support.",
    maxLocations: 1,
    multiLocation: false,
    isActive: true,
  },
  growth: {
    code: "growth",
    nameAr: "باقة النمو",
    nameEn: "Growth Plan",
    descriptionAr: "تدعم حتى ١٠ فروع مع إدارة تفصيلية للفريق وتخصيص صلاحيات المدراء والكاشيرات.",
    descriptionEn: "Up to 10 locations with branch-scoped management, cashier PINs, and analytics.",
    maxLocations: 10,
    multiLocation: true,
    isActive: true,
  },
  enterprise: {
    code: "enterprise",
    nameAr: "باقة المنشآت الكبرى",
    nameEn: "Enterprise Plan",
    descriptionAr: "للسلاسل والعمليات الواسعة التي تتطلب سعة مواقع متقدمة وحسابات متعددة.",
    descriptionEn: "Large multi-branch chains with high-volume digital loyalty operations.",
    maxLocations: 10,
    multiLocation: true,
    isActive: true,
  },
};

export const AVAILABLE_PLANS: PlanDefinition[] = [
  PLAN_CATALOG.starter,
  PLAN_CATALOG.growth,
  PLAN_CATALOG.enterprise,
];

export function resolveCanonicalPlan(input: string | null | undefined): CanonicalPlanCode {
  const norm = (input || "starter").trim().toLowerCase();
  if (norm === "growth" || norm === "multi_location") return "growth";
  if (norm === "enterprise") return "enterprise";
  return "starter";
}

export function getPlanDefinition(input: string | null | undefined): PlanDefinition {
  const canonical = resolveCanonicalPlan(input);
  return PLAN_CATALOG[canonical];
}
