import { useState } from "react";
import { autoContrast, type PassTemplate, type ProgramType } from "@/constants/defaultTemplates";
import type { Locale } from "@/lib/i18n";
import { Apple, QrCode, Smartphone } from "lucide-react";

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
    progress: 3,
    stampIcon: "⭐",
  };
}

function Stamps({
  design,
  fg,
  onSelectStamps,
}: {
  design: PassDesign;
  fg: string;
  onSelectStamps?: ((stamps: number) => void) | undefined;
}) {
  const icon = design.stampIcon || "⭐";
  const count = Math.max(1, Math.min(design.targetStamps || 8, 12));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] opacity-75 font-medium">
        <span>{design.headline || "Stamp Progress"}</span>
        <span className="font-mono text-[10px]">
          {design.progress} / {count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
        {Array.from({ length: count }).map((_, i) => {
          const isStamped = i < design.progress;
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelectStamps?.(i + 1)}
              title={`Stamp ${i + 1}`}
              className={`grid size-7 sm:size-8 place-items-center rounded-full text-xs font-bold transition-transform select-none ${
                onSelectStamps ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default"
              }`}
              style={
                isStamped
                  ? {
                      backgroundColor: design.accent,
                      color: autoContrast(design.accent),
                      boxShadow: `0 0 10px ${design.accent}66`,
                    }
                  : {
                      border: `1.5px dashed ${fg}40`,
                      backgroundColor: `${fg}0a`,
                      color: `${fg}80`,
                    }
              }
            >
              <span className="text-xs sm:text-sm leading-none drop-shadow-xs">{icon}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
  const fg = autoContrast(design.background);
  const name =
    locale === "ar"
      ? design.businessName || design.businessNameEn || "متجرك"
      : design.businessNameEn || design.businessName || "Your Store";
  const headline =
    locale === "ar"
      ? design.headline || "مكافأة بعد اكتمال الأختام"
      : design.headlineEn || "Reward upon completion";
  const sub =
    locale === "ar"
      ? design.subline || "شكراً لولائك الدائم"
      : design.sublineEn || "Thanks for your loyalty";

  return (
    <div className="space-y-3.5" style={{ color: fg }}>
      {/* Pass Header */}
      <div
        className="flex items-center justify-between gap-3 border-b pb-2.5"
        style={{ borderColor: `${fg}1a` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {design.logoUrl ? (
            <img
              src={design.logoUrl}
              alt=""
              className="size-8 rounded-lg object-contain"
              style={{ background: `${fg}15` }}
            />
          ) : (
            <span
              className="grid size-8 place-items-center rounded-lg text-xs font-black shrink-0 tracking-wider"
              style={{ background: `${fg}20` }}
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-bold leading-tight">{name}</p>
            <p className="truncate text-[10px] opacity-70 leading-tight">Apple Wallet</p>
          </div>
        </div>

        <div className="text-end shrink-0">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{
              backgroundColor: `${design.accent}25`,
              color: design.accent,
              border: `1px solid ${design.accent}50`,
            }}
          >
            {design.program === "stamp"
              ? locale === "ar"
                ? "ولاء"
                : "STAMPS"
              : locale === "ar"
                ? "نقاط"
                : "POINTS"}
          </span>
        </div>
      </div>

      {/* Program Content */}
      {design.program === "stamp" || design.program === "coupon_morph" ? (
        <Stamps design={design} fg={fg} onSelectStamps={onSelectStamps} />
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide opacity-75 font-semibold">
            {locale === "ar" ? "رصيد النقاط الحالي" : "Points Balance"}
          </p>
          <p className="text-2xl sm:text-3xl font-black" style={{ color: design.accent }}>
            {design.progress * 25}
          </p>
          <p className="text-[10px] opacity-75">
            {locale === "ar"
              ? `نقطة لكل ${design.sarPerPoint} ر.س • المكافأة: ${headline}`
              : `1 point per ${design.sarPerPoint} SAR • ${headline}`}
          </p>
        </div>
      )}

      {/* Footer / QR Strip */}
      <div className="pt-1 flex items-center justify-between gap-3 text-[10px] opacity-75">
        <span className="truncate max-w-[140px]">{sub}</span>
        <span className="font-mono text-[9px] opacity-50 shrink-0">PKPASS-LIVE</span>
      </div>

      {/* Apple Wallet Style QR container */}
      <div
        className="grid place-items-center rounded-xl py-2 px-3 shadow-inner"
        style={{ background: fg === "#FFFFFF" ? "#FFFFFF" : "#0F172A0D" }}
      >
        <div className="flex items-center gap-2">
          <QrCode className="size-11 sm:size-12" style={{ color: "#0F172A" }} />
          <div className="text-start hidden sm:block">
            <p className="text-[9px] font-mono text-zinc-600 leading-tight">SCAN FOR STAMP</p>
            <p className="text-[8px] font-mono text-zinc-400 leading-tight">CODE: •••• 9842</p>
          </div>
        </div>
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

  return (
    <div className="w-full max-w-sm mx-auto space-y-2">
      {/* Wallet Switcher Tabs */}
      {showToggle && (
        <div className="flex items-center justify-between px-1">
          <div className="inline-flex rounded-xl bg-zinc-900 border border-zinc-800 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setWalletType("apple")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                walletType === "google"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Smartphone className="size-3" />
              <span>Google Wallet</span>
            </button>
          </div>

          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">Live Studio</span>
        </div>
      )}

      {/* Pass Card Shell */}
      {walletType === "apple" ? (
        <figure className="relative transition-all">
          <div className="rounded-[26px] bg-[#18181b] p-2.5 sm:p-3 shadow-2xl border border-zinc-800 ring-1 ring-white/5">
            <div
              className="rounded-2xl p-4 sm:p-4.5 transition-colors duration-200 shadow-md"
              style={{ backgroundColor: design.background }}
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
                style={{ backgroundColor: design.background }}
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
