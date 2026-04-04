import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Users, Sun, Moon, LogOut, UserPlus, Search, UsersRound, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface ConversationWithDetails {
  id: string;
  type: string;
  name: string | null;
  updated_at: string;
  other_user?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
  };
  last_message?: {
    content: string | null;
    created_at: string;
    sender_id: string;
  };
}

const ChatListPage = () => {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!user) return;

    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (!memberships?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = memberships.map(m => m.conversation_id);

    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    if (!convs) {
      setLoading(false);
      return;
    }

    const detailed: ConversationWithDetails[] = [];

    for (const conv of convs) {
      const item: ConversationWithDetails = { ...conv };

      if (conv.type === 'direct') {
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', user.id);

        if (members?.[0]) {
          const { data: otherProfile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url, is_online')
            .eq('user_id', members[0].user_id)
            .maybeSingle();
          item.other_user = otherProfile || undefined;
        }
      }

      const { data: msgs } = await supabase
        .from('messages')
        .select('content, created_at, sender_id')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (msgs?.[0]) {
        item.last_message = msgs[0];
      }

      detailed.push(item);
    }

    setConversations(detailed);
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();
  }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('chat-list-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const name = c.type === 'direct'
      ? (c.other_user?.display_name || c.other_user?.username || '')
      : (c.name || '');
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const cycleLang = () => {
    const langs = ['en', 'fr', 'ar'] as const;
    const idx = langs.indexOf(language);
    setLanguage(langs[(idx + 1) % langs.length]);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('vibe')}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={cycleLang} className="text-muted-foreground hover:text-foreground">
            <Globe className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/group/new')} className="text-muted-foreground hover:text-foreground">
            <UsersRound className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/friends')} className="text-muted-foreground hover:text-foreground">
            <UserPlus className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-foreground">
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground rtl:left-auto rtl:right-3" />
          <Input
            placeholder={t('searchConversations')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-10 h-10 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">{t('loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-3">
            <Users className="w-12 h-12 opacity-40" />
            <p className="text-sm">{t('noConversations')}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/friends')} className="rounded-xl">
              {t('addFriendsToStart')}
            </Button>
          </div>
        ) : (
          filtered.map(conv => {
            const name = conv.type === 'direct'
              ? (conv.other_user?.display_name || conv.other_user?.username || 'Unknown')
              : (conv.name || 'Group');
            const isOnline = conv.type === 'direct' && conv.other_user?.is_online;

            return (
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors text-left rtl:text-right"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                    {getInitials(name)}
                  </div>
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-3.5 h-3.5 rounded-full bg-online border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground truncate">{name}</span>
                    {conv.last_message && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {conv.last_message?.content || t('noMessagesYet')}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatListPage;
