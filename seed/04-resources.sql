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
