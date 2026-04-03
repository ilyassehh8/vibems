
-- Storage bucket for chat media (audio messages, images, etc.)
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true);

-- Allow authenticated users to upload files
CREATE POLICY "Users can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow anyone to view chat media (public bucket)
CREATE POLICY "Chat media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Calls table
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL,
  call_type text NOT NULL DEFAULT 'audio',
  status text NOT NULL DEFAULT 'ringing',
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view calls in their conversations"
ON public.calls FOR SELECT TO authenticated
USING (is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Members can create calls"
ON public.calls FOR INSERT TO authenticated
WITH CHECK (auth.uid() = caller_id AND is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Members can update calls"
ON public.calls FOR UPDATE TO authenticated
USING (is_conversation_member(conversation_id, auth.uid()));

-- Enable realtime for calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
