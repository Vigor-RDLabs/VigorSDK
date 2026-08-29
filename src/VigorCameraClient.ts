import { VigorConfig, Camera } from "./types";
import { CameraPlayer } from "./CameraPlayer";
import { mapBackendError, SessionFailedError } from "./errors";

export class VigorCameraClient {
  private config: VigorConfig;

  constructor(config: VigorConfig) {
    if (!config || !config.baseUrl || !config.accessToken) {
      throw new Error("VigorCameraClient requires baseUrl and accessToken");
    }
    // Token is stored in-memory only (never written to localStorage/sessionStorage/cookies)
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      accessToken: config.accessToken,
    };
  }

  public get cameras() {
    return {
      list: async (): Promise<Camera[]> => {
        const res = await fetch(`${this.config.baseUrl}/v1/cameras`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: res.statusText }));
          const detail = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
          throw mapBackendError(detail, res.status);
        }

        const data: Camera[] = await res.json();
        return data;
      },
    };
  }

  public camera(cameraId: string) {
    return {
      play: async (videoElement?: HTMLVideoElement): Promise<CameraPlayer> => {
        const player = new CameraPlayer(cameraId, this.config);
        await player.play(videoElement);
        return player;
      },
    };
  }
}
