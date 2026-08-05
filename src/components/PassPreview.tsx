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
  progress: number;
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
    targetStamps: tpl.program.targetStamps ?? 9,
    sarPerPoint: tpl.program.sarPerPoint ?? 10,
    progress: 4,
  };
}

function Stamps({ design, fg }: { design: PassDesign; fg: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: Math.min(design.targetStamps, 12) }).map((_, i) => (
        <span
          key={i}
          className="grid size-6 place-items-center rounded-full text-[10px] font-bold"
          style={
            i < design.progress
              ? { backgroundColor: design.accent, color: autoContrast(design.accent) }
              : { border: `1.5px dashed ${fg}55`, color: `${fg}88` }
          }
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}

function PassBody({ design, locale }: { design: PassDesign; locale: Locale }) {
  const fg = autoContrast(design.background);
  const name = locale === "ar" ? design.businessName : design.businessNameEn;
  const headline = locale === "ar" ? design.headline : design.headlineEn;
  const sub = locale === "ar" ? design.subline : design.sublineEn;

  return (
    <div className="space-y-4" style={{ color: fg }}>
      <div className="flex items-center gap-3">
        {design.logoUrl ? (
          <img
            src={design.logoUrl}
            alt=""
            className="size-10 rounded-lg object-contain"
            style={{ background: `${fg}18`, maxWidth: 40, maxHeight: 40 }}
          />
        ) : (
          <span
            className="grid size-10 place-items-center rounded-lg text-sm font-bold"
            style={{ background: `${fg}22` }}
          >
            {name.slice(0, 2)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-[11px] opacity-70">{headline}</p>
        </div>
      </div>

      {design.program === "stamp" || design.program === "coupon_morph" ? (
        <Stamps design={design} fg={fg} />
      ) : (
        <div>
          <p className="text-[11px] uppercase tracking-wide opacity-70">
            {locale === "ar" ? "رصيد النقاط" : "Points balance"}
          </p>
          <p className="text-3xl font-extrabold" style={{ color: design.accent }}>
            {design.progress * 25}
          </p>
          <p className="text-[11px] opacity-70">
            {locale === "ar"
              ? `نقطة لكل ${design.sarPerPoint} ر.س`
              : `1 point per ${design.sarPerPoint} SAR`}
          </p>
        </div>
      )}

      <p className="text-[11px] opacity-70">{sub}</p>

      <div
        className="grid place-items-center rounded-lg py-3"
        style={{ background: fg === "#FFFFFF" ? "#FFFFFF" : "#0F172A0D" }}
      >
        <QrCode className="size-14" style={{ color: "#0F172A" }} />
      </div>
    </div>
  );
}

export function PassPreview({ design, locale }: { design: PassDesign; locale: Locale }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Apple Wallet mock */}
      <figure className="space-y-2">
        <figcaption className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Apple className="size-3.5" /> Apple Wallet (.pkpass)
        </figcaption>
        <div className="rounded-[26px] bg-surface-dark p-3 shadow-[var(--shadow-pass)]">
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: design.background }}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <PassBody design={design} locale={locale} />
          </div>
        </div>
      </figure>

      {/* Google Wallet mock */}
      <figure className="space-y-2">
        <figcaption className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Smartphone className="size-3.5" /> Google Wallet
        </figcaption>
        <div className="rounded-[26px] border border-border bg-card p-3 shadow-[var(--shadow-pass)]">
          <div
            className="overflow-hidden rounded-2xl"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="h-2" style={{ backgroundColor: design.accent }} />
            <div className="p-4" style={{ backgroundColor: design.background }}>
              <PassBody design={design} locale={locale} />
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}
