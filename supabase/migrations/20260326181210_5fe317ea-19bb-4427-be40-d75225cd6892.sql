
-- Fix conversation_members SELECT policy (was self-referencing cm.conversation_id = cm.conversation_id)
DROP POLICY IF EXISTS "Members can view conversation members" ON public.conversation_members;
CREATE POLICY "Members can view conversation members"
  ON public.conversation_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Fix conversations SELECT policy (was conversation_members.conversation_id = conversation_members.id)
DROP POLICY IF EXISTS "Members can view their conversations" ON public.conversations;
CREATE POLICY "Members can view their conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_members.conversation_id = conversations.id
        AND conversation_members.user_id = auth.uid()
    )
  );

-- Fix conversations UPDATE policy (same bug)
DROP POLICY IF EXISTS "Admins can update conversations" ON public.conversations;
CREATE POLICY "Admins can update conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_members.conversation_id = conversations.id
        AND conversation_members.user_id = auth.uid()
        AND conversation_members.role = 'admin'
    )
  );
