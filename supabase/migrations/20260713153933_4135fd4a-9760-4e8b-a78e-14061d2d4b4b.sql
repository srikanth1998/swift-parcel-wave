
REVOKE EXECUTE ON FUNCTION public.get_wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO service_role;
