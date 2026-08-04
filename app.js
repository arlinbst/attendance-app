// Attendance Monitoring App
let html5QrcodeScanner = null;
let attendanceRecords = [];
let currentQRCode = null;
let isProcessingScan = false;
let lastScannedData = null;
let lastScanTime = 0;
let currentDisplayedRecords = [];
let currentCamera = "environment"; // Track current camera: "environment" (back) or "user" (front)

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
    console.log('✅ Page loaded - initializing...');
    console.log('📱 Device:', navigator.userAgent);
    
    // STEP 1: Load from localStorage first (instant display if data exists)
    loadRecords();
    loadMembersFromLocalStorage(); // Load members/visitors from localStorage
    
    // STEP 2: Initialize Firebase (onSnapshot will auto-sync from cloud)
    initializeFirebase().then(() => {
        console.log('✅ Firebase connected - real-time sync active');
        loadMembersFromCloud(); // Load member master data from cloud
    }).catch((error) => {
        console.error('❌ Firebase failed:', error);
        console.log('⚠️ App will work in offline mode only');
    });
    
    // Initialize member type field visibility after small delay to ensure DOM is ready
    setTimeout(() => {
        try {
            if (document.getElementById('category-field')) {
                switchMemberType();
                console.log('✅ Member type initialized');
            }
        } catch (error) {
            console.log('⚠️ Member type initialization skipped:', error);
        }
    }, 100);
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ Service Worker registration failed:', err));
    }
});

// Tab switching
function showTab(tabName) {
    console.log('Switching to tab:', tabName);
    
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
        { facingMode: currentCamera },
        config,
        onScanSuccess,
        onScanError
    ).then(() => {
        console.log('✅ Scanner started with camera:', currentCamera);
        document.getElementById('start-scan-btn').style.display = 'none';
        document.getElementById('stop-scan-btn').style.display = 'inline-block';
        const flipBtn = document.getElementById('camera-flip-btn');
        flipBtn.style.display = 'flex';
        console.log('✅ Camera flip button shown');
        document.getElementById('scan-result').style.display = 'none';
    }).catch(err => {
        console.error('❌ Error starting camera:', err);
        alert('Error starting camera: ' + err);
    });
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
            document.getElementById('start-scan-btn').style.display = 'inline-block';
            document.getElementById('stop-scan-btn').style.display = 'none';
            document.getElementById('camera-flip-btn').style.display = 'none';
        }).catch(err => {
            console.error('Error stopping scanner:', err);
        });
    }
}

// Flip camera between front and back
function flipCamera() {
    console.log('🔄 Flipping camera from:', currentCamera);
    
    if (!html5QrcodeScanner) {
        console.error('❌ No active scanner');
        return;
    }
    
    // Toggle camera
    currentCamera = currentCamera === "environment" ? "user" : "environment";
    console.log('🔄 Switching to:', currentCamera);
    
    // Stop current scanner
    html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner = null;
        console.log('✅ Scanner stopped, restarting with new camera');
        // Restart with new camera
        startScanner();
    }).catch(err => {
        console.error('❌ Error flipping camera:', err);
        alert('Error switching camera. Please try again.');
    });
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
async function logAttendance(name, cluster, serviceType, category) {
    const record = {
        name: name.trim(),
        cluster: cluster.trim(),
        serviceType: serviceType,
        category: category || 'N/A',
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        isVisitor: false,
        scannedAt: new Date().toISOString() // Add timestamp when scanned
    };
    
    console.log('📝 Logging attendance:', record);
    
    // Save to cloud (this now handles adding to local array too)
    await saveRecordToCloud(record);
}

// Add Visitor Function
async function addVisitor() {
    const name = document.getElementById('visitor-name').value.trim();
    const visitorType = document.getElementById('visitor-type').value;
    const visitorCluster = document.getElementById('visitor-cluster').value.trim();
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
    
    // Use the selected cluster value directly, even if empty (for "No Cluster")
    // If truly empty, use 'No Cluster' as the display value
    const clusterValue = visitorCluster || 'No Cluster';
    
    console.log('📝 Visitor Cluster Debug:');
    console.log('   Selected from dropdown:', visitorCluster);
    console.log('   Final cluster value:', clusterValue);
    console.log('   Service Type:', serviceType);
    
    const record = {
        name: name,
        cluster: clusterValue,
        serviceType: serviceType,
        category: visitorType,
        timestamp: new Date().toISOString(),
        date: today,
        time: new Date().toLocaleTimeString(),
        isVisitor: true,
        visitorType: visitorType,
        scannedAt: new Date().toISOString() // Add timestamp when added
    };
    
    console.log('📝 Adding visitor:', record);
    
    // Save to cloud (this now handles adding to local array too)
    await saveRecordToCloud(record);
    
    // Show success message
    document.getElementById('visitor-result-name').textContent = name;
    document.getElementById('visitor-result-type').textContent = visitorType;
    document.getElementById('visitor-result-cluster').textContent = clusterValue;
    document.getElementById('visitor-result-service').textContent = serviceType;
    document.getElementById('visitor-result-time').textContent = new Date().toLocaleString();
    document.getElementById('visitor-result').style.display = 'block';
    
    // Clear form
    document.getElementById('visitor-name').value = '';
    document.getElementById('visitor-cluster').value = '';
    
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
        console.log('✅ Firebase initialized successfully');
        
        // Real-time listener for attendance records (syncs across all devices)
        db.collection('attendance').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
            const recordCount = snapshot.size;
            console.log('📡 Firebase snapshot update');
            console.log('   Server records:', recordCount);
            console.log('   Local records before sync:', attendanceRecords.length);
            
            attendanceRecords = [];
            snapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            
            console.log('✅ Synced from Firebase:', attendanceRecords.length, 'records');
            
            // Update UI
            displayRecords();
            updateStats();
            populateClusterFilter();
            
            // Save to localStorage as backup for offline access
            localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
            console.log('💾 Saved to localStorage as backup');
        }, (error) => {
            console.error('❌ Firebase listener error:', error);
            console.log('⚠️ Real-time sync interrupted. App will use cached data.');
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
            const docRef = await db.collection('attendance').add(record);
            console.log('✅ Record saved to Firebase with ID:', docRef.id);
            
            // Firebase onSnapshot listener will automatically update the array
            // No need to manually add here - just save to localStorage as backup
            saveRecords();
            
            return docRef.id;
        } catch (error) {
            console.error('❌ Error saving to Firebase:', error);
            alert('⚠️ Warning: Could not save to cloud.\nData saved locally only.\n\nPlease check your internet connection.');
            
            // Fallback: save locally
            const tempRecord = { id: 'local_' + Date.now(), ...record };
            attendanceRecords.unshift(tempRecord);
            saveRecords();
            displayRecords();
            updateStats();
            populateClusterFilter();
            return null;
        }
    } else {
        console.log('⚠️ Firebase not initialized, saving locally only');
        
        // Save locally when Firebase is not available
        const tempRecord = { id: 'local_' + Date.now(), ...record };
        attendanceRecords.unshift(tempRecord);
        saveRecords();
        displayRecords();
        updateStats();
        populateClusterFilter();
        return null;
    }
}

async function loadRecordsFromCloud() {
    // This function is kept for manual recovery via recoverData()
    // Normal operation uses the onSnapshot listener in initializeFirebase()
    if (firebaseInitialized && db) {
        try {
            console.log('🔄 Manual reload from Firebase...');
            const snapshot = await db.collection('attendance').orderBy('timestamp', 'desc').get();
            attendanceRecords = [];
            snapshot.forEach((doc) => {
                attendanceRecords.push({ id: doc.id, ...doc.data() });
            });
            console.log('✅ Manual reload complete:', attendanceRecords.length, 'records');
            displayRecords();
            updateStats();
            populateClusterFilter();
            
            // Save to localStorage as backup
            localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
        } catch (error) {
            console.error('❌ Error loading from cloud:', error);
            console.log('⚠️ Falling back to localStorage...');
            loadRecords();
        }
    } else {
        console.log('⚠️ Firebase not initialized, loading from localStorage');
        loadRecords();
    }
}

async function deleteRecordsByDateFromCloud(dateToDelete, serviceTypeToDelete = null) {
    if (firebaseInitialized && db) {
        try {
            console.log('🗑️ Deleting records from Firebase for date:', dateToDelete, 'service type:', serviceTypeToDelete || 'All Services');
            const batch = db.batch();
            const snapshot = await db.collection('attendance').get();
            let deleteCount = 0;
            
            snapshot.docs.forEach((doc) => {
                const record = doc.data();
                // Filter by date and optionally by service type
                const matchesDate = record.date === dateToDelete;
                const matchesService = !serviceTypeToDelete || record.serviceType === serviceTypeToDelete;
                
                if (matchesDate && matchesService) {
                    batch.delete(doc.ref);
                    deleteCount++;
                }
            });
            
            await batch.commit();
            console.log('✅ Deleted', deleteCount, 'records from Firebase');
            return deleteCount;
        } catch (error) {
            console.error('❌ Error deleting records from Firebase:', error);
            throw error;
        }
    } else {
        console.log('⚠️ Firebase not initialized, deleting locally only');
        return 0;
    }
}

async function clearAllRecordsFromCloud() {
    if (firebaseInitialized && db) {
        try {
            console.log('❌ Clearing ALL records from Firebase...');
            const batch = db.batch();
            const snapshot = await db.collection('attendance').get();
            const deleteCount = snapshot.size;
            
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            console.log('✅ Cleared', deleteCount, 'records from Firebase');
            return deleteCount;
        } catch (error) {
            console.error('❌ Error clearing Firebase records:', error);
            throw error;
        }
    } else {
        console.log('⚠️ Firebase not initialized, clearing locally only');
        return 0;
    }
}

// Local Storage Functions
function saveRecords() {
    localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
    console.log('Records saved to localStorage:', attendanceRecords.length);
}

function loadRecords() {
    const saved = localStorage.getItem('attendanceRecords');
    if (saved) {
        try {
            attendanceRecords = JSON.parse(saved);
            console.log('📂 Loaded from localStorage:', attendanceRecords.length, 'records');
            displayRecords();
            updateStats();
            populateClusterFilter();
        } catch (error) {
            console.error('❌ Error parsing localStorage data:', error);
            attendanceRecords = [];
        }
    } else {
        console.log('No records found in localStorage');
        attendanceRecords = [];
    }
}

// Manual data recovery function
function recoverData() {
    console.log('=== DATA RECOVERY ===');
    
    // Try localStorage first
    const localData = localStorage.getItem('attendanceRecords');
    if (localData) {
        try {
            const parsed = JSON.parse(localData);
            console.log('Found in localStorage:', parsed.length, 'records');
            attendanceRecords = parsed;
            displayRecords();
            updateStats();
            populateClusterFilter();
            alert(`Recovered ${parsed.length} records from local storage!`);
            return;
        } catch (e) {
            console.error('localStorage data corrupted:', e);
        }
    }
    
    // Try reloading from Firebase
    if (firebaseInitialized && db) {
        loadRecordsFromCloud().then(() => {
            alert(`Loaded ${attendanceRecords.length} records from Firebase!`);
        }).catch((error) => {
            console.error('Firebase reload failed:', error);
            alert('Could not recover data from Firebase. Check console for details.');
        });
    } else {
        alert('No data found in localStorage and Firebase is not connected.');
    }
}

// DELETE RECORDS FOR SELECTED DATE (with strong warning)
async function deleteRecordsForDate() {
    const dateInput = document.getElementById('report-date').value;
    const serviceTypeInput = document.getElementById('report-service').value;
    
    if (!dateInput) {
        alert('⚠️ Please select a date first!');
        return;
    }
    
    const deleteDate = dateInput; // Already in local date format from selectReportDate
    const deleteServiceType = serviceTypeInput; // Empty string means "All Services"
    
    // Count records for this date and service type
    let recordsToDelete;
    if (deleteServiceType) {
        // Specific service type
        recordsToDelete = attendanceRecords.filter(r => r.date === deleteDate && r.serviceType === deleteServiceType);
    } else {
        // All services for this date
        recordsToDelete = attendanceRecords.filter(r => r.date === deleteDate);
    }
    
    if (recordsToDelete.length === 0) {
        const serviceMsg = deleteServiceType ? ` (${deleteServiceType})` : ' (All Services)';
        alert(`ℹ️ No records found for ${deleteDate}${serviceMsg}\n\nNothing to delete.`);
        return;
    }
    
    // Build service type display string
    const serviceDisplay = deleteServiceType ? deleteServiceType : 'All Services';
    
    // FIRST WARNING - Show what will be deleted
    const confirmed1 = confirm(
        `⚠️ DELETE CONFIRMATION\n` +
        `═══════════════════════════════\n\n` +
        `You are about to DELETE ${recordsToDelete.length} record(s) for:\n\n` +
        `📅 Date: ${deleteDate}\n` +
        `🎯 Service Type: ${serviceDisplay}\n\n` +
        `This action CANNOT be undone!\n\n` +
        `Do you want to proceed?`
    );
    
    if (!confirmed1) {
        console.log('❌ Delete cancelled by user');
        return;
    }
    
    // SECOND WARNING - Final confirmation
    const confirmed2 = confirm(
        `🚨 FINAL CONFIRMATION\n` +
        `═══════════════════════════════\n\n` +
        `Are you ABSOLUTELY SURE you want to\n` +
        `permanently delete ${recordsToDelete.length} records?\n\n` +
        `Date: ${deleteDate}\n` +
        `Service: ${serviceDisplay}\n\n` +
        `This will delete from:\n` +
        `• Cloud database (Firebase)\n` +
        `• Local storage\n` +
        `• All connected devices\n\n` +
        `Click OK to DELETE PERMANENTLY\n` +
        `Click Cancel to keep the data`
    );
    
    if (!confirmed2) {
        console.log('❌ Delete cancelled at final confirmation');
        return;
    }
    
    // Show loading message
    console.log('🗑️ Deleting records for date:', deleteDate, 'service type:', serviceDisplay);
    
    try {
        // Delete from Firebase
        if (firebaseInitialized && db) {
            const deletedCount = await deleteRecordsByDateFromCloud(deleteDate, deleteServiceType);
            console.log('✅ Deleted from Firebase:', deletedCount);
        }
        
        // Delete from local array (onSnapshot will handle this, but do it anyway for immediate feedback)
        const beforeCount = attendanceRecords.length;
        if (deleteServiceType) {
            attendanceRecords = attendanceRecords.filter(r => !(r.date === deleteDate && r.serviceType === deleteServiceType));
        } else {
            attendanceRecords = attendanceRecords.filter(r => r.date !== deleteDate);
        }
        const afterCount = attendanceRecords.length;
        const localDeleted = beforeCount - afterCount;
        
        // Update localStorage
        localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
        
        // Update UI
        displayRecords();
        updateStats();
        populateClusterFilter();
        
        // Clear report content if on Reports tab
        const reportContentElement = document.getElementById('report-content');
        if (reportContentElement) {
            reportContentElement.innerHTML = '<p class="empty-state">Records deleted. Select a new date to generate report.</p>';
        }
        
        // Success message
        const serviceMsg = deleteServiceType ? ` (${deleteServiceType})` : ' (All Services)';
        alert(
            `✅ DELETION SUCCESSFUL\n` +
            `═══════════════════════════════\n\n` +
            `Deleted ${localDeleted} record(s) for:\n` +
            `Date: ${deleteDate}\n` +
            `Service: ${serviceDisplay}\n\n` +
            `The records have been permanently removed\n` +
            `from all devices and cannot be recovered.`
        );
        
        console.log('✅ Delete operation completed successfully');
        
    } catch (error) {
        console.error('❌ Error during delete operation:', error);
        alert(
            `❌ DELETE FAILED\n` +
            `═══════════════════════════════\n\n` +
            `Error: ${error.message}\n\n` +
            `Some records may not have been deleted.\n` +
            `Please check your internet connection\n` +
            `and try again.`
        );
    }
}

// CLEAR ALL RECORDS (with extra strong warning)
async function clearAllRecords() {
    const totalRecords = attendanceRecords.length;
    
    if (totalRecords === 0) {
        alert('ℹ️ No records to delete.\n\nThe database is already empty.');
        return;
    }
    
    // FIRST WARNING - Explain the danger
    const confirmed1 = confirm(
        `🚨 DANGER: CLEAR ALL RECORDS\n` +
        `═══════════════════════════════\n\n` +
        `⚠️ THIS WILL DELETE ALL ${totalRecords} RECORDS!\n\n` +
        `This includes:\n` +
        `• All attendance records\n` +
        `• All scanned QR codes\n` +
        `• All visitor entries\n` +
        `• All dates and times\n\n` +
        `❌ THIS CANNOT BE UNDONE!\n\n` +
        `Are you sure you want to continue?`
    );
    
    if (!confirmed1) {
        console.log('❌ Clear all cancelled by user');
        return;
    }
    
    // SECOND WARNING - Type confirmation
    const typeConfirm = prompt(
        `🚨 FINAL SAFETY CHECK\n` +
        `═══════════════════════════════\n\n` +
        `You are about to PERMANENTLY DELETE\n` +
        `ALL ${totalRecords} attendance records!\n\n` +
        `To confirm, type exactly:\n` +
        `DELETE ALL\n\n` +
        `(Type carefully - case sensitive)`
    );
    
    if (typeConfirm !== 'DELETE ALL') {
        if (typeConfirm !== null) {
            alert('❌ Incorrect confirmation text.\n\nDelete cancelled for your safety.');
        }
        console.log('❌ Clear all cancelled - wrong confirmation text');
        return;
    }
    
    // THIRD WARNING - Last chance
    const confirmed3 = confirm(
        `🚨 LAST CHANCE TO CANCEL\n` +
        `═══════════════════════════════\n\n` +
        `This is your FINAL warning!\n\n` +
        `Clicking OK will:\n` +
        `❌ Delete ALL ${totalRecords} records\n` +
        `❌ Remove from ALL devices\n` +
        `❌ PERMANENTLY destroy the data\n\n` +
        `Click OK to DELETE EVERYTHING\n` +
        `Click Cancel to KEEP your data`
    );
    
    if (!confirmed3) {
        console.log('❌ Clear all cancelled at final warning');
        return;
    }
    
    // Proceed with deletion
    console.log('❌ Clearing ALL records...');
    
    try {
        // Delete from Firebase
        if (firebaseInitialized && db) {
            const deletedCount = await clearAllRecordsFromCloud();
            console.log('✅ Cleared from Firebase:', deletedCount, 'records');
        }
        
        // Clear local array
        const deletedCount = attendanceRecords.length;
        attendanceRecords = [];
        
        // Clear localStorage
        localStorage.setItem('attendanceRecords', JSON.stringify([]));
        
        // Update UI
        displayRecords();
        updateStats();
        populateClusterFilter();
        
        // Clear report content
        document.getElementById('report-content').innerHTML = 
            '<p class="empty-state">All records have been deleted.</p>';
        
        // Success message
        alert(
            `✅ ALL RECORDS DELETED\n` +
            `═══════════════════════════════\n\n` +
            `Successfully deleted ${deletedCount} records.\n\n` +
            `The database is now empty.\n` +
            `All data has been permanently removed\n` +
            `from all devices.`
        );
        
        console.log('✅ Clear all operation completed');
        
    } catch (error) {
        console.error('❌ Error during clear all operation:', error);
        alert(
            `❌ DELETION FAILED\n` +
            `═══════════════════════════════\n\n` +
            `Error: ${error.message}\n\n` +
            `Some records may not have been deleted.\n` +
            `Please check your internet connection\n` +
            `and try again.`
        );
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
    
    console.log('📊 Displaying records:', records.length);
    
    if (records.length === 0) {
        // Show helpful message based on Firebase status
        if (!firebaseInitialized) {
            recordsList.innerHTML = `
                <p class="empty-state">
                    ⏳ <strong>Loading data...</strong><br><br>
                    Connecting to cloud database...<br>
                    Please wait a moment.
                </p>
            `;
        } else {
            recordsList.innerHTML = `
                <p class="empty-state">
                    📭 <strong>No attendance records found.</strong><br><br>
                    Start scanning QR codes to record attendance!<br><br>
                    <small>If you expect to see records, try:<br>
                    • Check your internet connection<br>
                    • <a href="#" onclick="recoverData(); return false;">🔄 Reload from cloud</a></small>
                </p>
            `;
        }
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
    
    console.log('Stats - Today:', todayCount, 'Total:', attendanceRecords.length);
    
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

// Open Date Lookup Modal
function openDateLookup() {
    console.log('📅 Opening date lookup modal...');
    
    // Get unique dates with their service types from attendance records
    const dateServiceMap = {};
    
    attendanceRecords.forEach(record => {
        const date = record.date; // Already in local date format
        const serviceType = record.serviceType;
        
        if (!dateServiceMap[date]) {
            dateServiceMap[date] = new Set();
        }
        dateServiceMap[date].add(serviceType);
    });
    
    // Sort dates in descending order (most recent first)
    const sortedDates = Object.keys(dateServiceMap).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB - dateA; // Descending order
    });
    
    console.log('   Available dates:', sortedDates.length);
    
    let lookupHTML = '';
    
    if (sortedDates.length === 0) {
        lookupHTML = '<p style="text-align: center; color: #666; padding: 40px 20px;">No attendance records found.<br><br>Please scan or add attendance first.</p>';
    } else {
        lookupHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background-color: #2196F3; color: white;">
                        <th style="border: 1px solid #ddd; padding: 12px; text-align: left; width: 50%;">Date</th>
                        <th style="border: 1px solid #ddd; padding: 12px; text-align: left; width: 50%;">Service Type(s)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        sortedDates.forEach((date, index) => {
            const services = Array.from(dateServiceMap[date]).sort();
            const serviceDisplay = services.join(', ');
            const bgColor = index % 2 === 0 ? '#f9f9f9' : 'white';
            
            // Format date for display (convert back to readable format)
            const dateObj = new Date(date);
            const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            
            lookupHTML += `
                <tr style="background: ${bgColor}; cursor: pointer; transition: background 0.3s;" 
                    onmouseover="this.style.background='#e3f2fd'" 
                    onmouseout="this.style.background='${bgColor}'"
                    onclick="selectReportDate('${date}', '${services[0]}')">
                    <td style="border: 1px solid #ddd; padding: 12px;">${formattedDate}</td>
                    <td style="border: 1px solid #ddd; padding: 12px;">${serviceDisplay}</td>
                </tr>
            `;
        });
        
        lookupHTML += `
                </tbody>
            </table>
            <p style="margin-top: 15px; color: #666; font-size: 13px; text-align: center;">
                <em>Click on any date to select it for reporting</em>
            </p>
        `;
    }
    
    document.getElementById('date-lookup-content').innerHTML = lookupHTML;
    document.getElementById('date-lookup-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Close Date Lookup Modal
function closeDateLookup() {
    document.getElementById('date-lookup-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Select Report Date from Lookup
function selectReportDate(date, primaryService) {
    console.log('📅 Date selected:', date, 'Primary service:', primaryService);
    
    // Set the hidden date field (in original format for processing)
    document.getElementById('report-date').value = date;
    
    // Format date for display
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('report-date-display').value = formattedDate;
    
    // Set the service type dropdown to the primary service for that date
    document.getElementById('report-service').value = primaryService;
    
    // Close the modal
    closeDateLookup();
    
    // Show success feedback
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    console.log('✅ Date set to:', formattedDate, '| Service:', primaryService);
}

// Close lookup on ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
        const modal = document.getElementById('date-lookup-modal');
        if (modal && modal.style.display === 'block') {
            closeDateLookup();
        }
    }
});

// Generate Report Function
function generateReport() {
    const dateInput = document.getElementById('report-date').value;
    const serviceFilter = document.getElementById('report-service').value;
    
    if (!dateInput) {
        alert('Please select a date!');
        return;
    }
    
    console.log('📊 Generating report...');
    console.log('   Date input:', dateInput);
    console.log('   Service filter:', serviceFilter || 'All Services');
    console.log('   Total records available:', attendanceRecords.length);
    
    const reportDate = dateInput; // Already in local date format from selectReportDate
    console.log('   Report date:', reportDate);
    
    let filtered = attendanceRecords.filter(r => r.date === reportDate);
    console.log('   Records for selected date:', filtered.length);
    
    if (serviceFilter) {
        filtered = filtered.filter(r => r.serviceType === serviceFilter);
        console.log('   Records after service filter:', filtered.length);
    }
    
    // Debug cluster information for filtered records
    console.log('📊 Cluster Debug for Report:');
    const clusterSummary = {};
    filtered.forEach(r => {
        const cluster = r.cluster || 'N/A';
        if (!clusterSummary[cluster]) {
            clusterSummary[cluster] = { members: 0, visitors: 0 };
        }
        if (r.isVisitor) {
            clusterSummary[cluster].visitors++;
        } else {
            clusterSummary[cluster].members++;
        }
    });
    console.log('   Cluster breakdown:', clusterSummary);
    
    if (filtered.length === 0) {
        console.log('❌ No records found for the selected criteria');
        document.getElementById('report-content').innerHTML = `
            <p class="empty-state">
                ⚠️ No attendance records found.<br><br>
                <strong>Date:</strong> ${reportDate}<br>
                <strong>Service:</strong> ${serviceFilter || 'All Services'}<br><br>
                Please check if:<br>
                • Records were scanned on this date<br>
                • The correct service type is selected<br>
                • Data has loaded from Firebase<br><br>
                <button onclick="recoverData()" class="btn btn-primary">🔄 Reload Data</button>
            </p>
        `;
        return;
    }
    
    console.log('✅ Generating report with', filtered.length, 'records');
    
    // Get current date and time for "Generated" timestamp
    const generatedTimestamp = new Date().toLocaleString('en-US', { 
        month: 'numeric', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    });
    
    let reportHTML = '';
    
    // Check if "All Services" is selected
    if (!serviceFilter) {
        // Group by Service Type first
        const serviceTypeGroups = {};
        filtered.forEach(record => {
            const serviceType = record.serviceType || 'Unknown';
            if (!serviceTypeGroups[serviceType]) {
                serviceTypeGroups[serviceType] = [];
            }
            serviceTypeGroups[serviceType].push(record);
        });
        
        const serviceTypes = Object.keys(serviceTypeGroups).sort();
        const totalMembers = filtered.filter(r => !r.isVisitor).length;
        const totalVisitors = filtered.filter(r => r.isVisitor).length;
        
        // Build report header
        reportHTML = `
            <div class="report-header-enhanced">
                <div class="report-title">
                    <span class="report-icon">📊</span>
                    <h2>Attendance Report - All Service Types</h2>
                </div>
                <div class="report-metadata">
                    <p><strong>Date:</strong> ${reportDate}</p>
                    <p><strong>Service Types:</strong> ${serviceTypes.join(', ')}</p>
                    <p><strong>Total Attendance:</strong> ${filtered.length}</p>
                    <p><strong>Members:</strong> ${totalMembers} | <strong>Visitors:</strong> ${totalVisitors}</p>
                    <p class="generated-time"><strong>Generated:</strong> ${generatedTimestamp}</p>
                </div>
            </div>
        `;
        
        // Generate report for each service type
        serviceTypes.forEach((serviceType, serviceIndex) => {
            const serviceRecords = serviceTypeGroups[serviceType];
            const serviceMembers = serviceRecords.filter(r => !r.isVisitor);
            const serviceVisitors = serviceRecords.filter(r => r.isVisitor);
            
            reportHTML += `
                <div class="service-type-section" style="margin-top: ${serviceIndex > 0 ? '40px' : '20px'}; padding: 20px; border: 2px solid #2196F3; border-radius: 8px; background: #f9f9f9;">
                    <h3 style="color: #2196F3; margin: 0 0 15px 0; font-size: 18px; text-transform: uppercase; border-bottom: 2px solid #2196F3; padding-bottom: 10px;">${serviceType}</h3>
                    <p style="color: #666; margin-bottom: 20px;"><strong>Total Attendees:</strong> ${serviceRecords.length} (Members: ${serviceMembers.length}, Visitors: ${serviceVisitors.length})</p>
            `;
            
            // Group members by cluster for this service
            const clusterGroups = {};
            serviceMembers.forEach(record => {
                if (!clusterGroups[record.cluster]) {
                    clusterGroups[record.cluster] = [];
                }
                clusterGroups[record.cluster].push(record);
            });
            
            // Add members by cluster
            Object.keys(clusterGroups).sort().forEach(cluster => {
                const sortedMembers = clusterGroups[cluster].sort((a, b) => a.name.localeCompare(b.name));
                
                reportHTML += `
                    <div style="margin-bottom: 20px;">
                        <h5 style="color: #333; font-size: 15px; font-weight: 600; margin-bottom: 8px;">${cluster}</h5>
                        <ul style="margin: 0; padding-left: 20px; list-style: none;">
                `;
                
                sortedMembers.forEach(record => {
                    reportHTML += `<li style="margin-bottom: 3px; color: #444;">• ${record.name}</li>`;
                });
                
                reportHTML += `
                        </ul>
                    </div>
                `;
            });
            
            // Add visitors for this service
            if (serviceVisitors.length > 0) {
                const sortedVisitors = serviceVisitors.sort((a, b) => a.name.localeCompare(b.name));
                
                // Generate dynamic visitor section title based on service type
                const visitorSectionTitle = serviceType.toUpperCase() + ' VISITORS';
                
                // Table format for ALL service types with visitors
                reportHTML += `
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #FF9800;">
                        <h5 style="color: #FF9800; font-size: 15px; font-weight: 600; margin-bottom: 12px;">${visitorSectionTitle} (${serviceVisitors.length})</h5>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                            <thead>
                                <tr style="background-color: #FF9800; color: white;">
                                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Visitors Name</th>
                                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cluster</th>
                                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Visitors Type</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                sortedVisitors.forEach((record, index) => {
                    const visitorType = record.visitorType || 'Visitor';
                    const visitorCluster = record.cluster || 'N/A';
                    const bgColor = index % 2 === 0 ? '#fff3e0' : 'white';
                    reportHTML += `
                        <tr style="background: ${bgColor};">
                            <td style="border: 1px solid #ddd; padding: 8px;">${record.name}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${visitorCluster}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${visitorType}</td>
                        </tr>
                    `;
                });
                
                reportHTML += `
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            reportHTML += `</div>`; // Close service-type-section
        });
        
    } else {
        // Single service type - keep original behavior
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
        
        // Build report HTML with enhanced header
        reportHTML = `
            <div class="report-header-enhanced">
                <div class="report-title">
                    <span class="report-icon">📊</span>
                    <h2>Attendance Report</h2>
                </div>
                <div class="report-metadata">
                    <p><strong>Date:</strong> ${reportDate}</p>
                    <p><strong>Service Type:</strong> ${serviceFilter}</p>
                    <p><strong>Total Attendance:</strong> ${filtered.length}</p>
                    <p><strong>Members:</strong> ${members.length} | <strong>Visitors:</strong> ${visitors.length}</p>
                    <p class="generated-time"><strong>Generated:</strong> ${generatedTimestamp}</p>
                </div>
            </div>
            
            <h4 style="margin-top: 30px; margin-bottom: 15px; color: #333; font-size: 16px; font-weight: 600;">Summary by Cluster</h4>
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">Cluster</th>
                        <th style="text-align: center; width: 100px;">Count</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Add member clusters sorted alphabetically
        Object.keys(clusterGroups).sort().forEach(cluster => {
            reportHTML += `
                <tr>
                    <td>${cluster}</td>
                    <td style="text-align: center;">${clusterGroups[cluster].length}</td>
                </tr>
            `;
        });
        
        // Add visitors row if there are visitors
        if (visitors.length > 0) {
            reportHTML += `
                <tr>
                    <td><strong>VISITORS</strong></td>
                    <td style="text-align: center;"><strong>${visitors.length}</strong></td>
                </tr>
            `;
        }
        
        reportHTML += `
                </tbody>
            </table>
            
            <h4 style="margin-top: 35px; margin-bottom: 20px; color: #333; font-size: 16px; font-weight: 600;">Detailed Attendance by Cluster</h4>
        `;
        
        // Add detailed lists by cluster with numbered entries and time
        Object.keys(clusterGroups).sort().forEach(cluster => {
            const sortedMembers = clusterGroups[cluster].sort((a, b) => a.name.localeCompare(b.name));
            
            reportHTML += `
                <div class="cluster-detail-section">
                    <h5 style="color: #333; font-size: 15px; font-weight: 600; margin-bottom: 10px;">${cluster} (${sortedMembers.length} attendees)</h5>
                    <ol class="attendee-detail-list" style="margin: 0; padding-left: 20px;">
            `;
            
            sortedMembers.forEach((record, index) => {
                reportHTML += `<li style="margin-bottom: 5px;">${record.name} - ${record.time}</li>`;
            });
            
            reportHTML += `
                    </ol>
                </div>
            `;
        });
        
        // Add visitors section if there are visitors
        if (visitors.length > 0) {
            const sortedVisitors = visitors.sort((a, b) => a.name.localeCompare(b.name));
            
            // Generate dynamic visitor section title based on service type
            const visitorSectionTitle = serviceFilter.toUpperCase() + ' VISITORS';
            
            // Table format for ALL service types with visitors
            reportHTML += `
                <div class="cluster-detail-section" style="margin-top: 25px;">
                    <h5 style="color: #FF9800; font-size: 15px; font-weight: 600; margin-bottom: 12px;">${visitorSectionTitle} (${visitors.length} total)</h5>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                        <thead>
                            <tr style="background-color: #FF9800; color: white;">
                                <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Visitors Name</th>
                                <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cluster</th>
                                <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Visitors Type</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            sortedVisitors.forEach((record, index) => {
                const visitorType = record.visitorType || 'Visitor';
                const visitorCluster = record.cluster || 'N/A';
                const bgColor = index % 2 === 0 ? '#fff3e0' : 'white';
                reportHTML += `
                    <tr style="background: ${bgColor};">
                        <td style="border: 1px solid #ddd; padding: 8px;">${record.name}</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">${visitorCluster}</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">${visitorType}</td>
                    </tr>
                `;
            });
            
            reportHTML += `
                        </tbody>
                    </table>
                </div>
            `;
        }
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
                h2, h3, h4, h5 { color: #333; }
                
                /* Enhanced Report Header */
                .report-header-enhanced {
                    background: #fff;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 25px;
                }
                .report-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 15px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #e0e0e0;
                }
                .report-icon { font-size: 24px; }
                .report-title h2 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                    color: #333;
                }
                .report-metadata { line-height: 1.8; }
                .report-metadata p {
                    margin: 5px 0;
                    color: #555;
                    font-size: 14px;
                }
                .generated-time {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid #f0f0f0;
                    color: #777;
                    font-size: 13px;
                }
                
                .report-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .report-table th { background: #2196F3; color: white; padding: 10px; text-align: left; }
                .report-table td { border: 1px solid #ddd; padding: 8px; }
                
                .cluster-detail-section {
                    margin-bottom: 25px;
                    padding: 15px;
                    background: #fafafa;
                    border-radius: 6px;
                    border-left: 3px solid #2196F3;
                    page-break-inside: avoid;
                }
                
                .attendee-detail-list {
                    list-style-position: inside;
                    color: #333;
                }
                .attendee-detail-list li {
                    padding: 3px 0;
                    color: #444;
                    font-size: 14px;
                }
                
                /* Service Type Section - Page Break */
                .service-type-section {
                    page-break-after: always;
                    margin-bottom: 40px;
                    padding: 20px;
                    border: 2px solid #2196F3;
                    border-radius: 8px;
                    background: #f9f9f9;
                }
                .service-type-section:last-child {
                    page-break-after: auto;
                }
                
                @media print {
                    body { padding: 10px; }
                    .cluster-detail-section { page-break-inside: avoid; }
                    .service-type-section { 
                        page-break-after: always;
                        margin-bottom: 0;
                    }
                    .service-type-section:last-child {
                        page-break-after: auto;
                    }
                    .report-header-enhanced {
                        page-break-after: avoid;
                    }
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
    if (!canvas) {
        alert('Please generate a QR code first!');
        return;
    }
    
    const name = document.getElementById('employee-name').value.trim();
    const filename = `QR_${name.replace(/\s+/g, '_')}.png`;
    
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    canvas.toBlob((blob) => {
        // On mobile, try to share; on desktop, always download
        if (isMobile && navigator.share && navigator.canShare) {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: `QR Code - ${name}`,
                    text: `QR code for ${name}`
                }).then(() => {
                    console.log('Shared successfully');
                    clearQRForm(); // Clear form after successful share
                }).catch((error) => {
                    console.log('Error sharing:', error);
                    downloadBlobFromCanvas(blob, filename);
                });
                return;
            }
        }
        
        // Desktop or fallback: Direct download
        downloadBlobFromCanvas(blob, filename);
    }, 'image/png');
}

function downloadBlobFromCanvas(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show success message
    alert(`QR Code downloaded successfully!\n\nFile: ${filename}`);
    
    // Clear form after successful download
    clearQRForm();
}

// Clear QR form after download
function clearQRForm() {
    document.getElementById('employee-name').value = '';
    document.getElementById('employee-cluster').value = '';
    document.getElementById('employee-category').value = '';
    document.getElementById('qrcode').innerHTML = '';
    document.getElementById('qr-output').style.display = 'none';
    
    console.log('QR form cleared - ready for next generation');
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
    try {
        const selectedType = document.querySelector('input[name="member-type"]:checked')?.value || 'members';
        currentMemberType = selectedType;
        
        // Show/hide fields based on type
        const categoryField = document.getElementById('category-field');
        const visitorTypeField = document.getElementById('visitor-type-field');
        const dateBaptisedField = document.getElementById('date-baptised-field');
        const statusField = document.getElementById('status-field');
        
        if (!categoryField || !visitorTypeField || !statusField) {
            console.log('Member form fields not found - skipping field visibility update');
            return;
        }
        
        if (currentMemberType === 'members') {
            // Members: Show Category and Status, Hide Visitor Type and Date Baptised
            categoryField.style.display = 'block';
            statusField.style.display = 'block';
            visitorTypeField.style.display = 'none';
            if (dateBaptisedField) dateBaptisedField.style.display = 'none';
            
            // Hide Invited By and Baptised By fields for members
            const invitedByField = document.getElementById('invited-by-field');
            const baptisedByField = document.getElementById('baptised-by-field');
            if (invitedByField) invitedByField.style.display = 'none';
            if (baptisedByField) baptisedByField.style.display = 'none';
            
            document.getElementById('member-category').required = true;
            document.getElementById('member-status').required = true;
            document.getElementById('member-visitor-type').required = false;
            document.getElementById('member-cluster').required = true;
            if (document.getElementById('cluster-label')) {
                document.getElementById('cluster-label').innerHTML = 'Cluster:';
            }
            if (document.getElementById('member-date-baptised')) {
                document.getElementById('member-date-baptised').required = false;
            }
            
            // Update button label
            const addNewBtn = document.getElementById('add-new-btn');
            if (addNewBtn) {
                addNewBtn.innerHTML = '➕ New';
            }
        } else {
            // Visitors: Hide Category and Status, Show Visitor Type and Date Baptised, Make Cluster optional
            categoryField.style.display = 'none';
            statusField.style.display = 'none';
            visitorTypeField.style.display = 'block';
            if (dateBaptisedField) {
                dateBaptisedField.style.display = 'block';
                // Set default date to today
                const today = new Date().toISOString().split('T')[0];
                if (!document.getElementById('member-date-baptised').value) {
                    document.getElementById('member-date-baptised').value = today;
                }
            }
            
            // Show Invited By and Baptised By fields for visitors
            const invitedByField = document.getElementById('invited-by-field');
            const baptisedByField = document.getElementById('baptised-by-field');
            if (invitedByField) invitedByField.style.display = 'block';
            if (baptisedByField) baptisedByField.style.display = 'block';
            
            document.getElementById('member-category').required = false;
            document.getElementById('member-status').required = false;
            document.getElementById('member-visitor-type').required = true;
            document.getElementById('member-cluster').required = false;
            if (document.getElementById('cluster-label')) {
                document.getElementById('cluster-label').innerHTML = 'Cluster: <span style="font-weight: normal; color: #666;">(Optional)</span>';
            }
            
            // Update button label
            const addNewBtn = document.getElementById('add-new-btn');
            if (addNewBtn) {
                addNewBtn.innerHTML = '➕ New Visitor';
            }
        }
        
        if (typeof clearSearch === 'function') clearSearch();
        if (typeof updateMemberStats === 'function') updateMemberStats();
    } catch (error) {
        console.error('Error in switchMemberType:', error);
    }
}

// Calculate age from birthday
function calculateAge() {
    const birthday = document.getElementById('member-birthday').value;
    if (!birthday) {
        document.getElementById('member-age').value = '';
        return;
    }
    
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    // Adjust if birthday hasn't occurred this year
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    document.getElementById('member-age').value = age >= 0 ? age + ' years old' : '';
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
        document.getElementById('member-age').value = member.age || '';
        document.getElementById('member-contact').value = member.contactNumber || '';
        document.getElementById('member-facebook').value = member.facebookAccount || '';
        document.getElementById('member-cluster').value = member.cluster || '';
        
        // Calculate age if birthday exists but age is not stored
        if (member.birthday && !member.age) {
            calculateAge();
        }
        
        if (currentMemberType === 'members') {
            document.getElementById('member-category').value = member.category;
            document.getElementById('member-status').value = member.status;
        } else {
            document.getElementById('member-visitor-type').value = member.visitorType || '';
            if (document.getElementById('member-date-baptised')) {
                document.getElementById('member-date-baptised').value = member.dateBaptised || '';
            }
            if (document.getElementById('member-invited-by')) {
                document.getElementById('member-invited-by').value = member.invitedBy || '';
            }
            if (document.getElementById('member-baptised-by')) {
                document.getElementById('member-baptised-by').value = member.baptisedBy || '';
            }
        }
        
        const formTitle = currentMemberType === 'visitors' ? 'Edit Visitor Information' : 'Edit Member Information';
        document.getElementById('form-title').textContent = formTitle;
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
    document.getElementById('member-age').value = '';
    document.getElementById('member-contact').value = '';
    document.getElementById('member-facebook').value = '';
    document.getElementById('member-cluster').value = '';
    document.getElementById('member-category').value = '';
    document.getElementById('member-status').value = 'Active';
    document.getElementById('member-visitor-type').value = '';
    
    // Clear new visitor fields
    if (document.getElementById('member-invited-by')) {
        document.getElementById('member-invited-by').value = '';
    }
    if (document.getElementById('member-baptised-by')) {
        document.getElementById('member-baptised-by').value = '';
    }
    
    // Set default date baptised to today for visitors
    if (document.getElementById('member-date-baptised')) {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('member-date-baptised').value = currentMemberType === 'visitors' ? today : '';
    }
    
    // Update form title based on type
    const formTitle = currentMemberType === 'visitors' ? 'Add New Visitor' : 'Add New Member';
    document.getElementById('form-title').textContent = formTitle;
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
    const facebookAccount = document.getElementById('member-facebook').value.trim();
    const cluster = document.getElementById('member-cluster').value;
    const age = document.getElementById('member-age').value;
    
    let memberData = {
        name: name,
        birthday: birthday,
        age: age,
        contactNumber: contactNumber,
        facebookAccount: facebookAccount || '',
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
            alert('Please fill in all required fields!');
            return;
        }
        
        memberData.category = category;
        memberData.status = status;
    } else {
        const visitorType = document.getElementById('member-visitor-type').value;
        const dateBaptised = document.getElementById('member-date-baptised').value;
        const invitedBy = document.getElementById('member-invited-by') ? document.getElementById('member-invited-by').value.trim() : '';
        const baptisedBy = document.getElementById('member-baptised-by') ? document.getElementById('member-baptised-by').value.trim() : '';
        
        // Validation for visitors (cluster is optional)
        if (!name || !birthday || !contactNumber || !visitorType) {
            alert('Please fill in all required fields!');
            return;
        }
        
        memberData.visitorType = visitorType;
        memberData.dateBaptised = dateBaptised || new Date().toISOString().split('T')[0];
        memberData.invitedBy = invitedBy || '';
        memberData.baptisedBy = baptisedBy || '';
    }
    
    try {
        let savedToCloud = false;
        
        if (currentEditingId) {
            // Update existing member
            if (firebaseInitialized && db) {
                await db.collection('members').doc(currentEditingId).update(memberData);
                savedToCloud = true;
            } else {
                // Update in local arrays if offline
                updateLocalMember(currentEditingId, memberData);
            }
            alert('✅ Member information updated successfully!' + 
                  (savedToCloud ? '' : '\n⚠️ Saved offline - will sync when online'));
        } else {
            // Add new member
            memberData.createdAt = new Date().toISOString();
            
            if (firebaseInitialized && db) {
                const docRef = await db.collection('members').add(memberData);
                console.log('✅ Member saved to Firebase with ID:', docRef.id);
                savedToCloud = true;
            } else {
                // Save locally if offline
                const localId = 'local_' + Date.now();
                memberData.id = localId;
                addLocalMember(memberData);
            }
            
            alert('✅ New member added successfully!' + 
                  (savedToCloud ? '' : '\n⚠️ Saved offline - will sync when online'));
        }
        
        // Save to localStorage as backup
        saveMembersToLocalStorage();
        
        // Reload members and clear form
        if (firebaseInitialized) {
            loadMembersFromCloud();
        }
        cancelEdit();
        clearSearch();
        
    } catch (error) {
        console.error('❌ Error saving member:', error);
        
        // Fallback to local save
        if (!currentEditingId) {
            const localId = 'local_' + Date.now();
            memberData.id = localId;
            memberData.createdAt = new Date().toISOString();
            addLocalMember(memberData);
            saveMembersToLocalStorage();
            alert('✅ Member saved offline!\n⚠️ Will sync to cloud when connection is available.');
            cancelEdit();
            clearSearch();
        } else {
            alert('❌ Error saving member: ' + error.message);
        }
    }
}

// Helper functions for offline support
function addLocalMember(memberData) {
    if (memberData.type === 'members') {
        membersData.unshift(memberData);
    } else {
        visitorsData.unshift(memberData);
    }
    updateMemberStats();
}

function updateLocalMember(id, updatedData) {
    const dataSource = currentMemberType === 'members' ? membersData : visitorsData;
    const index = dataSource.findIndex(m => m.id === id);
    if (index !== -1) {
        dataSource[index] = { ...dataSource[index], ...updatedData };
        updateMemberStats();
    }
}

function saveMembersToLocalStorage() {
    localStorage.setItem('membersData', JSON.stringify(membersData));
    localStorage.setItem('visitorsData', JSON.stringify(visitorsData));
    console.log('💾 Members saved to localStorage:', membersData.length, 'members,', visitorsData.length, 'visitors');
}

// Delete member
async function deleteMember() {
    if (!currentEditingId) {
        alert('⚠️ No member selected for deletion.');
        return;
    }
    
    const memberName = document.getElementById('member-name').value;
    const memberType = currentMemberType === 'members' ? 'Member' : 'Visitor';
    
    // FIRST WARNING - Show what will be deleted
    const confirmed1 = confirm(
        `⚠️ DELETE ${memberType.toUpperCase()} RECORD\n` +
        `═══════════════════════════════\n\n` +
        `You are about to DELETE the record for:\n\n` +
        `📋 Name: ${memberName}\n` +
        `👤 Type: ${memberType}\n\n` +
        `This action CANNOT be undone!\n\n` +
        `Do you want to proceed?`
    );
    
    if (!confirmed1) {
        console.log('❌ Delete cancelled by user');
        return;
    }
    
    // SECOND WARNING - Final confirmation
    const confirmed2 = confirm(
        `🚨 FINAL CONFIRMATION\n` +
        `═══════════════════════════════\n\n` +
        `Are you ABSOLUTELY SURE you want to\n` +
        `permanently delete this ${memberType.toLowerCase()} record?\n\n` +
        `Name: ${memberName}\n\n` +
        `This will remove from:\n` +
        `• Cloud database (Firebase)\n` +
        `• Local storage\n` +
        `• All connected devices\n\n` +
        `Click OK to DELETE PERMANENTLY\n` +
        `Click Cancel to keep the record`
    );
    
    if (!confirmed2) {
        console.log('❌ Delete cancelled at final confirmation');
        return;
    }
    
    console.log('🗑️ Deleting member:', memberName);
    
    try {
        let deletedFromCloud = false;
        
        // Delete from Firebase
        if (firebaseInitialized && db) {
            await db.collection('members').doc(currentEditingId).delete();
            console.log('✅ Deleted from Firebase:', currentEditingId);
            deletedFromCloud = true;
        }
        
        // Delete from local arrays (for immediate feedback and offline support)
        const dataSource = currentMemberType === 'members' ? membersData : visitorsData;
        const index = dataSource.findIndex(m => m.id === currentEditingId);
        if (index !== -1) {
            if (currentMemberType === 'members') {
                membersData.splice(index, 1);
            } else {
                visitorsData.splice(index, 1);
            }
            console.log('✅ Deleted from local array');
        }
        
        // Update localStorage
        saveMembersToLocalStorage();
        
        // Update UI
        updateMemberStats();
        
        // Success message
        alert(
            `✅ ${memberType.toUpperCase()} DELETED\n` +
            `═══════════════════════════════\n\n` +
            `Successfully deleted: ${memberName}\n\n` +
            (deletedFromCloud 
                ? `The record has been permanently removed\nfrom all devices.`
                : `⚠️ Deleted locally.\nWill sync to cloud when online.`)
        );
        
        console.log('✅ Delete operation completed');
        
        // Reload from cloud and clear form
        if (firebaseInitialized) {
            loadMembersFromCloud();
        }
        cancelEdit();
        clearSearch();
        
    } catch (error) {
        console.error('❌ Error deleting member:', error);
        alert(
            `❌ DELETE FAILED\n` +
            `═══════════════════════════════\n\n` +
            `Error: ${error.message}\n\n` +
            `The record may not have been deleted.\n` +
            `Please check your internet connection\n` +
            `and try again.`
        );
    }
}

// Cancel edit
function cancelEdit() {
    currentEditingId = null;
    document.getElementById('member-details-section').style.display = 'none';
    document.getElementById('member-id').value = '';
    document.getElementById('member-name').value = '';
    document.getElementById('member-birthday').value = '';
    document.getElementById('member-age').value = '';
    document.getElementById('member-contact').value = '';
    document.getElementById('member-facebook').value = '';
    document.getElementById('member-cluster').value = '';
    document.getElementById('member-category').value = '';
    document.getElementById('member-status').value = '';
    document.getElementById('member-visitor-type').value = '';
    if (document.getElementById('member-date-baptised')) {
        document.getElementById('member-date-baptised').value = '';
    }
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
            console.log('📥 Loading members from Firebase...');
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
            
            // Save to localStorage as backup
            saveMembersToLocalStorage();
            
            updateMemberStats();
            console.log('✅ Members loaded from Firebase:', membersData.length, 'members,', visitorsData.length, 'visitors');
            
        } catch (error) {
            console.error('❌ Error loading members from Firebase:', error);
            // Fallback to localStorage
            loadMembersFromLocalStorage();
        }
    } else {
        console.log('⚠️ Firebase not available, loading from localStorage');
        loadMembersFromLocalStorage();
    }
}

// Load members from localStorage (offline support)
function loadMembersFromLocalStorage() {
    try {
        const savedMembers = localStorage.getItem('membersData');
        const savedVisitors = localStorage.getItem('visitorsData');
        
        if (savedMembers) {
            membersData = JSON.parse(savedMembers);
            console.log('📂 Loaded members from localStorage:', membersData.length);
        }
        
        if (savedVisitors) {
            visitorsData = JSON.parse(savedVisitors);
            console.log('📂 Loaded visitors from localStorage:', visitorsData.length);
        }
        
        updateMemberStats();
    } catch (error) {
        console.error('❌ Error loading from localStorage:', error);
        membersData = [];
        visitorsData = [];
    }
}

// Update member statistics
function updateMemberStats() {
    document.getElementById('total-members').textContent = membersData.length;
    document.getElementById('total-visitors').textContent = visitorsData.length;
}

// Export to Excel Function
function exportToExcel() {
    const typeFilter = document.getElementById('export-type-filter').value;
    const clusterFilter = document.getElementById('export-cluster-filter').value;
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Filter data by type and cluster
    let filteredMembers = membersData;
    let filteredVisitors = visitorsData;
    
    // Apply type filter
    if (typeFilter === 'MEMBERS') {
        filteredVisitors = []; // Exclude visitors
    } else if (typeFilter === 'VISITORS') {
        filteredMembers = []; // Exclude members
    }
    
    // Apply cluster filter
    if (clusterFilter !== 'ALL') {
        filteredMembers = filteredMembers.filter(m => m.cluster === clusterFilter);
        filteredVisitors = filteredVisitors.filter(v => v.cluster === clusterFilter);
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
    
    // Header - Dynamic based on type
    let reportTitle = 'Members Information List';
    if (typeFilter === 'VISITORS') {
        reportTitle = 'Visitors Information List';
    } else if (typeFilter === 'MEMBERS') {
        reportTitle = 'Members Information List';
    } else {
        reportTitle = 'Members & Visitors Information List';
    }
    
    csvContent += `"${reportTitle}"\n`;
    csvContent += `"As of ${currentDate}"\n`;
    if (typeFilter !== 'ALL') {
        csvContent += `"Type: ${typeFilter}"\n`;
    }
    if (clusterFilter !== 'ALL') {
        csvContent += `"Cluster: ${clusterFilter}"\n`;
    }
    csvContent += '\n';
    
    // Members Section (only if not filtered to VISITORS only)
    if (typeFilter !== 'VISITORS' && filteredMembers.length > 0) {
        csvContent += '"=== REGULAR MEMBERS ==="\n';
        csvContent += '"Name","Birthday","Age","Contact Number","Facebook Account","Cluster","Category","Status"\n';
    
        filteredMembers.forEach(member => {
            csvContent += `"${member.name}","${member.birthday || 'N/A'}","${member.age || 'N/A'}","${member.contactNumber || 'N/A'}","${member.facebookAccount || 'N/A'}","${member.cluster}","${member.category}","${member.status}"\n`;
        });
        
        csvContent += '\n';
        csvContent += `"Total Members: ${filteredMembers.length}"\n`;
        csvContent += '\n';
        
        // Members Category Summary
        csvContent += '"Members by Category:"\n';
        Object.keys(categoryTotals).forEach(category => {
            csvContent += `"${category}","${categoryTotals[category]}"\n`;
        });
        
        csvContent += '\n';
        csvContent += '"====================================="\n';
        csvContent += '\n';
    }
    
    // Visitors Section (only if not filtered to MEMBERS only)
    if (typeFilter !== 'MEMBERS' && filteredVisitors.length > 0) {
        csvContent += '"=== VISITORS ==="\n';
        csvContent += '"Name","Birthday","Age","Contact Number","Facebook Account","Cluster","Visitor Type","Date Baptised","Invited By","Baptised By"\n';
        
        filteredVisitors.forEach(visitor => {
            csvContent += `"${visitor.name}","${visitor.birthday || 'N/A'}","${visitor.age || 'N/A'}","${visitor.contactNumber || 'N/A'}","${visitor.facebookAccount || 'N/A'}","${visitor.cluster || 'N/A'}","${visitor.visitorType || 'N/A'}","${visitor.dateBaptised || 'N/A'}","${visitor.invitedBy || 'N/A'}","${visitor.baptisedBy || 'N/A'}"\n`;
        });
        
        csvContent += '\n';
        csvContent += `"Total Visitors: ${filteredVisitors.length}"\n`;
        csvContent += '\n';
        
        // Visitors Type Summary
        csvContent += '"Visitors by Type:"\n';
        Object.keys(visitorTypeTotals).forEach(type => {
            csvContent += `"${type}","${visitorTypeTotals[type]}"\n`;
        });
        
        csvContent += '\n';
        csvContent += '"====================================="\n';
        csvContent += '\n';
    }
    
    // Grand Totals
    csvContent += '"SUMMARY"\n';
    if (typeFilter !== 'VISITORS') {
        csvContent += `"Total Members:","${filteredMembers.length}"\n`;
    }
    if (typeFilter !== 'MEMBERS') {
        csvContent += `"Total Visitors:","${filteredVisitors.length}"\n`;
    }
    csvContent += `"Grand Total:","${filteredMembers.length + filteredVisitors.length}"\n`;
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    let filename = 'UP_Diliman_';
    if (typeFilter === 'MEMBERS') {
        filename += 'Members_Report';
    } else if (typeFilter === 'VISITORS') {
        filename += 'Visitors_Report';
    } else {
        filename += 'Members_Report';
    }
    if (clusterFilter !== 'ALL') {
        filename += `_${clusterFilter.replace(/\s+/g, '_')}`;
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
    
    let summaryMsg = '✅ Report exported successfully!\n\n';
    if (typeFilter !== 'VISITORS') summaryMsg += `Members: ${filteredMembers.length}\n`;
    if (typeFilter !== 'MEMBERS') summaryMsg += `Visitors: ${filteredVisitors.length}\n`;
    summaryMsg += `Total: ${filteredMembers.length + filteredVisitors.length}`;
    
    alert(summaryMsg);
}

// Helper function to calculate age from birthday
function calculateAgeFromBirthday(birthdayString) {
    if (!birthdayString) return 'N/A';
    
    const birthday = new Date(birthdayString);
    const today = new Date();
    let age = today.getFullYear() - birthday.getFullYear();
    const monthDiff = today.getMonth() - birthday.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) {
        age--;
    }
    
    return age;
}

// Preview Members Report
function previewMembersReport() {
    const typeFilter = document.getElementById('export-type-filter').value;
    const clusterFilter = document.getElementById('export-cluster-filter').value;
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Filter data
    let filteredMembers = membersData;
    let filteredVisitors = visitorsData;
    
    if (typeFilter === 'MEMBERS') {
        filteredVisitors = [];
    } else if (typeFilter === 'VISITORS') {
        filteredMembers = [];
    }
    
    if (clusterFilter !== 'ALL') {
        filteredMembers = filteredMembers.filter(m => m.cluster === clusterFilter);
        filteredVisitors = filteredVisitors.filter(v => v.cluster === clusterFilter);
    }
    
    // Sort by name
    filteredMembers.sort((a, b) => a.name.localeCompare(b.name));
    filteredVisitors.sort((a, b) => a.name.localeCompare(b.name));
    
    // Determine report title based on type filter
    let reportTitle = 'Members & Visitors Information List';
    if (typeFilter === 'MEMBERS') {
        reportTitle = 'Members Information List';
    } else if (typeFilter === 'VISITORS') {
        reportTitle = 'Visitors Information List';
    }
    
    // Build preview content
    let previewContent = `
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #2196F3;">
            <h2 style="color: #2196F3; margin-bottom: 10px;">UP Diliman Locale</h2>
            <h3 style="color: #666; margin: 5px 0;">${reportTitle}</h3>
            <p style="color: #999; margin: 5px 0;">As of ${currentDate}</p>
            ${typeFilter !== 'ALL' ? `<p style="color: #666; margin: 5px 0;"><strong>Type:</strong> ${typeFilter}</p>` : ''}
            ${clusterFilter !== 'ALL' ? `<p style="color: #666; margin: 5px 0;"><strong>Cluster:</strong> ${clusterFilter}</p>` : ''}
        </div>
    `;
    
    // Members Table
    if (typeFilter !== 'VISITORS' && filteredMembers.length > 0) {
        previewContent += `
            <h3 style="color: #2196F3; border-bottom: 2px solid #2196F3; padding-bottom: 10px; margin-top: 30px;">REGULAR MEMBERS</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #2196F3; color: white;">
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">#</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Name</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Birthday</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Age</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Contact</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Facebook</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cluster</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Category</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        filteredMembers.forEach((member, index) => {
            const statusClass = member.status === 'Active' ? 'background: #4CAF50; color: white;' : 'background: #f44336; color: white;';
            const calculatedAge = calculateAgeFromBirthday(member.birthday);
            previewContent += `
                <tr style="${index % 2 === 0 ? 'background: #f9f9f9;' : 'background: white;'}">
                    <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${member.name}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.birthday || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${calculatedAge}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.contactNumber || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.facebookAccount || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.cluster}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.category}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;"><span style="padding: 5px 10px; border-radius: 5px; ${statusClass}">${member.status}</span></td>
                </tr>
            `;
        });
        
        previewContent += `
                    </tbody>
                </table>
            </div>
            <p style="font-weight: bold; margin-top: 10px; font-size: 16px; color: #2196F3;">Total Members: ${filteredMembers.length}</p>
        `;
    }
    
    // Visitors Table
    if (typeFilter !== 'MEMBERS' && filteredVisitors.length > 0) {
        previewContent += `
            <h3 style="color: #ff9800; border-bottom: 2px solid #ff9800; padding-bottom: 10px; margin-top: 40px;">VISITORS</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #ff9800; color: white;">
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">#</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Name</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Birthday</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Age</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Contact</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Facebook</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cluster</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Visitor Type</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Date Baptised</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Invited By</th>
                            <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Baptised By</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        filteredVisitors.forEach((visitor, index) => {
            const calculatedAge = calculateAgeFromBirthday(visitor.birthday);
            previewContent += `
                <tr style="${index % 2 === 0 ? 'background: #fff3e0;' : 'background: white;'}">
                    <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${visitor.name}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.birthday || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${calculatedAge}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.contactNumber || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.facebookAccount || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.cluster || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.visitorType || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.dateBaptised || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.invitedBy || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.baptisedBy || 'N/A'}</td>
                </tr>
            `;
        });
        
        previewContent += `
                    </tbody>
                </table>
            </div>
            <p style="font-weight: bold; margin-top: 10px; font-size: 16px; color: #ff9800;">Total Visitors: ${filteredVisitors.length}</p>
        `;
    }
    
    // Summary
    previewContent += `
        <div style="margin-top: 40px; padding: 25px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h4 style="margin-top: 0; font-size: 20px; border-bottom: 2px solid white; padding-bottom: 10px;">📊 SUMMARY</h4>
            ${typeFilter !== 'VISITORS' ? `<p style="font-size: 16px; margin: 10px 0;">Total Members: <strong style="font-size: 24px;">${filteredMembers.length}</strong></p>` : ''}
            ${typeFilter !== 'MEMBERS' ? `<p style="font-size: 16px; margin: 10px 0;">Total Visitors: <strong style="font-size: 24px;">${filteredVisitors.length}</strong></p>` : ''}
            <p style="font-size: 18px; margin: 15px 0 0 0; padding-top: 15px; border-top: 2px solid rgba(255,255,255,0.3);">Grand Total: <strong style="font-size: 28px;">${filteredMembers.length + filteredVisitors.length}</strong></p>
        </div>
    `;
    
    // Display in modal
    document.getElementById('preview-content').innerHTML = previewContent;
    document.getElementById('preview-modal').style.display = 'block';
    document.body.style.overflow = 'hidden'; // Disable body scroll while modal is open
}

// Close Preview Modal
function closePreview() {
    document.getElementById('preview-modal').style.display = 'none';
    document.body.style.overflow = 'auto'; // Re-enable body scroll
}

// Close preview on ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
        const modal = document.getElementById('preview-modal');
        if (modal && modal.style.display === 'block') {
            closePreview();
        }
    }
});

// Print Members Report
function printMembersReport() {
    const typeFilter = document.getElementById('export-type-filter').value;
    const clusterFilter = document.getElementById('export-cluster-filter').value;
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Filter data
    let filteredMembers = membersData;
    let filteredVisitors = visitorsData;
    
    if (typeFilter === 'MEMBERS') {
        filteredVisitors = [];
    } else if (typeFilter === 'VISITORS') {
        filteredMembers = [];
    }
    
    if (clusterFilter !== 'ALL') {
        filteredMembers = filteredMembers.filter(m => m.cluster === clusterFilter);
        filteredVisitors = filteredVisitors.filter(v => v.cluster === clusterFilter);
    }
    
    // Sort by name
    filteredMembers.sort((a, b) => a.name.localeCompare(b.name));
    filteredVisitors.sort((a, b) => a.name.localeCompare(b.name));
    
    // Build print content
    let printContent = `
        <div style="padding: 20px; font-family: Arial, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h2>UP Diliman Locale</h2>
                <h3>Members Information Report</h3>
                <p>As of ${currentDate}</p>
                ${typeFilter !== 'ALL' ? `<p><strong>Type:</strong> ${typeFilter}</p>` : ''}
                ${clusterFilter !== 'ALL' ? `<p><strong>Cluster:</strong> ${clusterFilter}</p>` : ''}
            </div>
    `;
    
    // Members Table
    if (typeFilter !== 'VISITORS' && filteredMembers.length > 0) {
        printContent += `
            <h3 style="color: #2196F3; border-bottom: 2px solid #2196F3; padding-bottom: 10px;">REGULAR MEMBERS</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: #2196F3; color: white;">
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">#</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Name</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Birthday</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Age</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Contact</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Facebook</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cluster</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Category</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredMembers.forEach((member, index) => {
            const calculatedAge = calculateAgeFromBirthday(member.birthday);
            printContent += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.name}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.birthday || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${calculatedAge}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.contactNumber || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.facebookAccount || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.cluster}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.category}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${member.status}</td>
                </tr>
            `;
        });
        
        printContent += `
                </tbody>
            </table>
            <p style="font-weight: bold; margin-top: 10px;">Total Members: ${filteredMembers.length}</p>
        `;
    }
    
    // Visitors Table
    if (typeFilter !== 'MEMBERS' && filteredVisitors.length > 0) {
        printContent += `
            <h3 style="color: #ff9800; border-bottom: 2px solid #ff9800; padding-bottom: 10px; margin-top: 30px;">VISITORS</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: #ff9800; color: white;">
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">#</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Name</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Birthday</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Age</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Contact</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Facebook</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Cluster</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Visitor Type</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Date Baptised</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Invited By</th>
                        <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Baptised By</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredVisitors.forEach((visitor, index) => {
            const calculatedAge = calculateAgeFromBirthday(visitor.birthday);
            printContent += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.name}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.birthday || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${calculatedAge}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.contactNumber || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.facebookAccount || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.cluster || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.visitorType || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.dateBaptised || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.invitedBy || 'N/A'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.baptisedBy || 'N/A'}</td>
                </tr>
            `;
                    <td style="border: 1px solid #ddd; padding: 8px;">${visitor.dateBaptised || 'N/A'}</td>
                </tr>
            `;
        });
        
        printContent += `
                </tbody>
            </table>
            <p style="font-weight: bold; margin-top: 10px;">Total Visitors: ${filteredVisitors.length}</p>
        `;
    }
    
    // Summary
    printContent += `
            <div style="margin-top: 30px; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
                <h4>SUMMARY</h4>
                ${typeFilter !== 'VISITORS' ? `<p>Total Members: <strong>${filteredMembers.length}</strong></p>` : ''}
                ${typeFilter !== 'MEMBERS' ? `<p>Total Visitors: <strong>${filteredVisitors.length}</strong></p>` : ''}
                <p style="font-size: 18px; margin-top: 15px;">Grand Total: <strong>${filteredMembers.length + filteredVisitors.length}</strong></p>
            </div>
        </div>
    `;
    
    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Members Report - ${currentDate}</title>
            <style>
                @media print {
                    body { padding: 10px; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            ${printContent}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    
    // Auto-print after content loads
    setTimeout(() => {
        printWindow.print();
    }, 500);
}
