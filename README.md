# VigorConnect Web SDK

Complete JavaScript/TypeScript reference implementation and sample web client for integrating real-time low-latency IP camera streaming over WebRTC P2P using **VigorConnect**.

## Overview

The VigorConnect Web SDK provides developer-friendly abstractions for establish ultra-low latency WebRTC P2P video sessions directly between browser clients and VigorConnect Edge Gateways.

### Features
- **Ultra-Low Latency**: Direct P2P WebRTC connection with sub-200ms latency.
- **Zero Plugins Required**: Works out-of-the-box in modern desktop and mobile browsers.
- **Automatic Fallback**: TURN relay integration for restricted NAT environments.
- **HTML5 `<video>` Binding**: Seamless integration with standard HTML video tags.

## Installation

Install directly from GitHub repository:

```bash
npm install git+https://github.com/Vigor-RDLabs/VigorConnect_sdk.git
# OR using yarn / pnpm
yarn add git+https://github.com/Vigor-RDLabs/VigorConnect_sdk.git
```

## Quickstart Usage

```typescript
import { VigorCameraClient, CameraPlayer } from '@vigor/camera-sdk';

// 1. Initialize client with signaling endpoint
const client = new VigorCameraClient({
  signalingUrl: 'wss://your-signaling-server.vigorlabs.ai'
});

// 2. Request P2P session for a camera
const session = await client.requestSession({
  cameraId: 'cam_office_01',
  token: 'YOUR_AUTH_TOKEN'
});

// 3. Attach media stream to HTML <video> element
const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
const player = new CameraPlayer(videoElement);
player.attachStream(session.stream);
```

## Sample HTML Client

Check out [`index.html`](./index.html) and [`client.js`](./client.js) in this repository for a complete standalone browser demonstration.

## License

MIT License. Copyright (c) 2026 VigorLabs.