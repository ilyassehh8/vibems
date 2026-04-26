import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Role {
  id: string; name: string; color: string; is_default: boolean;
  can_manage_server: boolean; can_manage_channels: boolean; can_manage_roles: boolean;
  can_manage_messages: boolean; can_kick: boolean; can_ban: boolean;
}
interface Member {
  user_id: string; nickname: string | null;
  profile?: { username: string; display_name: string | null; avatar_url: string | null };
  roles: string[];
}

const CommunityRolesPage = () => {
  const { id: serverId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoleName, setNewRoleName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    if (!serverId || !user) return;
    setLoading(true);
    const [rolesRes, membersRes, mrRes] = await Promise.all([
      supabase.from('server_roles').select('*').eq('server_id', serverId).order('position', { ascending: false }),
      supabase.from('server_members').select('user_id, nickname').eq('server_id', serverId),
      supabase.from('server_member_roles').select('user_id, role_id').eq('server_id', serverId),
    ]);
    setRoles((rolesRes.data || []) as Role[]);

    const userIds = (membersRes.data || []).map(m => m.user_id);
    let pmap = new Map<string, any>();
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);
      pmap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    }
    const rolesByUser = new Map<string, string[]>();
    (mrRes.data || []).forEach(mr => {
      const arr = rolesByUser.get(mr.user_id) || [];
      arr.push(mr.role_id);
      rolesByUser.set(mr.user_id, arr);
    });

    setMembers((membersRes.data || []).map(m => ({
      ...m, profile: pmap.get(m.user_id), roles: rolesByUser.get(m.user_id) || [],
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [serverId, user]);

  const createRole = async () => {
    if (!newRoleName.trim() || !serverId) return;
    const { data, error } = await supabase.from('server_roles').insert({
      server_id: serverId, name: newRoleName.trim(),
      color: '#5865F2', position: roles.length,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setRoles(prev => [data as Role, ...prev]);
    setNewRoleName('');
    setDialogOpen(false);
  };

  const togglePermission = async (role: Role, key: keyof Role, value: boolean) => {
    if (role.is_default && (key === 'can_manage_server' || key === 'can_manage_roles')) {
      toast.error('Cannot grant this to @everyone');
      return;
    }
    const { error } = await supabase.from('server_roles').update({ [key]: value } as never).eq('id', role.id);
    if (error) { toast.error(error.message); return; }
    setRoles(prev => prev.map(r => r.id === role.id ? { ...r, [key]: value } : r));
  };

  const deleteRole = async (role: Role) => {
    if (role.is_default) { toast.error('Cannot delete @everyone'); return; }
    const { error } = await supabase.from('server_roles').delete().eq('id', role.id);
    if (error) { toast.error(error.message); return; }
    setRoles(prev => prev.filter(r => r.id !== role.id));
  };

  const assignRole = async (memberUserId: string, roleId: string) => {
    if (!serverId) return;
    const { error } = await supabase.from('server_member_roles').insert({
      server_id: serverId, user_id: memberUserId, role_id: roleId,
    });
    if (error) { toast.error(error.message); return; }
    setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, roles: [...m.roles, roleId] } : m));
  };

  const revokeRole = async (memberUserId: string, roleId: string) => {
    if (!serverId) return;
    const { error } = await supabase.from('server_member_roles').delete()
      .eq('server_id', serverId).eq('user_id', memberUserId).eq('role_id', roleId);
    if (error) { toast.error(error.message); return; }
    setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, roles: m.roles.filter(r => r !== roleId) } : m));
  };

  const permRows: { key: keyof Role; label: string }[] = [
    { key: 'can_manage_server', label: t('manageServer') },
    { key: 'can_manage_channels', label: t('manageChannels') },
    { key: 'can_manage_roles', label: t('manageRoles') },
    { key: 'can_manage_messages', label: t('manageMessages') },
    { key: 'can_kick', label: t('kickMembers') },
    { key: 'can_ban', label: t('banMembers') },
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur-md">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/communities/${serverId}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Shield className="w-5 h-5 text-accent" />
        <h1 className="text-lg font-bold">{t('manageRoles')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-6">
        {/* Roles */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">{t('roles')}</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" />{t('addRole')}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('addRole')}</DialogTitle></DialogHeader>
                <Input
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  placeholder={t('roleName')}
                  onKeyDown={e => e.key === 'Enter' && createRole()}
                />
                <DialogFooter>
                  <Button onClick={createRole} disabled={!newRoleName.trim()}>{t('create')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-3">
              {roles.map(role => (
                <div key={role.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: role.color }} />
                      <span className="font-semibold">{role.name}</span>
                      {role.is_default && <span className="text-xs text-muted-foreground">(default)</span>}
                    </div>
                    {!role.is_default && (
                      <Button variant="ghost" size="icon" onClick={() => deleteRole(role)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {permRows.map(p => (
                      <label key={p.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted">
                        <span className="text-sm">{p.label}</span>
                        <Switch
                          checked={!!role[p.key]}
                          onCheckedChange={v => togglePermission(role, p.key, v)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Members & assign roles */}
        <section>
          <h2 className="font-semibold mb-3">{t('membersList')}</h2>
          {loading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-2">
              {members.map(m => {
                const memberRoles = roles.filter(r => m.roles.includes(r.id));
                const availableRoles = roles.filter(r => !m.roles.includes(r.id) && !r.is_default);
                return (
                  <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-sm font-semibold">
                      {(m.profile?.display_name || m.profile?.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.profile?.display_name || m.profile?.username}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {memberRoles.filter(r => !r.is_default).map(r => (
                          <button
                            key={r.id}
                            onClick={() => revokeRole(m.user_id, r.id)}
                            className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-destructive/10"
                            style={{ borderColor: r.color, color: r.color }}
                            title="Click to remove"
                          >
                            {r.name} ×
                          </button>
                        ))}
                      </div>
                    </div>
                    {availableRoles.length > 0 && (
                      <Select onValueChange={(rid) => assignRole(m.user_id, rid)}>
                        <SelectTrigger className="w-32"><SelectValue placeholder={t('assignRole')} /></SelectTrigger>
                        <SelectContent>
                          {availableRoles.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CommunityRolesPage;
