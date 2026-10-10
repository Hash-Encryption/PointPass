import { useState } from "react";
import { Coffee, Gift, Check, Sparkles, Wifi, BatteryCharging, Signal } from "lucide-react";
import { LocalQrCode } from "@/components/LocalQrCode";

interface PhoneMockupHeroProps {
  className?: string;
  isRtl?: boolean;
}

export function PhoneMockupHero({ className = "", isRtl = true }: PhoneMockupHeroProps) {
  const [stamp7Filled, setStamp7Filled] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const handleToggleStamp7 = () => {
    const nextState = !stamp7Filled;
    setStamp7Filled(nextState);
    if (nextState) {
      setShowCelebration(true);
    }
  };

  const stampsCount = stamp7Filled ? 7 : 6;

  return (
    <div className={`relative select-none ${className}`}>
      {/* Ambient Emerald Glow Backdrop */}
      <div
        className="pointer-events-none absolute -inset-6 sm:-inset-10 rounded-[60px] bg-gradient-to-tr from-emerald-500/20 via-emerald-400/10 to-transparent blur-3xl -z-10"
        aria-hidden="true"
      />

      {/* Side Hardware Buttons (Titanium Finish) */}
      <div
        className="hidden sm:block absolute -left-[7px] top-28 h-10 w-[3px] bg-zinc-600 rounded-l-sm"
        aria-hidden="true"
      />
      <div
        className="hidden sm:block absolute -left-[7px] top-42 h-14 w-[3px] bg-zinc-600 rounded-l-sm"
        aria-hidden="true"
      />
      <div
        className="hidden sm:block absolute -left-[7px] top-60 h-14 w-[3px] bg-zinc-600 rounded-l-sm"
        aria-hidden="true"
      />
      <div
        className="hidden sm:block absolute -right-[7px] top-36 h-20 w-[3px] bg-zinc-600 rounded-r-sm"
        aria-hidden="true"
      />

      {/* Smartphone Chassis */}
      <div className="w-[310px] sm:w-[340px] aspect-[9/19] rounded-[48px] p-3 border-[4px] border-zinc-700/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_50px_rgba(16,185,129,0.15)] relative mx-auto bg-zinc-950 ring-1 ring-white/10 backdrop-blur-xl">
        {/* Subtle Glass Glare / Bezel reflection */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[44px] bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent"
          aria-hidden="true"
        />

        {/* Inner Phone Screen */}
        <div
          className="relative h-full w-full rounded-[38px] bg-zinc-950 p-3.5 sm:p-4 text-white flex flex-col justify-between overflow-hidden border border-zinc-900/60"
          dir={isRtl ? "rtl" : "ltr"}
        >
          {/* Top Status Bar & Dynamic Island */}
          <div className="w-full">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300 px-2 pt-0.5 pb-1">
              {/* Clock */}
              <span className="tracking-tight">9:41</span>

              {/* Dynamic Island Pill */}
              <div className="w-24 h-5 bg-black rounded-full mx-auto border border-zinc-800/80 flex items-center justify-between px-2.5 shadow-inner">
                <span className="size-2 rounded-full bg-zinc-900 ring-1 ring-zinc-800" />
                <span className="size-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
              </div>

              {/* Status Icons */}
              <div className="flex items-center gap-1.5 text-zinc-300">
                <Signal className="size-3 text-zinc-300" />
                <Wifi className="size-3 text-zinc-300" />
                <div className="flex items-center gap-0.5">
                  <span className="text-[9px] font-mono font-bold text-zinc-300">5G</span>
                  <BatteryCharging className="size-3.5 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Apple Wallet Header bar */}
            <div className="flex items-center justify-between mt-2 px-1 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-zinc-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {isRtl ? "محفظة Apple Wallet" : "Apple Wallet Pass"}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">#PK-9482</span>
            </div>
          </div>

          {/* The Apple Wallet Loyalty Pass Card */}
          <div className="relative my-auto rounded-2xl border border-zinc-700/70 bg-gradient-to-b from-zinc-800 to-zinc-900 p-4 shadow-xl text-right backdrop-blur-md transition-all duration-300">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-2 border-b border-zinc-700/60 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                  <Coffee className="size-5" />
                </div>
                <div className="min-w-0 text-right">
                  <h3 className="truncate text-xs font-bold text-white tracking-tight">
                    {isRtl ? "أوربان كافيه | Urban Cafe" : "Urban Cafe | أوربان كافيه"}
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    {isRtl ? "برنامج ولاء القهوة المختصة" : "Specialty Coffee Loyalty"}
                  </p>
                </div>
              </div>

              {/* Counter Badge */}
              <div className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 shadow-xs">
                {isRtl ? `${stampsCount} / 8 أختام` : `${stampsCount} / 8 Stamps`}
              </div>
            </div>

            {/* Main Offer */}
            <div className="py-2.5 text-right">
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/90">
                {isRtl ? "المكافأة القادمة" : "Next Reward"}
              </span>
              <h4 className="mt-0.5 text-sm sm:text-base font-extrabold text-white">
                {isRtl ? "قهوة مجانية بعد 8 أكواب ☕" : "Free Coffee After 8 Cups ☕"}
              </h4>
            </div>

            {/* Stamp Grid (8 Stamps: 2 rows of 4) */}
            <div className="my-1">
              <div className="grid grid-cols-4 gap-2">
                {/* Stamps 1 through 6: Always Filled */}
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <div
                    key={num}
                    className="group relative flex aspect-square items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 font-bold shadow-[0_0_14px_rgba(16,185,129,0.35)] transition-transform hover:scale-105"
                  >
                    <Coffee className="size-4.5 drop-shadow-xs" />
                    <span className="absolute bottom-0.5 text-[8px] font-black opacity-80">
                      {num}
                    </span>
                  </div>
                ))}

                {/* Stamp 7: Interactive Toggle */}
                <button
                  type="button"
                  onClick={handleToggleStamp7}
                  className={`relative flex aspect-square items-center justify-center rounded-xl transition-all duration-300 focus:outline-hidden ${
                    stamp7Filled
                      ? "bg-emerald-500 text-zinc-950 shadow-[0_0_18px_rgba(16,185,129,0.7)] scale-105 ring-2 ring-emerald-300"
                      : "border-2 border-dashed border-zinc-600 bg-zinc-900/50 text-zinc-400 hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 cursor-pointer animate-pulse"
                  }`}
                  title={isRtl ? "اضغط لختم البطاقة تجريبياً" : "Tap to test stamp"}
                >
                  {stamp7Filled ? (
                    <>
                      <Check className="size-5 stroke-[3] drop-shadow-xs" />
                      <span className="absolute bottom-0.5 text-[8px] font-black opacity-85">
                        7
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[11px] font-bold">7</span>
                      <span className="text-[7px] text-emerald-400/80 -mt-0.5 font-medium">
                        {isRtl ? "المسني" : "Tap"}
                      </span>
                    </div>
                  )}
                </button>

                {/* Stamp 8: Reward Milestone */}
                <div className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-amber-500/60 bg-amber-500/10 text-amber-400 shadow-inner">
                  <Gift className="size-5 animate-bounce drop-shadow-sm" />
                  <span className="absolute bottom-0.5 text-[8px] font-bold text-amber-300">8</span>
                </div>
              </div>

              {/* Interactive Celebration Notice */}
              {showCelebration && (
                <div className="mt-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-2 text-center text-xs font-semibold text-emerald-300 transition-all animate-in fade-in zoom-in-95">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3.5 text-emerald-400" />
                    {isRtl
                      ? "ختم واحد متبقي على هديتك! 🎉"
                      : "Just 1 stamp left for your free coffee! 🎉"}
                  </span>
                </div>
              )}
            </div>

            {/* Member Details */}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 text-[10px] text-zinc-400">
              <div>
                <span className="block text-[9px] text-zinc-500">
                  {isRtl ? "حامل البطاقة" : "Cardholder"}
                </span>
                <span className="font-semibold text-zinc-200">
                  {isRtl ? "سلطان العتيبي" : "Sultan Al-Otaibi"}
                </span>
              </div>
              <div className="text-left">
                <span className="block text-[9px] text-zinc-500">
                  {isRtl ? "تاريخ الصلاحية" : "Expires"}
                </span>
                <span className="font-semibold text-zinc-300 font-mono">12/2026</span>
              </div>
            </div>

            {/* Footer: Scannable QR canvas & Apple Wallet Pill Badge */}
            <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-zinc-800/90 pt-3">
              {/* Clean QR Canvas */}
              <div className="flex items-center gap-2">
                <LocalQrCode
                  text="https://pointpass.pages.dev/join/urban-cafe"
                  size={58}
                  className="rounded-lg bg-white p-1 shadow-sm"
                />
                <div className="text-right">
                  <p className="text-[9px] font-bold text-zinc-300">
                    {isRtl ? "امسح عند الكاشير" : "Scan at POS"}
                  </p>
                  <p className="text-[8px] text-zinc-500 font-mono">POS #104</p>
                </div>
              </div>

              {/* Add to Apple Wallet pill badge */}
              <div className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-black px-2.5 py-1.5 text-[10px] font-medium text-white shadow-xs">
                {/* SVG Apple Icon */}
                <svg className="size-3.5 fill-white" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.74 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.08-7.7-7.94-12-14.57-6.03-9.33-10.7-20.08-14.02-32.26-3.32-12.18-4.98-23.76-4.98-34.73 0-15.06 3.86-27.46 11.59-37.21 7.73-9.75 17.51-14.77 29.35-15.06 4.7 0 10.02 1.25 15.96 3.75 5.94 2.5 9.77 3.84 11.49 4.02 2.12-.34 6.13-1.78 12.03-4.32 5.9-2.54 10.9-3.73 15-3.58 11.13.54 20.31 4.54 27.53 12.01-9.92 6-14.81 14.35-14.67 25.06.14 8.7 3.48 15.93 10.02 21.7 6.54 5.76 14.4 9.17 23.58 10.22-2.12 6.5-4.66 13.06-7.63 19.68zM119.22 33.32c0-7.38 2.65-14.19 7.95-20.43 5.3-6.24 11.83-10.27 19.58-12.09.28 1.13.42 2.26.42 3.38 0 7.37-2.73 14.28-8.19 20.73-5.46 6.45-12.07 10.36-19.82 11.74-.29-1.12-.44-2.23-.44-3.33z" />
                </svg>
                <span className="leading-tight text-[9px] font-semibold">
                  Add to
                  <br />
                  Apple Wallet
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Home Indicator Bar */}
          <div className="w-full pb-1">
            <div className="w-32 h-1 bg-zinc-600 rounded-full mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
