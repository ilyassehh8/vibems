
-- Fix infinite recursion: conversation_members SELECT should just check own user_id
DROP POLICY IF EXISTS "Members can view conversation members" ON public.conversation_members;
CREATE POLICY "Members can view conversation members"
  ON public.conversation_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
