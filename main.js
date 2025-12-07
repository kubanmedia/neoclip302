/**
 * NeoClip Frontend - Main Application
 * Connects to Vercel API backend for video generation
 */

// Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://neoclip302.vercel.app';

// State
let currentUser = null;
let selectedTier = 'free';
let currentVideoUrl = null;
let generations = [];

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    const promptInput = document.getElementById('promptInput');
    promptInput.addEventListener('input', (e) => {
        const charCount = document.getElementById('charCount');
        charCount.textContent = e.target.value.length;
    });
}

// Initialize application
async function initializeApp() {
    try {
        // Get or create user
        const deviceId = getDeviceId();
        const response = await fetch(`${API_BASE_URL}/api/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });

        const data = await response.json();

        if (data.success && data.user) {
            currentUser = data.user;
            updateUserStats();
            await loadUserGenerations();
        } else {
            showError('Failed to initialize user. Please refresh the page.');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to connect to server. Please check your internet connection.');
    }
}

// Get or create device ID
function getDeviceId() {
    let deviceId = localStorage.getItem('neoclip_device_id');
    if (!deviceId) {
        deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        localStorage.setItem('neoclip_device_id', deviceId);
    }
    return deviceId;
}

// Update user stats display
function updateUserStats() {
    if (!currentUser) return;

    const freeRemaining = 10 - (currentUser.free_used || 0);
    const resetsAt = new Date(currentUser.resets_at);
    const now = new Date();
    const daysUntilReset = Math.ceil((resetsAt - now) / (1000 * 60 * 60 * 24));

    document.getElementById('freeRemaining').textContent = Math.max(0, freeRemaining);
    document.getElementById('daysUntilReset').textContent = Math.max(0, daysUntilReset);
}

// Select tier
function selectTier(tier) {
    selectedTier = tier;
    
    // Update button states
    document.querySelectorAll('.tier-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tier === tier) {
            btn.classList.add('active');
        }
    });

    // Update generate button text
    const buttonText = document.getElementById('buttonText');
    if (tier === 'free') {
        buttonText.textContent = 'Generate 10s FREE Video';
    } else {
        buttonText.textContent = 'Generate 30s HD Video (Pro)';
    }
}

// Generate video
async function generateVideo() {
    const prompt = document.getElementById('promptInput').value.trim();

    if (!prompt) {
        showError('Please enter a prompt to generate a video');
        return;
    }

    if (!currentUser) {
        showError('User not initialized. Please refresh the page.');
        return;
    }

    // UI updates
    const generateButton = document.getElementById('generateButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorContainer = document.getElementById('errorContainer');
    const videoContainer = document.getElementById('videoContainer');

    generateButton.disabled = true;
    loadingIndicator.classList.remove('hidden');
    errorContainer.classList.add('hidden');
    videoContainer.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                userId: currentUser.id,
                tier: selectedTier,
                length: selectedTier === 'free' ? 10 : 30
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 402) {
                // Free limit reached
                showError(data.message || 'Free limit reached. Upgrade to Pro for unlimited clips!');
                setTimeout(() => handleUpgrade(), 2000);
                return;
            }
            throw new Error(data.error || 'Generation failed');
        }

        if (data.success && data.videoUrl) {
            currentVideoUrl = data.videoUrl;
            displayVideo(data.videoUrl);

            // Update user stats
            if (data.remainingFree !== null) {
                currentUser.free_used = 10 - data.remainingFree;
                updateUserStats();
            }

            // Reload generations
            await loadUserGenerations();
        }
    } catch (error) {
        console.error('Generation error:', error);
        showError(error.message || 'Failed to generate video. Please try again.');
    } finally {
        generateButton.disabled = false;
        loadingIndicator.classList.add('hidden');
    }
}

// Display video
function displayVideo(videoUrl) {
    const videoContainer = document.getElementById('videoContainer');
    const videoPlayer = document.getElementById('videoPlayer');
    const adBanner = document.getElementById('adBanner');

    videoPlayer.src = videoUrl;
    videoContainer.classList.remove('hidden');

    // Show ad banner for free tier
    if (selectedTier === 'free') {
        adBanner.classList.remove('hidden');
    } else {
        adBanner.classList.add('hidden');
    }

    // Scroll to video
    videoContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Load user generations
async function loadUserGenerations() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/status?userId=${currentUser.id}`);
        const data = await response.json();

        if (data.success && data.generations) {
            generations = data.generations;
            displayGenerations();

            // Update user stats from server
            if (data.user) {
                currentUser.free_used = data.user.freeUsed;
                currentUser.resets_at = data.user.resetsAt;
                updateUserStats();
            }
        }
    } catch (error) {
        console.error('Failed to load generations:', error);
    }
}

// Display generations
function displayGenerations() {
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');

    if (generations.length === 0) {
        historyContainer.classList.add('hidden');
        return;
    }

    historyContainer.classList.remove('hidden');
    historyList.innerHTML = '';

    // Show only the 5 most recent completed generations
    const recentGenerations = generations
        .filter(gen => gen.videoUrl)
        .slice(0, 5);

    recentGenerations.forEach(gen => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-prompt">${escapeHtml(gen.prompt)}</div>
            <div class="history-tier">${gen.tier === 'free' ? '🎬 Free' : '⭐ Pro'}</div>
        `;
        item.addEventListener('click', () => {
            if (gen.videoUrl) {
                currentVideoUrl = gen.videoUrl;
                displayVideo(gen.videoUrl);
            }
        });
        historyList.appendChild(item);
    });
}

// Download video
function downloadVideo() {
    if (!currentVideoUrl) return;

    const a = document.createElement('a');
    a.href = currentVideoUrl;
    a.download = `neoclip-${Date.now()}.mp4`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Share video
async function shareVideo() {
    if (!currentVideoUrl) return;

    const shareData = {
        title: 'Check out my NeoClip video!',
        text: 'I created this video with NeoClip AI - generate yours for free!',
        url: currentVideoUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback: copy to clipboard
            await navigator.clipboard.writeText(currentVideoUrl);
            alert('Video URL copied to clipboard!');
        }
    } catch (error) {
        console.error('Share failed:', error);
    }
}

// Reset UI for new generation
function resetUI() {
    document.getElementById('promptInput').value = '';
    document.getElementById('charCount').textContent = '0';
    document.getElementById('videoContainer').classList.add('hidden');
    document.getElementById('errorContainer').classList.add('hidden');
    currentVideoUrl = null;
}

// Handle upgrade
function handleUpgrade() {
    alert(`🌟 Upgrade to Pro - Coming Soon!

Features:
• 120 HD clips per month
• 30-second max length
• 1080p quality
• No ads
• Priority processing

Only $4.99/month

Stay tuned for the launch!`);
}

// Show error
function showError(message) {
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');

    errorMessage.textContent = message;
    errorContainer.classList.remove('hidden');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorContainer.classList.add('hidden');
    }, 5000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions to global scope for inline onclick handlers
window.selectTier = selectTier;
window.generateVideo = generateVideo;
window.downloadVideo = downloadVideo;
window.shareVideo = shareVideo;
window.resetUI = resetUI;
window.handleUpgrade = handleUpgrade;
