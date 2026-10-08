-- Pin the search_path of the append-only trigger function so it cannot be redirected to objects
-- in another schema (Supabase advisor 0011, function_search_path_mutable).
ALTER FUNCTION public.audit_events_append_only() SET search_path = '';
