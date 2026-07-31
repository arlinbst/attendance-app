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
    initializeFirebase().then(() => {
        loadRecordsFromCloud();
        loadMembersFromCloud(); // Load member master data
    }).catch(() => {
        loadRecords();
        updateStats();
    });
    
    // Initialize member type field visibility
    switchMemberType();
    
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
            
            logAttendance(data.name, data.cluster, serviceType, data.category);
            
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
function logAttendance(name, cluster, serviceType, category) {
    const record = {
        name: name.trim(),
        cluster: cluster.trim(),
        serviceType: serviceType,
        category: category || 'N/A',
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
        category: visitorType,
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
            <p><strong>Category:</strong> ${record.category || record.visitorType || 'N/A'}</p>
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
    
    const headers = ['Name', 'Cluster', 'Category', 'Service Type', 'Date', 'Time', 'Type'];
    const rows = recordsToExport.map(r => [
        r.name, 
        r.cluster, 
        r.category || r.visitorType || 'N/A',
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
    const visitorTypes = [...new Set(visitors.map(v => v.visitorType))];
    const visitorCounts = {};
    visitorTypes.forEach(type => {
        visitorCounts[type] = visitors.filter(v => v.visitorType === type).length;
    });
    
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
    Object.keys(visitorCounts).sort().forEach(type => {
        if (visitorCounts[type] > 0) {
            reportHTML += `
                <tr>
                    <td>${type}</td>
                    <td>${visitorCounts[type]}</td>
                </tr>
            `;
        }
    });
    
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
            reportHTML += `<li>${record.name} - <em>${record.category || 'N/A'}</em></li>`;
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
    const category = document.getElementById('employee-category').value.trim();
    
    if (!name || !cluster || !category) {
        alert('Please fill in all fields (Name, Cluster, and Category)!');
        return;
    }
    
    const data = JSON.stringify({ name, cluster, category });
    
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
    document.getElementById('qr-cluster').textContent = cluster;
    document.getElementById('qr-category').textContent = category;
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

// ============================================
// MEMBER MANAGEMENT SYSTEM
// ============================================

let membersData = [];
let visitorsData = [];
let currentMemberType = 'members';
let currentEditingId = null;

// Switch between Members and Visitors
function switchMemberType() {
    const selectedType = document.querySelector('input[name="member-type"]:checked').value;
    currentMemberType = selectedType;
    
    // Show/hide fields based on type
    const categoryField = document.getElementById('category-field');
    const visitorTypeField = document.getElementById('visitor-type-field');
    const statusField = document.getElementById('status-field');
    
    if (currentMemberType === 'members') {
        // Members: Show Category and Status, Hide Visitor Type
        categoryField.style.display = 'block';
        statusField.style.display = 'block';
        visitorTypeField.style.display = 'none';
        document.getElementById('member-category').required = true;
        document.getElementById('member-status').required = true;
        document.getElementById('member-visitor-type').required = false;
    } else {
        // Visitors: Hide Category and Status, Show Visitor Type
        categoryField.style.display = 'none';
        statusField.style.display = 'none';
        visitorTypeField.style.display = 'block';
        document.getElementById('member-category').required = false;
        document.getElementById('member-status').required = false;
        document.getElementById('member-visitor-type').required = true;
    }
    
    clearSearch();
    updateMemberStats();
}

// Search for member by name
function searchMember() {
    const searchName = document.getElementById('search-name').value.trim().toLowerCase();
    
    if (!searchName) {
        alert('Please enter a name to search!');
        return;
    }
    
    const dataSource = currentMemberType === 'members' ? membersData : visitorsData;
    const results = dataSource.filter(member => 
        member.name.toLowerCase().includes(searchName)
    );
    
    const resultsDiv = document.getElementById('results-list');
    const searchResults = document.getElementById('search-results');
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<p class="empty-state">No members found matching your search.</p>';
        searchResults.style.display = 'block';
    } else {
        resultsDiv.innerHTML = results.map(member => {
            if (currentMemberType === 'members') {
                return `
                    <div class="result-item" onclick="viewMember('${member.id}')">
                        <h4>${member.name}</h4>
                        <p><strong>Cluster:</strong> ${member.cluster}</p>
                        <p><strong>Category:</strong> ${member.category}</p>
                        <p><strong>Status:</strong> <span class="status-badge ${member.status.toLowerCase().replace(' ', '-')}">${member.status}</span></p>
                    </div>
                `;
            } else {
                return `
                    <div class="result-item" onclick="viewMember('${member.id}')">
                        <h4>${member.name}</h4>
                        <p><strong>Cluster:</strong> ${member.cluster}</p>
                        <p><strong>Visitor Type:</strong> ${member.visitorType || 'N/A'}</p>
                    </div>
                `;
            }
        }).join('');
        searchResults.style.display = 'block';
    }
}

// View member details
function viewMember(memberId) {
    const dataSource = currentMemberType === 'members' ? membersData : visitorsData;
    const member = dataSource.find(m => m.id === memberId);
    
    if (member) {
        currentEditingId = memberId;
        document.getElementById('member-id').value = memberId;
        document.getElementById('member-name').value = member.name;
        document.getElementById('member-birthday').value = member.birthday || '';
        document.getElementById('member-contact').value = member.contactNumber || '';
        document.getElementById('member-cluster').value = member.cluster;
        
        if (currentMemberType === 'members') {
            document.getElementById('member-category').value = member.category;
            document.getElementById('member-status').value = member.status;
        } else {
            document.getElementById('member-visitor-type').value = member.visitorType || '';
        }
        
        document.getElementById('form-title').textContent = 'Edit Member Information';
        document.getElementById('delete-btn').style.display = 'inline-block';
        document.getElementById('member-details-section').style.display = 'block';
        
        // Scroll to form
        document.getElementById('member-details-section').scrollIntoView({ behavior: 'smooth' });
    }
}

// Add new member
function addNewMember() {
    currentEditingId = null;
    document.getElementById('member-id').value = '';
    document.getElementById('member-name').value = '';
    document.getElementById('member-birthday').value = '';
    document.getElementById('member-contact').value = '';
    document.getElementById('member-cluster').value = '';
    document.getElementById('member-category').value = '';
    document.getElementById('member-status').value = 'Active';
    document.getElementById('member-visitor-type').value = '';
    
    document.getElementById('form-title').textContent = 'Add New Member';
    document.getElementById('delete-btn').style.display = 'none';
    document.getElementById('member-details-section').style.display = 'block';
    
    // Scroll to form
    document.getElementById('member-details-section').scrollIntoView({ behavior: 'smooth' });
}

// Save member (Add or Update)
async function saveMember() {
    const name = document.getElementById('member-name').value.trim();
    const birthday = document.getElementById('member-birthday').value;
    const contactNumber = document.getElementById('member-contact').value.trim();
    const cluster = document.getElementById('member-cluster').value;
    
    let memberData = {
        name: name,
        birthday: birthday,
        contactNumber: contactNumber,
        cluster: cluster,
        type: currentMemberType,
        updatedAt: new Date().toISOString()
    };
    
    // Add type-specific fields
    if (currentMemberType === 'members') {
        const category = document.getElementById('member-category').value;
        const status = document.getElementById('member-status').value;
        
        // Validation for members
        if (!name || !birthday || !contactNumber || !cluster || !category || !status) {
            alert('Please fill in all fields!');
            return;
        }
        
        memberData.category = category;
        memberData.status = status;
    } else {
        const visitorType = document.getElementById('member-visitor-type').value;
        
        // Validation for visitors
        if (!name || !birthday || !contactNumber || !cluster || !visitorType) {
            alert('Please fill in all fields!');
            return;
        }
        
        memberData.visitorType = visitorType;
    }
    
    try {
        if (currentEditingId) {
            // Update existing member
            if (firebaseInitialized && db) {
                await db.collection('members').doc(currentEditingId).update(memberData);
            }
            alert('Member information updated successfully!');
        } else {
            // Add new member
            memberData.createdAt = new Date().toISOString();
            if (firebaseInitialized && db) {
                await db.collection('members').add(memberData);
            }
            alert('New member added successfully!');
        }
        
        // Reload members and clear form
        loadMembersFromCloud();
        cancelEdit();
        clearSearch();
        
    } catch (error) {
        console.error('Error saving member:', error);
        alert('Error saving member: ' + error.message);
    }
}

// Delete member
async function deleteMember() {
    if (!currentEditingId) return;
    
    const member = document.getElementById('member-name').value;
    const confirmMsg = `Are you sure you want to delete the member record for:\n\n${member}?\n\nThis action cannot be undone!`;
    
    if (confirm(confirmMsg)) {
        try {
            if (firebaseInitialized && db) {
                await db.collection('members').doc(currentEditingId).delete();
            }
            
            alert('Member deleted successfully!');
            loadMembersFromCloud();
            cancelEdit();
            clearSearch();
            
        } catch (error) {
            console.error('Error deleting member:', error);
            alert('Error deleting member: ' + error.message);
        }
    }
}

// Cancel edit
function cancelEdit() {
    currentEditingId = null;
    document.getElementById('member-details-section').style.display = 'none';
    document.getElementById('member-id').value = '';
    document.getElementById('member-name').value = '';
    document.getElementById('member-birthday').value = '';
    document.getElementById('member-contact').value = '';
    document.getElementById('member-cluster').value = '';
    document.getElementById('member-category').value = '';
    document.getElementById('member-status').value = '';
    document.getElementById('member-visitor-type').value = '';
}

// Clear search
function clearSearch() {
    document.getElementById('search-name').value = '';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('results-list').innerHTML = '';
}

// Load members from Firebase
async function loadMembersFromCloud() {
    if (firebaseInitialized && db) {
        try {
            const snapshot = await db.collection('members').get();
            membersData = [];
            visitorsData = [];
            
            snapshot.forEach((doc) => {
                const data = { id: doc.id, ...doc.data() };
                if (data.type === 'members') {
                    membersData.push(data);
                } else {
                    visitorsData.push(data);
                }
            });
            
            updateMemberStats();
            console.log('Members loaded:', membersData.length, 'Visitors:', visitorsData.length);
            
        } catch (error) {
            console.error('Error loading members:', error);
        }
    }
}

// Update member statistics
function updateMemberStats() {
    document.getElementById('total-members').textContent = membersData.length;
    document.getElementById('total-visitors').textContent = visitorsData.length;
}

// Export to Excel Function
function exportToExcel() {
    const clusterFilter = document.getElementById('export-cluster-filter').value;
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Filter data by cluster if not "ALL"
    let filteredMembers = membersData;
    let filteredVisitors = visitorsData;
    
    if (clusterFilter !== 'ALL') {
        filteredMembers = membersData.filter(m => m.cluster === clusterFilter);
        filteredVisitors = visitorsData.filter(v => v.cluster === clusterFilter);
    }
    
    // Sort by name
    filteredMembers.sort((a, b) => a.name.localeCompare(b.name));
    filteredVisitors.sort((a, b) => a.name.localeCompare(b.name));
    
    // Calculate category totals for members
    const categoryTotals = {
        'Pastoral': 0,
        'Elder': 0,
        'Adult': 0,
        'Youth': 0,
        'Cadets': 0
    };
    
    filteredMembers.forEach(member => {
        if (categoryTotals.hasOwnProperty(member.category)) {
            categoryTotals[member.category]++;
        }
    });
    
    // Calculate visitor type totals
    const visitorTypeTotals = {};
    filteredVisitors.forEach(visitor => {
        const vType = visitor.visitorType || 'N/A';
        visitorTypeTotals[vType] = (visitorTypeTotals[vType] || 0) + 1;
    });
    
    // Build CSV content
    let csvContent = '';
    
    // Header
    csvContent += '\"UP Diliman Locale Active Members Information List\"\\n';
    csvContent += `\"As of ${currentDate}\"\\n`;
    if (clusterFilter !== 'ALL') {
        csvContent += `\"Cluster: ${clusterFilter}\"\\n`;
    }
    csvContent += '\\n';
    
    // Members Section
    csvContent += '\"=== REGULAR MEMBERS ===\"\\n';
    csvContent += '\"Name\",\"Cluster\",\"Category\",\"Status\"\\n';
    
    filteredMembers.forEach(member => {
        csvContent += `\"${member.name}\",\"${member.cluster}\",\"${member.category}\",\"${member.status}\"\\n`;
    });
    
    csvContent += '\\n';
    csvContent += `\"Total Members: ${filteredMembers.length}\"\\n`;
    csvContent += '\\n';
    
    // Members Category Summary
    csvContent += '\"Members by Category:\"\\n';
    Object.keys(categoryTotals).forEach(category => {
        csvContent += `\"${category}\",\"${categoryTotals[category]}\"\\n`;
    });
    
    csvContent += '\\n';
    csvContent += '\"=====================================\"\\n';
    csvContent += '\\n';
    
    // Visitors Section
    csvContent += '\"=== VISITORS ===\"\\n';
    csvContent += '\"Name\",\"Cluster\",\"Visitor Type\"\\n';
    
    filteredVisitors.forEach(visitor => {
        csvContent += `\"${visitor.name}\",\"${visitor.cluster}\",\"${visitor.visitorType || 'N/A'}\"\\n`;
    });
    
    csvContent += '\\n';
    csvContent += `\"Total Visitors: ${filteredVisitors.length}\"\\n`;
    csvContent += '\\n';
    
    // Visitors Type Summary
    csvContent += '\"Visitors by Type:\"\\n';
    Object.keys(visitorTypeTotals).forEach(type => {
        csvContent += `\"${type}\",\"${visitorTypeTotals[type]}\"\\n`;
    });
    
    csvContent += '\\n';
    csvContent += '\"=====================================\"\\n';
    csvContent += '\\n';
    
    // Grand Totals
    csvContent += '\"SUMMARY\"\\n';
    csvContent += `\"Total Members:\",\"${filteredMembers.length}\"\\n`;
    csvContent += `\"Total Visitors:\",\"${filteredVisitors.length}\"\\n`;
    csvContent += `\"Grand Total:\",\"${filteredMembers.length + filteredVisitors.length}\"\\n`;
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    let filename = 'UP_Diliman_Members_Report';
    if (clusterFilter !== 'ALL') {
        filename += `_${clusterFilter.replace(/\\s+/g, '_')}`;
    }
    filename += `_${new Date().toISOString().split('T')[0]}.csv`;
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    alert(`Report exported successfully!\\n\\nMembers: ${filteredMembers.length}\\nVisitors: ${filteredVisitors.length}\\nTotal: ${filteredMembers.length + filteredVisitors.length}`);
