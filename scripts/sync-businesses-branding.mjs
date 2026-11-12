import { createClient } from "@supabase/supabase-js";
import {
  FREE_TIER_PRESETS,
  resolveRestaurantBranding,
  serializePassTemplateMeta,
} from "../src/lib/wallet-tier.ts";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run migration 20261112000000_open_restaurant_pass_sync.sql via Supabase CLI/Dashboard or set SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { data: rows, error } = await admin
  .from("businesses")
  .select(
    "id,slug,name_ar,name_en,brand_color,accent_color,offer_ar,offer_en,target_stamps,template_id",
  );

if (error) {
  console.error("Failed to fetch businesses:", error.message);
  process.exit(1);
}

let updatedCount = 0;

for (const row of rows ?? []) {
  const needsSync =
    row.slug === "testpass" ||
    !row.template_id ||
    row.template_id.startsWith("tpl_stamp_blank") ||
    !row.template_id.includes("preset-");

  if (!needsSync) continue;

  const branding = resolveRestaurantBranding({
    brandColor: row.slug === "testpass" ? FREE_TIER_PRESETS.orange : row.brand_color,
    accentColor: row.accent_color,
    templateId: row.template_id,
    offerEn: row.offer_en,
    offerAr: row.offer_ar,
    nameEn: row.name_en,
    nameAr: row.name_ar,
  });

  const targetStamps = Number(row.target_stamps || 8);
  const stampIcon = row.slug === "testpass" ? "coffee" : branding.stampIcon;
  const colorPreset = row.slug === "testpass" ? "orange" : branding.colorPreset;
  const brandColor = row.slug === "testpass" ? FREE_TIER_PRESETS.orange : branding.brandHex;

  const nextTemplateId = serializePassTemplateMeta({
    baseId: `tpl_stamp_${stampIcon}_${targetStamps}`,
    stampIcon,
    stripStyle: branding.stripStyle,
    colorPreset,
    tierMode: branding.tierMode,
    brandColor,
  });

  const { error: updateErr } = await admin
    .from("businesses")
    .update({
      template_id: nextTemplateId,
      brand_color: brandColor,
      accent_color: branding.accentHex,
      target_stamps: targetStamps,
    })
    .eq("id", row.id);

  if (updateErr) {
    console.error(`Failed to sync ${row.slug}:`, updateErr.message);
  } else {
    updatedCount++;
    console.log(`Synced ${row.slug}: template_id=${nextTemplateId}, brand_color=${brandColor}`);
  }
}

console.log(`Done. Synced ${updatedCount} business row(s).`);
