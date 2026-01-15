// =============================================
// Iron Man AR - Room Calibration System
// Scans room distances for accurate gameplay
// =============================================

const RoomCalibration = (function() {
    const STORAGE_KEY = 'iron_ar_room_data';
    const L = window.IronLogger || { log: () => {}, sensor: () => {}, perf: () => {} };
    
    // Calibration state
    let currentStep = 0;
    let roomData = {
        calibrated: false,
        timestamp: null,
        walls: {
            front: null,  // Step 0
            right: null,  // Step 1
            back: null,   // Step 2
            left: null    // Step 3
        },
        avgDistance: 0,
        roomSize: 'unknown'
    };
    
    const directions = [
        { name: 'front', label: 'קדימה', arrow: '↑', instruction: 'כוון את הכוונת אל הקיר שמולך' },
        { name: 'right', label: 'ימינה', arrow: '→', instruction: 'הסתובב 90° ימינה וכוון לקיר' },
        { name: 'back', label: 'אחורה', arrow: '↓', instruction: 'הסתובב 90° ימינה וכוון לקיר שמאחור' },
        { name: 'left', label: 'שמאלה', arrow: '←', instruction: 'הסתובב 90° ימינה וכוון לקיר השמאלי' }
    ];
    
    // DOM Elements
    let videoEl, distanceInput, modal, progressFill, progressText;
    let instructionText, dirLabel, dirArrow, markBtn;
    
    // AI Model for distance estimation
    let aiModel = null;
    let estimatedDistance = null;
    
    // Initialize
    function init() {
        L.log('CALIBRATION', 'INIT', { timestamp: new Date().toISOString() });
        
        // Get DOM elements
        videoEl = document.getElementById('camera-feed');
        distanceInput = document.getElementById('distance-input');
        modal = document.getElementById('distance-modal');
        progressFill = document.getElementById('progress-fill');
        progressText = document.getElementById('progress-text');
        instructionText = document.getElementById('instruction-text');
        dirLabel = document.getElementById('dir-label');
        dirArrow = document.getElementById('dir-arrow');
        markBtn = document.getElementById('mark-btn');
        
        // Load existing calibration
        loadCalibration();
        
        // Start camera
        startCamera();
        
        // Load AI model for distance estimation
        loadAIModel();
        
        // Update UI
        updateUI();
        
        return RoomCalibration;
    }
    
    // Start camera
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            videoEl.srcObject = stream;
            L.log('CALIBRATION', 'CAMERA_STARTED', { success: true });
        } catch(e) {
            L.log('CALIBRATION', 'CAMERA_ERROR', { error: e.message });
            alert('לא ניתן להפעיל מצלמה. נא לאשר גישה למצלמה.');
        }
    }
    
    // Load AI model
    async function loadAIModel() {
        if(typeof cocoSsd !== 'undefined') {
            try {
                aiModel = await cocoSsd.load();
                L.log('CALIBRATION', 'AI_LOADED', { success: true });
                startDistanceEstimation();
            } catch(e) {
                L.log('CALIBRATION', 'AI_ERROR', { error: e.message });
            }
        }
    }
    
    // Continuous distance estimation using AI
    function startDistanceEstimation() {
        if(!aiModel || !videoEl) return;
        
        function estimate() {
            if(videoEl.readyState === 4) {
                aiModel.detect(videoEl).then(predictions => {
                    // Look for reference objects with known sizes
                    const knownSizes = {
                        'person': 1.7,      // Average human height
                        'door': 2.0,        // Standard door
                        'chair': 0.9,       // Chair height
                        'tv': 0.6,          // TV height
                        'laptop': 0.3,      // Laptop
                        'bottle': 0.25,     // Bottle
                        'cell phone': 0.15  // Phone
                    };
                    
                    for(let pred of predictions) {
                        if(knownSizes[pred.class] && pred.score > 0.5) {
                            // Calculate distance based on apparent size
                            const realHeight = knownSizes[pred.class];
                            const apparentHeight = pred.bbox[3] / videoEl.videoHeight;
                            
                            // Simple pinhole camera formula
                            // distance ≈ (realSize * focalLength) / apparentSize
                            // Using approximation where focalLength relates to FOV
                            const fov = 60; // Approximate FOV in degrees
                            const distance = (realHeight / 2) / Math.tan((apparentHeight * fov / 2) * Math.PI / 180);
                            
                            estimatedDistance = Math.max(0.5, Math.min(15, distance));
                            updateLiveDistance();
                            break;
                        }
                    }
                }).catch(() => {});
            }
            
            if(currentStep < 4) {
                setTimeout(estimate, 500);
            }
        }
        
        estimate();
    }
    
    // Update live distance display
    function updateLiveDistance() {
        const display = document.getElementById('live-distance');
        if(display && estimatedDistance) {
            display.textContent = estimatedDistance.toFixed(1);
            display.style.color = '#00ffff';
        }
    }
    
    // Update UI based on current step
    function updateUI() {
        if(currentStep >= 4) {
            showCompletion();
            return;
        }
        
        const dir = directions[currentStep];
        
        // Update direction
        if(dirLabel) dirLabel.textContent = dir.label;
        if(dirArrow) dirArrow.textContent = dir.arrow;
        if(instructionText) {
            instructionText.innerHTML = `${dir.instruction}<br>ולחץ על <b>סמן מרחק</b>`;
        }
        
        // Update step dots
        for(let i = 0; i < 4; i++) {
            const dot = document.getElementById(`step-${i}`);
            if(dot) {
                dot.classList.remove('active', 'done');
                if(i < currentStep) dot.classList.add('done');
                else if(i === currentStep) dot.classList.add('active');
            }
        }
        
        // Update progress
        const progress = (currentStep / 4) * 100;
        if(progressFill) progressFill.style.width = progress + '%';
        if(progressText) progressText.textContent = `${currentStep} מתוך 4 כיוונים נסרקו`;
    }
    
    // Mark distance button clicked
    window.markDistance = function() {
        L.log('CALIBRATION', 'MARK_CLICKED', { step: currentStep, direction: directions[currentStep].name });
        
        // Pre-fill with estimated distance if available
        if(distanceInput && estimatedDistance) {
            distanceInput.value = estimatedDistance.toFixed(1);
        }
        
        // Show modal
        if(modal) modal.classList.add('show');
    };
    
    // Set distance from preset
    window.setDistance = function(value) {
        if(distanceInput) distanceInput.value = value;
    };
    
    // Close modal
    window.closeModal = function() {
        if(modal) modal.classList.remove('show');
    };
    
    // Confirm distance
    window.confirmDistance = function() {
        const value = parseFloat(distanceInput?.value);
        
        if(isNaN(value) || value < 0.5 || value > 20) {
            alert('נא להזין מרחק תקין (0.5-20 מטר)');
            return;
        }
        
        const dir = directions[currentStep];
        roomData.walls[dir.name] = value;
        
        L.log('CALIBRATION', 'DISTANCE_SET', { 
            step: currentStep, 
            direction: dir.name, 
            distance: value 
        });
        
        // Vibrate feedback
        if(navigator.vibrate) navigator.vibrate(50);
        
        // Close modal
        closeModal();
        
        // Next step
        currentStep++;
        updateUI();
    };
    
    // Skip step
    window.skipStep = function() {
        L.log('CALIBRATION', 'STEP_SKIPPED', { step: currentStep });
        
        const dir = directions[currentStep];
        roomData.walls[dir.name] = null; // Mark as skipped
        
        currentStep++;
        updateUI();
    };
    
    // Show completion screen
    function showCompletion() {
        // Calculate stats
        const distances = Object.values(roomData.walls).filter(d => d !== null);
        roomData.avgDistance = distances.length > 0 
            ? distances.reduce((a, b) => a + b, 0) / distances.length 
            : 0;
        
        // Determine room size
        if(roomData.avgDistance < 2) roomData.roomSize = 'קטן';
        else if(roomData.avgDistance < 4) roomData.roomSize = 'בינוני';
        else roomData.roomSize = 'גדול';
        
        roomData.calibrated = true;
        roomData.timestamp = new Date().toISOString();
        
        // Save calibration
        saveCalibration();
        
        L.log('CALIBRATION', 'COMPLETED', roomData);
        
        // Show stats
        const statsEl = document.getElementById('completion-stats');
        if(statsEl) {
            statsEl.innerHTML = `
                <div class="stat-row">
                    <span class="stat-label">קדימה</span>
                    <span class="stat-value">${roomData.walls.front ? roomData.walls.front + 'm' : 'לא נסרק'}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">ימינה</span>
                    <span class="stat-value">${roomData.walls.right ? roomData.walls.right + 'm' : 'לא נסרק'}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">אחורה</span>
                    <span class="stat-value">${roomData.walls.back ? roomData.walls.back + 'm' : 'לא נסרק'}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">שמאלה</span>
                    <span class="stat-value">${roomData.walls.left ? roomData.walls.left + 'm' : 'לא נסרק'}</span>
                </div>
                <div class="stat-row" style="border-top: 2px solid #00ffff; margin-top: 10px; padding-top: 10px;">
                    <span class="stat-label">גודל חדר</span>
                    <span class="stat-value">${roomData.roomSize}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">מרחק ממוצע</span>
                    <span class="stat-value">${roomData.avgDistance.toFixed(1)}m</span>
                </div>
            `;
        }
        
        // Show completion screen
        const screen = document.getElementById('completion-screen');
        if(screen) screen.classList.add('show');
    }
    
    // Save calibration to localStorage
    function saveCalibration() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(roomData));
            L.log('CALIBRATION', 'SAVED', { success: true });
        } catch(e) {
            L.log('CALIBRATION', 'SAVE_ERROR', { error: e.message });
        }
    }
    
    // Load calibration from localStorage
    function loadCalibration() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if(stored) {
                const data = JSON.parse(stored);
                if(data.calibrated) {
                    roomData = data;
                    L.log('CALIBRATION', 'LOADED', data);
                }
            }
        } catch(e) {
            L.log('CALIBRATION', 'LOAD_ERROR', { error: e.message });
        }
    }
    
    // Reset calibration
    window.resetCalibration = function() {
        currentStep = 0;
        roomData = {
            calibrated: false,
            timestamp: null,
            walls: { front: null, right: null, back: null, left: null },
            avgDistance: 0,
            roomSize: 'unknown'
        };
        
        localStorage.removeItem(STORAGE_KEY);
        L.log('CALIBRATION', 'RESET', {});
        
        // Hide completion screen
        const screen = document.getElementById('completion-screen');
        if(screen) screen.classList.remove('show');
        
        updateUI();
    };
    
    // Start game
    window.startGame = function() {
        window.location.href = 'game.html';
    };
    
    // Go back
    window.goBack = function() {
        window.location.href = 'index.html';
    };
    
    // Public API
    return {
        init: init,
        getData: () => roomData,
        isCalibrated: () => roomData.calibrated,
        getAvgDistance: () => roomData.avgDistance,
        getWallDistance: (dir) => roomData.walls[dir],
        getRoomSize: () => roomData.roomSize
    };
})();

// Static method to get room data from other pages
RoomCalibration.loadStatic = function() {
    const STORAGE_KEY = 'iron_ar_room_data';
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if(stored) {
            return JSON.parse(stored);
        }
    } catch(e) {}
    return null;
};

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
    RoomCalibration.init();
});
