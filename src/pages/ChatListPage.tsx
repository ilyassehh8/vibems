import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import {
  MessageCircle, Users, Sun, Moon, LogOut, UserPlus, Search,
  UsersRound, Globe, Settings, Plus, MoreVertical, Sparkles
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
import { cn } from '@/lib/utils';

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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('chat-list-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fetchConversations(), 800);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
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
    <div className="flex flex-col h-screen bg-background animate-fade-in relative">
      {/* Ambient gradient mesh behind everything */}
      <div className="pointer-events-none absolute inset-0 gradient-mesh opacity-70" aria-hidden />

      {/* Header */}
      <header className="relative flex items-center justify-between px-4 py-3 border-b border-border/60 glass-strong z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="relative press"
            aria-label={t('profile')}
          >
            <div className="absolute -inset-0.5 rounded-full gradient-hero opacity-90 blur-[1px]" />
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="me"
                className="relative w-10 h-10 rounded-full object-cover border-2 border-card"
              />
            ) : (
              <div className="relative w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xs border-2 border-card">
                {myInitials}
              </div>
            )}
          </button>
          <div className="flex flex-col leading-tight">
            <h1 className="text-xl font-extrabold tracking-tight text-gradient-primary">{t('vibe')}</h1>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {conversations.length} {conversations.length === 1 ? 'chat' : 'chats'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={cycleLang} className="text-muted-foreground hover:text-foreground rounded-xl press">
                <Globe className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('language')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/friends')} className="text-muted-foreground hover:text-foreground rounded-xl press">
                <UserPlus className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('friends')}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-xl press">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-2xl border border-border/70 shadow-elevate animate-scale-in">
              <DropdownMenuItem onClick={() => navigate('/profile')} className="rounded-lg cursor-pointer">
                <Settings className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t('profile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/group/new')} className="rounded-lg cursor-pointer">
                <UsersRound className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t('newGroupTooltip')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} className="rounded-lg cursor-pointer">
                {theme === 'light' ? <Moon className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> : <Sun className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />}
                {t('theme')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="rounded-lg cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" /> {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Search */}
      <div className="relative px-4 pt-3 pb-2 z-10">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground rtl:left-auto rtl:right-3.5 transition-colors group-focus-within:text-accent" />
          <Input
            placeholder={t('searchConversations')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-10 h-11 rounded-2xl bg-secondary/70 border border-transparent focus-visible:border-accent/40 focus-visible:bg-card text-foreground placeholder:text-muted-foreground transition-all"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="relative flex-1 overflow-y-auto scrollbar-thin z-10">
        {loading ? (
          <div className="space-y-1 px-4 py-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="w-12 h-12 rounded-full shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded-full shimmer" />
                  <div className="h-3 w-2/3 rounded-full shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 text-muted-foreground gap-4 animate-fade-up px-6 text-center">
            <div className="relative">
              <div className="absolute inset-0 gradient-primary rounded-full blur-2xl opacity-30 animate-pulse" />
              <div className="relative w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center shadow-glow-primary">
                <MessageCircle className="w-9 h-9 text-primary-foreground" strokeWidth={2.2} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-foreground">{t('noConversations')}</p>
              <p className="text-xs text-muted-foreground">Start your first vibe</p>
            </div>
            <Button onClick={() => navigate('/friends')} className="rounded-2xl gradient-primary text-primary-foreground shadow-glow-primary px-5 h-10 press border-0">
              {t('addFriendsToStart')}
            </Button>
          </div>
        ) : (
          <div className="pb-24">
            {filtered.map((conv, idx) => {
              const name = conv.type === 'direct'
                ? (conv.other_user?.display_name || conv.other_user?.username || 'Unknown')
                : (conv.name || 'Group');
              const isOnline = conv.type === 'direct' && conv.other_user?.is_online;
              const avatar = conv.type === 'direct' ? conv.other_user?.avatar_url : null;
              const isGroup = conv.type === 'group';

              return (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  style={{ animationDelay: `${Math.min(idx, 12) * 35}ms` }}
                  className="stagger-item w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 active:bg-secondary/80 transition-colors text-left rtl:text-right group"
                >
                  <div className="relative flex-shrink-0">
                    {isOnline && (
                      <div className="absolute -inset-1 rounded-full bg-online/30 blur-md opacity-60" />
                    )}
                    {avatar ? (
                      <img src={avatar} alt={name} className="relative w-12 h-12 rounded-full object-cover ring-2 ring-card group-hover:ring-accent/30 transition-all" />
                    ) : (
                      <div className={cn(
                        "relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ring-2 ring-card group-hover:ring-accent/30 transition-all",
                        isGroup
                          ? "gradient-primary text-primary-foreground"
                          : "bg-accent/15 text-accent"
                      )}>
                        {isGroup ? <UsersRound className="w-5 h-5" /> : getInitials(name)}
                      </div>
                    )}
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 rtl:right-auto rtl:left-0 block">
                        <span className="relative block w-3.5 h-3.5 rounded-full bg-online border-2 border-card online-pulse" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground truncate tracking-tight">{name}</span>
                      {conv.last_message && (
                        <span className="text-[11px] font-medium text-muted-foreground flex-shrink-0 tabular-nums">
                          {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {conv.last_message?.content || (
                        <span className="italic opacity-70">{t('noMessagesYet')}</span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Floating AI button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate('/ai')}
              className="fixed bottom-36 right-5 rtl:right-auto rtl:left-5 w-12 h-12 rounded-2xl gradient-accent text-accent-foreground shadow-glow-accent flex items-center justify-center press hover:scale-105 transition-transform z-20"
              aria-label="Vibe AI"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Vibe AI</TooltipContent>
        </Tooltip>

        {/* Floating action button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate('/friends')}
              className="fixed bottom-20 right-5 rtl:right-auto rtl:left-5 w-14 h-14 rounded-2xl gradient-primary text-primary-foreground flex items-center justify-center press hover:scale-105 transition-transform z-20 fab-breathe"
              aria-label={t('newChatTooltip')}
            >
              <Plus className="w-6 h-6" strokeWidth={2.4} />
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
