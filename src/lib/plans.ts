/**
 * Authoritative PointPass Plan Catalog & Entitlement Types
 *
 * Truthful architectural model:
 *   - single_location: 1 active Location (Operational Baseline)
 *   - multi_location: 10 active Locations (Multi-Branch Operations)
 *
 * Invariants:
 *   - Zero fabricated pricing (no invented SAR prices, no fake free tier, no fake trial).
 *   - Zero unapproved commercial promises or packaging tiers.
 *   - Compatibility aliases: 'starter' -> single_location, 'growth'/'enterprise' -> multi_location.
 */

export type CanonicalPlanCode = "single_location" | "multi_location";
export type HistoricalPlanCode = CanonicalPlanCode | "starter" | "growth" | "enterprise";

export interface PlanDefinition {
  code: CanonicalPlanCode;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  maxLocations: number;
  multiLocation: boolean;
  isActive: boolean;
  featuresAr: string[];
  featuresEn: string[];
}

export const PLAN_CATALOG: Record<CanonicalPlanCode, PlanDefinition> = {
  single_location: {
    code: "single_location",
    nameAr: "فرع واحد",
    nameEn: "Single Location",
    descriptionAr: "الخطة التشغيلية الأساسية لإدارة فرع واحد مع بطاقات الولاء الرقمية ومسح الرموز.",
    descriptionEn:
      "Operational baseline for single-branch businesses with digital passes and QR scanning.",
    maxLocations: 1,
    multiLocation: false,
    isActive: true,
    featuresAr: [
      "فرع رئيسي نشط واحد",
      "بطاقات الأختام الرقمية",
      "رمز QR للانضمام السريع",
      "لوحة تحكم ونقاط الولاء",
    ],
    featuresEn: [
      "1 active main location",
      "Digital stamp cards & passes",
      "Quick-join QR codes",
      "Dashboard & loyalty management",
    ],
  },
  multi_location: {
    code: "multi_location",
    nameAr: "فروع متعددة",
    nameEn: "Multi-Location",
    descriptionAr: "الخطة التشغيلية لإدارة عدة فروع (حتى 10 فروع) مع تخصيص صلاحيات الفريق.",
    descriptionEn:
      "Operational entitlement for multi-branch operations (up to 10 locations) with team role scoping.",
    maxLocations: 10,
    multiLocation: true,
    isActive: true,
    featuresAr: [
      "حتى 10 فروع نشطة",
      "صلاحيات مخصصة لمدراء الفروع والكاشيرات",
      "مقارنة وإحصائيات على مستوى الفروع",
      "بطاقات الولاء الموحدة",
    ],
    featuresEn: [
      "Up to 10 active locations",
      "Branch-scoped manager & cashier permissions",
      "Location comparison & metrics",
      "Unified loyalty pass",
    ],
  },
};

export const AVAILABLE_PLANS: PlanDefinition[] = [
  PLAN_CATALOG.single_location,
  PLAN_CATALOG.multi_location,
];

export function resolveCanonicalPlan(input: string | null | undefined): CanonicalPlanCode {
  const norm = (input || "single_location").trim().toLowerCase();
  if (norm === "multi_location" || norm === "growth" || norm === "enterprise") {
    return "multi_location";
  }
  return "single_location";
}

export function getPlanDefinition(input: string | null | undefined): PlanDefinition {
  const canonical = resolveCanonicalPlan(input);
  return PLAN_CATALOG[canonical];
}
