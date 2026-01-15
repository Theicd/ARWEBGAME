// =============================================
// Iron Man AR - Debug Logger System
// Stores all logs in localStorage for debugging
// =============================================

const IronLogger = (function() {
    const STORAGE_KEY = 'iron_ar_logs';
    const MAX_LOGS = 500;
    let logs = [];
    let sessionStart = Date.now();
    
    // Load existing logs from localStorage
    function init() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if(stored) {
                logs = JSON.parse(stored);
            }
        } catch(e) {
            logs = [];
        }
        
        // Add session start marker
        addLog('SYSTEM', 'SESSION_START', {
            userAgent: navigator.userAgent,
            screen: `${screen.width}x${screen.height}`,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            orientation: screen.orientation?.type || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Override console methods
        overrideConsole();
        
        return IronLogger;
    }
    
    // Override console to capture all logs
    function overrideConsole() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        
        console.log = function(...args) {
            addLog('LOG', args.join(' '), null);
            originalLog.apply(console, args);
        };
        
        console.warn = function(...args) {
            addLog('WARN', args.join(' '), null);
            originalWarn.apply(console, args);
        };
        
        console.error = function(...args) {
            addLog('ERROR', args.join(' '), null);
            originalError.apply(console, args);
        };
    }
    
    // Add a log entry
    function addLog(type, message, data) {
        const entry = {
            t: Date.now(),
            type: type,
            msg: message,
            data: data
        };
        
        logs.push(entry);
        
        // Trim if too many
        if(logs.length > MAX_LOGS) {
            logs = logs.slice(-MAX_LOGS);
        }
        
        // Save to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
        } catch(e) {
            // Storage full - clear old logs
            logs = logs.slice(-100);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
        }
    }
    
    // Specific logging functions
    function logAI(action, data) {
        addLog('AI', action, data);
    }
    
    function logAR(action, data) {
        addLog('AR', action, data);
    }
    
    function logCombat(action, data) {
        addLog('COMBAT', action, data);
    }
    
    function logSensor(sensor, data) {
        addLog('SENSOR', sensor, data);
    }
    
    function logPerf(metric, value) {
        addLog('PERF', metric, { value: value });
    }
    
    function logError(source, error) {
        addLog('ERROR', source, { 
            message: error.message || error,
            stack: error.stack || null
        });
    }
    
    // Get all logs
    function getLogs() {
        return logs;
    }
    
    // Get logs as text
    function getLogsAsText() {
        let text = '=== IRON MAN AR DEBUG LOG ===\n';
        text += `Generated: ${new Date().toISOString()}\n`;
        text += `Session Duration: ${Math.round((Date.now() - sessionStart) / 1000)}s\n`;
        text += `Total Entries: ${logs.length}\n`;
        text += '=============================\n\n';
        
        for(let log of logs) {
            const time = new Date(log.t).toLocaleTimeString('he-IL');
            const ms = log.t % 1000;
            text += `[${time}.${ms.toString().padStart(3, '0')}] [${log.type}] ${log.msg}`;
            if(log.data) {
                text += ` | ${JSON.stringify(log.data)}`;
            }
            text += '\n';
        }
        
        return text;
    }
    
    // Download logs as file
    function downloadLogs() {
        const text = getLogsAsText();
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iron_ar_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog('SYSTEM', 'LOGS_DOWNLOADED', null);
    }
    
    // Clear all logs
    function clearLogs() {
        logs = [];
        localStorage.removeItem(STORAGE_KEY);
        addLog('SYSTEM', 'LOGS_CLEARED', null);
    }
    
    // Get summary stats
    function getStats() {
        const stats = {
            total: logs.length,
            byType: {},
            errors: 0,
            sessionDuration: Math.round((Date.now() - sessionStart) / 1000)
        };
        
        for(let log of logs) {
            stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
            if(log.type === 'ERROR') stats.errors++;
        }
        
        return stats;
    }
    
    // Performance tracking
    let perfMarks = {};
    
    function perfStart(name) {
        perfMarks[name] = performance.now();
    }
    
    function perfEnd(name) {
        if(perfMarks[name]) {
            const duration = performance.now() - perfMarks[name];
            logPerf(name, duration.toFixed(2) + 'ms');
            delete perfMarks[name];
            return duration;
        }
        return 0;
    }
    
    // Public API
    return {
        init: init,
        log: addLog,
        ai: logAI,
        ar: logAR,
        combat: logCombat,
        sensor: logSensor,
        perf: logPerf,
        error: logError,
        perfStart: perfStart,
        perfEnd: perfEnd,
        getLogs: getLogs,
        getLogsAsText: getLogsAsText,
        download: downloadLogs,
        clear: clearLogs,
        stats: getStats
    };
})();

// Auto-init
if(typeof window !== 'undefined') {
    window.IronLogger = IronLogger.init();
}
