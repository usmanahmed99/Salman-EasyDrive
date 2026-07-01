import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, Clock3, Home, LoaderCircle, MapPin, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cancelManagedBooking, getManagedBooking } from "./api";
import { getLanguage } from "./i18n";
import type { Language, ManagedBooking } from "../shared/types";

const text = {
  en: {
    title: "Manage your booking",
    loading: "Loading your booking…",
    notFound: "This booking link is invalid or has expired. Please check the link in your confirmation, or contact us.",
    schedule: "Schedule",
    service: "Service",
    location: "Location",
    reference: "Reference",
    cancel: "Cancel this booking",
    cancelling: "Cancelling…",
    confirmTitle: "Cancel this booking?",
    confirmBody: "This frees the slot for others and removes the event from the calendar. You'll get a cancellation email. This cannot be undone.",
    confirmYes: "Yes, cancel it",
    keep: "Keep booking",
    cancelledTitle: "Booking cancelled",
    cancelledBody: "Your booking has been cancelled and the calendar event removed. A confirmation has been emailed to you.",
    alreadyCancelled: "This booking is already cancelled.",
    book: "Book another session",
    backHome: "Back to booking",
    backToSite: "Back to main website"
  },
  fr: {
    title: "Gérer votre réservation",
    loading: "Chargement de votre réservation…",
    notFound: "Ce lien de réservation est invalide ou a expiré. Vérifiez le lien dans votre confirmation ou contactez-nous.",
    schedule: "Horaire",
    service: "Service",
    location: "Endroit",
    reference: "Référence",
    cancel: "Annuler cette réservation",
    cancelling: "Annulation…",
    confirmTitle: "Annuler cette réservation ?",
    confirmBody: "Cela libère la plage pour d'autres et retire l'événement du calendrier. Vous recevrez un courriel d'annulation. Action irréversible.",
    confirmYes: "Oui, annuler",
    keep: "Garder la réservation",
    cancelledTitle: "Réservation annulée",
    cancelledBody: "Votre réservation a été annulée et l'événement retiré du calendrier. Une confirmation vous a été envoyée par courriel.",
    alreadyCancelled: "Cette réservation est déjà annulée.",
    book: "Réserver une autre séance",
    backHome: "Retour à la réservation",
    backToSite: "Retour au site principal"
  }
};

function isCancelled(status: string) {
  return status.startsWith("cancelled");
}

export default function ManageBooking() {
  const language: Language = getLanguage();
  const t = text[language];
  const reference = decodeURIComponent(window.location.pathname.split("/booking/")[1] || "");
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const embedded = params.get("embed") === "1";
  const bookHref = `/book?lang=${language}${embedded ? "&embed=1" : ""}`;

  const [booking, setBooking] = useState<ManagedBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!reference || !token) {
      setError(t.notFound);
      setLoading(false);
      return;
    }
    getManagedBooking(reference, token)
      .then((data) => setBooking(data))
      .catch(() => setError(t.notFound))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, token]);

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await cancelManagedBooking(reference, token);
      setCancelled(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed.");
      setConfirming(false);
    } finally {
      setCancelling(false);
    }
  };

  const serviceName = booking ? (language === "fr" ? booking.name_fr : booking.name_en) : "";

  return (
    <div className="min-h-screen bg-slate-50">
      {!embedded && <header className="border-b border-slate-200/70 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
        <a className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-ink" href={bookHref}>
          <ArrowLeft size={16} /> {t.backHome}
        </a>
      </header>}

      <main className="mx-auto max-w-lg px-4 py-7 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-extrabold text-ink">{t.title}</h1>

        {loading && (
          <div className="mt-8 flex items-center gap-2 text-slate-500">
            <LoaderCircle className="animate-spin" size={18} /> {t.loading}
          </div>
        )}

        {!loading && error && !booking && (
          <div className="mt-8 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} /> {error}
          </div>
        )}

        {!loading && booking && (
          <>
            {cancelled || isCancelled(booking.status) ? (
              <div className="mt-8 card p-5 text-center sm:p-6">
                <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
                <h2 className="mt-4 text-lg font-extrabold text-ink">
                  {cancelled ? t.cancelledTitle : t.alreadyCancelled}
                </h2>
                {cancelled && <p className="mt-2 text-sm text-slate-500">{t.cancelledBody}</p>}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <a className="secondary-button w-full justify-center sm:order-1" href={bookHref}>
                    {t.book}
                  </a>
                  <a className="primary-button w-full justify-center sm:order-2" href="https://easydriving.ca" target="_top" rel="noopener">
                    <Home size={17} /> {t.backToSite} <ArrowRight size={17} />
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-6 card overflow-hidden">
                  <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
                    <div className="bg-white p-4 sm:p-5">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <Clock3 size={13} /> {t.schedule}
                      </p>
                      <p className="mt-1 font-bold text-ink">
                        {format(new Date(booking.start_at), "EEE, MMM d")} · {format(new Date(booking.start_at), "h:mm a")}
                      </p>
                    </div>
                    <div className="bg-white p-4 sm:p-5">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <CalendarCheck size={13} /> {t.service}
                      </p>
                      <p className="mt-1 font-bold text-ink">{serviceName}</p>
                    </div>
                    <div className="bg-white p-4 sm:p-5">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <MapPin size={13} /> {t.location}
                      </p>
                      <p className="mt-1 font-bold text-ink">{booking.center_name}</p>
                    </div>
                    <div className="bg-white p-4 sm:p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.reference}</p>
                      <p className="mt-1 font-mono font-bold text-ink">{booking.reference}</p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} /> {error}
                  </div>
                )}

                {!confirming ? (
                  <button
                    className="secondary-button mt-6 w-full justify-center border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setConfirming(true)}
                  >
                    <XCircle size={16} /> {t.cancel}
                  </button>
                ) : (
                  <div className="mt-6 card border-red-100 p-4 sm:p-5">
                    <h3 className="font-extrabold text-ink">{t.confirmTitle}</h3>
                    <p className="mt-2 text-sm text-slate-500">{t.confirmBody}</p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        className="primary-button flex-1 justify-center bg-red-600 hover:bg-red-700"
                        disabled={cancelling}
                        onClick={cancel}
                      >
                        {cancelling ? <LoaderCircle className="animate-spin" size={16} /> : <XCircle size={16} />}
                        {cancelling ? t.cancelling : t.confirmYes}
                      </button>
                      <button className="secondary-button flex-1 justify-center" disabled={cancelling} onClick={() => setConfirming(false)}>
                        {t.keep}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
