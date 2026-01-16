// =====================================================
// 🚗 DRIVE ASSIST HUD - Smart Driving Assistant
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Elements ---
    const bootScreen = document.getElementById('boot-screen');
    const bootStatus = document.getElementById('boot-status');
    const bootFill = document.getElementById('boot-fill');
    const hud = document.getElementById('hud');
    
    const speedValue = document.getElementById('current-speed');
    const speedLimit = document.getElementById('speed-limit');
    const currentTime = document.getElementById('current-time');
    const driveDuration = document.getElementById('drive-duration');
    
    const alertsList = document.getElementById('alerts-list');
    const detectionsList = document.getElementById('detections-list');
    
    const cameraFeed = document.getElementById('camera-feed');
    const detectionCanvas = document.getElementById('detection-canvas');
    const ctx = detectionCanvas.getContext('2d');
    
    const distFill = document.getElementById('dist-fill');
    const frontDistance = document.getElementById('front-distance');
    const laneLeft = document.getElementById('lane-left');
    const laneRight = document.getElementById('lane-right');
    
    const lightsStatus = document.getElementById('lights-status');
    const lightsIcon = document.getElementById('lights-icon');
    const ambientLight = document.getElementById('ambient-light');
    const altitudeEl = document.getElementById('altitude');
    const headingEl = document.getElementById('heading');
    const batteryEl = document.getElementById('battery');
    
    const warningOverlay = document.getElementById('warning-overlay');
    const warningIcon = document.getElementById('warning-icon');
    const warningText = document.getElementById('warning-text');
    const nightIndicator = document.getElementById('night-indicator');
    
    // --- State ---
    let model = null;
    let driveStartTime = Date.now();
    let currentSpeed = 0;
    let currentSpeedLimit = 50;
    let isNightMode = false;
    let lightLevel = 500;
    let detectedObjects = new Map();
    let alerts = [];
    
    // Road-related objects to detect
    const ROAD_OBJECTS = {
        'person': { icon: '🚶', name: 'הולך רגל', priority: 'danger', minDist: 30 },
        'bicycle': { icon: '🚴', name: 'אופניים', priority: 'warning', minDist: 20 },
        'car': { icon: '🚗', name: 'רכב', priority: 'info', minDist: 15 },
        'motorcycle': { icon: '🏍️', name: 'אופנוע', priority: 'warning', minDist: 20 },
        'bus': { icon: '🚌', name: 'אוטובוס', priority: 'info', minDist: 25 },
        'truck': { icon: '🚛', name: 'משאית', priority: 'warning', minDist: 25 },
        'traffic light': { icon: '🚦', name: 'רמזור', priority: 'info', minDist: 50 },
        'stop sign': { icon: '🚸', name: 'תמרור', priority: 'info', minDist: 30, checkSpeed: true },
        'dog': { icon: '🐕', name: 'כלב בכביש', priority: 'danger', minDist: 40 },
        'cat': { icon: '🐈', name: 'חתול בכביש', priority: 'warning', minDist: 30 },
    };
    
    // --- Boot Sequence ---
    async function bootSequence() {
        const steps = [
            { msg: 'טוען מצלמה...', progress: 20 },
            { msg: 'מאתחל AI...', progress: 50 },
            { msg: 'מחבר חיישנים...', progress: 70 },
            { msg: 'בודק GPS...', progress: 85 },
            { msg: 'מערכת מוכנה!', progress: 100 }
        ];
        
        for (let step of steps) {
            bootStatus.textContent = step.msg;
            bootFill.style.width = step.progress + '%';
            await sleep(500);
        }
        
        await sleep(300);
        bootScreen.style.opacity = '0';
        setTimeout(() => {
            bootScreen.style.display = 'none';
            hud.style.display = 'grid';
            startSystems();
        }, 500);
    }
    
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    // --- Start All Systems ---
    async function startSystems() {
        initCamera();
        initSensors();
        initClock();
        loadAI();
        initLightSensor();
        initBattery();
    }
    
    // --- Camera ---
    async function initCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            cameraFeed.srcObject = stream;
            cameraFeed.onloadedmetadata = () => {
                detectionCanvas.width = cameraFeed.videoWidth;
                detectionCanvas.height = cameraFeed.videoHeight;
            };
            addAlert('מצלמה פעילה', 'success');
        } catch (err) {
            addAlert('שגיאת מצלמה: ' + err.message, 'danger');
        }
    }
    
    // --- AI Detection ---
    async function loadAI() {
        try {
            model = await cocoSsd.load();
            addAlert('AI מוכן לזיהוי', 'success');
            detectLoop();
        } catch (err) {
            addAlert('שגיאת AI: ' + err.message, 'danger');
        }
    }
    
    async function detectLoop() {
        if (!model || cameraFeed.readyState < 2) {
            requestAnimationFrame(detectLoop);
            return;
        }
        
        try {
            const predictions = await model.detect(cameraFeed);
            processDetections(predictions);
            drawDetections(predictions);
        } catch (e) {}
        
        requestAnimationFrame(detectLoop);
    }
    
    function processDetections(predictions) {
        const now = Date.now();
        const newDetections = new Map();
        
        // Clear old detections list
        detectionsList.innerHTML = '';
        
        let closestFrontDist = 999;
        let hasPedestrian = false;
        
        for (let pred of predictions) {
            const objType = pred.class.toLowerCase();
            const roadObj = ROAD_OBJECTS[objType];
            
            if (roadObj) {
                // Calculate distance based on bounding box size
                const boxHeight = pred.bbox[3];
                const screenHeight = detectionCanvas.height;
                const distEstimate = Math.round((screenHeight / boxHeight) * 2);
                
                // Check if object is in front (center of screen)
                const boxCenterX = pred.bbox[0] + pred.bbox[2] / 2;
                const screenCenterX = detectionCanvas.width / 2;
                const isInFront = Math.abs(boxCenterX - screenCenterX) < detectionCanvas.width * 0.3;
                
                if (isInFront && distEstimate < closestFrontDist) {
                    closestFrontDist = distEstimate;
                }
                
                // If this looks like a sign, try to read the speed number
                if (roadObj.checkSpeed) {
                    readSpeedFromSign(pred.bbox);
                }
                
                // Add to detections list
                const detItem = document.createElement('div');
                detItem.className = 'detection-item';
                detItem.innerHTML = `
                    <span class="det-icon">${roadObj.icon}</span>
                    <span>${roadObj.name}</span>
                    <span class="det-dist">${distEstimate}m</span>
                `;
                detectionsList.appendChild(detItem);
                
                // Check for alerts
                if (distEstimate < roadObj.minDist) {
                    if (objType === 'person') {
                        hasPedestrian = true;
                        showWarning('🚶', 'הולך רגל בכביש!');
                    } else if (roadObj.priority === 'danger') {
                        showWarning(roadObj.icon, roadObj.name + ' קרוב מדי!');
                    } else if (roadObj.priority === 'warning') {
                        addAlert(roadObj.name + ' במרחק ' + distEstimate + 'm', 'warning');
                    }
                }
                
                newDetections.set(objType + '_' + Math.round(pred.bbox[0]), {
                    ...pred,
                    roadObj,
                    distance: distEstimate
                });
            }
        }
        
        // Update front distance
        if (closestFrontDist < 999) {
            frontDistance.textContent = closestFrontDist;
            updateDistanceIndicator(closestFrontDist);
        } else {
            frontDistance.textContent = '--';
            distFill.style.width = '100%';
            distFill.style.background = 'linear-gradient(90deg, #00ff88, #00ff88)';
        }
        
        // Hide warning if no immediate danger
        if (!hasPedestrian && warningOverlay.style.display !== 'none') {
            setTimeout(() => {
                if (!hasPedestrian) warningOverlay.style.display = 'none';
            }, 1500);
        }
        
        detectedObjects = newDetections;
        
        if (detectionsList.children.length === 0) {
            detectionsList.innerHTML = '<div class="detection-item">אין זיהויים</div>';
        }
    }
    
    function updateDistanceIndicator(dist) {
        // 0-10m = red, 10-20m = yellow, 20+ = green
        let percent = Math.min(100, (dist / 30) * 100);
        let color;
        
        if (dist < 10) {
            color = '#ff3333';
            percent = 20;
        } else if (dist < 20) {
            color = '#ffc800';
            percent = 50;
        } else {
            color = '#00ff88';
        }
        
        distFill.style.width = percent + '%';
        distFill.style.background = color;
    }
    
    function drawDetections(predictions) {
        ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
        
        for (let pred of predictions) {
            const [x, y, w, h] = pred.bbox;
            const objType = pred.class.toLowerCase();
            const roadObj = ROAD_OBJECTS[objType];
            
            if (!roadObj) continue;
            
            // Color based on priority
            let color = '#00d4ff';
            if (roadObj.priority === 'danger') color = '#ff3333';
            else if (roadObj.priority === 'warning') color = '#ffc800';
            
            // Draw box
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
            
            // Draw corners
            const cornerLen = Math.min(w, h) * 0.2;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
            ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
            ctx.moveTo(x + w, y + h - cornerLen); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cornerLen, y + h);
            ctx.moveTo(x + cornerLen, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cornerLen);
            ctx.stroke();
            
            // Draw label
            ctx.fillStyle = color;
            ctx.font = 'bold 16px Arial';
            const dist = Math.round((detectionCanvas.height / h) * 2);
            ctx.fillText(`${roadObj.icon} ${roadObj.name} - ${dist}m`, x, y - 10);
        }
    }
    
    // --- Alerts System ---
    function addAlert(message, type = 'info') {
        // Avoid duplicate alerts
        const existing = alertsList.querySelector(`.alert-item.${type}`);
        if (existing && existing.textContent === message) return;
        
        const alertEl = document.createElement('div');
        alertEl.className = `alert-item ${type}`;
        alertEl.textContent = message;
        
        // Keep max 5 alerts
        if (alertsList.children.length >= 5) {
            alertsList.removeChild(alertsList.firstChild);
        }
        
        alertsList.appendChild(alertEl);
        
        // Auto-remove info/success after 5 seconds
        if (type === 'info' || type === 'success') {
            setTimeout(() => alertEl.remove(), 5000);
        }
        
        // Vibrate for warnings/dangers
        if (type === 'warning' && navigator.vibrate) {
            navigator.vibrate(100);
        } else if (type === 'danger' && navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 200]);
        }
    }
    
    function showWarning(icon, text) {
        warningIcon.textContent = icon;
        warningText.textContent = text;
        warningOverlay.style.display = 'flex';
        
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
        }
        
        // Play warning sound
        playWarningSound();
    }
    
    function playWarningSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.3;
            osc.start();
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.2);
            osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) {}
    }
    
    // --- Sensors ---
    function initSensors() {
        // Compass
        window.addEventListener('deviceorientation', (e) => {
            if (e.alpha !== null) {
                const heading = Math.round(e.alpha);
                headingEl.textContent = heading + '°';
            }
        });
        
        // GPS for speed and altitude
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition((pos) => {
                // Altitude
                if (pos.coords.altitude !== null) {
                    altitudeEl.textContent = Math.round(pos.coords.altitude) + 'm';
                }
                
                // Speed
                if (pos.coords.speed !== null) {
                    currentSpeed = Math.round(pos.coords.speed * 3.6); // m/s to km/h
                    speedValue.textContent = currentSpeed;
                    
                    // Speed warning
                    if (currentSpeed > currentSpeedLimit) {
                        speedValue.style.color = '#ff3333';
                        addAlert(`חריגת מהירות! ${currentSpeed}/${currentSpeedLimit}`, 'danger');
                    } else if (currentSpeed > currentSpeedLimit - 10) {
                        speedValue.style.color = '#ffc800';
                    } else {
                        speedValue.style.color = '#00ff88';
                    }
                }
            }, (err) => {
                console.warn('GPS Error:', err);
            }, { enableHighAccuracy: true, maximumAge: 1000 });
        }
    }
    
    // --- Light Sensor (Auto Lights) ---
    function initLightSensor() {
        if ('AmbientLightSensor' in window) {
            try {
                const sensor = new AmbientLightSensor();
                sensor.addEventListener('reading', () => {
                    lightLevel = sensor.illuminance;
                    ambientLight.textContent = Math.round(lightLevel) + ' lux';
                    checkLightConditions();
                });
                sensor.start();
            } catch (e) {
                // Fallback: use camera brightness estimation
                estimateLightFromCamera();
            }
        } else {
            estimateLightFromCamera();
        }
    }
    
    function estimateLightFromCamera() {
        setInterval(() => {
            if (cameraFeed.readyState < 2) return;
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 50;
            tempCanvas.height = 50;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(cameraFeed, 0, 0, 50, 50);
            
            const imageData = tempCtx.getImageData(0, 0, 50, 50);
            let totalBrightness = 0;
            
            for (let i = 0; i < imageData.data.length; i += 4) {
                totalBrightness += (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
            }
            
            const avgBrightness = totalBrightness / (50 * 50);
            lightLevel = avgBrightness * 4; // Approximate lux
            ambientLight.textContent = Math.round(lightLevel) + ' lux';
            checkLightConditions();
        }, 2000);
    }
    
    function checkLightConditions() {
        if (lightLevel < 50 && !isNightMode) {
            // Activate night mode
            isNightMode = true;
            document.body.classList.add('night-mode');
            nightIndicator.style.display = 'block';
            lightsStatus.textContent = 'ON';
            lightsIcon.textContent = '💡';
            lightsIcon.style.filter = 'drop-shadow(0 0 10px #ffff00)';
            addAlert('מצב לילה - אורות דולקים', 'info');
        } else if (lightLevel >= 100 && isNightMode) {
            // Deactivate night mode
            isNightMode = false;
            document.body.classList.remove('night-mode');
            nightIndicator.style.display = 'none';
            lightsStatus.textContent = 'AUTO';
            lightsIcon.style.filter = 'none';
            addAlert('מצב יום - אורות כבויים', 'info');
        }
    }
    
    // --- Battery ---
    function initBattery() {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                function updateBattery() {
                    const level = Math.round(battery.level * 100);
                    batteryEl.textContent = level + '%';
                    
                    if (level < 20) {
                        batteryEl.style.color = '#ff3333';
                        addAlert('סוללה חלשה!', 'warning');
                    } else if (level < 50) {
                        batteryEl.style.color = '#ffc800';
                    } else {
                        batteryEl.style.color = '#00ff88';
                    }
                }
                
                updateBattery();
                battery.addEventListener('levelchange', updateBattery);
            });
        } else {
            batteryEl.textContent = '100%';
        }
    }
    
    // --- Clock & Duration ---
    function initClock() {
        function updateClock() {
            const now = new Date();
            currentTime.textContent = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            
            // Drive duration
            const elapsed = Math.floor((Date.now() - driveStartTime) / 1000);
            const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
            const mins = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            driveDuration.textContent = `${hours}:${mins}:${secs}`;
            
            // Fatigue warning after 2 hours
            if (elapsed > 7200 && elapsed % 1800 === 0) {
                addAlert('המלצה להפסקה - נהיגה ממושכת', 'warning');
            }
        }
        
        updateClock();
        setInterval(updateClock, 1000);
    }
    
    // --- Speed Limit Sign Detection with OCR ---
    let ocrWorker = null;
    let lastOcrTime = 0;
    const OCR_INTERVAL = 2000; // Check every 2 seconds
    let isOcrBusy = false;
    
    async function initOCR() {
        try {
            ocrWorker = await Tesseract.createWorker('eng', 1, {
                logger: m => console.log('OCR:', m.status, m.progress)
            });
            // Set to recognize only digits
            await ocrWorker.setParameters({
                tessedit_char_whitelist: '0123456789',
            });
            addAlert('OCR מוכן לזיהוי מספרים', 'success');
            console.log('OCR Worker ready');
        } catch (e) {
            console.warn('OCR init failed:', e);
            addAlert('שגיאת OCR', 'danger');
        }
    }
    
    // Called when COCO-SSD detects a sign - read speed from it
    async function readSpeedFromSign(bbox) {
        if (!ocrWorker) {
            console.log('OCR not ready for sign reading');
            return;
        }
        if (isOcrBusy) return;
        if (Date.now() - lastOcrTime < 1000) return; // 1 second cooldown
        
        lastOcrTime = Date.now();
        isOcrBusy = true;
        
        try {
            const [x, y, w, h] = bbox;
            console.log('📷 Reading sign at:', x, y, w, h);
            
            // Create larger canvas for better OCR (scale up)
            const scale = 2;
            const signCanvas = document.createElement('canvas');
            signCanvas.width = w * scale;
            signCanvas.height = h * scale;
            const signCtx = signCanvas.getContext('2d');
            
            // White background
            signCtx.fillStyle = '#ffffff';
            signCtx.fillRect(0, 0, signCanvas.width, signCanvas.height);
            
            // Draw sign scaled up
            signCtx.drawImage(cameraFeed, x, y, w, h, 0, 0, w * scale, h * scale);
            
            // Convert to high contrast for number reading
            const imageData = signCtx.getImageData(0, 0, signCanvas.width, signCanvas.height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const gray = (r + g + b) / 3;
                // Make dark pixels black, light pixels white
                const val = gray < 120 ? 0 : 255;
                data[i] = data[i+1] = data[i+2] = val;
            }
            signCtx.putImageData(imageData, 0, 0);
            
            // Run OCR
            const result = await ocrWorker.recognize(signCanvas);
            let text = result.data.text.replace(/[^0-9]/g, '');
            
            console.log('🔢 OCR result:', result.data.text, '-> digits:', text);
            addAlert(`זוהה: "${text}"`, 'info');
            
            // Look for valid speed numbers
            const validSpeeds = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
            for (const speed of validSpeeds) {
                if (text.includes(speed.toString())) {
                    if (speed !== currentSpeedLimit) {
                        currentSpeedLimit = speed;
                        speedLimit.textContent = currentSpeedLimit;
                        addAlert(`🚸 מהירות: ${currentSpeedLimit} קמ"ש`, 'warning');
                        
                        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                        
                        // Green highlight
                        ctx.strokeStyle = '#00ff00';
                        ctx.lineWidth = 5;
                        ctx.strokeRect(x, y, w, h);
                        ctx.fillStyle = '#00ff00';
                        ctx.font = 'bold 28px Arial';
                        ctx.fillText(`${speed}`, x + w/2 - 20, y - 10);
                    }
                    break;
                }
            }
        } catch (e) {
            console.warn('Sign OCR error:', e);
            addAlert('שגיאת קריאה', 'danger');
        }
        
        isOcrBusy = false;
    }
    
    async function detectSpeedSigns() {
        if (!ocrWorker || !cameraFeed || cameraFeed.readyState < 2) return;
        if (Date.now() - lastOcrTime < OCR_INTERVAL) return;
        
        lastOcrTime = Date.now();
        
        try {
            // Create a canvas to capture frame
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cameraFeed.videoWidth;
            tempCanvas.height = cameraFeed.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(cameraFeed, 0, 0);
            
            // Look for red circular areas (speed limit signs)
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const redRegions = findRedCircularRegions(imageData, tempCanvas.width, tempCanvas.height);
            
            for (let region of redRegions) {
                // Extract region and run OCR
                const regionCanvas = document.createElement('canvas');
                regionCanvas.width = region.w;
                regionCanvas.height = region.h;
                const regionCtx = regionCanvas.getContext('2d');
                regionCtx.drawImage(tempCanvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
                
                // Enhance for OCR (invert, increase contrast)
                enhanceForOCR(regionCtx, region.w, region.h);
                
                const result = await ocrWorker.recognize(regionCanvas);
                const text = result.data.text.trim();
                
                // Look for speed numbers (30, 50, 60, 70, 80, 90, 100, 110, 120)
                const speedMatch = text.match(/\b(30|40|50|60|70|80|90|100|110|120)\b/);
                if (speedMatch) {
                    const detectedSpeed = parseInt(speedMatch[1]);
                    if (detectedSpeed !== currentSpeedLimit) {
                        currentSpeedLimit = detectedSpeed;
                        speedLimit.textContent = currentSpeedLimit;
                        addAlert(`🚸 תמרור זוהה: ${currentSpeedLimit} קמ"ש`, 'warning');
                        
                        // Vibrate to notify
                        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                        
                        // Draw highlight on detected sign
                        highlightSpeedSign(region);
                    }
                }
            }
        } catch (e) {
            console.warn('OCR error:', e);
        }
    }
    
    function findRedCircularRegions(imageData, width, height) {
        const regions = [];
        const data = imageData.data;
        const gridSize = 50;
        
        // Scan in grid for red areas
        for (let y = 0; y < height - gridSize; y += gridSize / 2) {
            for (let x = 0; x < width - gridSize; x += gridSize / 2) {
                let redCount = 0;
                let whiteCount = 0;
                
                // Sample pixels in this region
                for (let dy = 0; dy < gridSize; dy += 5) {
                    for (let dx = 0; dx < gridSize; dx += 5) {
                        const i = ((y + dy) * width + (x + dx)) * 4;
                        const r = data[i], g = data[i + 1], b = data[i + 2];
                        
                        // Check for red (speed limit sign border)
                        if (r > 150 && g < 80 && b < 80) redCount++;
                        // Check for white (sign center)
                        if (r > 200 && g > 200 && b > 200) whiteCount++;
                    }
                }
                
                // If significant red border and white center - likely speed sign
                if (redCount > 5 && whiteCount > 10) {
                    // Expand region to capture full sign
                    const signSize = gridSize * 2;
                    regions.push({
                        x: Math.max(0, x - gridSize / 2),
                        y: Math.max(0, y - gridSize / 2),
                        w: Math.min(signSize, width - x),
                        h: Math.min(signSize, height - y)
                    });
                }
            }
        }
        
        // Remove overlapping regions
        return mergeOverlappingRegions(regions);
    }
    
    function mergeOverlappingRegions(regions) {
        if (regions.length <= 1) return regions;
        
        const merged = [];
        const used = new Set();
        
        for (let i = 0; i < regions.length; i++) {
            if (used.has(i)) continue;
            
            let r = { ...regions[i] };
            
            for (let j = i + 1; j < regions.length; j++) {
                if (used.has(j)) continue;
                
                const r2 = regions[j];
                // Check overlap
                if (Math.abs(r.x - r2.x) < r.w && Math.abs(r.y - r2.y) < r.h) {
                    used.add(j);
                }
            }
            
            merged.push(r);
        }
        
        return merged.slice(0, 3); // Max 3 regions to check
    }
    
    function enhanceForOCR(ctx, w, h) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            // Increase contrast and threshold
            const val = gray > 128 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = val;
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    function highlightSpeedSign(region) {
        // Draw on detection canvas
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(region.x + region.w / 2, region.y + region.h / 2, region.w / 2, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('🚸 ' + currentSpeedLimit, region.x, region.y - 10);
    }
    
    // --- Speed Limit Sign Detection ---
    // Uses Hough Circle detection approach + OCR for numbers
    async function scanForSpeedSigns() {
        if (!ocrWorker) {
            console.log('OCR not ready yet');
            return;
        }
        if (!cameraFeed || cameraFeed.readyState < 2) return;
        if (isOcrBusy) return;
        
        isOcrBusy = true;
        console.log('🔍 Scanning for speed signs...');
        
        try {
            const vw = cameraFeed.videoWidth || 640;
            const vh = cameraFeed.videoHeight || 480;
            
            // Create canvas for frame capture
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = vw;
            frameCanvas.height = vh;
            const frameCtx = frameCanvas.getContext('2d');
            frameCtx.drawImage(cameraFeed, 0, 0, vw, vh);
            
            // Find red circular signs
            const signs = findRedCircleSigns(frameCtx, vw, vh);
            console.log('Found signs:', signs.length);
            
            if (signs.length > 0) {
                addAlert(`נמצאו ${signs.length} תמרורים`, 'info');
            }
            
            for (const sign of signs) {
                // Extract just the inner white area (where numbers are)
                const padding = sign.radius * 0.2;
                const innerSize = sign.radius * 1.4;
                const sx = Math.max(0, sign.cx - innerSize/2);
                const sy = Math.max(0, sign.cy - innerSize/2);
                
                const ocrCanvas = document.createElement('canvas');
                ocrCanvas.width = 150;
                ocrCanvas.height = 150;
                const ocrCtx = ocrCanvas.getContext('2d');
                
                // Draw and scale up for better OCR
                ocrCtx.fillStyle = '#ffffff';
                ocrCtx.fillRect(0, 0, 150, 150);
                ocrCtx.drawImage(frameCanvas, sx, sy, innerSize, innerSize, 10, 10, 130, 130);
                
                // Convert to high contrast black on white
                prepareForNumberOCR(ocrCtx, 150, 150);
                
                // OCR - whitelist already set in init
                const result = await ocrWorker.recognize(ocrCanvas);
                
                let text = result.data.text.replace(/[^0-9]/g, '');
                console.log('🚸 Sign OCR:', result.data.text, '-> numbers:', text);
                addAlert(`OCR: "${text}"`, 'info');
                
                // Match valid speed limits
                const validSpeeds = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
                let foundSpeed = null;
                
                for (const speed of validSpeeds) {
                    if (text.includes(speed.toString())) {
                        foundSpeed = speed;
                        break;
                    }
                }
                
                if (foundSpeed && foundSpeed !== currentSpeedLimit) {
                    currentSpeedLimit = foundSpeed;
                    speedLimit.textContent = currentSpeedLimit;
                    addAlert(`🚸 מהירות מותרת: ${currentSpeedLimit} קמ"ש`, 'warning');
                    
                    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
                    
                    // Visual feedback
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(sign.cx, sign.cy, sign.radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = '#00ff00';
                    ctx.font = 'bold 24px Arial';
                    ctx.fillText(`${foundSpeed}`, sign.cx - 20, sign.cy - sign.radius - 10);
                    
                    break;
                }
            }
        } catch (e) {
            console.warn('Speed scan error:', e);
        }
        
        isOcrBusy = false;
    }
    
    function findRedCircleSigns(ctx, w, h) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const signs = [];
        
        // Create red mask
        const redMask = new Uint8Array(w * h);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            // Detect red (works for various lighting)
            const isRed = r > 100 && r > g * 1.3 && r > b * 1.3;
            redMask[i/4] = isRed ? 1 : 0;
        }
        
        // Find clusters of red pixels (potential sign borders)
        const visited = new Uint8Array(w * h);
        const minSize = 20, maxSize = 200;
        
        for (let y = 0; y < h; y += 10) {
            for (let x = 0; x < w; x += 10) {
                const idx = y * w + x;
                if (redMask[idx] && !visited[idx]) {
                    // Flood fill to find connected red region
                    const region = floodFill(redMask, visited, w, h, x, y);
                    
                    if (region.count > 50) {
                        // Calculate bounding box
                        const cx = (region.minX + region.maxX) / 2;
                        const cy = (region.minY + region.maxY) / 2;
                        const radius = Math.max(region.maxX - region.minX, region.maxY - region.minY) / 2;
                        
                        if (radius > minSize && radius < maxSize) {
                            // Check if center is white (sign interior)
                            const centerIdx = (Math.floor(cy) * w + Math.floor(cx)) * 4;
                            const cr = data[centerIdx], cg = data[centerIdx+1], cb = data[centerIdx+2];
                            
                            if (cr > 150 && cg > 150 && cb > 150) {
                                signs.push({ cx, cy, radius, score: region.count });
                            }
                        }
                    }
                }
            }
        }
        
        // Sort by size (larger = closer = more important)
        signs.sort((a, b) => b.radius - a.radius);
        return signs.slice(0, 3);
    }
    
    function floodFill(mask, visited, w, h, startX, startY) {
        const stack = [[startX, startY]];
        const region = { minX: startX, maxX: startX, minY: startY, maxY: startY, count: 0 };
        
        while (stack.length > 0 && region.count < 5000) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            
            const idx = y * w + x;
            if (visited[idx] || !mask[idx]) continue;
            
            visited[idx] = 1;
            region.count++;
            region.minX = Math.min(region.minX, x);
            region.maxX = Math.max(region.maxX, x);
            region.minY = Math.min(region.minY, y);
            region.maxY = Math.max(region.maxY, y);
            
            stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
        }
        
        return region;
    }
    
    function prepareForNumberOCR(ctx, w, h) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const gray = (r + g + b) / 3;
            
            // High contrast: black numbers on white background
            // Numbers on speed signs are black/dark
            const isBlack = gray < 100;
            const val = isBlack ? 0 : 255;
            
            data[i] = data[i+1] = data[i+2] = val;
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    // Run speed sign scan every 1.5 seconds
    setInterval(scanForSpeedSigns, 1500);
    
    // --- Start ---
    bootSequence();
    initOCR();
    
});
