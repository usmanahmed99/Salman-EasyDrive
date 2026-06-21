-- Add show_duration flag so admins can hide duration from booking summary for specific services.
ALTER TABLE services ADD COLUMN show_duration INTEGER NOT NULL DEFAULT 1;
