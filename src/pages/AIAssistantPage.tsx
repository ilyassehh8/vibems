import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/contexts/LanguageContext';

type Msg = { role: 'user' | 'assistant'; content: string; image?: string };
type Mode = 'chat' | 'image';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const IMAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-image`;

const AIAssistantPage = () => {
  const navigate = useNavigate();
  const { dir } = useLanguage();
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "Hi! I'm Vibe AI ✨ Ask me anything, or switch to image mode to generate pictures." },
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('chat');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const streamChat = async (history: Msg[]) => {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: history.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (resp.status === 429) { toast.error('Too many requests. Try again shortly.'); return; }
    if (resp.status === 402) { toast.error('AI credits exhausted.'); return; }
    if (!resp.ok || !resp.body) { toast.error('AI failed to respond.'); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let acc = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (json === '[DONE]') { done = true; break; }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (delta) {
            acc += delta;
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: 'assistant', content: acc };
              return copy;
            });
          }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }
  };

  const generateImage = async (prompt: string) => {
    const resp = await fetch(IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ prompt }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429) { toast.error('Too many requests. Try again shortly.'); return; }
    if (resp.status === 402) { toast.error('AI credits exhausted.'); return; }
    if (!resp.ok || !data.imageUrl) {
      toast.error(data.error || 'Image generation failed.');
      return;
    }
    setMessages(prev => [...prev, { role: 'assistant', content: `Here's "${prompt}":`, image: data.imageUrl }]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      if (mode === 'image') {
        await generateImage(text);
      } else {
        await streamChat([...messages, userMsg]);
      }
    } catch (e) {
      console.error(e);
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background" dir={dir}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur-md">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-foreground">Vibe AI</h1>
          <p className="text-xs text-muted-foreground">{mode === 'image' ? 'Image generation' : 'Always here to help'}</p>
        </div>
        <div className="flex bg-muted rounded-full p-1 gap-1">
          <button
            onClick={() => setMode('chat')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition ${mode === 'chat' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          >
            Chat
          </button>
          <button
            onClick={() => setMode('image')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition flex items-center gap-1 ${mode === 'image' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
          >
            <ImageIcon className="w-3 h-3" /> Image
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
              m.role === 'user'
                ? 'bg-accent text-accent-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            }`}>
              {m.image && (
                <img src={m.image} alt="Generated" className="rounded-lg mb-2 max-w-full" />
              )}
              {m.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2">
                  <ReactMarkdown>{m.content || '…'}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {mode === 'image' ? 'Generating image…' : 'Thinking…'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border bg-card/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={mode === 'image' ? 'Describe an image…' : 'Ask Vibe AI anything…'}
            disabled={loading}
            className="rounded-full"
          />
          <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="rounded-full shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default AIAssistantPage;
