import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Globe } from 'lucide-react';
import { toast } from 'sonner';

const AuthPage = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, signIn } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    if (isSignUp && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const email = `${username.toLowerCase().trim()}@vibe.app`;
        await signUp(email, password, username.toLowerCase().trim());
        toast.success('Welcome to Vibe! 🎉');
      } else {
        await signIn(username.toLowerCase().trim(), password);
        toast.success('Welcome back!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const cycleLang = () => {
    const langs = ['en', 'fr', 'ar'] as const;
    const idx = langs.indexOf(language);
    setLanguage(langs[(idx + 1) % langs.length]);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Language toggle */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={cycleLang} className="text-muted-foreground gap-1.5">
            <Globe className="w-4 h-4" />
            {language === 'en' ? 'EN' : language === 'fr' ? 'FR' : 'عر'}
          </Button>
        </div>

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary shadow-lg">
            <MessageCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Vibe</h1>
          <p className="text-muted-foreground text-sm">
            {isSignUp ? t('createAccount') : t('welcomeBack')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Input
              placeholder={t('username')}
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
              autoComplete="username"
            />
            <Input
              type="password"
              placeholder={t('password')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
            {isSignUp && (
              <Input
                type="password"
                placeholder={t('confirmPassword')}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
                autoComplete="new-password"
              />
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-lg hover:opacity-90 transition-opacity"
          >
            {loading ? t('pleaseWait') : isSignUp ? t('signUp') : t('signIn')}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? t('alreadyHaveAccount') : t('dontHaveAccount')}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-accent font-semibold hover:underline"
          >
            {isSignUp ? t('signIn') : t('signUp')}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
