import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Globe, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const getPasswordStrength = (pw: string): 0 | 1 | 2 | 3 => {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
};

const AuthPage = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp, signIn } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const strengthLabel = ['', t('passwordWeak'), t('passwordMedium'), t('passwordStrong')][strength];
  const strengthColor = ['bg-muted', 'bg-destructive', 'bg-yellow-500', 'bg-online'][strength];

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
      <div className="w-full max-w-sm space-y-8 animate-fade-in">
        {/* Language toggle */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={cycleLang} className="text-muted-foreground gap-1.5">
            <Globe className="w-4 h-4" />
            {language === 'en' ? 'EN' : language === 'fr' ? 'FR' : 'عر'}
          </Button>
        </div>

        {/* Logo */}
        <div className="text-center space-y-3 animate-scale-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary shadow-lg">
            <MessageCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Vibe</h1>
          <p className="text-muted-foreground text-sm">
            {isSignUp ? t('createAccount') : t('welcomeBack')}
          </p>
          <p className="text-xs text-muted-foreground/80">{t('tagline')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" key={isSignUp ? 'signup' : 'signin'}>
          <div className="space-y-3 animate-fade-in">
            <Input
              placeholder={t('username')}
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground"
              autoComplete="username"
            />
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder={t('password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground pr-11 rtl:pr-3 rtl:pl-11"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? t('hidePassword') : t('showPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rtl:right-auto rtl:left-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isSignUp && password && (
              <div className="space-y-1 animate-fade-in">
                <div className="flex gap-1">
                  {[1, 2, 3].map(i => (
                    <div
                      key={i}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        i <= strength ? strengthColor : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">{strengthLabel}</p>
              </div>
            )}
            {isSignUp && (
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder={t('confirmPassword')}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="h-12 rounded-xl bg-secondary border-0 text-foreground placeholder:text-muted-foreground animate-fade-in"
                autoComplete="new-password"
              />
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-lg hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('pleaseWait')}
              </span>
            ) : isSignUp ? t('signUp') : t('signIn')}
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
