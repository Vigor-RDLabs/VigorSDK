export class VigorError extends Error {
  public code: string;
  public statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "VigorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class SubscriptionExpiredError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Subscription has expired", "SUBSCRIPTION_EXPIRED", 403);
    this.name = "SubscriptionExpiredError";
  }
}

export class SubscriptionSuspendedError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Subscription is suspended", "SUBSCRIPTION_SUSPENDED", 403);
    this.name = "SubscriptionSuspendedError";
  }
}

export class CameraOfflineError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Camera is operational offline", "CAMERA_OFFLINE", 503);
    this.name = "CameraOfflineError";
  }
}

export class GatewayOfflineError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Gateway control connection is offline", "GATEWAY_OFFLINE", 503);
    this.name = "GatewayOfflineError";
  }
}

export class CameraNotEnabledError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Camera entitlement is not enabled", "CAMERA_NOT_ENABLED", 403);
    this.name = "CameraNotEnabledError";
  }
}

export class CameraForbiddenError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Application does not have permission to access camera", "APP_CAMERA_FORBIDDEN", 403);
    this.name = "CameraForbiddenError";
  }
}

export class ViewerTokenExpiredError extends VigorError {
  constructor(detail?: string) {
    super(detail || "Viewer Access Token has expired", "VIEWER_TOKEN_EXPIRED", 401);
    this.name = "ViewerTokenExpiredError";
  }
}

export class SessionFailedError extends VigorError {
  constructor(detail?: string, statusCode?: number) {
    super(detail || "Session creation or connection failed", "SESSION_FAILED", statusCode);
    this.name = "SessionFailedError";
  }
}

export function mapBackendError(detail: string, status: number): VigorError {
  if (detail.includes("SUBSCRIPTION_EXPIRED")) return new SubscriptionExpiredError(detail);
  if (detail.includes("SUBSCRIPTION_SUSPENDED")) return new SubscriptionSuspendedError(detail);
  if (detail.includes("CAMERA_OFFLINE")) return new CameraOfflineError(detail);
  if (detail.includes("GATEWAY_OFFLINE")) return new GatewayOfflineError(detail);
  if (detail.includes("CAMERA_NOT_ENABLED")) return new CameraNotEnabledError(detail);
  if (detail.includes("APP_CAMERA_FORBIDDEN")) return new CameraForbiddenError(detail);
  if (detail.includes("VIEWER_TOKEN_EXPIRED")) return new ViewerTokenExpiredError(detail);
  return new SessionFailedError(detail, status);
}
