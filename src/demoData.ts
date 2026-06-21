import type { BookingForm, Center, Service } from "../shared/types";

export const demoCenters: Center[] = [
  {
    id: "ctr_laval",
    slug: "laval",
    name: "Laval",
    address: "1545 Boulevard Le Corbusier, Laval, QC",
    timezone: "America/Montreal",
    enabled: true
  },
  {
    id: "ctr_kirkland",
    slug: "kirkland",
    name: "Kirkland",
    address: "17090 Autoroute Transcanadienne, Kirkland, QC",
    timezone: "America/Montreal",
    enabled: true
  },
  {
    id: "ctr_henri",
    slug: "henri-bourassa",
    name: "Henri-Bourassa",
    address: "855 Boulevard Henri-Bourassa Ouest, Montréal, QC",
    timezone: "America/Montreal",
    enabled: true
  }
];

export const demoServices: Service[] = [
  {
    id: "svc_road_test",
    slug: "road-test-package",
    name: { en: "SAAQ Road Test Package", fr: "Forfait examen routier SAAQ" },
    description: {
      en: "40-minute warm-up, route preparation and dual-brake test car.",
      fr: "Échauffement de 40 minutes, préparation au parcours et voiture à double commande."
    },
    durationMinutes: 120,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    slotIntervalMinutes: 30,
    priceDisplay: "$120",
    enabled: true,
    formId: "form_road_test",
    cutoffHours: 4,
    cancellationCutoffHours: 24,
    showDuration: true,
    sortOrder: 0
  },
  {
    id: "svc_rental",
    slug: "car-rental",
    name: { en: "Car Rental Only", fr: "Location de voiture seulement" },
    description: {
      en: "A clean, SAAQ-ready dual-brake vehicle for your road test.",
      fr: "Un véhicule propre à double commande, prêt pour votre examen SAAQ."
    },
    durationMinutes: 90,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    slotIntervalMinutes: 30,
    priceDisplay: "$80",
    enabled: true,
    formId: "form_rental",
    cutoffHours: 2,
    cancellationCutoffHours: 24,
    showDuration: true,
    sortOrder: 1
  },
  {
    id: "svc_lesson",
    slug: "driving-lesson",
    name: { en: "1-Hour Driving Lesson", fr: "Leçon de conduite d’une heure" },
    description: {
      en: "Focused one-on-one coaching with a certified bilingual instructor.",
      fr: "Accompagnement individuel avec un instructeur bilingue certifié."
    },
    durationMinutes: 60,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    slotIntervalMinutes: 30,
    priceDisplay: "$55",
    enabled: true,
    formId: "form_lesson",
    cutoffHours: 2,
    cancellationCutoffHours: 12,
    showDuration: true,
    sortOrder: 2
  },
  {
    id: "svc_mock",
    slug: "mock-test",
    name: { en: "Mock Test", fr: "Examen simulé" },
    description: {
      en: "A realistic practice test with clear feedback before exam day.",
      fr: "Un examen pratique réaliste avec rétroaction claire avant le grand jour."
    },
    durationMinutes: 60,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    slotIntervalMinutes: 30,
    priceDisplay: "$60",
    enabled: true,
    formId: "form_lesson",
    cutoffHours: 2,
    showDuration: true,
    sortOrder: 3
  },
  {
    id: "svc_parking",
    slug: "parking-lesson",
    name: { en: "Parking Lesson", fr: "Leçon de stationnement" },
    description: {
      en: "Build confidence with parallel, reverse and angle parking.",
      fr: "Prenez confiance avec le stationnement parallèle, à reculons et en angle."
    },
    durationMinutes: 60,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    slotIntervalMinutes: 30,
    priceDisplay: "$55",
    enabled: true,
    formId: "form_lesson",
    cutoffHours: 2,
    showDuration: true,
    sortOrder: 4
  },
  {
    id: "svc_highway",
    slug: "highway-lesson",
    name: { en: "Highway Lesson", fr: "Leçon sur autoroute" },
    description: {
      en: "Merging, lane changes and confident highway driving.",
      fr: "Insertion, changements de voie et conduite confiante sur autoroute."
    },
    durationMinutes: 60,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    slotIntervalMinutes: 30,
    priceDisplay: "$60",
    enabled: true,
    formId: "form_lesson",
    cutoffHours: 2,
    showDuration: true,
    sortOrder: 5
  }
];

const contactFields = [
  {
    id: "fld_name",
    key: "fullName",
    type: "text" as const,
    label: { en: "Full name", fr: "Nom complet" },
    placeholder: { en: "Your first and last name", fr: "Votre prénom et nom" },
    required: true,
    calendarVisible: true,
    adminListVisible: true,
    retentionCategory: "contact" as const
  },
  {
    id: "fld_email",
    key: "email",
    type: "email" as const,
    label: { en: "Email address", fr: "Adresse courriel" },
    placeholder: { en: "you@example.com", fr: "vous@exemple.com" },
    required: true,
    calendarVisible: true,
    adminListVisible: true,
    retentionCategory: "contact" as const
  },
  {
    id: "fld_phone",
    key: "phone",
    type: "phone" as const,
    label: { en: "Phone number", fr: "Numéro de téléphone" },
    placeholder: { en: "(514) 555-0123", fr: "(514) 555-0123" },
    required: true,
    calendarVisible: true,
    adminListVisible: true,
    retentionCategory: "contact" as const
  }
];

export const demoForms: Record<string, BookingForm> = {
  form_road_test: {
    id: "form_road_test",
    name: "Road test package",
    version: 3,
    fields: [
      ...contactFields,
      {
        id: "fld_exam",
        key: "examDateTime",
        type: "datetime",
        label: { en: "Official SAAQ exam date and time", fr: "Date et heure de l’examen SAAQ" },
        required: true,
        calendarVisible: true,
        adminListVisible: true,
        retentionCategory: "operational"
      },
      {
        id: "fld_class",
        key: "licenseClass",
        type: "select",
        label: { en: "Licence class", fr: "Classe de permis" },
        required: true,
        options: [
          { value: "5", label: { en: "Class 5 — Passenger vehicle", fr: "Classe 5 — Véhicule de promenade" } },
          { value: "6", label: { en: "Class 6 — Motorcycle", fr: "Classe 6 — Motocyclette" } }
        ],
        retentionCategory: "operational"
      },
      {
        id: "fld_notes",
        key: "notes",
        type: "textarea",
        label: { en: "Anything we should know?", fr: "Quelque chose à nous signaler?" },
        placeholder: { en: "Pickup details or accessibility needs", fr: "Détails de rencontre ou besoins d’accessibilité" },
        required: false,
        calendarVisible: true,
        retentionCategory: "operational"
      }
    ]
  },
  form_rental: {
    id: "form_rental",
    name: "Car rental",
    version: 2,
    fields: [
      ...contactFields,
      {
        id: "fld_exam",
        key: "examDateTime",
        type: "datetime",
        label: { en: "Official SAAQ exam date and time", fr: "Date et heure de l’examen SAAQ" },
        required: true,
        calendarVisible: true,
        adminListVisible: true,
        retentionCategory: "operational"
      },
      {
        id: "fld_consent",
        key: "consent",
        type: "consent",
        label: {
          en: "I confirm my SAAQ appointment is booked and the information above is accurate.",
          fr: "Je confirme que mon rendez-vous SAAQ est réservé et que les renseignements sont exacts."
        },
        required: true,
        retentionCategory: "consent"
      }
    ]
  },
  form_lesson: {
    id: "form_lesson",
    name: "Driving lesson",
    version: 1,
    fields: [
      ...contactFields,
      {
        id: "fld_exp",
        key: "experience",
        type: "radio",
        label: { en: "Driving experience", fr: "Expérience de conduite" },
        required: true,
        options: [
          { value: "new", label: { en: "I’m just starting", fr: "Je débute" } },
          { value: "some", label: { en: "Some practice", fr: "Un peu de pratique" } },
          { value: "test", label: { en: "Preparing for my test", fr: "Je prépare mon examen" } }
        ],
        retentionCategory: "operational"
      },
      {
        id: "fld_area",
        key: "meetingArea",
        type: "text",
        label: { en: "Preferred meeting area", fr: "Lieu de rencontre souhaité" },
        required: false,
        calendarVisible: true,
        retentionCategory: "operational"
      }
    ]
  }
};
