GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid, uuid) TO authenticated;