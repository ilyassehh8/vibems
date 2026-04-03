import { useState, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
  url: string;
  isMine: boolean;
}

const AudioPlayer = ({ url, isMine }: AudioPlayerProps) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a && a.duration) setProgress((a.currentTime / a.duration) * 100);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className={`h-8 w-8 rounded-full flex-shrink-0 ${
          isMine ? 'text-primary-foreground/90 hover:bg-primary-foreground/10' : 'text-accent hover:bg-accent/10'
        }`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-1 bg-foreground/20 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isMine ? 'bg-primary-foreground/70' : 'bg-accent'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-[10px] ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {playing ? formatTime(audioRef.current?.currentTime || 0) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

export default AudioPlayer;
