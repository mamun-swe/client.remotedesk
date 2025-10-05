export type SignalSender = (msg: any) => void;

export interface RemoteSession {
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  onStream?: (stream: MediaStream) => void;
  onMessage?: (data: any) => void;

  attachDataChannel(dc: RTCDataChannel): void;
  createDataChannel(label?: string): RTCDataChannel;
  addLocalStream(stream: MediaStream): Promise<void> | void;
  send(data: any): void;
  makeOffer(): Promise<void>;
  handleOffer(sdp: RTCSessionDescriptionInit): Promise<void>;
  handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void>;
  handleIce(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export function createRemoteSession(sendSignal: SignalSender): RemoteSession {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  });

  let dc: RTCDataChannel | undefined;

  const session: RemoteSession = {
    pc,
    dc: undefined,
    onStream: undefined,
    onMessage: undefined,

    attachDataChannel(channel: RTCDataChannel) {
      dc = channel;
      session.dc = channel;
      channel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (session.onMessage) session.onMessage(data);
        } catch {
          /* ignore */
        }
      };
    },

    createDataChannel(label = 'control') {
      const channel = pc.createDataChannel(label, { ordered: true });
      session.attachDataChannel(channel);
      return channel;
    },

    async addLocalStream(stream: MediaStream) {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    },

    send(data: any) {
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify(data));
      }
    },

    async makeOffer() {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: offer });
    },

    async handleOffer(sdp: RTCSessionDescriptionInit) {
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: 'answer', sdp: answer });
    },

    async handleAnswer(sdp: RTCSessionDescriptionInit) {
      await pc.setRemoteDescription(sdp);
    },

    async handleIce(candidate: RTCIceCandidateInit) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    },

    close() {
      try {
        dc?.close();
      } catch {
        /* ignore */
      }
      pc.close();
    },
  };

  // Wire up PC events to call the *current* session handlers.
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    // Firefox sometimes lacks e.streams; build a stream from the track.
    const stream = e.streams?.[0] ?? new MediaStream([e.track]);
    if (session.onStream) session.onStream(stream);
    console.log('ontrack', e.track.kind, e.streams?.length ?? 0);
  };

  pc.ondatachannel = (e) => {
    session.attachDataChannel(e.channel);
  };

  return session;
}
