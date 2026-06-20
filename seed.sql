PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO centers(id, slug, name, address, timezone) VALUES
  ('ctr_laval', 'laval', 'Laval', '1545 Boulevard Le Corbusier, Laval, QC H7S 2K6', 'America/Montreal'),
  ('ctr_kirkland', 'kirkland', 'Kirkland', '17090 Autoroute Transcanadienne, Kirkland, QC H9H 4M7', 'America/Montreal'),
  ('ctr_henri', 'henri-bourassa', 'Henri-Bourassa', '855 Boulevard Henri-Bourassa Ouest, Montréal, QC H3L 1P3', 'America/Montreal');

INSERT OR IGNORE INTO center_hours(id, center_id, day_of_week, start_time, end_time)
SELECT center_id || '_' || day_of_week, center_id, day_of_week, start_time, end_time
FROM (
  SELECT 'ctr_laval' center_id, 1 day_of_week, '08:00' start_time, '18:00' end_time UNION ALL
  SELECT 'ctr_laval', 2, '08:00', '18:00' UNION ALL SELECT 'ctr_laval', 3, '08:00', '18:00' UNION ALL
  SELECT 'ctr_laval', 4, '08:00', '18:00' UNION ALL SELECT 'ctr_laval', 5, '08:00', '18:00' UNION ALL
  SELECT 'ctr_laval', 6, '09:00', '16:00' UNION ALL
  SELECT 'ctr_kirkland', 1, '08:00', '18:00' UNION ALL SELECT 'ctr_kirkland', 2, '08:00', '18:00' UNION ALL
  SELECT 'ctr_kirkland', 3, '08:00', '18:00' UNION ALL SELECT 'ctr_kirkland', 4, '08:00', '18:00' UNION ALL
  SELECT 'ctr_kirkland', 5, '08:00', '18:00' UNION ALL SELECT 'ctr_kirkland', 6, '09:00', '16:00' UNION ALL
  SELECT 'ctr_henri', 1, '08:00', '18:00' UNION ALL SELECT 'ctr_henri', 2, '08:00', '18:00' UNION ALL
  SELECT 'ctr_henri', 3, '08:00', '18:00' UNION ALL SELECT 'ctr_henri', 4, '08:00', '18:00' UNION ALL
  SELECT 'ctr_henri', 5, '08:00', '18:00' UNION ALL SELECT 'ctr_henri', 6, '09:00', '16:00'
);

INSERT OR IGNORE INTO services(
  id, slug, name_en, name_fr, description_en, description_fr, duration_minutes,
  buffer_before_minutes, buffer_after_minutes, price_display, form_id, cutoff_hours,
  cancellation_cutoff_hours, base_concurrency
) VALUES
  ('svc_road_test', 'road-test-package', 'SAAQ Road Test Package', 'Forfait examen routier SAAQ',
   '40-minute warm-up, route preparation and dual-brake test car.',
   'Échauffement de 40 minutes, préparation au parcours et voiture à double commande.',
   120, 15, 15, '$120', 'form_road_test', 4, 24, 4),
  ('svc_rental', 'car-rental', 'Car Rental Only', 'Location de voiture seulement',
   'A clean, SAAQ-ready dual-brake vehicle for your road test.',
   'Un véhicule propre à double commande, prêt pour votre examen SAAQ.',
   90, 15, 15, '$80', 'form_rental', 2, 24, 4),
  ('svc_lesson', 'driving-lesson', '1-Hour Driving Lesson', 'Leçon de conduite d’une heure',
   'Focused one-on-one coaching with a certified bilingual instructor.',
   'Accompagnement individuel avec un instructeur bilingue certifié.',
   60, 10, 10, '$55', 'form_lesson', 2, 12, 4),
  ('svc_mock', 'mock-test', 'Mock Test', 'Examen simulé',
   'A realistic practice test with clear feedback before exam day.',
   'Un examen pratique réaliste avec rétroaction claire avant le grand jour.',
   60, 10, 10, '$60', 'form_lesson', 2, 12, 4),
  ('svc_parking', 'parking-lesson', 'Parking Lesson', 'Leçon de stationnement',
   'Parallel, reverse and angle parking coaching.',
   'Coaching pour le stationnement parallèle, à reculons et en angle.',
   60, 10, 10, '$55', 'form_lesson', 2, 12, 4),
  ('svc_highway', 'highway-lesson', 'Highway Lesson', 'Leçon sur autoroute',
   'Merging, lane changes and confident highway driving.',
   'Insertion, changements de voie et conduite confiante sur autoroute.',
   60, 10, 10, '$60', 'form_lesson', 2, 12, 4);

INSERT OR IGNORE INTO service_centers(service_id, center_id)
SELECT services.id, centers.id FROM services CROSS JOIN centers;

INSERT OR IGNORE INTO forms(id, name, active_version) VALUES
  ('form_road_test', 'Road test package', 1),
  ('form_rental', 'Car rental', 1),
  ('form_lesson', 'Driving lesson', 1);

INSERT OR IGNORE INTO form_versions(id, form_id, version, schema_json) VALUES
  ('fv_road_1', 'form_road_test', 1, '{"id":"form_road_test","name":"Road test package","version":1,"fields":[{"id":"name","key":"fullName","type":"text","label":{"en":"Full name","fr":"Nom complet"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"email","key":"email","type":"email","label":{"en":"Email address","fr":"Adresse courriel"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"phone","key":"phone","type":"phone","label":{"en":"Phone number","fr":"Numéro de téléphone"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"exam","key":"examDateTime","type":"datetime","label":{"en":"Official SAAQ exam date and time","fr":"Date et heure de l’examen SAAQ"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"operational"},{"id":"class","key":"licenseClass","type":"select","label":{"en":"Licence class","fr":"Classe de permis"},"required":true,"options":[{"value":"5","label":{"en":"Class 5 — Passenger vehicle","fr":"Classe 5 — Véhicule de promenade"}}],"retentionCategory":"operational"},{"id":"notes","key":"notes","type":"textarea","label":{"en":"Anything we should know?","fr":"Quelque chose à nous signaler?"},"required":false,"calendarVisible":true,"retentionCategory":"operational"}]}'),
  ('fv_rental_1', 'form_rental', 1, '{"id":"form_rental","name":"Car rental","version":1,"fields":[{"id":"name","key":"fullName","type":"text","label":{"en":"Full name","fr":"Nom complet"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"email","key":"email","type":"email","label":{"en":"Email address","fr":"Adresse courriel"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"phone","key":"phone","type":"phone","label":{"en":"Phone number","fr":"Numéro de téléphone"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"exam","key":"examDateTime","type":"datetime","label":{"en":"Official SAAQ exam date and time","fr":"Date et heure de l’examen SAAQ"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"operational"},{"id":"consent","key":"consent","type":"consent","label":{"en":"I confirm my SAAQ appointment is booked.","fr":"Je confirme que mon rendez-vous SAAQ est réservé."},"required":true,"retentionCategory":"consent"}]}'),
  ('fv_lesson_1', 'form_lesson', 1, '{"id":"form_lesson","name":"Driving lesson","version":1,"fields":[{"id":"name","key":"fullName","type":"text","label":{"en":"Full name","fr":"Nom complet"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"email","key":"email","type":"email","label":{"en":"Email address","fr":"Adresse courriel"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"phone","key":"phone","type":"phone","label":{"en":"Phone number","fr":"Numéro de téléphone"},"required":true,"calendarVisible":true,"adminListVisible":true,"retentionCategory":"contact"},{"id":"experience","key":"experience","type":"radio","label":{"en":"Driving experience","fr":"Expérience de conduite"},"required":true,"options":[{"value":"new","label":{"en":"I’m just starting","fr":"Je débute"}},{"value":"some","label":{"en":"Some practice","fr":"Un peu de pratique"}},{"value":"test","label":{"en":"Preparing for my test","fr":"Je prépare mon examen"}}],"retentionCategory":"operational"},{"id":"area","key":"meetingArea","type":"text","label":{"en":"Preferred meeting area","fr":"Lieu de rencontre souhaité"},"required":false,"calendarVisible":true,"retentionCategory":"operational"}]}');

INSERT OR IGNORE INTO resource_groups(id, center_id, type, name, mode, capacity) VALUES
  ('grp_laval_cars', 'ctr_laval', 'cars', 'Laval Cars', 'pooled', 3),
  ('grp_kirkland_cars', 'ctr_kirkland', 'cars', 'Kirkland Cars', 'pooled', 2),
  ('grp_henri_cars', 'ctr_henri', 'cars', 'Henri-Bourassa Cars', 'pooled', 2),
  ('grp_laval_instructors', 'ctr_laval', 'instructors', 'Laval Instructors', 'named', 2),
  ('grp_kirkland_instructors', 'ctr_kirkland', 'instructors', 'Kirkland Instructors', 'named', 1),
  ('grp_henri_instructors', 'ctr_henri', 'instructors', 'Henri-Bourassa Instructors', 'named', 1);

INSERT OR IGNORE INTO resources(id, group_id, center_id, type, name, email, enabled) VALUES
  ('res_ali', 'grp_laval_instructors', 'ctr_laval', 'instructor', 'Ali', 'ali@example.com', 1),
  ('res_samir', 'grp_laval_instructors', 'ctr_laval', 'instructor', 'Samir', 'samir@example.com', 1),
  ('res_sara', 'grp_kirkland_instructors', 'ctr_kirkland', 'instructor', 'Sara', 'sara@example.com', 1),
  ('res_omar', 'grp_henri_instructors', 'ctr_henri', 'instructor', 'Omar', 'omar@example.com', 1);

INSERT OR IGNORE INTO resource_group_members(group_id, resource_id)
SELECT group_id, id FROM resources;

INSERT OR IGNORE INTO service_resource_requirements(id, service_id, resource_type, units) VALUES
  ('req_rental_car', 'svc_rental', 'cars', 1),
  ('req_road_car', 'svc_road_test', 'cars', 1),
  ('req_road_inst', 'svc_road_test', 'instructors', 1),
  ('req_lesson_car', 'svc_lesson', 'cars', 1),
  ('req_lesson_inst', 'svc_lesson', 'instructors', 1),
  ('req_mock_car', 'svc_mock', 'cars', 1),
  ('req_mock_inst', 'svc_mock', 'instructors', 1),
  ('req_parking_car', 'svc_parking', 'cars', 1),
  ('req_parking_inst', 'svc_parking', 'instructors', 1),
  ('req_highway_car', 'svc_highway', 'cars', 1),
  ('req_highway_inst', 'svc_highway', 'instructors', 1);
