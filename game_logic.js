window.onload = function() {
    console.log("Iron Man HUD Mk.III Initializing...");

    // --- HUD Elements ---
    const luxEl = document.getElementById('lux-level');
    const emfEl = document.getElementById('emf-level');
    const hazardLevelEl = document.getElementById('hazard-level');
    const hazardBar = document.getElementById('hazard-bar');
    
    const compassStrip = document.getElementById('compass-ticks');
    const headingVal = document.getElementById('heading-val');
    const altEl = document.getElementById('altitude-val');
    const speedEl = document.getElementById('speed-val');
    const gForceEl = document.getElementById('g-force');
    const batteryEl = document.getElementById('battery-level');
    
    const targetData = document.getElementById('target-data');
    const targetName = document.getElementById('target-name');
    const targetDist = document.getElementById('target-dist');
    const targetConf = document.getElementById('target-conf');
    
    const voiceBars = document.querySelectorAll('#voice-viz .eq-bar');

    // --- 1. Boot Sequence ---
    const bootScreen = document.getElementById('boot-screen');
    const bootProgress = document.getElementById('boot-progress');
    const bootLog = document.getElementById('boot-log');
    
    const bootMessages = [
        "Loading sensor modules...",
        "Initializing magnetometer...",
        "Calibrating GPS...",
        "Connecting to camera...",
        "Loading AI model...",
        "System ready."
    ];
    
    let bootStep = 0;
    const bootInterval = setInterval(() => {
        if (bootStep < bootMessages.length) {
            if (bootLog) {
                bootLog.innerHTML += bootMessages[bootStep] + "<br>";
                bootLog.scrollTop = bootLog.scrollHeight;
            }
            if (bootProgress) {
                bootProgress.style.width = ((bootStep + 1) / bootMessages.length * 100) + '%';
            }
            bootStep++;
        } else {
            clearInterval(bootInterval);
            setTimeout(() => {
                if (bootScreen) {
                    bootScreen.style.opacity = '0';
                    bootScreen.style.transition = 'opacity 0.5s';
                    setTimeout(() => bootScreen.style.display = 'none', 500);
                }
            }, 500);
        }
    }, 400);

    // --- 2. System Status (Battery) ---
    function updateSystemInfo() {
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const level = Math.round(battery.level * 100);
                if(batteryEl) {
                    batteryEl.textContent = `${level}%`;
                    if (level < 20) batteryEl.style.color = '#ff0000';
                    else if (level < 50) batteryEl.style.color = '#ffff00';
                    else batteryEl.style.color = '#00ffff';
                }
            });
        } else {
            if(batteryEl) batteryEl.textContent = "100%";
        }
    }
    setInterval(updateSystemInfo, 2000);
    updateSystemInfo();

    // --- 3. Sensors: Compass & G-Force ---
    window.addEventListener('deviceorientation', (event) => {
        if (event.alpha !== null) {
            const heading = Math.round(event.alpha);
            const pixelsPerDegree = 4; 
            const offset = heading * pixelsPerDegree;
            if(compassStrip) compassStrip.style.transform = `translateX(calc(-50% - ${offset}px))`;
            if(headingVal) headingVal.textContent = heading.toString().padStart(3, '0');
        }
    });

    window.addEventListener('devicemotion', (event) => {
        if(event.accelerationIncludingGravity) {
            const { x, y, z } = event.accelerationIncludingGravity;
            const magnitude = Math.sqrt(x*x + y*y + z*z);
            const g = (magnitude / 9.8).toFixed(1);
            if(gForceEl) gForceEl.textContent = g;
            
            if(g > 2.5) {
                if(gForceEl) gForceEl.style.color = "red";
            } else {
                if(gForceEl) gForceEl.style.color = "#00ffff";
            }
        }
    });

    // --- 4. Sensors: GPS (Speed & Altitude) ---
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition((position) => {
            const alt = position.coords.altitude;
            const spd = position.coords.speed;
            if(altEl) altEl.textContent = alt !== null ? Math.round(alt) : '--';
            if(speedEl) {
                const kmh = spd !== null ? (spd * 3.6).toFixed(0) : '0';
                speedEl.textContent = kmh;
            }
        }, (err) => { console.warn("GPS Error:", err); }, { enableHighAccuracy: true });
    }

    // --- 5. Environment Sensors (Lux, EMF, Hazard) ---
    let currentLux = 0;
    let currentEMF = 45;

    // A. Ambient Light
    if ('AmbientLightSensor' in window) {
        try {
            const sensor = new AmbientLightSensor();
            sensor.addEventListener('reading', () => {
                currentLux = Math.round(sensor.illuminance);
                if(luxEl) luxEl.textContent = currentLux;
                updateHazardLevel();
            });
            sensor.start();
        } catch (err) { 
            console.warn("Light Sensor error:", err);
            simulateLux();
        }
    } else {
        simulateLux();
    }

    function simulateLux() {
        setInterval(() => {
            currentLux = Math.round(200 + Math.random() * 100);
            if(luxEl) luxEl.textContent = currentLux;
            updateHazardLevel();
        }, 2000);
    }

    // B. Magnetometer (EMF)
    if ('Magnetometer' in window) {
        try {
            const magSensor = new Magnetometer({frequency: 10});
            magSensor.addEventListener('reading', () => {
                const x = magSensor.x;
                const y = magSensor.y;
                const z = magSensor.z;
                const totalField = Math.sqrt(x*x + y*y + z*z);
                currentEMF = Math.round(totalField);
                if(emfEl) emfEl.textContent = currentEMF;
                updateHazardLevel();
            });
            magSensor.start();
        } catch (err) {
            console.warn("Magnetometer error:", err);
            simulateEMF();
        }
    } else {
        simulateEMF();
    }

    function simulateEMF() {
        setInterval(() => {
            currentEMF = Math.round(40 + Math.random() * 15);
            if(emfEl) emfEl.textContent = currentEMF;
            updateHazardLevel();
        }, 1500);
    }

    // C. Hazard Calculation
    function updateHazardLevel() {
        const emfFactor = Math.min(100, Math.max(0, (currentEMF - 30) * 1.5));
        const lightFactor = Math.min(100, currentLux / 100);
        const hazardScore = Math.min(100, (emfFactor * 0.7) + (lightFactor * 0.3));
        
        if(hazardBar) hazardBar.style.width = `${hazardScore}%`;
        
        if(hazardLevelEl) {
            if(hazardScore < 30) {
                hazardLevelEl.textContent = "SAFE";
                hazardLevelEl.style.color = "#00ff00";
            } else if (hazardScore < 70) {
                hazardLevelEl.textContent = "CAUTION";
                hazardLevelEl.style.color = "#ffff00";
            } else {
                hazardLevelEl.textContent = "DANGER";
                hazardLevelEl.style.color = "#ff0000";
            }
        }
    }

    // --- 6. Voice Visualizer ---
    async function setupAudioVisualizer() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 64; 
            analyser.smoothingTimeConstant = 0.5;
            microphone.connect(analyser);
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function draw() {
                requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                
                for (let i = 0; i < voiceBars.length; i++) {
                    const binIndex = Math.floor(i * (bufferLength / voiceBars.length));
                    const val = dataArray[binIndex]; 
                    const normalized = val / 255;
                    
                    let height = (normalized * 10) + (Math.pow(normalized, 1.5) * 20);
                    height = Math.max(2, Math.min(30, height));
                    
                    voiceBars[i].style.height = `${height}px`;
                    
                    if (val > 150) {
                        voiceBars[i].style.backgroundColor = '#ff3300';
                    } else if (val > 80) { 
                        voiceBars[i].style.backgroundColor = '#ffff00';
                    } else {
                        voiceBars[i].style.backgroundColor = '#00ffff'; 
                    }
                }
            }
            draw();
            
        } catch (e) {
            console.warn("Audio Access Failed:", e);
        }
    }
    
    document.body.addEventListener('click', setupAudioVisualizer, { once: true });

    // --- 7. AI Detection with Bounding Boxes ---
    let aiModel = null;
    let detectedObjects = [];
    let currentLockedObj = null;
    let isScanning = false;
    let scanComplete = false;
    
    const detectionCanvas = document.getElementById('detection-canvas');
    const ctx = detectionCanvas ? detectionCanvas.getContext('2d') : null;

    function resizeCanvas() {
        if (detectionCanvas) {
            detectionCanvas.width = window.innerWidth;
            detectionCanvas.height = window.innerHeight;
        }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    async function loadAI() {
        if (typeof cocoSsd !== 'undefined') {
            try {
                aiModel = await cocoSsd.load();
                console.log("AI Model Loaded");
                detectLoop();
            } catch(e) {
                console.warn("AI Load Error:", e);
            }
        }
    }

    async function detectLoop() {
        const video = document.querySelector('video');
        if (video && aiModel && video.readyState === 4) {
            try {
                const predictions = await aiModel.detect(video);
                detectedObjects = predictions.filter(p => p.score > 0.4);
                drawDetectionBoxes(video);
                checkReticleFocus(video);
            } catch(e) {}
        }
        requestAnimationFrame(detectLoop);
    }

    function drawDetectionBoxes(video) {
        if (!ctx) return;
        ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
        
        const scaleX = window.innerWidth / video.videoWidth;
        const scaleY = window.innerHeight / video.videoHeight;
        const scale = Math.max(scaleX, scaleY);
        const offsetX = (window.innerWidth - video.videoWidth * scale) / 2;
        const offsetY = (window.innerHeight - video.videoHeight * scale) / 2;

        for (let obj of detectedObjects) {
            const x = obj.bbox[0] * scale + offsetX;
            const y = obj.bbox[1] * scale + offsetY;
            const w = obj.bbox[2] * scale;
            const h = obj.bbox[3] * scale;
            
            const isLocked = currentLockedObj && obj === currentLockedObj;
            
            ctx.strokeStyle = isLocked ? '#ff0000' : '#00ffff';
            ctx.lineWidth = isLocked ? 3 : 2;
            ctx.setLineDash(isLocked ? [] : [5, 5]);
            
            // Draw corners only (tactical style)
            const cornerLen = Math.min(w, h) * 0.2;
            ctx.beginPath();
            // Top-left
            ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
            // Top-right
            ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
            // Bottom-right
            ctx.moveTo(x + w, y + h - cornerLen); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cornerLen, y + h);
            // Bottom-left
            ctx.moveTo(x + cornerLen, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cornerLen);
            ctx.stroke();
            
            // Draw "?" label for unscanned objects
            if (!isLocked) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
                ctx.font = '12px Consolas';
                ctx.fillText('?', x + 5, y + 15);
            }
        }
    }

    function checkReticleFocus(video) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let newLockedObj = null;

        const scaleX = window.innerWidth / video.videoWidth;
        const scaleY = window.innerHeight / video.videoHeight;
        const scale = Math.max(scaleX, scaleY);
        const offsetX = (window.innerWidth - video.videoWidth * scale) / 2;
        const offsetY = (window.innerHeight - video.videoHeight * scale) / 2;

        for (let obj of detectedObjects) {
            const x = obj.bbox[0] * scale + offsetX;
            const y = obj.bbox[1] * scale + offsetY;
            const w = obj.bbox[2] * scale;
            const h = obj.bbox[3] * scale;

            if (cx > x && cx < x + w && cy > y && cy < y + h) {
                newLockedObj = obj;
                break;
            }
        }

        // Object changed - reset scan
        if (newLockedObj !== currentLockedObj) {
            currentLockedObj = newLockedObj;
            isScanning = false;
            scanComplete = false;
            
            if (newLockedObj && !isScanning) {
                startScan(newLockedObj, scale);
            } else {
                if(targetData) targetData.style.display = 'none';
            }
        }
    }

    function startScan(obj, scale) {
        isScanning = true;
        if(targetData) targetData.style.display = 'flex';
        if(targetName) {
            targetName.textContent = 'SCANNING...';
            targetName.style.color = '#ffff00';
        }
        if(targetDist) targetDist.textContent = '--';
        if(targetConf) targetConf.textContent = '--';
        
        // Vibrate on lock
        if (navigator.vibrate) navigator.vibrate(50);
        
        // Reveal info after 1.5 seconds
        setTimeout(() => {
            if (currentLockedObj === obj) {
                scanComplete = true;
                revealObjectInfo(obj, scale);
            }
        }, 1500);
    }

    function revealObjectInfo(obj, scale) {
        if(targetName) {
            targetName.textContent = obj.class.toUpperCase();
            targetName.style.color = '#ff3300';
        }
        
        const heightPercent = (obj.bbox[3] * scale) / window.innerHeight;
        const dist = (1.5 / heightPercent).toFixed(1);
        if(targetDist) targetDist.textContent = dist;
        if(targetConf) targetConf.textContent = Math.round(obj.score * 100);
        
        // Vibrate on identification
        if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
    }

    loadAI();

    // --- 8. Voice Commands ---
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        
        recognition.onresult = (event) => {
            const cmd = event.results[event.results.length-1][0].transcript.trim().toLowerCase();
            console.log("Voice:", cmd);
            if (cmd.includes('fire') || cmd.includes('shoot')) {
                if (navigator.vibrate) navigator.vibrate(200);
            }
        };
        recognition.onend = () => { try { recognition.start(); } catch(e){} };
        try { recognition.start(); } catch(e){}
    }
};
