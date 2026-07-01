-- Example package: a "Road Test Prep Bundle" — 3 driving lessons, 1 mock test, 1 road test.
INSERT OR IGNORE INTO packages(
  id, slug, name_en, name_fr, description_en, description_fr, price_display, price_tax_mode, sort_order
) VALUES
  ('pkg_road_test_prep', 'road-test-prep', 'Road Test Prep Bundle', 'Forfait préparation examen routier',
   '3 driving lessons, 1 mock test and the SAAQ road test package — booked together.',
   '3 leçons de conduite, 1 examen simulé et le forfait examen routier SAAQ — réservés ensemble.',
   '$350', 'incl', 0);

-- Both the mock test and road test require the practice lessons (prerequisite_service_id →
-- svc_lesson), demonstrating dependent-session ordering — and each shows a different anchor:
--   mock test → 'prerequisite': schedule lessons first, then the mock test unlocks after them.
--   road test → 'target':       pick the road-test date first, then fit the lessons before it.
INSERT OR IGNORE INTO package_items(id, package_id, service_id, quantity, sort_order, prerequisite_service_id, prerequisite_anchor) VALUES
  ('pki_prep_lesson', 'pkg_road_test_prep', 'svc_lesson', 3, 0, NULL, 'prerequisite'),
  ('pki_prep_mock', 'pkg_road_test_prep', 'svc_mock', 1, 1, 'svc_lesson', 'prerequisite'),
  ('pki_prep_test', 'pkg_road_test_prep', 'svc_road_test', 1, 2, 'svc_lesson', 'target');

INSERT OR IGNORE INTO package_centers(package_id, center_id)
SELECT 'pkg_road_test_prep', centers.id FROM centers WHERE centers.id != 'test';
