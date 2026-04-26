import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import {
  MessageCircle, Users, Sun, Moon, LogOut, UserPlus, Search,
  UsersRound, Globe, Settings, Plus, MoreVertical
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import BottomNav from '@/components/BottomNav';
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

    // Batch all three queries in parallel — saves bandwidth and round trips
    const [convsRes, directMembersRes, lastMsgsRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, type, name, updated_at')
        .in('id', convIds)
        .order('updated_at', { ascending: false }),
      supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', convIds)
        .neq('user_id', user.id),
      supabase
        .from('messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ]);

    const convs = convsRes.data;
    if (!convs) {
      setLoading(false);
      return;
    }

    // Build map of other-user per direct conversation
    const otherUserByConv = new Map<string, string>();
    (directMembersRes.data || []).forEach(m => {
      if (!otherUserByConv.has(m.conversation_id)) {
        otherUserByConv.set(m.conversation_id, m.user_id);
      }
    });

    // Fetch all needed profiles in one shot
    const otherUserIds = Array.from(new Set(otherUserByConv.values()));
    const profilesById = new Map<string, any>();
    if (otherUserIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_online')
        .in('user_id', otherUserIds);
      (profiles || []).forEach(p => profilesById.set(p.user_id, p));
    }

    // Reduce messages to last-per-conversation (already ordered desc)
    const lastByConv = new Map<string, any>();
    (lastMsgsRes.data || []).forEach(m => {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    });

    const detailed: ConversationWithDetails[] = convs.map(conv => {
      const item: ConversationWithDetails = { ...conv };
      if (conv.type === 'direct') {
        const otherId = otherUserByConv.get(conv.id);
        if (otherId) item.other_user = profilesById.get(otherId);
      }
      const last = lastByConv.get(conv.id);
      if (last) item.last_message = last;
      return item;
    });

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

  const myInitials = (profile?.display_name || profile?.username || '??').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-screen bg-background animate-fade-in">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/profile')}
            className="relative active:scale-95 transition-transform"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="me"
                className="w-9 h-9 rounded-full object-cover border-2 border-card shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xs shadow-sm">
                {myInitials}
              </div>
            )}
          </button>
          <h1 className="text-xl font-bold text-foreground">{t('vibe')}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={cycleLang} className="text-muted-foreground hover:text-foreground active:scale-95 transition-transform">
                <Globe className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('language')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/friends')} className="text-muted-foreground hover:text-foreground active:scale-95 transition-transform">
                <UserPlus className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('friends')}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground active:scale-95 transition-transform">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <Settings className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t('profile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/group/new')}>
                <UsersRound className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t('newGroupTooltip')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme}>
                {theme === 'light' ? <Moon className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> : <Sun className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />}
                {t('theme')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      <div className="flex-1 overflow-y-auto scrollbar-thin relative">
        {loading ? (
          <div className="space-y-1 px-4 py-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-3 animate-fade-in">
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
            const avatar = conv.type === 'direct' ? conv.other_user?.avatar_url : null;

            return (
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 active:bg-secondary transition-colors text-left rtl:text-right"
              >
                <div className="relative flex-shrink-0">
                  {avatar ? (
                    <img src={avatar} alt={name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                      {getInitials(name)}
                    </div>
                  )}
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

        {/* Floating action button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate('/friends')}
              className="fixed bottom-20 right-5 rtl:right-auto rtl:left-5 w-14 h-14 rounded-full gradient-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-90 hover:scale-105 transition-transform z-10"
              aria-label={t('newChatTooltip')}
            >
              <Plus className="w-6 h-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t('newChatTooltip')}</TooltipContent>
        </Tooltip>
      </div>

      <BottomNav />
    </div>
  );
};

export default ChatListPage;
