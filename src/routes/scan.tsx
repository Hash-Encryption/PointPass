import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Coins,
  Gift,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Stamp,
  Store,
  User,
  Zap,
} from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  lookupCustomerPass,
  updateWalletPass,
  unlockCashierTerminal,
} from "@/lib/wallet.functions";
import { iconToEmoji, parsePassTemplateMeta, type PassTemplateMeta } from "@/lib/wallet-tier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "شاشة الكاشير | Mobile POS Terminal — PointPass" },
      {
        name: "description",
        content:
          "Fast, tactile dark-mode Cashier Scanner Terminal with live Apple Wallet OTA sync and instant stamp rewards.",
      },
      { property: "og:title", content: "Cashier POS Terminal — PointPass" },
      {
        property: "og:description",
        content: "Scan, stamp and redeem loyalty passes in 2 seconds with live Apple Wallet sync.",
      },
    ],
  }),
  component: CashierTerminal,
});

type BusinessInfo = {
  business_id: string;
  business_slug: string;
  name_ar: string;
  name_en: string;
  branch_name_ar?: string | undefined;
  branch_name_en?: string | undefined;
  staff_name_ar?: string | undefined;
  staff_name_en?: string | undefined;
  cashier_name?: string | undefined;
  template_id?: string | null | undefined;
  brand_color?: string | null | undefined;
  accent_color?: string | null | undefined;
  offer_ar?: string | null | undefined;
  offer_en?: string | null | undefined;
  target_stamps?: number | undefined;
};

type ActivePassSheet = {
  serial: string;
  phone: string | null;
  stamps: number;
  points: number;
  targetStamps: number;
  programType: "stamp" | "points" | "coupon_morph";
  morphed: boolean;
  offer: string;
  customerName?: string | undefined;
  rewardsRedeemed?: number | undefined;
  totalStamps?: number | undefined;
  justUpdated?: boolean | undefined;
  walletSynced?: boolean | undefined;
  walletSync?:
    | {
        synced: boolean;
        status: number;
        error?: string | undefined;
      }
    | undefined;
  actionMessage?: string | undefined;
};

type RecentPassItem = {
  serial: string;
  phone: string | null;
  stamps?: number | undefined;
  timestamp: number;
};

function playPOSChime(type: "scan" | "stamp" | "reward" | "error" = "scan") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "scan") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === "stamp") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.06);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === "reward") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch {
    // AudioContext blocked or not supported
  }
}

function triggerHaptic(type: "scan" | "stamp" | "reward" = "scan") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    if (type === "scan") navigator.vibrate(30);
    else if (type === "stamp") navigator.vibrate([40, 30, 50]);
    else if (type === "reward") navigator.vibrate([60, 40, 80, 40, 100]);
  } catch {
    // Vibration blocked
  }
}

function extractSerialFromQR(text: string): string {
  const trimmed = text.trim();
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const fromParam = url.searchParams.get("serial") || url.searchParams.get("pass");
      if (fromParam) return fromParam.trim();
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && (last.startsWith("PP-") || last.length > 5)) {
        return last.trim();
      }
    }
  } catch {
    // Fall back to regex / raw
  }
  const match = trimmed.match(/PP-[A-Za-z0-9_-]+/i);
  if (match) return match[0];
  return trimmed;
}

function getRecentPasses(slug: string): RecentPassItem[] {
  if (typeof window === "undefined" || !slug) return [];
  try {
    const raw = localStorage.getItem(`cashier_recent_passes_${slug}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentPass(
  slug: string,
  serial: string,
  phone: string | null,
  stamps?: number,
): RecentPassItem[] {
  if (typeof window === "undefined" || !slug || !serial) return [];
  try {
    const existing = getRecentPasses(slug);
    const filtered = existing.filter((p) => p.serial !== serial);
    const updated = [{ serial, phone, stamps, timestamp: Date.now() }, ...filtered].slice(0, 5);
    localStorage.setItem(`cashier_recent_passes_${slug}`, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function CashierTerminal() {
  const { locale, toggle } = useLocale();
  const ar = locale === "ar";

  // Login & Setup State: 3 Simple Fields (Slug, Cashier Name, PIN)
  const [slug, setSlug] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("slug");
      if (s) return s.trim().toLowerCase();
      return localStorage.getItem("cashier_last_slug") ?? "";
    }
    return "";
  });

  const [cashierName, setCashierName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cashier_last_name") ?? "";
    }
    return "";
  });

  const [pin, setPin] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  // Active POS Session State
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [cashierSession, setCashierSession] = useState<string | null>(null);
  const [templateMeta, setTemplateMeta] = useState<PassTemplateMeta>(() =>
    parsePassTemplateMeta(null),
  );

  // Terminal Mode: 'camera' | 'manual'
  const [activeMode, setActiveMode] = useState<"camera" | "manual">("camera");

  // Camera Viewfinder State
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerFlashing, setScannerFlashing] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  // Manual Input State (Quick Bar + Manual Mode)
  const [manualInput, setManualInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [recentPasses, setRecentPasses] = useState<RecentPassItem[]>([]);

  // Active Post-Scan Customer Pass Sheet
  const [activePass, setActivePass] = useState<ActivePassSheet | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const isStampingRef = useRef(false);
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("slug");
      if (s) setSlug(s.trim().toLowerCase());
    }
  }, []);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  // Update recent passes when business is loaded
  useEffect(() => {
    if (business?.business_slug) {
      setRecentPasses(getRecentPasses(business.business_slug));
    }
  }, [business?.business_slug]);

  // Keyboard navigation & POS shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!business) return;

      if (e.key === "Escape") {
        if (activePass) {
          handleNextCustomer();
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (activePass?.justUpdated) {
          e.preventDefault();
          handleNextCustomer();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [business, activePass]);

  async function loadBusinessBranding(bSlug: string) {
    try {
      const { data: bData } = await supabase
        .rpc("get_public_business_by_slug", { _slug: bSlug })
        .maybeSingle();
      if (bData) {
        const row = bData as Record<string, unknown>;
        return {
          template_id: (row["template_id"] as string) ?? null,
          brand_color: (row["brand_color"] as string) ?? null,
          accent_color: (row["accent_color"] as string) ?? null,
          offer_ar: (row["offer_ar"] as string) ?? null,
          offer_en: (row["offer_en"] as string) ?? null,
        };
      }
    } catch {
      // Direct RPC fallback
    }
    return null;
  }

  async function unlockTerminal(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();
    const cleanName = cashierName.trim();

    if (!cleanSlug) {
      toast.error(ar ? "يرجى كتابة اسم/معرّف المنشأة (Slug)" : "Please enter business slug");
      return;
    }
    if (!cleanName) {
      toast.error(ar ? "يرجى كتابة اسم الكاشير" : "Please enter cashier name");
      return;
    }
    if (pin.length !== 4) {
      toast.error(ar ? "أدخل رمز PIN المكون من 4 أرقام" : "Enter 4-digit PIN");
      return;
    }

    setAuthenticating(true);
    try {
      // Smart Dual-PIN Verification (Individual Cashier PIN first, Global Business PIN second)
      let unlockData: {
        business_id: string;
        business_slug: string;
        name_ar: string;
        name_en: string;
        branch_name_ar?: string | undefined;
        branch_name_en?: string | undefined;
        staff_name_ar?: string | undefined;
        staff_name_en?: string | undefined;
        cashier_session: string;
        session_expires_at: string;
        cashier_name?: string | undefined;
      } | null = null;

      try {
        const res = await unlockCashierTerminal({
          data: {
            slug: cleanSlug,
            cashierName: cleanName,
            pin,
          },
        });
        if (res.ok && res.business_id && res.cashier_session) {
          unlockData = {
            business_id: res.business_id,
            business_slug: res.business_slug,
            name_ar: res.name_ar,
            name_en: res.name_en,
            branch_name_ar: res.branch_name_ar,
            branch_name_en: res.branch_name_en,
            staff_name_ar: res.staff_name_ar,
            staff_name_en: res.staff_name_en,
            cashier_session: res.cashier_session,
            session_expires_at: res.session_expires_at,
            cashier_name: cleanName,
          };
        }
      } catch {
        // Direct RPC fallback if server function unreachable
      }

      // Preserved direct RPC fallback (supports both cashier_unlock and cashier_unlock_staff)
      if (!unlockData) {
        const { data: directData } = await supabase
          .rpc("cashier_unlock", { _slug: cleanSlug, _pin: pin })
          .maybeSingle();

        if (directData) {
          const biz = directData as Record<string, unknown>;
          unlockData = {
            business_id: biz["business_id"] as string,
            business_slug: biz["business_slug"] as string,
            name_ar: biz["name_ar"] as string,
            name_en: biz["name_en"] as string,
            cashier_session: biz["cashier_session"] as string,
            session_expires_at: biz["session_expires_at"] as string,
            cashier_name: cleanName,
          };
        } else {
          // Check staff RPC if configured
          try {
            const { data: staffData } = await supabase
              .rpc("cashier_unlock_staff", {
                _slug: cleanSlug,
                _branch_code: "main",
                _staff_code: cleanName.toLowerCase(),
                _pin: pin,
              })
              .maybeSingle();
            if (staffData) {
              const sBiz = staffData as Record<string, unknown>;
              unlockData = {
                business_id: sBiz["business_id"] as string,
                business_slug: sBiz["business_slug"] as string,
                name_ar: sBiz["name_ar"] as string,
                name_en: sBiz["name_en"] as string,
                cashier_session: sBiz["cashier_session"] as string,
                session_expires_at: sBiz["session_expires_at"] as string,
                cashier_name: cleanName,
              };
            }
          } catch {
            // Ignore
          }
        }
      }

      if (!unlockData) {
        playPOSChime("error");
        toast.error(
          ar ? "اسم المنشأة أو رمز PIN غير صحيح" : "Incorrect business slug or cashier PIN",
        );
        setPin("");
        return;
      }

      const res = unlockData;

      localStorage.setItem("cashier_last_slug", cleanSlug);
      localStorage.setItem("cashier_last_name", cleanName);

      // Query template metadata and branding for live terminal display
      const branding = await loadBusinessBranding(cleanSlug);
      const parsedMeta = parsePassTemplateMeta(branding?.template_id);
      setTemplateMeta(parsedMeta);

      setBusiness({
        business_id: res.business_id,
        business_slug: res.business_slug,
        name_ar: res.name_ar,
        name_en: res.name_en,
        branch_name_ar: res.branch_name_ar,
        branch_name_en: res.branch_name_en,
        staff_name_ar: res.staff_name_ar || cleanName,
        staff_name_en: res.staff_name_en || cleanName,
        cashier_name: cleanName,
        template_id: branding?.template_id ?? null,
        brand_color: branding?.brand_color ?? null,
        accent_color: branding?.accent_color ?? null,
        offer_ar: branding?.offer_ar ?? null,
        offer_en: branding?.offer_en ?? null,
        target_stamps: 8,
      });

      setCashierSession(res.cashier_session);
      setPin("");
      playPOSChime("scan");
      toast.success(
        ar
          ? `مرحباً ${cleanName} — تم فتح الشاشة لـ ${res.name_ar}`
          : `Welcome ${cleanName} — Terminal unlocked for ${res.name_en}`,
      );

      // Auto-start camera if in camera mode
      setTimeout(() => {
        void startScan();
      }, 300);
    } catch {
      playPOSChime("error");
      toast.error(ar ? "خطأ في الاتصال بالخادم" : "Connection error");
    } finally {
      setAuthenticating(false);
    }
  }

  function lockTerminal(showToast = true) {
    setBusiness(null);
    setCashierSession(null);
    setPin("");
    setActivePass(null);
    scannerRef.current?.stop().catch(() => {});
    setScanning(false);
    if (showToast) toast.info(ar ? "تم إغلاق الشاشة" : "Terminal locked");
  }

  async function startScan() {
    setCameraError(null);
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // ignore
        }
      }

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };

      await scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await handlePassDetected(decodedText);
          try {
            await scanner.stop();
          } catch {
            // ignore
          }
          setScanning(false);
        },
        () => {},
      );
    } catch (err: unknown) {
      setScanning(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      setCameraError(errMsg);
      console.warn("Camera start note:", errMsg);
    }
  }

  async function stopScan() {
    try {
      await scannerRef.current?.stop();
    } catch {
      // ignore
    }
    setScanning(false);
  }

  async function handlePassDetected(rawText: string) {
    if (!business) return;
    const cleanSerial = extractSerialFromQR(rawText);
    if (!cleanSerial) return;

    playPOSChime("scan");
    triggerHaptic("scan");
    setScannerFlashing(true);
    setTimeout(() => setScannerFlashing(false), 500);

    const updatedRecents = saveRecentPass(business.business_slug, cleanSerial, null);
    setRecentPasses(updatedRecents);

    setLookupLoading(true);
    try {
      const res = await lookupCustomerPass({
        data: {
          slug: business.business_slug,
          query: cleanSerial,
          cashierSession,
        },
      });

      const passOffer =
        res.offer ||
        (ar ? business.offer_ar : business.offer_en) ||
        (ar ? "مكافأة خاصة" : "Special Reward");

      // Initial scan guarantee: minimum 1 welcome stamp (never 0/N on initial scan)
      const currentStamps = Math.max(1, res.stamps ?? 1);

      setActivePass({
        serial: res.serial || cleanSerial,
        phone: res.phone ?? null,
        stamps: currentStamps,
        points: res.points ?? 0,
        targetStamps: res.targetStamps || business.target_stamps || 8,
        programType: res.programType || "stamp",
        morphed: res.morphed ?? false,
        offer: passOffer,
        customerName: res.customerName,
        rewardsRedeemed: res.rewardsRedeemed,
        totalStamps: res.totalStamps,
      });

      toast.success(
        ar
          ? `تم مسح البطاقة: ••••${cleanSerial.slice(-6)} (${currentStamps}/${res.targetStamps || 8})`
          : `Pass scanned: ••••${cleanSerial.slice(-6)} (${currentStamps}/${res.targetStamps || 8})`,
      );
    } catch {
      setActivePass({
        serial: cleanSerial,
        phone: null,
        stamps: 1, // Welcome stamp guarantee
        points: 0,
        targetStamps: business.target_stamps || 8,
        programType: "stamp",
        morphed: false,
        offer: (ar ? business.offer_ar : business.offer_en) || "Special Reward",
      });
      toast.success(ar ? "تم تسجيل معرّف البطاقة" : "Pass serial recognized");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleManualSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!business || !manualInput.trim()) return;

    const query = manualInput.trim();
    setLookupLoading(true);

    try {
      const res = await lookupCustomerPass({
        data: {
          slug: business.business_slug,
          query,
          cashierSession,
        },
      });

      const cleanSerial = res.serial || query;
      const passOffer =
        res.offer ||
        (ar ? business.offer_ar : business.offer_en) ||
        (ar ? "مكافأة خاصة" : "Special Reward");

      playPOSChime("scan");
      triggerHaptic("scan");

      const currentStamps = Math.max(1, res.stamps ?? 1);

      const updatedRecents = saveRecentPass(
        business.business_slug,
        cleanSerial,
        res.phone || null,
        currentStamps,
      );
      setRecentPasses(updatedRecents);

      setActivePass({
        serial: cleanSerial,
        phone: res.phone || (query.match(/^[0-9+]/) ? query : null),
        stamps: currentStamps,
        points: res.points ?? 0,
        targetStamps: res.targetStamps || business.target_stamps || 8,
        programType: res.programType || "stamp",
        morphed: res.morphed ?? false,
        offer: passOffer,
        customerName: res.customerName,
        rewardsRedeemed: res.rewardsRedeemed,
        totalStamps: res.totalStamps,
      });

      toast.success(
        res.isNew
          ? ar
            ? "تم تسجيل عميل جديد بختم ترحيبي (1/8)!"
            : "New customer enrolled with 1 welcome stamp (1/8)!"
          : ar
            ? `تم العثور على بطاقة العميل (${currentStamps}/${res.targetStamps || 8})`
            : `Customer pass loaded (${currentStamps}/${res.targetStamps || 8})`,
      );
    } catch {
      playPOSChime("error");
      toast.error(ar ? "تعذر العثور على البطاقة" : "Could not find pass");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleApplyAction(action: "stamp" | "points" | "redeem", count = 1) {
    if (isStampingRef.current || actionInProgress) return;
    if (!activePass || !business || !cashierSession) {
      toast.error(
        ar ? "انتهت جلسة الكاشير. افتح الشاشة مجدداً" : "Cashier session expired. Unlock again",
      );
      lockTerminal(false);
      return;
    }

    const amountSar = Number(amount);
    if (action === "points" && (!Number.isFinite(amountSar) || amountSar <= 0)) {
      toast.error(ar ? "أدخل مبلغاً صحيحاً أكبر من صفر" : "Enter a valid amount above zero");
      return;
    }

    isStampingRef.current = true;
    setActionInProgress(true);
    try {
      const res = await updateWalletPass({
        data: {
          slug: business.business_slug,
          cashierSession,
          serial: activePass.serial,
          action,
          count,
          amountSar: action === "points" ? amountSar : undefined,
          templateId: business.template_id,
          brandColor: business.brand_color,
          accentColor: business.accent_color,
          businessName: ar ? business.name_ar : business.name_en,
          offerText: ar ? business.offer_ar : business.offer_en,
        },
      });

      if (!res.recorded) {
        if ("sessionExpired" in res && res.sessionExpired) {
          playPOSChime("error");
          toast.error(ar ? "انتهت جلسة الكاشير" : "Cashier session expired");
          lockTerminal(false);
          return;
        }
        playPOSChime("error");
        toast.error(res.error || (ar ? "تعذر تسجيل العملية" : "Could not record action"));
        return;
      }

      const nextStamps =
        res.stamps ?? (action === "stamp" ? activePass.stamps + count : activePass.stamps);
      const nextPoints = res.points ?? activePass.points;
      const target = res.targetStamps ?? activePass.targetStamps;

      if (action === "redeem") {
        playPOSChime("reward");
        triggerHaptic("reward");
      } else {
        playPOSChime("stamp");
        triggerHaptic("stamp");
      }

      let confirmMsg = "";
      if (action === "stamp") {
        confirmMsg = ar
          ? `✓ تمت إضافة ${count > 1 ? count + " أختام" : "ختم"}! تم تحديث رصيد Apple Wallet إلى ${nextStamps}/${target}`
          : `✓ +${count} Stamp${count > 1 ? "s" : ""} Added! Apple Wallet pass updated to ${nextStamps}/${target}`;
      } else if (action === "redeem") {
        confirmMsg = ar
          ? "🎉 تم استلام المكافأة بنجاح! تم تجديد البطاقة للدورة القادمة."
          : "🎉 Reward Redeemed! Card reset for next cycle.";
      } else {
        confirmMsg = ar
          ? `✓ تم تسجيل المبلغ! رصيد النقاط: ${nextPoints}`
          : `✓ SAR spend logged! Points balance: ${nextPoints} pts`;
      }

      // Warn when a recorded action fails wallet sync (tested in check-wallet-payload.mjs)
      if (!res.ok) {
        toast.warning(
          ar
            ? "تم تسجيل العملية، لكن مزامنة المحفظة غير متاحة"
            : "Action recorded, but wallet sync is unavailable",
        );
      }

      const syncStatus = res.walletSync;

      setActivePass((prev) =>
        prev
          ? {
              ...prev,
              stamps: nextStamps,
              points: nextPoints,
              morphed: res.morphed ?? prev.morphed,
              targetStamps: target,
              justUpdated: true,
              walletSynced: syncStatus.synced,
              walletSync: syncStatus,
              actionMessage: confirmMsg,
            }
          : null,
      );

      saveRecentPass(business.business_slug, activePass.serial, activePass.phone, nextStamps);
      toast.success(confirmMsg);
    } catch (err: unknown) {
      playPOSChime("error");
      const msg = err instanceof Error ? err.message : ar ? "خطأ في الاتصال" : "Network error";
      toast.error(msg);
    } finally {
      isStampingRef.current = false;
      setActionInProgress(false);
      if (action === "points") setAmount("");
    }
  }

  function handleNextCustomer() {
    setActivePass(null);
    setManualInput("");
    if (activeMode === "camera") {
      void startScan();
    }
  }

  const storeEmoji = iconToEmoji(templateMeta.stampIcon);

  // =========================================================================
  // 1. LOCKED TERMINAL SCREEN (PIN PAD - 3 REQUIRED FIELDS)
  // =========================================================================
  if (!business) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col justify-between p-4 relative selection:bg-emerald-500/30 selection:text-emerald-200">
        {/* Subtle top emerald glow */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_65%)] -z-10" />

        {/* Top bar with back to dashboard and language switcher */}
        <div className="w-full max-w-sm mx-auto flex items-center justify-between pt-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/60 hover:bg-zinc-800/80 px-3 py-1.5 rounded-lg border border-zinc-800 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>{ar ? "لوحة التحكم" : "Dashboard"}</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-zinc-400 hover:text-white"
            onClick={toggle}
          >
            <Globe className="size-3.5 me-1 text-zinc-500" />
            <span>{ar ? "English" : "العربية"}</span>
          </Button>
        </div>

        {/* Center Card */}
        <div className="w-full max-w-sm mx-auto my-auto">
          <form
            onSubmit={unlockTerminal}
            className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/80 backdrop-blur-xl p-6 text-center shadow-2xl"
          >
            <div className="space-y-1.5">
              <div className="mx-auto size-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <Lock className="size-6" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                {ar ? "شاشة الكاشير" : "Cashier POS Terminal"}
              </h1>
              <p className="text-xs text-zinc-400">
                {ar
                  ? "أدخل اسم المنشأة، اسم الكاشير، ورمز PIN"
                  : "Enter business slug, cashier name, and 4-digit PIN"}
              </p>
            </div>

            <div className="space-y-3 text-start">
              {/* Field 1: Business Slug */}
              <div>
                <Label htmlFor="restaurant-slug" className="text-xs text-zinc-400">
                  {ar ? "معرّف المنشأة (Slug)" : "Business Slug"}
                </Label>
                <div className="relative mt-1">
                  <Store className="absolute start-3 top-3 size-4 text-zinc-500" />
                  <Input
                    id="restaurant-slug"
                    placeholder="smash-burger"
                    value={slug}
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    required
                    dir="ltr"
                    className="ps-9 border-zinc-800 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Field 2: Cashier Name */}
              <div>
                <Label htmlFor="cashier-name" className="text-xs text-zinc-400">
                  {ar ? "اسم الكاشير" : "Cashier Name"}
                </Label>
                <div className="relative mt-1">
                  <User className="absolute start-3 top-3 size-4 text-zinc-500" />
                  <Input
                    id="cashier-name"
                    placeholder={ar ? "أحمد أو سارة" : "Ahmed or Sarah"}
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    required
                    className="ps-9 border-zinc-800 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Field 3: PIN Dots Display */}
              <div>
                <Label
                  htmlFor="cashier-pin"
                  className="text-xs text-zinc-400 flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="size-3 text-emerald-400" />
                    <span>{ar ? "رمز PIN (٤ أرقام)" : "Cashier PIN (4 digits)"}</span>
                  </span>
                  {pin.length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 underline"
                      onClick={() => setPin("")}
                    >
                      {ar ? "مسح" : "Clear"}
                    </button>
                  )}
                </Label>
                <div className="mt-1.5 flex items-center justify-center gap-3 py-2.5 bg-zinc-950/70 border border-zinc-800 rounded-xl">
                  {[0, 1, 2, 3].map((idx) => {
                    const filled = pin.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`size-3.5 rounded-full transition-all duration-200 ${
                          filled
                            ? "bg-emerald-400 scale-110 shadow-sm shadow-emerald-400/50"
                            : "bg-zinc-800 border border-zinc-700"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tactile Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "↵"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`h-12 rounded-xl text-lg font-bold transition-all active:scale-95 ${
                    k === "↵"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black shadow-lg shadow-emerald-500/20"
                      : k === "C"
                        ? "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60"
                        : "bg-zinc-800/60 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-800"
                  }`}
                  onClick={() => {
                    if (k === "C") setPin("");
                    else if (k === "↵") void unlockTerminal();
                    else setPin((p) => (p + k).slice(0, 4));
                  }}
                >
                  {k}
                </button>
              ))}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl shadow-lg shadow-emerald-500/20"
              disabled={authenticating || pin.length !== 4 || !cashierName.trim() || !slug.trim()}
            >
              {authenticating
                ? ar
                  ? "جاري التحقق..."
                  : "Verifying..."
                : ar
                  ? "دخول الشاشة"
                  : "Unlock Terminal"}
            </Button>
          </form>
        </div>

        {/* Footer info */}
        <div className="w-full max-w-sm mx-auto text-center pb-2 text-[11px] text-zinc-400">
          PointPass V3 POS Engine · Linear × Apple Wallet Aesthetic
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. UNLOCKED HIGH-SPEED POS TERMINAL SCREEN
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top emerald atmospheric glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_60%)] -z-10" />

      {/* Screen flash on barcode decode */}
      {scannerFlashing && (
        <div className="fixed inset-0 pointer-events-none bg-emerald-500/20 z-50 animate-out fade-out duration-300" />
      )}

      {/* Top POS Header Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl px-4 py-2.5">
        <div className="mx-auto max-w-xl flex items-center justify-between gap-2">
          {/* Left: Dashboard link & Store badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg border border-zinc-800 transition-colors shrink-0"
              title={ar ? "العودة للوحة التحكم" : "Return to Dashboard"}
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">{ar ? "لوحة التحكم" : "Dashboard"}</span>
            </Link>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
                {storeEmoji}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-xs sm:text-sm text-zinc-100 truncate">
                  {ar ? business.name_ar : business.name_en}
                </div>
                <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 truncate">
                  <span className="font-mono text-emerald-400">@{business.business_slug}</span>
                  {/* Cashier Name Display */}
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-300 font-medium flex items-center gap-0.5">
                    <User className="size-2.5 text-emerald-400 inline" />
                    <span>
                      {ar
                        ? `الكاشير: ${business.cashier_name || business.staff_name_ar}`
                        : `Cashier: ${business.cashier_name || business.staff_name_en}`}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Language & Lock */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={toggle}
              className="h-8 px-2 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <Globe className="size-3.5 me-1 text-zinc-500" />
              <span>{ar ? "EN" : "العربية"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => lockTerminal()}
              className="h-8 px-2.5 text-xs border-zinc-800 bg-zinc-900/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-zinc-400 transition-colors"
            >
              <LogOut className="size-3.5 me-1" />
              <span>{ar ? "قفل" : "Lock"}</span>
            </Button>
          </div>
        </div>

        {/* Sub-bar: Mode Switcher Pill */}
        <div className="mx-auto max-w-xl pt-2">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
            <button
              type="button"
              className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeMode === "camera"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm shadow-black"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              onClick={() => {
                setActiveMode("camera");
                if (!activePass) void startScan();
              }}
            >
              <Camera className="size-3.5 text-emerald-400" />
              <span>{ar ? "📷 مسح بالكاميرا" : "📷 Camera Scanner"}</span>
            </button>
            <button
              type="button"
              className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeMode === "manual"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm shadow-black"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              onClick={() => {
                setActiveMode("manual");
                void stopScan();
              }}
            >
              <Search className="size-3.5 text-blue-400" />
              <span>{ar ? "⌨️ إدخال يدوي / جوال" : "⌨️ Manual / Phone"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="mx-auto w-full max-w-xl flex-1 p-4 space-y-4">
        {/* POST-SCAN CUSTOMER PASS SHEET */}
        {activePass ? (
          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/90 backdrop-blur-xl p-5 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Customer Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <User className="size-5" />
                </div>
                <div>
                  <div className="font-bold text-sm sm:text-base text-zinc-100 flex items-center gap-2">
                    <span>
                      {activePass.phone
                        ? activePass.phone
                        : activePass.customerName ||
                          (ar ? "عميل زائر (Pass)" : "Loyalty Pass Customer")}
                    </span>
                  </div>
                  {/* Monospace Pass Serial Badge */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                      dir="ltr"
                    >
                      {activePass.serial}
                    </span>
                    {activePass.rewardsRedeemed !== undefined && activePass.rewardsRedeemed > 0 && (
                      <span className="text-[10px] text-amber-400">
                        {ar
                          ? `(${activePass.rewardsRedeemed} مكافأة مستلمة)`
                          : `(${activePass.rewardsRedeemed} redeemed)`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="shrink-0 text-end">
                {activePass.stamps >= activePass.targetStamps ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                    <Sparkles className="size-3.5" />
                    <span>{ar ? "المكافأة جاهزة!" : "Reward Ready!"}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="size-3.5" />
                    <span>{ar ? "جاهز للختم" : "Ready to Stamp"}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Live Progress Display */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100 font-mono">
                    {activePass.programType === "points" ? (
                      <>
                        {activePass.points}{" "}
                        <span className="text-sm font-normal text-zinc-400">
                          {ar ? "نقطة" : "PTS"}
                        </span>
                      </>
                    ) : (
                      <>
                        {activePass.stamps} / {activePass.targetStamps}{" "}
                        <span className="text-sm font-normal text-zinc-400">
                          {ar ? "أختام" : "STAMPS"}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {activePass.stamps >= activePass.targetStamps
                      ? ar
                        ? `🎉 حقق العميل المكافأة: ${activePass.offer}`
                        : `🎉 Reward unlocked: ${activePass.offer}`
                      : ar
                        ? `متبقي ${Math.max(0, activePass.targetStamps - activePass.stamps)} أختام للحصول على: ${activePass.offer}`
                        : `${Math.max(0, activePass.targetStamps - activePass.stamps)} left for: ${activePass.offer}`}
                  </div>
                </div>

                {/* OTA Sync status indicator */}
                <div className="text-end">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md ${
                      activePass.walletSync
                        ? activePass.walletSync.synced
                          ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          : "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                        : activePass.walletSynced !== false
                          ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          : "text-zinc-400 bg-zinc-800"
                    }`}
                  >
                    <Zap className="size-3" />
                    <span>
                      {activePass.walletSync
                        ? activePass.walletSync.synced
                          ? "Apple Wallet (Live)"
                          : `Sync Pending (${activePass.walletSync.status || activePass.walletSync.error})`
                        : "Apple Wallet OTA"}
                    </span>
                  </span>
                </div>
              </div>

              {/* Live Emoji Progress Bar & Badges */}
              {activePass.programType !== "points" && (
                <LiveEmojiProgressBar
                  stamps={activePass.stamps}
                  target={activePass.targetStamps}
                  stampIcon={templateMeta.stampIcon}
                  ar={ar}
                />
              )}
            </div>

            {/* Action Confirmation Banner */}
            {activePass.actionMessage && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center space-y-1.5 animate-in fade-in duration-200">
                <div className="text-xs text-emerald-300 font-medium">
                  {activePass.actionMessage}
                </div>
                {activePass.walletSync && (
                  <div className="text-[11px] font-mono flex items-center justify-center gap-1.5 pt-1 border-t border-emerald-500/20">
                    {activePass.walletSync.synced ? (
                      <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                        <span>🟢</span>
                        <span>Synced to Apple Wallet (Live)</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold inline-flex items-center gap-1">
                        <span>🟡</span>
                        <span>
                          Saved to DB — Wallet Sync Pending (
                          {activePass.walletSync.status || activePass.walletSync.error})
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tactile Cashier Action Controls */}
            <div className="space-y-2.5 pt-1">
              {activePass.programType === "points" ? (
                /* Points program: SAR spend input */
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      inputMode="decimal"
                      placeholder={ar ? "المبلغ بالريال (SAR)" : "Amount in SAR"}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-14 border-zinc-700 bg-zinc-950 text-center text-2xl font-bold text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                    />
                  </div>
                  <Button
                    className="h-14 w-full text-base font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl shadow-lg shadow-emerald-500/20"
                    disabled={actionInProgress}
                    onClick={() => void handleApplyAction("points")}
                  >
                    <Coins className="me-2 size-5" />
                    {actionInProgress
                      ? ar
                        ? "جاري التسجيل..."
                        : "Recording..."
                      : ar
                        ? "تسجيل المبلغ وإضافة النقاط"
                        : "Log SAR & Earn Points"}
                  </Button>
                </div>
              ) : (
                /* Stamp card program */
                <>
                  {/* Primary: +1 Stamp */}
                  <Button
                    className="h-14 w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all"
                    disabled={actionInProgress}
                    onClick={() => void handleApplyAction("stamp", 1)}
                  >
                    <Stamp className="me-2 size-6" />
                    {actionInProgress
                      ? ar
                        ? "جاري التحديث والمزامنة..."
                        : "Syncing Wallet..."
                      : ar
                        ? "+1 ختم (إضافة ختم)"
                        : "+1 Stamp"}
                  </Button>

                  {/* Quick Multiplier Pills: +2, +3, +5 Stamps */}
                  <div className="grid grid-cols-3 gap-2">
                    {[2, 3, 5].map((multiplier) => (
                      <Button
                        key={multiplier}
                        type="button"
                        variant="secondary"
                        disabled={actionInProgress}
                        className="h-11 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 font-semibold text-xs sm:text-sm active:scale-95"
                        onClick={() => void handleApplyAction("stamp", multiplier)}
                      >
                        <Plus className="size-3.5 me-1 text-emerald-400" />
                        <span>{ar ? `+${multiplier} أختام` : `+${multiplier} Stamps`}</span>
                      </Button>
                    ))}
                  </div>

                  {/* Reward Redemption Button: Highlighted when unlocked */}
                  {activePass.stamps >= activePass.targetStamps && (
                    <Button
                      className="h-14 w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-base sm:text-lg shadow-lg shadow-amber-500/25 active:scale-[0.99] transition-all"
                      disabled={actionInProgress}
                      onClick={() => void handleApplyAction("redeem")}
                    >
                      <Gift className="me-2 size-6" />
                      {actionInProgress
                        ? ar
                          ? "جاري تسليم المكافأة..."
                          : "Redeeming..."
                        : ar
                          ? `🎁 استلام المكافأة (${activePass.offer})`
                          : `🎁 Redeem Reward (${activePass.offer})`}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Next Customer 2-Second Loop Button */}
            <div className="pt-2 border-t border-zinc-800 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 rounded-xl border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-100 font-bold text-sm"
                onClick={handleNextCustomer}
              >
                <span>{ar ? "مسح العميل التالي ←" : "Scan Next Customer →"}</span>
                <span className="ms-2 text-[10px] text-zinc-400 font-normal hidden sm:inline">
                  (Enter / Esc)
                </span>
              </Button>
            </div>
          </div>
        ) : (
          /* NO ACTIVE PASS SHEET -> VIEW CAMERA OR MANUAL LOOKUP */
          <>
            {activeMode === "camera" ? (
              /* CAMERA SCANNER VIEWPORT */
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  {/* Viewport container */}
                  <div className="relative aspect-square max-w-sm mx-auto overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                    <div id="qr-reader" className="w-full h-full overflow-hidden" />

                    {/* Animated corner reticle & sweep line while scanning */}
                    {scanning && (
                      <div className="pointer-events-none absolute inset-6 flex flex-col justify-between">
                        <div className="flex justify-between">
                          <div className="size-6 border-s-2 border-t-2 border-emerald-400 rounded-tl-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                          <div className="size-6 border-e-2 border-t-2 border-emerald-400 rounded-tr-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        </div>

                        <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse" />

                        <div className="flex justify-between">
                          <div className="size-6 border-s-2 border-b-2 border-emerald-400 rounded-bl-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                          <div className="size-6 border-e-2 border-b-2 border-emerald-400 rounded-br-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        </div>
                      </div>
                    )}

                    {/* Fallback state if camera is off or denied */}
                    {cameraError && (
                      <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
                        <CameraOff className="size-10 text-zinc-500" />
                        <div className="text-xs text-zinc-300 max-w-[240px]">
                          {ar
                            ? "تعذر فتح الكاميرا (يرجى السماح بالوصول أو استخدام الإدخال اليدوي)"
                            : "Camera access unavailable or denied. Use manual lookup below."}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-xs"
                          onClick={() => setActiveMode("manual")}
                        >
                          {ar ? "الانتقال للإدخال اليدوي" : "Switch to Manual Lookup"}
                        </Button>
                      </div>
                    )}

                    {/* Camera stopped prompt */}
                    {!scanning && !cameraError && (
                      <div className="absolute inset-0 bg-zinc-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
                        <QrCode className="size-12 text-zinc-600" />
                        <p className="text-xs text-zinc-400">
                          {ar ? "الكاميرا جاهزة للمسح" : "Camera viewfinder paused"}
                        </p>
                        <Button
                          className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs"
                          onClick={() => void startScan()}
                        >
                          <Camera className="me-2 size-4" />
                          {ar ? "تشغيل الكاميرا الآن" : "Start Camera"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Scan status footer */}
                  <div className="mt-3 text-center">
                    <p className="text-xs text-zinc-400">
                      {scanning
                        ? ar
                          ? "وجّه رمز QR لبطاقة Apple Wallet داخل الإطار للمسح الفوري..."
                          : "Align Apple Wallet pass QR inside frame for instant scan..."
                        : ar
                          ? "اضغط لتشغيل الكاميرا والمسح التلقائي"
                          : "Tap button above to arm camera"}
                    </p>
                  </div>
                </div>

                {/* Quick Manual Entry Bar directly below camera */}
                <form
                  onSubmit={handleManualSubmit}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-900/80 backdrop-blur-xl p-3 flex items-center gap-2"
                >
                  <Search className="size-4 text-zinc-500 ms-2 shrink-0" />
                  <Input
                    placeholder={
                      ar
                        ? "اكتب رقم الجوال (05...) أو كود البطاقة (PP-...)..."
                        : "Phone (05...) or Pass Code (PP-...)..."
                    }
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    dir="ltr"
                    className="border-0 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-0"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={lookupLoading || !manualInput.trim()}
                    className="h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs shrink-0"
                  >
                    {lookupLoading ? (
                      <RefreshCw className="size-3 animate-spin" />
                    ) : ar ? (
                      "بحث"
                    ) : (
                      "Go"
                    )}
                  </Button>
                </form>
              </div>
            ) : (
              /* MANUAL CODE / PHONE LOOKUP MODE */
              <div className="space-y-4">
                <form
                  onSubmit={handleManualSubmit}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-900/80 backdrop-blur-xl p-5 space-y-4 shadow-2xl"
                >
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                      <Search className="size-4 text-emerald-400" />
                      <span>
                        {ar ? "البحث برقم الجوال أو كود البطاقة" : "Phone or Pass Code Lookup"}
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {ar
                        ? "أدخل رقم جوال العميل (05XXXXXXXX) الذي يحفظه دائماً، أو معرّف البطاقة الظاهر على واجهة البطاقة (PP-XXXXXX)"
                        : "Enter the customer's phone number (05... / +966...) or the Pass Code (PP-...) printed on their pass"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        autoFocus
                        placeholder={
                          ar ? "مثال: 0501234567 أو PP-482019" : "e.g., 0501234567 or PP-482019"
                        }
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        dir="ltr"
                        className="h-14 border-zinc-700 bg-zinc-950 font-mono text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={lookupLoading || !manualInput.trim()}
                      className="h-12 w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20"
                    >
                      {lookupLoading ? (
                        <RefreshCw className="size-4 animate-spin me-2" />
                      ) : (
                        <Search className="size-4 me-2" />
                      )}
                      {lookupLoading
                        ? ar
                          ? "جارٍ البحث والتحقق..."
                          : "Looking up pass..."
                        : ar
                          ? "بحث واستعراض البطاقة"
                          : "Find Customer Pass"}
                    </Button>
                  </div>
                </form>

                {/* Quick-Select Recent Passes */}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/80 backdrop-blur-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300">
                      {ar ? "البطاقات الممسوحة مؤخراً" : "Recent Passes in this Terminal"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {recentPasses.length} {ar ? "عملاء" : "passes"}
                    </span>
                  </div>

                  {recentPasses.length > 0 ? (
                    <div className="space-y-2">
                      {recentPasses.map((item) => (
                        <button
                          key={item.serial}
                          type="button"
                          className="w-full flex items-center justify-between p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800/60 text-start transition-colors"
                          onClick={() => {
                            setManualInput(item.serial);
                            void handlePassDetected(item.serial);
                          }}
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-zinc-200 truncate" dir="ltr">
                              {item.serial}
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">
                              {item.phone || (ar ? "عميل زائر" : "Guest Pass")}
                            </div>
                          </div>
                          <div className="text-end shrink-0">
                            <span className="text-xs font-semibold text-emerald-400">
                              {item.stamps !== undefined ? `${item.stamps} 🏷️` : "→"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-zinc-800 text-center space-y-2">
                      <p className="text-xs text-zinc-500">
                        {ar
                          ? "لا توجد بطاقات سابقة. يمكنك تجربة رقم جوال تجريبي:"
                          : "No recent passes yet. Try entering a customer phone:"}
                      </p>
                      <button
                        type="button"
                        className="text-xs font-mono text-emerald-400 hover:underline bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20"
                        onClick={() => {
                          setManualInput("+966501234567");
                        }}
                      >
                        +966501234567
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// =========================================================================
// 3. LIVE EMOJI PROGRESS BAR & TACTILE STAMP BADGES
// =========================================================================
function LiveEmojiProgressBar({
  stamps,
  target,
  stampIcon,
  ar,
}: {
  stamps: number;
  target: number;
  stampIcon: string;
  ar: boolean;
}) {
  const emoji = iconToEmoji(stampIcon);
  const isUnlocked = stamps >= target;

  const slots = Array.from({ length: target }, (_, i) => {
    const isEarned = i < stamps;
    const isRewardSlot = i === target - 1;

    return {
      index: i + 1,
      isEarned,
      isRewardSlot,
      displayEmoji: isEarned ? emoji : isRewardSlot ? "🎁" : "⚪",
    };
  });

  return (
    <div className="space-y-3">
      {/* Visual Apple Wallet String Preview */}
      <div className="rounded-xl bg-zinc-950/80 border border-zinc-800/80 p-3 text-center">
        <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-mono mb-1.5 flex items-center justify-center gap-1.5">
          <span>{ar ? "شريط المحفظة المباشر" : "Live Wallet Bar"}</span>
          <span className="text-zinc-600">·</span>
          <span className="text-emerald-400 font-semibold font-mono">
            {stamps}/{target}
          </span>
        </div>
        <div className="text-2xl sm:text-3xl tracking-widest font-mono select-all py-1">
          {isUnlocked ? (
            <span className="text-amber-400 font-bold animate-pulse text-base sm:text-lg tracking-normal">
              🎁 {ar ? "المكافأة جاهزة للاستلام!" : "REWARD UNLOCKED!"}
            </span>
          ) : (
            slots.map((s) => s.displayEmoji).join(" ")
          )}
        </div>
      </div>

      {/* Tactile Stamp Badges Grid */}
      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 justify-center">
        {slots.map((slot) => {
          const isCurrentStamp = slot.index === stamps;
          return (
            <div
              key={slot.index}
              className={`relative flex flex-col items-center justify-center aspect-square rounded-xl border transition-all duration-300 ${
                slot.isEarned
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/10 scale-[1.02]"
                  : slot.isRewardSlot
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-zinc-950/40 border-zinc-800/80 text-zinc-600"
              } ${isCurrentStamp ? "ring-2 ring-emerald-400/60 ring-offset-1 ring-offset-zinc-950" : ""}`}
            >
              <span className="text-xl sm:text-2xl drop-shadow">{slot.displayEmoji}</span>
              <span className="text-[9px] font-mono mt-0.5 text-zinc-400">
                {slot.isRewardSlot ? (ar ? "المكافأة" : "Reward") : `#${slot.index}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CashierTerminal;
