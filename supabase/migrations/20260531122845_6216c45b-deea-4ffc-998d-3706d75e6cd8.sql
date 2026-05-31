-- Wipe all app data
TRUNCATE TABLE public.server_messages, public.server_member_roles, public.server_members, public.server_roles, public.server_channels, public.servers, public.calls, public.messages, public.conversation_members, public.conversations, public.friendships, public.profiles RESTART IDENTITY CASCADE;

-- Delete all auth users (cascades from auth schema)
DELETE FROM auth.users;