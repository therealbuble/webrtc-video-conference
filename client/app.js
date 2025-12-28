// Socket.io connection
const socket = io();

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// State management
let localStream = null;
let processedAudioTrack = null;
let peers = new Map(); // Map of userId -> { connection, stream, displayName }
let currentRoomId = null;
let displayName = 'Anonymous';
let isMicEnabled = true;
let isCameraEnabled = true;
let isChatOpen = false;
let unreadMessages = 0;

// DOM elements
const homePage = document.getElementById('home-page');
const meetingPage = document.getElementById('meeting-page');
const startMeetingBtn = document.getElementById('start-meeting-btn');
const joinMeetingBtn = document.getElementById('join-meeting-btn');
const joinForm = document.getElementById('join-form');
const meetingLinkInput = document.getElementById('meeting-link-input');
const joinSubmitBtn = document.getElementById('join-submit-btn');
const joinCancelBtn = document.getElementById('join-cancel-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const meetingLinkDisplay = document.getElementById('meeting-link-display');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const endCallBtn = document.getElementById('end-call-btn');
const videoGrid = document.getElementById('video-grid');
const roomTitle = document.getElementById('room-title');
const notifications = document.getElementById('notifications');
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatToSelect = document.getElementById('chat-to-select');
const chatBadge = document.getElementById('chat-badge');

// Utility functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

function getRoomUrl(roomId) {
    return `${window.location.origin}/${roomId}`;
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

// Process audio stream using Web Audio API
function processAudio(stream) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        // Highpass filter to remove low frequency noise (rumble, fans)
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 100; // Cutoff frequency 100Hz

        // Compressor to even out volume levels and prevent clipping
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        source.connect(highpass);
        highpass.connect(compressor);
        compressor.connect(destination);

        return destination.stream.getAudioTracks()[0];
    } catch (e) {
        console.error('Web Audio API not supported or error:', e);
        return stream.getAudioTracks()[0];
    }
}

// Initialize local media stream
async function initLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                googAutoGainControl: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        // Initialize processed audio track
        if (localStream.getAudioTracks().length > 0) {
            try {
                processedAudioTrack = processAudio(localStream);
                console.log('Audio processing initialized successfully');
            } catch (err) {
                console.error('Failed to initialize audio processing:', err);
            }
        }

        addVideoStream('local', localStream, 'You (Me)', true);
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        let errorMessage = 'Unable to access camera/microphone.';
        if (error.name === 'NotAllowedError') {
            errorMessage += ' Please allow permissions in your browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += ' No camera or microphone found.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += ' Hardware is already in use by another application.';
        }
        alert(errorMessage);
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

// Handle incoming chat message
socket.on('chat-message', ({ message, from, displayName, timestamp, isPrivate }) => {
    appendMessage(message, from, displayName, timestamp, isPrivate);

    if (!isChatOpen) {
        unreadMessages++;
        chatBadge.textContent = unreadMessages;
        chatBadge.classList.remove('hidden');
        showNotification(
            `New ${isPrivate ? 'private ' : ''}message from ${from === socket.id ? 'Me' : displayName}`,
            'info'
        );
    }
});

// Append message to chat
function appendMessage(message, from, displayName, timestamp, isPrivate) {
    const isLocal = from === socket.id;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isLocal ? 'outgoing' : 'incoming'} ${isPrivate ? 'private' : ''}`;

    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let metaText = isLocal ? 'You' : displayName;
    if (isPrivate) {
        metaText += ' (Private)';
    }

    msgDiv.innerHTML = `
        <div class="meta">${metaText}</div>
        ${message}
        <div class="time">${time}</div>
    `;

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send chat message
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    const to = chatToSelect.value; // Empty string for Everyone, or userId

    socket.emit('chat-message', {
        message,
        to,
        timestamp: Date.now()
    });

    chatInput.value = '';
}

// Update chat participants dropdown
function updateChatParticipants() {
    // Save current selection
    const currentSelection = chatToSelect.value;

    // Clear options except "Everyone"
    chatToSelect.innerHTML = '<option value="">Everyone</option>';

    // Add current peers
    for (const [userId, peer] of peers) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = peer.displayName;
        chatToSelect.appendChild(option);
    }

    // Restore selection if possible, otherwise default to everyone
    if (currentSelection && peers.has(currentSelection)) {
        chatToSelect.value = currentSelection;
    } else {
        chatToSelect.value = "";
    }
}

// Toggle Chat
function toggleChat() {
    isChatOpen = !isChatOpen;
    chatContainer.classList.toggle('hidden', !isChatOpen);

    if (isChatOpen) {
        unreadMessages = 0;
        chatBadge.classList.add('hidden');
        chatBadge.textContent = '';
        setTimeout(() => chatInput.focus(), 300);
    }
}

// Create peer connection
function createPeerConnection(userId, displayName) {
    const peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
    if (localStream) {
        try {
            // Add video track
            localStream.getVideoTracks().forEach(track => {
                console.log(`Adding video track: ${track.id}`);
                peerConnection.addTrack(track, localStream);
            });

            // Add processed audio track if available, otherwise original
            if (processedAudioTrack) {
                console.log('Adding processed audio track');
                peerConnection.addTrack(processedAudioTrack, localStream);
            } else {
                console.log('Adding original audio track (no processing)');
                localStream.getAudioTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
            }
        } catch (err) {
            console.error('Error adding tracks to peer connection:', err);
        }
    } else {
        console.warn('No local stream to add to peer connection');
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
        console.log(`Received remote track from ${userId}:`, event.track.kind, event.streams[0]?.id);
        const [remoteStream] = event.streams;

        if (!remoteStream) {
            console.warn('Received track with no streams!');
            return;
        }

        if (!peers.get(userId).stream || peers.get(userId).stream.id !== remoteStream.id) {
            console.log(`Setting remote stream for ${userId}`);
            peers.get(userId).stream = remoteStream;
            addVideoStream(userId, remoteStream, displayName);
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
        console.log(`ICE Connection state with ${userId}:`, peerConnection.iceConnectionState);

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

// Join meeting from link - ENHANCED VERSION
async function joinMeetingFromLink() {
    const link = meetingLinkInput.value.trim();
    const nameInput = document.getElementById('display-name-input');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!link) {
        alert('Please enter a meeting link');
        return;
    }

    if (!name) {
        alert('Please enter your name');
        return;
    }

    // Extract room ID from URL - supports both query param and path-based URLs
    let roomId;
    try {
        const url = new URL(link);

        // Try query parameter first (e.g., ?room=abc123)
        roomId = url.searchParams.get('room');

        // If no query param, extract from path (e.g., /abc123)
        if (!roomId) {
            const path = url.pathname;
            roomId = path.substring(1); // Remove leading '/'
        }
    } catch (e) {
        // If URL parsing fails, treat the input as a room ID directly
        roomId = link;
    }

    if (!roomId || roomId === '') {
        alert('Invalid meeting link');
        return;
    }

    displayName = name;
    await joinRoom(roomId);
}

// NEW: Quick join function for direct link clicks
async function quickJoinFromUrl(roomId) {
    const name = prompt('Enter your display name to join the meeting:', 'Anonymous');
    if (!name) {
        // User cancelled, go back to home
        window.history.pushState({}, '', '/');
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
    window.history.pushState({ path: newUrl }, '', newUrl);

    // Update link display
    if (meetingLinkDisplay) {
        meetingLinkDisplay.href = newUrl;
        meetingLinkDisplay.textContent = newUrl;
    }

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
            displayName,
            iceCandidateQueue: []
        });

        // Update chat dropdown
        updateChatParticipants();

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
            displayName,
            iceCandidateQueue: []
        });

        // Update chat dropdown
        updateChatParticipants();

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', {
            answer,
            to: from
        });

        // Process queued ICE candidates (since we just set remote description)
        const peer = peers.get(from);
        if (peer && peer.iceCandidateQueue && peer.iceCandidateQueue.length > 0) {
            console.log(`Processing ${peer.iceCandidateQueue.length} queued ICE candidates from ${from}`);
            for (const candidate of peer.iceCandidateQueue) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            peer.iceCandidateQueue = [];
        }
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

            // Process queued ICE candidates
            if (peer.iceCandidateQueue && peer.iceCandidateQueue.length > 0) {
                console.log(`Processing ${peer.iceCandidateQueue.length} queued ICE candidates from ${from}`);
                for (const candidate of peer.iceCandidateQueue) {
                    await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
                }
                peer.iceCandidateQueue = [];
            }
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
            if (peer.connection.remoteDescription) {
                await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                console.log(`Queueing ICE candidate from ${from} (remote description not set)`);
                peer.iceCandidateQueue.push(candidate);
            }
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

        // Update chat dropdown
        updateChatParticipants();
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
            // Toggle both original and processed tracks
            audioTrack.enabled = isMicEnabled;
            if (processedAudioTrack) {
                processedAudioTrack.enabled = isMicEnabled;
            }

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
        processedAudioTrack = null;
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
    const nameInput = document.getElementById('display-name-input');
    if (nameInput) nameInput.value = '';

    // Reset URL
    window.history.pushState({}, '', '/');

    // Reset controls
    isMicEnabled = true;
    isCameraEnabled = true;
    toggleMicBtn.classList.add('active');
    toggleMicBtn.classList.remove('inactive');
    toggleCameraBtn.classList.add('active');
    toggleCameraBtn.classList.remove('inactive');

    // Reset Chat
    isChatOpen = false;
    chatContainer.classList.add('hidden');
    unreadMessages = 0;
    chatBadge.classList.add('hidden');
    chatMessages.innerHTML = '';
    updateChatParticipants();
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
    const nameInput = document.getElementById('display-name-input');
    if (nameInput) nameInput.value = '';
});

joinSubmitBtn.addEventListener('click', joinMeetingFromLink);

copyLinkBtn.addEventListener('click', copyMeetingLink);
toggleMicBtn.addEventListener('click', toggleMicrophone);
toggleCameraBtn.addEventListener('click', toggleCamera);
endCallBtn.addEventListener('click', leaveMeeting);

// Chat listeners
toggleChatBtn.addEventListener('click', toggleChat);
closeChatBtn.addEventListener('click', toggleChat);
sendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

// ENHANCED: Handle page load with room parameter - Auto-join functionality
window.addEventListener('load', () => {
    // Extract room ID from path (e.g., /room-id)
    const path = window.location.pathname;
    const roomId = path.substring(1); // Remove leading '/'

    if (roomId && roomId !== '') {
        // Auto-join with prompt for name
        quickJoinFromUrl(roomId);
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (currentRoomId) {
        leaveMeeting();
    }
});