REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_org(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_org(uuid, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_org(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid, uuid) TO service_role;