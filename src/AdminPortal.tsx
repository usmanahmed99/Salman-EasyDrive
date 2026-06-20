import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CarFront,
  Check,
  ChevronDown,
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
  student: string;
  service: string;
  center: string;
  status: string;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur sm:flex-row sm:justify-end">{footer}</div>}
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
    if (when === "today") end.setHours(23, 59, 59, 999);
    if (when === "tomorrow") {
      now.setDate(now.getDate() + 1); now.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1); end.setHours(23, 59, 59, 999);
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
        period: when === "today" ? "Rest of today" : when,
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
            <Field label="When?">
              <select className="field" value={when} onChange={(event) => setWhen(event.target.value)}>
                <option value="now">Now · next 2 hours</option>
                <option value="today">Rest of today</option>
                <option value="tomorrow">Tomorrow</option>
              </select>
            </Field>
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
  bookings, centers, services, resources, groups, overrides, setOverrides, onResync, openSection
}: {
  bookings: AdminBooking[];
  centers: Center[];
  services: Service[];
  resources: AdminResource[];
  groups: ResourceGroup[];
  overrides: Array<Record<string, string>>;
  setOverrides: React.Dispatch<React.SetStateAction<Array<Record<string, string>>>>;
  onResync: (id: string) => Promise<void>;
  openSection: (section: AdminSection) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const todays = bookings.filter((booking) => booking.time && bookingDate(booking) === today);
  const failed = bookings.filter((booking) => booking.status === "calendar_sync_failed");
  const activeInstructors = resources.filter((resource) => resource.type === "instructor" && resource.enabled).length;
  const totalCars = groups.filter((group) => group.type === "cars").reduce((sum, group) => sum + group.capacity, 0);

  const stats = [
    { label: "Bookings today", value: String(todays.length), note: `${bookings.length} in window`, icon: CalendarDays, color: "text-brand-600 bg-brand-50" },
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
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-extrabold text-ink">Recent bookings</h2>
              <p className="mt-0.5 text-xs text-slate-500">{bookings.length} most recent</p>
            </div>
            <button className="secondary-button min-h-9 px-3 py-2 text-xs" onClick={() => openSection("bookings")}><ListFilter size={15} /> All bookings</button>
          </div>
          <div className="divide-y divide-slate-100">
            {bookings.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No bookings yet.</p>}
            {bookings.slice(0, 6).map((booking) => (
              <div className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50" key={booking.id}>
                <div className="w-16 shrink-0">
                  <p className="text-sm font-extrabold text-ink">{booking.time}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">{booking.reference}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{booking.student}</p>
                  <p className="truncate text-xs text-slate-500">{booking.service} · {booking.center}</p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-ink">Center status</h2>
              <span className="text-xs font-bold text-emerald-600">{centers.filter((c) => c.enabled).length} open</span>
            </div>
            <div className="mt-4 space-y-3">
              {centers.map((center) => {
                const count = bookings.filter((booking) => booking.center === center.name && bookingDate(booking) === today).length;
                return (
                  <div className="flex items-center gap-3" key={center.id}>
                    <span className={clsx("h-2.5 w-2.5 rounded-full ring-4", center.enabled ? "bg-emerald-500 ring-emerald-50" : "bg-slate-300 ring-slate-100")} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-ink">{center.name}</p>
                      <p className="text-xs text-slate-500">{count} bookings today</p>
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

function bookingDate(booking: AdminBooking & { start_at?: string }) {
  return (booking.start_at || "").slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

function BookingsScreen({ bookings, onResync, onCancel }: { bookings: AdminBooking[]; onResync: (id: string) => Promise<void>; onCancel: (id: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const filtered = bookings.filter((booking) =>
    !query || `${booking.student} ${booking.reference} ${booking.service} ${booking.center}`.toLowerCase().includes(query.toLowerCase())
  );

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    try { await fn(id); } finally { setBusy(null); }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={17} />
          <input className="field pl-10" placeholder="Search name or booking reference" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} of {bookings.length}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              {["Time", "Student", "Service", "Center", "Reference", "Status", ""].map((heading, index) => <th className="px-5 py-3" key={index}>{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No bookings found.</td></tr>}
            {filtered.map((booking) => (
              <tr className="hover:bg-slate-50" key={booking.id}>
                <td className="px-5 py-4 font-bold text-ink">{booking.time}</td>
                <td className="px-5 py-4 font-semibold text-ink">{booking.student}</td>
                <td className="px-5 py-4 text-slate-600">{booking.service}</td>
                <td className="px-5 py-4 text-slate-600">{booking.center}</td>
                <td className="px-5 py-4 font-mono text-xs text-slate-500">{booking.reference}</td>
                <td className="px-5 py-4"><StatusBadge status={booking.status} /></td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    {booking.status === "calendar_sync_failed" && (
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Retry calendar sync" disabled={busy === booking.id} onClick={() => act(booking.id, onResync)}>
                        {busy === booking.id ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />}
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
    </div>
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
        <Field label="Slug (URL)"><input className="field" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="laval" /></Field>
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

function CentersScreen({ centers, bookings, groups, reload, toast }: { centers: Center[]; bookings: AdminBooking[]; groups: ResourceGroup[]; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [editing, setEditing] = useState<Center | null | "new">(null);
  const today = new Date().toISOString().slice(0, 10);

  const remove = async (center: Center) => {
    if (!confirm(`Delete ${center.name}? This cannot be undone.`)) return;
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
          const resourceCount = groups.filter((group) => group.center_id === center.id).reduce((sum, group) => sum + (group.type === "instructors" ? group.member_count : group.capacity), 0);
          return (
            <div className="card p-5" key={center.id}>
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><MapPin size={21} /></div>
                <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold", center.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{center.enabled ? "Open" : "Closed"}</span>
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-ink">{center.name}</h3>
              <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{center.address || "No address set"}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs">
                <div><p className="text-slate-400">Today</p><p className="mt-1 font-extrabold text-ink">{todays} bookings</p></div>
                <div><p className="text-slate-400">Resources</p><p className="mt-1 font-extrabold text-ink">{resourceCount} units</p></div>
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
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

function ServiceModal({ service, forms, onClose, onSaved }: { service: Service | null; forms: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    slug: service?.slug || "",
    nameEn: service?.name.en || "",
    nameFr: service?.name.fr || "",
    descriptionEn: service?.description.en || "",
    descriptionFr: service?.description.fr || "",
    durationMinutes: service?.durationMinutes ?? 60,
    bufferBeforeMinutes: service?.bufferBeforeMinutes ?? 10,
    bufferAfterMinutes: service?.bufferAfterMinutes ?? 10,
    priceDisplay: service?.priceDisplay || "",
    formId: service?.formId || forms[0]?.id || "form_lesson",
    cutoffHours: service?.cutoffHours ?? 2,
    cancellationCutoffHours: service?.cancellationCutoffHours ?? 12,
    baseConcurrency: 4,
    enabled: service?.enabled ?? true
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setError("");
    setSaving(true);
    const payload = { ...v, slug: v.slug || slugify(v.nameEn) };
    try {
      if (service) await adminApi.updateService(service.id, payload);
      else await adminApi.createService(payload);
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
        <Field label="Slug (URL)"><input className="field" value={v.slug} onChange={(event) => set("slug", slugify(event.target.value))} /></Field>
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

function ServicesScreen({ services, forms, requirements, reload, toast }: {
  services: Service[];
  forms: Array<{ id: string; name: string }>;
  requirements: Record<string, Array<{ resource_type: string; units: number }>>;
  reload: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [editing, setEditing] = useState<Service | null | "new">(null);

  const remove = async (service: Service) => {
    if (!confirm(`Disable ${service.name.en}?`)) return;
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
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <p className="text-sm text-slate-500">Configure duration, price, resources and booking rules.</p>
          <button className="primary-button min-h-10 px-4 py-2" onClick={() => setEditing("new")}><Plus size={16} /> Add service</button>
        </div>
        <div className="divide-y divide-slate-100">
          {services.map((service) => (
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center" key={service.id}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Gauge size={21} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-ink">{service.name.en}</p>
                  <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", service.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{service.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{service.durationMinutes} min · {service.priceDisplay || "no price"} · {service.slug}</p>
              </div>
              <div className="flex items-center gap-5 text-xs">
                <div><p className="text-slate-400">Requires</p><p className="mt-1 font-bold capitalize text-ink">{requirementLabel(service.id)}</p></div>
                <button className="secondary-button min-h-10 px-4 py-2" onClick={() => setEditing(service)}>Edit</button>
                <button className="grid min-h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={() => remove(service)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing && <ServiceModal service={editing === "new" ? null : editing} forms={forms} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.show("success", "Service saved."); reload(); }} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                  */
/* -------------------------------------------------------------------------- */

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
  const [availableCalendars, setAvailableCalendars] = useState<Array<{ id: string; summary: string }> | null>(null);
  const [listing, setListing] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((current) => ({ ...current, [key]: value }));

  const loadCalendars = async () => {
    setListing(true);
    try {
      const result = await adminApi.calendarList();
      setAvailableCalendars(result.calendars);
    } catch {
      setError("Could not load calendars. Make sure your Google account is connected.");
    } finally {
      setListing(false);
    }
  };

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
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <span className="label">Google Calendar</span>
            <button type="button" className="text-xs text-blue-600 hover:underline disabled:opacity-50" onClick={loadCalendars} disabled={listing}>
              {listing ? "Loading…" : "Load from Google"}
            </button>
          </div>
          {availableCalendars ? (
            <select className="field" value={v.calendarId} onChange={(event) => set("calendarId", event.target.value)}>
              <option value="">— select a calendar —</option>
              {availableCalendars.map((cal) => <option key={cal.id} value={cal.id}>{cal.summary}</option>)}
            </select>
          ) : (
            <input className="field font-mono text-xs" value={v.calendarId} onChange={(event) => set("calendarId", event.target.value)} placeholder="instructor@group.calendar.google.com" />
          )}
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

function ResourcesScreen({ resources, groups, reload, toast }: { resources: AdminResource[]; groups: ResourceGroup[]; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [editing, setEditing] = useState<AdminResource | null | "new">(null);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const instructors = resources.filter((resource) => resource.type === "instructor");
  const carGroups = groups.filter((group) => group.type === "cars");

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
    if (!confirm(`Remove ${resource.name}?`)) return;
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Instructors (named)</h2>
          <button className="primary-button min-h-9 px-3 py-2 text-xs" onClick={() => setEditing("new")}><Plus size={15} /> Add instructor</button>
        </div>
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
                  <button className="grid min-h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={() => remove(resource)}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
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

  useEffect(() => { if (!centerId && centers[0]) setCenterId(centers[0].id); }, [centers, centerId]);

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
              <div className="flex items-center gap-4 px-5 py-3" key={row.dayOfWeek}>
                <label className="flex w-40 items-center gap-3">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={row.enabled} onChange={(event) => update(row.dayOfWeek, { enabled: event.target.checked })} />
                  <span className="text-sm font-bold text-ink">{WEEKDAYS[row.dayOfWeek]}</span>
                </label>
                <input type="time" className="field max-w-[140px] disabled:opacity-40" disabled={!row.enabled} value={row.startTime} onChange={(event) => update(row.dayOfWeek, { startTime: event.target.value })} />
                <span className="text-slate-400">to</span>
                <input type="time" className="field max-w-[140px] disabled:opacity-40" disabled={!row.enabled} value={row.endTime} onChange={(event) => update(row.dayOfWeek, { endTime: event.target.value })} />
                {!row.enabled && <span className="text-xs font-semibold text-slate-400">Closed</span>}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end border-t border-slate-100 p-5">
          <button className="primary-button" disabled={saving || loading} onClick={save}>{saving && <LoaderCircle className="animate-spin" size={16} />} Save business hours</button>
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
        <p className="px-2 text-xs font-bold uppercase tracking-wider text-slate-400">Forms</p>
        {forms.map((form) => (
          <button className={clsx("mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm font-bold", form.id === selectedId ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50")} key={form.id} onClick={() => setSelectedId(form.id)}>
            <FileText size={17} /> <span className="flex-1 truncate">{form.name}</span> <span className="text-[10px] text-slate-400">v{form.active_version}</span>
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="min-w-0 flex-1">
            <input className="w-full border-0 bg-transparent text-lg font-extrabold text-ink focus:outline-none" value={name} onChange={(event) => setName(event.target.value)} />
            <p className="mt-1 text-xs text-slate-500">{schema?.fields.length || 0} fields · publishing creates a new version</p>
          </div>
          <button className="primary-button min-h-10 px-4 py-2" disabled={saving || loading || !schema} onClick={publish}>{saving && <LoaderCircle className="animate-spin" size={16} />} Publish changes</button>
        </div>
        {loading || !schema ? <div className="p-5"><div className="skeleton h-72 rounded-xl" /></div> : (
          <div className="space-y-3 bg-slate-50/60 p-5">
            {schema.fields.map((field, index) => (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={field.id}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1 text-slate-300">
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
                  <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeField(field.id)}><Trash2 size={15} /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> Required</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={Boolean(field.calendarVisible)} onChange={(event) => updateField(field.id, { calendarVisible: event.target.checked })} /> Show on Calendar event</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={Boolean(field.adminListVisible)} onChange={(event) => updateField(field.id, { adminListVisible: event.target.checked })} /> Show in admin list</label>
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

function CalendarScreen({ centers, services, mappings, connections, reload, toast }: {
  centers: Center[];
  services: Service[];
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
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    adminApi.calendarTemplate()
      .then((result) => {
        setTitleTemplate(result.template.title_template || "");
        setDescriptionTemplate(result.template.description_template || "");
      })
      .catch(() => undefined);
  }, []);

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await adminApi.saveCalendarTemplate({
        titleTemplate: titleTemplate.trim() || null,
        descriptionTemplate: descriptionTemplate.trim() || null
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
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600"><CalendarDays size={24} /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-ink">{connection ? "Google Calendar connected" : "Google Calendar not connected"}</h2>
                {connection && <StatusBadge status={connection.status === "connected" ? "confirmed" : "calendar_sync_failed"} />}
              </div>
              <p className="mt-1 text-sm text-slate-500">{connection ? `${connection.google_email} · ${connection.status}` : "Connect an owner Google account to enable Calendar sync."}</p>
            </div>
          </div>
          {!connection && <a className="primary-button mt-5" href="/api/auth/google/start"><Link2 size={16} /> Connect Google account</a>}
          {connection && <button className="secondary-button mt-5" disabled={listing} onClick={loadCalendars}>{listing ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />} Load available calendars</button>}
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
              <button className="primary-button min-h-10 px-4 py-2" disabled={saving || !mappingId} onClick={addMapping}>{saving && <LoaderCircle className="animate-spin" size={16} />} Add mapping</button>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-extrabold text-ink">Event template</h2>
            <p className="mt-1 text-xs text-slate-500">
              Customize the title and description of created calendar events (and the student's invite email).
              Leave a field blank to use the built-in default. Placeholders:
              <span className="font-mono"> {"{service} {center} {reference} {student} {manageUrl} {visibleFields}"}</span>
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
              <span className="label">Description template</span>
              <textarea
                className="field min-h-32 font-mono text-xs"
                value={descriptionTemplate}
                onChange={(event) => setDescriptionTemplate(event.target.value)}
                placeholder={"Booking reference: {reference}\nStudent: {student}\nService: {service}\nCenter: {center}\n{visibleFields}\nManage or cancel: {manageUrl}"}
              />
            </label>
            <div className="flex justify-end">
              <button className="primary-button min-h-10 px-4 py-2" disabled={savingTemplate} onClick={saveTemplate}>
                {savingTemplate && <LoaderCircle className="animate-spin" size={16} />} Save template
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-ink p-6 text-white shadow-soft">
        <CalendarDays className="text-brand-300" size={27} />
        <h3 className="mt-5 text-xl font-extrabold">Availability stays where your team works.</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">Instructors block personal time directly in Google Calendar. The booking app checks FreeBusy before showing and confirming every slot.</p>
        <div className="mt-5 space-y-3 text-xs text-slate-200">
          {["No instructor dashboard required", "Live conflict checks", "Student invite from one canonical event"].map((item) => <p className="flex items-center gap-2" key={item}><Check className="text-emerald-400" size={15} /> {item}</p>)}
        </div>
        <p className="mt-6 rounded-xl bg-white/5 p-3 text-xs leading-5 text-slate-300">Instructor calendar IDs are set on the <strong>Instructors &amp; cars</strong> screen.</p>
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
  const loadedRequirements = useRef(false);

  const mapBookings = (rows: Array<Record<string, string>>): AdminBooking[] => rows.map((booking) => ({
    id: booking.id,
    reference: booking.reference,
    time: booking.time || "",
    student: booking.student || "Private",
    service: booking.service,
    center: booking.center,
    status: booking.status,
    start_at: booking.start_at
  } as AdminBooking));

  const loadAll = useCallback(async () => {
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

    // Load requirements per service once for the Services screen.
    if (s.status === "fulfilled" && !loadedRequirements.current) {
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
    if (!confirm("Cancel this booking?")) return;
    try {
      await adminApi.cancelBooking(id);
      toast.show("success", "Booking cancelled.");
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
    if (section === "dashboard") return <TodayDashboard bookings={bookings} centers={centers} services={services} resources={resources} groups={groups} overrides={overrides} setOverrides={setOverrides} onResync={onResync} openSection={openSection} />;
    if (section === "bookings") return <BookingsScreen bookings={bookings} onResync={onResync} onCancel={onCancel} />;
    if (section === "centers") return <CentersScreen centers={centers} bookings={bookings} groups={groups} reload={loadAll} toast={toast} />;
    if (section === "services") return <ServicesScreen services={services} forms={forms} requirements={requirements} reload={loadAll} toast={toast} />;
    if (section === "resources") return <ResourcesScreen resources={resources} groups={groups} reload={loadAll} toast={toast} />;
    if (section === "availability") return <AvailabilityScreen centers={centers} services={services} groups={groups} toast={toast} />;
    if (section === "forms") return <FormBuilderScreen forms={forms} reload={loadAll} toast={toast} />;
    if (section === "calendar") return <CalendarScreen centers={centers} services={services} mappings={mappings} connections={connections} reload={loadAll} toast={toast} />;
    if (section === "privacy") return <PrivacyScreen toast={toast} />;
    return null;
  };

  return (
    <div className="min-h-screen bg-cream">
      {toast.toast && (
        <div className="fixed right-4 top-4 z-[60] max-w-sm">
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
          <aside className="h-full w-72 bg-ink p-4" onClick={(event) => event.stopPropagation()}>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
              <div>
                <h1 className="text-lg font-extrabold text-ink">{title}</h1>
                <p className="hidden text-xs text-slate-500 sm:block">{section === "dashboard" ? new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }) + " · America/Montreal" : "Easy Driving School operations"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="secondary-button hidden min-h-10 px-3 py-2 sm:inline-flex" onClick={() => openSection("docs")}><HelpCircle size={16} /> Help</button>
              <a className="primary-button min-h-10 px-3 py-2" href="/book" target="_blank"><Gauge size={16} /><span className="hidden sm:inline">Open booking page</span></a>
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-6">{content()}</main>
      </div>
    </div>
  );
}
