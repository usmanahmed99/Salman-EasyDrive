import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CarFront,
  Check,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  FileText,
  FormInput,
  Gauge,
  GripVertical,
  HelpCircle,
  Languages,
  LayoutDashboard,
  Link2,
  ListFilter,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import clsx from "clsx";
import { adminApi, type AdminUser } from "./api";
import AdminDocs from "./AdminDocs";
import type {
  AdminResource,
  BookingForm,
  CalendarMapping,
  Center,
  FormField,
  ResourceGroup,
  Service
} from "../shared/types";

type AdminSection =
  | "dashboard"
  | "bookings"
  | "centers"
  | "services"
  | "resources"
  | "availability"
  | "forms"
  | "calendar"
  | "privacy"
  | "docs";

interface AdminBooking {
  id: string;
  reference: string;
  time: string;
  date: string;
  start_at: string;
  booked_at: string;
  student: string;
  service: string;
  serviceSlug?: string;
  center: string;
  centerSlug?: string;
  instructor?: string;
  status: string;
  calendarLastError?: string;
}

const nav: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Today", icon: LayoutDashboard },
  { id: "bookings", label: "Bookings", icon: CalendarDays },
  { id: "centers", label: "Centers", icon: MapPin },
  { id: "services", label: "Services", icon: Gauge },
  { id: "resources", label: "Instructors & cars", icon: CarFront },
  { id: "availability", label: "Availability rules", icon: Clock3 },
  { id: "forms", label: "Form builder", icon: FormInput },
  { id: "calendar", label: "Google Calendar", icon: Link2 },
  { id: "privacy", label: "Privacy & retention", icon: ShieldAlert },
  { id: "docs", label: "Documentation", icon: BookOpen }
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/* -------------------------------------------------------------------------- */
/* Reusable UI                                                                */
/* -------------------------------------------------------------------------- */

function AdminLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
        <Gauge size={22} />
      </div>
      <div>
        <div className="text-sm font-extrabold text-white">Easy Driving</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Operations</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const failed = status === "calendar_sync_failed";
  const cancelled = status.startsWith("cancelled");
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize",
      failed ? "bg-amber-50 text-amber-700" : cancelled ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
    )}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", failed ? "bg-amber-500" : cancelled ? "bg-slate-400" : "bg-emerald-500")} />
      {failed ? "Sync issue" : cancelled ? "Cancelled" : status.replace(/_/g, " ")}
    </span>
  );
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <h2 className="min-w-0 text-base font-extrabold text-ink sm:text-lg">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
        {footer && <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Read-only slug display with a copy button. Slugs are immutable identifiers after creation. */
function ReadonlySlug({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="block">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input className="field flex-1 cursor-default bg-slate-50 font-mono text-slate-500" value={value} readOnly tabIndex={-1} onFocus={(e) => e.target.blur()} />
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-ink" title="Copy slug" onClick={copy}>
          {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

function Banner({ kind, message, onClose }: { kind: "error" | "success"; message: string; onClose?: () => void }) {
  return (
    <div className={clsx(
      "mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm",
      kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
    )}>
      {kind === "error" ? <AlertTriangle className="mt-0.5 shrink-0" size={17} /> : <Check className="mt-0.5 shrink-0" size={17} />}
      <span className="flex-1">{message}</span>
      {onClose && <button onClick={onClose}><X size={15} /></button>}
    </div>
  );
}

function ScreenSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => <div className="skeleton h-40 rounded-2xl" key={index} />)}
    </div>
  );
}

function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (message: string): Promise<boolean> =>
    new Promise((resolve) => setState({ message, resolve }));
  const dialog = state ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><AlertTriangle size={20} /></div>
          <p className="mt-1.5 text-sm font-medium text-slate-700">{state.message}</p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button className="secondary-button min-h-11 px-4 py-2 text-sm" onClick={() => { state.resolve(false); setState(null); }}>Cancel</button>
          <button className="min-h-11 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700" onClick={() => { state.resolve(true); setState(null); }}>Confirm</button>
        </div>
      </div>
    </div>
  ) : null;
  return { confirm, dialog };
}

function useToast() {
  const [toast, setToast] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const show = useCallback((kind: "error" | "success", message: string) => {
    setToast({ kind, message });
    if (kind === "success") setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show, clear: () => setToast(null) };
}

/* -------------------------------------------------------------------------- */
/* Emergency control (dashboard)                                              */
/* -------------------------------------------------------------------------- */

function EmergencyControl({
  centers,
  services,
  resources,
  overrides,
  onAdded,
  onRemoved
}: {
  centers: Center[];
  services: Service[];
  resources: AdminResource[];
  overrides: Array<Record<string, string>>;
  onAdded: (override: Record<string, string>) => void;
  onRemoved: (id: string) => void;
}) {
  const [action, setAction] = useState("service_capacity");
  const [centerId, setCenterId] = useState(centers[0]?.id || "");
  const [serviceTarget, setServiceTarget] = useState(services[0]?.id || "");
  const [resourceTarget, setResourceTarget] = useState(resources[0]?.id || "");
  const [when, setWhen] = useState("today");
  const [customMinutes, setCustomMinutes] = useState(30);
  const [capacity, setCapacity] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!centerId && centers[0]) setCenterId(centers[0].id); }, [centers, centerId]);

  const centerResources = resources.filter((resource) => resource.center_id === centerId);

  const apply = async () => {
    setError("");
    const now = new Date();
    const end = new Date(now);
    if (when === "now") end.setHours(now.getHours() + 2);
    else if (when === "today") end.setHours(23, 59, 59, 999);
    else if (when === "tomorrow") {
      now.setDate(now.getDate() + 1); now.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1); end.setHours(23, 59, 59, 999);
    } else if (when === "custom") {
      end.setTime(now.getTime() + customMinutes * 60_000);
    }
    const payload = {
      centerId,
      serviceId: action === "service_closed" || action === "service_capacity" ? serviceTarget : null,
      resourceId: action === "resource_blocked" ? resourceTarget : null,
      type: action,
      startAt: now.toISOString(),
      endAt: end.toISOString(),
      capacityLimit: action === "service_capacity" ? capacity : action.includes("closed") ? 0 : null,
      reason: reason || undefined
    };
    setSaving(true);
    try {
      const created = await adminApi.createOverride(payload) as Record<string, string>;
      const center = centers.find((item) => item.id === centerId);
      const service = services.find((item) => item.id === serviceTarget);
      const resource = resources.find((item) => item.id === resourceTarget);
      onAdded({
        ...created,
        center: center?.name || "",
        target: action === "center_closed" ? "All services" : action === "resource_blocked" ? (resource?.name || "Resource") : (service?.name.en || "Service"),
        period: when === "today" ? "Rest of today" : when === "tomorrow" ? "Tomorrow" : when === "now" ? "Next 2 hours" : when === "custom" ? `Next ${customMinutes < 60 ? `${customMinutes}m` : `${customMinutes / 60}h`}` : when,
        detail: action === "service_capacity" ? `Limit: ${capacity}` : "Closed",
        reason
      });
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await adminApi.deleteOverride(id);
      onRemoved(id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-ink text-white shadow-soft">
      <button className="flex w-full items-center justify-between p-5 text-left sm:p-6" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-500/15 text-red-300"><SlidersHorizontal size={24} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold">Emergency Control</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-100">Instant</span>
            </div>
            <p className="mt-1 text-sm text-slate-300">Close or limit a service in a few taps.</p>
          </div>
        </div>
        <div className={clsx("grid h-9 w-9 place-items-center rounded-lg bg-white/10 transition", open && "rotate-180")}><ChevronDown size={18} /></div>
      </button>

      {open && (
        <div className="border-t border-white/10 bg-white p-5 text-ink sm:p-6">
          {error && <Banner kind="error" message={error} onClose={() => setError("")} />}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="What do you want to change?">
              <select className="field" value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="center_closed">Close a center</option>
                <option value="service_closed">Close a service</option>
                <option value="service_capacity">Limit service capacity</option>
                <option value="resource_blocked">Block instructor or car</option>
              </select>
            </Field>
            <Field label="Where?">
              <select className="field" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
                {centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}
              </select>
            </Field>
            {(action === "service_closed" || action === "service_capacity") && (
              <Field label="Which service?">
                <select className="field" value={serviceTarget} onChange={(event) => setServiceTarget(event.target.value)}>
                  {services.map((service) => <option value={service.id} key={service.id}>{service.name.en}</option>)}
                </select>
              </Field>
            )}
            {action === "resource_blocked" && (
              <Field label="Which resource?">
                <select className="field" value={resourceTarget} onChange={(event) => setResourceTarget(event.target.value)}>
                  {centerResources.map((resource) => <option value={resource.id} key={resource.id}>{resource.name}</option>)}
                </select>
              </Field>
            )}
            <div className={clsx("space-y-2", when !== "custom" && "")}>
              <Field label="When?">
                <select className="field" value={when} onChange={(event) => setWhen(event.target.value)}>
                  <option value="now">Now · next 2 hours</option>
                  <option value="today">Rest of today</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="custom">Custom duration…</option>
                </select>
              </Field>
              {when === "custom" && (
                <div className="flex items-center gap-2">
                  <input className="field w-24" type="number" min="1" value={customMinutes} onChange={(event) => setCustomMinutes(Math.max(1, Number(event.target.value)))} />
                  <select className="field" value={customMinutes % 60 === 0 && customMinutes >= 60 ? "hours" : "minutes"}
                    onChange={(event) => {
                      if (event.target.value === "hours") setCustomMinutes((m) => Math.max(1, Math.round(m / 60)) * 60);
                      else setCustomMinutes((m) => m >= 60 ? m / 60 : m);
                    }}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                  </select>
                </div>
              )}
            </div>
            {action === "service_capacity" && (
              <Field label="Maximum concurrent bookings">
                <input className="field" min="0" type="number" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
              </Field>
            )}
            <label className={clsx("block", action !== "service_capacity" && "sm:col-span-2")}>
              <span className="label">Reason or note</span>
              <input className="field" placeholder="e.g. One car unavailable" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary-button bg-red-600 shadow-red-600/20 hover:bg-red-700" disabled={saving || !centerId} onClick={apply}>
              {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />} Apply immediately
            </button>
          </div>
        </div>
      )}

      {overrides.length > 0 && (
        <div className="border-t border-white/10 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Active controls</p>
            <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-200">{overrides.length} active</span>
          </div>
          <div className="space-y-2">
            {overrides.map((override) => (
              <div className="flex items-center gap-3 rounded-xl bg-white/7 p-3" key={override.id}>
                <AlertTriangle className="shrink-0 text-amber-300" size={18} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{override.center} · {override.target}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-300">{override.period} · {override.detail} {override.reason && `· ${override.reason}`}</p>
                </div>
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-slate-300 transition hover:bg-red-500/20 hover:text-red-200" onClick={() => remove(override.id)}>
                  <X size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

function TodayDashboard({
  bookings, centers, services, resources, groups, overrides, setOverrides, onResync, onReconcile, openSection
}: {
  bookings: AdminBooking[];
  centers: Center[];
  services: Service[];
  resources: AdminResource[];
  groups: ResourceGroup[];
  overrides: Array<Record<string, string>>;
  setOverrides: React.Dispatch<React.SetStateAction<Array<Record<string, string>>>>;
  onResync: (id: string) => Promise<void>;
  onReconcile: () => Promise<void>;
  openSection: (section: AdminSection) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(montrealToday());
  const [reconciling, setReconciling] = useState(false);
  const [page, setPage] = useState(0);
  const isToday = selectedDay === montrealToday();
  const dayLabel = isToday ? "Today" : formatDayLabel(selectedDay);
  const shiftDay = (delta: number) => { setSelectedDay((current) => addDays(current, delta)); setPage(0); };

  const reconcile = async () => {
    setReconciling(true);
    try { await onReconcile(); } finally { setReconciling(false); }
  };

  const byTime = (a: AdminBooking, b: AdminBooking) => a.start_at.localeCompare(b.start_at);
  const onDay = bookings.filter((booking) => montrealDate(booking.start_at) === selectedDay);
  const active = onDay.filter((booking) => !booking.status.startsWith("cancelled")).sort(byTime);
  const cancelled = onDay.filter((booking) => booking.status.startsWith("cancelled")).sort(byTime);

  const PAGE_SIZE = 8;
  const pageCount = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedActive = active.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const failed = bookings.filter((booking) => booking.status === "calendar_sync_failed");
  const activeInstructors = resources.filter((resource) => resource.type === "instructor" && resource.enabled).length;
  const totalCars = groups.filter((group) => group.type === "cars").reduce((sum, group) => sum + group.capacity, 0);

  const stats = [
    { label: isToday ? "Bookings today" : "Bookings", value: String(active.length), note: cancelled.length ? `${cancelled.length} cancelled` : dayLabel, icon: CalendarDays, color: "text-brand-600 bg-brand-50" },
    { label: "Car capacity", value: String(totalCars), note: `${groups.filter((g) => g.type === "cars").length} pools`, icon: CarFront, color: "text-amber-600 bg-amber-50" },
    { label: "Instructors active", value: String(activeInstructors), note: `${resources.filter((r) => r.type === "instructor").length} total`, icon: UsersRound, color: "text-emerald-600 bg-emerald-50" },
    { label: "Calendar issues", value: String(failed.length), note: failed.length ? "Needs attention" : "All synced", icon: AlertTriangle, color: "text-amber-600 bg-amber-50" }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div className="card p-5" key={item.label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{item.value}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{item.note}</p>
              </div>
              <div className={clsx("grid h-10 w-10 place-items-center rounded-xl", item.color)}><item.icon size={20} /></div>
            </div>
          </div>
        ))}
      </div>

      <EmergencyControl
        centers={centers} services={services} resources={resources}
        overrides={overrides}
        onAdded={(override) => setOverrides((current) => [override, ...current])}
        onRemoved={(id) => setOverrides((current) => current.filter((item) => item.id !== id))}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-extrabold text-ink">{dayLabel}'s bookings</h2>
              <p className="mt-0.5 text-xs text-slate-500">{active.length} active{cancelled.length ? ` · ${cancelled.length} cancelled` : ""}</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white sm:col-span-1 sm:justify-start">
                <button className="grid h-9 w-9 place-items-center rounded-l-xl text-slate-500 hover:bg-slate-50" title="Previous day" onClick={() => shiftDay(-1)}><ChevronLeft size={16} /></button>
                <button className={clsx("min-w-[88px] px-2 text-xs font-bold", isToday ? "text-slate-300" : "text-brand-600 hover:text-brand-700")} disabled={isToday} onClick={() => { setSelectedDay(montrealToday()); setPage(0); }}>{isToday ? formatDayLabel(selectedDay) : "Today"}</button>
                <button className="grid h-9 w-9 place-items-center rounded-r-xl text-slate-500 hover:bg-slate-50" title="Next day" onClick={() => shiftDay(1)}><ChevronRight size={16} /></button>
              </div>
              <button className="secondary-button min-h-10 px-3 py-2 text-xs" title="Check Google Calendar for externally-deleted events and free those slots" disabled={reconciling} onClick={reconcile}>
                {reconciling ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Reconcile calendar
              </button>
              <button className="secondary-button min-h-10 px-3 py-2 text-xs" onClick={() => openSection("bookings")}><ListFilter size={15} /> All bookings</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {active.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No active bookings on this day.</p>}
            {pagedActive.map((booking) => (
              <div className="flex flex-wrap items-center gap-3 px-4 py-4 transition hover:bg-slate-50 sm:flex-nowrap sm:px-5" key={booking.id}>
                <div className="w-16 shrink-0">
                  <p className="text-sm font-extrabold text-ink">{booking.time}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">{booking.reference}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{booking.student}</p>
                  <p className="truncate text-xs text-slate-500">
                    {booking.service} · {booking.center}
                    {booking.instructor && <span className="text-slate-400"> · {booking.instructor}</span>}
                  </p>
                </div>
                <div className="ml-16 sm:ml-0"><StatusBadge status={booking.status} /></div>
              </div>
            ))}
          </div>
          {active.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs">
              <span className="text-slate-500">
                {safePage * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE + PAGE_SIZE, active.length)} of {active.length}
              </span>
              <div className="flex items-center gap-1">
                <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Previous page" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft size={15} /></button>
                <span className="px-1 font-semibold text-slate-500">{safePage + 1} / {pageCount}</span>
                <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Next page" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
          {cancelled.length > 0 && (
            <details className="border-t border-slate-100">
              <summary className="cursor-pointer select-none px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-50">
                Cancelled ({cancelled.length})
              </summary>
              <div className="divide-y divide-slate-100">
                {cancelled.map((booking) => (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-4 opacity-70 sm:flex-nowrap sm:px-5" key={booking.id}>
                    <div className="w-16 shrink-0">
                      <p className="text-sm font-extrabold text-slate-400 line-through">{booking.time}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-slate-400">{booking.reference}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-500">{booking.student}</p>
                      <p className="truncate text-xs text-slate-400">{booking.service} · {booking.center}</p>
                    </div>
                    <div className="ml-16 sm:ml-0"><StatusBadge status={booking.status} /></div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-ink">Center status</h2>
              <span className="text-xs font-bold text-emerald-600">{centers.filter((c) => c.enabled).length} open</span>
            </div>
            <div className="mt-4 space-y-3">
              {centers.map((center) => {
                const count = active.filter((booking) => booking.center === center.name).length;
                return (
                  <div className="flex items-center gap-3" key={center.id}>
                    <span className={clsx("h-2.5 w-2.5 rounded-full ring-4", center.enabled ? "bg-emerald-500 ring-emerald-50" : "bg-slate-300 ring-slate-100")} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-ink">{center.name}</p>
                      <p className="text-xs text-slate-500">{count} booking{count === 1 ? "" : "s"} {isToday ? "today" : "this day"}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">{center.enabled ? "Open" : "Closed"}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {failed.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex gap-3">
                <AlertTriangle className="shrink-0 text-amber-600" size={21} />
                <div>
                  <p className="text-sm font-extrabold text-amber-900">Calendar sync needs attention</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">{failed.length} booking(s) could not be added to Google Calendar.</p>
                  <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-900" onClick={() => onResync(failed[0].id)}>
                    <RefreshCw size={14} /> Retry {failed[0].reference}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function bookingDate(booking: AdminBooking) {
  return montrealDate(booking.start_at);
}

/**
 * Convert a wall-clock "YYYY-MM-DDTHH:mm" (as typed in a datetime-local input,
 * interpreted in the given IANA timezone) to an ISO-8601 string with the correct
 * UTC offset. Mirrors the worker's localDateTimeToIso so admin-entered times land
 * at the intended local hour regardless of the browser's own timezone.
 */
function localInputToIso(value: string, timeZone: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const assumedUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(assumedUtc));
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const represented = Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day), Number(v.hour), Number(v.minute));
  return new Date(assumedUtc - (represented - assumedUtc)).toISOString();
}

/** ISO timestamp → "YYYY-MM-DDTHH:mm" wall-clock in the given timezone, for datetime-local inputs. */
function isoToLocalInput(iso: string, timeZone: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(iso));
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
}

/** Calendar date (YYYY-MM-DD) of an ISO timestamp in the America/Montreal timezone. */
function montrealDate(iso: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function montrealToday() {
  return montrealDate(new Date().toISOString());
}

function addDays(day: string, delta: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(day: string) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC"
  }).format(new Date(day + "T12:00:00Z"));
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

function NewBookingModal({ centers, services, onClose, onBooked }: {
  centers: Center[];
  services: Service[];
  onClose: () => void;
  onBooked: () => void;
}) {
  const enabledServices = useMemo(() => services.filter((s) => s.enabled), [services]);
  const [centerSlug, setCenterSlug] = useState(centers[0]?.slug || "");
  const [serviceSlug, setServiceSlug] = useState(enabledServices[0]?.slug || "");
  const [when, setWhen] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const timezone = centers.find((c) => c.slug === centerSlug)?.timezone || "America/Montreal";

  const save = async () => {
    setError("");
    if (!centerSlug || !serviceSlug || !when || name.trim().length < 1) {
      setError("Center, service, date/time and student name are required.");
      return;
    }
    setSaving(true);
    try {
      await adminApi.createAdminBooking({
        centerSlug, serviceSlug, start: localInputToIso(when, timezone),
        studentName: name.trim(), studentEmail: email.trim() || undefined, studentPhone: phone.trim() || undefined
      });
      onBooked();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New booking"
      onClose={onClose}
      footer={<>
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={saving} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Create booking</button>
      </>}
    >
      {error && <Banner kind="error" message={error} onClose={() => setError("")} />}
      <p className="mb-4 text-xs text-slate-500">Admin bookings ignore lead-time cutoffs and opening hours, but still won't double-book an instructor or car that's already taken.</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Center">
          <select className="field" value={centerSlug} onChange={(e) => setCenterSlug(e.target.value)}>
            {centers.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Service">
          <select className="field" value={serviceSlug} onChange={(e) => setServiceSlug(e.target.value)}>
            {enabledServices.map((s) => <option key={s.id} value={s.slug}>{s.name.en}</option>)}
          </select>
        </Field>
        <Field label="Student name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></Field>
        <Field label="Email (optional)"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" /></Field>
        <Field label="Phone (optional)"><input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(514) 555-0123" /></Field>
      </div>
      <div className="mt-5">
        <span className="label">Date &amp; time (center local time)</span>
        <AvailabilityPicker centerSlug={centerSlug} serviceSlug={serviceSlug} timezone={timezone} value={when} onChange={setWhen} />
      </div>
    </Modal>
  );
}

interface QuickSlot { start: string; end: string; available: boolean; reasons: string[] }

// A blocking reason is one an admin cannot override (a real resource conflict or
// exhausted capacity). Cutoffs/hours/closures are overridable, mirroring the worker.
const ADMIN_OVERRIDABLE_REASONS = new Set([
  "outside_business_hours", "outside_service_hours", "cutoff_exceeded",
  "center_closed", "service_closed", "service_capacity_full"
]);
function slotIsBlocked(slot: QuickSlot) {
  return slot.reasons.some((reason) => !ADMIN_OVERRIDABLE_REASONS.has(reason));
}

/**
 * Shared time + availability picker for rescheduling and ad-hoc booking. Shows a
 * day's slots from the admin (debug) availability so cutoff/closed slots remain
 * visible and bookable (admin override), while genuine resource conflicts are
 * disabled. A manual datetime field stays available for off-grid times.
 */
function AvailabilityPicker({ centerSlug, serviceSlug, timezone, value, onChange }: {
  centerSlug?: string;
  serviceSlug?: string;
  timezone: string;
  value: string;            // "YYYY-MM-DDTHH:mm" wall-clock in `timezone`
  onChange: (next: string) => void;
}) {
  const [day, setDay] = useState(() => (value ? value.slice(0, 10) : montrealToday()));
  const [slots, setSlots] = useState<QuickSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!centerSlug || !serviceSlug || !day) { setSlots(null); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    adminApi.availabilityDebug(centerSlug, serviceSlug, day)
      .then((result) => { if (!cancelled) setSlots(result.slots); })
      .catch((err) => { if (!cancelled) { setSlots([]); setLoadError(errorMessage(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [centerSlug, serviceSlug, day]);

  const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-CA", {
    hour: "numeric", minute: "2-digit", timeZone: timezone
  }).format(new Date(iso));

  return (
    <div>
      <div className="flex items-end gap-3">
        <Field label="Day"><input className="field" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <p className="pb-3 text-xs text-slate-500">{loading ? "Loading times…" : slots ? `${slots.filter((s) => !slotIsBlocked(s)).length} bookable` : ""}</p>
      </div>
      {loadError && <p className="mt-1 text-xs font-semibold text-red-600">{loadError}</p>}
      {slots && slots.length > 0 && (
        <div className="mt-2 grid max-h-52 grid-cols-3 gap-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-4">
          {slots.map((slot) => {
            const blocked = slotIsBlocked(slot);
            const overridden = !slot.available && !blocked; // cutoff/hours only
            const selected = value === isoToLocalInput(slot.start, timezone);
            return (
              <button
                key={slot.start}
                type="button"
                disabled={blocked}
                title={blocked ? `Unavailable: ${slot.reasons.join(", ")}` : overridden ? `Override: ${slot.reasons.join(", ")}` : "Available"}
                onClick={() => onChange(isoToLocalInput(slot.start, timezone))}
                className={clsx(
                  "rounded-lg border px-2 py-2 text-xs font-bold transition",
                  selected && "border-brand-600 bg-brand-600 text-white",
                  !selected && blocked && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 line-through",
                  !selected && !blocked && overridden && "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400",
                  !selected && slot.available && "border-slate-200 bg-white text-ink hover:border-brand-400 hover:bg-brand-50"
                )}
              >
                {fmtTime(slot.start)}
              </button>
            );
          })}
        </div>
      )}
      {slots && slots.length === 0 && !loading && (
        <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">No slots are defined for this day (the center may be closed). Use the exact time field below to override.</p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-white ring-1 ring-slate-300" /> Available</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-200" /> Override (cutoff/hours)</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-200" /> Resource conflict</span>
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-ink">Or enter an exact time</summary>
        <div className="mt-2">
          <input className="field" type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      </details>
    </div>
  );
}

function RescheduleModal({ booking, centers, onClose, onRescheduled }: {
  booking: AdminBooking;
  centers: Center[];
  onClose: () => void;
  onRescheduled: () => void;
}) {
  // The booking row doesn't carry its center timezone; match by display name, default to Montreal.
  const timezone = centers.find((c) => c.name === booking.center)?.timezone || "America/Montreal";
  const [when, setWhen] = useState(() => isoToLocalInput(booking.start_at, timezone));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError("");
    if (!when) { setError("Please choose a new date and time."); return; }
    setSaving(true);
    try {
      await adminApi.rescheduleBooking(booking.id, localInputToIso(when, timezone));
      onRescheduled();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Reschedule ${booking.reference}`}
      onClose={onClose}
      footer={<>
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={saving} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Reschedule</button>
      </>}
    >
      {error && <Banner kind="error" message={error} onClose={() => setError("")} />}
      <p className="mb-3 text-sm text-slate-600"><span className="font-semibold text-ink">{booking.student}</span> · {booking.service} · {booking.center}</p>
      <p className="mb-4 text-xs text-slate-500">Pick a time below — amber slots override cutoffs/hours; greyed slots have a resource conflict and can't be booked. The student's calendar invite is updated.</p>
      <AvailabilityPicker
        centerSlug={booking.centerSlug}
        serviceSlug={booking.serviceSlug}
        timezone={timezone}
        value={when}
        onChange={setWhen}
      />
    </Modal>
  );
}

function BookingsScreen({ bookings, centers, services, onResync, onCancel, onReconcile, reload }: { bookings: AdminBooking[]; centers: Center[]; services: Service[]; onResync: (id: string) => Promise<void>; onCancel: (id: string) => Promise<void>; onReconcile: () => Promise<void>; reload: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [centerFilter, setCenterFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rescheduling, setRescheduling] = useState<AdminBooking | null>(null);

  const reconcile = async () => {
    setReconciling(true);
    try { await onReconcile(); } finally { setReconciling(false); }
  };

  const centerNames = useMemo(() => Array.from(new Set(bookings.map((b) => b.center))).sort(), [bookings]);
  const serviceNames = useMemo(() => Array.from(new Set(bookings.map((b) => b.service))).sort(), [bookings]);
  const statuses = useMemo(() => Array.from(new Set(bookings.map((b) => b.status))).sort(), [bookings]);
  // A booking may list multiple instructors ("A, B"); split so each is its own filter option.
  const instructorNames = useMemo(
    () => Array.from(new Set(bookings.flatMap((b) => (b.instructor ? b.instructor.split(", ") : [])))).sort(),
    [bookings]
  );

  const filtered = useMemo(() => bookings.filter((booking) => {
    if (query && !`${booking.student} ${booking.reference} ${booking.service} ${booking.center} ${booking.instructor || ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (statusFilter !== "all" && booking.status !== statusFilter) return false;
    if (centerFilter !== "all" && booking.center !== centerFilter) return false;
    if (serviceFilter !== "all" && booking.service !== serviceFilter) return false;
    if (instructorFilter !== "all" && !(booking.instructor || "").split(", ").includes(instructorFilter)) return false;
    if (dateFrom && booking.start_at < dateFrom) return false;
    if (dateTo && booking.start_at > dateTo + "T23:59:59") return false;
    return true;
  }), [bookings, query, statusFilter, centerFilter, serviceFilter, instructorFilter, dateFrom, dateTo]);

  const hasFilters = statusFilter !== "all" || centerFilter !== "all" || serviceFilter !== "all" || instructorFilter !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setStatusFilter("all"); setCenterFilter("all"); setServiceFilter("all"); setInstructorFilter("all"); setDateFrom(""); setDateTo(""); setQuery(""); };

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    try { await fn(id); } finally { setBusy(null); }
  };

  return (
    <>
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className="field py-2.5 !pl-11 pr-4" placeholder="Search name, reference or instructor" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:flex lg:shrink-0 lg:items-center">
            <button className="secondary-button min-h-11 px-3 py-2 text-xs" title="Check Google Calendar for externally-deleted events and free those slots" disabled={reconciling} onClick={reconcile}>
              {reconciling ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Reconcile calendar
            </button>
            <button className="primary-button min-h-11 px-3 py-2 text-xs" onClick={() => setCreating(true)}>
              <Plus size={15} /> New booking
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:items-center">
          <select className="field col-span-1 py-2.5 pl-3 pr-8 text-sm xl:!w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select className="field col-span-1 py-2.5 pl-3 pr-8 text-sm xl:!w-44" value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}>
            <option value="all">All centers</option>
            {centerNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="field col-span-1 py-2.5 pl-3 pr-8 text-sm xl:!w-44" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
            <option value="all">All services</option>
            {serviceNames.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="field col-span-2 py-2.5 pl-3 pr-8 text-sm sm:col-span-1 xl:!w-44" value={instructorFilter} onChange={(e) => setInstructorFilter(e.target.value)}>
            <option value="all">All instructors</option>
            {instructorNames.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-xs text-slate-500 sm:col-span-3 xl:flex">
            <input type="date" className="field min-w-0 py-2.5 px-2 text-sm xl:!w-[160px] xl:px-3" aria-label="From date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span>–</span>
            <input type="date" className="field min-w-0 py-2.5 px-2 text-sm xl:!w-[160px] xl:px-3" aria-label="To date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button className="flex h-10 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 xl:justify-start" onClick={clearFilters}>
              <X size={14} /> Clear
            </button>
          )}
          <span className="self-center text-right text-xs text-slate-500 xl:ml-auto">{filtered.length} of {bookings.length}</span>
        </div>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[960px] text-left">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              {["Date & Time", "Student", "Service", "Instructor", "Center", "Reference", "Booked on", "Status", ""].map((heading, index) => <th className="px-5 py-3" key={index}>{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">No bookings found.</td></tr>}
            {filtered.map((booking) => (
              <tr className="hover:bg-slate-50" key={booking.id}>
                <td className="px-5 py-4">
                  <span className="font-bold text-ink">{booking.time}</span>
                  <span className="ml-1.5 text-xs text-slate-400">{booking.date}</span>
                </td>
                <td className="px-5 py-4 font-semibold text-ink">{booking.student}</td>
                <td className="px-5 py-4 text-slate-600">{booking.service}</td>
                <td className="px-5 py-4 text-slate-600">{booking.instructor || <span className="text-slate-300">—</span>}</td>
                <td className="px-5 py-4 text-slate-600">{booking.center}</td>
                <td className="px-5 py-4 font-mono text-xs text-slate-500">{booking.reference}</td>
                <td className="px-5 py-4 text-xs text-slate-400">{booking.booked_at}</td>
                <td className="px-5 py-4">
                  <StatusBadge status={booking.status} />
                  {booking.calendarLastError === "event_deleted_externally" && (
                    <span className="mt-1 block text-[10px] font-semibold text-amber-600" title="The Google Calendar event was deleted directly; this booking was auto-cancelled and the slot freed.">⚠ Calendar deleted externally</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    {booking.status === "calendar_sync_failed" && (
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Retry calendar sync" disabled={busy === booking.id} onClick={() => act(booking.id, onResync)}>
                        {busy === booking.id ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                      </button>
                    )}
                    {!booking.status.startsWith("cancelled") && (
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Reschedule booking" onClick={() => setRescheduling(booking)}>
                        <CalendarDays size={15} />
                      </button>
                    )}
                    {!booking.status.startsWith("cancelled") && (
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" title="Cancel booking" disabled={busy === booking.id} onClick={() => act(booking.id, onCancel)}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">No bookings found.</p>}
        {filtered.map((booking) => (
          <article className="p-4" key={booking.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-ink">{booking.student}</p>
                <p className="mt-1 text-sm font-bold text-brand-700">{booking.time} <span className="font-medium text-slate-500">{booking.date}</span></p>
              </div>
              <StatusBadge status={booking.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div className="min-w-0">
                <dt className="font-bold uppercase tracking-wider text-slate-400">Service</dt>
                <dd className="mt-1 text-sm leading-5 text-slate-700">{booking.service}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-bold uppercase tracking-wider text-slate-400">Center</dt>
                <dd className="mt-1 text-sm leading-5 text-slate-700">{booking.center}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-bold uppercase tracking-wider text-slate-400">Instructor</dt>
                <dd className="mt-1 text-sm leading-5 text-slate-700">{booking.instructor || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-bold uppercase tracking-wider text-slate-400">Reference</dt>
                <dd className="mt-1 truncate font-mono text-sm text-slate-600">{booking.reference}</dd>
              </div>
            </dl>
            {booking.calendarLastError === "event_deleted_externally" && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Calendar event was deleted externally.</p>
            )}
            {!booking.status.startsWith("cancelled") && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                {booking.status === "calendar_sync_failed" ? (
                  <button className="secondary-button col-span-2 min-h-10 px-3 py-2 text-xs text-amber-700" disabled={busy === booking.id} onClick={() => act(booking.id, onResync)}>
                    {busy === booking.id ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Retry calendar sync
                  </button>
                ) : null}
                <button className="secondary-button min-h-10 px-3 py-2 text-xs" onClick={() => setRescheduling(booking)}>
                  <CalendarDays size={15} /> Reschedule
                </button>
                <button className="secondary-button min-h-10 border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50" disabled={busy === booking.id} onClick={() => act(booking.id, onCancel)}>
                  <X size={15} /> Cancel
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
    {creating && (
      <NewBookingModal
        centers={centers}
        services={services}
        onClose={() => setCreating(false)}
        onBooked={() => { setCreating(false); reload(); }}
      />
    )}
    {rescheduling && (
      <RescheduleModal
        booking={rescheduling}
        centers={centers}
        onClose={() => setRescheduling(null)}
        onRescheduled={() => { setRescheduling(null); reload(); }}
      />
    )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Centers                                                                    */
/* -------------------------------------------------------------------------- */

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function CenterModal({ center, onClose, onSaved }: { center: Center | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(center?.name || "");
  const [slug, setSlug] = useState(center?.slug || "");
  const [address, setAddress] = useState(center?.address || "");
  const [timezone, setTimezone] = useState(center?.timezone || "America/Montreal");
  const [enabled, setEnabled] = useState(center?.enabled ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError("");
    setSaving(true);
    const payload = { name, slug: slug || slugify(name), address, timezone, enabled };
    try {
      if (center) await adminApi.updateCenter(center.id, payload);
      else await adminApi.createCenter(payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={center ? `Edit ${center.name}` : "Add center"}
      onClose={onClose}
      footer={<>
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={saving || name.length < 2} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Save center</button>
      </>}
    >
      {error && <Banner kind="error" message={error} onClose={() => setError("")} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Center name"><input className="field" value={name} onChange={(event) => { setName(event.target.value); if (!center && !slug) setSlug(slugify(event.target.value)); }} /></Field>
        {center
          ? <ReadonlySlug label="Slug (URL) · locked" value={slug} />
          : <Field label="Slug (URL)"><input className="field" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="laval" /></Field>}
        <label className="block sm:col-span-2"><span className="label">Address</span><input className="field" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <Field label="Timezone"><input className="field" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
        <Field label="Status">
          <select className="field" value={enabled ? "1" : "0"} onChange={(event) => setEnabled(event.target.value === "1")}>
            <option value="1">Open / enabled</option>
            <option value="0">Closed / disabled</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function CentersScreen({ centers, bookings, groups, resources, reload, toast }: { centers: Center[]; bookings: AdminBooking[]; groups: ResourceGroup[]; resources: AdminResource[]; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [editing, setEditing] = useState<Center | null | "new">(null);
  const today = montrealToday();
  const { confirm, dialog } = useConfirm();

  const remove = async (center: Center) => {
    if (!await confirm(`Delete ${center.name}? This cannot be undone.`)) return;
    try {
      await adminApi.deleteCenter(center.id);
      toast.show("success", `${center.name} deleted.`);
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {centers.map((center) => {
          const todays = bookings.filter((booking) => booking.center === center.name && bookingDate(booking) === today).length;
          const centerGroups = groups.filter((group) => group.center_id === center.id);
          const instructorCount = resources.filter((r) => r.type === "instructor" && centerGroups.some((g) => g.id === r.group_id)).length;
          const carCapacity = centerGroups.filter((g) => g.type === "cars").reduce((sum, g) => sum + g.capacity, 0);
          return (
            <div className="card p-5" key={center.id}>
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><MapPin size={21} /></div>
                <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold", center.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{center.enabled ? "Open" : "Closed"}</span>
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-ink">{center.name}</h3>
              <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{center.address || "No address set"}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-xs">
                <div><p className="text-slate-400">Today</p><p className="mt-1 font-extrabold text-ink">{todays} bookings</p></div>
                <div><p className="text-slate-400">Instructors</p><p className="mt-1 font-extrabold text-ink">{instructorCount}</p></div>
                <div><p className="text-slate-400">Cars</p><p className="mt-1 font-extrabold text-ink">{carCapacity}</p></div>
              </div>
              <div className="mt-5 flex gap-2">
                <button className="secondary-button flex-1 min-h-10 py-2" onClick={() => setEditing(center)}>Edit</button>
                <button className="grid min-h-10 w-11 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={() => remove(center)}><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
        <button className="grid min-h-64 place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 text-slate-500 transition hover:border-brand-300 hover:text-brand-600" onClick={() => setEditing("new")}>
          <span className="text-center"><Plus className="mx-auto" size={24} /><span className="mt-2 block text-sm font-bold">Add center</span></span>
        </button>
      </div>
      {editing && <CenterModal center={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.show("success", "Center saved."); reload(); }} />}
      {dialog}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

const RESOURCE_TYPES = ["cars", "instructors", "seats", "generic"] as const;
type ResourceType = typeof RESOURCE_TYPES[number];

function ServiceModal({ service, initialRequirements, initialCenterIds, centers, forms, onClose, onSaved }: {
  service: Service | null;
  initialRequirements: Array<{ resource_type: string; units: number }>;
  initialCenterIds: string[];
  centers: Center[];
  forms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    slug: service?.slug || "",
    nameEn: service?.name.en || "",
    nameFr: service?.name.fr || "",
    descriptionEn: service?.description.en || "",
    descriptionFr: service?.description.fr || "",
    durationMinutes: service?.durationMinutes ?? 60,
    bufferBeforeMinutes: service?.bufferBeforeMinutes ?? 10,
    bufferAfterMinutes: service?.bufferAfterMinutes ?? 10,
    slotIntervalMinutes: service?.slotIntervalMinutes ?? 30,
    priceDisplay: service?.priceDisplay || "",
    formId: service?.formId || forms[0]?.id || "form_lesson",
    cutoffHours: service?.cutoffHours ?? 2,
    cancellationCutoffHours: service?.cancellationCutoffHours ?? 12,
    baseConcurrency: 4,
    showDuration: service?.showDuration ?? true,
    enabled: service?.enabled ?? true
  });
  const [reqs, setReqs] = useState<Record<ResourceType, number>>(() => {
    const base: Record<ResourceType, number> = { cars: 0, instructors: 0, seats: 0, generic: 0 };
    for (const r of initialRequirements) base[r.resource_type as ResourceType] = r.units;
    return base;
  });
  const [centerIds, setCenterIds] = useState<string[]>(initialCenterIds);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((current) => ({ ...current, [key]: value }));

  const toggleCenter = (id: string) =>
    setCenterIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const save = async () => {
    setError("");
    setSaving(true);
    const payload = { ...v, slug: v.slug || slugify(v.nameEn) };
    try {
      let serviceId: string;
      if (service) {
        await adminApi.updateService(service.id, payload);
        serviceId = service.id;
      } else {
        const created = await adminApi.createService(payload) as { id: string };
        serviceId = created.id;
      }
      const requirements = RESOURCE_TYPES.filter((t) => reqs[t] > 0).map((t) => ({ resource_type: t, units: reqs[t] }));
      await Promise.all([
        adminApi.saveServiceRequirements(serviceId, requirements),
        adminApi.saveServiceCenters(serviceId, centerIds)
      ]);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={service ? `Edit ${service.name.en}` : "Add service"}
      onClose={onClose}
      footer={<>
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={saving || v.nameEn.length < 2} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Save service</button>
      </>}
    >
      {error && <Banner kind="error" message={error} onClose={() => setError("")} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name (English)"><input className="field" value={v.nameEn} onChange={(event) => { set("nameEn", event.target.value); if (!service && !v.slug) set("slug", slugify(event.target.value)); }} /></Field>
        <Field label="Name (French)"><input className="field" value={v.nameFr} onChange={(event) => set("nameFr", event.target.value)} /></Field>
        <label className="block sm:col-span-2"><span className="label">Description (English)</span><textarea className="field" rows={2} value={v.descriptionEn} onChange={(event) => set("descriptionEn", event.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="label">Description (French)</span><textarea className="field" rows={2} value={v.descriptionFr} onChange={(event) => set("descriptionFr", event.target.value)} /></label>
        {service
          ? <ReadonlySlug label="Slug (URL) · locked" value={v.slug} />
          : <Field label="Slug (URL)"><input className="field" value={v.slug} onChange={(event) => set("slug", slugify(event.target.value))} /></Field>}
        <Field label="Price (display)"><input className="field" value={v.priceDisplay} onChange={(event) => set("priceDisplay", event.target.value)} placeholder="$80" /></Field>
        <Field label="Duration (minutes)"><input className="field" type="number" value={v.durationMinutes} onChange={(event) => set("durationMinutes", Number(event.target.value))} /></Field>
        <Field label="Booking form">
          <select className="field" value={v.formId} onChange={(event) => set("formId", event.target.value)}>
            {forms.map((form) => <option value={form.id} key={form.id}>{form.name}</option>)}
          </select>
        </Field>
        <Field label="Buffer before (min)"><input className="field" type="number" value={v.bufferBeforeMinutes} onChange={(event) => set("bufferBeforeMinutes", Number(event.target.value))} /></Field>
        <Field label="Buffer after (min)"><input className="field" type="number" value={v.bufferAfterMinutes} onChange={(event) => set("bufferAfterMinutes", Number(event.target.value))} /></Field>
        <Field label="Booking cutoff (hours)"><input className="field" type="number" value={v.cutoffHours} onChange={(event) => set("cutoffHours", Number(event.target.value))} /></Field>
        <Field label="Cancellation cutoff (hours)"><input className="field" type="number" value={v.cancellationCutoffHours} onChange={(event) => set("cancellationCutoffHours", Number(event.target.value))} /></Field>
        <Field label="Slot interval">
          <select className="field" value={v.slotIntervalMinutes} onChange={(event) => set("slotIntervalMinutes", Number(event.target.value))}>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
            <option value={120}>Every 2 hours</option>
          </select>
        </Field>
        <Field label="Show duration in booking">
          <select className="field" value={v.showDuration ? "1" : "0"} onChange={(event) => set("showDuration", event.target.value === "1")}>
            <option value="1">Show duration</option>
            <option value="0">Hide duration</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <span className="label mb-2 block">Resource requirements</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RESOURCE_TYPES.map((type) => (
              <label key={type} className="block">
                <span className="mb-1 block text-xs capitalize text-slate-500">{type}</span>
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={reqs[type]}
                  onChange={(e) => setReqs((prev) => ({ ...prev, [type]: Math.max(0, Number(e.target.value)) }))}
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Set to 0 to not require that resource type.</p>
        </div>
        <div className="sm:col-span-2">
          <span className="label mb-2 block">Available at centers</span>
          <div className="flex flex-wrap gap-3">
            {centers.map((center) => (
              <label key={center.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={centerIds.includes(center.id)}
                  onChange={() => toggleCenter(center.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="text-sm text-slate-700">{center.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Uncheck a center to hide this service there. Uncheck all to make it available at every center.</p>
        </div>
        <Field label="Status">
          <select className="field" value={v.enabled ? "1" : "0"} onChange={(event) => set("enabled", event.target.value === "1")}>
            <option value="1">Enabled</option>
            <option value="0">Disabled</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function ServicesScreen({ services, centers, forms, requirements, reload, toast }: {
  services: Service[];
  centers: Center[];
  forms: Array<{ id: string; name: string }>;
  requirements: Record<string, Array<{ resource_type: string; units: number }>>;
  reload: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [editing, setEditing] = useState<Service | null | "new">(null);
  const [serviceCenterIds, setServiceCenterIds] = useState<Record<string, string[]>>({});
  const { confirm, dialog } = useConfirm();

  // Local copy of the service order so drag-and-drop feels instant; we persist on
  // drop and reload from the server (which is the source of truth) afterwards.
  const [ordered, setOrdered] = useState<Service[]>(services);
  const [dragId, setDragId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  useEffect(() => { setOrdered(services); }, [services]);

  const handleDrop = async (targetId: string) => {
    const sourceId = dragId;
    setDragId(null);
    if (!sourceId || sourceId === targetId) return;
    const from = ordered.findIndex((s) => s.id === sourceId);
    const to = ordered.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrdered(next);
    setSavingOrder(true);
    try {
      await adminApi.reorderServices(next.map((s) => s.id));
      toast.show("success", "Service order updated.");
      reload();
    } catch (err) {
      setOrdered(services); // revert to last known server order
      toast.show("error", errorMessage(err));
    } finally {
      setSavingOrder(false);
    }
  };

  const loadCenterIds = async (serviceId: string): Promise<string[]> => {
    if (serviceCenterIds[serviceId] !== undefined) return serviceCenterIds[serviceId];
    try {
      const result = await adminApi.serviceCenters(serviceId);
      setServiceCenterIds((prev) => ({ ...prev, [serviceId]: result.centerIds }));
      return result.centerIds;
    } catch {
      setServiceCenterIds((prev) => ({ ...prev, [serviceId]: [] }));
      return [];
    }
  };

  const remove = async (service: Service) => {
    if (!await confirm(`Disable ${service.name.en}?`)) return;
    try {
      await adminApi.deleteService(service.id);
      toast.show("success", "Service disabled.");
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  };

  const requirementLabel = (id: string) => {
    const reqs = requirements[id];
    if (!reqs || reqs.length === 0) return "No resources";
    return reqs.map((req) => `${req.units} ${req.resource_type}`).join(" + ");
  };

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm text-slate-500">Drag to reorder · Configure duration, price, resources and booking rules.</p>
          <button className="primary-button min-h-10 w-full shrink-0 px-4 py-2 sm:w-auto" onClick={() => setEditing("new")}><Plus size={16} /> Add service</button>
        </div>
        <div className="divide-y divide-slate-100">
          {ordered.map((service) => {
            const assignedCenters = (serviceCenterIds[service.id] || [])
              .map((cid) => centers.find((c) => c.id === cid)?.name)
              .filter(Boolean);
            return (
              <div
                className={clsx(
                  "flex flex-col gap-4 p-4 transition sm:flex-row sm:items-center sm:p-5",
                  dragId === service.id && "opacity-40",
                  savingOrder && "pointer-events-none"
                )}
                key={service.id}
                draggable
                onDragStart={() => setDragId(service.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(service.id)}
              >
                <button
                  className="hidden shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing sm:grid sm:place-items-center"
                  aria-label={`Reorder ${service.name.en}`}
                  title="Drag to reorder"
                >
                  <GripVertical size={18} />
                </button>
                <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 sm:grid"><Gauge size={21} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-extrabold text-ink">{service.name.en}</p>
                    <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", service.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{service.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <p className="mt-1 break-words text-xs text-slate-500 sm:truncate">{service.durationMinutes} min · {service.priceDisplay || "no price"} · {service.slug}</p>
                  {assignedCenters.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">{assignedCenters.join(" · ")}</p>
                  )}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 text-xs sm:flex sm:items-center sm:gap-5">
                  <div className="col-span-2 sm:col-span-1"><p className="text-slate-400">Requires</p><p className="mt-1 font-bold capitalize text-ink">{requirementLabel(service.id)}</p></div>
                  <button className="secondary-button min-h-10 px-4 py-2" onClick={async () => { await loadCenterIds(service.id); setEditing(service); }}>Edit</button>
                  <button className="grid min-h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" aria-label={`Disable ${service.name.en}`} onClick={() => remove(service)}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editing && (() => {
        const editingService = editing === "new" ? null : editing;
        return (
          <ServiceModal
            service={editingService}
            initialRequirements={editingService ? (requirements[editingService.id] || []) : []}
            initialCenterIds={editingService ? (serviceCenterIds[editingService.id] || []) : centers.map((c) => c.id)}
            centers={centers}
            forms={forms}
            onClose={() => setEditing(null)}
            onSaved={() => { if (editingService) setServiceCenterIds((prev) => { const next = { ...prev }; delete next[editingService.id]; return next; }); setEditing(null); toast.show("success", "Service saved."); reload(); }}
          />
        );
      })()}
      {dialog}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                  */
/* -------------------------------------------------------------------------- */

function CopyCalendarButton({ calendarId, inline }: { calendarId: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`;
  const copy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  if (inline) {
    return (
      <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
        {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy subscribe link</>}
      </button>
    );
  }
  return (
    <button
      onClick={copy}
      title="Copy subscribe link"
      className="grid min-h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
    >{copied ? <Check size={15} /> : <Copy size={15} />}</button>
  );
}

function InstructorModal({ resource, groups, onClose, onSaved }: { resource: AdminResource | null; groups: ResourceGroup[]; onClose: () => void; onSaved: () => void }) {
  const instructorGroups = groups.filter((group) => group.type === "instructors");
  const [v, setV] = useState({
    name: resource?.name || "",
    email: resource?.email || "",
    phone: resource?.phone || "",
    calendarId: resource?.calendar_id || "",
    groupId: resource?.group_id || instructorGroups[0]?.id || "",
    centerId: resource?.center_id || instructorGroups[0]?.center_id || "",
    enabled: resource ? Boolean(resource.enabled) : true
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setError("");
    setSaving(true);
    const group = instructorGroups.find((item) => item.id === v.groupId);
    const payload = {
      type: "instructor", name: v.name, email: v.email, phone: v.phone, calendarId: v.calendarId,
      groupId: v.groupId, centerId: group?.center_id || v.centerId, enabled: v.enabled, publicVisible: false
    };
    try {
      if (resource) await adminApi.updateResource(resource.id, payload);
      else await adminApi.createResource(payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={resource ? `Edit ${resource.name}` : "Add instructor"}
      onClose={onClose}
      footer={<>
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={saving || v.name.length < 2 || !v.groupId} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Save instructor</button>
      </>}
    >
      {error && <Banner kind="error" message={error} onClose={() => setError("")} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name"><input className="field" value={v.name} onChange={(event) => set("name", event.target.value)} /></Field>
        <Field label="Center / group">
          <select className="field" value={v.groupId} onChange={(event) => set("groupId", event.target.value)}>
            {instructorGroups.map((group) => <option value={group.id} key={group.id}>{group.center_name} — {group.name}</option>)}
          </select>
        </Field>
        <Field label="Email"><input className="field" type="email" value={v.email} onChange={(event) => set("email", event.target.value)} /></Field>
        <Field label="Phone"><input className="field" value={v.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
        <div className="sm:col-span-2 space-y-1.5">
          <label className="block"><span className="label">Google Calendar ID</span><input className="field font-mono text-xs" value={v.calendarId} onChange={(event) => set("calendarId", event.target.value)} placeholder="instructor@group.calendar.google.com" /></label>
          {v.calendarId && <CopyCalendarButton calendarId={v.calendarId} inline />}
        </div>
        <Field label="Status">
          <select className="field" value={v.enabled ? "1" : "0"} onChange={(event) => set("enabled", event.target.value === "1")}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function ResourcesScreen({ resources, groups, centers, reload, toast }: { resources: AdminResource[]; groups: ResourceGroup[]; centers: Center[]; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [editing, setEditing] = useState<AdminResource | null | "new">(null);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const instructors = resources.filter((resource) => resource.type === "instructor");
  const carGroups = groups.filter((group) => group.type === "cars");
  // Group instructors by center using their group's center_id.
  const centerList = centers.length > 0 ? centers : [...new Map(groups.map((g) => [g.center_id, { id: g.center_id, name: g.center_name }])).values()];
  const instructorsByCenter = centerList.map((center) => ({
    center,
    instructors: instructors.filter((r) => {
      const grp = groups.find((g) => g.id === r.group_id);
      return grp?.center_id === center.id;
    })
  })).filter((entry) => entry.instructors.length > 0);

  const updateCapacity = async (group: ResourceGroup, capacity: number) => {
    setSavingGroup(group.id);
    try {
      await adminApi.updateResourceGroup(group.id, { capacity });
      toast.show("success", `${group.name} capacity set to ${capacity}.`);
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSavingGroup(null);
    }
  };

  const remove = async (resource: AdminResource) => {
    if (!await confirm(`Remove ${resource.name}?`)) return;
    try {
      await adminApi.deleteResource(resource.id);
      toast.show("success", "Instructor removed.");
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Instructors (named)</h2>
          <button className="primary-button min-h-10 w-full px-3 py-2 text-xs sm:w-auto" onClick={() => setEditing("new")}><Plus size={15} /> Add instructor</button>
        </div>
        {instructorsByCenter.length > 0 ? instructorsByCenter.map(({ center, instructors: centerInstructors }) => (
          <div key={center.id} className="mb-6">
            <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">{center.name}</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {centerInstructors.map((resource) => (
                <div className="card p-5" key={resource.id}>
                  <div className="flex items-start justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600"><UserRound size={21} /></div>
                    <span className={clsx("h-2.5 w-2.5 rounded-full ring-4", resource.enabled ? "bg-emerald-500 ring-emerald-50" : "bg-slate-300 ring-slate-100")} />
                  </div>
                  <h3 className="mt-4 font-extrabold text-ink">{resource.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">Instructor</p>
                  <p className="mt-4 truncate rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-600">{resource.calendar_id || "No Google Calendar set"}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="secondary-button flex-1 min-h-10 py-2" onClick={() => setEditing(resource)}>Manage</button>
                    {resource.calendar_id && (
                      <CopyCalendarButton calendarId={resource.calendar_id} />
                    )}
                    <button className="grid min-h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={() => remove(resource)}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {instructors.map((resource) => {
              const group = groups.find((item) => item.id === resource.group_id);
              return (
                <div className="card p-5" key={resource.id}>
                  <div className="flex items-start justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600"><UserRound size={21} /></div>
                    <span className={clsx("h-2.5 w-2.5 rounded-full ring-4", resource.enabled ? "bg-emerald-500 ring-emerald-50" : "bg-slate-300 ring-slate-100")} />
                  </div>
                  <h3 className="mt-4 font-extrabold text-ink">{resource.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">Instructor · {group?.center_name}</p>
                  <p className="mt-4 truncate rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-600">{resource.calendar_id || "No Google Calendar set"}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="secondary-button flex-1 min-h-10 py-2" onClick={() => setEditing(resource)}>Manage</button>
                    {resource.calendar_id && (
                      <CopyCalendarButton calendarId={resource.calendar_id} />
                    )}
                    <button className="grid min-h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={() => remove(resource)}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Cars (pooled capacity)</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {carGroups.map((group) => (
            <div className="card p-5" key={group.id}>
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><CarFront size={21} /></div>
                <span className="text-xs font-bold text-slate-400">{group.center_name}</span>
              </div>
              <h3 className="mt-4 font-extrabold text-ink">{group.name}</h3>
              <p className="mt-1 text-xs text-slate-500">Pooled cars available for concurrent bookings</p>
              <div className="mt-4 flex items-center gap-3">
                <input className="field w-24" type="number" min="0" defaultValue={group.capacity} key={group.capacity}
                  onBlur={(event) => { const next = Number(event.target.value); if (next !== group.capacity) updateCapacity(group, next); }} />
                <span className="text-sm font-semibold text-slate-500">cars</span>
                {savingGroup === group.id && <LoaderCircle className="animate-spin text-brand-500" size={16} />}
              </div>
            </div>
          ))}
        </div>
      </section>
      {editing && <InstructorModal resource={editing === "new" ? null : editing} groups={groups} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.show("success", "Instructor saved."); reload(); }} />}
      {dialog}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Availability (business hours)                                              */
/* -------------------------------------------------------------------------- */

interface DayHours { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }

function AvailabilityScreen({ centers, services, groups, toast }: { centers: Center[]; services: Service[]; groups: ResourceGroup[]; toast: ReturnType<typeof useToast> }) {
  const [centerId, setCenterId] = useState(centers[0]?.id || "");
  const [hours, setHours] = useState<DayHours[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // School closures state — shows all centers' closures
  const [closures, setClosures] = useState<Array<Record<string, string>>>([]);
  const [closureStart, setClosureStart] = useState("");
  const [closureEnd, setClosureEnd] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [closureCenterIds, setClosureCenterIds] = useState<string[]>([]);
  const [addingClosure, setAddingClosure] = useState(false);

  useEffect(() => { if (!centerId && centers[0]) setCenterId(centers[0].id); }, [centers, centerId]);
  // Default closure centers to all centers when centers load
  useEffect(() => { if (centers.length && closureCenterIds.length === 0) setClosureCenterIds(centers.map((c) => c.id)); }, [centers]);

  const loadClosures = useCallback(() => {
    adminApi.overrides().then((result) => {
      setClosures(result.overrides.filter((o) => o.type === "center_closed"));
    }).catch(() => undefined);
  }, []);

  useEffect(() => { loadClosures(); }, [loadClosures]);

  const addClosure = async () => {
    if (!closureStart || !closureEnd) { toast.show("error", "Select a start and end date."); return; }
    if (closureEnd < closureStart) { toast.show("error", "End date must be after start date."); return; }
    if (closureCenterIds.length === 0) { toast.show("error", "Select at least one center."); return; }
    setAddingClosure(true);
    try {
      await Promise.all(closureCenterIds.map((cid) => adminApi.createOverride({
        centerId: cid,
        type: "center_closed",
        startAt: new Date(`${closureStart}T00:00:00`).toISOString(),
        endAt: new Date(`${closureEnd}T23:59:59`).toISOString(),
        reason: closureReason || undefined
      })));
      setClosureStart("");
      setClosureEnd("");
      setClosureReason("");
      loadClosures();
      toast.show("success", `Closure added for ${closureCenterIds.length === centers.length ? "all centers" : `${closureCenterIds.length} center(s)`}.`);
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setAddingClosure(false);
    }
  };

  const removeClosure = async (id: string) => {
    try {
      await adminApi.deleteOverride(id);
      setClosures((current) => current.filter((c) => c.id !== id));
      toast.show("success", "Closure removed.");
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  };

  const toggleClosureCenter = (id: string) =>
    setClosureCenterIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const toggleAllClosureCenters = () =>
    setClosureCenterIds((prev) => prev.length === centers.length ? [] : centers.map((c) => c.id));

  useEffect(() => {
    if (!centerId) return;
    setLoading(true);
    adminApi.centerHours(centerId).then((result) => {
      const byDay = new Map(result.hours.map((row) => [row.day_of_week, row]));
      setHours(Array.from({ length: 7 }, (_, day) => {
        const existing = byDay.get(day);
        return existing
          ? { dayOfWeek: day, startTime: existing.start_time, endTime: existing.end_time, enabled: true }
          : { dayOfWeek: day, startTime: "08:00", endTime: "18:00", enabled: false };
      }));
    }).catch(() => toast.show("error", "Could not load business hours.")).finally(() => setLoading(false));
  }, [centerId, toast]);

  const update = (day: number, patch: Partial<DayHours>) =>
    setHours((current) => current.map((row) => row.dayOfWeek === day ? { ...row, ...patch } : row));

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.saveCenterHours(centerId, hours);
      toast.show("success", "Business hours saved.");
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold text-ink">Business hours</h2>
            <p className="mt-1 text-xs text-slate-500">Set open hours per weekday. Availability is generated only inside these windows.</p>
          </div>
          <select className="field max-w-xs" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
            {centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}
          </select>
        </div>
        {loading ? <div className="p-6"><div className="skeleton h-64 rounded-xl" /></div> : (
          <div className="divide-y divide-slate-100">
            {hours.map((row) => (
              <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:flex sm:items-center sm:gap-4 sm:px-5 sm:py-3" key={row.dayOfWeek}>
                <label className="col-span-2 flex items-center gap-3 sm:w-40">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={row.enabled} onChange={(event) => update(row.dayOfWeek, { enabled: event.target.checked })} />
                  <span className="text-sm font-bold text-ink">{WEEKDAYS[row.dayOfWeek]}</span>
                </label>
                <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:contents">
                  <input type="time" className="field min-w-0 px-2 disabled:opacity-40 sm:max-w-[140px] sm:px-4" disabled={!row.enabled} value={row.startTime} onChange={(event) => update(row.dayOfWeek, { startTime: event.target.value })} />
                  <span className="text-sm text-slate-400">to</span>
                  <input type="time" className="field min-w-0 px-2 disabled:opacity-40 sm:max-w-[140px] sm:px-4" disabled={!row.enabled} value={row.endTime} onChange={(event) => update(row.dayOfWeek, { endTime: event.target.value })} />
                </div>
                {!row.enabled && <span className="col-span-2 text-xs font-semibold text-slate-400 sm:col-span-1">Closed</span>}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end border-t border-slate-100 p-4 sm:p-5">
          <button className="primary-button w-full sm:w-auto" disabled={saving || loading} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Save business hours</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-extrabold text-ink">School closures</h2>
          <p className="mt-1 text-xs text-slate-500">Block entire date ranges across one or more centers — no availability will be shown to students during these periods.</p>
        </div>

        <div className="divide-y divide-slate-100">
          {closures.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-slate-400">No closures scheduled.</p>
          )}
          {closures.map((closure) => {
            const start = new Date(closure.start_at);
            const end = new Date(closure.end_at);
            const fmt = (d: Date) => d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
            const isSameDay = start.toDateString() === end.toDateString();
            const centerName = centers.find((c) => c.id === closure.center_id)?.name;
            return (
              <div className="flex items-center gap-4 px-5 py-4" key={closure.id}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-ink">{isSameDay ? fmt(start) : `${fmt(start)} – ${fmt(end)}`}</p>
                    {centerName && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{centerName}</span>}
                  </div>
                  {closure.reason && <p className="mt-0.5 text-xs text-slate-500">{closure.reason}</p>}
                </div>
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeClosure(closure.id)}><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-100 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Add closure</p>
          <div className="mb-3">
            <p className="label mb-1.5">Apply to centers</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={closureCenterIds.length === centers.length}
                  onChange={toggleAllClosureCenters} />
                <span className="text-sm font-semibold text-slate-700">All centers</span>
              </label>
              {centers.map((center) => (
                <label key={center.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    checked={closureCenterIds.includes(center.id)}
                    onChange={() => toggleClosureCenter(center.id)} />
                  <span className="text-sm text-slate-700">{center.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <label className="label">From</label>
              <input type="date" className="field" value={closureStart} onChange={(e) => setClosureStart(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="field" value={closureEnd} min={closureStart} onChange={(e) => setClosureEnd(e.target.value)} />
            </div>
            <div>
              <label className="label">Reason (optional)</label>
              <input className="field" placeholder="e.g. Spring break" value={closureReason} onChange={(e) => setClosureReason(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button className="primary-button w-full" disabled={addingClosure || !closureStart || !closureEnd || closureCenterIds.length === 0} onClick={addClosure}>
                {addingClosure ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {[
          { title: "Services", value: services.filter((s) => s.enabled).length, note: "enabled services", Icon: Gauge },
          { title: "Car pools", value: groups.filter((g) => g.type === "cars").length, note: `${groups.filter((g) => g.type === "cars").reduce((sum, g) => sum + g.capacity, 0)} cars total`, Icon: CircleGauge },
          { title: "Instructor groups", value: groups.filter((g) => g.type === "instructors").length, note: `${groups.filter((g) => g.type === "instructors").reduce((sum, g) => sum + g.member_count, 0)} instructors`, Icon: Clock3 }
        ].map(({ title, value, note, Icon }) => (
          <div className="card p-5" key={title}>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon size={21} /></div>
            <h3 className="mt-4 font-extrabold text-ink">{title}</h3>
            <p className="mt-2 text-3xl font-extrabold text-ink">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form builder                                                               */
/* -------------------------------------------------------------------------- */

const FIELD_TYPES: FormField["type"][] = ["text", "textarea", "email", "phone", "select", "radio", "checkbox", "date", "time", "datetime", "number", "consent"];

function FormBuilderScreen({ forms, reload, toast }: { forms: Array<{ id: string; name: string; active_version: number }>; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [selectedId, setSelectedId] = useState(forms[0]?.id || "");
  const [schema, setSchema] = useState<BookingForm | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (!selectedId && forms[0]) setSelectedId(forms[0].id); }, [forms, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    adminApi.form(selectedId).then((result) => { setSchema(result.schema); setName(result.name); })
      .catch(() => toast.show("error", "Could not load form.")).finally(() => setLoading(false));
  }, [selectedId, toast]);

  const updateField = (id: string, patch: Partial<FormField>) =>
    setSchema((current) => current ? { ...current, fields: current.fields.map((field) => field.id === id ? { ...field, ...patch } : field) } : current);

  const removeField = (id: string) =>
    setSchema((current) => current ? { ...current, fields: current.fields.filter((field) => field.id !== id) } : current);

  const moveField = (index: number, direction: -1 | 1) =>
    setSchema((current) => {
      if (!current) return current;
      const next = [...current.fields];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, fields: next };
    });

  const addField = () =>
    setSchema((current) => current ? {
      ...current,
      fields: [...current.fields, {
        id: `fld_${crypto.randomUUID().slice(0, 8)}`,
        key: `field_${current.fields.length + 1}`,
        type: "text",
        label: { en: "New field", fr: "Nouveau champ" },
        required: false,
        retentionCategory: "operational"
      }]
    } : current);

  const createForm = async () => {
    const trimmed = newFormName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const emptySchema: BookingForm = { id: `form_${crypto.randomUUID().slice(0, 8)}`, name: trimmed, version: 1, fields: [] };
      const result = await adminApi.createForm({ name: trimmed, schema: emptySchema });
      await reload();
      setSelectedId(result.id);
      setShowAddDialog(false);
      setNewFormName("");
      toast.show("success", `Form "${trimmed}" created.`);
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const publish = async () => {
    if (!schema) return;
    setSaving(true);
    try {
      const result = await adminApi.publishForm(selectedId, { name, schema });
      toast.show("success", `Published version ${result.version}.`);
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="card h-fit p-4">
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Forms</p>
          <button className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Add form" onClick={() => { setNewFormName(""); setShowAddDialog(true); }}><Plus size={14} /></button>
        </div>
        {forms.map((form) => (
          <button className={clsx("mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm font-bold", form.id === selectedId ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50")} key={form.id} onClick={() => setSelectedId(form.id)}>
            <FileText size={17} /> <span className="flex-1 truncate">{form.name}</span> <span className="text-[10px] text-slate-400">v{form.active_version}</span>
          </button>
        ))}
      </div>
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-extrabold text-ink">New form</h2>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Form name</label>
            <input
              className="field w-full"
              placeholder="e.g. Motorcycle lesson"
              value={newFormName}
              onChange={(e) => setNewFormName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createForm(); if (e.key === "Escape") setShowAddDialog(false); }}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={() => setShowAddDialog(false)}>Cancel</button>
              <button className="primary-button px-4 py-2 text-sm" disabled={!newFormName.trim() || creating} onClick={createForm}>
                {creating && <LoaderCircle className="mr-1 inline animate-spin" size={14} />} Create
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card min-w-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 flex-1">
            <input className="w-full border-0 bg-transparent text-lg font-extrabold text-ink focus:outline-none" value={name} onChange={(event) => setName(event.target.value)} />
            <p className="mt-1 text-xs text-slate-500">{schema?.fields.length || 0} fields · publishing creates a new version</p>
          </div>
          <button className="primary-button min-h-10 w-full shrink-0 px-4 py-2 sm:w-auto" disabled={saving || loading || !schema} onClick={publish}>{saving && <LoaderCircle className="animate-spin" size={16} />} Publish changes</button>
        </div>
        {loading || !schema ? <div className="p-4 sm:p-5"><div className="skeleton h-72 rounded-xl" /></div> : (
          <div className="space-y-3 bg-slate-50/60 p-3 sm:p-5">
            {schema.fields.map((field, index) => (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={field.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex items-center justify-between text-slate-300 sm:flex-col sm:gap-1 sm:pt-1">
                    <button className="hover:text-slate-600 disabled:opacity-30" disabled={index === 0} onClick={() => moveField(index, -1)}>▲</button>
                    <GripVertical size={14} />
                    <button className="hover:text-slate-600 disabled:opacity-30" disabled={index === schema.fields.length - 1} onClick={() => moveField(index, 1)}>▼</button>
                  </div>
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Label (EN)</span><input className="field py-2" value={field.label.en} onChange={(event) => updateField(field.id, { label: { ...field.label, en: event.target.value } })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Label (FR)</span><input className="field py-2" value={field.label.fr} onChange={(event) => updateField(field.id, { label: { ...field.label, fr: event.target.value } })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Key</span><input className="field py-2 font-mono text-xs" value={field.key} onChange={(event) => updateField(field.id, { key: event.target.value })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Type</span>
                      <select className="field py-2" value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as FormField["type"] })}>
                        {FIELD_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
                      </select>
                    </label>
                  </div>
                  <button className="absolute right-5 mt-0 hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 sm:static sm:grid" onClick={() => removeField(field.id)}><Trash2 size={15} /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> Required</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={Boolean(field.calendarVisible)} onChange={(event) => updateField(field.id, { calendarVisible: event.target.checked })} /> Show on Calendar event</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={Boolean(field.adminListVisible)} onChange={(event) => updateField(field.id, { adminListVisible: event.target.checked })} /> Show in admin list</label>
                  <button className="ml-auto inline-flex items-center gap-1.5 font-bold text-red-600 sm:hidden" onClick={() => removeField(field.id)}><Trash2 size={14} /> Remove</button>
                </div>
              </div>
            ))}
            <button className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-white py-4 text-sm font-bold text-slate-500 hover:border-brand-300 hover:text-brand-600" onClick={addField}><Plus className="mr-2 inline" size={16} />Add field</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

function CalendarScreen({ centers, services, resources, mappings, connections, reload, toast }: {
  centers: Center[];
  services: Service[];
  resources: AdminResource[];
  mappings: CalendarMapping[];
  connections: Array<Record<string, string>>;
  reload: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [available, setAvailable] = useState<Array<{ id: string; summary: string }> | null>(null);
  const [listing, setListing] = useState(false);
  const [mappingType, setMappingType] = useState("center");
  const [mappingId, setMappingId] = useState(centers[0]?.id || "");
  const [calendarId, setCalendarId] = useState("");
  const [saving, setSaving] = useState(false);
  const connection = connections[0];

  const [titleTemplate, setTitleTemplate] = useState("");
  const [descriptionTemplate, setDescriptionTemplate] = useState("");
  const [descriptionTemplateFr, setDescriptionTemplateFr] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    adminApi.calendarTemplate()
      .then((result) => {
        setTitleTemplate(result.template.title_template || "");
        setDescriptionTemplate(result.template.description_template || "");
        setDescriptionTemplateFr(result.template.description_template_fr || "");
      })
      .catch(() => undefined);
    if (connection) {
      adminApi.calendarList()
        .then((result) => setAvailable(result.calendars))
        .catch(() => undefined);
    }
  }, [connection]);

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await adminApi.saveCalendarTemplate({
        titleTemplate: titleTemplate.trim() || null,
        descriptionTemplate: descriptionTemplate.trim() || null,
        descriptionTemplateFr: descriptionTemplateFr.trim() || null
      });
      toast.show("success", "Calendar event template saved.");
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSavingTemplate(false);
    }
  };

  const loadCalendars = async () => {
    setListing(true);
    try {
      const result = await adminApi.calendarList();
      setAvailable(result.calendars);
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setListing(false);
    }
  };

  const targets = mappingType === "center" ? centers.map((c) => ({ id: c.id, name: c.name })) : services.map((s) => ({ id: s.id, name: s.name.en }));

  const addMapping = async () => {
    if (!calendarId) { toast.show("error", "Enter or pick a calendar ID."); return; }
    setSaving(true);
    try {
      await adminApi.createMapping({
        centerId: mappingType === "center" ? mappingId : centers[0]?.id,
        mappingType, mappingId, calendarId, eventRole: "canonical"
      });
      toast.show("success", "Calendar mapping created.");
      setCalendarId("");
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeMapping = async (id: string) => {
    try {
      await adminApi.deleteMapping(id);
      toast.show("success", "Mapping removed.");
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600"><CalendarDays size={24} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-extrabold text-ink">{connection ? "Google Calendar connected" : "Google Calendar not connected"}</h2>
                {connection && <StatusBadge status={connection.status === "connected" ? "confirmed" : "calendar_sync_failed"} />}
              </div>
              <p className="mt-1 text-sm text-slate-500">{connection ? `${connection.google_email} · ${connection.status}` : "Connect an owner Google account to enable Calendar sync."}</p>
            </div>
          </div>
          {!connection && (
            <a className="primary-button mt-5" href="/api/admin/calendar/connect"><Link2 size={16} /> Connect Google account</a>
          )}
          {connection && (
            <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <button className="secondary-button" disabled={listing} onClick={loadCalendars}>{listing ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />} Load available calendars</button>
              <a className="secondary-button" href="/api/admin/calendar/connect"><Link2 size={16} /> Reconnect / reauthorise</a>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5"><h2 className="font-extrabold text-ink">Canonical mappings</h2><p className="mt-1 text-xs text-slate-500">Each center or service needs one canonical calendar for student-facing events.</p></div>
          <div className="divide-y divide-slate-100">
            {mappings.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No mappings yet. Add one below.</p>}
            {mappings.map((mapping) => (
              <div className="flex items-center gap-3 px-5 py-4" key={mapping.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{mapping.center_name || mapping.service_name || mapping.mapping_id} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">{mapping.mapping_type}</span></p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-400">{mapping.calendar_id}</p>
                </div>
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeMapping(mapping.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Add mapping</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="field" value={mappingType} onChange={(event) => { setMappingType(event.target.value); setMappingId(event.target.value === "center" ? centers[0]?.id : services[0]?.id); }}>
                <option value="center">Center</option>
                <option value="service">Service</option>
              </select>
              <select className="field" value={mappingId} onChange={(event) => setMappingId(event.target.value)}>
                {targets.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}
              </select>
              {available ? (
                <select className="field sm:col-span-2" value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>
                  <option value="">Select a calendar…</option>
                  {available.map((cal) => <option value={cal.id} key={cal.id}>{cal.summary} ({cal.id})</option>)}
                </select>
              ) : (
                <input className="field font-mono text-xs sm:col-span-2" placeholder="calendar-id@group.calendar.google.com" value={calendarId} onChange={(event) => setCalendarId(event.target.value)} />
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button className="primary-button min-h-10 w-full px-4 py-2 sm:w-auto" disabled={saving || !mappingId} onClick={addMapping}>{saving && <LoaderCircle className="animate-spin" size={16} />} Add mapping</button>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-extrabold text-ink">Event template</h2>
            <p className="mt-1 text-xs text-slate-500">
              Customize the title and description of created calendar events (and the student's invite email).
              Leave a field blank to use the built-in default. Placeholders:
              <span className="font-mono"> {"{service} {serviceDescription} {center} {reference} {student} {price} {manageUrl} {visibleFields}"}</span>
            </p>
          </div>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="label">Title template</span>
              <input
                className="field font-mono text-xs"
                value={titleTemplate}
                onChange={(event) => setTitleTemplate(event.target.value)}
                placeholder="{service} - {center} - Booking {reference}"
              />
            </label>
            <label className="block">
              <span className="label">Description template (EN)</span>
              <textarea
                className="field min-h-32 font-mono text-xs"
                value={descriptionTemplate}
                onChange={(event) => setDescriptionTemplate(event.target.value)}
                placeholder={"Booking reference: {reference}\nStudent: {student}\nService: {service}\nCenter: {center}\n{visibleFields}\nManage or cancel: {manageUrl}"}
              />
            </label>
            <label className="block">
              <span className="label">Description template (FR)</span>
              <textarea
                className="field min-h-32 font-mono text-xs"
                value={descriptionTemplateFr}
                onChange={(event) => setDescriptionTemplateFr(event.target.value)}
                placeholder={"Référence de réservation : {reference}\nÉtudiant : {student}\nService : {service}\nCentre : {center}\n{visibleFields}\nGérer ou annuler : {manageUrl}"}
              />
            </label>
            <div className="flex justify-end">
              <button className="primary-button min-h-10 w-full px-4 py-2 sm:w-auto" disabled={savingTemplate} onClick={saveTemplate}>
                {savingTemplate && <LoaderCircle className="animate-spin" size={16} />} Save template
              </button>
            </div>
          </div>
        </div>

        <ResourceCalendarSection resources={resources} available={available} reload={reload} toast={toast} />
      </div>
      <div className="rounded-2xl bg-ink p-6 text-white shadow-soft">
        <CalendarDays className="text-brand-300" size={27} />
        <h3 className="mt-5 text-xl font-extrabold">Availability stays where your team works.</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">Instructors block personal time directly in Google Calendar. The booking app checks FreeBusy before showing and confirming every slot.</p>
        <div className="mt-5 space-y-3 text-xs text-slate-200">
          {["No instructor dashboard required", "Live conflict checks", "Student invite from one canonical event"].map((item) => <p className="flex items-center gap-2" key={item}><Check className="text-emerald-400" size={15} /> {item}</p>)}
        </div>
      </div>
    </div>
  );
}

function ResourceCalendarSection({ resources, available, reload, toast }: {
  resources: AdminResource[];
  available: Array<{ id: string; summary: string }> | null;
  reload: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const named = resources.filter((r) => r.type === "instructor" || r.type === "vehicle");
  const [saving, setSaving] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(named.map((r) => [r.id, r.calendar_id || ""]))
  );

  const save = async (resource: AdminResource) => {
    setSaving(resource.id);
    try {
      await adminApi.updateResource(resource.id, {
        type: resource.type, name: resource.name, email: resource.email || "", phone: resource.phone || "",
        calendarId: selections[resource.id] || null,
        groupId: resource.group_id, centerId: resource.center_id,
        enabled: Boolean(resource.enabled), publicVisible: Boolean(resource.public_visible)
      });
      toast.show("success", `Calendar updated for ${resource.name}.`);
      reload();
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  if (named.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <h2 className="font-extrabold text-ink">Instructor &amp; vehicle calendars</h2>
        <p className="mt-1 text-xs text-slate-500">Assign a Google Calendar to each instructor or vehicle. The app writes blocking events here and checks FreeBusy against it.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {named.map((resource) => (
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5" key={resource.id}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{resource.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">{resource.type}</span></p>
              {available ? (
                <select
                  className="field mt-2 text-xs"
                  value={selections[resource.id] || ""}
                  onChange={(e) => setSelections((prev) => ({ ...prev, [resource.id]: e.target.value }))}
                >
                  <option value="">— no calendar —</option>
                  {available.map((cal) => <option key={cal.id} value={cal.id}>{cal.summary}</option>)}
                </select>
              ) : (
                <p className="mt-1 truncate font-mono text-xs text-slate-400">{resource.calendar_id || "No calendar set — load calendars above to assign"}</p>
              )}
            </div>
            {available && (
              <button
                className="primary-button min-h-10 w-full shrink-0 px-3 py-1.5 text-xs sm:w-auto"
                disabled={saving === resource.id}
                onClick={() => save(resource)}
              >
                {saving === resource.id ? <LoaderCircle className="animate-spin" size={14} /> : "Save"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Privacy & retention                                                        */
/* -------------------------------------------------------------------------- */

function PrivacyScreen({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [days, setDays] = useState(90);
  const [lastJob, setLastJob] = useState<{ status: string; records_anonymized: number; completed_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.retention().then((result) => {
      if (result.settings) setDays(result.settings.retention_days);
      setLastJob(result.lastJob);
    }).catch(() => toast.show("error", "Could not load retention settings.")).finally(() => setLoading(false));
  }, [toast]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.saveRetention(days);
      toast.show("success", "Retention settings saved.");
    } catch (err) {
      toast.show("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h2 className="font-extrabold text-ink">Student data retention</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Automatically anonymize contact details and form answers after a booking is complete.</p>
        <label className="mt-6 block">
          <span className="label">Retention period</span>
          <select className="field" value={days} disabled={loading} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={90}>90 days after appointment</option>
            <option value={60}>60 days after appointment</option>
            <option value={30}>30 days after appointment</option>
          </select>
        </label>
        <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><strong>Protected:</strong> booking reference, service, center, date, status and anonymous reporting remain available.</div>
        <button className="primary-button mt-5" disabled={saving || loading} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Save retention settings</button>
      </div>
      <div className="card p-6">
        <h2 className="font-extrabold text-ink">Scheduled cleanup</h2>
        <p className="mt-2 text-sm text-slate-500">Runs daily via the Worker cron (America/Montreal).</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Last run</p><p className="mt-1 font-extrabold capitalize text-ink">{lastJob?.status || "Never"}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Records cleaned</p><p className="mt-1 font-extrabold text-ink">{lastJob?.records_anonymized ?? 0}</p></div>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">Google Calendar may retain limited operational details. Event titles never include phone numbers or full student contact information.</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sign-in gate                                                               */
/* -------------------------------------------------------------------------- */

function SignIn({ devLoginAvailable, onDevLogin }: { devLoginAvailable: boolean; onDevLogin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dev = async () => {
    setBusy(true);
    setError("");
    try { await onDevLogin(); } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-cream p-6">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex justify-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white"><Gauge size={28} /></div></div>
        <h1 className="text-center text-2xl font-extrabold text-ink">Easy Driving Operations</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Sign in to manage centers, services and bookings.</p>
        {error && <div className="mt-5"><Banner kind="error" message={error} /></div>}
        <a className="primary-button mt-7 w-full" href="/api/auth/google/start"><LogIn size={17} /> Sign in with Google</a>
        {devLoginAvailable && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-300"><span className="h-px flex-1 bg-slate-200" /> Local dev <span className="h-px flex-1 bg-slate-200" /></div>
            <button className="secondary-button w-full" disabled={busy} onClick={dev}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <UserRound size={17} />} Developer sign-in (local)</button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">Available because Google OAuth is not configured. This button disappears automatically once you set <span className="font-mono">GOOGLE_CLIENT_ID</span> in production.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Root                                                                       */
/* -------------------------------------------------------------------------- */

export default function AdminPortal() {
  const sectionFromPath = (): AdminSection => window.location.pathname.startsWith("/admin/docs") ? "docs" : "dashboard";
  const [section, setSection] = useState<AdminSection>(sectionFromPath);
  const [mobileNav, setMobileNav] = useState(false);
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [devAvailable, setDevAvailable] = useState(false);
  const [user, setUser] = useState<AdminUser>({ name: "", email: "", role: "owner" });

  // Shared data
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [overrides, setOverrides] = useState<Array<Record<string, string>>>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [forms, setForms] = useState<Array<{ id: string; name: string; active_version: number }>>([]);
  const [requirements, setRequirements] = useState<Record<string, Array<{ resource_type: string; units: number }>>>({});
  const [mappings, setMappings] = useState<CalendarMapping[]>([]);
  const [connections, setConnections] = useState<Array<Record<string, string>>>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const toast = useToast();
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
  const loadedRequirements = useRef(false);

  const mapBookings = (rows: Array<Record<string, string>>): AdminBooking[] => rows.map((booking) => ({
    id: booking.id,
    reference: booking.reference,
    time: booking.time || "",
    date: booking.date || "",
    booked_at: booking.booked_at || "",
    student: booking.student || "Private",
    service: booking.service,
    serviceSlug: booking.service_slug || undefined,
    center: booking.center,
    centerSlug: booking.center_slug || undefined,
    instructor: booking.instructor || undefined,
    status: booking.status,
    start_at: booking.start_at,
    calendarLastError: booking.calendar_last_error || undefined
  } as AdminBooking));

  const loadAll = useCallback(async (opts?: { requirements?: boolean }) => {
    setDataLoading(true);
    const [b, o, c, s, r, g, f, m, conn] = await Promise.allSettled([
      adminApi.bookings(), adminApi.overrides(), adminApi.centers(), adminApi.services(),
      adminApi.resources(), adminApi.resourceGroups(), adminApi.forms(), adminApi.calendarMappings(), adminApi.calendarConnections()
    ]);
    if (b.status === "fulfilled") setBookings(mapBookings(b.value.bookings));
    if (o.status === "fulfilled") setOverrides(o.value.overrides);
    if (c.status === "fulfilled") setCenters(c.value.centers.map((center) => ({ ...center, enabled: Boolean(center.enabled) })));
    if (s.status === "fulfilled") setServices(s.value.services);
    if (r.status === "fulfilled") setResources(r.value.resources);
    if (g.status === "fulfilled") setGroups(g.value.groups);
    if (f.status === "fulfilled") setForms(f.value.forms);
    if (m.status === "fulfilled") setMappings(m.value.mappings);
    if (conn.status === "fulfilled") setConnections(conn.value.connections);
    setDataLoading(false);

    // Load requirements per service for the Services screen. Loaded lazily on the
    // first pass, then re-fetched on demand (opts.requirements) so editing a
    // service's resource requirements updates its "Requires" line without a refresh.
    if (s.status === "fulfilled" && (!loadedRequirements.current || opts?.requirements)) {
      loadedRequirements.current = true;
      const entries = await Promise.allSettled(s.value.services.map(async (service) => [service.id, (await adminApi.serviceRequirements(service.id)).requirements] as const));
      const next: Record<string, Array<{ resource_type: string; units: number }>> = {};
      entries.forEach((entry) => { if (entry.status === "fulfilled") next[entry.value[0]] = entry.value[1]; });
      setRequirements(next);
    }
  }, []);

  // Auth bootstrap
  useEffect(() => {
    (async () => {
      const config = await adminApi.authConfig().catch(() => ({ google: false, devLogin: false }));
      setDevAvailable(config.devLogin);
      try {
        const me = await adminApi.me();
        setUser(me.user);
        setAuthState("signed_in");
      } catch {
        setAuthState("signed_out");
      }
    })();
  }, []);

  useEffect(() => { if (authState === "signed_in") loadAll(); }, [authState, loadAll]);

  useEffect(() => {
    const handlePopState = () => setSection(sectionFromPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openSection = (next: AdminSection) => {
    setSection(next);
    const nextPath = next === "docs" ? "/admin/docs" : "/admin";
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  };

  const onResync = useCallback(async (id: string) => {
    try {
      await adminApi.resyncBooking(id);
      toast.show("success", "Calendar re-synced.");
      const b = await adminApi.bookings();
      setBookings(mapBookings(b.bookings));
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  }, [toast]);

  const onCancel = useCallback(async (id: string) => {
    if (!await confirmDialog("Cancel this booking?")) return;
    try {
      await adminApi.cancelBooking(id);
      toast.show("success", "Booking cancelled.");
      const b = await adminApi.bookings();
      setBookings(mapBookings(b.bookings));
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  }, [toast]);

  const onReconcile = useCallback(async () => {
    try {
      const summary = await adminApi.reconcileBookings();
      toast.show("success", summary.cleaned
        ? `Reconciled: ${summary.cleaned} booking(s) freed (event deleted in Google).`
        : `Reconciled ${summary.checked} booking(s); all in sync.`);
      const b = await adminApi.bookings();
      setBookings(mapBookings(b.bookings));
    } catch (err) {
      toast.show("error", errorMessage(err));
    }
  }, [toast]);

  const doDevLogin = async () => {
    const result = await adminApi.devLogin();
    setUser(result.user);
    setAuthState("signed_in");
  };

  const doLogout = async () => {
    await adminApi.logout().catch(() => undefined);
    setAuthState("signed_out");
  };

  const title = useMemo(() => nav.find((item) => item.id === section)?.label || "Today", [section]);

  if (authState === "loading") {
    return <div className="grid min-h-screen place-items-center bg-cream"><LoaderCircle className="animate-spin text-brand-500" size={36} /></div>;
  }
  if (authState === "signed_out" && section !== "docs") {
    return <SignIn devLoginAvailable={devAvailable} onDevLogin={doDevLogin} />;
  }

  const content = () => {
    if (section === "docs") return <AdminDocs />;
    if (dataLoading) return <ScreenSkeleton />;
    if (section === "dashboard") return <TodayDashboard bookings={bookings} centers={centers} services={services} resources={resources} groups={groups} overrides={overrides} setOverrides={setOverrides} onResync={onResync} onReconcile={onReconcile} openSection={openSection} />;
    if (section === "bookings") return <BookingsScreen bookings={bookings} centers={centers} services={services} onResync={onResync} onCancel={onCancel} onReconcile={onReconcile} reload={loadAll} />;
    if (section === "centers") return <CentersScreen centers={centers} bookings={bookings} groups={groups} resources={resources} reload={loadAll} toast={toast} />;
    if (section === "services") return <ServicesScreen services={services} centers={centers} forms={forms} requirements={requirements} reload={() => loadAll({ requirements: true })} toast={toast} />;
    if (section === "resources") return <ResourcesScreen resources={resources} groups={groups} centers={centers} reload={loadAll} toast={toast} />;
    if (section === "availability") return <AvailabilityScreen centers={centers} services={services} groups={groups} toast={toast} />;
    if (section === "forms") return <FormBuilderScreen forms={forms} reload={loadAll} toast={toast} />;
    if (section === "calendar") return <CalendarScreen centers={centers} services={services} resources={resources} mappings={mappings} connections={connections} reload={loadAll} toast={toast} />;
    if (section === "privacy") return <PrivacyScreen toast={toast} />;
    return null;
  };

  return (
    <div className="min-h-screen bg-cream">
      {toast.toast && (
        <div className="fixed inset-x-3 top-3 z-[60] sm:left-auto sm:right-4 sm:top-4 sm:max-w-sm">
          <Banner kind={toast.toast.kind} message={toast.toast.message} onClose={toast.clear} />
        </div>
      )}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink lg:flex">
        <div className="border-b border-white/10 p-5"><AdminLogo /></div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <button
              className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition", section === item.id ? "bg-brand-600 text-white shadow-lg shadow-brand-900/20" : "text-slate-300 hover:bg-white/7 hover:text-white")}
              onClick={() => openSection(item.id)} key={item.id}
            >
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-xs font-extrabold text-white">{(user.name || user.email || "ED").slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{user.name || "Operator"}</p><p className="truncate text-[10px] text-slate-400">{user.email}</p></div>
            <button onClick={doLogout} title="Sign out"><LogOut className="text-slate-400 hover:text-white" size={16} /></button>
          </div>
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)}>
          <aside className="h-full w-[min(18rem,calc(100vw-2rem))] overflow-y-auto bg-ink p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-1"><AdminLogo /><button className="text-white" onClick={() => setMobileNav(false)}><X /></button></div>
            <nav className="mt-7 space-y-1">
              {nav.map((item) => (
                <button className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold", section === item.id ? "bg-brand-600 text-white" : "text-slate-300")} onClick={() => { openSection(item.id); setMobileNav(false); }} key={item.id}>
                  <item.icon size={18} /> {item.label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold text-ink sm:text-lg">{title}</h1>
                <p className="hidden text-xs text-slate-500 sm:block">{section === "dashboard" ? new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }) + " · America/Montreal" : "Easy Driving School operations"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="secondary-button hidden min-h-10 px-3 py-2 sm:inline-flex" onClick={() => openSection("docs")}><HelpCircle size={16} /> Help</button>
              <a className="primary-button h-10 min-h-10 w-10 px-0 py-0 sm:h-auto sm:w-auto sm:px-3 sm:py-2" href="/book" target="_blank" aria-label="Open booking page" title="Open booking page"><Gauge size={16} /><span className="hidden sm:inline">Open booking page</span></a>
            </div>
          </div>
        </header>
        <main className="min-w-0 p-3 sm:p-6">{content()}</main>
      </div>
      {confirmDialogEl}
    </div>
  );
}
