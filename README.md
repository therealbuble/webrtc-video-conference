# WebRTC Video Conference

A modern, peer-to-peer video conferencing application built with WebRTC, Socket.io, and Express.

![WebRTC Demo](https://raw.githubusercontent.com/username/repo/main/screenshot.png) <!-- Replace with actual screenshot or placeholder -->

## Features

- 📹 **Real-time Video/Audio**: High-quality p2p communication.
- 👥 **Multi-user Support**: Connect with up to 3 participants per room.
- 🔗 **Easy Joining**: Share room links for instant access.
- 🎤 **Media Controls**: Toggle microphone and camera during calls.
- 📱 **Mobile Responsive**: Works on desktops, tablets, and smartphones.
- 🔔 **In-app Notifications**: Stay updated on participant activity.

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Communication**: WebRTC (p2p)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/webrtc-video-conference.git
   cd webrtc-video-conference
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

Access the app at `http://localhost:3000`.

## ⚠️ Important: HTTPS & Localhost

WebRTC requires a **Secure Context** (HTTPS) to access the camera and microphone.
- **Localhost**: Browsers treat `localhost` as secure, so it works without HTTPS.
- **Production**: You **MUST** use HTTPS if accessing from a domain or public IP.

## License

This project is licensed under the ISC License.
