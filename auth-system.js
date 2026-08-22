// ========================================
// ATTENDANCE APP - AUTHENTICATION SYSTEM
// Phase 1: Basic PIN Authentication
// ========================================

// ========================================
// CONFIGURATION
// ========================================

const AUTH_CONFIG = {
    ADMIN_PIN: '999888',           // Admin access for all features
    LEADER_PINS: {
        '260801': { name: 'KNL1 Leader', cluster: 'KNL 1' },
        '260802': { name: 'KNL2 Leader', cluster: 'KNL 2' },
        '260803': { name: 'KAINGIN Leader', cluster: 'KAINGIN' },
        '260804': { name: 'WHITE Leader', cluster: 'WHITE' },
        '260805': { name: 'CENTRAL Leader', cluster: 'CENTRAL' },
        '260806': { name: 'UP CAMPUS Leader', cluster: 'UP CAMPUS/CP GARCIA' },
        '260807': { name: 'CAMP AGUINALDO Leader', cluster: 'CAMP AGUINALDO' },
        '260808': { name: 'PANSOL Leader', cluster: 'PANSOL' }
    },
    SESSION_KEY: 'attendanceAuth',
    DEBOUNCE_MS: 3000
};

// ========================================
// USER ROLES
// ========================================

const USER_ROLES = {
    GUEST: 'guest',
    LEADER: 'leader',
    ADMIN: 'admin'
};

// ========================================
// CURRENT USER STATE
// ========================================

let currentUser = {
    role: USER_ROLES.GUEST,
    name: 'Guest',
    cluster: null,
    authenticated: false
};

// ========================================
// INITIALIZATION
// ========================================

// Check for existing session on page load
function initAuthSystem() {
    const savedAuth = sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY);
    
    if (savedAuth) {
        try {
            const authData = JSON.parse(savedAuth);
            currentUser = authData;
            console.log('✅ Restored session:', currentUser.name);
        } catch (e) {
            console.error('❌ Failed to restore session:', e);
            sessionStorage.removeItem(AUTH_CONFIG.SESSION_KEY);
        }
    }
    
    // Create and show user badge
    createUserBadge();
    updateUserBadge();
    
    // Apply role-based UI restrictions
    applyRoleBasedUI();
    
    console.log('✅ Auth system initialized');
}

// ========================================
// INPUT SANITIZATION (Security)
// ========================================

function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    
    return str.trim()
        .replace(/<script[^>]*>.*?<\/script>/gi, '')  // Remove scripts
        .replace(/<[^>]+>/g, '')                       // Remove HTML tags
        .replace(/[<>]/g, '');                         // Remove < and >
}

// ========================================
// AUTHENTICATION MODAL
// ========================================

function showAuthModal(requiredRole = USER_ROLES.LEADER, callback = null) {
    const roleText = requiredRole === USER_ROLES.ADMIN ? 'Administrator' : 'Church Leader';
    
    // Remove existing modal if present
    const existingModal = document.getElementById('auth-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                    background: rgba(0,0,0,0.8); z-index: 99999; display: flex; 
                    align-items: center; justify-content: center;">
            <div style="background: white; padding: 30px; border-radius: 15px; 
                        max-width: 400px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <h3 style="margin: 0 0 10px 0; color: #2196F3; text-align: center;">
                    🔐 ${roleText} Access
                </h3>
                <p style="color: #666; font-size: 14px; text-align: center; margin-bottom: 20px;">
                    This feature requires ${roleText} privileges
                </p>
                
                <input type="password" id="auth-pin-input" 
                       placeholder="Enter PIN" 
                       maxlength="6"
                       style="width: 100%; padding: 15px; font-size: 24px; 
                              text-align: center; border: 2px solid #e0e0e0; 
                              border-radius: 8px; letter-spacing: 8px;"
                       autofocus>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="closeAuthModal()" 
                            style="flex: 1; padding: 12px; border: none; 
                                   background: #757575; color: white; 
                                   border-radius: 8px; font-weight: bold; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="verifyAuth('${requiredRole}')" 
                            style="flex: 1; padding: 12px; border: none; 
                                   background: #2196F3; color: white; 
                                   border-radius: 8px; font-weight: bold; cursor: pointer;">
                        Verify
                    </button>
                </div>
                
                <p id="auth-error" style="color: #f44336; font-size: 13px; 
                                          text-align: center; margin: 10px 0 0 0; 
                                          display: none;">
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Store callback
    window._authCallback = callback;
    window._requiredRole = requiredRole;
    
    // Focus on PIN input
    setTimeout(() => {
        const input = document.getElementById('auth-pin-input');
        if (input) {
            input.focus();
            // Allow Enter key to submit
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    verifyAuth(requiredRole);
                }
            });
        }
    }, 100);
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.remove();
    window._authCallback = null;
    window._requiredRole = null;
}

// ========================================
// PIN VERIFICATION
// ========================================

function verifyAuth(requiredRole) {
    const pinInput = document.getElementById('auth-pin-input');
    const errorDisplay = document.getElementById('auth-error');
    
    if (!pinInput) return;
    
    const pin = pinInput.value.trim();
    
    if (!pin) {
        errorDisplay.textContent = '⚠️ Please enter your PIN';
        errorDisplay.style.display = 'block';
        return;
    }
    
    let authenticated = false;
    
    // Check Admin PIN
    if (pin === AUTH_CONFIG.ADMIN_PIN) {
        currentUser = {
            role: USER_ROLES.ADMIN,
            name: 'ADMIN',
            cluster: 'ALL',
            authenticated: true
        };
        authenticated = true;
    }
    // Check Leader PINs
    else if (AUTH_CONFIG.LEADER_PINS[pin]) {
        const leader = AUTH_CONFIG.LEADER_PINS[pin];
        currentUser = {
            role: USER_ROLES.LEADER,
            name: leader.name,
            cluster: leader.cluster,
            authenticated: true
        };
        authenticated = true;
    }
    
    if (authenticated) {
        // Check if user has sufficient role
        const hasAccess = 
            (requiredRole === USER_ROLES.ADMIN && currentUser.role === USER_ROLES.ADMIN) ||
            (requiredRole === USER_ROLES.LEADER && (currentUser.role === USER_ROLES.LEADER || currentUser.role === USER_ROLES.ADMIN));
        
        if (hasAccess) {
            // Save to session
            sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, JSON.stringify(currentUser));
            
            console.log('✅ Authenticated as:', currentUser.name);
            
            // Update UI
            updateUserBadge();
            applyRoleBasedUI();
            
            // Show success notification
            showNotification(`✅ Welcome, ${currentUser.name}!`, 'success');
            
            // Execute callback if provided
            if (window._authCallback) {
                setTimeout(() => {
                    window._authCallback();
                }, 300);
            }
            
            closeAuthModal();
        } else {
            errorDisplay.textContent = '❌ Insufficient privileges for this action';
            errorDisplay.style.display = 'block';
            pinInput.value = '';
            pinInput.focus();
        }
    } else {
        errorDisplay.textContent = '❌ Invalid PIN';
        errorDisplay.style.display = 'block';
        pinInput.value = '';
        pinInput.focus();
    }
}

// ========================================
// LOGOUT
// ========================================

function logoutUser() {
    if (currentUser.role === USER_ROLES.GUEST) {
        return; // Already logged out
    }
    
    if (confirm('Are you sure you want to logout?')) {
        currentUser = {
            role: USER_ROLES.GUEST,
            name: 'Guest',
            cluster: null,
            authenticated: false
        };
        
        sessionStorage.removeItem(AUTH_CONFIG.SESSION_KEY);
        
        updateUserBadge();
        applyRoleBasedUI();
        
        showNotification('👋 Logged out successfully', 'info');
    }
}

// ========================================
// USER BADGE
// ========================================

function createUserBadge() {
    // Remove existing badge if present
    const existingBadge = document.getElementById('user-badge');
    if (existingBadge) existingBadge.remove();
    
    const badge = document.createElement('div');
    badge.id = 'user-badge';
    badge.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(255,255,255,0.95);
        padding: 8px 15px;
        border-radius: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
    `;
    
    document.body.appendChild(badge);
}

function updateUserBadge() {
    const badge = document.getElementById('user-badge');
    if (!badge) {
        createUserBadge();
        return;
    }
    
    const roleEmoji = {
        guest: '👤',
        leader: '👥',
        admin: '👑'
    };
    
    const roleColor = {
        guest: '#757575',
        leader: '#4CAF50',
        admin: '#f44336'
    };
    
    let badgeHTML = `
        <span style="color: ${roleColor[currentUser.role]};">
            ${roleEmoji[currentUser.role]} ${currentUser.name}
        </span>
    `;
    
    // Add login/logout button
    if (currentUser.authenticated) {
        badgeHTML += `
            <span style="margin-left: 10px; color: #2196F3; cursor: pointer;" 
                  onclick="logoutUser()">
                🚪 Logout
            </span>
        `;
    } else {
        badgeHTML += `
            <span style="margin-left: 10px; color: #2196F3; cursor: pointer;" 
                  onclick="showAuthModal('${USER_ROLES.LEADER}')">
                🔓 Login
            </span>
        `;
    }
    
    badge.innerHTML = badgeHTML;
}

// ========================================
// ROLE-BASED UI CONTROL
// ========================================

function applyRoleBasedUI() {
    const role = currentUser.role;
    
    // DELETE buttons - Admin only
    // Method 1: Select by ID and onclick attributes
    const deleteButtons = document.querySelectorAll('#delete-btn, [onclick*="clearAllRecords"], [onclick*="deleteRecordsForDate"], [onclick*="deleteMember"]');
    deleteButtons.forEach(btn => {
        if (role === USER_ROLES.ADMIN) {
            btn.style.display = 'inline-block';
            btn.disabled = false;
        } else {
            btn.style.display = 'none';
            btn.disabled = true;
        }
    });
    
    // Method 2: Select all buttons with "Delete" text (catch-all for member delete button)
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
        const buttonText = btn.textContent.trim();
        // Check if button contains delete-related text
        if (buttonText.includes('🗑️ Delete') || 
            buttonText.includes('Delete') || 
            buttonText === '🗑️ Delete' ||
            btn.classList.contains('btn-danger') && buttonText.toLowerCase().includes('delete')) {
            if (role === USER_ROLES.ADMIN) {
                btn.style.display = 'inline-block';
                btn.disabled = false;
            } else {
                btn.style.display = 'none';
                btn.disabled = true;
            }
        }
    });
    
    // DATA MANAGEMENT SECTION - Admin only
    const dataManagementSection = document.getElementById('data-management-section');
    if (dataManagementSection) {
        if (role === USER_ROLES.ADMIN) {
            dataManagementSection.style.display = 'block';
        } else {
            dataManagementSection.style.display = 'none';
        }
    }
    
    // TAB RESTRICTIONS - Guest cannot access Records and Reports tabs
    const recordsTab = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
        btn.textContent.includes('Records')
    );
    const reportsTab = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
        btn.textContent.includes('Reports')
    );
    
    if (recordsTab) {
        if (role === USER_ROLES.GUEST) {
            // Disable Records tab for Guest
            recordsTab.style.opacity = '0.4';
            recordsTab.style.cursor = 'not-allowed';
            recordsTab.style.pointerEvents = 'none';
            recordsTab.title = 'Login required to access Records';
        } else {
            // Enable Records tab for authenticated users
            recordsTab.style.opacity = '1';
            recordsTab.style.cursor = 'pointer';
            recordsTab.style.pointerEvents = 'auto';
            recordsTab.title = '';
        }
    }
    
    if (reportsTab) {
        if (role === USER_ROLES.GUEST) {
            // Disable Reports tab for Guest
            reportsTab.style.opacity = '0.4';
            reportsTab.style.cursor = 'not-allowed';
            reportsTab.style.pointerEvents = 'none';
            reportsTab.title = 'Login required to access Reports';
        } else {
            // Enable Reports tab for authenticated users
            reportsTab.style.opacity = '1';
            reportsTab.style.cursor = 'pointer';
            reportsTab.style.pointerEvents = 'auto';
            reportsTab.title = '';
        }
    }
    
    // CLUSTER FILTER - Church Leaders see only their cluster
    const clusterFilter = document.getElementById('export-cluster-filter');
    if (clusterFilter && role === USER_ROLES.LEADER) {
        // Church Leader - show only their cluster
        const leaderCluster = currentUser.cluster;
        
        // Clear all options
        clusterFilter.innerHTML = '';
        
        // Add only the leader's cluster option
        const option = document.createElement('option');
        option.value = leaderCluster;
        option.textContent = leaderCluster;
        clusterFilter.appendChild(option);
        
        // Set as selected
        clusterFilter.value = leaderCluster;
        clusterFilter.disabled = true; // Disable dropdown since there's only one option
        
        console.log(`✅ Cluster filter restricted to: ${leaderCluster}`);
    } else if (clusterFilter && role === USER_ROLES.ADMIN) {
        // Admin - show all clusters (restore original options if needed)
        clusterFilter.disabled = false;
        
        // Ensure all options are present (in case they were removed before)
        const allClusters = [
            { value: 'ALL', text: 'ALL Clusters' },
            { value: 'CAMP AGUINALDO', text: 'CAMP AGUINALDO' },
            { value: 'CENTRAL', text: 'CENTRAL' },
            { value: 'KAINGIN', text: 'KAINGIN' },
            { value: 'KNL 1', text: 'KNL 1' },
            { value: 'KNL 2', text: 'KNL 2' },
            { value: 'PANSOL', text: 'PANSOL' },
            { value: 'UP CAMPUS/CP GARCIA', text: 'UP CAMPUS/CP GARCIA' },
            { value: 'WHITE', text: 'WHITE' }
        ];
        const currentOptions = Array.from(clusterFilter.options).map(opt => opt.value);
        
        // Only rebuild if options are missing
        if (currentOptions.length < allClusters.length) {
            clusterFilter.innerHTML = '';
            allClusters.forEach(cluster => {
                const option = document.createElement('option');
                option.value = cluster.value;
                option.textContent = cluster.text;
                clusterFilter.appendChild(option);
            });
        }
        
        console.log('✅ Cluster filter: All clusters available (Admin)');
    }
    
    // Update member/visitor counts based on cluster filter
    if (typeof updateMemberStats === 'function') {
        updateMemberStats();
    }
    
    console.log('✅ UI updated for role:', role);
}

// ========================================
// NOTIFICATION SYSTEM
// ========================================

function showNotification(message, type = 'info') {
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        warning: '#ff9800',
        info: '#2196F3'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 99999;
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ========================================
// AUTHORIZATION CHECKS
// ========================================

function requireAuth(requiredRole, callback) {
    if (currentUser.role === USER_ROLES.GUEST) {
        showAuthModal(requiredRole, callback);
        return false;
    }
    
    // Check if current role is sufficient
    if (requiredRole === USER_ROLES.ADMIN && currentUser.role !== USER_ROLES.ADMIN) {
        showAuthModal(USER_ROLES.ADMIN, callback);
        return false;
    }
    
    return true;
}

function isAdmin() {
    return currentUser.role === USER_ROLES.ADMIN;
}

function isLeaderOrAdmin() {
    return currentUser.role === USER_ROLES.LEADER || currentUser.role === USER_ROLES.ADMIN;
}

function isGuest() {
    return currentUser.role === USER_ROLES.GUEST;
}

// ========================================
// INITIALIZATION ON PAGE LOAD
// ========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthSystem);
} else {
    initAuthSystem();
}

// ========================================
// EXPORT FOR USE IN app.js
// ========================================

window.AuthSystem = {
    currentUser: () => currentUser,
    requireAuth,
    isAdmin,
    isLeaderOrAdmin,
    isGuest,
    showAuthModal,
    logoutUser,
    sanitizeInput,
    showNotification,
    USER_ROLES
};

// ========================================
// EXPOSE FUNCTIONS GLOBALLY FOR INLINE ONCLICK HANDLERS
// ========================================

window.verifyAuth = verifyAuth;
window.closeAuthModal = closeAuthModal;
window.logoutUser = logoutUser;
window.showAuthModal = showAuthModal;
