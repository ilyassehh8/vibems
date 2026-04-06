import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Camera, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const ProfilePage = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [statusText, setStatusText] = useState(profile?.status_text || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [linkedEmail, setLinkedEmail] = useState(profile?.linked_email || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
    setStatusText(profile?.status_text || '');
    setPhone(profile?.phone || '');
    setLinkedEmail(profile?.linked_email || '');
    setAvatarUrl(profile?.avatar_url || '');
  }, [profile]);

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);
      toast.success(t('avatarUploaded'));
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          status_text: statusText.trim(),
          phone: phone.trim() || null,
          linked_email: linkedEmail.trim() || null,
          avatar_url: avatarUrl || null,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t('profileSaved'));
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || profile?.display_name || profile?.username || '??').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-3 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1">{t('profileSettings')}</h1>
        <Button
          onClick={saveProfile}
          disabled={saving}
          size="sm"
          className="rounded-xl gradient-primary text-primary-foreground"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          {t('save')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Avatar */}
        <div className="flex flex-col items-center py-8 gap-3">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-24 h-24 rounded-full object-cover border-4 border-card shadow-lg" />
            ) : (
              <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-lg">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-accent flex items-center justify-center text-accent-foreground shadow-md hover:opacity-90 transition-opacity"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar(file);
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">@{profile?.username}</p>
        </div>

        {/* Fields */}
        <div className="px-4 space-y-4 pb-8">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('displayName')}</label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={profile?.username || t('displayName')}
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('statusText')}</label>
            <Input
              value={statusText}
              onChange={e => setStatusText(e.target.value)}
              placeholder={t('statusPlaceholder')}
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">{t('optionalInfo')}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('phoneNumber')}</label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 234 567 890"
              type="tel"
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t('emailAddress')}</label>
            <Input
              value={linkedEmail}
              onChange={e => setLinkedEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;