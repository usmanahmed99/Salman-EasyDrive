import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gauge,
  Home,
  Info,
  Languages,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, format, isBefore, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfWeek, startOfDay } from "date-fns";
import clsx from "clsx";
import { copy, getLanguage } from "./i18n";
import { createBooking, createPackageBooking, getAvailability, getCenters, getForm, getPackages, getPublicConfig, getServices } from "./api";
import type {
  BookingConfirmation,
  BookingForm,
  Center,
  FormField,
  Language,
  Package,
  PackageBookingConfirmation,
  PublicConfig,
  Service,
  Slot
} from "../shared/types";

type Stage = "center" | "service" | "schedule" | "details" | "confirmed";

const stageIndex: Record<Stage, number> = { center: 0, service: 1, schedule: 2, details: 3, confirmed: 4 };

function localize(value: { en: string; fr: string } | undefined, language: Language) {
  return value?.[language] || value?.en || "";
}

// Splits the price into the display amount and a localized tax note ("Tax Incl." /
// "+ Tax") so the note can be rendered smaller beside the price on the cards.
function priceParts(service: Pick<Service, "priceDisplay" | "priceTaxMode">, t: typeof copy[Language]) {
  const price = service.priceDisplay || "";
  if (!price) return { price: "", note: "" };
  if (service.priceTaxMode === "incl") return { price, note: t.taxIncl };
  if (service.priceTaxMode === "plus") return { price, note: t.taxPlus };
  return { price, note: "" };
}

const PUBLIC_TIMEZONE = "America/Toronto";

function formatSlot(iso: string, language: Language) {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PUBLIC_TIMEZONE
  }).format(new Date(iso));
}

/** Wall-clock parts (YYYY-MM-DD, HH:mm) of an ISO timestamp in the public timezone. */
function wallClockParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PUBLIC_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(iso));
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${v.year}-${v.month}-${v.day}`, time: `${v.hour}:${v.minute}` };
}

/**
 * Resolve a date/time field's configured default into the string an input expects.
 * Tokens: "@slot" = the selected slot's start, optionally offset by minutes via
 * "@slot+90" or "@slot-30"; "@now" = today + next round hour. Any other non-empty
 * value is a literal default. Returns "" if nothing to prefill (e.g. "@slot" with
 * no slot chosen yet).
 */
function resolveDateDefault(field: FormField, slotStart: string | undefined): string {
  const raw = field.defaultValue;
  if (!raw) return "";
  let iso: string | undefined;
  if (raw.startsWith("@slot")) {
    // Apply the admin-configured minute offset (signed; defaults to 0) to the slot start.
    const offsetMinutes = Number(raw.slice("@slot".length)) || 0;
    if (slotStart) iso = new Date(new Date(slotStart).getTime() + offsetMinutes * 60 * 1000).toISOString();
  } else if (raw === "@now") {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    iso = now.toISOString();
  } else {
    return raw; // literal fixed value, already in the input's format
  }
  if (!iso) return "";
  const { date, time } = wallClockParts(iso);
  if (field.type === "date") return date;
  if (field.type === "time") return time;
  return `${date}T${time}`; // datetime → datetime-local format
}

function formatDateLong(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00Z`));
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/25 sm:h-11 sm:w-11 sm:rounded-2xl">
        <Gauge size={24} strokeWidth={2.4} />
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold leading-tight text-ink">Easy Driving</div>
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px] sm:tracking-[0.18em]">Driving School</div>
        </div>
      )}
    </div>
  );
}

function Progress({ stage, language }: { stage: Stage; language: Language }) {
  const t = copy[language];
  const steps = [t.location, t.service, t.schedule, t.details];
  const current = stageIndex[stage];
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-2xl items-center overflow-hidden px-1" aria-label="Booking progress">
      {steps.map((label, index) => (
        <div className={clsx("flex min-w-0 items-center", index < steps.length - 1 && "flex-1")} key={label}>
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={clsx(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition",
                index < current && "bg-brand-600 text-white",
                index === current && "bg-ink text-white ring-4 ring-slate-200",
                index > current && "bg-slate-100 text-slate-400"
              )}
            >
              {index < current ? <Check size={15} /> : index + 1}
            </div>
            <span
              className={clsx(
                "hidden truncate text-xs font-semibold sm:block",
                index === current ? "text-ink" : "text-slate-400"
              )}
            >
              {label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={clsx("mx-2 h-px min-w-3 flex-1 sm:mx-4", index < current ? "bg-brand-500" : "bg-slate-200")} />
          )}
        </div>
      ))}
    </div>
  );
}

function MiniCalendar({ selected, onChange, language }: { selected: string; onChange: (date: string) => void; language: Language }) {
  const today = startOfDay(new Date());
  const maxDate = addMonths(today, 12);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date(selected + "T12:00:00")));

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 })
  });

  const weekdays = language === "fr"
    ? ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"]
    : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const monthLabel = viewMonth.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { month: "long", year: "numeric" });

  const canGoPrev = isSameMonth(viewMonth, today) ? false : isBefore(today, viewMonth);
  const canGoNext = isBefore(viewMonth, startOfMonth(maxDate));

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink disabled:opacity-30"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          disabled={!canGoPrev}
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-extrabold capitalize text-ink">{monthLabel}</p>
        <button
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink disabled:opacity-30"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          disabled={!canGoNext}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {weekdays.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, new Date(selected + "T12:00:00"));
          const isToday = isSameDay(day, today);
          const isPast = isBefore(day, today) && !isToday;
          const isOtherMonth = !isSameMonth(day, viewMonth);
          const isFuture = !isPast && !isBefore(maxDate, day);
          return (
            <button
              key={dateStr}
              disabled={isPast || isOtherMonth || !isFuture}
              onClick={() => onChange(dateStr)}
              className={clsx(
                "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition",
                isSelected && "bg-ink text-white shadow",
                !isSelected && isToday && isFuture && "ring-1 ring-brand-300",
                !isSelected && isFuture && !isOtherMonth && "hover:bg-brand-50 hover:text-brand-700 text-slate-700",
                (isPast || isOtherMonth) && "text-slate-300 cursor-default",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DescriptionMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const hasBullets = lines.some((l) => /^[-*•]\s/.test(l.trim()));
  if (hasBullets) {
    const items = lines.filter((l) => /^[-*•]\s/.test(l.trim())).map((l) => l.replace(/^[-*•]\s+/, ""));
    const pre = lines.filter((l) => !/^[-*•]\s/.test(l.trim()) && l.trim()).slice(0, lines.findIndex((l) => /^[-*•]\s/.test(l.trim())));
    return (
      <div className="mt-0.5 text-xs leading-5 text-slate-500">
        {pre.map((p, i) => <p key={i}>{p}</p>)}
        <ul className="mt-1 space-y-0.5 list-none">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>;
}

function ServiceSummary({
  center,
  service,
  slot,
  language
}: {
  center?: Center;
  service?: Service;
  slot?: Slot;
  language: Language;
}) {
  const t = copy[language];
  if (!center && !service) return null;
  return (
    <aside className="card overflow-hidden lg:sticky lg:top-6">
      <div className="relative overflow-hidden bg-ink p-5 text-white">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-500/25 blur-2xl" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-200">{t.bookingSummary}</p>
          <h3 className="mt-3 text-xl font-bold">{service ? localize(service.name, language) : t.location}</h3>
          {service?.priceDisplay && (() => {
            const { price, note } = priceParts(service, t);
            return (
              <p className="mt-1 whitespace-nowrap text-2xl font-extrabold text-white">
                {price}{note && <span className="ml-1.5">{note}</span>}
              </p>
            );
          })()}
        </div>
      </div>
      <div className="space-y-4 p-5">
        {center && (
          <div className="flex gap-3">
            <MapPin className="mt-0.5 text-brand-600" size={18} />
            <div>
              <p className="text-sm font-bold text-ink">{center.name}</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">{center.address}</p>
            </div>
          </div>
        )}
        {service && service.showDuration !== false && (
          <div className="flex gap-3">
            <Clock3 className="mt-0.5 text-brand-600" size={18} />
            <p className="text-sm font-bold text-ink">{service.durationMinutes} min</p>
          </div>
        )}
        {service && localize(service.description, language) && (
          <DescriptionMarkdown text={localize(service.description, language)} />
        )}
        {slot && (
          <div className="flex gap-3 rounded-xl bg-brand-50 p-3">
            <CalendarCheck className="mt-0.5 text-brand-600" size={18} />
            <div>
              <p className="text-sm font-bold text-ink">
                {new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "America/Toronto"
                }).format(new Date(slot.start))}
              </p>
              <p className="text-xs text-slate-600">{formatSlot(slot.start, language)}</p>
            </div>
          </div>
        )}
        <div className="border-t border-slate-100 pt-4">
          {[t.fastBooking, t.calendarInvite, t.bilingual].map((item) => (
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600" key={item}>
              <CheckCircle2 className="text-emerald-500" size={15} />
              {item}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function DynamicField({
  field,
  language,
  value,
  onChange
}: {
  field: FormField;
  language: Language;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const t = copy[language];
  const label = localize(field.label, language);
  if (field.type === "hidden") return null;
  if (field.type === "checkbox" || field.type === "consent") {
    return (
      <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-brand-300">
        <input
          className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="text-sm font-medium leading-6 text-slate-700">
          {label}
          {field.required && <span className="ml-1 text-brand-600">*</span>}
        </span>
      </label>
    );
  }
  if (field.type === "radio") {
    return (
      <fieldset>
        <legend className="label">
          {label} {field.required && <span className="text-brand-600">*</span>}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {field.options?.map((option) => (
            <label
              className={clsx(
                "cursor-pointer rounded-xl border p-3 text-sm font-semibold transition",
                value === option.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 hover:border-slate-300"
              )}
              key={option.value}
            >
              <input
                className="sr-only"
                name={field.key}
                type="radio"
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              {localize(option.label, language)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="block">
      <span className="label">
        {label} {field.required && <span className="text-brand-600">*</span>}
      </span>
      {field.type === "textarea" ? (
        <textarea
          className="field min-h-28 resize-y"
          placeholder={localize(field.placeholder, language)}
          value={String(value || "")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "select" ? (
        <div className="relative">
          <select className="field appearance-none pr-10" value={String(value || "")} onChange={(event) => onChange(event.target.value)}>
            <option value="">{t.select}</option>
            {field.options?.map((option) => (
              <option value={option.value} key={option.value}>
                {localize(option.label, language)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-3.5 text-slate-400" size={18} />
        </div>
      ) : (
        <input
          className="field"
          type={
            field.type === "phone"
              ? "tel"
              : field.type === "datetime"
                ? "datetime-local"
                : field.type
          }
          placeholder={localize(field.placeholder, language)}
          value={String(value || "")}
          onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
      {field.helpText && <span className="mt-1.5 block text-xs text-slate-500">{localize(field.helpText, language)}</span>}
    </label>
  );
}

export default function PublicBooking() {
  const [language, setLanguage] = useState<Language>(getLanguage());
  const t = copy[language];
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const embedded = query.get("embed") === "1";
  const preselectedCenter = query.get("center");
  const preselectedService = query.get("service");
  const preselectedPackage = query.get("package");
  // Service-vs-package picker defaults to services; ?tab=packages opens on the packages tab.
  const [offerTab, setOfferTab] = useState<"services" | "packages">(
    query.get("tab") === "packages" ? "packages" : "services"
  );
  const [config, setConfig] = useState<PublicConfig>();
  const [centers, setCenters] = useState<Center[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [center, setCenter] = useState<Center>();
  const [service, setService] = useState<Service>();
  // When set, the service stage hands off to the dedicated multi-session package flow.
  const [selectedPackage, setSelectedPackage] = useState<Package>();
  const [stage, setStage] = useState<Stage>("center");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot>();
  const [form, setForm] = useState<BookingForm>();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<BookingConfirmation>();
  // Tracks the slot start last applied to @slot-default fields, so changing the
  // slot re-prefills them — unless the customer has manually edited the value.
  const lastSlotForDefaults = useRef<string | undefined>(undefined);

  useEffect(() => {
    Promise.all([getPublicConfig(), getCenters()]).then(([nextConfig, nextCenters]) => {
      setConfig(nextConfig);
      setCenters(nextCenters);
      const matched = nextCenters.find((item) => item.slug === preselectedCenter);
      if (matched) {
        setCenter(matched);
        setStage("service");
      }
      setLoading(false);
    });
  }, [preselectedCenter]);

  useEffect(() => {
    if (!center) return;
    setLoading(true);
    Promise.all([getServices(center.slug), getPackages(center.slug)]).then(([nextServices, nextPackages]) => {
      setServices(nextServices);
      setPackages(nextPackages);
      // ?package=<slug> jumps straight into the package flow; ?service=<slug> into scheduling.
      const matchedPackage = preselectedPackage && nextPackages.find((item) => item.slug === preselectedPackage);
      if (matchedPackage) {
        setSelectedPackage(matchedPackage);
      } else {
        const matched = nextServices.find((item) => item.slug === preselectedService);
        if (matched) {
          setService(matched);
          setStage("schedule");
        }
      }
      setLoading(false);
    });
  }, [center, preselectedService, preselectedPackage]);

  useEffect(() => {
    if (!center || !service || stage !== "schedule") return;
    setSlotLoading(true);
    setSlot(undefined);
    getAvailability(center.slug, service.slug, date)
      .then(setSlots)
      .catch((nextError: Error) => { setSlots([]); setError(nextError.message); })
      .finally(() => setSlotLoading(false));
  }, [center, service, date, stage]);

  useEffect(() => {
    if (!service?.formId || stage !== "details") return;
    getForm(service.formId).then((loaded) => {
      setForm(loaded);
      // Seed defaults for fields not yet answered: select/radio use defaultValue
      // verbatim; date/time fields resolve tokens (@slot, @now) or a literal value.
      // @slot fields also re-prefill when the slot changes, as long as the value
      // still matches the previously applied slot (i.e. the customer hasn't edited it).
      const prevSlot = lastSlotForDefaults.current;
      setAnswers((current) => {
        const seeded = { ...current };
        for (const field of loaded.fields) {
          const isDateField = field.type === "date" || field.type === "time" || field.type === "datetime";
          if (isDateField && field.defaultValue === "@slot") {
            const prev = resolveDateDefault(field, prevSlot);
            const untouched = seeded[field.key] === undefined || seeded[field.key] === prev;
            const next = resolveDateDefault(field, slot?.start);
            if (untouched && next) seeded[field.key] = next;
            continue;
          }
          if (seeded[field.key] !== undefined) continue;
          if (isDateField) {
            const resolved = resolveDateDefault(field, slot?.start);
            if (resolved) seeded[field.key] = resolved;
          } else if (field.defaultValue !== undefined) {
            seeded[field.key] = field.defaultValue;
          }
        }
        return seeded;
      });
      lastSlotForDefaults.current = slot?.start;
    });
  }, [service, stage, slot]);

  const chooseCenter = (nextCenter: Center) => {
    setCenter(nextCenter);
    setService(undefined);
    setSelectedPackage(undefined);
    setSlot(undefined);
    setStage("service");
  };

  const chooseService = (nextService: Service) => {
    setService(nextService);
    setSlot(undefined);
    setStage("schedule");
  };

  const goBack = () => {
    setError("");
    if (stage === "service") setStage("center");
    if (stage === "schedule") setStage("service");
    if (stage === "details") setStage("schedule");
  };

  const submit = async () => {
    if (!center || !service || !slot || !form) return;
    const missing = form.fields.find((field) => field.required && !answers[field.key]);
    if (missing) {
      setError(`${localize(missing.label, language)} — ${t.required}`);
      return;
    }
    const emailField = form.fields.find((f) => f.type === "email");
    if (emailField) {
      const emailVal = String(answers[emailField.key] || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        setError(t.emailInvalid);
        return;
      }
      if (emailVal.toLowerCase() !== confirmEmail.toLowerCase().trim()) {
        setError(t.emailMismatch);
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await createBooking({
        centerSlug: center.slug,
        serviceSlug: service.slug,
        start: slot.start,
        language,
        formVersion: form.version,
        answers
      });
      setConfirmation(result);
      setStage("confirmed");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "That time was just booked. Please choose another slot.");
    } finally {
      setSubmitting(false);
    }
  };


  if (stage === "confirmed" && confirmation) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-white">
        {!embedded && <header className="border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Logo />
            <button className="secondary-button min-h-10 px-3 py-2" onClick={() => setLanguage(language === "en" ? "fr" : "en")}>
              <Languages size={17} /> {language === "en" ? "FR" : "EN"}
            </button>
          </div>
        </header>}
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-5 sm:py-20">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={42} strokeWidth={2.2} />
            </div>
            <p className="eyebrow mt-7">{t.confirmed}</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">{t.successTitle}</h1>
            <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-slate-600">{t.successText}</p>
          </div>
          <div className="card mt-9 overflow-hidden">
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.reference}</p>
                <p className="mt-1 text-2xl font-extrabold text-ink">{confirmation.reference}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.schedule}</p>
                <p className="mt-1 font-bold text-ink">
                  {format(new Date(confirmation.start), "MMM d")} · {formatSlot(confirmation.start, language)}
                </p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.service}</p>
                <p className="mt-1 font-bold text-ink">{localize(service?.name, language)}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.location}</p>
                <p className="mt-1 font-bold text-ink">{center?.name}</p>
              </div>
            </div>
          </div>
          {confirmation.calendarSyncStatus === "failed" && (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
              Your booking is saved. Calendar sync is temporarily unavailable and staff have been alerted.
            </p>
          )}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              className="secondary-button w-full justify-center sm:order-1"
              onClick={() => window.location.assign(`/book?lang=${language}${embedded ? "&embed=1" : ""}`)}
            >
              {t.another}
            </button>
            <a className="primary-button w-full justify-center sm:order-2" href="https://easydriving.ca" target="_top" rel="noopener">
              <Home size={17} /> {t.backToSite} <ArrowRight size={17} />
            </a>
          </div>
        </main>
      </div>
    );
  }

  if (selectedPackage && center) {
    return (
      <PackageBookingFlow
        pkg={selectedPackage}
        center={center}
        language={language}
        embedded={embedded}
        config={config}
        onLanguage={setLanguage}
        onExit={() => setSelectedPackage(undefined)}
      />
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      {!embedded && <header className="border-b border-slate-200/70 bg-white/90 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-3">
          <Logo />
          <div className="flex shrink-0 items-center gap-2">
            {config?.brand.supportPhone && (
              <a className="hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-ink sm:flex" href={`tel:${config.brand.supportPhone}`}>
                <Phone size={16} /> {config.brand.supportPhone}
              </a>
            )}
            <a
              className="secondary-button min-h-10 px-3 py-2"
              href="https://easydriving.ca"
            >
              <Home size={17} /> <span className="hidden sm:inline">{t.backToSite}</span>
            </a>
            <button
              className="secondary-button min-h-10 px-3 py-2"
              onClick={() => {
                const next = language === "en" ? "fr" : "en";
                setLanguage(next);
                const url = new URL(window.location.href);
                url.searchParams.set("lang", next);
                window.history.replaceState({}, "", url);
              }}
            >
              <Languages size={17} /> {language === "en" ? "FR" : "EN"}
            </button>
          </div>
        </div>
      </header>}

      <div className="border-b border-slate-200/80 bg-white px-3 py-4 sm:px-6 sm:py-5">
        <Progress stage={stage} language={language} />
      </div>

      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section>
            {stage !== "center" && (
              <button
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition hover:border-brand-300 hover:text-brand-600 hover:shadow"
                onClick={goBack}
              >
                <ArrowLeft size={17} /> {t.back}
              </button>
            )}

            {error && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
                {error}
              </div>
            )}

            {stage === "center" && (
              <div>
                <p className="eyebrow">{t.book}</p>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.chooseLocation}</h1>
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Star className="fill-amber-400 text-amber-400" size={16} /> {t.trust}
                </p>
                <div className="mt-7 grid gap-4 sm:grid-cols-3">
                  {loading
                    ? Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-44 rounded-2xl" key={index} />)
                    : centers.map((item) => (
                        <button
                          className="card group p-4 text-left transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-soft sm:p-5"
                          onClick={() => chooseCenter(item)}
                          key={item.id}
                        >
                          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                            <MapPin size={22} />
                          </div>
                          <h2 className="mt-5 text-lg font-extrabold text-ink">{item.name}</h2>
                          <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{item.address}</p>
                          <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-600">
                            {t.continue} <ArrowRight size={15} />
                          </span>
                        </button>
                      ))}
                </div>
              </div>
            )}

            {stage === "service" && (() => {
              // Packages and services live under separate tabs. Services is the default; when no
              // packages exist for this center, the tab bar is hidden and we always show services.
              const hasPackages = !loading && packages.length > 0;
              const activeTab = hasPackages ? offerTab : "services";
              return (
              <div>
                <p className="text-base font-extrabold uppercase tracking-[0.14em] text-brand-600 sm:text-lg">{center?.name}</p>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.chooseService}</h1>

                {hasPackages && (
                  <div className="mt-6 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1" role="tablist">
                    {(["services", "packages"] as const).map((tab) => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={activeTab === tab}
                        className={clsx(
                          "rounded-xl px-5 py-2 text-sm font-bold transition",
                          activeTab === tab ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
                        )}
                        onClick={() => {
                          setOfferTab(tab);
                          const url = new URL(window.location.href);
                          if (tab === "packages") url.searchParams.set("tab", "packages");
                          else url.searchParams.delete("tab");
                          window.history.replaceState({}, "", url);
                        }}
                      >
                        {tab === "services" ? t.servicesTab : t.packagesTab}
                      </button>
                    ))}
                  </div>
                )}

                {activeTab === "packages" ? (
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {packages.map((pkg) => {
                      const { price, note } = priceParts(pkg, t);
                      return (
                        <button
                          className="card group flex min-h-44 flex-col border-brand-200 bg-brand-50/40 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft sm:p-5"
                          onClick={() => setSelectedPackage(pkg)}
                          key={pkg.id}
                        >
                          <div className="flex w-full items-start justify-between gap-4">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                              <Sparkles size={12} /> {t.packageLabel} · {pkg.sessionCount} {t.sessionsLabel}
                            </span>
                            {price && (
                              <span className="whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-sm font-extrabold text-white">
                                {price}{note && <span className="ml-1">{note}</span>}
                              </span>
                            )}
                          </div>
                          <h2 className="mt-4 text-lg font-extrabold text-ink">{localize(pkg.name, language)}</h2>
                          <div className="flex-1">
                            <DescriptionMarkdown text={localize(pkg.description, language)} />
                          </div>
                          <div className="mt-4 flex items-center justify-end text-xs">
                            <span className="flex items-center gap-1 font-bold text-brand-600">
                              {t.continue} <ArrowRight size={14} />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {loading
                    ? Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-44 rounded-2xl" key={index} />)
                    : services.map((item) => {
                        const highlight = localize(item.highlight, language).trim();
                        return (
                        <button
                          className="card group flex min-h-44 flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft sm:p-5"
                          onClick={() => chooseService(item)}
                          key={item.id}
                        >
                          <div className="flex w-full items-start justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                                <Gauge size={20} />
                              </div>
                              {highlight && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                  <Star size={11} className="fill-amber-500 text-amber-500" /> {highlight}
                                </span>
                              )}
                            </div>
                            {item.priceDisplay && (() => {
                              const { price, note } = priceParts(item, t);
                              return (
                                <span className="whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-sm font-extrabold text-white">
                                  {price}{note && <span className="ml-1">{note}</span>}
                                </span>
                              );
                            })()}
                          </div>
                          <h2 className="mt-4 text-lg font-extrabold text-ink">{localize(item.name, language)}</h2>
                          <div className="flex-1">
                            <DescriptionMarkdown text={localize(item.description, language)} />
                          </div>
                          <div className={clsx("mt-4 flex items-center text-xs", item.showDuration !== false ? "justify-between" : "justify-end")}>
                            {item.showDuration !== false && (
                              <span className="flex items-center gap-1.5 font-semibold text-slate-500">
                                <Clock3 size={14} /> {item.durationMinutes} min
                              </span>
                            )}
                            <span className="flex items-center gap-1 font-bold text-brand-600">
                              {t.continue} <ArrowRight size={14} />
                            </span>
                          </div>
                        </button>
                        );
                      })}
                </div>
                )}
              </div>
              );
            })()}

            {stage === "schedule" && service && (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="eyebrow">{localize(service.name, language)}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t.live}
                      </span>
                    </div>
                    <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.chooseTime}</h1>
                  </div>
                </div>
                <div className="card mt-6 p-4">
                  <MiniCalendar selected={date} onChange={setDate} language={language} />
                </div>
                <div className="card mt-5 p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-extrabold capitalize text-ink">{formatDateLong(date, language)}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.availableTimes} · America/Montreal</p>
                    </div>
                    <ShieldCheck className="text-emerald-500" size={22} />
                  </div>
                  {slotLoading ? (
                    <div className="grid grid-cols-2 gap-3 py-7 sm:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, index) => <div className="skeleton h-12 rounded-xl" key={index} />)}
                    </div>
                  ) : slots.length ? (
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {slots.map((item) => (
                        <button
                          className={clsx(
                            "rounded-xl border px-4 py-3 text-sm font-bold transition",
                            slot?.start === item.start
                              ? "border-brand-600 bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                              : "border-slate-200 bg-white text-ink hover:border-brand-400 hover:bg-brand-50"
                          )}
                          onClick={() => setSlot(item)}
                          key={item.start}
                        >
                          {formatSlot(item.start, language)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                        <CalendarCheck size={23} />
                      </div>
                      <p className="mt-4 text-sm font-extrabold text-ink">{t.noTimes}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.noTimesHint}</p>
                    </div>
                  )}
                  {slot && (
                    <button className="primary-button mt-6 w-full" onClick={() => setStage("details")}>
                      {t.continue} · {formatSlot(slot.start, language)} <ArrowRight size={17} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {stage === "details" && (
              <div>
                <p className="eyebrow">{t.secure}</p>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.completeDetails}</h1>
                {!form ? (
                  <div className="mt-7 space-y-4">
                    {Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-20 rounded-xl" key={index} />)}
                  </div>
                ) : (
                  <div className="card mt-7 space-y-5 p-5 sm:p-7">
                    {form.fields.map((field) => (
                      <div key={field.id}>
                        <DynamicField
                          field={field}
                          language={language}
                          value={answers[field.key]}
                          onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
                        />
                        {field.type === "email" && (
                          <label className="mt-5 block">
                            <span className="label">{t.confirmEmail} <span className="text-brand-600">*</span></span>
                            <input
                              className="field"
                              type="email"
                              autoComplete="off"
                              value={confirmEmail}
                              onChange={(e) => setConfirmEmail(e.target.value)}
                              onPaste={(e) => e.preventDefault()}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-5 text-xs font-medium text-slate-500">
                      <LockKeyhole size={15} className="text-emerald-500" />
                      Your information is encrypted and automatically removed after the retention period.
                    </div>
                    <button className="primary-button w-full" disabled={submitting} onClick={submit}>
                      {submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={17} />}
                      {submitting ? t.loading : t.finalConfirm}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(stage === "service" || stage === "schedule" || stage === "details") && (
              <button
                className="mt-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition hover:border-brand-300 hover:text-brand-600 hover:shadow"
                onClick={goBack}
              >
                <ArrowLeft size={17} /> {t.back}
              </button>
            )}
          </section>

          <div className={clsx(stage === "center" && "hidden lg:block")}>
            <ServiceSummary center={center} service={service} slot={slot} language={language} />
          </div>
        </div>
      </main>
      {!embedded && <footer className="mt-8 border-t border-slate-200 bg-white px-4 py-6 text-center text-xs leading-5 text-slate-500">
        © {new Date().getFullYear()} Easy Driving School · Secure booking powered by Cloudflare
      </footer>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Package booking (multi-session)                                            */
/* -------------------------------------------------------------------------- */

type PackageStage = "schedule" | "details" | "confirmed";

/** Expands a package's items into a flat, ordered list of one entry per session. */
interface SessionSlot {
  serviceSlug: string;
  serviceName: { en: string; fr: string };
  serviceDescription: { en: string; fr: string };
  durationMinutes: number;
  /** Slug of a service whose sessions must all finish before this one may start. */
  prerequisiteServiceSlug?: string;
  /** Which side of the dependency the student schedules first (see PackageItem). */
  prerequisiteAnchor?: "prerequisite" | "target";
  slot?: Slot;
}

function PackageBookingFlow({ pkg, center, language, embedded, config, onLanguage, onExit }: {
  pkg: Package;
  center: Center;
  language: Language;
  embedded: boolean;
  config?: PublicConfig;
  onLanguage: (language: Language) => void;
  onExit: () => void;
}) {
  const t = copy[language];
  const [stage, setStage] = useState<PackageStage>("schedule");
  // One row per session, in package-item order. Each holds its chosen slot once picked.
  const [sessions, setSessions] = useState<SessionSlot[]>(() =>
    pkg.items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        serviceSlug: item.serviceSlug,
        serviceName: item.serviceName,
        serviceDescription: item.serviceDescription,
        durationMinutes: item.durationMinutes,
        prerequisiteServiceSlug: item.prerequisiteServiceSlug,
        prerequisiteAnchor: item.prerequisiteAnchor
      }))
    )
  );
  const [activeIndex, setActiveIndex] = useState(0);
  // When set, shows a popup with that session's service name + description.
  const [descPopup, setDescPopup] = useState<SessionSlot>();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [form, setForm] = useState<BookingForm>();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<PackageBookingConfirmation>();

  const active = sessions[activeIndex];
  const allPicked = sessions.every((session) => session.slot);
  // The distinct services in the package (order preserved) — each may carry its own form.
  const serviceSlugs = useMemo(
    () => [...new Set(sessions.map((session) => session.serviceSlug))],
    [sessions]
  );

  // Load availability for the active session's service + date.
  useEffect(() => {
    if (stage !== "schedule" || !active) return;
    setSlotLoading(true);
    getAvailability(center.slug, active.serviceSlug, date)
      .then(setSlots)
      .catch((nextError: Error) => { setSlots([]); setError(nextError.message); })
      .finally(() => setSlotLoading(false));
  }, [center.slug, active, date, stage, activeIndex]);

  // Load and MERGE every distinct service's form into one, filled once. Fields are deduped by key
  // (so shared fields like name/email/phone appear once); a required duplicate wins over optional.
  // The backend still validates each session against its own service's form, so every merged field
  // reaches the form that needs it.
  useEffect(() => {
    if (stage !== "details" || form || serviceSlugs.length === 0) return;
    (async () => {
      const services = await getServices(center.slug);
      const formIds = [...new Set(
        serviceSlugs
          .map((slug) => services.find((item) => item.slug === slug)?.formId)
          .filter((id): id is string => Boolean(id))
      )];
      const forms = await Promise.all(formIds.map((id) => getForm(id)));
      const byKey = new Map<string, FormField>();
      for (const loaded of forms) {
        for (const field of loaded.fields) {
          const existing = byKey.get(field.key);
          // Keep the first occurrence, but upgrade to required if any form requires the field.
          if (!existing) byKey.set(field.key, field);
          else if (field.required && !existing.required) byKey.set(field.key, { ...existing, required: true });
        }
      }
      const mergedFields = [...byKey.values()];
      const merged: BookingForm = {
        id: "package-merged",
        name: localize(pkg.name, language),
        version: forms[0]?.version ?? 1,
        fields: mergedFields
      };
      setForm(merged);
      setAnswers((current) => {
        const seeded = { ...current };
        for (const field of mergedFields) {
          if (seeded[field.key] === undefined && field.defaultValue !== undefined
            && field.type !== "date" && field.type !== "time" && field.type !== "datetime") {
            seeded[field.key] = field.defaultValue;
          }
        }
        return seeded;
      });
    })().catch((nextError: Error) => setError(nextError.message));
  }, [stage, serviceSlugs, center.slug, form, pkg.name, language]);

  // Disallow picking a slot already chosen for another session in this package.
  const isSlotTaken = (start: string, exceptIndex: number) =>
    sessions.some((session, index) => index !== exceptIndex && session.slot?.start === start);

  // A user may book at most 2 hours of lessons on any single calendar day across the package.
  // Sum the minutes already committed (by other sessions) on a given local day.
  const MAX_DAILY_MINUTES = 120;
  const committedMinutesOnDay = (localDate: string, exceptIndex: number) =>
    sessions.reduce((sum, session, index) =>
      index !== exceptIndex && session.slot && wallClockParts(session.slot.start).date === localDate
        ? sum + session.durationMinutes
        : sum, 0);

  // True if picking `start` for the active session would exceed the 2h/day cap.
  const exceedsDailyCap = (start: string) =>
    committedMinutesOnDay(wallClockParts(start).date, activeIndex) + active.durationMinutes > MAX_DAILY_MINUTES;

  // Prerequisite ordering. The invariant is always "every dependent session starts after every
  // prerequisite session ends", but the anchor direction decides which side the student schedules
  // first, and therefore which bound the ACTIVE session gets:
  //
  //  - "prerequisite" anchor (default): the active session is the DEPENDENT. It gets a LOWER bound —
  //    it may only start once all prerequisite sessions are placed and after the latest one ends.
  //  - "target" anchor: the active session is a PREREQUISITE of a target-anchored dependent (e.g. the
  //    exam). It gets an UPPER bound — it must end before the anchor (dependent) is placed and before
  //    its earliest session starts. The dependent itself is the anchor and gets no bound.
  //
  // We surface at most one active constraint (lower or upper) plus a "schedule the other side first"
  // gate, mirroring the daily-cap UX. Times are in ms; null bounds mean "no constraint".

  // LOWER bound: active is a prerequisite-anchored dependent.
  const lowerDep = active?.prerequisiteAnchor !== "target" ? active : undefined;
  const lowerPrereqSlug = lowerDep?.prerequisiteServiceSlug;
  const lowerPrereqSessions = lowerPrereqSlug ? sessions.filter((s) => s.serviceSlug === lowerPrereqSlug) : [];
  const lowerPrereqScheduled = lowerPrereqSessions.length > 0 && lowerPrereqSessions.every((s) => s.slot);
  const earliestAllowedStart = lowerPrereqScheduled
    ? Math.max(...lowerPrereqSessions.map((s) => new Date(s.slot!.start).getTime() + s.durationMinutes * 60_000))
    : null;

  // UPPER bound: active is a prerequisite of a target-anchored dependent. Find any dependent item
  // that (a) is target-anchored and (b) names the active session's service as its prerequisite.
  const targetDep = active
    ? sessions.find((s) => s.prerequisiteAnchor === "target" && s.prerequisiteServiceSlug === active.serviceSlug)
    : undefined;
  const targetDepSessions = targetDep ? sessions.filter((s) => s.serviceSlug === targetDep.serviceSlug) : [];
  const targetDepScheduled = targetDepSessions.length > 0 && targetDepSessions.every((s) => s.slot);
  const earliestTargetStart = targetDepScheduled
    ? Math.min(...targetDepSessions.map((s) => new Date(s.slot!.start).getTime()))
    : null;

  // Human-readable names for the hints.
  const lowerPrereqName = lowerPrereqSessions[0] ? localize(lowerPrereqSessions[0].serviceName, language) : "";
  const targetDepName = targetDep ? localize(targetDep.serviceName, language) : "";

  // A dependency applies to the active session if either bound is in play.
  const hasLowerDependency = Boolean(lowerPrereqSlug);
  const hasUpperDependency = Boolean(targetDep);
  // The "other side isn't scheduled yet" gate: nothing is bookable until it's placed.
  const lowerGateOpen = !hasLowerDependency || earliestAllowedStart !== null;
  const upperGateOpen = !hasUpperDependency || earliestTargetStart !== null;

  // True if picking `start` would violate ordering for the active session.
  const violatesPrereq = (start: string) => {
    const startMs = new Date(start).getTime();
    if (hasLowerDependency) {
      if (earliestAllowedStart === null) return true;               // prerequisite not scheduled yet
      if (startMs < earliestAllowedStart) return true;              // before prerequisite ends
    }
    if (hasUpperDependency) {
      if (earliestTargetStart === null) return true;                // anchor (exam) not scheduled yet
      if (startMs + active.durationMinutes * 60_000 > earliestTargetStart) return true; // ends after anchor starts
    }
    return false;
  };

  // The single hint shown for the active session's ordering constraint (banner + slot tooltip).
  // Prefers the "schedule the other side first" message when the relevant side isn't placed yet.
  const orderHint = (() => {
    if (hasLowerDependency && !lowerGateOpen) return t.prereqUnscheduled.replace("{service}", lowerPrereqName);
    if (hasUpperDependency && !upperGateOpen) return t.targetUnscheduled.replace("{service}", targetDepName);
    if (hasLowerDependency) return t.prereqHint.replace("{service}", lowerPrereqName);
    if (hasUpperDependency) return t.targetHint.replace("{service}", targetDepName);
    return "";
  })();

  // Whether a session can be scheduled *right now* against a given schedule — i.e. the side it
  // depends on is already placed. Used to steer the flow (initial focus + auto-advance) so the
  // student is never dropped on a tab where every slot is locked. A target-anchored dependent (the
  // exam) is schedulable first; its prerequisites open once it's placed, and vice-versa by default.
  const gateOpenIn = (session: SessionSlot, schedule: SessionSlot[]): boolean => {
    // Lower gate: a prerequisite-anchored dependent needs its prerequisite sessions all placed.
    if (session.prerequisiteAnchor !== "target" && session.prerequisiteServiceSlug) {
      const prereq = schedule.filter((s) => s.serviceSlug === session.prerequisiteServiceSlug);
      if (!(prereq.length > 0 && prereq.every((s) => s.slot))) return false;
    }
    // Upper gate: a prerequisite of a target-anchored dependent needs that dependent placed first.
    const anchor = schedule.find((s) => s.prerequisiteAnchor === "target" && s.prerequisiteServiceSlug === session.serviceSlug);
    if (anchor) {
      const anchorSessions = schedule.filter((s) => s.serviceSlug === anchor.serviceSlug);
      if (!(anchorSessions.length > 0 && anchorSessions.every((s) => s.slot))) return false;
    }
    return true;
  };

  // On first render (and whenever the schedule shifts), if the focused session is gated shut, move
  // focus to the first unscheduled session that is schedulable now. Keeps target-anchored packages
  // from opening on a fully-locked lessons tab.
  useEffect(() => {
    if (stage !== "schedule" || !active) return;
    if (active.slot || gateOpenIn(active, sessions)) return;
    const reachable = sessions.findIndex((session) => !session.slot && gateOpenIn(session, sessions));
    if (reachable !== -1 && reachable !== activeIndex) setActiveIndex(reachable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, activeIndex, sessions]);

  const pickSlot = (slot: Slot) => {
    // Compute against the post-pick schedule so gate checks see the slot we're placing.
    const nextSessions = sessions.map((session, index) => index === activeIndex ? { ...session, slot } : session);
    setSessions(nextSessions);
    // Auto-advance to the next unscheduled session that can actually be scheduled now (skip ones
    // still gated behind an unplaced dependency), falling back to any unscheduled session.
    const nextReachable = nextSessions.findIndex((session, index) => index !== activeIndex && !session.slot && gateOpenIn(session, nextSessions));
    const nextUnpicked = nextSessions.findIndex((session, index) => index !== activeIndex && !session.slot);
    const next = nextReachable !== -1 ? nextReachable : nextUnpicked;
    if (next !== -1) setActiveIndex(next);
  };

  const submit = async () => {
    if (!form || !allPicked) return;
    const missing = form.fields.find((field) => field.required && !answers[field.key]);
    if (missing) { setError(`${localize(missing.label, language)} — ${t.required}`); return; }
    const emailField = form.fields.find((f) => f.type === "email");
    if (emailField) {
      const emailVal = String(answers[emailField.key] || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) { setError(t.emailInvalid); return; }
      if (emailVal.toLowerCase() !== confirmEmail.toLowerCase().trim()) { setError(t.emailMismatch); return; }
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await createPackageBooking({
        centerSlug: center.slug,
        packageSlug: pkg.slug,
        language,
        formVersion: form.version,
        answers,
        sessions: sessions.map((session) => ({ serviceSlug: session.serviceSlug, start: session.slot!.start }))
      });
      setConfirmation(result);
      setStage("confirmed");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : t.packageSessionConflict;
      setError(message);
      // On a session conflict, send the customer back to scheduling to re-pick.
      setStage("schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const Header = () => (
    <>
      {!embedded && <header className="border-b border-slate-200/70 bg-white/90 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-3">
          <Logo />
          <div className="flex shrink-0 items-center gap-2">
            {config?.brand.supportPhone && (
              <a className="hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-ink sm:flex" href={`tel:${config.brand.supportPhone}`}>
                <Phone size={16} /> {config.brand.supportPhone}
              </a>
            )}
            <button className="secondary-button min-h-10 px-3 py-2" onClick={() => onLanguage(language === "en" ? "fr" : "en")}>
              <Languages size={17} /> {language === "en" ? "FR" : "EN"}
            </button>
          </div>
        </div>
      </header>}
    </>
  );

  if (stage === "confirmed" && confirmation) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-white">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-5 sm:py-16">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={40} />
            </div>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">{t.packageSuccessTitle}</h1>
            <p className="mt-3 text-sm text-slate-600">{t.packageSuccessText}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">{t.reference}: {confirmation.reference}</p>
          </div>
          <div className="card mt-8 divide-y divide-slate-100 p-2">
            {confirmation.sessions.map((session, index) => (
              <div className="flex items-center justify-between gap-4 p-3" key={session.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{index + 1}. {session.serviceName}</p>
                  <p className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
                      weekday: "short", month: "short", day: "numeric", timeZone: PUBLIC_TIMEZONE
                    }).format(new Date(session.start))} · {formatSlot(session.start, language)}
                  </p>
                </div>
                <a
                  className="secondary-button min-h-9 shrink-0 px-3 py-1.5 text-xs"
                  href={`/booking/${session.reference}?token=${encodeURIComponent(session.manageToken || "")}${embedded ? "&embed=1" : ""}`}
                >
                  {t.manage}
                </a>
              </div>
            ))}
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              className="secondary-button w-full justify-center sm:order-1"
              onClick={() => window.location.assign(`/book?lang=${language}${embedded ? "&embed=1" : ""}`)}
            >
              {t.another}
            </button>
            <a className="primary-button w-full justify-center sm:order-2" href="https://easydriving.ca" target="_top" rel="noopener">
              <Home size={17} /> {t.backToSite} <ArrowRight size={17} />
            </a>
          </div>
        </main>
      </div>
    );
  }

  const pickedCount = sessions.filter((session) => session.slot).length;

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <button
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition hover:border-brand-300 hover:text-brand-600 hover:shadow"
          onClick={() => stage === "details" ? setStage("schedule") : onExit()}
        >
          <ArrowLeft size={17} /> {t.back}
        </button>

        {error && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section>
            <p className="eyebrow">{localize(pkg.name, language)} · {pkg.sessionCount} {t.sessionsLabel}</p>

            {stage === "schedule" && active && (
              <div>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.chooseSessionTime}</h1>
                {/* Session tabs: pick which session you're scheduling. The info icon opens the
                    service description in a popup, on demand. */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {sessions.map((session, index) => {
                    const hasDescription = Boolean(localize(session.serviceDescription, language).trim());
                    return (
                    <div
                      role="button"
                      tabIndex={0}
                      className={clsx(
                        "relative cursor-pointer rounded-xl border py-2 pl-3 text-left text-xs font-bold transition",
                        hasDescription ? "pr-8" : "pr-3",
                        // A picked session is always green; the active one gets a heavier ring so it
                        // still reads as "current" without overriding the picked (green) state — otherwise
                        // the last-picked session stays blue/active and looks unscheduled.
                        session.slot ? clsx("border-emerald-300 bg-emerald-50 text-emerald-700", index === activeIndex && "ring-2 ring-emerald-400")
                          : index === activeIndex ? "border-brand-600 bg-brand-50 text-brand-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                      )}
                      onClick={() => setActiveIndex(index)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveIndex(index); } }}
                      key={index}
                    >
                      <span className="flex items-center gap-1.5">
                        {session.slot ? <Check size={13} /> : <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-200 text-[9px] text-slate-600">{index + 1}</span>}
                        {localize(session.serviceName, language)}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                        {session.slot
                          ? `${new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: PUBLIC_TIMEZONE }).format(new Date(session.slot.start))} · ${formatSlot(session.slot.start, language)}`
                          : t.notPicked}
                      </span>
                      {hasDescription && (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-brand-600"
                          aria-label={`${localize(session.serviceName, language)} — details`}
                          onClick={(e) => { e.stopPropagation(); setDescPopup(session); }}
                        >
                          <Info size={14} />
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>

                <p className="mt-5 text-sm font-bold text-ink">
                  {t.sessionStep} {activeIndex + 1}/{sessions.length}: {localize(active.serviceName, language)}
                </p>
                <div className="card mt-3 p-4">
                  <MiniCalendar selected={date} onChange={setDate} language={language} />
                </div>
                <div className="card mt-5 p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-extrabold capitalize text-ink">{formatDateLong(date, language)}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.availableTimes} · America/Montreal</p>
                    </div>
                    <ShieldCheck className="text-emerald-500" size={22} />
                  </div>
                  {committedMinutesOnDay(date, activeIndex) + active.durationMinutes > MAX_DAILY_MINUTES && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      {t.dailyLimitHint}
                    </p>
                  )}
                  {orderHint && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      {orderHint}
                    </p>
                  )}
                  {slotLoading ? (
                    <div className="grid grid-cols-2 gap-3 py-7 sm:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, index) => <div className="skeleton h-12 rounded-xl" key={index} />)}
                    </div>
                  ) : slots.length ? (
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {slots.map((item) => {
                        const taken = isSlotTaken(item.start, activeIndex);
                        const selected = active.slot?.start === item.start;
                        // Block slots that would push this day past the 2h/day cap (selected slot stays clickable).
                        const capped = !selected && exceedsDailyCap(item.start);
                        // Block slots before the prerequisite finishes (selected slot stays clickable).
                        const blockedByOrder = !selected && violatesPrereq(item.start);
                        const disabled = taken || capped || blockedByOrder;
                        return (
                          <button
                            className={clsx(
                              "rounded-xl border px-4 py-3 text-sm font-bold transition",
                              selected ? "border-brand-600 bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                                : disabled ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                                : "border-slate-200 bg-white text-ink hover:border-brand-400 hover:bg-brand-50"
                            )}
                            disabled={disabled}
                            title={blockedByOrder ? orderHint : capped ? t.dailyLimitHint : undefined}
                            onClick={() => pickSlot(item)}
                            key={item.start}
                          >
                            {formatSlot(item.start, language)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                        <CalendarCheck size={23} />
                      </div>
                      <p className="mt-4 text-sm font-extrabold text-ink">{t.noTimes}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.noTimesHint}</p>
                    </div>
                  )}
                  {allPicked && (
                    <button className="primary-button mt-6 w-full" onClick={() => { setError(""); setStage("details"); }}>
                      {t.reviewPackage} <ArrowRight size={17} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {stage === "details" && (
              <div>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.completeDetails}</h1>
                {!form ? (
                  <div className="mt-7 space-y-4">
                    {Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-20 rounded-xl" key={index} />)}
                  </div>
                ) : (
                  <div className="card mt-7 space-y-5 p-5 sm:p-7">
                    {form.fields.map((field) => (
                      <div key={field.id}>
                        <DynamicField
                          field={field}
                          language={language}
                          value={answers[field.key]}
                          onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
                        />
                        {field.type === "email" && (
                          <label className="mt-5 block">
                            <span className="label">{t.confirmEmail} <span className="text-brand-600">*</span></span>
                            <input
                              className="field"
                              type="email"
                              autoComplete="off"
                              value={confirmEmail}
                              onChange={(e) => setConfirmEmail(e.target.value)}
                              onPaste={(e) => e.preventDefault()}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-5 text-xs font-medium text-slate-500">
                      <LockKeyhole size={15} className="text-emerald-500" />
                      Your information is encrypted and automatically removed after the retention period.
                    </div>
                    <button className="primary-button w-full" disabled={submitting} onClick={submit}>
                      {submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={17} />}
                      {submitting ? t.loading : t.confirmPackage}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              className="mt-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition hover:border-brand-300 hover:text-brand-600 hover:shadow"
              onClick={() => stage === "details" ? setStage("schedule") : onExit()}
            >
              <ArrowLeft size={17} /> {t.back}
            </button>
          </section>

          {/* Summary rail: the full package schedule as it's being built — styled to match ServiceSummary. */}
          <aside className="card overflow-hidden lg:sticky lg:top-6">
            <div className="relative overflow-hidden bg-ink p-5 text-white">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-500/25 blur-2xl" />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-200">{t.packageSchedule}</p>
                <h3 className="mt-3 text-xl font-bold">{localize(pkg.name, language)}</h3>
                {(() => {
                  const { price, note } = priceParts(pkg, t);
                  return price ? (
                    <p className="mt-1 whitespace-nowrap text-2xl font-extrabold text-white">
                      {price}{note && <span className="ml-1.5">{note}</span>}
                    </p>
                  ) : null;
                })()}
                {/* Progress: filled bar + count. */}
                <div className="mt-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${(pickedCount / sessions.length) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-300">{pickedCount}/{sessions.length} {t.sessionsLabel}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 text-brand-600" size={18} />
                <div>
                  <p className="text-sm font-bold text-ink">{center.name}</p>
                  {center.address && <p className="mt-0.5 text-xs leading-5 text-slate-500">{center.address}</p>}
                </div>
              </div>
              {localize(pkg.description, language) && (
                <DescriptionMarkdown text={localize(pkg.description, language)} />
              )}
              <ol className="space-y-1 border-t border-slate-100 pt-4">
                {sessions.map((session, index) => {
                  const isActive = index === activeIndex && stage === "schedule";
                  const hasDescription = Boolean(localize(session.serviceDescription, language).trim());
                  return (
                    <li key={index}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (stage === "schedule") setActiveIndex(index); }}
                        onKeyDown={(e) => { if (stage === "schedule" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setActiveIndex(index); } }}
                        className={clsx(
                          "flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition",
                          isActive ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50",
                          stage === "schedule" ? "cursor-pointer" : "cursor-default hover:bg-transparent"
                        )}
                      >
                        <span className={clsx(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                          session.slot ? "bg-emerald-100 text-emerald-700" : isActive ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                        )}>
                          {session.slot ? <Check size={13} /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 text-xs font-bold text-ink">
                            <span className="truncate">{localize(session.serviceName, language)}</span>
                            {hasDescription && (
                              <button
                                type="button"
                                className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-slate-400 transition hover:text-brand-600"
                                aria-label={`${localize(session.serviceName, language)} — details`}
                                onClick={(e) => { e.stopPropagation(); setDescPopup(session); }}
                              >
                                <Info size={12} />
                              </button>
                            )}
                          </p>
                          <p className={clsx("mt-0.5 text-[11px]", session.slot ? "font-semibold text-slate-600" : "text-slate-400")}>
                            {session.slot
                              ? `${new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: PUBLIC_TIMEZONE }).format(new Date(session.slot.start))} · ${formatSlot(session.slot.start, language)}`
                              : t.notPicked}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4 border-t border-slate-100 pt-4">
                {[t.fastBooking, t.calendarInvite, t.bilingual].map((item) => (
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600" key={item}>
                    <CheckCircle2 className="text-emerald-500" size={15} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
      {!embedded && <footer className="mt-8 border-t border-slate-200 bg-white px-4 py-6 text-center text-xs leading-5 text-slate-500">
        © {new Date().getFullYear()} Easy Driving School · Secure booking powered by Cloudflare
      </footer>}

      {/* On-demand service description popup, opened from a session tab's info icon. */}
      {descPopup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setDescPopup(undefined)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-soft sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Gauge size={20} /></div>
                <div>
                  <h3 className="text-lg font-extrabold text-ink">{localize(descPopup.serviceName, language)}</h3>
                  {descPopup.durationMinutes > 0 && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-500"><Clock3 size={13} /> {descPopup.durationMinutes} min</p>
                  )}
                </div>
              </div>
              <button
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                aria-label="Close"
                onClick={() => setDescPopup(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4">
              <DescriptionMarkdown text={localize(descPopup.serviceDescription, language)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
