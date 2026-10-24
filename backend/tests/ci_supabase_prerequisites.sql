-- Synthetic Supabase dependencies for the disposable CI PostgreSQL service only.
-- These are not substitutes for hosted Auth, Storage, PostgREST or JWT verification.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'mend_ci' OR EXISTS (SELECT FROM pg_namespace WHERE nspname = 'auth') THEN
    RAISE EXCEPTION 'Requires an empty disposable mend_ci database';
  END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id text, name text);
