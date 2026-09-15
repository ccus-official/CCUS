/* =========================================================
   CCUS - app.js (Optimized, Secure & Bug-Free)
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updateEmail
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, limit, onSnapshot, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

/* Config & Auth Initialization */
const firebaseConfig = {
  apiKey: "AIzaSyBzUV7DuR87GmVwvbzwww_tfxlpzfBMp6k",
  authDomain: "ccus-6900f.firebaseapp.com",
  projectId: "ccus-6900f",
  storageBucket: "ccus-6900f.firebasestorage.app",
  messagingSenderId: "42142918720",
  appId: "1:42142918720:web:d2b907be0bb8c1575097a5",
  measurementId: "G-CP5G5Q4M96N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
setPersistence(auth, browserLocalPersistence).catch(console.error);

/* Global States & Dynamic Key Storage */
let currentUser = null, currentUserData = null;
let selectedRechargeAmount = 0, selectedRechargeLevel = null, selectedDepositPaymentMethod = null, selectedWithdrawAmount = 0;
let rechargeLevels = [], withdrawLevels = [], userPaymentMethods = [], vipLevelsList = [];
window.dailyTasksCache = window.dailyTasksCache || [];
window.taskSettings = window.taskSettings || { active: true, taskCount: 0, rewardPerTask: 0 };
let unsubs = {};

const COUNT_KEY = "ccus_announcement_unread_count";
const SEEN_KEY = "ccus_seen_announcement_ids";
const INITIALIZED_KEY = "ccus_announcement_initialized";

/* Utilities & Helpers */
const $ = id => document.getElementById(id);
const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
const money = amt => Number(amt || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = str => String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const showElement = id => $(id)?.classList.remove("hidden");
const hideElement = id => $(id)?.classList.add("hidden");
const getTime = val => val?.toMillis ? val.toMillis() : (new Date(val).getTime() || 0);
const getLocalDateString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const isTaskAbortError = err => ["aborterror", "aborted", "cancelled", "canceled", "failed to fetch", "network error"].some(m => String(err?.name || err?.message || "").toLowerCase().includes(m));
const isTaskPermissionError = err => err?.code === "permission-denied";

/* Storage Helpers */
const getStorage = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const getSeenIds = () => getStorage(SEEN_KEY, []);

function saveSeenIds(ids) {
  try {
    const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
    localStorage.setItem(SEEN_KEY, JSON.stringify(uniqueIds));
  } catch (e) { console.warn("Failed to save announcement seen IDs:", e); }
  updateAnnouncementNotificationCount();
}

function getAnnouncementUnreadCount() { return Math.max(0, Number(localStorage.getItem(COUNT_KEY) || 0)); }
function setAnnouncementUnreadCount(count) {
  localStorage.setItem(COUNT_KEY, String(Math.max(0, Number(count || 0))));
  updateAnnouncementNotificationCount();
}

/* Operating System Logic */
async function getTodayOperatingStatus() {
  if (new Date().getDay() === 0) return { allowed: false, message: "Today is Sunday", reason: "sunday" };
  try {
    const snap = await getDoc(doc(db, "settings", "calendar"));
    if (!snap.exists()) return { allowed: true, message: "", reason: "normal" };
    const data = snap.data() || {}, today = getLocalDateString();
    const closed = [...(data.closedDates || []), ...(data.restDates || []), ...(data.closedDays || []), ...(data.dates || [])].map(String);
    if (closed.includes(today) || data.closed || data.isClosed) return { allowed: false, message: "Today is Rest Day", reason: "rest" };
    const daySetting = data.days?.[today];
    if (daySetting === true || daySetting === "true" || daySetting?.closed || daySetting?.isClosed || daySetting?.rest || daySetting?.restDay) {
      return { allowed: false, message: "Today is Rest Day", reason: "rest" };
    }
    return { allowed: true, message: "", reason: "normal" };
  } catch (e) { return { allowed: true, message: "", reason: "calendar-error" }; }
}

async function hasApprovedDeposit(userId) {
  if (!userId) return false;
  try { return !(await getDocs(query(collection(db, "rechargeRequests"), where("userId", "==", userId), where("status", "==", "approved"), limit(1)))).empty; }
  catch (e) { return false; }
}

function firebaseErrorMessage(err) {
  switch (err?.code) {
    case "auth/invalid-credential": case "auth/wrong-password": return "Invalid email or password.";
    case "auth/user-not-found": return "No user found with this email.";
    case "auth/email-already-in-use": return "This email is already registered.";
    case "auth/too-many-requests": return "Too many attempts. Please try again later.";
    case "auth/network-request-failed": return "Network error. Check connection.";
    default: return err?.message || "An error occurred. Try again.";
  }
}

function showMessage(msg) {
  for (const id of ["loginMessage", "signupMessage", "withdrawMessage", "personalInfoMessage", "personalInformationMessage"]) {
    const box = $(id);
    if (box && !box.closest(".hidden")) { box.textContent = msg; box.className = "message error"; return; }
  }
  alert(msg);
}

window.openTelegramSupport = () => window.open("https://t.me/CCUSSuppor", "_blank", "noopener,noreferrer");

/* Auth Actions */
window.loginUser = async () => {
  const e = $("loginEmail")?.value?.trim(), p = $("loginPassword")?.value;
  if (!e || !p) return showMessage("Please enter email & password.");
  try { await signInWithEmailAndPassword(auth, e, p); } catch (err) { showMessage(firebaseErrorMessage(err)); }
};

window.logoutUser = async () => { try { cleanupListeners(); await signOut(auth); } catch (err) { showMessage(firebaseErrorMessage(err)); } };

window.forgotPassword = async () => {
  const e = $("loginEmail")?.value?.trim();
  if (!e) return showMessage("Please enter email first.");
  try { await sendPasswordResetEmail(auth, e); showMessage("Reset link sent."); } catch (err) { showMessage(firebaseErrorMessage(err)); }
};

window.signupUser = async () => {
  const name = $("signupName")?.value?.trim(), e = $("signupEmail")?.value?.trim(), p = $("signupPassword")?.value, cp = $("signupConfirmPassword")?.value, ref = $("referralCode")?.value?.trim();
  if (!name || !e) return showMessage("Fill all required fields.");
  if (p.length < 6 || p !== cp) return showMessage(p.length < 6 ? "Password must be at least 6 chars." : "Passwords do not match.");
  try {
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    await updateProfile(cred.user, { displayName: name });
    const code = "CCUS" + cred.user.uid.substring(0, 6).toUpperCase();
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid, fullName: name, email: e, accountNumber: "CCUS" + cred.user.uid.substring(0, 8).toUpperCase(),
      referralCode: code, referredBy: ref || "", totalBalance: 0, totalRecharge: 0, vipLevel: "VIP 0", createdAt: serverTimestamp()
    });
    if (ref) await addDoc(collection(db, "referrals"), { referredUserId: cred.user.uid, referredUserName: name, referralCode: ref, createdAt: serverTimestamp() }).catch(console.warn);
    showMessage("Account created.");
  } catch (err) { showMessage(firebaseErrorMessage(err)); }
};

/* Page Routing & Cleanups */
function hideAllPages() { ["loginPage","signupPage","homePage","tasksPage","walletPage","depositPage","withdrawPage","profilePage","referralPage","helpPage","aboutPage","vipPage","announcementsPage"].forEach(hideElement); }

function updateBottomNav(activePage) {
  const items = $("bottomNav")?.querySelectorAll(".nav-item");
  if (!items) return;
  items.forEach(i => i.classList.remove("active"));
  const idx = { home:0, tasks:1, vip:1, team:2, referral:2, wallet:3, profile:4 }[activePage];
  if (idx !== undefined && items[idx]) items[idx].classList.add("active");
}

function clearPageSpecificListeners() {
  ["rechargeLevels","withdrawLevels","userPaymentMethods","rechargeHistory","withdrawHistory","tasks","vipLevels","teamCommissions"].forEach(k => { if (unsubs[k]) { unsubs[k](); unsubs[k] = null; } });
  if (window.ccusAnnouncementUnsubscribe) { window.ccusAnnouncementUnsubscribe(); window.ccusAnnouncementUnsubscribe = null; }
}

function cleanupListeners() { if (unsubs.user) unsubs.user(); unsubs = {}; clearPageSpecificListeners(); }

window.openPage = function (page) {
  if (["login", "signup"].includes(page)) { cleanupListeners(); hideAllPages(); hideElement("bottomNav"); showElement(page === "login" ? "loginPage" : "signupPage"); return; }
  if (!currentUser) return window.showLogin();
  clearPageSpecificListeners(); hideAllPages();
  const pageMap = { home: "homePage", tasks: "tasksPage", wallet: "walletPage", deposit: "depositPage", withdraw: "withdrawPage", profile: "profilePage", referral: "referralPage", team: "referralPage", help: "helpPage", about: "aboutPage", vip: "vipPage" };
  
  if (page === "announcements") {
    if ($("announcementsPage")) { showElement("announcementsPage"); showElement("bottomNav"); updateBottomNav("home"); loadAnnouncements(true); return; }
    page = "home";
  }
  showElement(pageMap[page] || "homePage"); showElement("bottomNav"); updateBottomNav(page);

  switch (page) {
    case "home": updateUserUI(); loadAnnouncements(); break;
    case "tasks": updateUserUI(); loadDailyTasks(); break;
    case "vip": updateUserUI(); loadVIPLevels(); break;
    case "wallet": updateUserUI(); loadRechargeHistory(); loadWithdrawHistory(); break;
    case "deposit": resetRechargePage(); loadRechargeLevels(); loadUserPaymentMethods(); break;
    case "withdraw": resetWithdrawPage(); updateUserUI(); loadWithdrawLevels(); loadWithdrawHistory(); break;
    case "profile": updateUserUI(); loadPersonalInformation(); break;
    case "referral": case "team": updateUserUI(); loadReferral(); break;
  }
};
window.navigate = window.openPage;
window.showLogin = () => { cleanupListeners(); hideAllPages(); hideElement("bottomNav"); showElement("loginPage"); };
window.showSignup = () => { cleanupListeners(); hideAllPages(); hideElement("bottomNav"); showElement("signupPage"); };

/* Auth State Listener */
onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  if (!user) { currentUserData = null; cleanupListeners(); hideAllPages(); hideElement("bottomNav"); showElement("loginPage"); updateAnnouncementNotificationCount(); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUserData = snap.exists() ? snap.data() : null;
    hideAllPages(); showElement("homePage"); showElement("bottomNav"); updateBottomNav("home");
    updateUserUI(); startUserListener(); loadAnnouncements(); checkAndProcessVIPPayouts();
  } catch (e) { console.error(e); }
});

function startUserListener() {
  if (!currentUser) return;
  if (unsubs.user) unsubs.user();
  unsubs.user = onSnapshot(doc(db, "users", currentUser.uid), snap => { if (snap.exists()) { currentUserData = snap.data(); updateUserUI(); } });
}

function updateUserUI() {
  if (!currentUserData) return;
  const b = money(currentUserData.totalBalance), r = money(currentUserData.totalRecharge);
  ["totalBalance", "walletTotalBalance", "withdrawTotalBalance"].forEach(id => setText(id, b));
  ["totalRecharge", "walletTotalRecharge"].forEach(id => setText(id, r));
  setText("profileName", currentUserData.fullName || currentUser?.displayName || "CCUS User");
  setText("profileEmail", currentUserData.email || currentUser?.email || "No email");
  setText("profileAccountNumber", currentUserData.accountNumber || "—");
  setText("referralCodeDisplay", currentUserData.referralCode || "");
  loadPersonalInformation();
}

/* Personal Information System */
function loadPersonalInformation() {
  if (!currentUser) return;
  const data = currentUserData || {};
  const setVal = (id, value) => { const el = $(id); if (el) el.value = value ?? ""; };

  setVal("personalFullName", data.fullName || currentUser.displayName || "");
  setVal("personalEmail", data.email || currentUser.email || "");
  setVal("personalAccountNumber", data.accountNumber || "");
  setVal("personalPaymentMethod", data.withdrawPaymentMethod || "");

  hidePersonalInformationMessage();
}

function showPersonalInformationMessage(message, type = "success") {
  const box = $("personalInfoMessage");
  if (!box) return;
  const styles = {
    success: { bg: "#e8f7ee", color: "#198754", border: "1px solid #b7e4c7" },
    error:   { bg: "#fdeaea", color: "#dc3545", border: "1px solid #f5c2c7" },
    info:    { bg: "#eef5ff", color: "#0d6efd", border: "1px solid #b6d4fe" }
  };
  const style = styles[type] || styles.info;
  box.textContent = message;
  box.className = `message ${type}`;
  box.style.background = style.bg; box.style.color = style.color; box.style.border = style.border;
  box.classList.remove("hidden");
}

function hidePersonalInformationMessage() {
  const box = $("personalInfoMessage");
  if (!box) return;
  box.textContent = ""; box.className = "hidden";
}

window.savePersonalInformation = async function () {
  if (!currentUser) return showPersonalInformationMessage("Please login first.", "error");
  if (window._ccusPersonalInformationSaving) return;

  const getValue = id => $(id)?.value?.trim() || "";
  const name = getValue("personalFullName");
  const email = getValue("personalEmail");
  const accountNumber = getValue("personalAccountNumber");
  const paymentMethod = getValue("personalPaymentMethod");
  const password = $("personalPassword")?.value || "";

  if (!name) return showPersonalInformationMessage("Please enter your full name.", "error");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showPersonalInformationMessage("Please enter a valid email address.", "error");
  if (!accountNumber) return showPersonalInformationMessage("Please enter your account number.", "error");
  if (!password) return showPersonalInformationMessage("Please enter your current password.", "error");

  const saveButton = $("savePersonalInformationBtn");
  window._ccusPersonalInformationSaving = true;

  try {
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Saving..."; }
    const currentEmail = currentUser.email || currentUserData?.email || "";

    const credential = EmailAuthProvider.credential(currentEmail, password);
    await reauthenticateWithCredential(currentUser, credential);

    if (name !== (currentUser.displayName || "")) await updateProfile(currentUser, { displayName: name });
    if (email.toLowerCase() !== currentEmail.toLowerCase()) await updateEmail(currentUser, email);

    await updateDoc(doc(db, "users", currentUser.uid), {
      fullName: name, email: email, accountNumber: accountNumber, withdrawPaymentMethod: paymentMethod, updatedAt: serverTimestamp()
    });

    currentUserData = { ...(currentUserData || {}), fullName: name, email: email, accountNumber: accountNumber, withdrawPaymentMethod: paymentMethod };
    updateUserUI();
    showPersonalInformationMessage("Personal information saved successfully.", "success");
  } catch (error) {
    showPersonalInformationMessage(firebaseErrorMessage(error), "error");
  } finally {
    window._ccusPersonalInformationSaving = false;
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "Save"; }
  }
};
window.saveProfile = window.savePersonalInformation;

/* Recharge System */
function loadRechargeLevels() {
  if (!$("rechargeAmountList")) return;
  if (unsubs.rechargeLevels) unsubs.rechargeLevels();
  unsubs.rechargeLevels = onSnapshot(collection(db, "rechargeLevels"), snap => {
    rechargeLevels = [];
    snap.forEach(d => {
      const data = d.data() || {}, amt = Number(data.amount || 0);
      if (data.active !== false && amt > 0) rechargeLevels.push({ id: d.id, amount: amt, depositAmount: amt, level: data.level || data.name || `Level ${d.id}`, commission: Number(data.commission || 0), order: Number(data.order ?? 9999), taskLimit: Number(data.taskLimit ?? 0) });
    });
    rechargeLevels.sort((a,b) => (a.order - b.order) || (a.amount - b.amount));
    renderRechargeLevels(); renderTeamDepositLevels(rechargeLevels);
  });
}

function renderRechargeLevels() {
  const container = $("rechargeAmountList");
  if (!container) return;
  container.innerHTML = rechargeLevels.length === 0 ? `<p style="text-align:center;color:#777;padding:12px;">No recharge levels available.</p>` : "";
  rechargeLevels.forEach(lvl => {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "amount-btn";
    btn.innerHTML = `<strong>${money(lvl.amount)} ETB</strong>`;
    btn.onclick = () => {
      selectedRechargeAmount = lvl.amount; selectedRechargeLevel = lvl;
      if ($("rechargeAmount")) $("rechargeAmount").value = lvl.amount;
      container.querySelectorAll(".amount-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
    container.appendChild(btn);
  });
}

function resetRechargePage() {
  selectedRechargeAmount = 0; selectedRechargeLevel = null; selectedDepositPaymentMethod = null;
  showElement("rechargeStep1"); hideElement("rechargeStep2"); hideElement("rechargeStep3"); hideElement("rechargePending");
  if ($("rechargeAmount")) $("rechargeAmount").value = "";
  if ($("transactionId")) $("transactionId").value = "";
}

function loadUserPaymentMethods() {
  const container = $("depositPaymentMethods"); if (!container) return;
  if (unsubs.userPaymentMethods) unsubs.userPaymentMethods();
  unsubs.userPaymentMethods = onSnapshot(collection(db, "settings", "paymentMethods", "methods"), snap => {
    userPaymentMethods = [];
    snap.forEach(d => { if (d.data()?.active !== false) userPaymentMethods.push({ id: d.id, name: d.data().name || "Payment", ...d.data() }); });
    userPaymentMethods.sort((a,b) => Number(a.order ?? 9999) - Number(b.order ?? 9999));
    renderPaymentMethods();
  });
}

function renderPaymentMethods() {
  const container = $("depositPaymentMethods"); if (!container) return;
  container.innerHTML = userPaymentMethods.length === 0 ? `<p style="text-align:center;color:#777;">No payment methods available.</p>` : "";
  userPaymentMethods.forEach(m => {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "payment-method-btn";
    btn.style.cssText = "width:100%;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px;background:#fff;";
    btn.textContent = m.name;
    btn.onclick = () => {
      selectedDepositPaymentMethod = m;
      container.querySelectorAll(".payment-method-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
    container.appendChild(btn);
  });
}

window.goToPaymentMethod = () => {
  const inputAmt = Number($("rechargeAmount")?.value || 0);
  if (inputAmt > 0) { selectedRechargeAmount = inputAmt; selectedRechargeLevel = rechargeLevels.find(l => l.amount === inputAmt) || null; }
  if (selectedRechargeAmount <= 0) return alert("Please select or enter a valid amount.");
  setText("transferAmount", `ETB ${money(selectedRechargeAmount)}`);
  hideElement("rechargeStep1"); showElement("rechargeStep2"); loadUserPaymentMethods();
};

window.goToPaymentDetails = () => {
  if (!selectedDepositPaymentMethod) return alert("Please select a payment method.");
  setText("finalPaymentMethod", selectedDepositPaymentMethod.name);
  setText("finalAccountName", selectedDepositPaymentMethod.accountName || "—");
  setText("finalAccountNumber", selectedDepositPaymentMethod.accountNumber || "—");
  setText("finalTransferAmount", `ETB ${money(selectedRechargeAmount)}`);
  hideElement("rechargeStep2"); showElement("rechargeStep3");
};

window.backToAmountStep = () => { hideElement("rechargeStep2"); showElement("rechargeStep1"); };
window.backToPaymentMethod = () => { hideElement("rechargeStep3"); showElement("rechargeStep2"); };

window.submitRecharge = async () => {
  if (!currentUser || window._ccusRechargeSubmitting) return;
  const txId = $("transactionId")?.value?.trim();
  if (!txId) return alert("Please enter Transaction ID.");
  if (selectedRechargeAmount <= 0 || !selectedDepositPaymentMethod) return alert("Invalid amount or method.");
  
  window._ccusRechargeSubmitting = true;
  try {
    const lvl = rechargeLevels.find(l => l.amount === selectedRechargeAmount);
    await addDoc(collection(db, "rechargeRequests"), {
      userId: currentUser.uid, userEmail: currentUser.email || "", userName: currentUserData?.fullName || "",
      amount: selectedRechargeAmount, depositAmount: selectedRechargeAmount, depositLevel: lvl?.level || "General Deposit",
      commissionAmount: Number(lvl?.commission || 0), paymentMethod: selectedDepositPaymentMethod.name,
      accountName: selectedDepositPaymentMethod.accountName || "", accountNumber: selectedDepositPaymentMethod.accountNumber || "",
      transactionId: txId, status: "pending", createdAt: serverTimestamp()
    });
    hideElement("rechargeStep3"); showElement("rechargePending");
    if ($("transactionId")) $("transactionId").value = "";
  } catch (err) { alert(firebaseErrorMessage(err)); } 
  finally { window._ccusRechargeSubmitting = false; }
};

function loadRechargeHistory() {
  const container = $("rechargeHistory"); if (!container || !currentUser) return;
  if (unsubs.rechargeHistory) unsubs.rechargeHistory();
  unsubs.rechargeHistory = onSnapshot(query(collection(db, "rechargeRequests"), where("userId", "==", currentUser.uid)), snap => {
    const recs = []; snap.forEach(d => recs.push({ id: d.id, ...d.data() }));
    recs.sort((a,b) => getTime(b.createdAt) - getTime(a.createdAt));
    renderRechargeHistory(recs);
  });
}

function renderRechargeHistory(recs) {
  const container = $("rechargeHistory"); if (!container) return;
  if (!recs?.length) return container.innerHTML = `<div class="empty-transactions"><h3>No recharge records found</h3></div>`;
  container.innerHTML = recs.map(r => `
    <div class="history-item ${String(r.status||"pending").toLowerCase()}">
      <div class="history-info"><strong>Level: ${escapeHtml(r.depositLevel||"—")}</strong><span>Ref: ${escapeHtml(r.transactionId||"—")}</span></div>
      <div class="history-right"><strong>ETB ${money(r.amount)}</strong><span class="history-status ${String(r.status||"pending").toLowerCase()}">${escapeHtml(r.status||"pending")}</span></div>
    </div>`).join("");
}

/* =========================================================
   CCUS - WITHDRAW SYSTEM (Optimized)
   Hours: 9:00 AM - 5:30 PM EAT (UTC+3)
========================================================= */

// --- Helper: Time & Operating Checks ---
function isWithdrawalTimeOpen() {
  const now = new Date();
  const ethiopiaMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 180) % 1440;
  return ethiopiaMinutes >= 540 && ethiopiaMinutes < 1050; // 09:00 (540m) to 17:30 (1050m)
}

function getWithdrawalOperatingMessage() {
  return "Withdrawal is available from 9:00 AM to 5:30 PM EAT (UTC+3).";
}

async function checkWithdrawalAllowed() {
  if (!isWithdrawalTimeOpen()) {
    showMessage(getWithdrawalOperatingMessage());
    return false;
  }
  const st = await getTodayOperatingStatus();
  if (!st.allowed) {
    showMessage(st.message);
    return false;
  }
  return true;
}

// --- Load Withdrawal Levels ---
function loadWithdrawLevels() {
  const container = $("withdrawAmountList");
  if (!container) return;

  if (unsubs.withdrawLevels) unsubs.withdrawLevels();

  unsubs.withdrawLevels = onSnapshot(
    collection(db, "withdrawLevels"),
    snap => {
      withdrawLevels = [];
      snap.forEach(d => {
        const data = d.data() || {};
        const amount = Number(data.amount || 0);
        if (data.active !== false && amount > 0) {
          withdrawLevels.push({ id: d.id, amount, order: Number(data.order ?? 9999) });
        }
      });
      withdrawLevels.sort((a, b) => a.order - b.order);
      renderWithdrawLevels();
    },
    err => {
      console.error("Withdraw levels listener error:", err);
      container.innerHTML = `<p style="text-align:center;color:#c62828;">Unable to load withdrawal options.</p>`;
    }
  );
}

// --- Render Withdrawal Levels ---
function renderWithdrawLevels() {
  const container = $("withdrawAmountList");
  if (!container) return;

  if (!withdrawLevels?.length) {
    container.innerHTML = `<p style="text-align:center;color:#777;">No withdrawal options available.</p>`;
    return;
  }

  container.innerHTML = "";
  withdrawLevels.forEach(lvl => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "amount-btn";
    btn.textContent = `ETB ${money(lvl.amount)}`;

    btn.onclick = async () => {
      if (!(await checkWithdrawalAllowed())) return;

      selectedWithdrawAmount = lvl.amount;
      if ($("withdrawAmount")) $("withdrawAmount").value = lvl.amount;

      container.querySelectorAll(".amount-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };

    container.appendChild(btn);
  });
}

// --- Reset Page ---
function resetWithdrawPage() {
  selectedWithdrawAmount = 0;
  if ($("withdrawAmount")) $("withdrawAmount").value = "";
  if ($("withdrawPassword")) $("withdrawPassword").value = "";
  hideElement("withdrawPending");
}

// --- Submit Withdrawal ---
window.submitWithdraw = async () => {
  if (!currentUser || window._ccusWithdrawSubmitting) return;

  if (!(await checkWithdrawalAllowed())) return;

  const amt = Number($("withdrawAmount")?.value || selectedWithdrawAmount);
  const pwd = $("withdrawPassword")?.value?.trim();

  if (amt <= 0 || !pwd) {
    return showMessage(amt <= 0 ? "Enter valid withdrawal amount." : "Enter your password.");
  }

  window._ccusWithdrawSubmitting = true;

  try {
    if (!currentUser.email) {
      throw new Error("Email authentication is required for withdrawal.");
    }

    await reauthenticateWithCredential(
      currentUser,
      EmailAuthProvider.credential(currentUser.email, pwd)
    );

    const userRef = doc(db, "users", currentUser.uid);
    const withdrawRef = doc(collection(db, "withdrawRequests"));

    await runTransaction(db, async transaction => {
      const uSnap = await transaction.get(userRef);
      if (!uSnap.exists()) throw new Error("User profile not found.");

      const uData = uSnap.data() || {};
      const bal = Number(uData.totalBalance || 0);

      if (amt > bal) throw new Error("Insufficient balance.");

      // Deduct balance & create request
      transaction.update(userRef, {
        totalBalance: bal - amt,
        updatedAt: serverTimestamp()
      });

      transaction.set(withdrawRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        userName: uData.fullName || "",
        amount: amt,
        paymentMethod: uData.withdrawPaymentMethod || "Standard",
        accountNumber: uData.accountNumber || uData.withdrawAccountNumber || "",
        status: "pending",
        balanceDeducted: true,
        createdAt: serverTimestamp()
      });
    });

    showElement("withdrawPending");
    updateUserUI();
  } catch (err) {
    console.error("Withdrawal submission error:", err);
    showMessage(firebaseErrorMessage(err));
  } finally {
    window._ccusWithdrawSubmitting = false;
  }
};

// --- Load Withdrawal History ---
function loadWithdrawHistory() {
  const container = $("withdrawHistory");
  if (!container || !currentUser) return;

  if (unsubs.withdrawHistory) unsubs.withdrawHistory();

  unsubs.withdrawHistory = onSnapshot(
    query(collection(db, "withdrawRequests"), where("userId", "==", currentUser.uid)),
    snap => {
      const recs = [];
      snap.forEach(d => recs.push({ id: d.id, ...d.data() }));
      recs.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderWithdrawHistory(recs);
    },
    err => {
      console.error("Withdraw history listener error:", err);
      container.innerHTML = `<div class="empty-transactions"><h3>Unable to load withdrawal history</h3></div>`;
    }
  );
}

// --- Render Withdrawal History ---
function renderWithdrawHistory(recs) {
  const container = $("withdrawHistory");
  if (!container) return;

  if (!recs?.length) {
    container.innerHTML = `<div class="empty-transactions"><h3>No withdrawal transactions found</h3></div>`;
    return;
  }

  container.innerHTML = recs.map(r => {
    const status = String(r.status || "pending").toLowerCase();
    const escStatus = escapeHtml(status);

    return `
      <div class="history-item ${escStatus}">
        <div class="history-info">
          <strong>Withdrawal Request</strong>
          <span>Method: ${escapeHtml(r.paymentMethod || "Standard")}</span>
        </div>
        <div class="history-right">
          <strong>ETB ${money(r.amount)}</strong>
          <span class="history-status ${escStatus}">${escStatus}</span>
        </div>
      </div>
    `;
  }).join("");
}

/* VIP System */
function normalizeVIPLevel(id, data = {}) {
  const price = Number(data.price ?? data.amount ?? data.requiredDeposit ?? 0);
  const profit = Number(data.profit ?? data.reward ?? data.returnProfit ?? 0);
  const validDays = Number(data.validDays ?? data.durationDays ?? data.days ?? 0);
  const order = Number(data.order ?? data.displayOrder ?? data.level ?? 9999);
  const name = data.displayName || data.name || (data.level !== undefined ? `VIP ${data.level}` : "VIP");
  return { id: id || data.id || "", name: String(name), displayName: String(name), price, profit, validDays, order, active: data.active !== false };
}

function loadVIPLevels() {
  const container = document.querySelector(".vip-container");
  if (!container) return;
  if (unsubs.vipLevels) { unsubs.vipLevels(); unsubs.vipLevels = null; }
  container.innerHTML = `<div style="text-align:center;padding:25px;color:#777;">Loading VIP Levels...</div>`;

  try {
    unsubs.vipLevels = onSnapshot(collection(db, "vip_levels"), snapshot => {
      const levels = [];
      snapshot.forEach(docSnap => {
        const level = normalizeVIPLevel(docSnap.id, docSnap.data());
        if (level.active !== false && level.price > 0 && level.validDays > 0 && level.profit >= 0) levels.push(level);
      });
      levels.sort((a, b) => a.order !== b.order ? a.order - b.order : a.price - b.price);
      vipLevelsList = levels;
      renderVIPLevels(levels); checkAndProcessVIPPayouts();
    }, error => {
      container.innerHTML = `<div style="text-align:center;padding:25px;"><h3>Unable to Load VIP Levels</h3></div>`;
    });
  } catch (error) { console.error("VIP Levels setup error:", error); }
}

function renderVIPLevels(levels) {
  const container = document.querySelector(".vip-container");
  if (!container) return;
  if (!Array.isArray(levels) || !levels.length) {
    container.innerHTML = `<div style="text-align:center;padding:25px;color:#666;"><h3>No VIP Packages Available</h3></div>`;
    renderCompanySalaryStructure(); return;
  }
  const currentVIP = String(currentUserData?.vipLevel || "VIP 0");

  container.innerHTML = levels.map((vip, index) => {
    const isCurrent = currentVIP === vip.name || currentVIP === vip.displayName;
    return `
      <div class="simple-card vip-card" data-vip-id="${escapeHtml(vip.id)}" style="border:1px solid #f0a500;margin-bottom:15px;padding:15px;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.05);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
          <div><h3 style="margin:0;color:#f0a500;font-size:17px;">👑 ${escapeHtml(vip.name)}</h3><div style="margin-top:3px;color:#777;font-size:12px;">VIP Level ${index + 1}</div></div>
          <span style="font-weight:bold;background:#fff3cd;color:#856404;padding:5px 10px;border-radius:15px;white-space:nowrap;">ETB ${money(vip.price)}</span>
        </div>
        <hr style="border:0;border-top:1px solid #eee;margin:10px 0;"/>
        <div style="font-size:.95rem;line-height:1.7;">
          <p style="margin:4px 0;"><strong>Package Price:</strong> ETB ${money(vip.price)}</p>
          <p style="margin:4px 0;"><strong>Profit:</strong> ETB ${money(vip.profit)}</p>
          <p style="margin:4px 0;"><strong>Validity:</strong> ${Number(vip.validDays)} Days</p>
          <p style="margin:4px 0;font-weight:bold;"><strong>Total Return:</strong> ETB ${money(vip.price + vip.profit)}</p>
        </div>
        <button type="button" class="primary-btn buy-vip-btn" data-vip-id="${escapeHtml(vip.id)}" style="margin-top:12px;width:100%;padding:11px;font-weight:bold;border-radius:8px;" ${isCurrent ? "disabled" : ""}>
          ${isCurrent ? "Current Active VIP" : "Purchase"}
        </button>
      </div>`;
  }).join("");

  container.querySelectorAll(".buy-vip-btn:not([disabled])").forEach(button => {
    button.onclick = async () => {
      const vip = levels.find(item => item.id === button.dataset.vipId);
      if (vip) await window.buyVIP(vip.id, vip.name, vip.price, vip.profit, vip.validDays);
    };
  });
  renderCompanySalaryStructure();
}

window.buyVIP = async function (vipId, vipName, price, profit, validDays) {
  if (!currentUser || window._ccusVipSubmitting) return;
  window._ccusVipSubmitting = true;
  try {
    const vipPrice = Number(price || 0), vipProfit = Number(profit || 0), vipValidDays = Number(validDays || 0);
    if (vipPrice <= 0 || vipValidDays <= 0) throw new Error("Invalid VIP package.");

    const userRef = doc(db, "users", currentUser.uid), vipOrderRef = doc(collection(db, "vip_orders"));
    await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error("User account not found.");
      const userData = userSnap.data() || {}, balance = Number(userData.totalBalance || 0);
      if (String(userData.vipLevel || "") === String(vipName)) throw new Error("This VIP is already active.");
      if (balance < vipPrice) throw new Error(`Insufficient balance! Costs ETB ${money(vipPrice)}, balance is ETB ${money(balance)}.`);

      transaction.update(userRef, { totalBalance: balance - vipPrice, vipLevel: vipName, vipUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      transaction.set(vipOrderRef, {
        userId: currentUser.uid, userName: userData.fullName || currentUser.displayName || "User", userEmail: currentUser.email || "",
        vipId, vipName, price: vipPrice, profit: vipProfit, payoutAmount: vipPrice + vipProfit, validDays: vipValidDays,
        status: "active", payoutCompleted: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    });

    alert(`Purchased ${vipName} successfully.`);
    updateUserUI(); loadVIPLevels();
  } catch (error) { alert(error?.message || "VIP purchase failed."); } 
  finally { window._ccusVipSubmitting = false; }
};

async function checkAndProcessVIPPayouts() {
  if (!currentUser || window._ccusVipPayoutChecking) return;
  window._ccusVipPayoutChecking = true;
  try {
    const snapshot = await getDocs(query(collection(db, "vip_orders"), where("userId", "==", currentUser.uid), where("status", "==", "active"), where("payoutCompleted", "==", false)));
    for (const orderDoc of snapshot.docs) await processSingleVIPPayout(orderDoc.id);
  } catch (error) { console.warn("VIP payout check failed:", error?.message || error); } 
  finally { window._ccusVipPayoutChecking = false; }
}

async function processSingleVIPPayout(orderId) {
  if (!currentUser) return;
  const orderRef = doc(db, "vip_orders", orderId), userRef = doc(db, "users", currentUser.uid);
  try {
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) return;
    const order = orderSnap.data() || {};
    if (order.payoutCompleted === true || String(order.status || "").toLowerCase() === "cancelled" || !order.createdAt?.toMillis) return;
    const validDays = Number(order.validDays || 0);
    if (validDays <= 0 || Date.now() < order.createdAt.toMillis() + (validDays * 24 * 60 * 60 * 1000)) return;

    const payout = Number(order.payoutAmount ?? (Number(order.price || 0) + Number(order.profit || 0)));
    if (payout <= 0) return;

    await runTransaction(db, async transaction => {
      const freshOrderSnap = await transaction.get(orderRef);
      if (!freshOrderSnap.exists()) return;
      const freshOrder = freshOrderSnap.data() || {};
      if (freshOrder.payoutCompleted === true || String(freshOrder.status || "").toLowerCase() === "cancelled") return;

      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) return;

      transaction.update(userRef, { totalBalance: Number(userSnap.data()?.totalBalance || 0) + payout, updatedAt: serverTimestamp() });
      transaction.update(orderRef, { status: "completed", payoutCompleted: true, payoutProcessedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    updateUserUI();
  } catch (error) { console.warn(`VIP payout processing failed (${orderId}):`, error?.message || error); }
}

const companySalaryLevels = [
  { level: 1, position: "Team Leader", requirement: "10 A-level employees + 15 ABC level", salary: 2000 },
  { level: 2, position: "Reserve Manager", requirement: "15 A-level + 50 ABC employees", salary: 6000 },
  { level: 3, position: "Senior Trainee Manager", requirement: "150+ ABC employees", salary: 15000 },
  { level: 4, position: "Marketing Manager", requirement: "240+ team members", salary: 25000 },
  { level: 5, position: "Marketing General Manager", requirement: "550+ team members", salary: 75000 },
  { level: 6, position: "Regional Manager", requirement: "1,200+ team members", salary: 250000 },
  { level: 7, position: "Regional General Manager", requirement: "2,000+ team members", salary: 750000 },
  { level: 8, position: "City Partner", requirement: "3,000+ team members", salary: 1500000 }
];

function renderCompanySalaryStructure() {
  const vipContainer = document.querySelector(".vip-container");
  if (!vipContainer) return;
  let salaryContainer = $("companySalaryStructure");
  if (!salaryContainer) {
    salaryContainer = document.createElement("div");
    salaryContainer.id = "companySalaryStructure";
    vipContainer.appendChild(salaryContainer);
  }
  salaryContainer.innerHTML = `
    <div style="margin-top:20px;padding:16px;border-radius:12px;background:#fff;border:1px solid #eee;">
      <div style="margin-bottom:14px;"><h3 style="margin:0;font-size:18px;">🏢 Company Monthly Salary Structure</h3></div>
      <div style="width:100%;overflow-x:auto;">
        <table style="width:100%;min-width:650px;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#fff3cd;">
              <th style="padding:10px;border:1px solid #eee;text-align:center;">Level</th>
              <th style="padding:10px;border:1px solid #eee;text-align:left;">Position</th>
              <th style="padding:10px;border:1px solid #eee;text-align:left;">Team Requirement</th>
              <th style="padding:10px;border:1px solid #eee;text-align:right;">Monthly Salary</th>
            </tr>
          </thead>
          <tbody>
            ${companySalaryLevels.map(item => `
              <tr>
                <td style="padding:10px;border:1px solid #eee;text-align:center;font-weight:bold;">${item.level}</td>
                <td style="padding:10px;border:1px solid #eee;font-weight:600;">${escapeHtml(item.position)}</td>
                <td style="padding:10px;border:1px solid #eee;">${escapeHtml(item.requirement)}</td>
                <td style="padding:10px;border:1px solid #eee;text-align:right;font-weight:bold;">ETB ${money(item.salary)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* Daily Tasks System */

async function loadTaskSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "taskSettings"));
    const data = snap.exists() ? snap.data() || {} : {};

    const settings = {
      active: data.active !== false,
      taskCount: Math.max(0, Math.floor(Number(data.taskCount ?? data.dailyTaskCount ?? 0))),
      rewardPerTask: Math.max(0, Number(data.rewardPerTask ?? 0))
    };

    window.taskSettings = settings;
    return settings;
  } catch (error) {
    const fallback = { active: true, taskCount: 0, rewardPerTask: 0 };
    window.taskSettings = fallback;
    return fallback;
  }
}

async function ensureTaskRechargeLevels() {
  if (Array.isArray(rechargeLevels) && rechargeLevels.length > 0) return rechargeLevels;

  try {
    const snap = await getDocs(collection(db, "rechargeLevels"));
    const levels = [];

    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      const amount = Number(data.amount ?? data.depositAmount ?? 0);

      if (data.active !== false && Number.isFinite(amount) && amount > 0) {
        levels.push({
          id: docSnap.id,
          amount,
          depositAmount: amount,
          level: data.level || data.name || `Level ${docSnap.id}`,
          name: data.name || data.displayName || data.level || `Level ${docSnap.id}`,
          commission: Number(data.commission ?? 0),
          order: Number.isFinite(Number(data.order)) ? Number(data.order) : 9999,
          taskLimit: Math.max(0, Math.floor(Number(data.taskLimit ?? data.dailyTaskLimit ?? 0))),
          active: true
        });
      }
    });

    rechargeLevels = levels.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    return rechargeLevels;
  } catch (error) {
    return [];
  }
}

async function getApprovedRechargeRecords(userId = currentUser?.uid) {
  if (!userId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, "rechargeRequests"),
        where("userId", "==", userId),
        where("status", "==", "approved")
      )
    );
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    return [];
  }
}

async function getApprovedRechargeLevel(userId = currentUser?.uid) {
  if (!userId) return null;

  const [levels, approved] = await Promise.all([
    ensureTaskRechargeLevels(),
    getApprovedRechargeRecords(userId)
  ]);

  if (!levels.length || !approved.length) return null;

  const matches = approved.map(record => {
    const levelId = String(record.rechargeLevelId ?? record.levelId ?? "").trim();
    if (levelId) {
      const match = levels.find(l => String(l.id) === levelId);
      if (match) return match;
    }
    const amount = Number(record.amount ?? record.depositAmount ?? 0);
    return Number.isFinite(amount) && amount > 0 ? levels.find(l => Number(l.amount) === amount) : null;
  }).filter(Boolean);

  if (!matches.length) return null;
  return matches.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
}

async function getUserDailyTaskLimit(userId = currentUser?.uid) {
  const level = await getApprovedRechargeLevel(userId);
  return level ? Math.max(0, Math.floor(Number(level.taskLimit ?? 0))) : 0;
}

/* =========================================================
   DAILY TASK OPERATING HOURS (09:00 AM - 09:00 PM)
========================================================= */

async function getSafeTaskOperatingStatus() {
  const now = new Date();

  if (now.getDay() === 0) {
    return {
      allowed: false,
      isSunday: true,
      reason: "sunday",
      message: "Today is Sunday. Tasks cannot be claimed today."
    };
  }

  const currentHour = now.getHours();
  if (currentHour < 9 || currentHour >= 21) {
    return {
      allowed: false,
      isSunday: false,
      reason: "outside_task_hours",
      message: "Daily Tasks are available from 9:00 AM to 9:00 PM only."
    };
  }

  if (typeof getTodayOperatingStatus === "function") {
    try {
      return await getTodayOperatingStatus();
    } catch (error) {
      return { allowed: true, isSunday: false, reason: "normal" };
    }
  }

  return { allowed: true, isSunday: false, reason: "normal" };
}

async function getActiveDailyTasks() {
  const snap = await getDocs(collection(db, "tasks"));
  const tasks = [];

  snap.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (data.active !== false) {
      tasks.push({
        id: docSnap.id,
        title: data.title || data.name || "Daily Task",
        description: data.description || data.message || "",
        order: Number.isFinite(Number(data.order)) ? Number(data.order) : 9999,
        reward: Number(data.reward ?? data.rewardAmount ?? window.taskSettings?.rewardPerTask ?? 0)
      });
    }
  });

  return tasks
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((task, index) => ({ ...task, taskNumber: index + 1 }));
}

async function getTodayTaskClaims(userId = currentUser?.uid) {
  if (!userId) return new Set();
  try {
    const snap = await getDocs(
      query(
        collection(db, "users", userId, "taskClaims"),
        where("date", "==", getLocalDateString())
      )
    );
    const claimedIds = new Set();
    snap.forEach(docSnap => {
      if (docSnap.data()?.taskId) claimedIds.add(String(docSnap.data().taskId));
    });
    return claimedIds;
  } catch (error) {
    return new Set();
  }
}

async function loadDailyTasks() {
  const container = $("taskListContainer");
  if (!container || !currentUser) return;

  if (!window.dailyTasksCache?.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px;">Loading daily tasks...</div>`;
  }

  try {
    const settings = await loadTaskSettings();
    if (settings.active === false) {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center;padding:25px;">
          <h3>Tasks Currently Unavailable</h3>
        </div>`;
      return;
    }

    const status = await getSafeTaskOperatingStatus();
    const isSunday = status?.reason === "sunday" || status?.isSunday === true || new Date().getDay() === 0;

    let tasks;
    try {
      tasks = await getActiveDailyTasks();
    } catch (error) {
      if (isTaskAbortError(error)) return;
      throw error;
    }

    window.dailyTasksCache = tasks;

    if (!tasks.length) {
      renderDailyTasks([], 0, isSunday, false);
      return;
    }

    if (isSunday) {
      renderDailyTasks(tasks.map(t => ({ ...t, submitted: false })), tasks.length, true, false);
      return;
    }

    const level = await getApprovedRechargeLevel(currentUser.uid);

    if (!level) {
      renderDailyTasks(tasks.map(t => ({ ...t, submitted: false })), 0, false, true);
      return;
    }

    const validDailyLimit = Math.max(0, Math.floor(Number(level.taskLimit ?? 0)));
    const claimedIds = await getTodayTaskClaims(currentUser.uid);

    const taskStatus = tasks.map(t => ({
      ...t,
      submitted: claimedIds.has(String(t.id))
    }));

    renderDailyTasks(taskStatus, validDailyLimit, false, false);
  } catch (error) {
    if (isTaskAbortError(error) || isTaskPermissionError(error)) return;
    container.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:25px;">
        <h3>Unable to Load Tasks</h3>
      </div>`;
  }
}

function renderDailyTasks(tasks, dailyLimit = 0, isSunday = false, noDeposit = false) {
  const container = $("taskListContainer");
  if (!container) return;

  if (!Array.isArray(tasks) || !tasks.length) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:25px;">
        <h3>No Daily Tasks Available</h3>
      </div>`;
    return;
  }

  container.innerHTML = "";
  let claimedCount = 0;

  tasks.forEach((task, index) => {
    const taskNumber = Number(task.taskNumber || index + 1);
    const insideLimit = taskNumber <= Number(dailyLimit || 0);

    if (task.submitted) claimedCount++;

    let buttonHTML = "";
    let opacityStyle = "";

    if (isSunday || noDeposit) {
      buttonHTML = `
        <button type="button" class="primary-btn task-claim-btn" data-id="${escapeHtml(task.id)}" style="margin-top:8px;width:100%;">
          ✅ Claim Reward
        </button>`;
    } else if (!insideLimit) {
      opacityStyle = "opacity:.8;";
      buttonHTML = `
        <button type="button" class="task-claim-btn" data-id="${escapeHtml(task.id)}" style="margin-top:8px;width:100%;padding:10px;border:0;border-radius:8px;background:#ddd;color:#777;">
          🔒 Locked
        </button>`;
    } else if (task.submitted) {
      buttonHTML = `
        <button type="button" disabled style="margin-top:8px;width:100%;padding:10px;border:0;border-radius:8px;background:#ddd;color:#777;">
          ✓ Completed
        </button>`;
    } else {
      buttonHTML = `
        <button type="button" class="primary-btn task-claim-btn" data-id="${escapeHtml(task.id)}" style="margin-top:8px;width:100%;">
          ✅ Claim Reward
        </button>`;
    }

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="simple-card task-card" style="margin-bottom:12px;padding:14px;border:1px solid #ddd;border-radius:10px;${opacityStyle}">
        <h3>Task ${taskNumber} ${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.description)}</p>
        <div>Reward: ETB ${money(task.reward)}</div>
        ${buttonHTML}
        <p class="task-message" style="margin-top:7px;"></p>
      </div>`
    );
  });

  container.querySelectorAll(".task-claim-btn").forEach(button => {
    button.onclick = async () => {
      const task = tasks.find(item => String(item.id) === String(button.dataset.id));
      if (task) {
        await claimTask(task, button, button.parentElement?.querySelector(".task-message"));
      }
    };
  });

  const summary = $("taskClaimSummary");
  if (summary) {
    if (isSunday) {
      summary.textContent = "Today is Sunday. Tasks cannot be claimed today.";
    } else if (noDeposit) {
      summary.textContent = "Approved deposit is required to claim daily tasks.";
    } else {
      summary.textContent = `${Math.min(claimedCount, Number(dailyLimit || 0))} / ${Number(dailyLimit || 0)} tasks claimed today`;
    }
  }
}

async function claimTask(task, button, messageEl) {
  if (!currentUser || !task) return;

  const showTaskMessage = msg => {
    if (messageEl) {
      messageEl.style.color = "#d9534f";
      messageEl.textContent = msg;
    } else {
      alert(msg);
    }
  };

  try {
    const status = await getSafeTaskOperatingStatus();

    if (status?.reason === "sunday" || new Date().getDay() === 0) {
      return showTaskMessage("Today is Sunday. Tasks cannot be claimed today.");
    }

    if (status?.reason === "outside_task_hours") {
      return showTaskMessage("Daily Tasks are available from 9:00 AM to 9:00 PM only.");
    }

    if (status && status.allowed === false) {
      return showTaskMessage(status.message || "Tasks are unavailable today.");
    }

    const level = await getApprovedRechargeLevel(currentUser.uid);
    if (!level) {
      throw new Error("🔒 Approved deposit is required to claim this task.");
    }

    const dailyLimit = await getUserDailyTaskLimit(currentUser.uid);
    let taskIndex = window.dailyTasksCache.findIndex(item => String(item.id) === String(task.id));

    if (taskIndex < 0 && Number.isFinite(Number(task.taskNumber))) {
      taskIndex = Number(task.taskNumber) - 1;
    }

    if (taskIndex < 0 || taskIndex + 1 > Number(dailyLimit || 0)) {
      throw new Error("This task is limited or not found.");
    }

    const reward = Number(task.reward ?? window.taskSettings?.rewardPerTask ?? 0);
    if (!Number.isFinite(reward) || reward <= 0) {
      throw new Error("Invalid task reward.");
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Processing...";
    }

    const today = getLocalDateString();
    const userRef = doc(db, "users", currentUser.uid);
    const claimRef = doc(db, "users", currentUser.uid, "taskClaims", `${today}_${task.id}`);

    await runTransaction(db, async transaction => {
      const [userSnap, claimSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(claimRef)
      ]);

      if (!userSnap.exists()) throw new Error("User profile not found.");
      if (claimSnap.exists()) throw new Error("Task already completed today.");

      transaction.update(userRef, {
        totalBalance: Number(userSnap.data()?.totalBalance ?? 0) + reward,
        updatedAt: serverTimestamp()
      });

      transaction.set(claimRef, {
        userId: currentUser.uid,
        taskId: task.id,
        taskNumber: taskIndex + 1,
        reward,
        date: today,
        createdAt: serverTimestamp()
      });
    });

    if (button) {
      button.textContent = "✓ Completed";
      button.disabled = true;
    }

    if (messageEl) {
      messageEl.style.color = "green";
      messageEl.textContent = `Reward claimed: ETB ${money(reward)}`;
    }

    updateUserUI();
    loadDailyTasks();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "✅ Claim Reward";
    }
    showTaskMessage(error?.message || "Error claiming reward.");
  }
}


/* Announcements & Notifications */
const ccusNotifButtonIds = [
  "notificationButton", "notificationBtn", "notificationsButton",
  "announcementNotification", "announcementNotificationButton", "homeNotificationButton"
];

let ccusNotifAnnouncements = [];
let ccusNotifListener = null;
let ccusNotifStarted = false;
let ccusNotifToastTimer = null;

function ccusNotifGetUnreadCount() { return getAnnouncementUnreadCount(); }
function ccusNotifSetUnreadCount(count) { setAnnouncementUnreadCount(count); }

function ccusNotifUpdateBadge() {
  const count = ccusNotifGetUnreadCount();
  const text = count > 99 ? "99+" : String(count);
  const display = count > 0 ? "flex" : "none";

  ccusNotifButtonIds.forEach(id => {
    const btn = $(id);
    if (!btn) return;
    if (window.getComputedStyle(btn).position === "static") btn.style.position = "relative";
    
    let badge = btn.querySelector(".announcement-notification-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "announcement-notification-badge";
      badge.style.cssText = "position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border-radius:999px;background:#e53935;color:#fff;border:2px solid #fff;font-size:10px;font-weight:800;line-height:1;z-index:100;pointer-events:none;";
      btn.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.display = display;
  });

  ["announcementUnreadCount", "notificationCount"].forEach(id => {
    const el = $(id);
    if (el) { el.textContent = text; el.style.display = display; }
  });
}

function ccusNotifMarkRead(id) {
  const sid = String(id || "");
  if (!sid) return;
  const seen = getSeenIds();
  if (seen.includes(sid)) return;
  seen.push(sid);
  saveSeenIds(seen);
  ccusNotifSetUnreadCount(ccusNotifGetUnreadCount() - 1);
}

function ccusNotifMarkAllRead(announcements = []) {
  const list = Array.isArray(announcements) && announcements.length ? announcements : ccusNotifAnnouncements;
  const ids = list.map(item => String(item?.id || "")).filter(Boolean);
  saveSeenIds([...getSeenIds(), ...ids]);
  ccusNotifSetUnreadCount(0);
}

function ccusNotifSetupButtons() {
  ccusNotifButtonIds.forEach(id => {
    const btn = $(id);
    if (!btn || btn.dataset.ccusNotifBound === "true") return;

    btn.dataset.ccusNotifBound = "true";
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      window.openPage("announcements");
    });
  });
  ccusNotifUpdateBadge();
}

function ccusNotifLoadAnnouncements(markRead = false) {
  ccusNotifStopListener();
  ccusNotifSetupButtons();

  try {
    const q = query(collection(db, "message"), where("active", "==", true));
    ccusNotifListener = onSnapshot(q, snapshot => {
      const list = [];
      snapshot.forEach(doc => {
        const d = doc.data() || {};
        if (d.active === true) list.push({ id: doc.id, ...d });
      });

      list.sort((a, b) => getTime(b.createdAt || b.created) - getTime(a.createdAt || a.created));
      ccusNotifAnnouncements = list;

      if (markRead) { ccusNotifMarkAllRead(list); markRead = false; }

      ccusNotifRenderHomeAnnouncement(list);
      const container = $("announcementContainer") || $("announcementList");
      if (container) ccusNotifRenderAnnouncements(list, container);

      ccusNotifUpdateBadge();
    }, err => { console.error("CCUS Listener error:", err); });
  } catch (e) { console.error("CCUS listener start error:", e); }
}

function ccusNotifStopListener() {
  if (typeof ccusNotifListener === "function") {
    try { ccusNotifListener(); } catch (e) {}
  }
  ccusNotifListener = null;
  ccusNotifStarted = false;
  window.ccusAnnouncementUnsubscribe = null;
}

function ccusNotifRenderHomeAnnouncement(announcements = []) {
  const homeMsg = $("homeAnnouncement");
  if (!homeMsg) return;

  if (!announcements.length) {
    homeMsg.textContent = "No announcements.";
    homeMsg.style.cursor = "default";
    homeMsg.onclick = null;
    return;
  }

  const latest = announcements[0];
  homeMsg.textContent = latest.message || latest.title || "Announcement";
  homeMsg.style.cursor = "pointer";
  homeMsg.onclick = e => {
    e?.preventDefault?.();
    ccusNotifMarkRead(latest.id);
    ccusNotifShowModal(latest.message || latest.title || "", latest.important === true, latest.title || "Announcement");
  };
}

function ccusNotifRenderAnnouncements(announcements = [], container) {
  if (!container) return;
  if (!announcements.length) {
    container.innerHTML = `<div style="padding:30px 20px;text-align:center;"><div style="font-size:42px;margin-bottom:10px;">📢</div><p style="margin:0;color:#777;">No announcements.</p></div>`;
    return;
  }

  const seen = getSeenIds();
  container.innerHTML = announcements.map(item => {
    const id = String(item.id || "");
    const unread = !seen.includes(id);
    return `
      <button type="button" class="announcement-card" data-id="${escapeHtml(id)}" style="width:100%;display:flex;align-items:flex-start;gap:12px;position:relative;box-sizing:border-box;text-align:left;cursor:pointer;border:0;background:transparent;padding:15px;border-radius:16px;margin-bottom:10px;">
        ${unread ? `<span class="announcement-new-badge" style="position:absolute;top:9px;right:9px;background:#e53935;color:#fff;padding:3px 8px;border-radius:999px;font-size:9px;font-weight:800;z-index:2;">NEW</span>` : ""}
        <div style="width:42px;height:42px;min-width:42px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${item.important ? "rgba(211,47,47,.10)" : "rgba(240,165,0,.12)"};font-size:21px;">${item.important ? "⚠️" : "📢"}</div>
        <div class="announcement-content" style="flex:1;min-width:0;padding-right:35px;">
          <div style="font-size:15px;font-weight:800;line-height:1.35;word-break:break-word;">${escapeHtml(item.title || "Announcement")}</div>
          <div style="margin-top:5px;color:#666;font-size:13px;line-height:1.5;word-break:break-word;">${escapeHtml(item.message || "")}</div>
          ${item.important ? `<div style="margin-top:7px;color:#b8860b;font-size:11px;font-weight:800;">⭐ IMPORTANT</div>` : ""}
        </div>
      </button>`;
  }).join("");

  container.querySelectorAll(".announcement-card").forEach(card => {
    card.addEventListener("click", e => {
      e.preventDefault();
      const id = String(card.dataset.id || "");
      const ann = announcements.find(i => String(i.id) === id);
      if (!ann) return;

      ccusNotifMarkRead(id);
      card.querySelector(".announcement-new-badge")?.remove();
      ccusNotifShowModal(ann.message || ann.title || "", ann.important === true, ann.title || "Announcement");
    });
  });
}

function ccusNotifShowModal(message, important = false, title = "Announcement") {
  $("announcementModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "announcementModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.65);";

  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="width:100%;max-width:500px;max-height:80vh;overflow:auto;box-sizing:border-box;background:#fff;border-radius:18px;padding:22px;box-shadow:0 15px 50px rgba(0,0,0,.3);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px;">
        <h3 style="margin:0;flex:1;font-size:19px;line-height:1.4;word-break:break-word;color:#222;">${escapeHtml(title)}</h3>
        ${important ? `<span style="color:#b8860b;font-size:10px;font-weight:800;white-space:nowrap;">⭐ IMPORTANT</span>` : ""}
      </div>
      <div style="white-space:pre-wrap;line-height:1.7;color:#333;word-break:break-word;font-size:14px;">${escapeHtml(message)}</div>
      <button id="announcementCloseButton" type="button" style="width:100%;margin-top:22px;padding:13px;border:0;border-radius:12px;background:#f0a500;color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Close</button>
    </div>`;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#announcementCloseButton")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
}

/* Referral & Team System */
async function loadReferral() {
  if (!currentUser) return;
  try {
    setText("referralCodeDisplay", currentUserData?.referralCode || "");
    let levels = Array.isArray(rechargeLevels) ? rechargeLevels : [];

    if (!levels.length) {
      const snap = await getDocs(collection(db, "rechargeLevels"));
      levels = [];
      snap.forEach(docSnap => levels.push(normalizeTeamDepositLevel({ id: docSnap.id, ...docSnap.data() })));
      rechargeLevels = levels;
    }

    levels = levels
      .map(normalizeTeamDepositLevel)
      .filter(level => level.amount > 0 && level.active !== false)
      .sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999) || Number(a.amount || 0) - Number(b.amount || 0));

    renderTeamDepositLevels(levels);
  } catch (error) { renderTeamDepositLevels([]); }
  loadTeamCommissionHistory();
}

function normalizeTeamDepositLevel(level = {}) {
  const amount = Number(level.amount ?? level.depositAmount ?? 0);
  const commission = Number(level.commission ?? level.referralCommission ?? 0);
  const taskLimit = Number(level.taskLimit ?? 0);
  const displayName = String(level.displayName ?? level.name ?? "");
  const nameText = displayName || (amount > 0 ? `ETB ${money(amount)}` : "Deposit Level");

  return { id: String(level.id || ""), name: nameText, displayName: nameText, amount, commission, taskLimit, order: Number(level.order ?? 9999), active: level.active !== false };
}

function renderTeamDepositLevels(levels = []) {
  const container = $("teamDepositLevels");
  if (!container) return;

  const validLevels = Array.isArray(levels) ? levels.map(normalizeTeamDepositLevel).filter(l => Number(l.amount) > 0 && l.active !== false) : [];
  if (!validLevels.length) {
    container.innerHTML = `<div class="empty-transactions" style="text-align:center;padding:20px;"><h3>No Deposit Levels Available</h3></div>`;
    return;
  }

  container.innerHTML = validLevels.map((level, index) => `
    <div class="team-deposit-level-card" style="margin-bottom:12px;padding:15px;border:1px solid #e5e5e5;border-radius:12px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="min-width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fff3cd;color:#856404;font-weight:800;">L${index + 1}</div>
          <div>
            <div style="font-weight:700;font-size:15px;">${escapeHtml(level.displayName)}</div>
            <div style="font-size:12px;color:#777;">Team Deposit Level</div>
          </div>
        </div>
        <span style="font-size:11px;color:#198754;background:#e8f7ee;padding:4px 8px;border-radius:12px;">Active</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="padding:10px;border-radius:8px;background:#f8f8f8;"><div style="font-size:11px;color:#777;">Required Deposit</div><strong>ETB ${money(level.amount)}</strong></div>
        <div style="padding:10px;border-radius:8px;background:#f8f8f8;"><div style="font-size:11px;color:#777;">Referral Commission</div><strong style="color:#198754;">ETB ${money(level.commission)}</strong></div>
      </div>
    </div>`).join("");
}

function loadTeamCommissionHistory() {
  const container = $("teamCommissionHistory");
  if (!container || !currentUser) return;
  if (unsubs.teamCommissions) unsubs.teamCommissions();

  try {
    unsubs.teamCommissions = onSnapshot(query(collection(db, "teamCommissions"), where("referrerId", "==", currentUser.uid)), snapshot => {
      const records = [];
      snapshot.forEach(docSnap => records.push({ id: docSnap.id, ...docSnap.data() }));
      records.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderTeamCommissionHistory(records);
    });
  } catch (error) { console.error("Team Commission Setup Error:", error); }
}

function renderTeamCommissionHistory(records = []) {
  const container = $("teamCommissionHistory");
  if (!container) return;
  if (!Array.isArray(records) || !records.length) {
    container.innerHTML = `<div class="empty-transactions" style="text-align:center;padding:20px;"><h3>No Commission Yet</h3></div>`;
    return;
  }

  container.innerHTML = records.map(record => {
    const status = String(record.status || "approved").toLowerCase();
    const depositAmount = Number(record.depositAmount ?? record.amount ?? 0);
    const commissionAmount = Number(record.commissionAmount ?? record.commission ?? 0);

    return `
      <div class="history-item ${escapeHtml(status)}" style="display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #eee;">
        <div class="history-info">
          <strong>${escapeHtml(record.depositLevel || "Deposit Level")}</strong>
          <span style="display:block;margin-top:4px;color:#555;font-size:13px;">Member: ${escapeHtml(record.referredUserName || "Team Member")}</span>
        </div>
        <div class="history-right" style="text-align:right;">
          <strong style="color:#198754;">+ ETB ${money(commissionAmount)}</strong>
          <span class="history-status ${escapeHtml(status)}" style="display:block;margin-top:5px;font-size:11px;">${escapeHtml(status)}</span>
        </div>
      </div>`;
  }).join("");
}

window.copyReferralCode = async () => {
  const code = currentUserData?.referralCode;
  if (!code) return alert("Referral Code not found.");
  try {
    await navigator.clipboard.writeText(code);
    alert("Referral Code copied successfully!");
  } catch { alert("Referral Code: " + code); }
};

/* Global Exports & Initialization */
Object.assign(window, {
  loadUserData: updateUserUI, startUserListener, updateUserUI, cleanupListeners, loadDailyTasks, loadVIPLevels, loadRechargeLevels, loadWithdrawLevels, loadRechargeHistory, loadWithdrawHistory, loadProfile: updateUserUI, loadReferral, renderTeamDepositLevels, loadTeamCommissionHistory, loadAnnouncements: ccusNotifLoadAnnouncements, getTodayOperatingStatus, loadPersonalInformation, savePersonalInformation,
  updateAnnouncementNotificationCount: ccusNotifUpdateBadge, markAllAnnouncementsAsRead: ccusNotifMarkAllRead, setupAnnouncementNotificationButtons: ccusNotifSetupButtons
});

Object.defineProperty(window, "ccusAnnouncementUnsubscribe", {
  configurable: true,
  get: () => ccusNotifListener,
  set: v => { if (typeof v === "function") ccusNotifListener = v; }
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ccusNotifSetupButtons);
else ccusNotifSetupButtons();

ccusNotifUpdateBadge();
console.log("CCUS User App initialized (Optimized & Cleaned).");
