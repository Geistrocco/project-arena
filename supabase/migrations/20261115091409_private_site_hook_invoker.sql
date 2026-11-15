-- This hook needs no elevated privileges: only get_site_access reads private data.
alter function public.enforce_private_site() security invoker;
