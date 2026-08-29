export interface VigorConfig {
  baseUrl: string;
  accessToken: string;
}

export interface Camera {
  id: string;
  name: string;
  status: "online" | "offline";
  enabled?: boolean;
  created_at?: string;
}

export type TransportType = "direct" | "relay" | "unknown";

export type PlayerState = "idle" | "connecting" | "playing" | "stopped" | "failed";

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface SessionResponseData {
  session_id: string;
  camera_id: string;
  token: string;
  expires_at: string;
  signaling_url: string;
  ice_servers: IceServer[];
}
