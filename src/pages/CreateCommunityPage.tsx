import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const CreateCommunityPage = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error(t('enterCommunityName')); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from('servers')
      .insert({ name: name.trim(), description: description.trim(), owner_id: user.id, is_public: true })
      .select()
      .single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t('communityCreated'));
    navigate(`/communities/${data.id}`);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur-md">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-bold">{t('createCommunity')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-md mx-auto w-full">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Globe className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('communityName')}</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('communityNamePlaceholder')} maxLength={50} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('description')} <span className="text-muted-foreground">({t('optional')})</span></label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')} rows={3} maxLength={200} />
          </div>
          <p className="text-xs text-muted-foreground">{t('communityCreateHelp')}</p>
          <Button onClick={handleCreate} disabled={creating || !name.trim()} className="w-full">
            {creating ? t('pleaseWait') : t('createCommunity')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateCommunityPage;
