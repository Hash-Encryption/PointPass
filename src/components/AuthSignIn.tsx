import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthSignIn({
  title,
  description,
  redirectPath,
  ar,
}: {
  title: string;
  description: string;
  redirectPath: string;
  ar: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

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
          setSubmitting(false);
          if (signInErr) {
            toast.error(
              ar
                ? "الحساب موجود بالفعل. يرجى تسجيل الدخول أو استعادة كلمة المرور."
                : "Account already registered. Please sign in or use 'Forgot Password'.",
            );
          }
        } else {
          setSubmitting(false);
          toast.error(error.message);
        }
      } else if (data.session) {
        setSubmitting(false);
        toast.success(ar ? "تم إنشاء الحساب وتسجيل الدخول!" : "Account created and signed in!");
      } else {
        setSubmitting(false);
        toast.success(
          ar
            ? "تم إنشاء الحساب! تحقق من بريدك الإلكتروني إذا تطلب الأمر لتأكيده."
            : "Account created! Check your email if confirmation is required.",
        );
      }
    }
  }

  async function sendMagicLink() {
    if (!email) {
      toast.error(ar ? "يرجى كتابة البريد الإلكتروني أولاً" : "Please enter your email first");
      return;
    }
    setSendingLink(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
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
        ? "تم إرسال رابط تسجيل الدخول إلى بريدك الإلكتروني."
        : "A sign-in link was sent to your email.",
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

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm space-y-5 p-6">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-center text-xs font-semibold">
          <button
            type="button"
            className={`rounded-md py-1.5 transition-colors ${
              mode === "signin" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setMode("signin")}
          >
            {ar ? "تسجيل الدخول" : "Sign In"}
          </button>
          <button
            type="button"
            className={`rounded-md py-1.5 transition-colors ${
              mode === "signup" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => setMode("signup")}
          >
            {ar ? "إنشاء حساب جديد" : "Create Account"}
          </button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="auth-email">{ar ? "البريد الإلكتروني" : "Email"}</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="auth-password">{ar ? "كلمة المرور" : "Password"}</Label>
            {mode === "signin" && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
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
            required
            minLength={6}
            dir="ltr"
          />
        </div>

        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : mode === "signin" ? (
            ar ? "دخول" : "Sign in"
          ) : (
            ar ? "إنشاء حساب" : "Sign up"
          )}
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>{ar ? "أو" : "or"}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          className="w-full"
          type="button"
          variant="outline"
          disabled={!email || sendingLink}
          onClick={sendMagicLink}
        >
          {sendingLink ? (
            <Loader2 className="size-4 animate-spin" />
          ) : ar ? (
            "إرسال رابط دخول بالبريد"
          ) : (
            "Email me a sign-in link"
          )}
        </Button>
      </form>
    </div>
  );
}
