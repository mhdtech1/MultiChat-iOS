type Listener = (event: { data?: unknown }) => void;

type ListenerMap = {
  open: Listener[];
  message: Listener[];
  close: Listener[];
  error: Listener[];
};

export class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readyState = MockWebSocket.OPEN;
  private listeners: ListenerMap = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: keyof ListenerMap, handler: Listener) {
    this.listeners[type].push(handler);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  emit(type: keyof ListenerMap, event: { data?: unknown }) {
    for (const handler of this.listeners[type]) {
      handler(event);
    }
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}
