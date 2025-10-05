export type AgentBridge = {
  connected: boolean;
  sendCtrl: (m: any) => void;
  setAllowed: (allowed: boolean) => void;
};

export function createAgentBridge(token?: string): AgentBridge {
  let ws: WebSocket | null = null;
  const b: AgentBridge = {
    connected: false,
    sendCtrl: (m) => {
      if (ws && b.connected)
        ws.send(
          JSON.stringify({ type: 'ctrl', ...(token ? { token } : {}), ...m }),
        );
    },
    setAllowed: (allowed) => {
      if (ws && b.connected)
        ws.send(
          JSON.stringify({
            type: 'set-allowed',
            ...(token ? { token } : {}),
            allowed,
          }),
        );
    },
  };

  try {
    ws = new WebSocket('ws://127.0.0.1:7777');
    ws.onopen = () => {
      b.connected = true;
      if (token) ws!.send(JSON.stringify({ type: 'hello', token }));
    };
    ws.onclose = () => {
      b.connected = false;
    };
  } catch {
    // agent not running: stay disconnected
  }
  return b;
}
