import { useEffect, useMemo, useState } from "react";
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
  Languages,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, format, isBefore, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfWeek, startOfDay } from "date-fns";
import clsx from "clsx";
import { copy, getLanguage } from "./i18n";
import { createBooking, getAvailability, getCenters, getForm, getPublicConfig, getServices } from "./api";
import type {
  BookingConfirmation,
  BookingForm,
  Center,
  FormField,
  Language,
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

function formatSlot(iso: string, language: Language) {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto"
  }).format(new Date(iso));
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
  const [config, setConfig] = useState<PublicConfig>();
  const [centers, setCenters] = useState<Center[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [center, setCenter] = useState<Center>();
  const [service, setService] = useState<Service>();
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
    getServices(center.slug).then((nextServices) => {
      setServices(nextServices);
      const matched = nextServices.find((item) => item.slug === preselectedService);
      if (matched) {
        setService(matched);
        setStage("schedule");
      }
      setLoading(false);
    });
  }, [center, preselectedService]);

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
      // Seed default selections for select/radio fields not yet answered.
      setAnswers((current) => {
        const seeded = { ...current };
        for (const field of loaded.fields) {
          if (field.defaultValue !== undefined && seeded[field.key] === undefined) {
            seeded[field.key] = field.defaultValue;
          }
        }
        return seeded;
      });
    });
  }, [service, stage]);

  const chooseCenter = (nextCenter: Center) => {
    setCenter(nextCenter);
    setService(undefined);
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
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              className="primary-button"
              href={`/booking/${confirmation.reference}?token=${encodeURIComponent(confirmation.manageToken || "")}`}
            >
              {t.manage} <ArrowRight size={17} />
            </a>
            <button className="secondary-button" onClick={() => window.location.assign(`/book?lang=${language}`)}>
              {t.another}
            </button>
          </div>
        </main>
      </div>
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
              <button className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-ink" onClick={goBack}>
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

            {stage === "service" && (
              <div>
                <p className="eyebrow">{center?.name}</p>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t.chooseService}</h1>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {loading
                    ? Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-44 rounded-2xl" key={index} />)
                    : services.map((item) => (
                        <button
                          className="card group flex min-h-44 flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft sm:p-5"
                          onClick={() => chooseService(item)}
                          key={item.id}
                        >
                          <div className="flex w-full items-start justify-between gap-4">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                              <Gauge size={20} />
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
                      ))}
                </div>
              </div>
            )}

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
