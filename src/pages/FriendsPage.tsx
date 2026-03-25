import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, UserPlus, Check, X, MessageCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Friendship = Tables<'friendships'>;

interface FriendshipWithProfile extends Friendship {
  profile: Profile;
}

const FriendsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'friends' | 'requests' | 'add'>('friends');
  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendshipWithProfile[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipWithProfile[]>([]);
  const [searchUsername, setSearchUsername] = useState('');
  const [friendMessage, setFriendMessage] = useState('');
  const [searchResult, setSearchResult] = useState<Profile | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchFriendships = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!data) return;

    const userIds = data.flatMap(f => [f.requester_id, f.addressee_id]).filter(id => id !== user.id);
    const uniqueIds = [...new Set(userIds)];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('user_id', uniqueIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

    const enriched = data.map(f => ({
      ...f,
      profile: profileMap.get(f.requester_id === user.id ? f.addressee_id : f.requester_id)!,
    })).filter(f => f.profile);

    setFriends(enriched.filter(f => f.status === 'accepted'));
    setIncoming(enriched.filter(f => f.status === 'pending' && f.addressee_id === user.id));
    setOutgoing(enriched.filter(f => f.status === 'pending' && f.requester_id === user.id));
  };

  useEffect(() => { fetchFriendships(); }, [user]);

  const searchUser = async () => {
    if (!searchUsername.trim()) return;
    setSearching(true);
    setSearchResult(null);

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', searchUsername.toLowerCase().trim())
      .single();

    if (data && data.user_id !== user?.id) {
      setSearchResult(data);
    } else if (data?.user_id === user?.id) {
      toast.error("That's you!");
    } else {
      toast.error('User not found');
    }
    setSearching(false);
  };

  const sendRequest = async () => {
    if (!searchResult || !user) return;

    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: searchResult.user_id,
      message: friendMessage || null,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('Friend request already exists');
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success('Friend request sent! 🎉');
    setSearchResult(null);
    setSearchUsername('');
    setFriendMessage('');
    fetchFriendships();
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    toast.success('Friend added!');
    fetchFriendships();
  };

  const rejectRequest = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    fetchFriendships();
  };

  const startChat = async (friendUserId: string) => {
    if (!user) return;

    // Check if direct conversation exists
    const { data: myConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    const { data: theirConvs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', friendUserId);

    const myIds = new Set(myConvs?.map(c => c.conversation_id) || []);
    const commonIds = theirConvs?.filter(c => myIds.has(c.conversation_id)).map(c => c.conversation_id) || [];

    if (commonIds.length > 0) {
      // Check if any are direct conversations
      const { data: directConvs } = await supabase
        .from('conversations')
        .select('id')
        .in('id', commonIds)
        .eq('type', 'direct');

      if (directConvs?.[0]) {
        navigate(`/chat/${directConvs[0].id}`);
        return;
      }
    }

    // Create new conversation
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({ type: 'direct', created_by: user.id })
      .select()
      .single();

    if (newConv) {
      await supabase.from('conversation_members').insert([
        { conversation_id: newConv.id, user_id: user.id, role: 'admin' },
        { conversation_id: newConv.id, user_id: friendUserId, role: 'member' },
      ]);
      navigate(`/chat/${newConv.id}`);
    }
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const tabs = [
    { key: 'friends' as const, label: 'Friends', count: friends.length },
    { key: 'requests' as const, label: 'Requests', count: incoming.length },
    { key: 'add' as const, label: 'Add', count: 0 },
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Friends</h1>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              tab === t.key ? 'text-accent' : 'text-muted-foreground'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 bg-accent text-accent-foreground text-xs px-1.5 py-0.5 rounded-full">
                {t.count}
              </span>
            )}
            {tab === t.key && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'friends' && (
          <div>
            {friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <p className="text-sm">No friends yet</p>
                <Button variant="outline" size="sm" onClick={() => setTab('add')} className="rounded-xl">
                  <UserPlus className="w-4 h-4 mr-2" /> Add friends
                </Button>
              </div>
            ) : (
              friends.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors">
                  <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                    {getInitials(f.profile.display_name || f.profile.username)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{f.profile.display_name || f.profile.username}</p>
                    <p className="text-xs text-muted-foreground">@{f.profile.username}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startChat(f.profile.user_id)}
                    className="text-accent"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'requests' && (
          <div>
            {incoming.length === 0 && outgoing.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                <p className="text-sm">No pending requests</p>
              </div>
            ) : (
              <>
                {incoming.map(f => (
                  <div key={f.id} className="px-4 py-3 border-b border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                        {getInitials(f.profile.display_name || f.profile.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{f.profile.display_name || f.profile.username}</p>
                        <p className="text-xs text-muted-foreground">@{f.profile.username}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" onClick={() => acceptRequest(f.id)} className="w-9 h-9 rounded-full bg-online text-primary-foreground hover:opacity-90">
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => rejectRequest(f.id)} className="w-9 h-9 rounded-full text-muted-foreground">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {f.message && (
                      <p className="mt-2 ml-14 text-sm text-muted-foreground italic">"{f.message}"</p>
                    )}
                  </div>
                ))}
                {outgoing.length > 0 && (
                  <>
                    <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Sent</p>
                    {outgoing.map(f => (
                      <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold text-sm">
                          {getInitials(f.profile.display_name || f.profile.username)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">{f.profile.display_name || f.profile.username}</p>
                          <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'add' && (
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username..."
                  value={searchUsername}
                  onChange={e => setSearchUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUser()}
                  className="pl-10 h-11 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Button
                onClick={searchUser}
                disabled={searching || !searchUsername.trim()}
                className="w-full h-11 rounded-xl gradient-primary text-primary-foreground font-semibold"
              >
                {searching ? 'Searching...' : 'Search'}
              </Button>
            </div>

            {searchResult && (
              <div className="bg-card rounded-2xl p-4 border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                    {getInitials(searchResult.display_name || searchResult.username)}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{searchResult.display_name || searchResult.username}</p>
                    <p className="text-sm text-muted-foreground">@{searchResult.username}</p>
                  </div>
                </div>
                <Input
                  placeholder="Add a message (optional)..."
                  value={friendMessage}
                  onChange={e => setFriendMessage(e.target.value)}
                  className="h-11 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  onClick={sendRequest}
                  className="w-full h-11 rounded-xl gradient-primary text-primary-foreground font-semibold"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Send Friend Request
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendsPage;
