import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { canManageBusiness, canManageBranch, type OperationsAccess } from "@/lib/access";
import { canAddLocation, getLocationEntitlement, CONFIGURED_MULTI_LIMIT } from "@/lib/entitlements";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import {
  Building2,
  Users,
  Smartphone,
  Plus,
  KeyRound,
  Copy,
  ExternalLink,
  ShieldCheck,
  Check,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Settings,
  Edit2,
  Store,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export type Branch = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  address_ar: string | null;
  address_en: string | null;
  status: "active" | "inactive";
};

export type Staff = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  email: string | null;
  role: "owner" | "admin" | "manager" | "staff" | "cashier";
  status: "active" | "inactive";
  auth_user_id: string | null;
};

export type Assignment = { staff_id: string; branch_id: string };

export type CashierSession = {
  id: string;
  staff_id: string | null;
  branch_id: string | null;
  device_name: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export function OperationsPanel({ businessId, ar }: { businessId: string; ar: boolean }) {
  const [activeTab, setActiveTab] = useState<"locations" | "team" | "devices">("locations");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [locationDetailTab, setLocationDetailTab] = useState<
    "overview" | "team" | "analytics" | "devices"
  >("overview");

  // Modals & Drawers
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showAddTeamMember, setShowAddTeamMember] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [cashierAccessStaff, setCashierAccessStaff] = useState<Staff | null>(null);
  const [changePinStaff, setChangePinStaff] = useState<Staff | null>(null);
  const [newPinValue, setNewPinValue] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showLegacyPinSection, setShowLegacyPinSection] = useState(false);
  const [legacyPinValue, setLegacyPinValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Forms
  const [branchForm, setBranchForm] = useState({
    nameAr: "",
    nameEn: "",
    addressAr: "",
    addressEn: "",
    status: "active" as Branch["status"],
  });

  const [staffForm, setStaffForm] = useState({
    nameAr: "",
    nameEn: "",
    email: "",
    role: "cashier" as Staff["role"],
    status: "active" as Staff["status"],
    pin: "",
    branchIds: [] as string[],
  });

  // Queries
  const accessQuery = useQuery({
    queryKey: ["operations-access", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_access", { _business_id: businessId })
        .single();
      if (error) throw error;
      return data as OperationsAccess;
    },
  });

  const operationsQuery = useQuery({
    queryKey: ["business-operations", businessId],
    enabled: accessQuery.isSuccess,
    queryFn: async () => {
      const [branches, staff, assignments, sessions, business] = await Promise.all([
        supabase
          .from("branches")
          .select("id,code,name_ar,name_en,address_ar,address_en,status")
          .eq("business_id", businessId)
          .order("created_at"),
        supabase
          .from("staff_members")
          .select("id,code,name_ar,name_en,email,role,status,auth_user_id")
          .eq("business_id", businessId)
          .order("created_at"),
        supabase
          .from("staff_branch_assignments")
          .select("staff_id,branch_id")
          .eq("business_id", businessId),
        supabase
          .from("cashier_sessions")
          .select("id,staff_id,branch_id,device_name,created_at,last_used_at,expires_at,revoked_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("businesses")
          .select("slug,plan,cashier_pin")
          .eq("id", businessId)
          .maybeSingle(),
      ]);

      const error =
        branches.error ?? staff.error ?? assignments.error ?? sessions.error ?? business.error;
      if (error) throw error;

      return {
        branches: (branches.data ?? []) as Branch[],
        staff: (staff.data ?? []) as Staff[],
        assignments: (assignments.data ?? []) as Assignment[],
        sessions: (sessions.data ?? []) as CashierSession[],
        slug: (business.data?.slug as string) ?? "",
        plan: (business.data?.plan as string | null) ?? "starter",
        cashierPin: (business.data?.cashier_pin as string | null) ?? "",
      };
    },
  });

  // Safe PIN configured query
  const pinStatusQuery = useQuery({
    queryKey: ["staff-pin-status", businessId],
    enabled: accessQuery.isSuccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("operations_staff_pin_status", {
        _business_id: businessId,
      });
      if (error) {
        // Safe fallback if migration is pending in the environment
        return [] as Array<{ staff_id: string; pin_configured: boolean }>;
      }
      return (data ?? []) as Array<{ staff_id: string; pin_configured: boolean }>;
    },
  });

  const access = accessQuery.data;
  const canManageBiz = canManageBusiness(access);
  const userCanManageBranch = (branchId: string) => canManageBranch(branchId, access);

  const rawData = operationsQuery.data ?? {
    branches: [],
    staff: [],
    assignments: [],
    sessions: [],
    slug: "",
    plan: "starter",
    cashierPin: "",
  };

  const pinStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    pinStatusQuery.data?.forEach((p) => map.set(p.staff_id, p.pin_configured));
    return map;
  }, [pinStatusQuery.data]);

  // Scoped Data by Authorization
  const visibleBranches = useMemo(() => {
    if (canManageBiz) return rawData.branches;
    const allowed = new Set(access?.managed_branch_ids ?? []);
    return rawData.branches.filter((b) => allowed.has(b.id));
  }, [canManageBiz, rawData.branches, access?.managed_branch_ids]);

  const visibleAssignments = useMemo(() => {
    const branchIds = new Set(visibleBranches.map((b) => b.id));
    return rawData.assignments.filter((a) => branchIds.has(a.branch_id));
  }, [visibleBranches, rawData.assignments]);

  const visibleStaff = useMemo(() => {
    if (canManageBiz) return rawData.staff;
    const assignedStaffIds = new Set(visibleAssignments.map((a) => a.staff_id));
    return rawData.staff.filter((s) => assignedStaffIds.has(s.id));
  }, [canManageBiz, rawData.staff, visibleAssignments]);

  const visibleSessions = useMemo(() => {
    if (canManageBiz) return rawData.sessions;
    const branchIds = new Set(visibleBranches.map((b) => b.id));
    return rawData.sessions.filter((s) => s.branch_id && branchIds.has(s.branch_id));
  }, [canManageBiz, rawData.sessions, visibleBranches]);

  const branchById = useMemo(
    () => new Map(rawData.branches.map((b) => [b.id, b])),
    [rawData.branches],
  );
  const staffById = useMemo(() => new Map(rawData.staff.map((s) => [s.id, s])), [rawData.staff]);

  const entitlement = getLocationEntitlement(rawData.plan);
  const activeBranchesCount = rawData.branches.filter((b) => b.status === "active").length;
  const atLocationLimit = !canAddLocation(activeBranchesCount, rawData.plan);

  const selectedBranch = selectedBranchId ? branchById.get(selectedBranchId) : null;

  // Selected Branch Team & Sessions
  const selectedBranchAssignments = useMemo(
    () =>
      selectedBranchId ? rawData.assignments.filter((a) => a.branch_id === selectedBranchId) : [],
    [selectedBranchId, rawData.assignments],
  );

  const selectedBranchStaff = useMemo(() => {
    const staffIds = new Set(selectedBranchAssignments.map((a) => a.staff_id));
    return rawData.staff.filter((s) => staffIds.has(s.id));
  }, [selectedBranchAssignments, rawData.staff]);

  const selectedBranchSessions = useMemo(
    () =>
      selectedBranchId ? rawData.sessions.filter((s) => s.branch_id === selectedBranchId) : [],
    [selectedBranchId, rawData.sessions],
  );

  // Helper metrics per branch
  function getBranchMetrics(branchId: string) {
    const bAssignments = rawData.assignments.filter((a) => a.branch_id === branchId);
    let managers = 0;
    let cashiers = 0;
    for (const a of bAssignments) {
      const member = staffById.get(a.staff_id);
      if (member && member.status === "active") {
        if (member.role === "manager") managers += 1;
        else if (member.role === "cashier") cashiers += 1;
      }
    }
    const devices = rawData.sessions.filter(
      (s) => s.branch_id === branchId && !s.revoked_at && new Date(s.expires_at) > new Date(),
    ).length;
    return { managers, cashiers, devices };
  }

  // Save Branch Handler
  async function handleSaveBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBranch && !canManageBiz) {
      toast.error(
        ar
          ? "إنشاء الفروع مقتصر على مالك المنشأة"
          : "Branch creation is restricted to business owners",
      );
      return;
    }
    if (!editingBranch && atLocationLimit) {
      toast.error(
        ar
          ? `تم بلوغ الحد الأقصى للفروع (${entitlement.maxLocations} فرع)`
          : `Location limit reached (${entitlement.maxLocations} location(s))`,
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("operations_upsert_branch", {
      _business_id: businessId,
      _branch_id: editingBranch?.id || null,
      _code: editingBranch?.code || null,
      _name_ar: branchForm.nameAr.trim(),
      _name_en: branchForm.nameEn.trim(),
      _address_ar: branchForm.addressAr.trim() || null,
      _address_en: branchForm.addressEn.trim() || null,
      _status: branchForm.status,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      editingBranch
        ? ar
          ? "تم تحديث الفرع بنجاح"
          : "Location updated successfully"
        : ar
          ? "تمت إضافة الفرع بنجاح"
          : "Location added successfully",
    );
    setShowAddLocation(false);
    setEditingBranch(null);
    setBranchForm({
      nameAr: "",
      nameEn: "",
      addressAr: "",
      addressEn: "",
      status: "active",
    });
    await operationsQuery.refetch();
  }

  // Save Team Member Handler
  async function handleSaveTeamMember(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageBiz) {
      toast.error(
        ar
          ? "إدارة الفريق مقتصرة على مالك المنشأة"
          : "Team management is restricted to business owners",
      );
      return;
    }

    if (
      staffForm.role === "cashier" &&
      !editingStaff &&
      (!staffForm.pin || !/^\d{4}$/.test(staffForm.pin))
    ) {
      toast.error(
        ar ? "يجب تعيين رمز PIN مكون من ٤ أرقام للكاشير" : "Cashier requires a 4-digit PIN",
      );
      return;
    }

    if (staffForm.pin && !/^\d{4}$/.test(staffForm.pin)) {
      toast.error(ar ? "يجب أن يتكون PIN من ٤ أرقام" : "PIN must contain 4 digits");
      return;
    }

    if (staffForm.branchIds.length === 0) {
      toast.error(
        ar
          ? "يرجى تعيين فرع واحد على الأقل للعضو"
          : "Please assign at least one location to this team member",
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("operations_save_team_member", {
      _business_id: businessId,
      _staff_id: editingStaff?.id || null,
      _code: editingStaff?.code || null,
      _name_ar: staffForm.nameAr.trim(),
      _name_en: staffForm.nameEn.trim(),
      _email: staffForm.email.trim() || null,
      _role: staffForm.role,
      _status: staffForm.status,
      _pin: staffForm.pin || null,
      _branch_ids: staffForm.branchIds,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      editingStaff
        ? ar
          ? "تم تحديث بيانات العضو بنجاح"
          : "Team member updated successfully"
        : ar
          ? "تمت إضافة العضو بنجاح"
          : "Team member added successfully",
    );
    setShowAddTeamMember(false);
    setEditingStaff(null);
    setStaffForm({
      nameAr: "",
      nameEn: "",
      email: "",
      role: "cashier",
      status: "active",
      pin: "",
      branchIds: [],
    });
    await operationsQuery.refetch();
    await pinStatusQuery.refetch();
  }

  // Update PIN only for a Cashier
  async function handleUpdateCashierPin(e: React.FormEvent) {
    e.preventDefault();
    if (!changePinStaff) return;
    if (!/^\d{4}$/.test(newPinValue)) {
      toast.error(ar ? "يجب أن يتكون PIN من ٤ أرقام" : "PIN must be 4 digits");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("operations_upsert_staff", {
      _business_id: businessId,
      _staff_id: changePinStaff.id,
      _code: changePinStaff.code,
      _name_ar: changePinStaff.name_ar,
      _name_en: changePinStaff.name_en,
      _email: changePinStaff.email,
      _role: changePinStaff.role,
      _status: changePinStaff.status,
      _pin: newPinValue,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(ar ? "تم تحديث رمز PIN بنجاح" : "Cashier PIN updated successfully");
    setChangePinStaff(null);
    setNewPinValue("");
    await operationsQuery.refetch();
    await pinStatusQuery.refetch();
  }

  // Save Legacy Global Cashier PIN
  async function handleSaveLegacyPin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(legacyPinValue)) {
      toast.error(ar ? "يجب أن يتكون رمز الكاشير من ٤ أرقام" : "Cashier PIN must be 4 digits");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({ cashier_pin: legacyPinValue })
      .eq("id", businessId);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(ar ? "تم تحديث رمز الكاشير العام" : "Legacy Cashier PIN updated");
    setShowLegacyPinSection(false);
    await operationsQuery.refetch();
  }

  // Revoke device session
  async function handleRevokeSession(sessionId: string) {
    setSaving(true);
    const { error } = await supabase.rpc("operations_revoke_session", {
      _business_id: businessId,
      _session_id: sessionId,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(ar ? "تم إلغاء صلاحية الجهاز" : "Device access revoked");
    await operationsQuery.refetch();
  }

  if (accessQuery.isLoading || operationsQuery.isLoading) {
    return (
      <div className="panel p-8 text-center text-sm text-muted-foreground animate-pulse">
        {ar ? "جارٍ تحميل الفروع والفريق…" : "Loading locations and team…"}
      </div>
    );
  }

  if (accessQuery.isError || operationsQuery.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive" role="alert">
        {accessQuery.error?.message ?? operationsQuery.error?.message}
      </div>
    );
  }

  // If a location is opened, render LocationDetail surface
  if (selectedBranch) {
    return (
      <div className="space-y-6">
        {/* Navigation / Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedBranchId(null)}
              className="gap-1.5"
            >
              {ar ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
              {ar ? "العودة إلى الفروع" : "Back to Locations"}
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">
                  {ar ? selectedBranch.name_ar : selectedBranch.name_en}
                </h2>
                {selectedBranch.code === "main" && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-primary/10 text-primary border-primary/20"
                  >
                    <Store className="size-3" />
                    {ar ? "الفرع الرئيسي" : "Main Location"}
                  </Badge>
                )}
                <Badge variant={selectedBranch.status === "active" ? "default" : "outline"}>
                  {selectedBranch.status === "active"
                    ? ar
                      ? "نشط"
                      : "Active"
                    : ar
                      ? "غير نشط"
                      : "Inactive"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ar
                  ? selectedBranch.address_ar || "لا يوجد عنوان مسجل"
                  : selectedBranch.address_en || "No registered address"}
              </p>
            </div>
          </div>

          {userCanManageBranch(selectedBranch.id) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditingBranch(selectedBranch);
                setBranchForm({
                  nameAr: selectedBranch.name_ar,
                  nameEn: selectedBranch.name_en,
                  addressAr: selectedBranch.address_ar ?? "",
                  addressEn: selectedBranch.address_en ?? "",
                  status: selectedBranch.status,
                });
                setShowAddLocation(true);
              }}
            >
              <Edit2 className="size-3.5" />
              {ar ? "تعديل الفرع" : "Edit Location"}
            </Button>
          )}
        </div>

        {/* Location Subtabs */}
        <div className="flex border-b text-sm font-medium gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setLocationDetailTab("overview")}
            className={`px-4 py-2 border-b-2 transition-colors cursor-pointer ${
              locationDetailTab === "overview"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {ar ? "نظرة عامة" : "Overview"}
          </button>
          <button
            type="button"
            onClick={() => setLocationDetailTab("team")}
            className={`px-4 py-2 border-b-2 transition-colors cursor-pointer ${
              locationDetailTab === "team"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {ar ? "فريق الفرع" : "Location Team"} ({selectedBranchStaff.length})
          </button>
          <button
            type="button"
            onClick={() => setLocationDetailTab("analytics")}
            className={`px-4 py-2 border-b-2 transition-colors cursor-pointer ${
              locationDetailTab === "analytics"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {ar ? "تحليلات الفرع" : "Location Analytics"}
          </button>
          <button
            type="button"
            onClick={() => setLocationDetailTab("devices")}
            className={`px-4 py-2 border-b-2 transition-colors cursor-pointer ${
              locationDetailTab === "devices"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {ar ? "أجهزة الكاشير" : "Cashier Devices"} ({selectedBranchSessions.length})
          </button>
        </div>

        {/* Tab 1: Location Overview */}
        {locationDetailTab === "overview" && (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="panel p-5 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Users className="size-4 text-primary" />
                  {ar ? "المدراء" : "Managers"}
                </span>
                <p className="text-2xl font-bold">
                  {
                    selectedBranchStaff.filter((s) => s.role === "manager" && s.status === "active")
                      .length
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {ar ? "مدراء يشرفون على هذا الفرع" : "Managers assigned to this location"}
                </p>
              </div>

              <div className="panel p-5 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <KeyRound className="size-4 text-primary" />
                  {ar ? "الكاشير" : "Cashiers"}
                </span>
                <p className="text-2xl font-bold">
                  {
                    selectedBranchStaff.filter((s) => s.role === "cashier" && s.status === "active")
                      .length
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {ar ? "موظفو كاشير يعملون في الفرع" : "Cashiers working at this location"}
                </p>
              </div>

              <div className="panel p-5 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Smartphone className="size-4 text-primary" />
                  {ar ? "الأجهزة النشطة" : "Active Devices"}
                </span>
                <p className="text-2xl font-bold">
                  {
                    selectedBranchSessions.filter(
                      (s) => !s.revoked_at && new Date(s.expires_at) > new Date(),
                    ).length
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {ar ? "أجهزة كاشير متصلة حالياً" : "Currently connected cashier devices"}
                </p>
              </div>
            </div>

            {/* Information Card */}
            <div className="panel p-6 space-y-4">
              <h3 className="font-semibold text-base">
                {ar ? "بيانات الفرع" : "Location Information"}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">
                    {ar ? "الاسم بالعربية" : "Arabic Name"}
                  </span>
                  <span className="font-medium">{selectedBranch.name_ar}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    {ar ? "الاسم بالإنجليزية" : "English Name"}
                  </span>
                  <span className="font-medium">{selectedBranch.name_en}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    {ar ? "العنوان بالعربية" : "Arabic Address"}
                  </span>
                  <span>{selectedBranch.address_ar || "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    {ar ? "العنوان بالإنجليزية" : "English Address"}
                  </span>
                  <span>{selectedBranch.address_en || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Location Team */}
        {locationDetailTab === "team" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  {ar ? "أعضاء الفريق في هذا الفرع" : "Team Members at this Location"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? "المدراء والكاشير المكلفون بالعمل في هذا الفرع"
                    : "Managers and cashiers assigned to this location"}
                </p>
              </div>
              {canManageBiz && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingStaff(null);
                    setStaffForm({
                      nameAr: "",
                      nameEn: "",
                      email: "",
                      role: "cashier",
                      status: "active",
                      pin: "",
                      branchIds: [selectedBranch.id],
                    });
                    setShowAddTeamMember(true);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="size-4" />
                  {ar ? "إضافة عضو للفرع" : "Add Team Member"}
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {selectedBranchStaff.length > 0 ? (
                selectedBranchStaff.map((member) => (
                  <TeamMemberCard
                    key={member.id}
                    member={member}
                    ar={ar}
                    canManageBiz={canManageBiz}
                    pinConfigured={pinStatusMap.get(member.id)}
                    branches={rawData.branches}
                    assignments={rawData.assignments}
                    onOpenCashierAccess={() => setCashierAccessStaff(member)}
                    onOpenChangePin={() => {
                      setChangePinStaff(member);
                      setNewPinValue("");
                    }}
                    onEdit={() => {
                      const memberBranches = rawData.assignments
                        .filter((a) => a.staff_id === member.id)
                        .map((a) => a.branch_id);
                      setEditingStaff(member);
                      setStaffForm({
                        nameAr: member.name_ar,
                        nameEn: member.name_en,
                        email: member.email ?? "",
                        role: member.role,
                        status: member.status,
                        pin: "",
                        branchIds: memberBranches,
                      });
                      setShowAddTeamMember(true);
                    }}
                  />
                ))
              ) : (
                <div className="col-span-full panel p-8 text-center text-muted-foreground">
                  <Users className="size-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">
                    {ar
                      ? "لا يوجد أعضاء فريق معينين لهذا الفرع حالياً."
                      : "No team members assigned to this location yet."}
                  </p>
                  <p className="text-xs mt-1">
                    {ar
                      ? "أضف مديراً أو كاشيراً لمساعدتك في إدارة الفرع."
                      : "Add a Manager or Cashier to help run this location."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Location Analytics */}
        {locationDetailTab === "analytics" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Info className="size-4 text-primary shrink-0" />
              <span>
                {ar
                  ? `يتم عرض التحليلات الخاصة بفرع: ${selectedBranch.name_ar} فقط وبشكل موثّق من الخادم.`
                  : `Analytics filtered strictly to ${selectedBranch.name_en} and aggregated on the server.`}
              </span>
            </div>
            <AnalyticsPanel businessId={businessId} ar={ar} lockedBranchId={selectedBranch.id} />
          </div>
        )}

        {/* Tab 4: Location Devices */}
        {locationDetailTab === "devices" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">
                {ar ? "أجهزة الكاشير في هذا الفرع" : "Cashier Devices in this Location"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "أجهزة ونقاط البيع التي تم تسجيل الدخول منها في هذا الفرع"
                  : "Devices and registers signed in at this branch"}
              </p>
            </div>
            <DevicesList
              sessions={selectedBranchSessions}
              staffById={staffById}
              branchById={branchById}
              ar={ar}
              canManageBiz={canManageBiz}
              userCanManageBranch={userCanManageBranch}
              saving={saving}
              onRevoke={handleRevokeSession}
            />
          </div>
        )}
      </div>
    );
  }

  // Main Locations & Team View
  return (
    <div className="space-y-6">
      {/* Top Banner & Context */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="size-5 text-primary" />
            {ar ? "الفروع والفريق" : "Locations & Team"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "إدارة الفروع، أعضاء الفريق، صلاحيات الكاشير والأجهزة"
              : "Manage locations, team members, cashier access and devices"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={canManageBiz ? "default" : "secondary"}>
            {canManageBiz
              ? ar
                ? "مالك المنشأة"
                : "Business Owner"
              : ar
                ? "مدير فرع"
                : "Branch Manager"}
          </Badge>
          {!canManageBiz && (
            <span className="text-xs text-muted-foreground">
              {visibleBranches.length}{" "}
              {ar
                ? visibleBranches.length === 1
                  ? "فرع مصرح"
                  : "فروع مصرحة"
                : "authorized location(s)"}
            </span>
          )}
        </div>
      </div>

      {/* Main Tabs: Locations | Team | Devices */}
      <div className="flex border-b text-sm font-medium gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("locations")}
          className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "locations"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="size-4" />
          {ar ? "الفروع" : "Locations"} ({visibleBranches.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("team")}
          className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "team"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-4" />
          {ar ? "الفريق" : "Team"} ({visibleStaff.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("devices")}
          className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "devices"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Smartphone className="size-4" />
          {ar ? "الأجهزة" : "Devices"} ({visibleSessions.length})
        </button>
      </div>

      {/* ======================= TAB: LOCATIONS ======================= */}
      {activeTab === "locations" && (
        <div className="space-y-6">
          {/* Header Actions & Entitlement Status */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base">
                {ar ? "فروع المنشأة" : "Business Locations"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {entitlement.multiLocation
                  ? ar
                    ? `${activeBranchesCount} من أصل ${entitlement.maxLocations} فروع نشطة في باقتك الحالية`
                    : `${activeBranchesCount} of ${entitlement.maxLocations} active locations used on current plan`
                  : ar
                    ? "باقة الفرع الواحد · فرع رئيسي متاح"
                    : "Single-Location plan · Main location active"}
              </p>
            </div>

            {canManageBiz && (
              <div className="flex items-center gap-2">
                {entitlement.multiLocation ? (
                  <Button
                    size="sm"
                    disabled={atLocationLimit}
                    onClick={() => {
                      setEditingBranch(null);
                      setBranchForm({
                        nameAr: "",
                        nameEn: "",
                        addressAr: "",
                        addressEn: "",
                        status: "active",
                      });
                      setShowAddLocation(true);
                    }}
                    className="gap-1.5"
                  >
                    <Plus className="size-4" />
                    {ar ? "إضافة فرع جديد" : "Add Location"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUpgradeModal(true)}
                    className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                  >
                    <Sparkles className="size-3.5" />
                    {ar ? "إضافة فرع آخر" : "Add another location"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Locations Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBranches.map((branch) => {
              const metrics = getBranchMetrics(branch.id);
              const canEdit = userCanManageBranch(branch.id);

              return (
                <div
                  key={branch.id}
                  className="panel p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base">
                            {ar ? branch.name_ar : branch.name_en}
                          </h4>
                        </div>
                        {branch.code === "main" && (
                          <Badge
                            variant="secondary"
                            className="mt-1 text-xs gap-1 bg-primary/10 text-primary border-primary/20"
                          >
                            <Store className="size-3" />
                            {ar ? "الفرع الرئيسي" : "Main Location"}
                          </Badge>
                        )}
                      </div>
                      <Badge variant={branch.status === "active" ? "default" : "outline"}>
                        {branch.status === "active"
                          ? ar
                            ? "نشط"
                            : "Active"
                          : ar
                            ? "غير نشط"
                            : "Inactive"}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {ar
                        ? branch.address_ar || "لم يُحدد عنوان بعد"
                        : branch.address_en || "No address specified"}
                    </p>
                  </div>

                  {/* Summary Counts */}
                  <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
                    <div>
                      <span className="font-bold block text-sm">{metrics.managers}</span>
                      <span className="text-muted-foreground">{ar ? "مدراء" : "Managers"}</span>
                    </div>
                    <div>
                      <span className="font-bold block text-sm">{metrics.cashiers}</span>
                      <span className="text-muted-foreground">{ar ? "كاشير" : "Cashiers"}</span>
                    </div>
                    <div>
                      <span className="font-bold block text-sm">{metrics.devices}</span>
                      <span className="text-muted-foreground">{ar ? "أجهزة" : "Devices"}</span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full text-xs font-semibold"
                      onClick={() => setSelectedBranchId(branch.id)}
                    >
                      {ar ? "عرض تفاصيل الفرع" : "Open Location"}
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={ar ? "تعديل الفرع" : "Edit branch"}
                        onClick={() => {
                          setEditingBranch(branch);
                          setBranchForm({
                            nameAr: branch.name_ar,
                            nameEn: branch.name_en,
                            addressAr: branch.address_ar ?? "",
                            addressEn: branch.address_en ?? "",
                            status: branch.status,
                          });
                          setShowAddLocation(true);
                        }}
                      >
                        <Edit2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Single-Location Helper Note */}
          {!entitlement.multiLocation && (
            <div className="rounded-lg border border-muted bg-muted/20 p-4 text-sm flex items-start gap-3">
              <Info className="size-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {ar
                    ? "منشأتك تعمل حالياً بنظام الفرع الواحد (الفرع الرئيسي)."
                    : "Your business currently operates on a Single-Location setup (Main Location)."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? "عند التوسع وافتتاح فروع إضافية، تتيح لك باقة الفروع المتعددة ربط حتى ١٠ فروع مع تقارير مخصصة لكل فرع."
                    : "When expanding to new locations, the Multi-Location plan lets you manage up to 10 branches with isolated permissions."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: TEAM ======================= */}
      {activeTab === "team" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base">{ar ? "فريق العمل" : "Team Members"}</h3>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "إدارة مدراء الفروع وموظفي الكاشير وصلاحيات الوصول"
                  : "Manage location managers, cashiers and access credentials"}
              </p>
            </div>

            {canManageBiz && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingStaff(null);
                  setStaffForm({
                    nameAr: "",
                    nameEn: "",
                    email: "",
                    role: "cashier",
                    status: "active",
                    pin: "",
                    branchIds:
                      visibleBranches.length > 0 && visibleBranches[0]
                        ? [visibleBranches[0].id]
                        : [],
                  });
                  setShowAddTeamMember(true);
                }}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                {ar ? "إضافة عضو للفريق" : "Add Team Member"}
              </Button>
            )}
          </div>

          {/* Team Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleStaff.length > 0 ? (
              visibleStaff.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  ar={ar}
                  canManageBiz={canManageBiz}
                  pinConfigured={pinStatusMap.get(member.id)}
                  branches={rawData.branches}
                  assignments={rawData.assignments}
                  onOpenCashierAccess={() => setCashierAccessStaff(member)}
                  onOpenChangePin={() => {
                    setChangePinStaff(member);
                    setNewPinValue("");
                  }}
                  onEdit={() => {
                    const memberBranches = rawData.assignments
                      .filter((a) => a.staff_id === member.id)
                      .map((a) => a.branch_id);
                    setEditingStaff(member);
                    setStaffForm({
                      nameAr: member.name_ar,
                      nameEn: member.name_en,
                      email: member.email ?? "",
                      role: member.role,
                      status: member.status,
                      pin: "",
                      branchIds: memberBranches,
                    });
                    setShowAddTeamMember(true);
                  }}
                />
              ))
            ) : (
              <div className="col-span-full panel p-8 text-center text-muted-foreground">
                <Users className="size-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium text-sm">
                  {ar ? "لا يوجد أعضاء في الفريق بعد." : "No team members yet."}
                </p>
                <p className="text-xs mt-1">
                  {ar
                    ? "أضف مديراً أو كاشيراً لمساعدتك في إدارة الفروع."
                    : "Add a Manager or Cashier to help run this location."}
                </p>
              </div>
            )}
          </div>

          {/* Legacy Cashier Access (Global PIN) Collapsible Card for Owners */}
          {canManageBiz && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <button
                type="button"
                className="w-full flex items-center justify-between text-start text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => setShowLegacyPinSection(!showLegacyPinSection)}
              >
                <span className="flex items-center gap-1.5">
                  <Settings className="size-3.5" />
                  {ar
                    ? "إعدادات متقدمة: رمز الكاشير العام (القديم)"
                    : "Advanced: Legacy Cashier Access (Global PIN)"}
                </span>
                {showLegacyPinSection ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {showLegacyPinSection && (
                <form onSubmit={handleSaveLegacyPin} className="pt-2 border-t space-y-3 text-xs">
                  <p className="text-muted-foreground">
                    {ar
                      ? "يُستخدم هذا الرمز العام للمنشأة للتوافق مع أجهزة الكاشير القديمة التي لم يتم تخصيص رمز مستقل لكل موظف فيها. الأفضل أمنياً استخدام رمز PIN لكل كاشير أعلاه."
                      : "This business-wide PIN is kept for compatibility with legacy cashier terminals. Recommended: use individual cashier PINs above for stronger tracking."}
                  </p>
                  <div className="flex items-center gap-2 max-w-xs">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={legacyPinValue}
                      onChange={(e) =>
                        setLegacyPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      dir="ltr"
                      className="text-center tracking-widest font-mono"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saving || legacyPinValue.length !== 4}
                    >
                      {ar ? "تحديث الرمز العام" : "Save Global PIN"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB: DEVICES ======================= */}
      {activeTab === "devices" && (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-base">{ar ? "أجهزة الكاشير" : "Cashier Devices"}</h3>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "جلسات الأجهزة ونقاط البيع المتصلة لحساب الكاشير في فروعك"
                : "Connected terminal sessions and devices used by cashiers"}
            </p>
          </div>

          <DevicesList
            sessions={visibleSessions}
            staffById={staffById}
            branchById={branchById}
            ar={ar}
            canManageBiz={canManageBiz}
            userCanManageBranch={userCanManageBranch}
            saving={saving}
            onRevoke={handleRevokeSession}
          />
        </div>
      )}

      {/* ======================= MODALS ======================= */}

      {/* 1. Add / Edit Location Dialog */}
      <Dialog open={showAddLocation} onOpenChange={setShowAddLocation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBranch
                ? ar
                  ? "تعديل بيانات الفرع"
                  : "Edit Location"
                : ar
                  ? "إضافة فرع جديد"
                  : "Add New Location"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveBranch} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{ar ? "الاسم بالعربية *" : "Arabic Name *"}</Label>
              <Input
                required
                value={branchForm.nameAr}
                onChange={(e) => setBranchForm({ ...branchForm, nameAr: e.target.value })}
                placeholder={ar ? "مثال: فرع التحلية" : "e.g. Tahlia Branch"}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{ar ? "الاسم بالإنجليزية *" : "English Name *"}</Label>
              <Input
                required
                value={branchForm.nameEn}
                onChange={(e) => setBranchForm({ ...branchForm, nameEn: e.target.value })}
                placeholder="e.g. Tahlia Branch"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{ar ? "العنوان بالعربية (اختياري)" : "Arabic Address (optional)"}</Label>
              <Input
                value={branchForm.addressAr}
                onChange={(e) => setBranchForm({ ...branchForm, addressAr: e.target.value })}
                placeholder={ar ? "الرياض، طريق التحلية" : "Riyadh, Tahlia Street"}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{ar ? "العنوان بالإنجليزية (اختياري)" : "English Address (optional)"}</Label>
              <Input
                value={branchForm.addressEn}
                onChange={(e) => setBranchForm({ ...branchForm, addressEn: e.target.value })}
                placeholder="Riyadh, Tahlia Street"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{ar ? "الحالة" : "Status"}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={branchForm.status}
                onChange={(e) =>
                  setBranchForm({ ...branchForm, status: e.target.value as Branch["status"] })
                }
              >
                <option value="active">{ar ? "نشط" : "Active"}</option>
                <option value="inactive">{ar ? "غير نشط" : "Inactive"}</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddLocation(false)}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={saving}>
                {editingBranch
                  ? ar
                    ? "حفظ التعديلات"
                    : "Save Changes"
                  : ar
                    ? "إضافة الفرع"
                    : "Add Location"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Add / Edit Team Member Dialog */}
      <Dialog open={showAddTeamMember} onOpenChange={setShowAddTeamMember}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStaff
                ? ar
                  ? "تعديل عضو الفريق"
                  : "Edit Team Member"
                : ar
                  ? "إضافة عضو للفريق"
                  : "Add Team Member"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveTeamMember} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{ar ? "الاسم بالعربية *" : "Arabic Name *"}</Label>
              <Input
                required
                value={staffForm.nameAr}
                onChange={(e) => setStaffForm({ ...staffForm, nameAr: e.target.value })}
                placeholder={ar ? "أحمد الحربي" : "Ahmed Alharbi"}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{ar ? "الاسم بالإنجليزية *" : "English Name *"}</Label>
              <Input
                required
                value={staffForm.nameEn}
                onChange={(e) => setStaffForm({ ...staffForm, nameEn: e.target.value })}
                placeholder="Ahmed Alharbi"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{ar ? "البريد الإلكتروني (اختياري للربط بالحساب)" : "Email (optional)"}</Label>
              <Input
                type="email"
                dir="ltr"
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                placeholder="name@example.com"
              />
            </div>

            {/* Role selection: Only Manager and Cashier */}
            <div className="space-y-1.5">
              <Label>{ar ? "الدور" : "Role"}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={staffForm.role}
                onChange={(e) =>
                  setStaffForm({ ...staffForm, role: e.target.value as Staff["role"] })
                }
              >
                {(() => {
                  const roleOptions: { value: Staff["role"]; label: string }[] = [
                    { value: "manager", label: ar ? "مدير فرع" : "Manager" },
                    { value: "cashier", label: ar ? "كاشير" : "Cashier" },
                  ];
                  if (
                    editingStaff &&
                    (editingStaff.role === "owner" ||
                      editingStaff.role === "admin" ||
                      editingStaff.role === "staff")
                  ) {
                    const legacyLabel =
                      editingStaff.role === "owner"
                        ? ar
                          ? "مالك"
                          : "Owner"
                        : editingStaff.role === "admin"
                          ? ar
                            ? "مشرف (قديم)"
                            : "Admin (legacy)"
                          : ar
                            ? "موظف (قديم)"
                            : "Staff (legacy)";
                    roleOptions.unshift({ value: editingStaff.role, label: legacyLabel });
                  }
                  return roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ));
                })()}
              </select>
            </div>

            {/* Assigned Locations Control */}
            <div className="space-y-2">
              <Label>{ar ? "الفروع المعيّنة *" : "Assigned Locations *"}</Label>
              <div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
                {visibleBranches.map((b) => {
                  const checked = staffForm.branchIds.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 p-1 rounded"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => {
                          if (staffForm.role === "cashier") {
                            // Cashier usually assigned to primary working location
                            setStaffForm({ ...staffForm, branchIds: val ? [b.id] : [] });
                          } else {
                            // Manager can be assigned to multiple locations
                            const next = val
                              ? [...staffForm.branchIds, b.id]
                              : staffForm.branchIds.filter((id) => id !== b.id);
                            setStaffForm({ ...staffForm, branchIds: next });
                          }
                        }}
                      />
                      <span>{ar ? b.name_ar : b.name_en}</span>
                      {b.code === "main" && (
                        <span className="text-xs text-primary font-medium">
                          ({ar ? "الرئيسي" : "Main"})
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Cashier PIN Setup (Only if Cashier) */}
            {staffForm.role === "cashier" && (
              <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                <Label>{ar ? "رمز PIN للكاشير (٤ أرقام)" : "Cashier PIN (4 digits)"}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  dir="ltr"
                  value={staffForm.pin}
                  onChange={(e) =>
                    setStaffForm({
                      ...staffForm,
                      pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                    })
                  }
                  className="text-center font-mono tracking-widest text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  {editingStaff
                    ? ar
                      ? "اترك الحقل فارغاً للاحتفاظ برمز PIN الحالي."
                      : "Leave blank to keep existing PIN."
                    : ar
                      ? "يستخدم الكاشير هذا الرمز لفتح شاشة المسح الخاصة به."
                      : "The cashier uses this 4-digit PIN to unlock the terminal."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{ar ? "الحالة" : "Status"}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={staffForm.status}
                onChange={(e) =>
                  setStaffForm({ ...staffForm, status: e.target.value as Staff["status"] })
                }
              >
                <option value="active">{ar ? "نشط" : "Active"}</option>
                <option value="inactive">{ar ? "غير نشط" : "Inactive"}</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddTeamMember(false)}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={saving}>
                {editingStaff
                  ? ar
                    ? "حفظ التعديلات"
                    : "Save Changes"
                  : ar
                    ? "إنشاء العضو"
                    : "Create Team Member"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Cashier Access Link Modal */}
      {cashierAccessStaff && (
        <Dialog open={Boolean(cashierAccessStaff)} onOpenChange={() => setCashierAccessStaff(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="size-5 text-primary" />
                {ar ? "وصول الكاشير للشاشة" : "Cashier Terminal Access"}
              </DialogTitle>
            </DialogHeader>

            {(() => {
              const assigned = rawData.assignments.find(
                (a) => a.staff_id === cashierAccessStaff.id,
              );
              const branch = assigned ? branchById.get(assigned.branch_id) : visibleBranches[0];
              const branchCode = branch?.code || "main";
              const origin =
                typeof window !== "undefined"
                  ? window.location.origin
                  : "https://app.pointpass.com";
              const accessUrl = `${origin}/scan?slug=${rawData.slug}&branch=${branchCode}&staff=${cashierAccessStaff.code}`;

              return (
                <div className="space-y-4 pt-2 text-sm">
                  <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                    <span className="font-semibold block">
                      {ar ? cashierAccessStaff.name_ar : cashierAccessStaff.name_en}
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      {ar ? "الفرع المخصص:" : "Assigned Branch:"}{" "}
                      {ar ? branch?.name_ar : branch?.name_en}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ar
                      ? "انسخ هذا الرابط وافتحه على جهاز أو هاتف الكاشير. يقوم الرابط بتجهيز بيانات الفرع والكاشير تلقائياً دون الحاجة لكتابة رموز تقنية، ولا يتطلب سوى إدخال رمز PIN المكون من ٤ أرقام."
                      : "Copy this link and open it on the cashier device. The terminal will be pre-configured with branch and cashier details, requiring only the 4-digit PIN."}
                  </p>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {ar ? "رابط الوصول المباشر" : "Direct Terminal Link"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={accessUrl} dir="ltr" className="text-xs font-mono" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(accessUrl);
                          toast.success(ar ? "تم نسخ الرابط بنجاح" : "Link copied to clipboard");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button asChild className="w-full gap-1.5">
                      <a href={accessUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" />
                        {ar ? "فتح شاشة الكاشير الآن" : "Open Terminal Now"}
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* 4. Set / Change PIN Dialog */}
      {changePinStaff && (
        <Dialog open={Boolean(changePinStaff)} onOpenChange={() => setChangePinStaff(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                {ar ? "تغيير رمز PIN للكاشير" : "Change Cashier PIN"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleUpdateCashierPin} className="space-y-4 pt-2">
              <div>
                <span className="text-sm font-semibold block">
                  {ar ? changePinStaff.name_ar : changePinStaff.name_en}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ar
                    ? "أدخل رمز PIN الجديد المكون من ٤ أرقام. سيؤدي هذا لتسجيل الخروج من أي جلسات مفتوحة حالياً."
                    : "Enter new 4-digit PIN. This will revoke any active sessions for this cashier."}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label>{ar ? "رمز PIN الجديد (٤ أرقام)" : "New PIN (4 digits)"}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  dir="ltr"
                  value={newPinValue}
                  onChange={(e) => setNewPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="text-center font-mono tracking-widest text-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setChangePinStaff(null)}>
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
                <Button type="submit" disabled={saving || newPinValue.length !== 4}>
                  {ar ? "حفظ الرمز" : "Save PIN"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* 5. Multi-Location Upgrade Hint Dialog */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
            <Sparkles className="size-6" />
          </div>
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="text-lg">
              {ar ? "متاح مع باقة الفروع المتعددة" : "Available on Multi-Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              {ar
                ? "تتيح لك باقة الفروع المتعددة إضافة حتى ١٠ فروع مختلفة لمنشأتك مع إدارة متكاملة للمدراء والكاشير وتقارير مستقلة لكل موقع."
                : "The Multi-Location plan lets you add up to 10 distinct locations with branch-scoped managers, cashiers, and independent analytics."}
            </p>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-start space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Check className="size-4 text-primary" />
                {ar ? "حتى ١٠ فروع نشطة" : "Up to 10 active locations"}
              </div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Check className="size-4 text-primary" />
                {ar ? "عزل صلاحيات المدراء لكل فرع" : "Scoped branch manager permissions"}
              </div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Check className="size-4 text-primary" />
                {ar
                  ? "تحليلات وأجهزة مستقلة لكل فرع"
                  : "Dedicated analytics and devices per branch"}
              </div>
            </div>
          </div>
          <div className="pt-2 flex justify-center">
            <Button onClick={() => setShowUpgradeModal(false)}>{ar ? "فهمت ذلك" : "Got it"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Subcomponent: Team Member Card
function TeamMemberCard({
  member,
  ar,
  canManageBiz,
  pinConfigured,
  branches,
  assignments,
  onOpenCashierAccess,
  onOpenChangePin,
  onEdit,
}: {
  member: Staff;
  ar: boolean;
  canManageBiz: boolean;
  pinConfigured?: boolean | undefined;
  branches: Branch[];
  assignments: Assignment[];
  onOpenCashierAccess: () => void;
  onOpenChangePin: () => void;
  onEdit: () => void;
}) {
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const memberBranchIds = assignments
    .filter((a) => a.staff_id === member.id)
    .map((a) => a.branch_id);
  const memberBranches = memberBranchIds
    .map((id) => branchById.get(id))
    .filter(Boolean) as Branch[];

  const roleLabel =
    member.role === "manager"
      ? ar
        ? "مدير فرع"
        : "Manager"
      : member.role === "cashier"
        ? ar
          ? "كاشير"
          : "Cashier"
        : member.role === "owner"
          ? ar
            ? "مالك"
            : "Owner"
          : member.role === "admin"
            ? ar
              ? "مشرف (قديم)"
              : "Admin (legacy)"
            : ar
              ? "موظف (قديم)"
              : "Staff (legacy)";

  return (
    <div className="panel p-5 flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-bold text-base">{ar ? member.name_ar : member.name_en}</h4>
            <span className="text-xs text-muted-foreground block">
              {member.email || (ar ? "دون حساب مرتبط" : "No account linked")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 items-center justify-end">
            <Badge variant="outline" className="capitalize">
              {roleLabel}
            </Badge>
            <Badge variant={member.status === "active" ? "default" : "outline"}>
              {member.status === "active" ? (ar ? "نشط" : "Active") : ar ? "غير نشط" : "Inactive"}
            </Badge>
          </div>
        </div>

        {/* Assigned Locations */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">
            {ar ? "الفروع المعيّنة:" : "Assigned Locations:"}
          </span>
          <div className="flex flex-wrap gap-1">
            {memberBranches.length > 0 ? (
              memberBranches.map((b) => (
                <span
                  key={b.id}
                  className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs text-foreground font-medium"
                >
                  {ar ? b.name_ar : b.name_en}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                {ar ? "لم يُعيّن لفرع" : "Unassigned"}
              </span>
            )}
          </div>
        </div>

        {/* Cashier-Specific PIN Status */}
        {member.role === "cashier" && (
          <div className="rounded-lg bg-muted/30 p-2.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <KeyRound className="size-3.5 text-primary" />
              {pinConfigured ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  {ar ? "تم ضبط رمز PIN" : "PIN configured"}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="size-3.5" />
                  {ar ? "لم يتم ضبط الرمز" : "PIN not configured"}
                </span>
              )}
            </span>

            {canManageBiz && (
              <button
                type="button"
                className="text-primary hover:underline text-xs cursor-pointer font-semibold"
                onClick={onOpenChangePin}
              >
                {pinConfigured ? (ar ? "تغيير" : "Change") : ar ? "تعيين" : "Set PIN"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        {member.role === "cashier" && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full text-xs font-semibold gap-1.5"
            onClick={onOpenCashierAccess}
          >
            <Smartphone className="size-3.5" />
            {ar ? "وصول الكاشير" : "Cashier Access"}
          </Button>
        )}

        {canManageBiz && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className={`text-xs gap-1.5 ${member.role !== "cashier" ? "w-full" : ""}`}
          >
            <Edit2 className="size-3.5" />
            {ar ? "تعديل" : "Edit"}
          </Button>
        )}
      </div>
    </div>
  );
}

// Subcomponent: Devices List
function DevicesList({
  sessions,
  staffById,
  branchById,
  ar,
  canManageBiz,
  userCanManageBranch,
  saving,
  onRevoke,
}: {
  sessions: CashierSession[];
  staffById: Map<string, Staff>;
  branchById: Map<string, Branch>;
  ar: boolean;
  canManageBiz: boolean;
  userCanManageBranch: (bId: string) => boolean;
  saving: boolean;
  onRevoke: (sessionId: string) => Promise<void>;
}) {
  const [showExpired, setShowExpired] = useState(false);

  const activeSessions = sessions.filter(
    (s) => !s.revoked_at && new Date(s.expires_at) > new Date(),
  );
  const inactiveSessions = sessions.filter(
    (s) => s.revoked_at || new Date(s.expires_at) <= new Date(),
  );

  return (
    <div className="space-y-4">
      {/* Active Devices */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {ar ? "الأجهزة النشطة حالياً" : "Currently Active Devices"} ({activeSessions.length})
        </h4>

        {activeSessions.length > 0 ? (
          activeSessions.map((session) => {
            const staff = session.staff_id ? staffById.get(session.staff_id) : null;
            const branch = session.branch_id ? branchById.get(session.branch_id) : null;
            const canRevoke =
              canManageBiz || (session.branch_id ? userCanManageBranch(session.branch_id) : false);

            return (
              <div
                key={session.id}
                className="panel p-4 flex flex-wrap items-center justify-between gap-3 border-emerald-500/20"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Smartphone className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {session.device_name || (ar ? "جهاز كاشير" : "Cashier Terminal")}
                      </span>
                      <Badge
                        variant="default"
                        className="bg-emerald-600 hover:bg-emerald-600 text-xs"
                      >
                        {ar ? "نشط" : "Active"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {staff
                        ? ar
                          ? staff.name_ar
                          : staff.name_en
                        : ar
                          ? "جلسة عامة (قديمة)"
                          : "Global Session"}
                      {" · "}
                      {branch ? (ar ? branch.name_ar : branch.name_en) : "—"}
                    </p>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="size-3" />
                      {ar ? "آخر استخدام:" : "Last used:"}{" "}
                      {new Date(session.last_used_at).toLocaleTimeString(ar ? "ar-SA" : "en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {canRevoke && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={() => onRevoke(session.id)}
                    className="text-xs"
                  >
                    {ar ? "إلغاء الصلاحية" : "Revoke Access"}
                  </Button>
                )}
              </div>
            );
          })
        ) : (
          <div className="panel p-6 text-center text-muted-foreground text-xs">
            <Smartphone className="size-6 mx-auto mb-1.5 opacity-30" />
            <p className="font-medium text-sm">
              {ar ? "لا توجد أجهزة كاشير نشطة حالياً." : "No active cashier devices."}
            </p>
            <p className="mt-0.5">
              {ar
                ? "تظهر الأجهزة هنا تلقائياً عند تسجيل دخول الكاشير."
                : "Devices appear here automatically after a Cashier signs in."}
            </p>
          </div>
        )}
      </div>

      {/* Expired / Revoked Devices Toggle */}
      {inactiveSessions.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer font-medium"
            onClick={() => setShowExpired(!showExpired)}
          >
            {showExpired ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {ar ? "الجلسات والأجهزة السابقة المنتهية" : "Previous Expired / Revoked Sessions"} (
            {inactiveSessions.length})
          </button>

          {showExpired && (
            <div className="mt-3 space-y-2">
              {inactiveSessions.slice(0, 15).map((session) => {
                const staff = session.staff_id ? staffById.get(session.staff_id) : null;
                const branch = session.branch_id ? branchById.get(session.branch_id) : null;

                return (
                  <div
                    key={session.id}
                    className="panel p-3 text-xs flex items-center justify-between opacity-70 bg-muted/30"
                  >
                    <div>
                      <span className="font-medium">
                        {session.device_name || (ar ? "جهاز كاشير" : "Cashier Terminal")}
                      </span>
                      <span className="text-muted-foreground ms-2">
                        {staff ? (ar ? staff.name_ar : staff.name_en) : "—"} ·{" "}
                        {branch ? (ar ? branch.name_ar : branch.name_en) : "—"}
                      </span>
                    </div>
                    <Badge variant="outline">
                      {session.revoked_at ? (ar ? "ملغي" : "Revoked") : ar ? "منتهي" : "Expired"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Export alias for clean future naming
export { OperationsPanel as LocationsTeamPanel };
