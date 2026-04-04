import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

const CreateGroupPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchFriends = async () => {
      const { data } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (!data?.length) return;

      const friendIds = data.map(f =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', friendIds);

      setFriends(profiles || []);
    };
    fetchFriends();
  }, [user]);

  const toggleSelect = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const createGroup = async () => {
    if (!user || selected.size < 2) {
      toast.error('Select at least 2 friends for a group');
      return;
    }
    if (!groupName.trim()) {
      toast.error('Enter a group name');
      return;
    }

    setCreating(true);
    try {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'group',
          name: groupName.trim(),
          created_by: user.id,
        })
        .select('id')
        .single();

      if (convError || !conv) throw convError || new Error('Failed to create group');

      const members = [
        { conversation_id: conv.id, user_id: user.id, role: 'admin' },
        ...[...selected].map(uid => ({
          conversation_id: conv.id,
          user_id: uid,
          role: 'member',
        })),
      ];

      const { error: membersError } = await supabase
        .from('conversation_members')
        .insert(members);

      if (membersError) throw membersError;

      toast.success('Group created!');
      navigate(`/chat/${conv.id}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-3 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">New Group</h1>
          <p className="text-xs text-muted-foreground">
            {selected.size} / {friends.length} selected
          </p>
        </div>
        <Button
          onClick={createGroup}
          disabled={creating || selected.size < 2 || !groupName.trim()}
          size="sm"
          className="rounded-xl gradient-primary text-primary-foreground"
        >
          <Check className="w-4 h-4 mr-1" /> Create
        </Button>
      </header>

      <div className="px-4 py-3 border-b border-border">
        <Input
          placeholder="Group name..."
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          className="h-11 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-border scrollbar-thin">
          {[...selected].map(uid => {
            const f = friends.find(p => p.user_id === uid);
            if (!f) return null;
            return (
              <button
                key={uid}
                onClick={() => toggleSelect(uid)}
                className="flex flex-col items-center gap-1 min-w-[56px]"
              >
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs relative">
                  {getInitials(f.display_name || f.username)}
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
                    <span className="text-[10px] text-destructive-foreground">✕</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">
                  {f.display_name || f.username}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Users className="w-10 h-10 opacity-40" />
            <p className="text-sm">Add friends first to create a group</p>
          </div>
        ) : (
          friends.map(f => {
            const isSelected = selected.has(f.user_id);
            return (
              <button
                key={f.user_id}
                onClick={() => toggleSelect(f.user_id)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-secondary/60'
                }`}
              >
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                    {getInitials(f.display_name || f.username)}
                  </div>
                  {isSelected && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <Check className="w-3 h-3 text-accent-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{f.display_name || f.username}</p>
                  <p className="text-xs text-muted-foreground">@{f.username}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CreateGroupPage;
