import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

interface CallScreenProps {
  conversationId: string;
  userId: string;
  otherUserName: string;
  callType: 'audio' | 'video';
  isIncoming?: boolean;
  callId?: string;
  onClose: () => void;
}

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const CallScreen = ({
  conversationId,
  userId,
  otherUserName,
  callType,
  isIncoming = false,
  callId: existingCallId,
  onClose,
}: CallScreenProps) => {
  const [status, setStatus] = useState<'ringing' | 'connected' | 'ended'>(isIncoming ? 'ringing' : 'ringing');
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(callType === 'audio');
  const [duration, setDuration] = useState(0);
  const [callId, setCallId] = useState(existingCallId || '');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
  }, []);

  const endCall = useCallback(async () => {
    setStatus('ended');
    cleanup();

    if (callId) {
      await supabase.from('calls').update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      }).eq('id', callId);
    }

    setTimeout(onClose, 1500);
  }, [callId, cleanup, onClose]);

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video',
        });
        localStreamRef.current = stream;

        if (callType === 'video' && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (e) => {
          if (callType === 'video' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          } else if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = e.streams[0];
          }
        };

        // Signaling via Supabase Realtime broadcast
        const channel = supabase.channel(`call-${conversationId}`, {
          config: { broadcast: { self: false } },
        });
        channelRef.current = channel;

        channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
          if (payload.from === userId) return;

          if (payload.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'answer', sdp: answer, from: userId } });
          } else if (payload.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          } else if (payload.type === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else if (payload.type === 'accept') {
            setStatus('connected');
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
          } else if (payload.type === 'hangup') {
            endCall();
          }
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'ice', candidate: e.candidate, from: userId } });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setStatus('connected');
            if (!timerRef.current) {
              timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            }
          }
        };

        await channel.subscribe();

        if (!isIncoming) {
          // Create call record
          const { data: newCall } = await supabase.from('calls').insert({
            conversation_id: conversationId,
            caller_id: userId,
            call_type: callType,
            status: 'ringing',
          }).select('id').single();

          if (newCall) setCallId(newCall.id);

          // Create and send offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'offer', sdp: offer, from: userId, callType } });
        }
      } catch (err) {
        console.error('Call setup error:', err);
        endCall();
      }
    };

    init();
    return cleanup;
  }, []);

  const acceptCall = async () => {
    const pc = pcRef.current;
    const channel = channelRef.current;
    if (!pc || !channel) return;

    channel.send({ type: 'broadcast', event: 'signal', payload: { type: 'accept', from: userId } });
    setStatus('connected');
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);

    if (callId) {
      await supabase.from('calls').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', callId);
    }
  };

  const toggleMute = () => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setMuted(!audio.enabled);
    }
  };

  const toggleVideo = () => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setVideoOff(!video.enabled);
    }
  };

  const hangup = () => {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type: 'hangup', from: userId } });
    endCall();
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-between py-12">
      <audio ref={remoteAudioRef} autoPlay />

      {callType === 'video' && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-4 right-4 w-28 h-40 rounded-2xl object-cover border-2 border-card shadow-lg z-10"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/80 z-[1]" />
        </>
      )}

      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-xl">
          {otherUserName.slice(0, 2).toUpperCase()}
        </div>
        <h2 className="text-xl font-bold text-foreground">{otherUserName}</h2>
        <p className="text-sm text-muted-foreground">
          {status === 'ringing' && (isIncoming ? 'Incoming call...' : 'Calling...')}
          {status === 'connected' && formatDuration(duration)}
          {status === 'ended' && 'Call ended'}
        </p>
      </div>

      <div className="relative z-10 flex items-center gap-6">
        {status === 'ringing' && isIncoming ? (
          <>
            <Button onClick={hangup} size="icon" className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground shadow-lg">
              <PhoneOff className="w-7 h-7" />
            </Button>
            <Button onClick={acceptCall} size="icon" className="w-16 h-16 rounded-full bg-online text-primary-foreground shadow-lg">
              <Phone className="w-7 h-7" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full ${muted ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-foreground'}`}
            >
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>

            {callType === 'video' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleVideo}
                className={`w-14 h-14 rounded-full ${videoOff ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-foreground'}`}
              >
                {videoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </Button>
            )}

            <Button onClick={hangup} size="icon" className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground shadow-lg">
              <PhoneOff className="w-7 h-7" />
            </Button>
          </>
        )}
      </div>

      {status !== 'ringing' && (
        <Button variant="ghost" onClick={onClose} className="absolute top-4 left-4 z-20 text-muted-foreground">
          <X className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
};

export default CallScreen;
