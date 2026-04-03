import { useState, useRef } from 'react';
import { Mic, Square, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface AudioRecorderProps {
  conversationId: string;
  userId: string;
  onSent: () => void;
}

const AudioRecorder = ({ conversationId, userId, onSent }: AudioRecorderProps) => {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      alert('Microphone access denied');
    }
  };

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) return;

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        mr.stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };

      mr.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  };

  const cancelRecording = async () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stream.getTracks().forEach(t => t.stop());
      mr.stop();
    }
    setRecording(false);
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const sendAudio = async () => {
    const blob = await stopRecording();
    setUploading(true);

    const fileName = `${userId}/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(fileName, blob, { contentType: 'audio/webm' });

    if (uploadError) {
      setUploading(false);
      alert('Upload failed');
      return;
    }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(fileName);

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      type: 'audio',
      media_url: urlData.publicUrl,
      content: `🎤 Voice message (${formatDuration(duration)})`,
    });

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    setUploading(false);
    setDuration(0);
    onSent();
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (uploading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-accent/20 rounded-3xl">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
        <span className="text-sm text-muted-foreground">Sending voice note...</span>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 flex-1">
        <Button variant="ghost" size="icon" onClick={cancelRecording} className="h-9 w-9 text-destructive">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1 flex items-center gap-2 bg-destructive/10 rounded-3xl px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-medium text-foreground">{formatDuration(duration)}</span>
          <div className="flex-1 flex items-center gap-0.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-destructive/40 rounded-full"
                style={{ height: `${Math.random() * 16 + 4}px` }}
              />
            ))}
          </div>
        </div>
        <Button onClick={sendAudio} size="icon" className="w-11 h-11 rounded-full gradient-primary text-primary-foreground">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={startRecording}
      className="h-11 w-11 rounded-full text-muted-foreground hover:text-accent flex-shrink-0"
    >
      <Mic className="w-5 h-5" />
    </Button>
  );
};

export default AudioRecorder;
