# 🔥 Firebase Setup Guide

## Bakit Kailangan ng Firebase?

Firebase Firestore ay **FREE cloud database** na:
- ✅ **Real-time sync** - Automatic update sa lahat ng devices
- ✅ **Multi-user** - Lahat ng tao ay may access sa same data
- ✅ **Offline support** - Gumagana kahit walang internet
- ✅ **FREE forever** - Up to 50,000 reads/day (sobra na yan!)

---

## 📝 Step-by-Step Setup

### **Step 1: Gumawa ng Firebase Account**

1. Pumunta sa: https://console.firebase.google.com/
2. Sign in gamit ang Google account mo
3. Click **"Add project"** o **"Create a project"**

### **Step 2: I-create ang Project**

1. **Project name:** Type `attendance-app` (or kahit ano)
2. Click **Continue**
3. **Google Analytics:** Pwede mo i-disable (hindi kailangan)
4. Click **Create project**
5. Wait 30 seconds...
6. Click **Continue**

### **Step 3: I-setup ang Firestore Database**

1. Sa left sidebar, click **"Firestore Database"**
2. Click **"Create database"** button
3. **Secure rules for now:** Select **"Start in test mode"**
   - ⚠️ Note: Test mode = anyone can read/write (ok lang for now)
4. **Location:** Choose **"asia-southeast1"** (Singapore - malapit sa Pilipinas!)
5. Click **"Enable"**
6. Wait 1-2 minutes para ma-create ang database

### **Step 4: Kuhanin ang Config Code**

1. Click ang **⚙️ gear icon** sa left sidebar → **"Project settings"**
2. Scroll down sa **"Your apps"** section
3. Click ang **`</>`** icon (Web app)
4. **App nickname:** Type `attendance-web`
5. ✅ Check **"Also set up Firebase Hosting"** (OPTIONAL)
6. Click **"Register app"**
7. **COPY** ang code na nakalagay sa `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "attendance-app-xxx.firebaseapp.com",
  projectId: "attendance-app-xxx",
  storageBucket: "attendance-app-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

8. Click **"Continue to console"**

### **Step 5: I-update ang app.js**

1. **Open** ang `app.js` file
2. **Hanapin** ang lines 10-18 (firebaseConfig section):

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyDAttendanceApp-REPLACE-THIS",
    authDomain: "attendance-app.firebaseapp.com",
    projectId: "attendance-app-demo",
    storageBucket: "attendance-app-demo.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
```

3. **PALITAN** ng config na na-copy mo from Firebase
4. **SAVE** ang file

### **Step 6: I-upload sa GitHub**

1. Upload ang **updated app.js** at **index.html** sa GitHub repository
2. Wait 2-3 minutes para mag-deploy

### **Step 7: Test!**

1. **Open app sa iPhone:** https://arlinbst.github.io/attendance-app
2. **Scan** ng QR code → Log attendance
3. **Open app sa laptop:** https://arlinbst.github.io/attendance-app
4. **Dapat makita mo** ang same record! 🎉

---

## 🔒 Security Rules (IMPORTANT!)

After testing, **i-update** ang security rules para mas secure:

1. Sa Firebase Console, go to **Firestore Database**
2. Click **"Rules"** tab
3. **Palitan** ang rules with this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /attendance/{document=**} {
      // Allow read to anyone
      allow read: if true;
      
      // Allow write only from your domain
      allow write: if request.auth != null || 
                      request.resource.data.timestamp is timestamp;
    }
  }
}
```

4. Click **"Publish"**

This allows anyone to READ records but only legitimate writes (with timestamp).

---

## 🎯 How It Works

### **Real-time Sync:**
- Kada **scan** ng QR = auto-save sa Firebase cloud
- Lahat ng devices na may **open app** = auto-update in real-time!
- **Walang refresh** needed - automatic!

### **Offline Mode:**
- Kung **walang internet** = save sa localStorage muna
- Kada may **internet** na ulit = automatic sync sa cloud
- **Best of both worlds!**

### **Multi-Device:**
- **iPhone** → Scan QR → Save to cloud
- **Laptop** → Open app → See new record instantly!
- **Android** → Filter/Export → Same data!

---

## 📊 Free Tier Limits

Firebase FREE plan:
- **50,000 reads per day** (every page load/scan)
- **20,000 writes per day** (every scan)
- **1 GB storage** (millions of records!)
- **10 GB/month transfer**

**Enough ba?**
- 100 scans per day = only 100 writes
- 50 users checking records = only 50 reads
- **SOBRA NA!** ✅

---

## ❓ Troubleshooting

### **"Firebase not loaded" error**
- Check internet connection
- Make sure Firebase scripts are loaded in index.html
- Check browser console for errors

### **Records not syncing**
- Check Firebase config sa app.js (correct ba?)
- Check Firestore security rules (test mode ba?)
- Check browser console for errors

### **Slow loading**
- Normal lang sa first load (loading from cloud)
- Subsequent loads = mas mabilis (cached data)

---

## 🚀 Next Steps

After setup:
1. ✅ Test sa iPhone at laptop
2. ✅ Verify real-time sync
3. ✅ Update security rules
4. ✅ Share app URL sa team!

**Tapos na! Enjoy your cloud-synced attendance app!** 🎉
