# 📋 Attendance Monitoring System

FREE mobile-friendly QR Code Attendance Monitoring App

## ✨ Features

- ✅ **QR Code Scanning** - Scan QR codes using your phone's camera
- 📱 **Mobile-Friendly** - Works perfectly on smartphones
- 💾 **Offline Support** - Works without internet (PWA)
- 📊 **Records Management** - View and filter attendance records
- 🎫 **QR Code Generator** - Create QR codes for employees
- 📥 **Export to CSV** - Download attendance records
- 🔒 **Local Storage** - All data stored securely on your device

## 🚀 How to Use

### Installation on Mobile Phone:

1. **Using a Web Browser:**
   - Open `index.html` in any browser (Chrome, Safari, Firefox)
   - Click browser menu → "Add to Home Screen" or "Install App"
   - The app will be installed like a native app

2. **Using a Local Server:**
   - Install Python (if not installed)
   - Open terminal in the `attendance-app` folder
   - Run: `python -m http.server 8000`
   - Open browser: `http://localhost:8000`
   - Install to home screen

3. **Using GitHub Pages (Online - FREE):**
   - Create a GitHub account
   - Create a new repository
   - Upload all files to the repository
   - Enable GitHub Pages in repository settings
   - Access via: `https://yourusername.github.io/repository-name`

### Using the App:

#### 1️⃣ Generate QR Codes:
- Go to "Generate QR" tab
- Enter employee NAME and CLUSTER
- Click "Generate QR Code"
- Download the QR code image
- Print or share the QR code with employees

#### 2️⃣ Scan Attendance:
- Go to "Scan" tab
- Click "Start Scanner"
- Point camera at QR code
- Attendance is automatically logged!

#### 3️⃣ View Records:
- Go to "Records" tab
- Filter by date or cluster
- Export to CSV for backup
- View daily statistics

## 📱 Mobile Browser Requirements

- **Android:** Chrome, Firefox, or Samsung Internet
- **iOS:** Safari 14+ or Chrome
- Camera permission required for scanning

## 💡 Tips

- Generate QR codes for all employees first
- Print QR codes on ID cards or badges
- Data is stored locally on your device
- Export records regularly for backup
- Works offline after first load

## 🔧 Technical Stack

- HTML5
- CSS3 (Responsive Design)
- JavaScript (Vanilla)
- html5-qrcode library
- QRCode.js library
- Progressive Web App (PWA)

## 📝 Data Format

QR codes contain JSON data:
```json
{
  "name": "Employee Name",
  "cluster": "Department/Cluster Name"
}
```

## 🆓 100% FREE

- No subscription fees
- No ads
- No data collection
- Open source
- Works offline

## 🌐 Hosting Options (All FREE)

1. **GitHub Pages** - Recommended for online access
2. **Netlify** - Easy drag-and-drop deployment
3. **Vercel** - Fast and free hosting
4. **Local Server** - Python, Node.js, or any web server

## 📞 Support

For issues or questions, check:
- Browser console for errors
- Camera permissions are enabled
- JavaScript is enabled
- Using HTTPS (required for camera access online)

## 🔐 Privacy

All data is stored locally on your device using browser localStorage. No data is sent to any server.

---

**Made with ❤️ for FREE attendance monitoring**
