import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Users, User, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const items = [
    { path: '/', icon: MessageCircle, label: t('chats'), match: (p: string) => p === '/' },
    { path: '/friends', icon: Users, label: t('friends'), match: (p: string) => p.startsWith('/friends') },
    { path: '/communities', icon: Globe, label: t('communities'), match: (p: string) => p.startsWith('/communities') },
    { path: '/profile', icon: User, label: t('profile'), match: (p: string) => p.startsWith('/profile') },
  ];

  return (
    <nav className="flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-md py-1.5 safe-area-pb">
      {items.map(item => {
        const Icon = item.icon;
        const active = item.match(location.pathname);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl transition-all active:scale-95',
              active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('w-5 h-5 transition-transform', active && 'scale-110')} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
