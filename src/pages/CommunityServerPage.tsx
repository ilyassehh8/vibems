import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Hash, Plus, Settings, Send, Users, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Channel { id: string; name: string; type: string; position: number; }
interface ServerInfo { id: string; name: string; description: string | null; owner_id: string; }
interface Member { user_id: string; nickname: string | null; profile?: { username: string; display_name: string | null; avatar_url: string | null; }; }
interface Msg {
  id: string; content: string | null; sender_id: string; created_at: string;
  sender?: { username: string; display_name: string | null; avatar_url: string | null };
}

const CommunityServerPage = () => {
  const { id: serverId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [server, setServer] = useState<ServerInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState({ manageChannels: false, manageRoles: false, isOwner: false });
  const [newChannelName, setNewChannelName] = useState('');
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Load server, channels, members, permissions
  useEffect(() => {
    if (!serverId || !user) return;
    setLoading(true);

    (async () => {
      const [serverRes, channelsRes, membersRes, myRolesRes] = await Promise.all([
        supabase.from('servers').select('*').eq('id', serverId).maybeSingle(),
        supabase.from('server_channels').select('*').eq('server_id', serverId).order('position'),
        supabase.from('server_members').select('user_id, nickname').eq('server_id', serverId),
        supabase.from('server_member_roles')
          .select('role_id, server_roles(can_manage_channels, can_manage_roles)')
          .eq('server_id', serverId).eq('user_id', user.id),
      ]);

      if (!serverRes.data) {
        toast.error('Community not found');
        navigate('/communities');
        return;
      }

      setServer(serverRes.data);
      setChannels(channelsRes.data || []);
      setActiveChannel((channelsRes.data || [])[0] || null);

      const isOwner = serverRes.data.owner_id === user.id;
      const myRoles = (myRolesRes.data || []) as any[];
      setPerms({
        isOwner,
        manageChannels: isOwner || myRoles.some(r => r.server_roles?.can_manage_channels),
        manageRoles: isOwner || myRoles.some(r => r.server_roles?.can_manage_roles),
      });

      // member profiles
      const userIds = (membersRes.data || []).map(m => m.user_id);
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('user_id, username, display_name, avatar_url')
          .in('user_id', userIds);
        const pmap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        setMembers((membersRes.data || []).map(m => ({ ...m, profile: pmap.get(m.user_id) as any })));
      }

      setLoading(false);
    })();
  }, [serverId, user, navigate]);

  // Load messages for active channel + realtime
  useEffect(() => {
    if (!activeChannel) { setMessages([]); return; }
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('server_messages')
        .select('*')
        .eq('channel_id', activeChannel.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (cancelled) return;
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      let pmap = new Map<string, any>();
      if (senderIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('user_id, username, display_name, avatar_url')
          .in('user_id', senderIds);
        pmap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      }
      setMessages((data || []).map(m => ({ ...m, sender: pmap.get(m.sender_id) })));
      setTimeout(scrollToBottom, 100);
    })();

    const channel = supabase
      .channel(`server_messages:${activeChannel.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'server_messages',
        filter: `channel_id=eq.${activeChannel.id}`,
      }, async (payload) => {
        const newRow = payload.new as Msg;
        const { data: profile } = await supabase
          .from('profiles').select('username, display_name, avatar_url')
          .eq('user_id', newRow.sender_id).maybeSingle();
        setMessages(prev => prev.some(m => m.id === newRow.id) ? prev : [...prev, { ...newRow, sender: profile || undefined }]);
        setTimeout(scrollToBottom, 80);
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeChannel]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeChannel || !user || !serverId) return;
    const text = newMsg.trim();
    setNewMsg('');
    const { error } = await supabase.from('server_messages').insert({
      channel_id: activeChannel.id, server_id: serverId, sender_id: user.id, content: text,
    });
    if (error) { toast.error(error.message); setNewMsg(text); }
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !serverId) return;
    const { data, error } = await supabase.from('server_channels').insert({
      server_id: serverId, name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
      position: channels.length, type: 'text',
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setChannels(prev => [...prev, data]);
    setActiveChannel(data);
    setNewChannelName('');
    setChannelDialogOpen(false);
  };

  const leaveServer = async () => {
    if (!user || !serverId) return;
    const { error } = await supabase.from('server_members').delete()
      .eq('server_id', serverId).eq('user_id', user.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('left'));
    navigate('/communities');
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-60 border-r border-border p-3 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-4"><Skeleton className="h-12 w-full" /></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Channels sidebar */}
      <aside className="w-60 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <button onClick={() => navigate('/communities')} className="flex items-center gap-2 min-w-0 flex-1">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="font-semibold truncate text-sm">{server?.name}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1 text-xs uppercase font-semibold text-muted-foreground">
            <span>{t('textChannels')}</span>
            {perms.manageChannels && (
              <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
                <DialogTrigger asChild>
                  <button className="hover:text-foreground"><Plus className="w-3.5 h-3.5" /></button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t('createChannel')}</DialogTitle></DialogHeader>
                  <Input
                    value={newChannelName}
                    onChange={e => setNewChannelName(e.target.value)}
                    placeholder={t('channelName')}
                    onKeyDown={e => e.key === 'Enter' && createChannel()}
                  />
                  <DialogFooter>
                    <Button onClick={createChannel} disabled={!newChannelName.trim()}>{t('create')}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          {channels.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveChannel(c)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                activeChannel?.id === c.id
                  ? 'bg-accent/15 text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Hash className="w-4 h-4 shrink-0" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>

        <div className="p-2 border-t border-border flex gap-1">
          {perms.manageRoles && (
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => navigate(`/communities/${serverId}/roles`)}>
              <Shield className="w-4 h-4 mr-1" />{t('roles')}
            </Button>
          )}
          {!perms.isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="flex-1 text-destructive">
                  <LogOut className="w-4 h-4 mr-1" />{t('leaveCommunity')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('confirmLeave')}</AlertDialogTitle>
                  <AlertDialogDescription>{server?.name}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={leaveServer}>{t('leaveCommunity')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </aside>

      {/* Channel chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold truncate">{activeChannel?.name || '—'}</h2>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm"><Users className="w-4 h-4 mr-1" />{members.length}</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>{t('membersList')} ({members.length})</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-2">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-sm font-semibold">
                      {m.profile?.avatar_url
                        ? <img src={m.profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        : (m.profile?.display_name || m.profile?.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {m.nickname || m.profile?.display_name || m.profile?.username || 'Unknown'}
                      </div>
                      {m.user_id === server?.owner_id && (
                        <div className="text-xs text-amber-500">Owner</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
                <Hash className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="font-semibold">{t('welcomeToChannel')} #{activeChannel?.name}</p>
              <p className="text-sm text-muted-foreground">{t('sayHi')}</p>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
                  {m.sender?.avatar_url
                    ? <img src={m.sender.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                    : (m.sender?.display_name || m.sender?.username || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm">{m.sender?.display_name || m.sender?.username || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'p')}</span>
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {activeChannel && (
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(); }}
            className="p-3 border-t border-border bg-card/60 flex gap-2"
          >
            <Input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder={`${t('message')} #${activeChannel.name}`}
              className="flex-1"
            />
            <Button type="submit" disabled={!newMsg.trim()}><Send className="w-4 h-4" /></Button>
          </form>
        )}
      </main>
    </div>
  );
};

export default CommunityServerPage;
