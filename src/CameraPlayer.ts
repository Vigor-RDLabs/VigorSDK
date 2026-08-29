import { VigorConfig, TransportType, PlayerState, SessionResponseData } from "./types";
import { mapBackendError, SessionFailedError } from "./errors";

export type EventCallback = (data: any) => void;

export class CameraPlayer {
  private cameraId: string;
  private config: VigorConfig;
  private videoElement?: HTMLVideoElement;
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private state: PlayerState = "idle";
  private isStopped: boolean = false;
  private listeners: Map<string, EventCallback[]> = new Map();
  public transportType: TransportType = "unknown";

  constructor(cameraId: string, config: VigorConfig) {
    this.cameraId = cameraId;
    this.config = config;
  }

  public on(event: string, callback: EventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    return this;
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in listener for event '${event}':`, e);
        }
      });
    }
  }

  public getState(): PlayerState {
    return this.state;
  }

  public async play(videoElement?: HTMLVideoElement): Promise<this> {
    if (this.isStopped) {
      throw new SessionFailedError("Cannot play a stopped CameraPlayer instance.");
    }

    this.videoElement = videoElement;
    this.setState("connecting");

    try {
      // 1. Request Session from Cloud API
      const res = await fetch(`${this.config.baseUrl}/v1/cameras/${this.cameraId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        const detail = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
        throw mapBackendError(detail, res.status);
      }

      const sessionData: SessionResponseData = await res.json();
      this.sessionId = sessionData.session_id;

      // 2. Initialize RTCPeerConnection with dynamic ICE servers
      this.pc = new RTCPeerConnection({
        iceServers: sessionData.ice_servers,
        bundlePolicy: "max-bundle",
      });

      this.pc.ontrack = (evt: RTCTrackEvent) => {
        if (this.videoElement && evt.streams && evt.streams[0]) {
          this.videoElement.srcObject = evt.streams[0];
          this.videoElement.play().catch((err) => console.warn("Autoplay blocked:", err));
        }
        this.setState("playing");
      };

      this.pc.oniceconnectionstatechange = () => {
        if (!this.pc) return;
        const state = this.pc.iceConnectionState;
        if (state === "connected" || state === "completed") {
          this.detectTransportAndReportTelemetry();
        } else if (state === "failed" || state === "closed") {
          if (!this.isStopped) {
            this.setState("failed");
          }
        }
      };

      // 3. Connect ephemeral signaling WebSocket
      const wsUrl = `${sessionData.signaling_url}viewer_${Math.random().toString(36).substring(2, 8)}?token=${sessionData.token}`;
      this.ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        if (!this.ws) return reject(new SessionFailedError("WebSocket initialization failed"));

        this.ws.onopen = () => resolve();
        this.ws.onerror = (err) => reject(new SessionFailedError("Signaling WebSocket connection failed"));
      });

      this.ws.onmessage = async (evt: MessageEvent) => {
        if (typeof evt.data !== "string") return;
        try {
          const message = JSON.parse(evt.data);
          if (message.type === "offer") {
            await this.handleOffer(message);
          }
        } catch (e) {
          console.error("Signaling message error:", e);
        }
      };

      // Send request frame to gateway
      this.ws.send(
        JSON.stringify({
          id: this.cameraId,
          type: "request",
        })
      );

      return this;
    } catch (err: any) {
      this.setState("failed");
      this.emit("error", err);
      await this.stop();
      throw err;
    }
  }

  private async handleOffer(offer: { id: string; type: string; sdp: string }): Promise<void> {
    if (!this.pc || !this.ws) return;

    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offer.sdp }));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await this.waitGatheringComplete();

    if (this.pc.localDescription && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          id: this.cameraId,
          type: this.pc.localDescription.type,
          sdp: this.pc.localDescription.sdp,
        })
      );
    }
  }

  private async waitGatheringComplete(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) return resolve();
      if (this.pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc && this.pc.iceGatheringState === "complete") {
            this.pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        this.pc.addEventListener("icegatheringstatechange", checkState);
        // Timeout safety
        setTimeout(resolve, 2000);
      }
    });
  }

  public async detectTransportAndReportTelemetry(): Promise<TransportType> {
    if (!this.pc || !this.sessionId) return "unknown";

    try {
      const stats = await this.pc.getStats();
      let selectedPair: any = null;

      stats.forEach((report) => {
        if (report.type === "transport" && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId);
        }
      });

      if (!selectedPair) {
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && (report.selected || report.state === "succeeded")) {
            selectedPair = report;
          }
        });
      }

      if (selectedPair) {
        const localCandidate = stats.get(selectedPair.localCandidateId);
        const remoteCandidate = stats.get(selectedPair.remoteCandidateId);

        const isRelay =
          (localCandidate && localCandidate.candidateType === "relay") ||
          (remoteCandidate && remoteCandidate.candidateType === "relay");

        this.transportType = isRelay ? "relay" : "direct";
      } else {
        this.transportType = "unknown";
      }

      // Send telemetry report
      fetch(`${this.config.baseUrl}/v1/sessions/${this.sessionId}/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({ transport_type: this.transportType }),
      }).catch((e) => console.warn("Failed to report transport telemetry:", e));
    } catch (e) {
      this.transportType = "unknown";
    }

    return this.transportType;
  }

  private setState(newState: PlayerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit("statechange", this.state);
    }
  }

  public async stop(): Promise<void> {
    if (this.isStopped) return; // Idempotent cleanup guard
    this.isStopped = true;
    this.setState("stopped");

    // Clear video srcObject
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }

    // Close RTCPeerConnection
    if (this.pc) {
      try {
        this.pc.getTransceivers().forEach((t) => t.stop && t.stop());
        this.pc.getSenders().forEach((s) => s.track && s.track.stop());
        this.pc.close();
      } catch (e) {
        // ignore
      }
      this.pc = null;
    }

    // Notify Cloud via DELETE /v1/sessions/{session_id}
    if (this.sessionId) {
      const sessId = this.sessionId;
      this.sessionId = null;
      fetch(`${this.config.baseUrl}/v1/sessions/${sessId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      }).catch((e) => console.warn("Failed to cancel session on stop:", e));
    }

    this.listeners.clear();
  }
}
