// Attendance Monitoring App
let html5QrcodeScanner = null;
let attendanceRecords = [];
let currentQRCode = null;
let isProcessingScan = false;
let lastScannedData = null;
let lastScanTime = 0;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadRecords();
    updateStats();
    populateClusterFilter();
    
    document.getElementById('filter-date').valueAsDate = new Date();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    }
});

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');
    
    if (tabName !== 'scan' && html5QrcodeScanner) {
        stopScanner();
    }
    
    if (tabName === 'records') {
        populateClusterFilter();
    }
}

// QR Code Scanner Functions
document.getElementById('start-scan-btn').addEventListener('click', startScanner);
document.getElementById('stop-scan-btn').addEventListener('click', stopScanner);

function startScanner() {
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
        }).catch(err => {
            console.error('Error stopping scanner:', err);
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    
    if (isProcessingScan) {
        return;
    }
    
    if (lastScannedData === decodedText && (now - lastScanTime) < 3000) {
        return;
    }
    
    isProcessingScan = true;
    lastScannedData = decodedText;
    lastScanTime = now;
    
    try {
        const data = JSON.parse(decodedText);
        
        if (data.name && data.cluster) {
            stopScanner();
            
            const recentDuplicate = attendanceRecords.find(record => 
                record.name === data.name && 
                record.cluster === data.cluster &&
                (now - record.id) < 5000
            );
            
            if (recentDuplicate) {
                alert('This person was already scanned recently!');
                setTimeout(() => {
                    isProcessingScan = false;
                }, 2000);
                return;
            }
            
            logAttendance(data.name, data.cluster);
            
            document.getElementById('scanned-name').textContent = data.name;
            document.getElementById('scanned-cluster').textContent = data.cluster;
            document.getElementById('scanned-time').textContent = new Date().toLocaleString();
            document.getElementById('scan-result').style.display = 'block';
            
            if (navigator.vibrate) {
                navigator.vibrate(200);
            }
            
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
    // Ignore errors
}

// Attendance Logging
function logAttendance(name, cluster) {
    const record = {
        id: Date.now(),
        name: name.trim(),
        cluster: cluster.trim(),
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
    };
    
    attendanceRecords.unshift(record);
    saveRecords();
    updateStats();
    populateClusterFilter();
    displayRecords();
}

// Local Storage Functions
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
    
    if (records.length === 0) {
        recordsList.innerHTML = '<p class="empty-state">No attendance records found.</p>';
        return;
    }
    
    recordsList.innerHTML = records.map(record => `
        <div class="record-item">
            <h4>${record.name}</h4>
            <p><strong>Cluster:</strong> ${record.cluster}</p>
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

// Filter Records - THE CRITICAL FIX IS HERE
function filterRecords() {
    const dateFilter = document.getElementById('filter-date').value;
    const clusterFilter = document.getElementById('filter-cluster').value;
    
    // CRITICAL: Create a NEW array, don't reference the original
    let filtered = attendanceRecords.slice();
    
    // Apply date filter
    if (dateFilter) {
        const filterDate = new Date(dateFilter).toLocaleDateString();
        filtered = filtered.filter(r => r.date === filterDate);
    }
    
    // Apply cluster filter
    if (clusterFilter) {
        filtered = filtered.filter(r => r.cluster.trim() === clusterFilter.trim());
    }
    
    // Display filtered results
    displayRecords(filtered);
}

// Export to CSV
function exportToCSV() {
    if (attendanceRecords.length === 0) {
        alert('No records to export!');
        return;
    }
    
    const headers = ['Name', 'Cluster', 'Date', 'Time'];
    const rows = attendanceRecords.map(r => [r.name, r.cluster, r.date, r.time]);
    
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.join(',') + '\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
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
    
    document.getElementById('qrcode').innerHTML = '';
    
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
    if (canvas) {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const name = document.getElementById('employee-name').value.trim();
        a.href = url;
        a.download = `QR_${name.replace(/\s+/g, '_')}.png`;
        a.click();
    }
}
