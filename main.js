/**
 * NeoClip Frontend v3.3.0 - Main Application
 * With async polling pattern for video generation
 * 
 * Flow:
 * 1. POST /api/generate - Creates task, returns generationId
 * 2. Poll GET /api/poll?generationId=xxx every 3 seconds
 * 3. When completed, display video
 */

// Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : window.location.origin;

// Polling configuration
const POLL_INTERVAL_MS = 3000;  // Poll every 3 seconds
const MAX_POLL_TIME_MS = 300000; // Max 5 minutes

// State
let currentUser = null;
let selectedTier = 'free';
let currentVideoUrl = null;
let generations = [];
let pollTimer = null;
let pollStartTime = null;

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.addEventListener('input', (e) => {
            const charCount = document.getElementById('charCount');
            if (charCount) {
                charCount.textContent = e.target.value.length;
            }
        });
    }
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

    const freeRemainingEl = document.getElementById('freeRemaining');
    const daysUntilResetEl = document.getElementById('daysUntilReset');

    if (freeRemainingEl) freeRemainingEl.textContent = Math.max(0, freeRemaining);
    if (daysUntilResetEl) daysUntilResetEl.textContent = Math.max(0, daysUntilReset);
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
    if (buttonText) {
        if (tier === 'free') {
            buttonText.textContent = 'Generate 10s FREE Video';
        } else {
            buttonText.textContent = 'Generate 30s HD Video (Pro)';
        }
    }
}

// Generate video (async with polling)
async function generateVideo() {
    const promptInput = document.getElementById('promptInput');
    const prompt = promptInput ? promptInput.value.trim() : '';

    if (!prompt) {
        showError('Please enter a prompt to generate a video');
        return;
    }

    if (!currentUser) {
        showError('User not initialized. Please refresh the page.');
        return;
    }

    // Stop any existing polling
    stopPolling();

    // UI updates - show loading
    const generateButton = document.getElementById('generateButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const errorContainer = document.getElementById('errorContainer');
    const videoContainer = document.getElementById('videoContainer');

    if (generateButton) generateButton.disabled = true;
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    if (loadingText) loadingText.textContent = 'Starting video generation...';
    if (progressBar) progressBar.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '5%';
    if (errorContainer) errorContainer.classList.add('hidden');
    if (videoContainer) videoContainer.classList.add('hidden');

    try {
        // Step 1: Create generation task
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
                showError(data.message || 'Free limit reached. Upgrade to Pro for unlimited clips!');
                setTimeout(() => handleUpgrade(), 2000);
                return;
            }
            throw new Error(data.error || data.message || 'Failed to start generation');
        }

        if (!data.success || !data.generationId) {
            throw new Error(data.error || 'Invalid response from server');
        }

        console.log('Generation started:', data);
        
        // Update remaining free count immediately
        if (data.remainingFree !== null && data.remainingFree !== undefined) {
            currentUser.free_used = 10 - data.remainingFree;
            updateUserStats();
        }

        // Update loading text
        if (loadingText) loadingText.textContent = `Generating with ${data.providerName || 'AI'}...`;
        if (progressFill) progressFill.style.width = '15%';

        // Step 2: Start polling for completion
        pollStartTime = Date.now();
        startPolling(data.generationId, data.needsAd);

    } catch (error) {
        console.error('Generation error:', error);
        showError(error.message || 'Failed to start video generation. Please try again.');
        resetLoadingUI();
    }
}

// Start polling for generation status
function startPolling(generationId, needsAd) {
    console.log(`Starting poll for ${generationId}`);
    
    const poll = async () => {
        // Check timeout
        if (Date.now() - pollStartTime > MAX_POLL_TIME_MS) {
            stopPolling();
            showError('Generation timed out. Please try again.');
            resetLoadingUI();
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/poll?generationId=${generationId}`);
            const data = await response.json();

            console.log('Poll response:', data);

            // Update progress bar
            const progressFill = document.getElementById('progressFill');
            const loadingText = document.getElementById('loadingText');

            if (data.progress && progressFill) {
                progressFill.style.width = `${Math.min(data.progress, 95)}%`;
            }

            if (data.status === 'completed' && data.videoUrl) {
                // Success!
                stopPolling();
                
                if (progressFill) progressFill.style.width = '100%';
                if (loadingText) loadingText.textContent = 'Video ready!';

                currentVideoUrl = data.videoUrl;
                displayVideo(data.videoUrl, needsAd);
                
                // Reload generations list
                await loadUserGenerations();
                
                resetLoadingUI();
                return;
            }

            if (data.status === 'failed') {
                // Failed
                stopPolling();
                showError(data.error || 'Video generation failed. Please try again.');
                resetLoadingUI();
                
                // Refresh user stats (usage was rolled back)
                await loadUserGenerations();
                return;
            }

            // Still processing - update UI
            if (loadingText) {
                const elapsed = Math.round((Date.now() - pollStartTime) / 1000);
                if (data.status === 'queued') {
                    loadingText.textContent = `Queued for processing... (${elapsed}s)`;
                } else {
                    loadingText.textContent = `Generating video... ${data.progress || 30}% (${elapsed}s)`;
                }
            }

            // Schedule next poll
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);

        } catch (error) {
            console.error('Poll error:', error);
            // Don't stop on poll errors, retry
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
    };

    // Start first poll
    poll();
}

// Stop polling
function stopPolling() {
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
    pollStartTime = null;
}

// Reset loading UI
function resetLoadingUI() {
    const generateButton = document.getElementById('generateButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');

    if (generateButton) generateButton.disabled = false;
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (progressBar) progressBar.classList.add('hidden');
    if (progressFill) progressFill.style.width = '0%';
}

// Display video
function displayVideo(videoUrl, showAd = false) {
    const videoContainer = document.getElementById('videoContainer');
    const videoPlayer = document.getElementById('videoPlayer');
    const adBanner = document.getElementById('adBanner');

    if (videoPlayer) videoPlayer.src = videoUrl;
    if (videoContainer) videoContainer.classList.remove('hidden');

    // Show ad banner for free tier
    if (adBanner) {
        if (showAd || selectedTier === 'free') {
            adBanner.classList.remove('hidden');
        } else {
            adBanner.classList.add('hidden');
        }
    }

    // Scroll to video
    if (videoContainer) {
        videoContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

    if (!historyContainer || !historyList) return;

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
            <div class="history-meta">
                <span class="history-tier">${gen.tier === 'free' ? '🎬 Free' : '⭐ Pro'}</span>
                <span class="history-time">${formatTime(gen.createdAt)}</span>
            </div>
        `;
        item.addEventListener('click', () => {
            if (gen.videoUrl) {
                currentVideoUrl = gen.videoUrl;
                displayVideo(gen.videoUrl, gen.tier === 'free');
            }
        });
        historyList.appendChild(item);
    });
}

// Format time for display
function formatTime(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    } catch {
        return '';
    }
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
            showSuccess('Video URL copied to clipboard!');
        }
    } catch (error) {
        console.error('Share failed:', error);
    }
}

// Reset UI for new generation
function resetUI() {
    const promptInput = document.getElementById('promptInput');
    const charCount = document.getElementById('charCount');
    const videoContainer = document.getElementById('videoContainer');
    const errorContainer = document.getElementById('errorContainer');

    if (promptInput) promptInput.value = '';
    if (charCount) charCount.textContent = '0';
    if (videoContainer) videoContainer.classList.add('hidden');
    if (errorContainer) errorContainer.classList.add('hidden');
    currentVideoUrl = null;
    stopPolling();
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

    if (errorMessage) errorMessage.textContent = message;
    if (errorContainer) errorContainer.classList.remove('hidden');

    // Auto-hide after 8 seconds
    setTimeout(() => {
        if (errorContainer) errorContainer.classList.add('hidden');
    }, 8000);
}

// Show success message
function showSuccess(message) {
    // Simple alert for now - could be enhanced with toast notification
    alert(message);
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
