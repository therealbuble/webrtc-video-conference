# WebRTC Video Conference

A simple, real-time video conferencing application built with WebRTC, Socket.io, and Node.js.

## Features

*   **Real-time Video & Audio**: Up to 3 participants per room.
*   **Live Chat**: Public and private messaging.
*   **Enhanced Audio**: High-pass filter and compressor for clear voice.
*   **Clean URLs**: Shareable links (e.g., `http://localhost:3000/room-name`).
*   **Responsive UI**: Works on desktop and mobile.

## Setup Instructions

1.  **Prerequisites**:
    *   Node.js (v14 or higher) installed on your machine.
    *   A modern web browser (Chrome, Firefox, Edge).

2.  **Installation**:
    Open your terminal in the project directory and run:
    ```bash
    npm install
    ```

## Dependencies

*   [**express**](https://expressjs.com/): Web server framework.
*   [**socket.io**](https://socket.io/): Real-time bidirectional event-based communication.

## Steps to Run Locally

1.  **Start the Server**:
    Run the following command in the project root:
    ```bash
    npm start
    ```

2.  **Access the Application**:
    Open your web browser and navigate to:
    [http://localhost:3000](http://localhost:3000)

3.  **Join a Meeting**:
    *   Click "Start Meeting" to create a new room.
    *   Share the link (displayed at the top) with others.
    *   Or, paste a link into the "Join Meeting" box.

## Known Limitations

*   **HTTP Only (Localhost)**: This project runs on `http://localhost`. For features like the camera and microphone to work over the internet/network (e.g., connecting from your phone to your computer), you **must** serve the application over **HTTPS**.
    *   *Workaround:* Use a tunneling service like **ngrok** for testing over the internet.
*   **Mesh Network Topology**: This app uses a full-mesh WebRTC topology, meaning every user connects directly to every other user. This limits performance to about 3-4 participants before bandwidth/CPU usage becomes too high.
*   **No Turn Server**: This demo uses public STUN servers (Google's). Connection reliability might be lower on restrictive networks (e.g., corporate firewalls) that require a TURN server to relay traffic.

## Architecture

This diagram illustrates the **Signaling** (Socket.io) and **Media** (WebRTC) flows.

```mermaid
graph TD
    subgraph Clients
        P1[Client A (Browser)]
        P2[Client B (Browser)]
    end

    subgraph Backend
        S[Node.js Server]
        DB[(Memory Store)]
        S --- DB
    end

    subgraph "External"
        STUN[Google STUN Server]
    end

    %% Signaling Flow
    P1 -- "Socket.io (Signaling)" --> S
    P2 -- "Socket.io (Signaling)" --> S

    %% NAT Traversal
    P1 -.-> STUN
    P2 -.-> STUN

    %% Peer Connection
    P1 == "WebRTC P2P Media (Video/Audio)" ==> P2
    P2 == "WebRTC P2P Media (Video/Audio)" ==> P1

    classDef server fill:#f9f,stroke:#333,stroke-width:2px;
    classDef client fill:#bbf,stroke:#333,stroke-width:2px;
    classDef media fill:#bfb,stroke:#333,stroke-width:4px;
    
    class S,STUN server;
    class P1,P2 client;
```

