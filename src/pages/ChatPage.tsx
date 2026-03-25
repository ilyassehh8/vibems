import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Send, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, isToday, isYesterday } from 'date-fns';
import { Tables } from '@/integrations/supabase/types';

type Message = Tables<'messages'> & {
  sender_profile?: { username: string; display_name: string | null; avatar_url: string | null };
};

const ChatPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatName, setChatName] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!id || !user) return;

    const fetchChatInfo = async () => {
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (conv?.type === 'direct') {
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', id)
          .neq('user_id', user.id);

        if (members?.[0]) {
          const { data: p } = await supabase
            .from('profiles')
            .select('username, display_name, is_online')
            .eq('user_id', members[0].user_id)
            .single();
          setChatName(p?.display_name || p?.username || 'Chat');
          setIsOnline(p?.is_online || false);
        }
      } else {
        setChatName(conv?.name || 'Group Chat');
      }
    };

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (data) {
        // Fetch sender profiles
        const senderIds = [...new Set(data.map(m => m.sender_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', senderIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        const enriched = data.map(m => ({
          ...m,
          sender_profile: profileMap.get(m.sender_id) || undefined,
        }));

        setMessages(enriched);
        setTimeout(scrollToBottom, 100);
      }
    };

    fetchChatInfo();
    fetchMessages();

    // Realtime
    const channel = supabase
      .channel(`chat-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, async (payload) => {
        const msg = payload.new as Tables<'messages'>;
        const { data: p } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .eq('user_id', msg.sender_id)
          .single();

        setMessages(prev => [...prev, { ...msg, sender_profile: p || undefined }]);
        setTimeout(scrollToBottom, 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, user]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !id || !user || sending) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: user.id,
      content,
      type: 'text',
    });

    if (error) {
      setNewMessage(content);
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    setSending(false);
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    return format(d, 'HH:mm');
  };

  const formatDateHeader = (date: string) => {
    const d = new Date(date);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMMM d, yyyy');
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const dateKey = format(new Date(msg.created_at), 'yyyy-MM-dd');
    const last = groupedMessages[groupedMessages.length - 1];
    if (last?.date === dateKey) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateKey, messages: [msg] });
    }
  });

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs">
              {chatName.slice(0, 2).toUpperCase()}
            </div>
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-card" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground truncate">{chatName}</h2>
            <p className="text-xs text-muted-foreground">
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
        {groupedMessages.map(group => (
          <div key={group.date}>
            <div className="flex justify-center my-4">
              <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {formatDateHeader(group.messages[0].created_at)}
              </span>
            </div>
            {group.messages.map((msg, i) => {
              const isMine = msg.sender_id === user?.id;
              const showAvatar = !isMine && (i === 0 || group.messages[i - 1]?.sender_id !== msg.sender_id);

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-2.5 ${
                      isMine
                        ? 'bg-chat-sent text-chat-sent-foreground rounded-2xl rounded-br-md'
                        : 'bg-chat-received text-chat-received-foreground rounded-2xl rounded-bl-md'
                    }`}
                  >
                    {!isMine && showAvatar && (
                      <p className="text-xs font-semibold text-accent mb-1">
                        {msg.sender_profile?.display_name || msg.sender_profile?.username}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-chat-sent-foreground/60' : 'text-chat-timestamp'} text-right`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border bg-card">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex items-center gap-2"
        >
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            className="flex-1 h-11 rounded-full bg-secondary border-0 px-4 text-foreground placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || sending}
            className="w-11 h-11 rounded-full gradient-primary text-primary-foreground shadow-md hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatPage;
