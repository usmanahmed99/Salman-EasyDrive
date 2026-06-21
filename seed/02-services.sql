INSERT OR IGNORE INTO services(
  id, slug, name_en, name_fr, description_en, description_fr, duration_minutes,
  buffer_before_minutes, buffer_after_minutes, price_display, form_id, cutoff_hours,
  cancellation_cutoff_hours, base_concurrency, sort_order
) VALUES
  ('svc_road_test', 'road-test-package', 'SAAQ Road Test Package', 'Forfait examen routier SAAQ', '40-minute warm-up, route preparation and dual-brake test car.', 'Échauffement de 40 minutes, préparation au parcours et voiture à double commande.', 120, 15, 15, '$120', 'form_road_test', 4, 24, 4, 0),
  ('svc_rental', 'car-rental', 'Car Rental Only', 'Location de voiture seulement', 'A clean, SAAQ-ready dual-brake vehicle for your road test.', 'Un véhicule propre à double commande, prêt pour votre examen SAAQ.', 90, 15, 15, '$80', 'form_rental', 2, 24, 4, 1),
  ('svc_lesson', 'driving-lesson', '1-Hour Driving Lesson', 'Leçon de conduite d’une heure', 'Focused one-on-one coaching with a certified bilingual instructor.', 'Accompagnement individuel avec un instructeur bilingue certifié.', 60, 10, 10, '$55', 'form_lesson', 2, 12, 4, 2),
  ('svc_mock', 'mock-test', 'Mock Test', 'Examen simulé', 'A realistic practice test with clear feedback before exam day.', 'Un examen pratique réaliste avec rétroaction claire avant le grand jour.', 60, 10, 10, '$60', 'form_lesson', 2, 12, 4, 3),
  ('svc_parking', 'parking-lesson', 'Parking Lesson', 'Leçon de stationnement', 'Parallel, reverse and angle parking coaching.', 'Coaching pour le stationnement parallèle, à reculons et en angle.', 60, 10, 10, '$55', 'form_lesson', 2, 12, 4, 4),
  ('svc_highway', 'highway-lesson', 'Highway Lesson', 'Leçon sur autoroute', 'Merging, lane changes and confident highway driving.', 'Insertion, changements de voie et conduite confiante sur autoroute.', 60, 10, 10, '$60', 'form_lesson', 2, 12, 4, 5);

INSERT OR IGNORE INTO service_centers(service_id, center_id)
SELECT services.id, centers.id FROM services CROSS JOIN centers WHERE centers.id != 'test';
