import React, { useEffect, useRef, useState, type FC, type JSX } from 'react';
import type { RemoteSession } from 'src/services/webrtc.service';
import { createRemoteSession } from 'src/services/webrtc.service';
import { createAgentBridge } from 'src/services/agent-bridge.service';

const WS_URL =
  (import.meta.env.VITE_SIGNAL_URL as string) || 'ws://localhost:4000';

function useWebSocket(roomId: string, onSignal: (data: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId }));
    };
    ws.onmessage = (ev) => {
      try {
        onSignal(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [roomId, onSignal]);

  return (msg: any) => wsRef.current?.send(JSON.stringify(msg));
}

export const App: FC = (): JSX.Element => {
  const agentRef = useRef(createAgentBridge());
  const [roomId, setRoomId] = useState<string>(
    () => location.hash.replace('#', '') || crypto.randomUUID().slice(0, 6),
  );
  const [isHost, setIsHost] = useState<boolean>(true);
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [controlEnabled, setControlEnabled] = useState(false);
  const [chat, setChat] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // keep agent’s allowed flag in sync (Host only)
  useEffect(() => {
    if (isHost) agentRef?.current?.setAllowed(controlEnabled);
  }, [controlEnabled, isHost]);

  useEffect(() => {
    location.hash = roomId;
  }, [roomId]);

  // useEffect(() => {
  //   if (videoRef.current && remoteStream) {
  //     videoRef.current.srcObject = remoteStream;
  //     videoRef.current.muted = true;
  //     const v = videoRef.current;
  //     const tryPlay = () =>
  //       v.play().catch(() => {
  //         /* ignore, user gesture may be needed */
  //       });
  //     v.onloadedmetadata = tryPlay;
  //     tryPlay();
  //   }
  // }, [remoteStream]);

  const onSignal = (data: any) => {
    if (!session) return;
    if (data.type === 'offer') session.handleOffer(data.sdp);
    else if (data.type === 'answer') session.handleAnswer(data.sdp);
    else if (data.type === 'ice') session.handleIce(data.candidate);
    else if (data.type === 'peer-join') {
      // Host proactively creates offer on peer join
      if (isHost) session.makeOffer();
    } else if (data.type === 'chat') {
      setChat((c) => [...c, `Peer: ${data.text}`]);
    } else if (data.type === 'ctrl' && isHost) {
      // Replay control on host side
      if (!controlEnabled) return;
      if (agentRef.current.connected) {
        agentRef.current.sendCtrl(data); // full-desktop control via agent
      } else {
        handleReplayControl(data); // fallback: in-tab control
      }
      // handleReplayControl(data);
    }
  };

  const sendSignal = useWebSocket(roomId, onSignal);

  const start = async () => {
    const s = createRemoteSession(sendSignal); // ← no `new`
    setSession(s);

    s.onStream = (stream) => setRemoteStream(stream);
    s.onMessage = (data) => {
      if (data.type === 'chat') setChat((c) => [...c, `Peer: ${data.text}`]);
      if (data.type === 'ctrl' && isHost) {
        if (!controlEnabled) return;
        // handleReplayControl(data);
        if (agentRef.current.connected) agentRef.current.sendCtrl(data);
        else handleReplayControl(data);
      }
    };

    if (isHost) {
      // Host shares screen
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      await s.addLocalStream(stream);
      s.createDataChannel('control');
      await s.makeOffer();
    } else {
      // (Optional) helps some same-device/browser combos
      try {
        s.pc.addTransceiver('video', { direction: 'recvonly' });
      } catch {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
      videoRef.current.onloadedmetadata = () => videoRef.current?.play();
    }
  }, [remoteStream]);

  // Controller sends events mapped to normalized coords [0..1]
  const sendCtrl = (payload: any) =>
    session?.send({ type: 'ctrl', ...payload });

  const handleMouse = (e: React.MouseEvent) => {
    if (isHost || !session) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    sendCtrl({ kind: 'move', x: nx, y: ny });
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isHost || !session) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    sendCtrl({ kind: 'click', x: nx, y: ny, button: e.button });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isHost || !session) return;
    sendCtrl({ kind: 'wheel', dx: e.deltaX, dy: e.deltaY });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (isHost || !session) return;
    // Avoid typing into our own inputs
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;
    sendCtrl({
      kind: 'key',
      key: e.key,
      code: e.code,
      alt: e.altKey,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      meta: e.metaKey,
      type: e.type,
    });
  };

  const handleReplayControl = (m: any) => {
    if (m.kind === 'move') {
      // show a remote cursor overlay for host to see where the guest is aiming
      const ov = overlayRef.current;
      if (!ov) return;
      ov.style.setProperty('--cx', `${m.x * 100}%`);
      ov.style.setProperty('--cy', `${m.y * 100}%`);
    } else if (m.kind === 'click') {
      const x = Math.round(m.x * window.innerWidth);
      const y = Math.round(m.y * window.innerHeight);
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (el) {
        const evt = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        el.dispatchEvent(evt);
      }
    } else if (m.kind === 'wheel') {
      window.scrollBy({
        left: m.dx,
        top: m.dy,
        behavior: 'instant' as ScrollBehavior,
      });
    } else if (m.kind === 'key') {
      const active = (document.activeElement as HTMLElement) || document.body;
      const evt = new KeyboardEvent(
        m.type === 'keydown' ? 'keydown' : 'keyup',
        {
          key: m.key,
          code: m.code,
          altKey: m.alt,
          ctrlKey: m.ctrl,
          shiftKey: m.shift,
          metaKey: m.meta,
          bubbles: true,
          cancelable: true,
        },
      );
      active.dispatchEvent(evt);
    }
  };

  const [chatInput, setChatInput] = useState('');
  const sendChat = () => {
    if (!session || !chatInput.trim()) return;
    session.send({ type: 'chat', text: chatInput.trim() });
    setChat((c) => [...c, `You: ${chatInput.trim()}`]);
    setChatInput('');
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h1 className="text-2xl font-bold">Web Remote Desktop</h1>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-xl">
              <span className="text-sm text-slate-300">Room</span>
              <input
                className="bg-transparent border border-slate-700 rounded-md px-2 py-1"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-xl">
              <input
                type="checkbox"
                checked={isHost}
                onChange={(e) => setIsHost(e.target.checked)}
              />
              <span className="text-sm">I am Host (share my screen)</span>
            </label>
            <button
              onClick={start}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-medium"
            >
              Start
            </button>
            {isHost && (
              <label className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={controlEnabled}
                  onChange={(e) => setControlEnabled(e.target.checked)}
                />
                <span className="text-sm">Allow Remote Control (this tab)</span>
              </label>
            )}
          </div>

          <div
            className="relative aspect-video bg-black rounded-xl overflow-hidden"
            onMouseMove={handleMouse}
            onClick={handleClick}
            onWheel={handleWheel}
            onKeyDown={handleKey}
            onKeyUp={handleKey}
            tabIndex={0}
          >
            {isHost ? (
              <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm p-6">
                <p>
                  As Host, your screen is shared to the Guest once they join.
                  Use the checkbox to allow remote control.
                </p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-contain"
              />
            )}
            {isHost && (
              <div
                ref={overlayRef}
                className="pointer-events-none absolute inset-0"
              >
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: 'var(--cx, 50%)', top: 'var(--cy, 50%)' }}
                >
                  <div className="w-4 h-4 rounded-full border-2 border-cyan-400/80 shadow-[0_0_0_2px_rgba(34,211,238,0.25)]"></div>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Tip: Guests can click/focus the video area, then use mouse/keyboard
            to control. Host must enable control.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-xl text-sm text-slate-300 space-y-2">
            <h2 className="font-semibold">Security & Consent</h2>
            <ul className="list-disc list-inside">
              <li>Guest inputs are ignored unless Host enables control.</li>
              <li>
                No credentials are stored; signaling relays room messages only.
              </li>
              <li>
                Use HTTPS + Secure WebSocket (wss://) in production; configure
                TURN for NATs.
              </li>
            </ul>
          </div>

          <div className="bg-slate-800 p-4 rounded-xl h-[22rem] flex flex-col">
            <h2 className="font-semibold mb-2">Chat</h2>
            <div className="flex-1 overflow-auto space-y-1 text-sm bg-slate-900/60 p-2 rounded-md">
              {chat.map((m, i) => (
                <div key={i} className="text-slate-200">
                  {m}
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-2 py-1"
                placeholder="Type a message"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button
                onClick={sendChat}
                className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-1 rounded-md"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
