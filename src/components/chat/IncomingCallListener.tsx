import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import CallScreen from './CallScreen';

interface IncomingCall {
  id: string;
  conversation_id: string;
  caller_id: string;
  call_type: 'audio' | 'video';
  callerName: string;
}

const IncomingCallListener = () => {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    if (!user) return;

    // Listen for new calls via postgres_changes on the calls table
    const channel = supabase
      .channel('global-incoming-calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        async (payload) => {
          const call = payload.new as any;
          // Only show if this call is NOT from us and we are a member of the conversation
          if (call.caller_id === user.id) return;
          if (call.status !== 'ringing') return;

          // Check if we're a member of this conversation
          const { data: membership } = await supabase
            .from('conversation_members')
            .select('id')
            .eq('conversation_id', call.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!membership) return;

          // Get caller name
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('user_id', call.caller_id)
            .maybeSingle();

          setIncomingCall({
            id: call.id,
            conversation_id: call.conversation_id,
            caller_id: call.caller_id,
            call_type: call.call_type as 'audio' | 'video',
            callerName: callerProfile?.display_name || callerProfile?.username || 'Unknown',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!incomingCall || !user) return null;

  return (
    <CallScreen
      conversationId={incomingCall.conversation_id}
      userId={user.id}
      otherUserName={incomingCall.callerName}
      callType={incomingCall.call_type}
      isIncoming={true}
      callId={incomingCall.id}
      onClose={() => setIncomingCall(null)}
    />
  );
};

export default IncomingCallListener;
