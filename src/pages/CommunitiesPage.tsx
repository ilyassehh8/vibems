import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Globe, Plus, Users, Search, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';

interface Server {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  owner_id: string;
  member_count?: number;
  is_member?: boolean;
}

const CommunitiesPage = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [discover, setDiscover] = useState<Server[]>([]);
  const [mine, setMine] = useState<Server[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const [allRes, memberRes] = await Promise.all([
      supabase.from('servers').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(50),
      supabase.from('server_members').select('server_id').eq('user_id', user.id),
    ]);

    const memberIds = new Set((memberRes.data || []).map(m => m.server_id));
    const all = (allRes.data || []) as Server[];

    // counts
    if (all.length) {
      const { data: counts } = await supabase
        .from('server_members')
        .select('server_id')
        .in('server_id', all.map(s => s.id));
      const countMap = new Map<string, number>();
      (counts || []).forEach(c => countMap.set(c.server_id, (countMap.get(c.server_id) || 0) + 1));
      all.forEach(s => {
        s.member_count = countMap.get(s.id) || 0;
        s.is_member = memberIds.has(s.id);
      });
    }

    setDiscover(all.filter(s => !s.is_member));
    setMine(all.filter(s => s.is_member));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const join = async (serverId: string) => {
    if (!user) return;
    const { error } = await supabase.from('server_members').insert({ server_id: serverId, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success(t('joinedCommunity'));
    navigate(`/communities/${serverId}`);
  };

  const filtered = (list: Server[]) =>
    list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const ServerCard = ({ s, joined }: { s: Server; joined: boolean }) => (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card hover:bg-accent/5 border border-border transition-all">
      <div
        className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-lg shrink-0 cursor-pointer"
        onClick={() => joined && navigate(`/communities/${s.id}`)}
      >
        {s.icon_url ? <img src={s.icon_url} alt={s.name} className="w-full h-full rounded-2xl object-cover" /> : s.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => joined && navigate(`/communities/${s.id}`)}>
        <div className="font-semibold truncate">{s.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          <Users className="inline w-3 h-3 mr-1" />
          {s.member_count || 0} {(s.member_count || 0) === 1 ? t('member') : t('members')}
          {s.description ? ` · ${s.description}` : ''}
        </div>
      </div>
      {joined ? (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/communities/${s.id}`)}>{t('open')}</Button>
      ) : (
        <Button size="sm" onClick={() => join(s.id)}>{t('join')}</Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold">{t('communities')}</h1>
        </div>
        <Button size="sm" onClick={() => navigate('/communities/new')} className="gap-1">
          <Plus className="w-4 h-4" /> {t('createCommunity')}
        </Button>
      </header>

      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchCommunities')}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as 'mine' | 'discover')} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 grid grid-cols-2">
          <TabsTrigger value="mine">{t('myCommunities')}</TabsTrigger>
          <TabsTrigger value="discover" className="gap-1"><Compass className="w-4 h-4" /> {t('discover')}</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
          ) : tab === 'mine' ? (
            filtered(mine).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Globe className="w-14 h-14 text-muted-foreground/40 mb-3" />
                <p className="font-medium">{t('noCommunitiesYet')}</p>
                <p className="text-sm text-muted-foreground mb-4">{t('joinOrCreate')}</p>
                <Button onClick={() => setTab('discover')} variant="outline">{t('discover')}</Button>
              </div>
            ) : filtered(mine).map(s => <ServerCard key={s.id} s={s} joined />)
          ) : (
            filtered(discover).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">{t('noCommunitiesFound')}</div>
            ) : filtered(discover).map(s => <ServerCard key={s.id} s={s} joined={false} />)
          )}
        </div>
      </Tabs>

      <BottomNav />
    </div>
  );
};

export default CommunitiesPage;
