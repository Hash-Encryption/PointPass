import { useState } from "react";
import { Loader2, Globe, Sparkles, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthSignIn({
  title,
  description: _description,
  redirectPath,
  ar: propAr,
  allowSignUp = true,
  defaultMode = "signup",
}: {
  title?: string;
  description?: string;
  redirectPath: string;
  ar?: boolean;
  allowSignUp?: boolean;
  defaultMode?: "signin" | "signup";
}) {
  const { locale, toggle } = useLocale();
  const ar = propAr !== undefined ? propAr : locale === "ar";

  // Default to signup for onboarding or when specified
  const initialMode = redirectPath.includes("onboarding") ? "signup" : defaultMode;
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  // Dynamic titles and subtitles per specifications
  const activeTitle =
    mode === "signup"
      ? ar
        ? "ابدأ برنامج ولائك مجاناً"
        : "Start your loyalty program free"
      : title || (ar ? "تسجيل الدخول إلى PointPass" : "Welcome back");

  const activeSubtitle =
    mode === "signup"
      ? ar
        ? "بدون بطاقة ائتمانية. بطاقتك جاهزة في دقيقتين."
        : "No credit card needed. Live in Apple Wallet in 2 minutes."
      : ar
        ? "أدخل بيانات حسابك للوصول للوحة التحكم"
        : "Enter your credentials to access your dashboard";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setPassword("");
        toast.error(error.message);
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${redirectPath}`,
        },
      });
      setSubmitting(false);
      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            toast.error(
              ar
                ? "الحساب مسجل مسبقاً. يرجى تسجيل الدخول أو استخدام نسيت كلمة المرور."
                : "Account already registered. Please sign in or use forgot password.",
            );
          }
        } else {
          toast.error(error.message);
        }
      } else if (data.session) {
        toast.success(ar ? "تم إنشاء الحساب بنجاح!" : "Account created successfully!");
      } else {
        toast.success(
          ar
            ? "تم إنشاء الحساب! تحقق من بريدك الإلكتروني لتأكيد التسجيل."
            : "Account created! Check your email to confirm registration.",
        );
      }
    }
  }

  async function sendMagicLink() {
    if (!email) {
      toast.error(ar ? "يرجى إدخال البريد الإلكتروني أولاً" : "Please enter your email first");
      return;
    }
    setSendingLink(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: allowSignUp,
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
      },
    });
    setSendingLink(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      ar
        ? "تم إرسال رابط تسجيل الدخول السريع إلى بريدك."
        : "A instant sign-in link was sent to your email.",
    );
  }

  async function resetPassword() {
    if (!email) {
      toast.error(ar ? "يرجى كتابة البريد الإلكتروني أولاً" : "Please enter your email first");
      return;
    }
    setSendingLink(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${redirectPath}`,
    });
    setSendingLink(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        ar
          ? "تم إرسال رابط إعادة ضبط كلمة المرور إلى بريدك."
          : "Password reset link sent to your email.",
      );
    }
  }

  const ArrowIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <div
      className="relative min-h-screen grid place-items-center bg-[#09090b] px-4 py-12 text-zinc-100 overflow-hidden"
      dir={ar ? "rtl" : "ltr"}
    >
      {/* Background Subtle Emerald Glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_65%)]"
        aria-hidden="true"
      />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header & Language Pill */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400">
              <Sparkles className="size-4" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-white block leading-none">
                PointPass<span className="text-emerald-400">.</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wide">
                {ar ? "منصة ولاء المحافظ الرقمية" : "Apple Wallet Loyalty"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <Globe className="size-3.5 text-zinc-500" />
            <span>{ar ? "English" : "العربية"}</span>
          </button>
        </div>

        {/* Dark Modern Card Container */}
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900/90 border border-zinc-800 shadow-2xl rounded-3xl p-6 sm:p-8 w-full text-zinc-100 space-y-6 backdrop-blur-md"
        >
          {/* Header */}
          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              {activeTitle}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">{activeSubtitle}</p>
          </div>

          {/* Segmented Mode Switch */}
          {allowSignUp && (
            <div className="bg-zinc-800/80 p-1 rounded-2xl grid grid-cols-2 text-center text-xs font-semibold border border-zinc-750">
              <button
                type="button"
                className={`rounded-xl py-2 transition-all ${
                  mode === "signup"
                    ? "bg-zinc-700 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                onClick={() => setMode("signup")}
              >
                {ar ? "إنشاء حساب جديد" : "Create Account"}
              </button>
              <button
                type="button"
                className={`rounded-xl py-2 transition-all ${
                  mode === "signin"
                    ? "bg-zinc-700 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                onClick={() => setMode("signin")}
              >
                {ar ? "تسجيل الدخول" : "Sign In"}
              </button>
            </div>
          )}

          {/* Input Fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="auth-email" className="text-xs font-semibold text-zinc-300">
                {ar ? "البريد الإلكتروني" : "Work Email"}
              </Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="merchant@example.com"
                required
                dir="ltr"
                className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="auth-password" className="text-xs font-semibold text-zinc-300">
                  {ar ? "كلمة المرور" : "Password"}
                </Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    onClick={resetPassword}
                  >
                    {ar ? "نسيت كلمة المرور؟" : "Forgot?"}
                  </button>
                )}
              </div>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                dir="ltr"
                className="bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm h-11 transition-colors"
              />
            </div>
          </div>

          {/* Primary Action Button */}
          <Button
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin text-zinc-950" />
            ) : mode === "signup" ? (
              <>
                <span>
                  {ar ? "إنشاء الحساب ومتابعة الإعداد ⚡" : "Create Account & Continue ⚡"}
                </span>
                <ArrowIcon className="size-4" />
              </>
            ) : (
              <>
                <span>{ar ? "تسجيل الدخول ←" : "Sign In ←"}</span>
                <ArrowIcon className="size-4" />
              </>
            )}
          </Button>

          {/* Separator */}
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            <span>{ar ? "أو الدخول برابط سريالي" : "or continue with magic link"}</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          {/* Magic Link */}
          <button
            type="button"
            disabled={!email || sendingLink}
            onClick={sendMagicLink}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sendingLink ? (
              <Loader2 className="size-3.5 animate-spin text-emerald-400" />
            ) : ar ? (
              "إرسال رابط دخول فوري للبريد"
            ) : (
              "Email me a sign-in link"
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-zinc-500">
          {ar
            ? "متوافق مع Apple Wallet و Google Wallet في المملكة العربية السعودية"
            : "Fully compatible with Apple Wallet & Google Wallet"}
        </p>
      </div>
    </div>
  );
}
