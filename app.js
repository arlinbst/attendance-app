// Attendance Monitoring App
let html5QrcodeScanner = null;
let attendanceRecords = [];
let currentQRCode = null;
let isProcessingScan = false; // Prevent multiple scans
let lastScannedData = null; // Track last scanned QR data
let lastScanTime = 0; // Track last scan timestamp
let currentDisplayedRecords = []; // Track currently displayed/filtered records

// Firebase Configuration - REPLACE THIS WITH YOUR CONFIG!
const firebaseConfig = {
    apiKey: "AIzaSyCbZI9mTieFtelvSRscgp2oWp9oA5cIYo",
    authDomain: "attendance-app-5b4f5.firebaseapp.com",
    projectId: "attendance-app-5b4f5",
    storageBucket: "attendance-app-5b4f5.firebasestorage.app",
    messagingSenderId: "956254297402",
    appId: "1:956254297402:web:355f174260dc36b662c403",
    measurementId: "G-M305PQ2KVR"
};

// Initialize Firebase (will be loaded from CDN)
let db = null;
let firebaseInitialized = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // DON'T set default date - show all records by default
    // Add auto-filter event listeners
    document.getElementById('filter-date').addEventListener('change', filterRecords);
    document.getElementById('filter-cluster').addEventListener('change', filterRecords);
    document.getElementById('filter-service').addEventListener('change', filterRecords);
    
    // Initialize Firebase and load records
    initializeFirebase().then(() => {
        loadRecordsFromCloud();
    }).catch(() => {
        // Fallback to localStorage if Firebase fails
        loadRecords();
        updateStats();
        populateClusterFilter();
    });
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    }
});

// Tab switching
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');
    
    // Stop scanner when switching away from scan tab
    if (tabName !== 'scan' && html5QrcodeScanner) {
        stopScanner();
    }
    
    // Update cluster filter when switching to records
    if (tabName === 'records') {
        populateClusterFilter();
    }
}

// QR Code Scanner Functions
document.getElementById('start-scan-btn').addEventListener('click', startScanner);
document.getElementById('stop-scan-btn').addEventListener('click', stopScanner);

function startScanner() {
    // Reset all flags
    isProcessingScan = false;
    lastScannedData = null;
    lastScanTime = 0;
    
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };
    
    html5QrcodeScanner = new Html5Qrcode("reader");
    
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
    ).then(() => {
        document.getElementById('start-scan-btn').style.display = 'none';
        document.getElementById('stop-scan-btn').style.display = 'inline-block';
        document.getElementById('scan-result').style.display = 'none';
    }).catch(err => {
        alert('Error starting camera: ' + err);
    });
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
            document.getElementById('start-scan-btn').style.display = 'inline-block';
            document.getElementById('stop-scan-btn').style.display = 'none';
            // Don't reset flags here - let them timeout naturally to prevent accidental re-scans
        }).catch(err => {
            console.error('Error stopping scanner:', err);
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    
    // AGGRESSIVE duplicate prevention
    // 1. Check if already processing
    if (isProcessingScan) {
        return;
    }
    
    // 2. Check if same data was just scanned (within 3 seconds)
    if (lastScannedData === decodedText && (now - lastScanTime) < 3000) {
        return;
    }
    
    // Set flags immediately to block other scans
    isProcessingScan = true;
    lastScannedData = decodedText;
    lastScanTime = now;
    
    try {
        const data = JSON.parse(decodedText);
        
        if (data.name && data.cluster) {
            // Stop scanner immediately (before logging)
            stopScanner();
            
            // Get current service type and date
            const serviceType = document.getElementById('service-type').value;
            const today = new Date().toLocaleDateString();
            
            // Check for duplicate: same person + same date + same service type
            const duplicate = attendanceRecords.find(record => 
                record.name.trim().toLowerCase() === data.name.trim().toLowerCase() && 
                record.cluster.trim().toLowerCase() === data.cluster.trim().toLowerCase() &&
                record.date === today &&
                record.serviceType === serviceType
            );
            
            if (duplicate) {
                alert('⚠️ Duplicate Attendance!\n\n' + data.name + ' already scanned for ' + serviceType + ' today at ' + duplicate.time);
                setTimeout(() => {
                    isProcessingScan = false;
                }, 2000);
                return;
            }
            
            // Log attendance
            logAttendance(data.name, data.cluster, serviceType);
            
            // Show result
            document.getElementById('scanned-name').textContent = data.name;
            document.getElementById('scanned-cluster').textContent = data.cluster;
            document.getElementById('scanned-service').textContent = serviceType;
            document.getElementById('scanned-time').textContent = new Date().toLocaleString();
            document.getElementById('scan-result').style.display = 'block';
            
            // Vibrate on success
            if (navigator.vibrate) {
                navigator.vibrate(200);
            }
            
            // Reset processing flag after delay
            setTimeout(() => {
                isProcessingScan = false;
            }, 3000);
        } else {
            isProcessingScan = false;
        }
    } catch (e) {
        alert('Invalid QR Code format. Please scan a valid attendance QR code.');
        isProcessingScan = false;
        lastScannedData = null;
    }
}

function onScanError(errorMessage) {
    // Ignore errors (scanning continues)
}

// Attendance Logging
function logAttendance(name, cluster, serviceType) {
    const record = {
        name: name.trim(),
        cluster: cluster.trim(),
        serviceType: serviceType,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        isVisitor: false
    };
    
    // Save to cloud (which will trigger real-time update)
    saveRecordToCloud(record);
    
    // For immediate UI feedback (before cloud sync)
    const tempRecord = { id: Date.now(), ...record };
    attendanceRecords.unshift(tempRecord);
    displayRecords();
    updateStats();
    populateClusterFilter();
}

// Add Visitor Attendance
function addVisitor() {
    const name = document.getElementById('visitor-name').value.trim();
    const visitorType = document.getElementById('visitor-type').value;
    const serviceType = document.getElementById('visitor-service').value;
    
    if (!name) {
        alert('Please enter visitor name!');
        return;
    }
    
    if (!visitorType) {
        alert('Please select visitor type!');
        return;
    }
    
    const today = new Date().toLocaleDateString();
    
    // Check for duplicate visitor: same name + same date + same service type
    const duplicate = attendanceRecords.find(record => 
        record.name.trim().toLowerCase() === name.toLowerCase() &&
        record.date === today &&
        record.serviceType === serviceType &&
        record.isVisitor === true
    );
    
    if (duplicate) {
        alert('⚠️ Duplicate Visitor!\n\n' + name + ' already added for ' + serviceType + ' today at ' + duplicate.time);
        return;
    }
    
    const record = {
        name: name,
        cluster: visitorType, // Store visitor type in cluster field
        serviceType: serviceType,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        isVisitor: true,
        visitorType: visitorType
    };
    
    // Save to cloud
    saveRecordToCloud(record);
    
    // For immediate UI feedback
    const tempRecord = { id: Date.now(), ...record };
    attendanceRecords.unshift(tempRecord);
    displayRecords();
    updateStats();
    populateClusterFilter();
    
    // Show success message
    document.getElementById('visitor-added-name').textContent = name;
    document.getElementById('visitor-added-type').textContent = visitorType;
    document.getElementById('visitor-added-service').textContent = serviceType;
    document.getElementById('visitor-added-time').textContent = new Date().toLocaleString();
    document.getElementById('visitor-result').style.display = 'block';
    
    // Clear form
    document.getElementById('visitor-name').value = '';
    document.getElementById('visitor-type').value = '';
    
    // Hide success message after 5 seconds
    setTimeout(() => {
        document.getElementById('visitor-result').style.display = 'none';
    }, 5000);
}
