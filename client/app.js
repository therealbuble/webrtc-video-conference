// Socket.io connection
const socket = io();

// Check browser support
function checkBrowserSupport() {
    const isSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
    if (!isSupported) {
        document.getElementById('unsupported-browser').classList.remove('hidden');
        alert('Your browser does not support WebRTC. Use Chrome, Firefox, or Edge.');
        return false;
    }
    return true;
}

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// State management
let localStream = null;
let peers = new Map(); // Map of userId -> { connection, stream, displayName }
let currentRoomId = null;
let displayName = 'Anonymous';
let isMicEnabled = true;
let isCameraEnabled = true;

// DOM elements
const homePage = document.getElementById('home-page');
const meetingPage = document.getElementById('meeting-page');
const startMeetingBtn = document.getElementById('start-meeting-btn');
const joinMeetingBtn = document.getElementById('join-meeting-btn');
const joinForm = document.getElementById('join-form');
const meetingLinkInput = document.getElementById('meeting-link-input');
const displayNameInput = document.getElementById('display-name-input');
const joinSubmitBtn = document.getElementById('join-submit-btn');
const joinCancelBtn = document.getElementById('join-cancel-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const endCallBtn = document.getElementById('end-call-btn');
const videoGrid = document.getElementById('video-grid');
const roomTitle = document.getElementById('room-title');
const notifications = document.getElementById('notifications');

// Utility functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

function getRoomUrl(roomId) {
    return `${window.location.origin}?room=${roomId}`;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notifications.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Initialize local media stream
async function initLocalStream() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        addVideoStream('local', localStream, 'You (Me)', true);
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        let errorMsg = 'Unable to access camera/microphone.';

        if (error.name === 'NotAllowedError') {
            errorMsg += ' Please grant permission when prompted.';
        } else if (error.name === 'NotFoundError') {
            errorMsg += ' No camera or microphone found.';
        } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            errorMsg += ' WebRTC requires HTTPS or localhost.';
        }

        showNotification(errorMsg, 'error');
        alert(errorMsg);
        return false;
    }
}

// Add video stream to grid
function addVideoStream(userId, stream, name, isLocal = false) {
    // Check if video already exists
    if (document.getElementById(`video-container-${userId}`)) {
        return;
    }

    const videoContainer = document.createElement('div');
    videoContainer.id = `video-container-${userId}`;
    videoContainer.className = 'video-container';

    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    if (isLocal) {
        video.muted = true; // Mute local video to prevent echo
    }

    const nameLabel = document.createElement('div');
    nameLabel.className = 'name-label';
    nameLabel.textContent = name;

    videoContainer.appendChild(video);
    videoContainer.appendChild(nameLabel);
    videoGrid.appendChild(videoContainer);
}

// Remove video stream from grid
function removeVideoStream(userId) {
    const videoContainer = document.getElementById(`video-container-${userId}`);
    if (videoContainer) {
        videoContainer.remove();
    }
}

// Create peer connection
function createPeerConnection(userId, displayName) {
    const peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: userId
            });
        }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;

        if (!peers.get(userId).stream) {
            peers.get(userId).stream = remoteStream;
            addVideoStream(userId, remoteStream, displayName);
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}:`, peerConnection.connectionState);

        if (peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'disconnected') {
            handleUserLeft(userId, displayName);
        }
    };

    return peerConnection;
}

// Start meeting
async function startMeeting() {
    const name = prompt('Enter your display name:', 'Anonymous');
    if (!name) return;

    displayName = name;
    const roomId = generateRoomId();

    await joinRoom(roomId);
}

// Join meeting from link
async function joinMeetingFromLink() {
    const link = meetingLinkInput.value.trim();
    const name = displayNameInput.value.trim();

    if (!link) {
        alert('Please enter a meeting link');
        return;
    }

    if (!name) {
        alert('Please enter your name');
        return;
    }

    // Extract room ID from URL
    const url = new URL(link);
    const roomId = url.searchParams.get('room');

    if (!roomId) {
        alert('Invalid meeting link');
        return;
    }

    displayName = name;
    await joinRoom(roomId);
}

// Join room
async function joinRoom(roomId) {
    // Initialize local stream
    const success = await initLocalStream();
    if (!success) return;

    currentRoomId = roomId;

    // Update UI
    homePage.classList.remove('active');
    meetingPage.classList.add('active');
    roomTitle.textContent = `Room: ${roomId.substring(0, 8)}...`;

    // Update URL without reload
    const newUrl = getRoomUrl(roomId);
    window.history.pushState({ roomId }, '', newUrl);

    // Join room via socket
    socket.emit('join-room', { roomId, displayName });
}

// Handle existing users in room
socket.on('existing-users', async (users) => {
    console.log('Existing users:', users);

    for (const user of users) {
        await createOffer(user.userId, user.displayName);
    }
});

// Create and send offer
async function createOffer(userId, displayName) {
    try {
        const peerConnection = createPeerConnection(userId, displayName);
        peers.set(userId, {
            connection: peerConnection,
            stream: null,
            displayName
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('offer', {
            offer,
            to: userId
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle incoming offer
socket.on('offer', async ({ offer, from, displayName }) => {
    console.log('Received offer from:', from);

    try {
        const peerConnection = createPeerConnection(from, displayName);
        peers.set(from, {
            connection: peerConnection,
            stream: null,
            displayName
        });

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', {
            answer,
            to: from
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

// Handle incoming answer
socket.on('answer', async ({ answer, from }) => {
    console.log('Received answer from:', from);

    try {
        const peer = peers.get(from);
        if (peer && peer.connection) {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (error) {
        console.error('Error handling answer:', error);
    }
});

// Handle incoming ICE candidate
socket.on('ice-candidate', async ({ candidate, from }) => {
    try {
        const peer = peers.get(from);
        if (peer && peer.connection) {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle new user joined
socket.on('user-joined', ({ userId, displayName }) => {
    console.log(`User joined: ${displayName} (${userId})`);
    showNotification(`${displayName} joined the meeting`, 'success');
});

// Handle user left
socket.on('user-left', ({ userId, displayName }) => {
    handleUserLeft(userId, displayName);
});

function handleUserLeft(userId, displayName) {
    console.log(`User left: ${displayName} (${userId})`);

    const peer = peers.get(userId);
    if (peer) {
        if (peer.connection) {
            peer.connection.close();
        }
        peers.delete(userId);
    }

    removeVideoStream(userId);
    showNotification(`${displayName} left the meeting`, 'warning');
}

// Handle room full
socket.on('room-full', () => {
    alert('This meeting room is full (maximum 3 participants)');
    leaveMeeting();
});

// Toggle microphone
function toggleMicrophone() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isMicEnabled = !isMicEnabled;
            audioTrack.enabled = isMicEnabled;

            toggleMicBtn.classList.toggle('active', isMicEnabled);
            toggleMicBtn.classList.toggle('inactive', !isMicEnabled);
            toggleMicBtn.querySelector('.icon').textContent = isMicEnabled ? '🎤' : '🎤❌';
        }
    }
}

// Toggle camera
function toggleCamera() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isCameraEnabled = !isCameraEnabled;
            videoTrack.enabled = isCameraEnabled;

            toggleCameraBtn.classList.toggle('active', isCameraEnabled);
            toggleCameraBtn.classList.toggle('inactive', !isCameraEnabled);
            toggleCameraBtn.querySelector('.icon').textContent = isCameraEnabled ? '📹' : '📹❌';
        }
    }
}

// Leave meeting
function leaveMeeting() {
    // Close all peer connections
    peers.forEach((peer, userId) => {
        if (peer.connection) {
            peer.connection.close();
        }
        removeVideoStream(userId);
    });
    peers.clear();

    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Remove local video
    removeVideoStream('local');

    // Notify server
    if (currentRoomId) {
        socket.emit('leave-room');
        currentRoomId = null;
    }

    // Reset UI
    meetingPage.classList.remove('active');
    homePage.classList.add('active');
    joinForm.classList.add('hidden');
    meetingLinkInput.value = '';
    displayNameInput.value = '';

    // Reset URL
    window.history.pushState({}, '', '/');

    // Reset controls
    isMicEnabled = true;
    isCameraEnabled = true;
    toggleMicBtn.classList.add('active');
    toggleMicBtn.classList.remove('inactive');
    toggleCameraBtn.classList.add('active');
    toggleCameraBtn.classList.remove('inactive');
}

// Copy meeting link
function copyMeetingLink() {
    if (currentRoomId) {
        const link = getRoomUrl(currentRoomId);
        navigator.clipboard.writeText(link).then(() => {
            showNotification('Meeting link copied to clipboard!', 'success');
        }).catch(() => {
            alert(`Copy this link: ${link}`);
        });
    }
}

// Event listeners
startMeetingBtn.addEventListener('click', startMeeting);

joinMeetingBtn.addEventListener('click', () => {
    joinForm.classList.toggle('hidden');
});

joinCancelBtn.addEventListener('click', () => {
    joinForm.classList.add('hidden');
    meetingLinkInput.value = '';
    displayNameInput.value = '';
});

joinSubmitBtn.addEventListener('click', joinMeetingFromLink);

copyLinkBtn.addEventListener('click', copyMeetingLink);
toggleMicBtn.addEventListener('click', toggleMicrophone);
toggleCameraBtn.addEventListener('click', toggleCamera);
endCallBtn.addEventListener('click', leaveMeeting);

// Handle page load with room parameter
window.addEventListener('load', () => {
    if (!checkBrowserSupport()) return;

    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
        // Show join form pre-filled
        joinForm.classList.remove('hidden');
        meetingLinkInput.value = window.location.href;
        displayNameInput.focus();
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (currentRoomId) {
        leaveMeeting();
    }
});