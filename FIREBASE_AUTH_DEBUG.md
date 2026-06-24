# Firebase Authentication Troubleshooting Guide

## ✅ Quick Diagnostics

**In browser console, run:**
```javascript
checkFirebaseConfig()  // Shows all env vars
getFirebaseConfig()    // Returns the config object
```

Expected output: All vars should show as ✅ with values.

---

## 🔍 Common Issues & Solutions

### Issue 1: "Firebase not initialized"
**Symptom:** Error says Firebase is not initialized

**Solution:**
1. Check `frontend/.env.local` has all 6 Firebase vars:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

2. Get real values from Firebase Console:
   - Go to https://console.firebase.google.com
   - Select your project (nextrust-6b6ba)
   - Project Settings → Copy Web config
   - Paste into `.env.local`

3. Restart frontend: `pnpm dev`

---

### Issue 2: "User not found" or "Invalid credentials"
**Symptom:** Sign-in fails with "auth/user-not-found"

**Possible Causes:**
1. User doesn't exist (never signed up)
2. Email/password mismatch
3. User was created in wrong Firebase project

**Solution:**
1. **Create user via Sign-Up first**
   - Go to http://localhost:8080/sign-up
   - Fill out form with email & password (8+ chars)
   - Choose Customer or Worker role
   - Wait for "success" message
   - Check browser console for: `[useAuth] Profile loaded after registration`

2. **If sign-up fails**, check:
   - Backend is running: `cd backend && pnpm dev`
   - CORS is working: Check Network tab for `/api/auth/register`
   - Look for errors in backend console

3. **Verify user was created**
   - Go to Firebase Console → Authentication
   - Users tab should show your email
   - Click user → should see UID

4. **Verify profile was created**
   - Firebase Console → Firestore
   - `users` collection → find document with your UID
   - Should have fields: `role`, `trustScore`, `email`, `name`, `accountStatus`

---

### Issue 3: "auth/invalid-credential"
**Symptom:** Right email but wrong password warning

**Solution:**
1. Verify exact password you used during sign-up
2. Passwords are case-sensitive
3. Minimum 8 characters required
4. If forgot password, delete user from Firebase Console and re-register

---

### Issue 4: Sign-in works but redirect doesn't happen
**Symptom:** Signed in but stuck on sign-in page

**Solution:**
1. Check browser console for `[Sign In]` messages
2. Look for profile loading: `[useAuth] Profile found`
3. If no profile messages:
   - Firestore is offline or profile wasn't created
   - Re-register the user
   - Check Firestore `users` collection has document for your UID

---

### Issue 5: CORS Error when signing up
**Symptom:** "Response to preflight request doesn't pass access control check"

**Solution:**
1. Backend CORS already fixed to allow localhost:8080
2. Restart backend: `cd backend && pnpm dev`
3. Wait 5 seconds then try again
4. Check backend logs for: `[Server] CORS configured for origin:`

---

## 🛠️ Testing Checklist

### Step 1: Verify Backend is Ready
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

### Step 2: Verify Frontend Env Vars
In browser console:
```javascript
checkFirebaseConfig()  // All should be ✅
```

### Step 3: Test Sign-Up Flow
1. Go to http://localhost:8080/sign-up
2. Enter:
   - Name: "Test User"
   - Email: "test@example.com"
   - Password: "Password123"
   - Role: Customer
3. Click "Create account"
4. **Check browser console for:**
   ```
   [useAuth] Calling backend register: {...}
   [useAuth] Backend response status: 201
   [useAuth] Profile loaded after registration: {...}
   [useAuth] Login successful
   ```
5. Should redirect to `/dashboard/customer`

### Step 4: Test Sign-In Flow
1. Go to http://localhost:8080/sign-in
2. Enter same email & password as sign-up
3. Click "Sign in"
4. **Check browser console for:**
   ```
   [Sign In] Attempting login for: test@example.com
   [useAuth] Starting login for email: test@example.com
   [useAuth] Firebase login successful for user: ABC123...
   [useAuth] Got ID token for user: ABC123...
   [useAuth] Fetching profile from Firestore
   [useAuth] Profile found: {uid: ABC123, role: 'customer'}
   [Sign In] Login successful
   ```
5. Should redirect to `/dashboard/customer`

---

## 📋 Verification Checklist

- [ ] `frontend/.env.local` has all 6 Firebase env vars
- [ ] Env vars match Firebase Console settings
- [ ] Backend running on port 3001
- [ ] Frontend running on port 8080
- [ ] No CORS errors in browser Network tab
- [ ] User appears in Firebase Console → Authentication
- [ ] User profile document exists in Firestore `users` collection
- [ ] Profile has `role` field set to 'customer' or 'worker'

---

## 🔐 Backend Sign-In Details (for reference)

Frontend uses Firebase SDK directly - no backend sign-in call needed.

But if debugging, backend `/api/auth/login` endpoint:
- Accepts Firebase `idToken` (JWT from Firebase client)
- Verifies token with Firebase Admin SDK
- Returns user data from Firestore

This is automatic in the flow above.

---

## 🆘 If Still Failing

**Collect this info and check:**

1. **Browser Console** (F12 → Console tab)
   - Copy all `[useAuth]` and `[Sign In]` logs
   - Copy any red errors

2. **Backend Console** 
   - Logs from `pnpm dev` output
   - Look for auth errors

3. **Network Tab** (F12 → Network tab)
   - Check `/api/auth/register` response
   - Check for CORS headers

4. **Firebase Console**
   - Go to nextrust-6b6ba project
   - Authentication → Users (should see your email)
   - Firestore → users collection (should see your document)

5. **Verify .env files match:**
   - Frontend: `frontend/.env.local`
   - Backend: `backend/.env`
   - Both should reference same Firebase project

---

## 💡 Quick Reset (Start Fresh)

If things are broken:

1. **Delete all test users** in Firebase Console → Authentication → Delete
2. **Delete all test documents** in Firestore → Delete `users` collection
3. **Clear browser storage:**
   ```javascript
   // In console:
   localStorage.clear()
   sessionStorage.clear()
   ```
4. **Restart everything:**
   ```bash
   # Terminal 1
   cd backend && pnpm dev
   
   # Terminal 2  
   cd frontend && pnpm dev
   ```
5. **Start over with sign-up**

---

**Last Updated:** June 2026
**Firebase Project:** nextrust-6b6ba
**Frontend Port:** 8080
**Backend Port:** 3001
