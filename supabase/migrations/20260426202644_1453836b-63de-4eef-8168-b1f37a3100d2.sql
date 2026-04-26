-- =========================================
-- COMMUNITIES (Discord-style) SCHEMA
-- =========================================

-- Servers (communities)
CREATE TABLE public.servers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  owner_id UUID NOT NULL,
  invite_code TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 0, 9),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channels
CREATE TABLE public.server_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles
CREATE TABLE public.server_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#99AAB5',
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  can_manage_server BOOLEAN NOT NULL DEFAULT false,
  can_manage_channels BOOLEAN NOT NULL DEFAULT false,
  can_manage_roles BOOLEAN NOT NULL DEFAULT false,
  can_manage_messages BOOLEAN NOT NULL DEFAULT false,
  can_kick BOOLEAN NOT NULL DEFAULT false,
  can_ban BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server members
CREATE TABLE public.server_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  nickname TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id)
);

-- Member <-> Role link
CREATE TABLE public.server_member_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id, role_id)
);

-- Channel messages
CREATE TABLE public.server_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.server_channels(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  reply_to UUID,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_server_channels_server ON public.server_channels(server_id);
CREATE INDEX idx_server_roles_server ON public.server_roles(server_id);
CREATE INDEX idx_server_members_server ON public.server_members(server_id);
CREATE INDEX idx_server_members_user ON public.server_members(user_id);
CREATE INDEX idx_server_member_roles_user ON public.server_member_roles(server_id, user_id);
CREATE INDEX idx_server_messages_channel ON public.server_messages(channel_id, created_at DESC);

-- =========================================
-- SECURITY DEFINER HELPERS
-- =========================================

CREATE OR REPLACE FUNCTION public.is_server_member(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = _server_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_server_owner(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers
    WHERE id = _server_id AND owner_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_server_permission(_server_id UUID, _user_id UUID, _perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner BOOLEAN;
  v_has BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.servers WHERE id = _server_id AND owner_id = _user_id)
    INTO v_owner;
  IF v_owner THEN
    RETURN TRUE;
  END IF;

  EXECUTE format('
    SELECT EXISTS (
      SELECT 1
      FROM public.server_member_roles smr
      JOIN public.server_roles sr ON sr.id = smr.role_id
      WHERE smr.server_id = $1 AND smr.user_id = $2 AND sr.%I = true
    )', _perm)
  INTO v_has
  USING _server_id, _user_id;

  RETURN COALESCE(v_has, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_server_public(_server_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.servers WHERE id = _server_id AND is_public = true);
$$;

-- =========================================
-- AUTO-PROVISION TRIGGER ON NEW SERVER
-- =========================================

CREATE OR REPLACE FUNCTION public.handle_new_server()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  owner_role_id UUID;
BEGIN
  -- Default @everyone role
  INSERT INTO public.server_roles (server_id, name, color, position, is_default)
  VALUES (NEW.id, '@everyone', '#99AAB5', 0, true);

  -- Owner role with all permissions
  INSERT INTO public.server_roles (
    server_id, name, color, position, is_default,
    can_manage_server, can_manage_channels, can_manage_roles,
    can_manage_messages, can_kick, can_ban
  )
  VALUES (NEW.id, 'Owner', '#F59E0B', 100, false, true, true, true, true, true, true)
  RETURNING id INTO owner_role_id;

  -- Default general channel
  INSERT INTO public.server_channels (server_id, name, description, type, position)
  VALUES (NEW.id, 'general', 'General discussion', 'text', 0);

  -- Add owner as member
  INSERT INTO public.server_members (server_id, user_id)
  VALUES (NEW.id, NEW.owner_id);

  -- Assign owner role
  INSERT INTO public.server_member_roles (server_id, user_id, role_id)
  VALUES (NEW.id, NEW.owner_id, owner_role_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_server_created
  AFTER INSERT ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();

-- updated_at triggers
CREATE TRIGGER update_servers_updated_at
  BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_server_channels_updated_at
  BEFORE UPDATE ON public.server_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_server_messages_updated_at
  BEFORE UPDATE ON public.server_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- ENABLE RLS
-- =========================================

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_messages ENABLE ROW LEVEL SECURITY;

-- =========================================
-- POLICIES: servers
-- =========================================
CREATE POLICY "Public servers are viewable by all authed users"
ON public.servers FOR SELECT TO authenticated
USING (is_public = true OR is_server_member(id, auth.uid()) OR owner_id = auth.uid());

CREATE POLICY "Users can create servers"
ON public.servers FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner or manage_server can update"
ON public.servers FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR has_server_permission(id, auth.uid(), 'can_manage_server'));

CREATE POLICY "Owner can delete server"
ON public.servers FOR DELETE TO authenticated
USING (owner_id = auth.uid());

-- =========================================
-- POLICIES: server_channels
-- =========================================
CREATE POLICY "View channels of public or joined servers"
ON public.server_channels FOR SELECT TO authenticated
USING (is_server_public(server_id) OR is_server_member(server_id, auth.uid()));

CREATE POLICY "Manage channels permission can insert"
ON public.server_channels FOR INSERT TO authenticated
WITH CHECK (has_server_permission(server_id, auth.uid(), 'can_manage_channels'));

CREATE POLICY "Manage channels permission can update"
ON public.server_channels FOR UPDATE TO authenticated
USING (has_server_permission(server_id, auth.uid(), 'can_manage_channels'));

CREATE POLICY "Manage channels permission can delete"
ON public.server_channels FOR DELETE TO authenticated
USING (has_server_permission(server_id, auth.uid(), 'can_manage_channels'));

-- =========================================
-- POLICIES: server_roles
-- =========================================
CREATE POLICY "View roles of public or joined servers"
ON public.server_roles FOR SELECT TO authenticated
USING (is_server_public(server_id) OR is_server_member(server_id, auth.uid()));

CREATE POLICY "Manage roles permission can insert"
ON public.server_roles FOR INSERT TO authenticated
WITH CHECK (has_server_permission(server_id, auth.uid(), 'can_manage_roles'));

CREATE POLICY "Manage roles permission can update"
ON public.server_roles FOR UPDATE TO authenticated
USING (has_server_permission(server_id, auth.uid(), 'can_manage_roles'));

CREATE POLICY "Manage roles permission can delete"
ON public.server_roles FOR DELETE TO authenticated
USING (has_server_permission(server_id, auth.uid(), 'can_manage_roles'));

-- =========================================
-- POLICIES: server_members
-- =========================================
CREATE POLICY "View members of public or joined servers"
ON public.server_members FOR SELECT TO authenticated
USING (is_server_public(server_id) OR is_server_member(server_id, auth.uid()));

CREATE POLICY "Users can join public servers"
ON public.server_members FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND is_server_public(server_id));

CREATE POLICY "Members can leave (or kickers can remove)"
ON public.server_members FOR DELETE TO authenticated
USING (auth.uid() = user_id OR has_server_permission(server_id, auth.uid(), 'can_kick'));

CREATE POLICY "Members can update own nickname"
ON public.server_members FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- =========================================
-- POLICIES: server_member_roles
-- =========================================
CREATE POLICY "View role assignments in viewable servers"
ON public.server_member_roles FOR SELECT TO authenticated
USING (is_server_public(server_id) OR is_server_member(server_id, auth.uid()));

CREATE POLICY "Manage roles can assign"
ON public.server_member_roles FOR INSERT TO authenticated
WITH CHECK (has_server_permission(server_id, auth.uid(), 'can_manage_roles'));

CREATE POLICY "Manage roles can revoke"
ON public.server_member_roles FOR DELETE TO authenticated
USING (has_server_permission(server_id, auth.uid(), 'can_manage_roles'));

-- =========================================
-- POLICIES: server_messages
-- =========================================
CREATE POLICY "View messages in joined servers"
ON public.server_messages FOR SELECT TO authenticated
USING (is_server_member(server_id, auth.uid()));

CREATE POLICY "Members can post messages"
ON public.server_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id AND is_server_member(server_id, auth.uid()));

CREATE POLICY "Senders can update own messages"
ON public.server_messages FOR UPDATE TO authenticated
USING (auth.uid() = sender_id);

CREATE POLICY "Senders or moderators can delete messages"
ON public.server_messages FOR DELETE TO authenticated
USING (auth.uid() = sender_id OR has_server_permission(server_id, auth.uid(), 'can_manage_messages'));

-- =========================================
-- REALTIME
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;