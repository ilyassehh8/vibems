import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X, Loader2 } from 'lucide-react';
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
  initialLocalStream?: MediaStream | null;
  onClose: () => void;
}

type CallStatus = 'ringing' | 'connected' | 'ended';

type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; from: string; callType: 'audio' | 'video' }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; from: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit; from: string }
  | { type: 'accept'; from: string }
  | { type: 'hangup'; from: string };

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const CallScreen = ({
  conversationId,
  userId,
  otherUserName,
  callType,
  isIncoming = false,
  callId: existingCallId,
  initialLocalStream = null,
  onClose,
}: CallScreenProps) => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<CallStatus>('ringing');
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(callType === 'audio');
  const [duration, setDuration] = useState(0);
  const [accepting, setAccepting] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelPromiseRef = useRef<Promise<ReturnType<typeof supabase.channel>> | null>(null);
  const channelReadyRef = useRef(false);
  const callIdRef = useRef(existingCallId || '');
  const acceptedRef = useRef(isIncoming ? false : true);
  const offerSentRef = useRef(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const endedRef = useRef(false);
  const setupPromiseRef = useRef<Promise<RTCPeerConnection> | null>(null);

  const playMediaElement = useCallback(async (element: HTMLMediaElement | null) => {
    if (!element) return;

    try {
      element.autoplay = true;
      element.muted = false;
      if ('playsInline' in element) {
        (element as HTMLMediaElement & { playsInline?: boolean }).playsInline = true;
      }
      await element.play();
    } catch {
      window.setTimeout(() => {
        void element.play().catch(() => undefined);
      }, 150);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    pendingIceCandidatesRef.current = [];
    setupPromiseRef.current = null;
    localStreamPromiseRef.current = null;
    remoteStreamRef.current = null;
    channelReadyRef.current = false;
    channelPromiseRef.current = null;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration(current => current + 1), 1000);
  }, []);

  const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;

    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift();
      if (candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  }, []);

  const attachLocalStream = useCallback((stream: MediaStream) => {
    if (callType === 'video' && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      void localVideoRef.current.play().catch(() => undefined);
    }
  }, [callType]);

  const attachRemoteStream = useCallback(async () => {
    const mediaElement = callType === 'video' ? remoteVideoRef.current : remoteAudioRef.current;
    if (!mediaElement || !remoteStreamRef.current) return;

    mediaElement.srcObject = remoteStreamRef.current;
    await playMediaElement(mediaElement);
  }, [callType, playMediaElement]);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (localStreamPromiseRef.current) return localStreamPromiseRef.current;

    localStreamPromiseRef.current = (async () => {
      const stream = initialLocalStream ?? await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });

      localStreamRef.current = stream;
      attachLocalStream(stream);
      return stream;
    })();

    try {
      return await localStreamPromiseRef.current;
    } finally {
      localStreamPromiseRef.current = null;
    }
  }, [attachLocalStream, callType, initialLocalStream]);

  const ensurePeerConnection = useCallback(async () => {
    if (setupPromiseRef.current) return setupPromiseRef.current;
    if (pcRef.current) return pcRef.current;

    setupPromiseRef.current = (async () => {
      const stream = await ensureLocalStream();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      remoteStreamRef.current = new MediaStream();

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }

        event.streams[0]?.getTracks().forEach(track => {
          const alreadyAdded = remoteStreamRef.current?.getTracks().some(existingTrack => existingTrack.id === track.id);
          if (!alreadyAdded) {
            remoteStreamRef.current?.addTrack(track);
          }
        });

        if (event.streams.length === 0 && event.track) {
          const alreadyAdded = remoteStreamRef.current.getTracks().some(existingTrack => existingTrack.id === event.track.id);
          if (!alreadyAdded) {
            remoteStreamRef.current.addTrack(event.track);
          }
        }

        void attachRemoteStream();
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current && channelReadyRef.current) {
          void channelRef.current.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'ice', candidate: event.candidate.toJSON(), from: userId } satisfies SignalPayload,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('connected');
          startTimer();
          void attachRemoteStream();
        }

        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('ended');
          cleanup();
          window.setTimeout(onClose, 1500);
        }
      };

      return pc;
    })();

    try {
      return await setupPromiseRef.current;
    } finally {
      setupPromiseRef.current = null;
    }
  }, [attachRemoteStream, cleanup, ensureLocalStream, onClose, startTimer, userId]);

  const ensureSignalingChannel = useCallback(async () => {
    if (channelRef.current && channelReadyRef.current) {
      return channelRef.current;
    }

    if (channelPromiseRef.current) {
      return channelPromiseRef.current;
    }

    const channel = channelRef.current ?? supabase.channel(`call-${conversationId}`, {
      config: { broadcast: { self: false } },
    });

    if (!channelRef.current) {
      channelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const signal = payload as SignalPayload;
        if (signal.from === userId) return;

        try {
          if (signal.type === 'offer') {
            if (isIncoming && !acceptedRef.current) return;

            const pc = await ensurePeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await flushPendingIceCandidates(pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { type: 'answer', sdp: answer, from: userId } satisfies SignalPayload,
            });
          } else if (signal.type === 'answer') {
            const pc = await ensurePeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await flushPendingIceCandidates(pc);
          } else if (signal.type === 'ice') {
            if (pcRef.current?.remoteDescription) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
              pendingIceCandidatesRef.current.push(signal.candidate);
            }
          } else if (signal.type === 'accept') {
            acceptedRef.current = true;

            if (!isIncoming && !offerSentRef.current) {
              const pc = await ensurePeerConnection();

              try {
                offerSentRef.current = true;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: { type: 'offer', sdp: offer, from: userId, callType } satisfies SignalPayload,
                });
              } catch (error) {
                offerSentRef.current = false;
                throw error;
              }
            }
          } else if (signal.type === 'hangup') {
            setStatus('ended');
            cleanup();
            window.setTimeout(onClose, 1500);
          }
        } catch (error) {
          console.error('Signal handling error:', error);
        }
      });

      channelPromiseRef.current = new Promise<ReturnType<typeof supabase.channel>>((resolve, reject) => {
        let settled = false;

        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          callback();
        };

        const timeoutId = window.setTimeout(() => {
          channelReadyRef.current = false;
          finish(() => reject(new Error('Call signaling timed out')));
        }, 10000);

        channel.subscribe((subscriptionStatus) => {
          if (subscriptionStatus === 'SUBSCRIBED') {
            channelReadyRef.current = true;
            finish(() => resolve(channel));
            return;
          }

          if (subscriptionStatus === 'TIMED_OUT' || subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'CLOSED') {
            channelReadyRef.current = false;
            finish(() => reject(new Error(`Call signaling ${subscriptionStatus.toLowerCase()}`)));
          }
        });
      });
    }

    try {
      return await channelPromiseRef.current!;
    } catch (error) {
      if (channelRef.current === channel) {
        supabase.removeChannel(channel);
        channelRef.current = null;
      }
      channelReadyRef.current = false;
      channelPromiseRef.current = null;
      throw error;
    }
  }, [callType, cleanup, conversationId, ensurePeerConnection, flushPendingIceCandidates, isIncoming, onClose, userId]);

  const endCall = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus('ended');
    cleanup();

    if (callIdRef.current) {
      await supabase
        .from('calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callIdRef.current);
    }

    window.setTimeout(onClose, 1500);
  }, [cleanup, onClose]);

  useEffect(() => {
    const init = async () => {
      try {
        await ensureSignalingChannel();

        if (!isIncoming) {
          await ensurePeerConnection();

          const { data: newCall, error: callError } = await supabase
            .from('calls')
            .insert({
              conversation_id: conversationId,
              caller_id: userId,
              call_type: callType,
              status: 'ringing',
            })
            .select('id')
            .single();

          if (callError) throw callError;
          if (newCall) callIdRef.current = newCall.id;
        }
      } catch (error) {
        console.error('Call setup error:', error);
        void endCall();
      }
    };

    void init();
    return cleanup;
  }, [callType, cleanup, conversationId, endCall, ensurePeerConnection, ensureSignalingChannel, isIncoming, userId]);

  const acceptCall = async () => {
    if (accepting) return;

    try {
      setAccepting(true);
      const localStreamPromise = ensureLocalStream();
      const channel = await ensureSignalingChannel();
      await localStreamPromise;
      await ensurePeerConnection();

      acceptedRef.current = true;
      await channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'accept', from: userId } satisfies SignalPayload,
      });

      if (callIdRef.current) {
        const { error } = await supabase
          .from('calls')
          .update({ status: 'active', started_at: new Date().toISOString() })
          .eq('id', callIdRef.current);

        if (error) {
          console.error('Call status update error:', error);
        }
      }
    } catch (error) {
      acceptedRef.current = false;
      console.error('Accept call error:', error);
      void endCall();
    } finally {
      setAccepting(false);
    }
  };

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setVideoOff(!videoTrack.enabled);
  };

  const hangup = async () => {
    if (channelRef.current && channelReadyRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'hangup', from: userId } satisfies SignalPayload,
      });
    }

    await endCall();
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
          {status === 'ringing' && (isIncoming ? t('incomingCall') : t('calling'))}
          {status === 'connected' && formatDuration(duration)}
          {status === 'ended' && t('callEnded')}
        </p>
      </div>

      <div className="relative z-10 flex items-center gap-6">
        {status === 'ringing' && isIncoming ? (
          <>
            <Button onClick={hangup} size="icon" className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground shadow-lg">
              <PhoneOff className="w-7 h-7" />
            </Button>
            <Button onClick={acceptCall} disabled={accepting} size="icon" className="w-16 h-16 rounded-full bg-online text-primary-foreground shadow-lg">
              {accepting ? <Loader2 className="w-7 h-7 animate-spin" /> : <Phone className="w-7 h-7" />}
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
