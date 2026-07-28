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
    // Set today's date as default filter
    document.getElementById('filter-date').valueAsDate = new Date();
    
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
            
            // Check for recent duplicate in records (within last 5 seconds)
            const recentDuplicate = attendanceRecords.find(record => 
                record.name === data.name && 
                record.cluster === data.cluster &&
                (now - record.id) < 5000 // 5 seconds
            );
            
            if (recentDuplicate) {
                alert('This person was already scanned recently!');
                setTimeout(() => {
                    isProcessingScan = false;
                }, 2000);
                return;
            }
            
            // Log attendance
            const serviceType = document.getElementById('service-type').value;
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
        time: new Date().toLocaleTimeString()
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

// Firebase Functions
async function initializeFirebase() {
    try {
        // Check if Firebase libraries are loaded
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase not loaded');
        }
        
        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        db = firebase.firestore();
        firebaseInitialized = true;
        console.log('Firebase initialized successfully');
        
        // Listen for real-time updates
        db.collection('attendance').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
            attendanceRecords = [];
            snapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            displayRecords();
            updateStats();
            populateClusterFilter();
            
            // Also save to localStorage as backup
            localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
        });
        
        return true;
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        firebaseInitialized = false;
        throw error;
    }
}

async function saveRecordToCloud(record) {
    if (firebaseInitialized && db) {
        try {
            await db.collection('attendance').add(record);
            console.log('Record saved to cloud');
        } catch (error) {
            console.error('Error saving to cloud:', error);
            // Fallback to localStorage
            saveRecords();
        }
    } else {
        // Fallback to localStorage
        saveRecords();
    }
}

async function loadRecordsFromCloud() {
    if (firebaseInitialized && db) {
        try {
            const snapshot = await db.collection('attendance').orderBy('timestamp', 'desc').get();
            attendanceRecords = [];
            snapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            displayRecords();
            updateStats();
            populateClusterFilter();
            
            // Save to localStorage as backup
            localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
        } catch (error) {
            console.error('Error loading from cloud:', error);
            // Fallback to localStorage
            loadRecords();
        }
    } else {
        loadRecords();
    }
}

async function clearAllRecordsFromCloud() {
    if (firebaseInitialized && db) {
        try {
            const batch = db.batch();
            const snapshot = await db.collection('attendance').get();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log('All records cleared from cloud');
        } catch (error) {
            console.error('Error clearing cloud records:', error);
        }
    }
}

// Local Storage Functions (Fallback)
function saveRecords() {
    localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
}

function loadRecords() {
    const saved = localStorage.getItem('attendanceRecords');
    if (saved) {
        attendanceRecords = JSON.parse(saved);
        displayRecords();
    }
}

function clearAllRecords() {
    if (confirm('Are you sure you want to delete all attendance records? This cannot be undone.')) {
        // Clear from cloud
        clearAllRecordsFromCloud();
        
        // Clear local
        attendanceRecords = [];
        saveRecords();
        updateStats();
        populateClusterFilter();
        displayRecords();
    }
}

// Display Functions
function displayRecords(filteredRecords = null) {
    const recordsList = document.getElementById('records-list');
    const records = filteredRecords || attendanceRecords;
    
    // IMPORTANT: Store currently displayed records for export
    currentDisplayedRecords = records;
    
    if (records.length === 0) {
        recordsList.innerHTML = '<p class="empty-state">No attendance records found.</p>';
        return;
    }
    
    recordsList.innerHTML = records.map(record => `
        <div class="record-item">
            <h4>${record.name}</h4>
            <p><strong>Cluster:</strong> ${record.cluster}</p>
            <p><strong>Service Type:</strong> ${record.serviceType || 'N/A'}</p>
            <p><strong>Date:</strong> ${record.date}</p>
            <p><strong>Time:</strong> ${record.time}</p>
        </div>
    `).join('');
}

function updateStats() {
    const today = new Date().toLocaleDateString();
    const todayCount = attendanceRecords.filter(r => r.date === today).length;
    
    document.getElementById('total-today').textContent = todayCount;
    document.getElementById('total-all').textContent = attendanceRecords.length;
}

function populateClusterFilter() {
    const clusters = [...new Set(attendanceRecords.map(r => r.cluster.trim()))].sort();
    const select = document.getElementById('filter-cluster');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">All Clusters</option>';
    clusters.forEach(cluster => {
        const option = document.createElement('option');
        option.value = cluster;
        option.textContent = cluster;
        select.appendChild(option);
    });
    
    if (currentValue && clusters.includes(currentValue)) {
        select.value = currentValue;
    }
}

function populateServiceTypeFilter() {
    const serviceTypes = [...new Set(attendanceRecords.map(r => r.serviceType).filter(Boolean))].sort();
    const select = document.getElementById('filter-service');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">All Service Types</option>';
    serviceTypes.forEach(service => {
        const option = document.createElement('option');
        option.value = service;
        option.textContent = service;
        select.appendChild(option);
    });
    
    if (currentValue && serviceTypes.includes(currentValue)) {
        select.value = currentValue;
    }
}

// Filter Records
function filterRecords() {
    const dateFilter = document.getElementById('filter-date').value;
    const clusterFilter = document.getElementById('filter-cluster').value;
    const serviceFilter = document.getElementById('filter-service').value;
    
    let filtered = attendanceRecords.slice(); // Create a copy
    
    if (dateFilter) {
        const filterDate = new Date(dateFilter).toLocaleDateString();
        filtered = filtered.filter(r => r.date === filterDate);
    }
    
    if (clusterFilter) {
        filtered = filtered.filter(r => r.cluster.trim() === clusterFilter.trim());
    }
    
    if (serviceFilter) {
        filtered = filtered.filter(r => r.serviceType === serviceFilter);
    }
    
    displayRecords(filtered);
}

// Export to CSV - FIXED to export filtered records
function exportToCSV() {
    // Re-apply current filters to ensure we export what's displayed
    const dateFilter = document.getElementById('filter-date').value;
    const clusterFilter = document.getElementById('filter-cluster').value;
    const serviceFilter = document.getElementById('filter-service').value;
    
    let recordsToExport = attendanceRecords.slice(); // Start with all records
    
    // Apply date filter if set
    if (dateFilter) {
        const filterDate = new Date(dateFilter).toLocaleDateString();
        recordsToExport = recordsToExport.filter(r => r.date === filterDate);
    }
    
    // Apply cluster filter if set
    if (clusterFilter) {
        recordsToExport = recordsToExport.filter(r => r.cluster.trim() === clusterFilter.trim());
    }
    
    // Apply service type filter if set
    if (serviceFilter) {
        recordsToExport = recordsToExport.filter(r => r.serviceType === serviceFilter);
    }
    
    if (recordsToExport.length === 0) {
        alert('No records to export!');
        return;
    }
    
    const headers = ['Name', 'Cluster', 'Service Type', 'Date', 'Time'];
    const rows = recordsToExport.map(r => [r.name, r.cluster, r.serviceType || 'N/A', r.date, r.time]);
    
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.join(',') + '\n';
    });
    
    // Generate filename with filter info
    let filename = 'attendance';
    
    // Add service type to filename if filtered
    if (serviceFilter) {
        filename += `_${serviceFilter.replace(/\s+/g, '_')}`;
    }
    
    if (dateFilter) {
        filename += `_${dateFilter}`;
    }
    if (clusterFilter) {
        filename += `_${clusterFilter.replace(/\s+/g, '_')}`;
    }
    filename += '.csv';
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    
    // Check if Web Share API is supported (for mobile sharing)
    if (navigator.share && navigator.canShare) {
        const file = new File([blob], filename, { type: 'text/csv' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({
                files: [file],
                title: 'Attendance Report',
                text: 'Attendance records export'
            }).then(() => {
                console.log('Shared successfully');
            }).catch((error) => {
                console.log('Error sharing:', error);
                // Fallback to download
                downloadBlob(blob, filename);
            });
            return;
        }
    }
    
    // Fallback: regular download
    downloadBlob(blob, filename);
}

// Helper function to download blob
function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// QR Code Generation
function generateQR() {
    const name = document.getElementById('employee-name').value.trim();
    const cluster = document.getElementById('employee-cluster').value.trim();
    
    if (!name || !cluster) {
        alert('Please enter both name and cluster!');
        return;
    }
    
    const data = JSON.stringify({ name, cluster });
    
    // Clear previous QR code
    document.getElementById('qrcode').innerHTML = '';
    
    // Generate new QR code
    currentQRCode = new QRCode(document.getElementById('qrcode'), {
        text: data,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    
    document.getElementById('qr-name').textContent = name;
    document.getElementById('qr-output').style.display = 'block';
}

function downloadQR() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) return;
    
    const name = document.getElementById('employee-name').value.trim();
    const filename = `QR_${name.replace(/\s+/g, '_')}.png`;
    
    // Convert canvas to blob
    canvas.toBlob((blob) => {
        // Check if Web Share API is supported (for mobile sharing)
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: `QR Code - ${name}`,
                    text: `QR code for ${name}`
                }).then(() => {
                    console.log('Shared successfully');
                }).catch((error) => {
                    console.log('Error sharing:', error);
                    // Fallback to download
                    downloadBlobFromCanvas(blob, filename);
                });
                return;
            }
        }
        
        // Fallback: regular download
        downloadBlobFromCanvas(blob, filename);
    }, 'image/png');
}

// Helper function to download blob from canvas
function downloadBlobFromCanvas(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
