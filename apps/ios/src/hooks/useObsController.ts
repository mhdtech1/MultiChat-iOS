import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import type { ObsAudioInput, ObsSceneItem, ObsStats } from '../types';
import { asRecord, clamp01, readNumber } from '../utils/helpers';

type ObsPendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export function useObsController(showNotice: (message: string) => void) {
  const [obsHost, setObsHost] = useState('127.0.0.1');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [obsConnected, setObsConnected] = useState(false);
  const [obsConnecting, setObsConnecting] = useState(false);
  const [obsStatusText, setObsStatusText] = useState('Disconnected');
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsCurrentScene, setObsCurrentScene] = useState('');
  const [obsSceneItems, setObsSceneItems] = useState<ObsSceneItem[]>([]);
  const [obsAudioInputs, setObsAudioInputs] = useState<ObsAudioInput[]>([]);
  const [obsStats, setObsStats] = useState<ObsStats>({
    cpuUsage: null,
    activeFps: null,
    outputSkippedFrames: null,
    outputTotalFrames: null,
  });
  const [obsStreamActive, setObsStreamActive] = useState(false);
  const [obsRecordActive, setObsRecordActive] = useState(false);

  const obsSocketRef = useRef<WebSocket | null>(null);
  const obsPendingRef = useRef<Map<string, ObsPendingRequest>>(new Map());
  const obsRequestIdRef = useRef(1);
  const obsRpcVersionRef = useRef(1);
  // Mirrors the active password so the handshake reads the latest value even when
  // a quick-connect applies a new config in the same tick (state is async).
  const obsPasswordRef = useRef(obsPassword);

  useEffect(() => {
    obsPasswordRef.current = obsPassword;
  }, [obsPassword]);

  const rejectAllObsPending = useCallback((reason: string) => {
    const pendingEntries = Array.from(obsPendingRef.current.values());
    obsPendingRef.current.clear();
    for (const pending of pendingEntries) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
  }, []);

  const disconnectObs = useCallback(
    (reason = 'Disconnected') => {
      const socket = obsSocketRef.current;
      obsSocketRef.current = null;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      rejectAllObsPending(reason);
      setObsConnected(false);
      setObsConnecting(false);
      setObsStatusText(reason);
      setObsSceneItems([]);
      setObsAudioInputs([]);
      setObsStats({
        cpuUsage: null,
        activeFps: null,
        outputSkippedFrames: null,
        outputTotalFrames: null,
      });
    },
    [rejectAllObsPending]
  );

  const sendObsRequest = useCallback(
    async <T extends Record<string, unknown> = Record<string, unknown>>(
      requestType: string,
      requestData: Record<string, unknown> = {}
    ): Promise<T> => {
      const socket = obsSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('OBS is not connected.');
      }

      return new Promise<T>((resolve, reject) => {
        const requestId = `r-${Date.now()}-${obsRequestIdRef.current++}`;
        const timeoutId = setTimeout(() => {
          obsPendingRef.current.delete(requestId);
          reject(new Error(`${requestType} timed out.`));
        }, 8000);

        obsPendingRef.current.set(requestId, {
          resolve: (value) => resolve(value as T),
          reject,
          timeoutId,
        });

        socket.send(
          JSON.stringify({
            op: 6,
            d: { requestType, requestId, requestData },
          })
        );
      });
    },
    []
  );

  const refreshObsState = useCallback(async () => {
    try {
      const [sceneList, streamStatus, recordStatus, statsResponse] = await Promise.all([
        sendObsRequest('GetSceneList'),
        sendObsRequest('GetStreamStatus'),
        sendObsRequest('GetRecordStatus'),
        sendObsRequest('GetStats'),
      ]);

      const scenesRaw = Array.isArray(sceneList.scenes) ? sceneList.scenes : [];
      const sceneNames = scenesRaw
        .map((item) => {
          const record = asRecord(item);
          return typeof record?.sceneName === 'string' ? record.sceneName : '';
        })
        .filter(Boolean);

      setObsScenes(sceneNames);
      const currentSceneName =
        typeof sceneList.currentProgramSceneName === 'string' ? sceneList.currentProgramSceneName : '';
      setObsCurrentScene(currentSceneName);
      setObsStreamActive(streamStatus.outputActive === true);
      setObsRecordActive(recordStatus.outputActive === true);
      setObsStats({
        cpuUsage: readNumber(statsResponse.cpuUsage),
        activeFps: readNumber(statsResponse.activeFps),
        outputSkippedFrames: readNumber(statsResponse.outputSkippedFrames),
        outputTotalFrames: readNumber(statsResponse.outputTotalFrames),
      });

      if (currentSceneName) {
        const sceneItemsResponse = await sendObsRequest('GetSceneItemList', { sceneName: currentSceneName });
        const sceneItemsRaw = Array.isArray(sceneItemsResponse.sceneItems) ? sceneItemsResponse.sceneItems : [];
        const sceneItems: ObsSceneItem[] = sceneItemsRaw
          .map((item) => {
            const record = asRecord(item);
            const id = readNumber(record?.sceneItemId);
            const name = typeof record?.sourceName === 'string' ? record.sourceName : '';
            const enabled = record?.sceneItemEnabled === true;
            if (!id || !name) return null;
            return { sceneItemId: id, sourceName: name, enabled };
          })
          .filter(Boolean) as ObsSceneItem[];
        setObsSceneItems(sceneItems);
      } else {
        setObsSceneItems([]);
      }

      const inputListResponse = await sendObsRequest('GetInputList');
      const inputRows = Array.isArray(inputListResponse.inputs) ? inputListResponse.inputs : [];
      const inputNames = inputRows
        .map((item) => {
          const row = asRecord(item);
          return typeof row?.inputName === 'string' ? row.inputName : '';
        })
        .filter(Boolean);
      const uniqueInputNames = Array.from(new Set(inputNames));

      const audioStates = await Promise.all(
        uniqueInputNames.map(async (inputName) => {
          try {
            const [muteResponse, volumeResponse] = await Promise.all([
              sendObsRequest('GetInputMute', { inputName }),
              sendObsRequest('GetInputVolume', { inputName }),
            ]);
            return {
              inputName,
              muted: muteResponse.inputMuted === true,
              volumeMul: clamp01(readNumber(volumeResponse.inputVolumeMul) ?? 1),
            } satisfies ObsAudioInput;
          } catch {
            return null;
          }
        })
      );
      setObsAudioInputs(audioStates.filter(Boolean) as ObsAudioInput[]);
    } catch (error) {
      setObsStatusText(error instanceof Error ? error.message : String(error));
    }
  }, [sendObsRequest]);

  const handleObsMessage = useCallback(
    async (raw: string) => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (!payload || typeof payload !== 'object') return;
      const message = payload as { op?: number; d?: unknown };
      if (typeof message.op !== 'number') return;

      if (message.op === 0) {
        const hello = asRecord(message.d);
        const rpcVersion = typeof hello?.rpcVersion === 'number' ? hello.rpcVersion : 1;
        obsRpcVersionRef.current = rpcVersion;

        let authentication: string | undefined;
        const authBlock = asRecord(hello?.authentication);
        const challenge = typeof authBlock?.challenge === 'string' ? authBlock.challenge : '';
        const salt = typeof authBlock?.salt === 'string' ? authBlock.salt : '';
        if (challenge && salt) {
          const activePassword = obsPasswordRef.current;
          if (!activePassword.trim()) {
            throw new Error('OBS requires a password.');
          }
          const secret = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${activePassword}${salt}`, {
            encoding: Crypto.CryptoEncoding.BASE64,
          });
          authentication = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${secret}${challenge}`,
            { encoding: Crypto.CryptoEncoding.BASE64 }
          );
        }

        const socket = obsSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            op: 1,
            d: { rpcVersion, authentication, eventSubscriptions: 1023 },
          })
        );
        return;
      }

      if (message.op === 2) {
        setObsConnected(true);
        setObsConnecting(false);
        setObsStatusText('Connected');
        void refreshObsState();
        return;
      }

      if (message.op === 5) {
        const eventPayload = asRecord(message.d);
        const eventType = typeof eventPayload?.eventType === 'string' ? eventPayload.eventType : '';
        const eventData = asRecord(eventPayload?.eventData);

        if (eventType === 'CurrentProgramSceneChanged') {
          const sceneName = typeof eventData?.sceneName === 'string' ? eventData.sceneName : '';
          if (sceneName) {
            setObsCurrentScene(sceneName);
            void refreshObsState();
          }
        } else if (eventType === 'StreamStateChanged') {
          setObsStreamActive(eventData?.outputActive === true);
        } else if (eventType === 'RecordStateChanged') {
          setObsRecordActive(eventData?.outputActive === true);
        } else if (eventType === 'SceneItemEnableStateChanged') {
          const sceneItemId = readNumber(eventData?.sceneItemId);
          const enabled = eventData?.sceneItemEnabled === true;
          if (!sceneItemId) return;
          setObsSceneItems((previous) =>
            previous.map((item) => (item.sceneItemId === sceneItemId ? { ...item, enabled } : item))
          );
        } else if (eventType === 'InputMuteStateChanged') {
          const inputName = typeof eventData?.inputName === 'string' ? eventData.inputName : '';
          const inputMuted = eventData?.inputMuted === true;
          if (!inputName) return;
          setObsAudioInputs((previous) =>
            previous.map((item) => (item.inputName === inputName ? { ...item, muted: inputMuted } : item))
          );
        } else if (eventType === 'InputVolumeChanged') {
          const inputName = typeof eventData?.inputName === 'string' ? eventData.inputName : '';
          const inputVolumeMul = clamp01(readNumber(eventData?.inputVolumeMul) ?? 1);
          if (!inputName) return;
          setObsAudioInputs((previous) =>
            previous.map((item) => (item.inputName === inputName ? { ...item, volumeMul: inputVolumeMul } : item))
          );
        }
        return;
      }

      if (message.op === 7) {
        const responsePayload = asRecord(message.d);
        if (!responsePayload) return;
        const requestId = typeof responsePayload.requestId === 'string' ? responsePayload.requestId : '';
        if (!requestId) return;

        const pending = obsPendingRef.current.get(requestId);
        if (!pending) return;
        obsPendingRef.current.delete(requestId);
        clearTimeout(pending.timeoutId);

        const requestStatus = asRecord(responsePayload.requestStatus);
        if (requestStatus?.result !== true) {
          const comment =
            typeof requestStatus?.comment === 'string' && requestStatus.comment
              ? requestStatus.comment
              : 'OBS request failed.';
          pending.reject(new Error(comment));
          return;
        }

        pending.resolve(asRecord(responsePayload.responseData) ?? {});
      }
    },
    [refreshObsState]
  );

  const connectObs = useCallback(
    (override?: { host: string; port: string; password: string }) => {
    if (obsConnecting || obsConnected) return;

    const host = (override?.host ?? obsHost).trim();
    const port = (override?.port ?? obsPort).trim();
    if (!host || !port) {
      showNotice('OBS host and port are required.');
      return;
    }

    if (override) {
      setObsHost(override.host);
      setObsPort(override.port);
      setObsPassword(override.password);
    }
    // Use the explicit password immediately; state updates are async.
    obsPasswordRef.current = override?.password ?? obsPassword;

    setObsConnecting(true);
    setObsStatusText('Connecting...');

    try {
      const socket = new WebSocket(`ws://${host}:${port}`);
      obsSocketRef.current = socket;

      socket.onopen = () => {
        setObsStatusText('Socket connected. Waiting for OBS handshake...');
      };

      socket.onmessage = (event) => {
        void handleObsMessage(String(event.data)).catch((error) => {
          const text = error instanceof Error ? error.message : String(error);
          setObsStatusText(text);
          showNotice(text);
          disconnectObs('OBS authentication failed.');
        });
      };

      socket.onerror = () => {
        setObsStatusText('OBS socket error.');
      };

      socket.onclose = () => {
        const wasConnected = obsConnected;
        rejectAllObsPending('OBS connection closed.');
        setObsConnected(false);
        setObsConnecting(false);
        setObsStatusText(wasConnected ? 'Disconnected' : 'Could not connect to OBS.');
      };
    } catch (error) {
      setObsConnecting(false);
      setObsConnected(false);
      setObsStatusText(error instanceof Error ? error.message : String(error));
    }
    },
    [
      obsConnected,
      obsConnecting,
      obsHost,
      obsPort,
      obsPassword,
      handleObsMessage,
      disconnectObs,
      rejectAllObsPending,
      showNotice,
    ]
  );

  const switchObsScene = useCallback(
    async (sceneName: string) => {
      if (!sceneName) return;
      try {
        await sendObsRequest('SetCurrentProgramScene', { sceneName });
        setObsCurrentScene(sceneName);
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [sendObsRequest, showNotice]
  );

  const toggleObsStream = useCallback(async () => {
    try {
      await sendObsRequest(obsStreamActive ? 'StopStream' : 'StartStream');
      await refreshObsState();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  }, [obsStreamActive, refreshObsState, sendObsRequest, showNotice]);

  const toggleObsRecord = useCallback(async () => {
    try {
      await sendObsRequest(obsRecordActive ? 'StopRecord' : 'StartRecord');
      await refreshObsState();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  }, [obsRecordActive, refreshObsState, sendObsRequest, showNotice]);

  const toggleObsSceneItem = useCallback(
    async (sceneItem: ObsSceneItem) => {
      if (!obsCurrentScene) return;
      try {
        await sendObsRequest('SetSceneItemEnabled', {
          sceneName: obsCurrentScene,
          sceneItemId: sceneItem.sceneItemId,
          sceneItemEnabled: !sceneItem.enabled,
        });
        setObsSceneItems((previous) =>
          previous.map((item) =>
            item.sceneItemId === sceneItem.sceneItemId ? { ...item, enabled: !sceneItem.enabled } : item
          )
        );
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [obsCurrentScene, sendObsRequest, showNotice]
  );

  const toggleObsInputMute = useCallback(
    async (input: ObsAudioInput) => {
      try {
        await sendObsRequest('SetInputMute', { inputName: input.inputName, inputMuted: !input.muted });
        setObsAudioInputs((previous) =>
          previous.map((item) => (item.inputName === input.inputName ? { ...item, muted: !item.muted } : item))
        );
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [sendObsRequest, showNotice]
  );

  const adjustObsInputVolume = useCallback(
    async (input: ObsAudioInput, delta: number) => {
      try {
        const nextVolume = clamp01(input.volumeMul + delta);
        await sendObsRequest('SetInputVolume', { inputName: input.inputName, inputVolumeMul: nextVolume });
        setObsAudioInputs((previous) =>
          previous.map((item) => (item.inputName === input.inputName ? { ...item, volumeMul: nextVolume } : item))
        );
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [sendObsRequest, showNotice]
  );

  const applyObsConfig = useCallback(
    (config: { host: string; port: string; password: string }) => {
      setObsHost(config.host);
      setObsPort(config.port);
      setObsPassword(config.password);
    },
    []
  );

  const cleanupObs = useCallback(() => {
    disconnectObs('App closed.');
  }, [disconnectObs]);

  return {
    obsHost,
    setObsHost,
    obsPort,
    setObsPort,
    obsPassword,
    setObsPassword,
    obsConnected,
    obsConnecting,
    obsStatusText,
    obsScenes,
    obsCurrentScene,
    obsSceneItems,
    obsAudioInputs,
    obsStats,
    obsStreamActive,
    obsRecordActive,
    connectObs,
    disconnectObs,
    refreshObsState,
    switchObsScene,
    toggleObsStream,
    toggleObsRecord,
    toggleObsSceneItem,
    toggleObsInputMute,
    adjustObsInputVolume,
    applyObsConfig,
    cleanupObs,
  };
}
