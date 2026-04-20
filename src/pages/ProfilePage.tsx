import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Camera, Save, Loader2, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';

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

  const isDirty = useMemo(() => {
    return (
      (displayName || '') !== (profile?.display_name || '') ||
      (statusText || '') !== (profile?.status_text || '') ||
      (phone || '') !== (profile?.phone || '') ||
      (linkedEmail || '') !== (profile?.linked_email || '') ||
      (avatarUrl || '') !== (profile?.avatar_url || '')
    );
  }, [displayName, statusText, phone, linkedEmail, avatarUrl, profile]);

  const handleBack = () => {
    if (isDirty && !window.confirm(t('unsavedChanges'))) return;
    navigate('/');
  };

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
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || profile?.display_name || profile?.username || '??').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-screen bg-background animate-fade-in">
      <header className="flex items-center gap-3 px-3 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground active:scale-95 transition-transform">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground flex-1">{t('profileSettings')}</h1>
        <Button
          onClick={saveProfile}
          disabled={saving || !isDirty}
          size="sm"
          className="rounded-xl gradient-primary text-primary-foreground active:scale-95 transition-transform disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" />}
          {t('save')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Avatar */}
        <div className="flex flex-col items-center py-8 gap-3 bg-card border-b border-border">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-28 h-28 rounded-full object-cover border-4 border-background shadow-lg" />
            ) : (
              <div className="w-28 h-28 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-3xl shadow-lg">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 rtl:right-auto rtl:left-0 w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground shadow-md hover:opacity-90 active:scale-90 transition-transform"
              aria-label="Change avatar"
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
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">
              {displayName || profile?.username}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-center">
              <AtSign className="w-3.5 h-3.5" />{profile?.username}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="p-4 space-y-4">
          <div className="bg-card rounded-2xl p-4 border border-border space-y-4">
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
          </div>

          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium px-1 pt-2">{t('optionalInfo')}</p>

          <div className="bg-card rounded-2xl p-4 border border-border space-y-4">
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

      <BottomNav />
    </div>
  );
};

export default ProfilePage;
