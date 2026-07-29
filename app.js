// Attendance Monitoring App
let html5QrcodeScanner = null;
let attendanceRecords = [];
let currentQRCode = null;
let isProcessingScan = false;
let lastScannedData = null;
let lastScanTime = 0;
let currentDisplayedRecords = [];

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCbZI9mTieFtelvSRscgp2oWp9oA5cIYo",
    authDomain: "attendance-app-5b4f5.firebaseapp.com",
    projectId: "attendance-app-5b4f5",
    storageBucket: "attendance-app-5b4f5.firebasestorage.app",
    messagingSenderId: "956254297402",
    appId: "1:956254297402:web:355f174260dc36b662c403",
    measurementId: "G-M305PQ2KVR"
};

let db = null;
let firebaseInitialized = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Auto-filtering on input change
    document.getElementById('filter-date').addEventListener('change', filterRecords);
    document.getElementById('filter-cluster').addEventListener('change', filterRecords);
    document.getElementById('filter-service').addEventListener('change', filterRecords);
    
    initializeFirebase().then(() => {
        loadRecordsFromCloud();
    }).catch(() => {
        loadRecords();
        updateStats();
        populateClusterFilter();
    });
    
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

// Clear all filters and show all records
function clearFilters() {
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-cluster').value = '';
    document.getElementById('filter-service').value = '';
    displayRecords(attendanceRecords);
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
            
            const serviceType = document.getElementById('service-type').value;
            const today = new Date().toLocaleDateString();
            
            // Enhanced duplicate check: same person + same date + same service type
            const duplicateToday = attendanceRecords.find(record => 
                record.name === data.name && 
                record.cluster === data.cluster &&
                record.date === today &&
                record.serviceType === serviceType &&
                !record.isVisitor
            );
            
            if (duplicateToday) {
                alert(`Duplicate attendance detected!\n\n${data.name} already attended ${serviceType} today.`);
                setTimeout(() => {
                    isProcessingScan = false;
                }, 2000);
                return;
            }
            
            logAttendance(data.name, data.cluster, serviceType);
            
            document.getElementById('scanned-name').textContent = data.name;
            document.getElementById('scanned-cluster').textContent = data.cluster;
            document.getElementById('scanned-service').textContent = serviceType;
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
    // Ignore scan errors
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
    
    saveRecordToCloud(record);
    
    const tempRecord = { id: Date.now(), ...record };
    attendanceRecords.unshift(tempRecord);
    displayRecords();
    updateStats();
    populateClusterFilter();
}

// Add Visitor Function
function addVisitor() {
    const name = document.getElementById('visitor-name').value.trim();
    const visitorType = document.getElementById('visitor-type').value;
    const serviceType = document.getElementById('visitor-service').value;
    
    if (!name) {
        alert('Please enter visitor name!');
        return;
    }
    
    const today = new Date().toLocaleDateString();
    
    // Check for duplicate visitor
    const duplicateVisitor = attendanceRecords.find(record => 
        record.name === name && 
        record.date === today &&
        record.serviceType === serviceType &&
        record.isVisitor === true
    );
    
    if (duplicateVisitor) {
        alert(`Duplicate visitor detected!\n\n${name} already recorded for ${serviceType} today.`);
        return;
    }
    
    const record = {
        name: name,
        cluster: 'VISITOR',
        serviceType: serviceType,
        timestamp: new Date().toISOString(),
        date: today,
        time: new Date().toLocaleTimeString(),
        isVisitor: true,
        visitorType: visitorType
    };
    
    saveRecordToCloud(record);
    
    const tempRecord = { id: Date.now(), ...record };
    attendanceRecords.unshift(tempRecord);
    displayRecords();
    updateStats();
    populateClusterFilter();
    
    // Show success message
    document.getElementById('visitor-result-name').textContent = name;
    document.getElementById('visitor-result-type').textContent = visitorType;
    document.getElementById('visitor-result-service').textContent = serviceType;
    document.getElementById('visitor-result-time').textContent = new Date().toLocaleString();
    document.getElementById('visitor-result').style.display = 'block';
    
    // Clear form
    document.getElementById('visitor-name').value = '';
    
    // Vibrate on success
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
    
    setTimeout(() => {
        document.getElementById('visitor-result').style.display = 'none';
    }, 5000);
}

// Firebase Functions
async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase not loaded');
        }
        
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        db = firebase.firestore();
        firebaseInitialized = true;
        console.log('Firebase initialized successfully');
        
        db.collection('attendance').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
            attendanceRecords = [];
            snapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            displayRecords();
            updateStats();
            populateClusterFilter();
            
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
            saveRecords();
        }
    } else {
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
            
            localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
        } catch (error) {
            console.error('Error loading from cloud:', error);
            loadRecords();
        }
    } else {
        loadRecords();
    }
}

async function deleteRecordsByDateFromCloud(dateToDelete) {
    if (firebaseInitialized && db) {
        try {
            const batch = db.batch();
            const snapshot = await db.collection('attendance').get();
            snapshot.docs.forEach((doc) => {
                const record = doc.data();
                if (record.date === dateToDelete) {
                    batch.delete(doc.ref);
                }
            });
            await batch.commit();
            console.log('Records deleted from cloud for date:', dateToDelete);
        } catch (error) {
            console.error('Error deleting records from cloud:', error);
        }
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

// Delete Records by Date
function deleteRecordsByDate() {
    const dateInput = document.getElementById('delete-date').value;
    
    if (!dateInput) {
        alert('Please select a date to delete records!');
        return;
    }
    
    const dateToDelete = new Date(dateInput).toLocaleDateString();
    const recordsToDelete = attendanceRecords.filter(r => r.date === dateToDelete);
    
    if (recordsToDelete.length === 0) {
        alert(`No records found for ${dateToDelete}`);
        return;
    }
    
    const confirmMsg = `Found ${recordsToDelete.length} record(s) for ${dateToDelete}.\n\nAre you sure you want to delete these records?\n\nThis action cannot be undone!`;
    
    if (confirm(confirmMsg)) {
        deleteRecordsByDateFromCloud(dateToDelete);
        
        attendanceRecords = attendanceRecords.filter(r => r.date !== dateToDelete);
        saveRecords();
        displayRecords();
        updateStats();
        populateClusterFilter();
        
        alert(`Successfully deleted ${recordsToDelete.length} record(s) for ${dateToDelete}`);
        document.getElementById('delete-date').value = '';
    }
}

// Clear All Records with Enhanced Warning
function clearAllRecords() {
    const totalRecords = attendanceRecords.length;
    
    if (totalRecords === 0) {
        alert('No records to delete!');
        return;
    }
    
    const warningMsg = `⚠️ WARNING: DELETE ALL RECORDS ⚠️\n\nYou are about to permanently delete:\n• Total Records: ${totalRecords}\n\nThis will remove ALL attendance data from the system.\n\nThis action CANNOT be undone!\n\nAre you absolutely sure you want to continue?`;
    
    if (confirm(warningMsg)) {
        const finalConfirm = confirm(`FINAL CONFIRMATION:\n\nDelete all ${totalRecords} records?\n\nClick OK to permanently delete all data.`);
        
        if (finalConfirm) {
            clearAllRecordsFromCloud();
            
            attendanceRecords = [];
            saveRecords();
            updateStats();
            populateClusterFilter();
            displayRecords();
            
            alert('All records have been deleted successfully.');
        }
    }
}

// Display Functions
function displayRecords(filteredRecords = null) {
    const recordsList = document.getElementById('records-list');
    const records = filteredRecords || attendanceRecords;
    
    currentDisplayedRecords = records;
    
    if (records.length === 0) {
        recordsList.innerHTML = '<p class="empty-state">No attendance records found.</p>';
        return;
    }
    
    recordsList.innerHTML = records.map(record => `
        <div class="record-item ${record.isVisitor ? 'visitor-record' : ''}">
            <h4>${record.name} ${record.isVisitor ? '👤' : ''}</h4>
            <p><strong>Cluster:</strong> ${record.cluster}</p>
            ${record.isVisitor ? `<p><strong>Visitor Type:</strong> ${record.visitorType || 'N/A'}</p>` : ''}
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
    const clusters = [...new Set(attendanceRecords.map(r => r.cluster.trim()).filter(c => c !== 'VISITOR'))].sort();
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

// Filter Records
function filterRecords() {
    const dateFilter = document.getElementById('filter-date').value;
    const clusterFilter = document.getElementById('filter-cluster').value;
    const serviceFilter = document.getElementById('filter-service').value;
    
    let filtered = attendanceRecords.slice();
    
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

// Export to CSV - Sorted by Cluster then Name
function exportToCSV() {
    const dateFilter = document.getElementById('filter-date').value;
    const clusterFilter = document.getElementById('filter-cluster').value;
    const serviceFilter = document.getElementById('filter-service').value;
    
    let recordsToExport = attendanceRecords.slice();
    
    if (dateFilter) {
        const filterDate = new Date(dateFilter).toLocaleDateString();
        recordsToExport = recordsToExport.filter(r => r.date === filterDate);
    }
    
    if (clusterFilter) {
        recordsToExport = recordsToExport.filter(r => r.cluster.trim() === clusterFilter.trim());
    }
    
    if (serviceFilter) {
        recordsToExport = recordsToExport.filter(r => r.serviceType === serviceFilter);
    }
    
    if (recordsToExport.length === 0) {
        alert('No records to export!');
        return;
    }
    
    // Sort by Cluster (alphabetically) then by Name (alphabetically)
    recordsToExport.sort((a, b) => {
        const clusterCompare = a.cluster.localeCompare(b.cluster);
        if (clusterCompare !== 0) {
            return clusterCompare;
        }
        return a.name.localeCompare(b.name);
    });
    
    const headers = ['Name', 'Cluster', 'Service Type', 'Date', 'Time', 'Visitor Type'];
    const rows = recordsToExport.map(r => [
        r.name, 
        r.cluster, 
        r.serviceType || 'N/A', 
        r.date, 
        r.time,
        r.isVisitor ? (r.visitorType || 'Visitor') : 'Member'
    ]);
    
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.join(',') + '\n';
    });
    
    let filename = 'attendance';
    
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
                downloadBlob(blob, filename);
            });
            return;
        }
    }
    
    downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Generate Report Function
function generateReport() {
    const dateInput = document.getElementById('report-date').value;
    const serviceFilter = document.getElementById('report-service').value;
    
    if (!dateInput) {
        alert('Please select a date!');
        return;
    }
    
    const reportDate = new Date(dateInput).toLocaleDateString();
    let filtered = attendanceRecords.filter(r => r.date === reportDate);
    
    if (serviceFilter) {
        filtered = filtered.filter(r => r.serviceType === serviceFilter);
    }
    
    if (filtered.length === 0) {
        document.getElementById('report-content').innerHTML = '<p class="empty-state">No attendance records found for the selected date and service type.</p>';
        return;
    }
    
    // Separate members and visitors
    const members = filtered.filter(r => !r.isVisitor);
    const visitors = filtered.filter(r => r.isVisitor);
    
    // Group members by cluster
    const clusterGroups = {};
    members.forEach(record => {
        if (!clusterGroups[record.cluster]) {
            clusterGroups[record.cluster] = [];
        }
        clusterGroups[record.cluster].push(record);
    });
    
    // Count visitors by type
    const visitorCounts = {
        'Other Locale': visitors.filter(v => v.visitorType === 'Other Locale').length,
        'Visitor': visitors.filter(v => v.visitorType === 'Visitor').length,
        'Balik-loob': visitors.filter(v => v.visitorType === 'Balik-loob').length
    };
    
    // Build report HTML
    let reportHTML = `
        <div class="report-header">
            <h3>Attendance Report</h3>
            <p><strong>Date:</strong> ${reportDate}</p>
            <p><strong>Service:</strong> ${serviceFilter || 'All Services'}</p>
            <p><strong>Total Attendance:</strong> ${filtered.length}</p>
        </div>
        
        <h4 style="margin-top: 25px; margin-bottom: 15px;">Summary by Cluster</h4>
        <table class="report-table">
            <thead>
                <tr>
                    <th>Cluster</th>
                    <th>Count</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add member clusters
    Object.keys(clusterGroups).sort().forEach(cluster => {
        reportHTML += `
            <tr>
                <td>${cluster}</td>
                <td>${clusterGroups[cluster].length}</td>
            </tr>
        `;
    });
    
    // Add visitor rows
    if (visitorCounts['Other Locale'] > 0) {
        reportHTML += `
            <tr>
                <td>Other Locale</td>
                <td>${visitorCounts['Other Locale']}</td>
            </tr>
        `;
    }
    if (visitorCounts['Visitor'] > 0) {
        reportHTML += `
            <tr>
                <td>Visitor</td>
                <td>${visitorCounts['Visitor']}</td>
            </tr>
        `;
    }
    if (visitorCounts['Balik-loob'] > 0) {
        reportHTML += `
            <tr>
                <td>Balik-loob</td>
                <td>${visitorCounts['Balik-loob']}</td>
            </tr>
        `;
    }
    
    reportHTML += `
            </tbody>
        </table>
        
        <h4 style="margin-top: 30px; margin-bottom: 15px;">Detailed Attendance List</h4>
    `;
    
    // Add detailed lists by cluster
    Object.keys(clusterGroups).sort().forEach(cluster => {
        const sortedMembers = clusterGroups[cluster].sort((a, b) => a.name.localeCompare(b.name));
        
        reportHTML += `
            <div class="cluster-section">
                <h5>${cluster} (${sortedMembers.length})</h5>
                <ul class="attendee-list">
        `;
        
        sortedMembers.forEach(record => {
            reportHTML += `<li>${record.name}</li>`;
        });
        
        reportHTML += `
                </ul>
            </div>
        `;
    });
    
    // Add visitors section
    if (visitors.length > 0) {
        const sortedVisitors = visitors.sort((a, b) => a.name.localeCompare(b.name));
        
        reportHTML += `
            <div class="cluster-section">
                <h5>VISITORS (${visitors.length})</h5>
                <ul class="attendee-list">
        `;
        
        sortedVisitors.forEach(record => {
            reportHTML += `<li>${record.name} - <em>${record.visitorType}</em></li>`;
        });
        
        reportHTML += `
                </ul>
            </div>
        `;
    }
    
    document.getElementById('report-content').innerHTML = reportHTML;
}

// Print Report Function
function printReport() {
    const reportContent = document.getElementById('report-content').innerHTML;
    
    if (!reportContent || reportContent.includes('empty-state')) {
        alert('Please generate a report first!');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Attendance Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h3, h4, h5 { color: #333; }
                .report-header { margin-bottom: 20px; border-bottom: 2px solid #2196F3; padding-bottom: 10px; }
                .report-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .report-table th { background: #2196F3; color: white; padding: 10px; text-align: left; }
                .report-table td { border: 1px solid #ddd; padding: 8px; }
                .cluster-section { margin-bottom: 20px; page-break-inside: avoid; }
                .attendee-list { list-style: none; padding: 0; column-count: 2; }
                .attendee-list li { padding: 5px 0; }
                @media print {
                    body { padding: 10px; }
                }
            </style>
        </head>
        <body>
            ${reportContent}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// QR Code Generation
function generateQR() {
    const name = document.getElementById('employee-name').value.trim();
    const cluster = document.getElementById('employee-cluster').value.trim();
    
    if (!name || !cluster) {
        alert('Please enter name and select cluster!');
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
    if (!canvas) return;
    
    const name = document.getElementById('employee-name').value.trim();
    const filename = `QR_${name.replace(/\s+/g, '_')}.png`;
    
    canvas.toBlob((blob) => {
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
                    downloadBlobFromCanvas(blob, filename);
                });
                return;
            }
        }
        
        downloadBlobFromCanvas(blob, filename);
    }, 'image/png');
}

function downloadBlobFromCanvas(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
