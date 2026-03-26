import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Send, MoreVertical, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
        .maybeSingle();

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
            .maybeSingle();
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
          .maybeSingle();

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

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date: string) => format(new Date(date), 'HH:mm');

  const formatDateHeader = (date: string) => {
    const d = new Date(date);
    if (isToday(d)) return 'TODAY';
    if (isYesterday(d)) return 'YESTERDAY';
    return format(d, 'MMMM d, yyyy').toUpperCase();
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
      {/* WhatsApp-style Header */}
      <header className="flex items-center gap-2 px-2 py-2 bg-card border-b border-border shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-muted-foreground h-9 w-9">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              {chatName.slice(0, 2).toUpperCase()}
            </div>
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-online border-2 border-card" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground text-[15px] truncate leading-tight">{chatName}</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {isOnline ? 'online' : 'offline'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground h-9 w-9">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </header>

      {/* Messages area with wallpaper */}
      <div className="flex-1 overflow-y-auto chat-wallpaper px-3 py-2 scrollbar-thin">
        {groupedMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="bg-card/80 backdrop-blur-sm rounded-xl px-6 py-4 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">Send a message to start the conversation</p>
            </div>
          </div>
        )}
        {groupedMessages.map(group => (
          <div key={group.date}>
            <div className="flex justify-center my-3">
              <span className="text-[11px] font-medium text-muted-foreground bg-card/80 backdrop-blur-sm px-3 py-1 rounded-lg shadow-sm">
                {formatDateHeader(group.messages[0].created_at)}
              </span>
            </div>
            {group.messages.map((msg, i) => {
              const isMine = msg.sender_id === user?.id;
              const isFirstInGroup = i === 0 || group.messages[i - 1]?.sender_id !== msg.sender_id;
              const isLastInGroup = i === group.messages.length - 1 || group.messages[i + 1]?.sender_id !== msg.sender_id;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-2' : 'mb-0.5'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-1.5 shadow-sm ${
                      isMine
                        ? `bg-chat-sent text-chat-sent-foreground ${isLastInGroup ? 'rounded-2xl rounded-br-sm chat-bubble-tail-sent' : 'rounded-2xl'}`
                        : `bg-chat-received text-chat-received-foreground ${isLastInGroup ? 'rounded-2xl rounded-bl-sm chat-bubble-tail-received' : 'rounded-2xl'}`
                    }`}
                  >
                    {!isMine && isFirstInGroup && (
                      <p className="text-[11px] font-semibold text-accent mb-0.5">
                        {msg.sender_profile?.display_name || msg.sender_profile?.username}
                      </p>
                    )}
                    <div className="flex items-end gap-2">
                      <p className="text-[14px] leading-[1.35] break-words whitespace-pre-wrap flex-1">{msg.content}</p>
                      <span className={`text-[10px] flex-shrink-0 flex items-center gap-0.5 translate-y-0.5 ${
                        isMine ? 'text-chat-sent-foreground/60' : 'text-chat-timestamp'
                      }`}>
                        {formatTime(msg.created_at)}
                        {isMine && <CheckCheck className="w-3.5 h-3.5 inline-block ml-0.5" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* WhatsApp-style Input */}
      <div className="px-2 py-2 bg-background border-t border-border">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-card rounded-3xl border border-border px-4 py-2 flex items-end min-h-[44px]">
            <textarea
              ref={inputRef}
              placeholder="Message"
              value={newMessage}
              onChange={e => {
                setNewMessage(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-[15px] resize-none outline-none leading-[1.35] max-h-[120px]"
              style={{ height: 'auto' }}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            size="icon"
            className="w-11 h-11 rounded-full gradient-primary text-primary-foreground shadow-md hover:opacity-90 transition-opacity flex-shrink-0 mb-0.5"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
