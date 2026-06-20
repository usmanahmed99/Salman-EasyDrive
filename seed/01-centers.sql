INSERT OR IGNORE INTO centers(id, slug, name, address, timezone) VALUES
  ('ctr_laval', 'laval', 'Laval', '1545 Boulevard Le Corbusier, Laval, QC H7S 2K6', 'America/Montreal'),
  ('ctr_kirkland', 'kirkland', 'Kirkland', '17090 Autoroute Transcanadienne, Kirkland, QC H9H 4M7', 'America/Montreal'),
  ('ctr_henri', 'henri-bourassa', 'Henri-Bourassa', '855 Boulevard Henri-Bourassa Ouest, Montréal, QC H3L 1P3', 'America/Montreal');

INSERT OR IGNORE INTO center_hours(id, center_id, day_of_week, start_time, end_time) VALUES
  ('ctr_laval_1', 'ctr_laval', 1, '08:00', '18:00'),
  ('ctr_laval_2', 'ctr_laval', 2, '08:00', '18:00'),
  ('ctr_laval_3', 'ctr_laval', 3, '08:00', '18:00'),
  ('ctr_laval_4', 'ctr_laval', 4, '08:00', '18:00'),
  ('ctr_laval_5', 'ctr_laval', 5, '08:00', '18:00'),
  ('ctr_laval_6', 'ctr_laval', 6, '09:00', '16:00'),
  ('ctr_kirkland_1', 'ctr_kirkland', 1, '08:00', '18:00'),
  ('ctr_kirkland_2', 'ctr_kirkland', 2, '08:00', '18:00'),
  ('ctr_kirkland_3', 'ctr_kirkland', 3, '08:00', '18:00'),
  ('ctr_kirkland_4', 'ctr_kirkland', 4, '08:00', '18:00'),
  ('ctr_kirkland_5', 'ctr_kirkland', 5, '08:00', '18:00'),
  ('ctr_kirkland_6', 'ctr_kirkland', 6, '09:00', '16:00'),
  ('ctr_henri_1', 'ctr_henri', 1, '08:00', '18:00'),
  ('ctr_henri_2', 'ctr_henri', 2, '08:00', '18:00'),
  ('ctr_henri_3', 'ctr_henri', 3, '08:00', '18:00'),
  ('ctr_henri_4', 'ctr_henri', 4, '08:00', '18:00'),
  ('ctr_henri_5', 'ctr_henri', 5, '08:00', '18:00'),
  ('ctr_henri_6', 'ctr_henri', 6, '09:00', '16:00');
