import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Users, Hash } from 'lucide-react';

/**
 * Global realtime listener that surfaces notifications for:
 *  - New direct/group messages in conversations the user is a member of
 *  - New messages in community channels the user has joined
 * Suppresses self-sent messages and the chat currently open.
 */
const NotificationsListener = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeRef = useRef(location.pathname);

  useEffect(() => {
    routeRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    let convIds: string[] = [];
    let serverIds: string[] = [];
    let channels: any[] = [];

    const setup = async () => {
      const [{ data: members }, { data: srvMembers }] = await Promise.all([
        supabase.from('conversation_members').select('conversation_id').eq('user_id', user.id),
        supabase.from('server_members').select('server_id').eq('user_id', user.id),
      ]);
      convIds = (members || []).map(m => m.conversation_id);
      serverIds = (srvMembers || []).map(m => m.server_id);

      const msgChannel = supabase
        .channel('notif-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const m: any = payload.new;
          if (m.sender_id === user.id) return;
          if (!convIds.includes(m.conversation_id)) return;
          if (routeRef.current === `/chat/${m.conversation_id}`) return;

          const [{ data: sender }, { data: conv }] = await Promise.all([
            supabase.from('profiles').select('display_name,username').eq('user_id', m.sender_id).maybeSingle(),
            supabase.from('conversations').select('type,name').eq('id', m.conversation_id).maybeSingle(),
          ]);
          const senderName = sender?.display_name || sender?.username || 'Someone';
          const title = conv?.type === 'group'
            ? `${conv?.name || 'Group'} · ${senderName}`
            : senderName;
          const preview = m.type === 'text' ? (m.content || '') : `📎 ${m.type}`;

          toast(title, {
            description: preview.slice(0, 80),
            icon: conv?.type === 'group' ? <Users className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />,
            action: { label: 'Open', onClick: () => navigate(`/chat/${m.conversation_id}`) },
          });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, (payload) => {
          const cm: any = payload.new;
          if (cm.user_id === user.id && !convIds.includes(cm.conversation_id)) {
            convIds.push(cm.conversation_id);
          }
        })
        .subscribe();

      const serverChannel = supabase
        .channel('notif-server-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'server_messages' }, async (payload) => {
          const m: any = payload.new;
          if (m.sender_id === user.id) return;
          if (!serverIds.includes(m.server_id)) return;
          if (routeRef.current.startsWith(`/communities/${m.server_id}`)) return;

          const [{ data: sender }, { data: srv }, { data: ch }] = await Promise.all([
            supabase.from('profiles').select('display_name,username').eq('user_id', m.sender_id).maybeSingle(),
            supabase.from('servers').select('name').eq('id', m.server_id).maybeSingle(),
            supabase.from('server_channels').select('name').eq('id', m.channel_id).maybeSingle(),
          ]);
          const senderName = sender?.display_name || sender?.username || 'Someone';
          toast(`${srv?.name || 'Server'} #${ch?.name || 'channel'}`, {
            description: `${senderName}: ${(m.content || '').slice(0, 80)}`,
            icon: <Hash className="w-4 h-4" />,
            action: { label: 'Open', onClick: () => navigate(`/communities/${m.server_id}`) },
          });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'server_members' }, (payload) => {
          const sm: any = payload.new;
          if (sm.user_id === user.id && !serverIds.includes(sm.server_id)) {
            serverIds.push(sm.server_id);
          }
        })
        .subscribe();

      channels = [msgChannel, serverChannel];
    };

    setup();

    return () => {
      channels.forEach(c => supabase.removeChannel(c));
    };
  }, [user, navigate]);

  return null;
};

export default NotificationsListener;
