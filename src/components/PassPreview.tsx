import { useState, useMemo } from "react";
import { autoContrast, type PassTemplate, type ProgramType } from "@/constants/defaultTemplates";
import type { Locale } from "@/lib/i18n";
import { Apple, QrCode, Smartphone } from "lucide-react";
import { generateStampStripDataUri, type StripStyle } from "@/lib/strip-generator";
import {
  iconToEmoji,
  WALLET_COLOR_PRESETS,
  type WalletColorPreset,
  type WalletTierMode,
} from "@/lib/wallet-tier";

export interface PassDesign {
  businessName: string;
  businessNameEn: string;
  logoUrl: string | null;
  background: string;
  accent: string;
  headline: string;
  headlineEn: string;
  subline: string;
  sublineEn: string;
  program: ProgramType;
  targetStamps: number;
  sarPerPoint: number;
  pointsPerReward: number;
  progress: number;
  stampIcon?: string;
  stripStyle?: StripStyle;
  tierMode?: WalletTierMode;
  colorPreset?: WalletColorPreset;
}

export function designFromTemplate(tpl: PassTemplate, program: ProgramType): PassDesign {
  return {
    businessName: tpl.name.ar,
    businessNameEn: tpl.name.en,
    logoUrl: tpl.logoUrl,
    background: tpl.colors.background,
    accent: tpl.colors.accent,
    headline: tpl.program.reward.ar,
    headlineEn: tpl.program.reward.en,
    subline: tpl.fields[0]?.value.ar ?? "",
    sublineEn: tpl.fields[0]?.value.en ?? "",
    program,
    targetStamps: tpl.program.targetStamps ?? 8,
    sarPerPoint: tpl.program.sarPerPoint ?? 10,
    pointsPerReward: tpl.program.pointsPerReward ?? 100,
    progress: 2,
    stampIcon: "⭐",
    stripStyle: "pizzatown",
    tierMode: "free",
    colorPreset: "dark",
  };
}

function PassBody({
  design,
  locale,
  onSelectStamps,
}: {
  design: PassDesign;
  locale: Locale;
  onSelectStamps?: ((stamps: number) => void) | undefined;
}) {
  const isFree = design.tierMode === "free";
  const presetHex =
    isFree && design.colorPreset && WALLET_COLOR_PRESETS[design.colorPreset]
      ? WALLET_COLOR_PRESETS[design.colorPreset].hex
      : design.background;

  const fg = autoContrast(presetHex);
  const name =
    locale === "ar"
      ? design.businessName || design.businessNameEn || "متجرك"
      : design.businessNameEn || design.businessName || "Your Store";
  const headline =
    locale === "ar"
      ? design.headline || "مكافأة بعد اكتمال الأختام"
      : design.headlineEn || "Reward upon completion";

  const target = Math.max(1, design.targetStamps || 8);
  const current = Math.max(0, Math.min(design.progress || 0, target));
  const emoji = iconToEmoji(design.stampIcon || "⭐");
  const remaining = Math.max(0, target - current);

  // Generate Pro Retina Strip Data URI if in Pro Mode
  const stripDataUri = useMemo(() => {
    if (isFree) return null;
    try {
      return generateStampStripDataUri({
        targetStamps: target,
        stamps: current,
        brandColor: design.background,
        accentColor: design.accent,
        stampIcon: design.stampIcon,
        stripStyle: design.stripStyle || "pizzatown",
      });
    } catch {
      return null;
    }
  }, [
    isFree,
    target,
    current,
    design.background,
    design.accent,
    design.stampIcon,
    design.stripStyle,
  ]);

  return (
    <div className="space-y-3" style={{ color: fg }}>
      {/* Pass Header: Logo badge + Store Name on left, Stamp counter on top-right */}
      <div
        className="flex items-center justify-between gap-2.5 border-b pb-2.5"
        style={{ borderColor: `${fg}1a` }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {design.logoUrl ? (
            <img
              src={design.logoUrl}
              alt=""
              className="size-8 rounded-lg object-contain shrink-0"
              style={{ background: `${fg}15` }}
            />
          ) : (
            <span
              className="grid size-8 place-items-center rounded-lg text-xs font-black shrink-0 tracking-wider shadow-xs"
              style={{ background: `${fg}20` }}
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold leading-tight" title={name}>
              {name}
            </p>
            <p className="text-[10px] opacity-70 leading-tight">Apple Wallet</p>
          </div>
        </div>

        {/* Top-Right Stamp Counter (Formatted e.g. 02 / 05) */}
        <div className="shrink-0 text-end">
          <span
            className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg border shadow-xs"
            style={{
              backgroundColor: `${fg}15`,
              borderColor: `${fg}25`,
              color: fg,
            }}
          >
            {String(current).padStart(2, "0")} / {String(target).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Pass Center Visual Area */}
      {design.program === "stamp" || design.program === "coupon_morph" ? (
        <div>
          {!isFree && stripDataUri ? (
            /* PRO MODE: Display real generated 1080x360 Retina strip image */
            <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-md group my-1">
              <img
                src={stripDataUri}
                alt="Apple Wallet Pass Strip"
                className="w-full h-auto aspect-[3/1] object-cover block"
              />
              {onSelectStamps && (
                <div className="absolute inset-0 flex items-center justify-around opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-xs">
                  {Array.from({ length: target }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelectStamps(i + 1)}
                      title={`Set to ${i + 1} stamps`}
                      className="size-7 rounded-full bg-white/20 hover:bg-white text-white hover:text-black font-bold text-[10px] flex items-center justify-center transition-all cursor-pointer"
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* FREE MODE: Display visual emoji stamp bar */
            <div
              className="rounded-xl border p-3 my-1 space-y-1.5 transition-colors shadow-xs"
              style={{
                backgroundColor: `${fg}0f`,
                borderColor: `${fg}20`,
              }}
            >
              <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider opacity-75">
                <span>{locale === "ar" ? "شريط الأختام المكتملة" : "STAMP PROGRESS"}</span>
                <span className="font-mono text-[10px]">
                  {current} / {target}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 py-1 select-none">
                {Array.from({ length: target }).map((_, i) => {
                  const isStamped = i < current;
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => onSelectStamps?.(i + 1)}
                      title={`Stamp ${i + 1}`}
                      className={`text-lg sm:text-xl transition-transform ${
                        onSelectStamps
                          ? "cursor-pointer hover:scale-125 active:scale-95"
                          : "cursor-default"
                      }`}
                    >
                      {isStamped ? emoji : "⚪"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* POINTS PROGRAM DISPLAY */
        <div className="space-y-1 py-1">
          <p className="text-[10px] uppercase tracking-wide opacity-75 font-semibold">
            {locale === "ar" ? "رصيد النقاط الحالي" : "Points Balance"}
          </p>
          <p className="text-2xl sm:text-3xl font-black" style={{ color: design.accent }}>
            {current * 25}
          </p>
          <p className="text-[10px] opacity-75">
            {locale === "ar"
              ? `نقطة لكل ${design.sarPerPoint} ر.س • المكافأة: ${headline}`
              : `1 point per ${design.sarPerPoint} SAR • ${headline}`}
          </p>
        </div>
      )}

      {/* Secondary Row: Remaining on left, Stamps / Reward on right */}
      <div
        className="flex items-center justify-between gap-3 text-xs pt-1 border-t"
        style={{ borderColor: `${fg}15` }}
      >
        <div className="text-start">
          <p className="text-[9px] uppercase tracking-wider opacity-60 font-semibold">
            {locale === "ar" ? "المتبقي" : "Remaining"}
          </p>
          <p className="text-xs font-bold leading-tight">
            {remaining} {locale === "ar" ? "أختام" : "left"}
          </p>
        </div>

        <div className="text-end min-w-0 max-w-[170px]">
          <p className="text-[9px] uppercase tracking-wider opacity-60 font-semibold">
            {locale === "ar" ? "المكافأة" : "Reward"}
          </p>
          <p className="text-xs font-bold truncate leading-tight" title={headline}>
            {headline}
          </p>
        </div>
      </div>

      {/* Apple Wallet Style QR Card */}
      <div className="bg-white rounded-xl p-2.5 shadow-inner flex flex-col items-center justify-center text-center">
        <div className="flex items-center justify-center gap-2">
          <QrCode className="size-11 sm:size-12 text-zinc-900" />
        </div>
        <p className="mt-1 text-[9px] font-mono font-semibold text-zinc-700 tracking-wider">
          SCAN AT COUNTER
        </p>
      </div>
    </div>
  );
}

export function PassPreview({
  design,
  locale,
  onSelectStamps,
  showToggle = true,
}: {
  design: PassDesign;
  locale: Locale;
  onSelectStamps?: ((stamps: number) => void) | undefined;
  showToggle?: boolean;
}) {
  const [walletType, setWalletType] = useState<"apple" | "google">("apple");

  const isFree = design.tierMode === "free";
  const effectiveBg =
    isFree && design.colorPreset && WALLET_COLOR_PRESETS[design.colorPreset]
      ? WALLET_COLOR_PRESETS[design.colorPreset].hex
      : design.background;

  return (
    <div className="w-full max-w-sm mx-auto space-y-2">
      {/* Wallet Switcher Tabs (Removed clipped Live Studio text) */}
      {showToggle && (
        <div className="flex items-center justify-center">
          <div className="inline-flex rounded-xl bg-zinc-900 border border-zinc-800 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setWalletType("apple")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                walletType === "apple"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Apple className="size-3" />
              <span>Apple Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => setWalletType("google")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                walletType === "google"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Smartphone className="size-3" />
              <span>Google Wallet</span>
            </button>
          </div>
        </div>
      )}

      {/* Pass Card Shell */}
      {walletType === "apple" ? (
        <figure className="relative transition-all">
          <div className="rounded-[26px] bg-[#18181b] p-2.5 sm:p-3 shadow-2xl border border-zinc-800 ring-1 ring-white/5">
            <div
              className="rounded-2xl p-4 sm:p-4.5 transition-colors duration-200 shadow-md"
              style={{ backgroundColor: effectiveBg }}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              <PassBody design={design} locale={locale} onSelectStamps={onSelectStamps} />
            </div>
          </div>
        </figure>
      ) : (
        <figure className="relative transition-all">
          <div className="rounded-[26px] bg-[#18181b] p-2.5 sm:p-3 shadow-2xl border border-zinc-800 ring-1 ring-white/5">
            <div className="overflow-hidden rounded-2xl" dir={locale === "ar" ? "rtl" : "ltr"}>
              {/* Google top accent line */}
              <div
                className="h-2 w-full transition-colors"
                style={{ backgroundColor: design.accent }}
              />
              <div
                className="p-4 sm:p-4.5 transition-colors duration-200 shadow-md"
                style={{ backgroundColor: effectiveBg }}
              >
                <PassBody design={design} locale={locale} onSelectStamps={onSelectStamps} />
              </div>
            </div>
          </div>
        </figure>
      )}
    </div>
  );
}
