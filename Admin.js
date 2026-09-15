/* =========================================================
   CCUS - admin.js (Optimized & Standardized)
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, orderBy, where, limit, onSnapshot,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* FIREBASE CONFIG */
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
const db = getFirestore(app);

/* STATE */
let currentAdmin = null;
let unsubscribes = [];

/* HELPERS */
const $ = (id) => document.getElementById(id);
const safeNumber = (val) => { const n = Number(val); return Number.isFinite(n) ? n : 0; };
const money = (val) => `Br ${safeNumber(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHTML = (val) => String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

function formatDate(ts) {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  } catch { return "—"; }
}

function getMillis(ts) {
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    const val = new Date(ts).getTime();
    return Number.isFinite(val) ? val : 0;
  } catch { return 0; }
}

function showMessage(id, msg, type = "") {
  const el = $(id);
  if (el) { el.textContent = msg; el.className = `admin-message ${type}`.trim(); }
}

function setElementText(id, val) { const el = $(id); if (el) el.textContent = val; }
function clearInputs(ids) { ids.forEach(id => { const el = $(id); if (el) el.value = ""; }); }

/* AUTH & PERMISSION */
async function requireAdmin(user) {
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    return snap.exists() && snap.data().isAdmin === true;
  } catch (err) {
    console.error("Admin verification error:", err);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentAdmin = null;
    $("adminLoginPage")?.classList.remove("hidden");
    $("adminDashboardPage")?.classList.add("hidden");
    stopAllListeners();
    return;
  }

  const allowed = await requireAdmin(user);
  if (!allowed) {
    await signOut(auth);
    currentAdmin = null;
    $("adminLoginPage")?.classList.remove("hidden");
    $("adminDashboardPage")?.classList.add("hidden");
    stopAllListeners();
    showMessage("adminLoginMessage", "You do not have admin permission.", "error");
    return;
  }

  currentAdmin = user;
  $("adminLoginPage")?.classList.add("hidden");
  $("adminDashboardPage")?.classList.remove("hidden");

  ensureAdminAnnouncementCalendarSections();
  ensureAdminGTeamDepositSection();
  adminNavigate("dashboard");
});

window.adminLogin = async function () {
  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value;
  if (!email || !password) return showMessage("adminLoginMessage", "Please enter email and password.", "error");

  showMessage("adminLoginMessage", "Signing in...");
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const allowed = await requireAdmin(credential.user);
    if (!allowed) {
      await signOut(auth);
      return showMessage("adminLoginMessage", "This account is not an admin account.", "error");
    }
    showMessage("adminLoginMessage", "Login successful.", "success");
  } catch (err) {
    showMessage("adminLoginMessage", err.message || "Login failed.", "error");
  }
};

window.adminLogout = async function () {
  try {
    stopAllListeners();
    await signOut(auth);
    currentAdmin = null;
  } catch (err) { console.error("Logout error:", err); }
};

function stopAllListeners() {
  unsubscribes.forEach(unsub => { if (typeof unsub === "function") unsub(); });
  unsubscribes = [];
}

/* NAVIGATION */
window.adminNavigate = function (section) {
  if (!currentAdmin) return;
  ensureAdminAnnouncementCalendarSections();
  ensureAdminGTeamDepositSection();
  stopAllListeners();

  const pages = [
    "adminDashboardContent", "adminRechargeSection", "adminWithdrawSection",
    "adminVipSection", "adminLevelsSection", "adminWithdrawLevelsSection",
    "adminPaymentsSection", "adminUsersSection", "adminRewardsSection",
    "adminTasksSection", "adminAnnouncementsSection", "adminCalendarSection",
    "adminGTeamDepositLevelsSection"
  ];
  pages.forEach(id => $(id)?.classList.add("hidden"));

  const titles = {
    dashboard: "Dashboard", recharge: "Recharge Requests", withdraw: "Withdraw Requests",
    vip: "VIP Levels", levels: "Recharge Levels", withdrawLevels: "Withdraw Levels",
    payments: "Payment Methods", users: "Users", rewards: "Rewards", tasks: "Daily Tasks",
    announcements: "Announcements", calendar: "Calendar", gTeamLevels: "G Team Deposit Levels"
  };
  setElementText("adminPageTitle", titles[section] || "Dashboard");

  const actionMap = {
    dashboard: () => { $("adminDashboardContent")?.classList.remove("hidden"); loadDashboard(); },
    recharge: () => { $("adminRechargeSection")?.classList.remove("hidden"); loadAdminRechargeRequests(); },
    withdraw: () => { $("adminWithdrawSection")?.classList.remove("hidden"); loadAdminWithdrawRequests(); },
    vip: () => { $("adminVipSection")?.classList.remove("hidden"); loadAdminVipLevels(); },
    levels: () => { $("adminLevelsSection")?.classList.remove("hidden"); loadAdminRechargeLevels(); },
    withdrawLevels: () => { $("adminWithdrawLevelsSection")?.classList.remove("hidden"); loadAdminWithdrawLevels(); },
    payments: () => { $("adminPaymentsSection")?.classList.remove("hidden"); loadAdminPaymentMethods(); },
    users: () => { $("adminUsersSection")?.classList.remove("hidden"); loadAdminUsers(); },
    rewards: () => { $("adminRewardsSection")?.classList.remove("hidden"); },
    tasks: () => { $("adminTasksSection")?.classList.remove("hidden"); loadAdminTasks(); loadTaskSettings(); },
    announcements: () => { $("adminAnnouncementsSection")?.classList.remove("hidden"); loadAdminAnnouncements(); },
    calendar: () => { $("adminCalendarSection")?.classList.remove("hidden"); loadAdminCalendar(); },
    gTeamLevels: () => { $("adminGTeamDepositLevelsSection")?.classList.remove("hidden"); loadAdminGTeamDepositLevels(); }
  };
  if (actionMap[section]) actionMap[section]();
};

window.openAdminSection = (section) => window.adminNavigate(section);

/* DASHBOARD */
async function loadDashboard() {
  await Promise.all([
    loadUserCount(), loadRechargeStatistics(), loadWithdrawStatistics(),
    loadRecentRecharge(), loadRecentWithdraw()
  ]);
}

async function loadUserCount() {
  try {
    const snap = await getDocs(collection(db, "users"));
    setElementText("adminTotalUsers", snap.size);
  } catch { setElementText("adminTotalUsers", "0"); }
}

async function loadRechargeStatistics() {
  try {
    const snap = await getDocs(collection(db, "rechargeRequests"));
    let pending = 0, approved = 0;
    snap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const amt = safeNumber(d.amount);
      if (d.status === "pending") pending += amt;
      if (["approved", "successful"].includes(String(d.status || "").toLowerCase())) approved += amt;
    });
    setElementText("adminPendingRecharge", money(pending));
    setElementText("adminApprovedRecharge", money(approved));
  } catch (err) { console.error("Recharge stats error:", err); }
}

async function loadWithdrawStatistics() {
  try {
    const snap = await getDocs(collection(db, "withdrawRequests"));
    let pending = 0, approved = 0;
    snap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const amt = safeNumber(d.amount);
      if (d.status === "pending") pending += amt;
      if (["approved", "successful"].includes(String(d.status || "").toLowerCase())) approved += amt;
    });
    setElementText("adminPendingWithdraw", money(pending));
    setElementText("adminApprovedWithdraw", money(approved));
  } catch (err) { console.error("Withdraw stats error:", err); }
}

/* RECENT ACTIVITY */
async function loadRecentRecharge() {
  const container = $("adminRecentRecharge");
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, "rechargeRequests"));
    if (snap.empty) return container.innerHTML = emptyHTML("💰", "No Recharge Requests", "No recharge requests yet.");
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => getMillis(b.data.createdAt) - getMillis(a.data.createdAt));
    container.innerHTML = docs.slice(0, 5).map(item => rechargeCardHTML(item.id, item.data, true)).join("");
  } catch { container.innerHTML = errorHTML("Failed to load recharge requests."); }
}

async function loadRecentWithdraw() {
  const container = $("adminRecentWithdraw");
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, "withdrawRequests"));
    if (snap.empty) return container.innerHTML = emptyHTML("💸", "No Withdraw Requests", "No withdrawal requests yet.");
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => getMillis(b.data.createdAt) - getMillis(a.data.createdAt));
    container.innerHTML = docs.slice(0, 5).map(item => withdrawCardHTML(item.id, item.data, true)).join("");
  } catch { container.innerHTML = errorHTML("Failed to load withdrawal requests."); }
}

/* RECHARGE REQUESTS */
function loadAdminRechargeRequests() {
  const container = $("rechargeRequestsList");
  if (!container) return;
  container.innerHTML = loadingHTML("💰", "Loading Recharge Requests...");

  const unsub = onSnapshot(query(collection(db, "rechargeRequests")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("💰", "No Recharge Requests", "Recharge requests will appear here.");
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => getMillis(b.data.createdAt) - getMillis(a.data.createdAt));
    container.innerHTML = docs.map(item => rechargeCardHTML(item.id, item.data, false)).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load recharge requests."); });
  unsubscribes.push(unsub);
}

function rechargeCardHTML(id, data, compact = false) {
  const status = String(data.status || "pending").toLowerCase();
  const statusClass = ["approved", "successful"].includes(status) ? "success" : status === "rejected" ? "error" : "pending";
  const actionButtons = status === "pending" && !compact ? `
    <div class="admin-action-row">
      <button type="button" class="admin-primary-btn" onclick="window.approveRecharge('${escapeHTML(id)}')">✓ Approve</button>
      <button type="button" class="admin-danger-btn" onclick="window.rejectRecharge('${escapeHTML(id)}')">✕ Reject</button>
    </div>` : "";

  return `
    <div class="admin-request-card">
      <div class="admin-request-header">
        <div>
          <strong>${escapeHTML(data.userName || data.fullName || "Unknown User")}</strong>
          <small>${escapeHTML(data.userEmail || data.email || "")}</small>
        </div>
        <span class="admin-status ${statusClass}">${escapeHTML(status)}</span>
      </div>
      <div class="admin-request-body">
        <div><span>Amount</span><strong>${money(data.amount)}</strong></div>
        <div><span>Level</span><strong>${escapeHTML(data.levelName || data.depositLevel || "Custom")}</strong></div>
        <div><span>Commission</span><strong>${money(data.commissionAmount)}</strong></div>
        <div><span>Payment Method</span><strong>${escapeHTML(data.paymentMethod || "—")}</strong></div>
        <div><span>Transaction ID</span><strong>${escapeHTML(data.transactionId || data.referenceNumber || "—")}</strong></div>
        <div><span>Created</span><strong>${escapeHTML(formatDate(data.createdAt))}</strong></div>
      </div>
      ${actionButtons}
    </div>`;
}

async function findRechargeLevel(amount) {
  const snap = await getDocs(collection(db, "rechargeLevels"));
  const levels = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => safeNumber(a.order) - safeNumber(b.order));
  return levels.find(l => l.active !== false && safeNumber(l.amount) === safeNumber(amount)) || null;
}

async function findReferrer(userData, rechargeData) {
  const refCode = (userData.referredBy || userData.referrerCode || rechargeData.referredBy || "").trim();
  if (!refCode) return null;
  try {
    const q = query(collection(db, "users"), where("referralCode", "==", refCode), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() };
    const userSnap = await getDoc(doc(db, "users", refCode));
    if (userSnap.exists()) return { id: userSnap.id, data: userSnap.data() };
  } catch (err) { console.warn("Find referrer error:", err); }
  return null;
}

/* TRANSACTION SAFE RECHARGE APPROVAL */
window.approveRecharge = async function (requestId) {
  if (!currentAdmin) return alert("Admin session not found.");
  if (!confirm("Approve this recharge?")) return;

  try {
    const rechargeRef = doc(db, "rechargeRequests", requestId);
    const rechargeSnap = await getDoc(rechargeRef);
    if (!rechargeSnap.exists()) return alert("Recharge request not found.");
    
    const rechargeData = rechargeSnap.data();
    if (rechargeData.status !== "pending") return alert("This recharge has already been processed.");

    const userId = rechargeData.userId;
    if (!userId) return alert("Recharge request has no user ID.");

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return alert("User account not found.");

    const amount = safeNumber(rechargeData.amount);
    if (amount <= 0) return alert("Invalid recharge amount.");

    const matchedLevel = await findRechargeLevel(amount);
    const levelId = matchedLevel?.id || null;
    const levelName = matchedLevel?.name || "Custom";
    const commissionAmount = Math.max(0, safeNumber(matchedLevel?.commission));
    const taskLimit = Math.max(1, Math.floor(safeNumber(matchedLevel?.taskLimit || 1)));

    const referrer = await findReferrer(userSnap.data(), rechargeData);
    const referrerId = referrer?.id === userId ? null : referrer?.id || null;
    const commissionRef = doc(db, "teamCommissions", requestId);

    await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST
      const freshRechargeSnap = await transaction.get(rechargeRef);
      if (!freshRechargeSnap.exists() || freshRechargeSnap.data().status !== "pending") {
        throw new Error("Recharge invalid or already processed.");
      }
      const freshUserSnap = await transaction.get(userRef);
      if (!freshUserSnap.exists()) throw new Error("User account not found.");
      
      const commissionSnap = await transaction.get(commissionRef);

      let referrerRef = null;
      let referrerSnap = null;
      if (commissionAmount > 0 && referrerId && !commissionSnap.exists()) {
        referrerRef = doc(db, "users", referrerId);
        referrerSnap = await transaction.get(referrerRef);
      }

      // 2. ALL WRITES AFTER READS
      transaction.update(userRef, {
        totalRecharge: safeNumber(freshUserSnap.data().totalRecharge) + amount,
        updatedAt: serverTimestamp()
      });

      let commissionStatus = "none";
      if (commissionAmount > 0 && referrerId && !commissionSnap.exists() && referrerSnap?.exists()) {
        transaction.update(referrerRef, {
          totalBalance: safeNumber(referrerSnap.data().totalBalance) + commissionAmount,
          updatedAt: serverTimestamp()
        });

        transaction.set(commissionRef, {
          referrerId,
          referredUserId: userId,
          referredUserName: freshUserSnap.data().fullName || freshUserSnap.data().name || "User",
          depositAmount: amount,
          depositLevel: levelName,
          commissionAmount,
          status: "approved",
          createdAt: serverTimestamp()
        });
        commissionStatus = "credited";
      }

      transaction.update(rechargeRef, {
        status: "approved",
        depositLevelId: levelId,
        depositLevel: levelName,
        levelName,
        commissionAmount,
        commissionReceiverId: referrerId,
        commissionStatus,
        taskLimit,
        approvedAt: serverTimestamp(),
        approvedBy: currentAdmin.uid,
        updatedAt: serverTimestamp()
      });
    });

    alert(`Recharge approved successfully!\n${money(amount)} added to Total Recharge.`);
    await loadDashboard();
  } catch (err) {
    alert(err.message || "Failed to approve recharge.");
  }
};

window.rejectRecharge = async function (requestId) {
  if (!currentAdmin) return;
  const reason = prompt("Enter rejection reason:", "Recharge rejected by admin");
  if (reason === null) return;

  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, "rechargeRequests", requestId);
      const snap = await transaction.get(ref);
      if (!snap.exists() || snap.data().status !== "pending") throw new Error("Request invalid or already processed.");
      transaction.update(ref, {
        status: "rejected",
        rejectionReason: reason.trim(),
        rejectedAt: serverTimestamp(),
        rejectedBy: currentAdmin.uid,
        updatedAt: serverTimestamp()
      });
    });
    alert("Recharge rejected.");
    await loadDashboard();
  } catch (err) { alert(err.message || "Failed to reject recharge."); }
};

/* WITHDRAW REQUESTS */
function loadAdminWithdrawRequests() {
  const container = $("withdrawRequestsList");
  if (!container) return;
  container.innerHTML = loadingHTML("💸", "Loading Withdrawal Requests...");

  const filter = $("withdrawStatusFilter")?.value || "all";
  let q = collection(db, "withdrawRequests");
  if (filter !== "all") q = query(collection(db, "withdrawRequests"), where("status", "==", filter));

  const unsub = onSnapshot(q, snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("💸", "No Withdrawal Requests", "No requests found.");
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => getMillis(b.data.createdAt) - getMillis(a.data.createdAt));
    container.innerHTML = docs.map(item => withdrawCardHTML(item.id, item.data, false)).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load withdrawal requests."); });
  unsubscribes.push(unsub);
}

function withdrawCardHTML(id, data, compact = false) {
  const status = String(data.status || "pending").toLowerCase();
  const statusClass = ["approved", "successful"].includes(status) ? "success" : status === "rejected" ? "error" : "pending";
  const actionButtons = status === "pending" && !compact ? `
    <div class="admin-action-row">
      <button type="button" class="admin-primary-btn" onclick="window.approveWithdraw('${escapeHTML(id)}')">✓ Approve</button>
      <button type="button" class="admin-danger-btn" onclick="window.rejectWithdraw('${escapeHTML(id)}')">✕ Reject</button>
    </div>` : "";

  return `
    <div class="admin-request-card">
      <div class="admin-request-header">
        <div>
          <strong>${escapeHTML(data.userName || data.fullName || "Unknown User")}</strong>
          <small>${escapeHTML(data.userEmail || "")}</small>
        </div>
        <span class="admin-status ${statusClass}">${escapeHTML(status)}</span>
      </div>
      <div class="admin-request-body">
        <div><span>Amount</span><strong>${money(data.amount)}</strong></div>
        <div><span>Payment Method</span><strong>${escapeHTML(data.paymentMethod || "—")}</strong></div>
        <div><span>Account Name</span><strong>${escapeHTML(data.accountName || "—")}</strong></div>
        <div><span>Account Number</span><strong>${escapeHTML(data.accountNumber || "—")}</strong></div>
        <div><span>Created</span><strong>${escapeHTML(formatDate(data.createdAt))}</strong></div>
      </div>
      ${actionButtons}
    </div>`;
}

window.approveWithdraw = async function (requestId) {
  if (!currentAdmin || !confirm("Approve this withdrawal?")) return;
  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, "withdrawRequests", requestId);
      const snap = await transaction.get(ref);
      if (!snap.exists() || snap.data().status !== "pending") throw new Error("Request processed.");
      transaction.update(ref, {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: currentAdmin.uid,
        updatedAt: serverTimestamp()
      });
    });
    alert("Withdrawal approved successfully.");
    await loadDashboard();
  } catch (err) { alert(err.message); }
};

window.rejectWithdraw = async function (requestId) {
  if (!currentAdmin) return;
  const reason = prompt("Enter rejection reason:", "Withdrawal rejected by admin");
  if (reason === null) return;

  try {
    await runTransaction(db, async (transaction) => {
      const reqRef = doc(db, "withdrawRequests", requestId);
      const snap = await transaction.get(reqRef);
      if (!snap.exists() || snap.data().status !== "pending") throw new Error("Request processed.");
      
      const data = snap.data();
      const shouldRefund = data.balanceDeducted === true;

      if (shouldRefund && data.userId) {
        const userRef = doc(db, "users", data.userId);
        const userSnap = await transaction.get(userRef);
        if (userSnap.exists()) {
          transaction.update(userRef, {
            totalBalance: safeNumber(userSnap.data().totalBalance) + safeNumber(data.amount),
            updatedAt: serverTimestamp()
          });
        }
      }

      transaction.update(reqRef, {
        status: "rejected",
        rejectionReason: reason.trim(),
        balanceRefunded: shouldRefund,
        rejectedAt: serverTimestamp(),
        rejectedBy: currentAdmin.uid,
        updatedAt: serverTimestamp()
      });
    });
    alert("Withdrawal rejected.");
    await loadDashboard();
  } catch (err) { alert(err.message); }
};

/* VIP LEVELS */
function loadAdminVipLevels() {
  const container = $("adminVipLevelsList");
  if (!container) return;
  container.innerHTML = loadingHTML("👑", "Loading VIP Levels...");

  const unsub = onSnapshot(query(collection(db, "vip_levels"), orderBy("level", "asc")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("👑", "No VIP Levels", "Add your first VIP level.");
    container.innerHTML = snap.docs.map(docSnap => vipCardHTML(docSnap.id, docSnap.data())).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load VIP levels."); });
  unsubscribes.push(unsub);
}

function vipCardHTML(id, data) {
  const level = Math.floor(safeNumber(data.level));
  const active = data.active !== false;
  return `
    <div class="admin-level-card" data-vip-id="${escapeHTML(id)}">
      <div><strong>👑 ${escapeHTML(data.name || `VIP ${level}`)}</strong><small>Level ${level}</small></div>
      <div class="admin-level-details">
        <span>Price: <strong>${money(data.price)}</strong></span>
        <span>Profit: <strong>${money(data.profit)}</strong></span>
        <span>Valid: <strong>${safeNumber(data.validDays)} days</strong></span>
        <span>Status: <strong>${active ? "Active" : "Disabled"}</strong></span>
      </div>
      <div class="admin-action-row">
        <button type="button" class="admin-secondary-btn" onclick="window.editVipLevel('${escapeHTML(id)}')">Edit</button>
        <button type="button" class="admin-secondary-btn" onclick="window.toggleVipLevel('${escapeHTML(id)}', ${active})">${active ? "Disable" : "Enable"}</button>
        <button type="button" class="admin-danger-btn" onclick="window.deleteVipLevel('${escapeHTML(id)}')">Delete</button>
      </div>
    </div>`;
}

window.addVipLevel = async function () {
  const level = Math.floor(safeNumber($("newVipLevel")?.value));
  const name = $("newVipName")?.value.trim() || "";
  const price = safeNumber($("newVipPrice")?.value);
  const profit = safeNumber($("newVipProfit")?.value);
  const validDays = Math.floor(safeNumber($("newVipValidDays")?.value));

  if (level < 1 || !name || price <= 0 || profit < 0 || validDays < 1) {
    return showMessage("adminVipMessage", "Please enter valid VIP information.", "error");
  }

  try {
    const q = query(collection(db, "vip_levels"), where("level", "==", level), limit(1));
    const existing = await getDocs(q);
    const data = { level, name, price, profit, validDays, active: true, order: level, updatedAt: serverTimestamp() };

    if (!existing.empty) {
      await updateDoc(existing.docs[0].ref, data);
    } else {
      await addDoc(collection(db, "vip_levels"), { ...data, createdAt: serverTimestamp() });
    }
    clearInputs(["newVipLevel", "newVipName", "newVipPrice", "newVipProfit", "newVipValidDays"]);
    showMessage("adminVipMessage", `VIP ${level} saved successfully.`, "success");
  } catch (err) { showMessage("adminVipMessage", err.message, "error"); }
};

window.editVipLevel = async function (id) {
  try {
    const snap = await getDoc(doc(db, "vip_levels", id));
    if (!snap.exists()) return alert("VIP level not found.");
    const data = snap.data();

    const level = prompt("VIP Level:", safeNumber(data.level)); if (level === null) return;
    const name = prompt("VIP Name:", data.name || ""); if (name === null) return;
    const price = prompt("Price:", safeNumber(data.price)); if (price === null) return;
    const profit = prompt("Profit:", safeNumber(data.profit)); if (profit === null) return;
    const validDays = prompt("Valid Days:", safeNumber(data.validDays)); if (validDays === null) return;

    await updateDoc(doc(db, "vip_levels", id), {
      level: Math.floor(safeNumber(level)), name: name.trim(),
      price: safeNumber(price), profit: safeNumber(profit),
      validDays: Math.floor(safeNumber(validDays)), updatedAt: serverTimestamp()
    });
    alert("VIP level updated successfully.");
  } catch (err) { alert(err.message); }
};

window.toggleVipLevel = async (id, active) => {
  try { await updateDoc(doc(db, "vip_levels", id), { active: !active, updatedAt: serverTimestamp() }); } 
  catch (err) { alert(err.message); }
};

window.deleteVipLevel = async (id) => {
  if (!confirm("Delete VIP Level?")) return;
  try { await deleteDoc(doc(db, "vip_levels", id)); } 
  catch (err) { alert(err.message); }
};

/* RECHARGE LEVELS */
function loadAdminRechargeLevels() {
  const container = $("adminRechargeLevelsList");
  if (!container) return;
  container.innerHTML = loadingHTML("⚙️", "Loading Recharge Levels...");

  const unsub = onSnapshot(query(collection(db, "rechargeLevels"), orderBy("order", "asc")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("⚙️", "No Recharge Levels", "Add recharge levels below.");
    container.innerHTML = snap.docs.map(docSnap => rechargeLevelHTML(docSnap.id, docSnap.data())).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load recharge levels."); });
  unsubscribes.push(unsub);
}

function rechargeLevelHTML(id, data) {
  const active = data.active !== false;
  return `
    <div class="admin-level-card">
      <div><strong>${escapeHTML(data.name || "Recharge Level")}</strong><small>Order: ${safeNumber(data.order)}</small></div>
      <div class="admin-level-details">
        <span>Amount: <strong>${money(data.amount)}</strong></span>
        <span>Commission: <strong>${money(data.commission)}</strong></span>
        <span>Task Limit: <strong>${Math.max(1, safeNumber(data.taskLimit))}</strong></span>
        <span>Status: <strong>${active ? "Active" : "Disabled"}</strong></span>
      </div>
      <div class="admin-action-row">
        <button type="button" class="admin-secondary-btn" onclick="window.editRechargeLevel('${escapeHTML(id)}')">Edit</button>
        <button type="button" class="admin-secondary-btn" onclick="window.toggleRechargeLevel('${escapeHTML(id)}', ${active})">${active ? "Disable" : "Enable"}</button>
        <button type="button" class="admin-danger-btn" onclick="window.deleteRechargeLevel('${escapeHTML(id)}')">Delete</button>
      </div>
    </div>`;
}

window.addRechargeLevel = async function () {
  if (!currentAdmin) return alert("Admin session not found.");
  const amount = safeNumber($("newRechargeAmount")?.value);
  const name = $("newRechargeName")?.value.trim() || "";
  const commission = safeNumber($("newRechargeCommission")?.value);
  const taskLimit = Math.floor(safeNumber($("newRechargeTaskLimit")?.value || 1));
  const order = Math.floor(safeNumber($("newRechargeOrder")?.value));

  if (amount <= 0 || !name || commission < 0 || taskLimit < 1 || order < 1) {
    return alert("Please enter valid recharge level details.");
  }

  try {
    await addDoc(collection(db, "rechargeLevels"), {
      active: true, amount, commission, createdBy: currentAdmin.uid,
      name, order, taskLimit, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    clearInputs(["newRechargeAmount", "newRechargeName", "newRechargeCommission", "newRechargeTaskLimit", "newRechargeOrder"]);
    alert("Recharge level added successfully.");
  } catch (err) { alert(err.message || "Failed to add recharge level."); }
};

window.editRechargeLevel = async function (id) {
  try {
    const ref = doc(db, "rechargeLevels", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert("Recharge level not found.");
    const data = snap.data();

    const name = prompt("Level Name:", data.name || ""); if (name === null) return;
    const amount = prompt("Deposit / Recharge Amount:", safeNumber(data.amount)); if (amount === null) return;
    const commission = prompt("Fixed Team Commission:", safeNumber(data.commission)); if (commission === null) return;
    const taskLimit = prompt("Task Limit:", Math.max(1, safeNumber(data.taskLimit))); if (taskLimit === null) return;
    const order = prompt("Order:", safeNumber(data.order)); if (order === null) return;

    if (!name.trim() || safeNumber(amount) <= 0 || safeNumber(commission) < 0 || safeNumber(taskLimit) < 1 || safeNumber(order) < 1) {
      return alert("Invalid information.");
    }

    await updateDoc(ref, {
      name: name.trim(), amount: safeNumber(amount), commission: safeNumber(commission),
      taskLimit: Math.floor(safeNumber(taskLimit)), order: Math.floor(safeNumber(order)), updatedAt: serverTimestamp()
    });
    alert("Recharge level updated successfully.");
  } catch (err) { alert(err.message); }
};

window.toggleRechargeLevel = async (id, active) => {
  try { await updateDoc(doc(db, "rechargeLevels", id), { active: !active, updatedAt: serverTimestamp() }); }
  catch (err) { alert(err.message); }
};

window.deleteRechargeLevel = async (id) => {
  if (!confirm("Delete this recharge level?")) return;
  try { await deleteDoc(doc(db, "rechargeLevels", id)); }
  catch (err) { alert(err.message); }
};

/* G TEAM DEPOSIT LEVELS */
function loadAdminGTeamDepositLevels() {
  const container = $("adminGTeamDepositLevelsList");
  if (!container) return;
  container.innerHTML = loadingHTML("👥", "Loading G Team Deposit Levels...");

  const unsub = onSnapshot(query(collection(db, "rechargeLevels"), orderBy("order", "asc")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("👥", "No G Team Deposit Levels", "Add deposit levels below.");
    container.innerHTML = snap.docs.map(docSnap => {
      const data = docSnap.data();
      const active = data.active !== false;
      return `
        <div class="admin-level-card">
          <div><strong>👥 ${escapeHTML(data.name || "Deposit Level")}</strong><small>Order: ${safeNumber(data.order)}</small></div>
          <div class="admin-level-details">
            <span>Deposit: <strong>${money(data.amount)}</strong></span>
            <span>Team Commission: <strong>${money(data.commission)}</strong></span>
            <span>Task Limit: <strong>${Math.max(1, safeNumber(data.taskLimit))}</strong></span>
            <span>Status: <strong>${active ? "Active" : "Disabled"}</strong></span>
          </div>
          <div class="admin-action-row">
            <button type="button" class="admin-secondary-btn" onclick="window.editRechargeLevel('${escapeHTML(docSnap.id)}')">Edit</button>
            <button type="button" class="admin-secondary-btn" onclick="window.toggleRechargeLevel('${escapeHTML(docSnap.id)}', ${active})">${active ? "Disable" : "Enable"}</button>
            <button type="button" class="admin-danger-btn" onclick="window.deleteRechargeLevel('${escapeHTML(docSnap.id)}')">Delete</button>
          </div>
        </div>`;
    }).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load G Team Deposit Levels."); });
  unsubscribes.push(unsub);
}

window.addGTeamDepositLevel = async function () {
  if (!currentAdmin) return showMessage("gTeamDepositMessage", "Admin session not found.", "error");
  const name = $("gTeamDepositName")?.value.trim() || "";
  const amount = safeNumber($("gTeamDepositAmount")?.value);
  const commission = safeNumber($("gTeamDepositCommission")?.value);
  const taskLimit = Math.floor(safeNumber($("gTeamDepositTaskLimit")?.value || 1));
  const order = Math.floor(safeNumber($("gTeamDepositOrder")?.value));

  if (!name || amount <= 0 || commission < 0 || taskLimit < 1 || order < 1) {
    return showMessage("gTeamDepositMessage", "Please enter valid fields.", "error");
  }

  try {
    await addDoc(collection(db, "rechargeLevels"), {
      name, amount, commission, taskLimit, order, active: true,
      createdAt: serverTimestamp(), createdBy: currentAdmin.uid, updatedAt: serverTimestamp()
    });
    clearInputs(["gTeamDepositName", "gTeamDepositAmount", "gTeamDepositCommission", "gTeamDepositOrder"]);
    if ($("gTeamDepositTaskLimit")) $("gTeamDepositTaskLimit").value = "1";
    showMessage("gTeamDepositMessage", "G Team Deposit Level added successfully.", "success");
  } catch (err) { showMessage("gTeamDepositMessage", err.message || "Failed to add level.", "error"); }
};

/* WITHDRAW LEVELS */
function loadAdminWithdrawLevels() {
  const container = $("adminWithdrawLevelsList");
  if (!container) return;
  container.innerHTML = loadingHTML("💸", "Loading Withdraw Levels...");

  const unsub = onSnapshot(query(collection(db, "withdrawLevels"), orderBy("order", "asc")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("💸", "No Withdraw Levels", "Add withdrawal levels below.");
    container.innerHTML = snap.docs.map(docSnap => withdrawLevelHTML(docSnap.id, docSnap.data())).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load withdraw levels."); });
  unsubscribes.push(unsub);
}

function withdrawLevelHTML(id, data) {
  const active = data.active !== false;
  return `
    <div class="admin-level-card">
      <div><strong>${escapeHTML(data.name || "Withdraw Level")}</strong><small>Order: ${safeNumber(data.order)}</small></div>
      <div class="admin-level-details">
        <span>Amount: <strong>${money(data.amount)}</strong></span>
        <span>Status: <strong>${active ? "Active" : "Disabled"}</strong></span>
      </div>
      <div class="admin-action-row">
        <button type="button" class="admin-secondary-btn" onclick="window.toggleWithdrawLevel('${escapeHTML(id)}', ${active})">${active ? "Disable" : "Enable"}</button>
        <button type="button" class="admin-danger-btn" onclick="window.deleteWithdrawLevel('${escapeHTML(id)}')">Delete</button>
      </div>
    </div>`;
}

window.addWithdrawLevel = async function () {
  const amount = safeNumber($("newWithdrawAmount")?.value);
  const name = $("newWithdrawName")?.value.trim() || "";
  const order = Math.floor(safeNumber($("newWithdrawOrder")?.value));
  if (amount <= 0 || !name || order < 1) return alert("Please enter valid information.");

  try {
    await addDoc(collection(db, "withdrawLevels"), {
      amount, name, order, active: true, createdAt: serverTimestamp(),
      createdBy: currentAdmin?.uid || null, updatedAt: serverTimestamp()
    });
    clearInputs(["newWithdrawAmount", "newWithdrawName", "newWithdrawOrder"]);
    alert("Withdraw level added successfully.");
  } catch (err) { alert(err.message); }
};

window.toggleWithdrawLevel = async (id, active) => {
  try { await updateDoc(doc(db, "withdrawLevels", id), { active: !active, updatedAt: serverTimestamp() }); }
  catch (err) { alert(err.message); }
};

window.deleteWithdrawLevel = async (id) => {
  if (!confirm("Delete level?")) return;
  try { await deleteDoc(doc(db, "withdrawLevels", id)); }
  catch (err) { alert(err.message); }
};

/* PAYMENT METHODS */
function loadAdminPaymentMethods() {
  const container = $("adminPaymentMethodsList");
  if (!container) return;
  container.innerHTML = loadingHTML("🏦", "Loading Payment Methods...");

  const unsub = onSnapshot(query(collection(db, "settings", "paymentMethods", "methods"), orderBy("order", "asc")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("🏦", "No Payment Methods", "Add a payment method below.");
    container.innerHTML = snap.docs.map(docSnap => paymentMethodHTML(docSnap.id, docSnap.data())).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load payment methods."); });
  unsubscribes.push(unsub);
}

function paymentMethodHTML(id, data) {
  const active = data.active !== false;
  return `
    <div class="admin-level-card">
      <div><strong>${escapeHTML(data.name || "Payment Method")}</strong><small>${escapeHTML(data.accountName || "")}</small></div>
      <div class="admin-level-details">
        <span>Account: <strong>${escapeHTML(data.accountNumber || "—")}</strong></span>
        <span>Status: <strong>${active ? "Active" : "Disabled"}</strong></span>
      </div>
      <div class="admin-action-row">
        <button type="button" class="admin-secondary-btn" onclick="window.togglePaymentMethod('${escapeHTML(id)}', ${active})">${active ? "Disable" : "Enable"}</button>
        <button type="button" class="admin-danger-btn" onclick="window.deletePaymentMethod('${escapeHTML(id)}')">Delete</button>
      </div>
    </div>`;
}

window.addPaymentMethod = async function () {
  const name = $("newPaymentName")?.value.trim() || "";
  const accountName = $("newPaymentAccountName")?.value.trim() || "";
  const accountNumber = $("newPaymentAccountNumber")?.value.trim() || "";
  const order = Math.floor(safeNumber($("newPaymentOrder")?.value));
  if (!name || !accountName || !accountNumber || order < 1) return alert("Please complete all fields.");

  try {
    await addDoc(collection(db, "settings", "paymentMethods", "methods"), {
      name, accountName, accountNumber, order, active: true,
      createdAt: serverTimestamp(), createdBy: currentAdmin?.uid || null, updatedAt: serverTimestamp()
    });
    clearInputs(["newPaymentName", "newPaymentAccountName", "newPaymentAccountNumber", "newPaymentOrder"]);
    alert("Payment method added.");
  } catch (err) { alert(err.message); }
};

window.togglePaymentMethod = async (id, active) => {
  try { await updateDoc(doc(db, "settings", "paymentMethods", "methods", id), { active: !active, updatedAt: serverTimestamp() }); }
  catch (err) { alert(err.message); }
};

window.deletePaymentMethod = async (id) => {
  if (!confirm("Delete method?")) return;
  try { await deleteDoc(doc(db, "settings", "paymentMethods", "methods", id)); }
  catch (err) { alert(err.message); }
};

/* USERS */
function loadAdminUsers() {
  const container = $("adminUsersList");
  if (!container) return;
  container.innerHTML = loadingHTML("👥", "Loading Users...");

  const unsub = onSnapshot(query(collection(db, "users")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("👥", "No Users", "No registered users.");
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => getMillis(b.data.createdAt) - getMillis(a.data.createdAt));
    container.innerHTML = docs.map(item => userCardHTML(item.id, item.data)).join("");
  }, () => { container.innerHTML = errorHTML("Failed to load users."); });
  unsubscribes.push(unsub);
}

function userCardHTML(id, data) {
  return `
    <div class="admin-request-card">
      <div class="admin-request-header">
        <div>
          <strong>${escapeHTML(data.fullName || data.name || "Unknown User")}</strong>
          <small>${escapeHTML(data.email || "")}</small>
        </div>
        <span class="admin-status success">${data.isAdmin ? "ADMIN" : "USER"}</span>
      </div>
      <div class="admin-request-body">
        <div><span>Total Balance</span><strong>${money(data.totalBalance)}</strong></div>
        <div><span>Total Recharge</span><strong>${money(data.totalRecharge)}</strong></div>
        <div><span>VIP Level</span><strong>${escapeHTML(data.vipLevel ?? "VIP 0")}</strong></div>
        <div><span>Referral Code</span><strong>${escapeHTML(data.referralCode || "—")}</strong></div>
        <div><span>Created</span><strong>${escapeHTML(formatDate(data.createdAt))}</strong></div>
      </div>
    </div>`;
}

/* TASKS & SETTINGS */
async function loadTaskSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "taskSettings"));
    if (!snap.exists()) return;
    const data = snap.data();
    if ($("taskSettingsActive")) $("taskSettingsActive").value = String(data.active !== false);
    if ($("taskSettingsCount")) $("taskSettingsCount").value = safeNumber(data.dailyTaskCount);
    if ($("taskSettingsReward")) $("taskSettingsReward").value = safeNumber(data.rewardPerTask);
  } catch (err) { console.error("Task settings error:", err); }
}

window.saveTaskSettings = async function () {
  if (!currentAdmin) return showMessage("taskSettingsMessage", "Admin session not found.", "error");
  const active = $("taskSettingsActive") ? $("taskSettingsActive").value !== "false" : true;
  const dailyTaskCount = Math.floor(safeNumber($("taskSettingsCount")?.value));
  const rewardPerTask = safeNumber($("taskSettingsReward")?.value);

  if (dailyTaskCount < 0 || rewardPerTask < 0) return showMessage("taskSettingsMessage", "Enter valid settings.", "error");

  try {
    await setDoc(doc(db, "settings", "taskSettings"), {
      active, dailyTaskCount, rewardPerTask, updatedAt: serverTimestamp(), updatedBy: currentAdmin.uid
    }, { merge: true });
    showMessage("taskSettingsMessage", "Task settings saved successfully.", "success");
  } catch (err) { showMessage("taskSettingsMessage", err.message || "Failed to save settings.", "error"); }
};

function loadAdminTasks() {
  const container = $("adminTasksList");
  if (!container) return;
  container.innerHTML = loadingHTML("📋", "Loading Tasks...");

  const unsub = onSnapshot(query(collection(db, "tasks"), orderBy("order", "asc")), snap => {
    if (snap.empty) return container.innerHTML = emptyHTML("📋", "No Tasks", "Add daily task.");
    container.innerHTML = snap.docs.map(d => taskCardHTML(d.id, d.data())).join("");
  }, (err) => { container.innerHTML = errorHTML(`Failed to load tasks: ${err.message}`); });
  unsubscribes.push(unsub);
}

function taskCardHTML(id, data) {
  const active = data.active !== false;
  return `
    <div class="admin-level-card">
      <div><strong>${escapeHTML(data.title)}</strong><small>${escapeHTML(data.description)}</small></div>
      <div class="admin-level-details">
        <span>Order: <strong>${safeNumber(data.order)}</strong></span>
        <span>Status: <strong>${active ? "Active" : "Disabled"}</strong></span>
      </div>
      <div class="admin-action-row">
        <button type="button" class="admin-secondary-btn" onclick="window.toggleAdminTask('${escapeHTML(id)}', ${active})">${active ? "Disable" : "Enable"}</button>
        <button type="button" class="admin-danger-btn" onclick="window.deleteAdminTask('${escapeHTML(id)}')">Delete</button>
      </div>
    </div>`;
}

window.addAdminTask = async function () {
  if (!currentAdmin) return showMessage("adminTaskMessage", "Admin session not found.", "error");
  const title = $("newTaskTitle")?.value.trim() || "";
  const description = $("newTaskDescription")?.value.trim() || "";
  const order = Math.floor(safeNumber($("newTaskOrder")?.value));
  const active = $("newTaskActive") ? $("newTaskActive").value !== "false" : true;

  if (!title || !description || order < 1) return showMessage("adminTaskMessage", "All fields are required.", "error");

  try {
    await addDoc(collection(db, "tasks"), {
      title, description, order, active, createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(), createdBy: currentAdmin.uid
    });
    clearInputs(["newTaskTitle", "newTaskDescription", "newTaskOrder"]);
    if ($("newTaskActive")) $("newTaskActive").value = "true";
    showMessage("adminTaskMessage", "Task added successfully.", "success");
  } catch (err) { showMessage("adminTaskMessage", err.message || "Failed to add task.", "error"); }
};

window.toggleAdminTask = async (id, active) => {
  try { await updateDoc(doc(db, "tasks", id), { active: !active, updatedAt: serverTimestamp() }); } 
  catch (err) { alert(err.message); }
};

window.deleteAdminTask = async (id) => {
  if (!confirm("Delete task?")) return;
  try { await deleteDoc(doc(db, "tasks", id)); } 
  catch (err) { alert(err.message); }
};

/* =========================================================
   ANNOUNCEMENTS - ADMIN MANAGEMENT (OPTIMIZED)
   FIRESTORE COLLECTION: message
========================================================= */

// --- LOAD ANNOUNCEMENTS ---
function loadAdminAnnouncements() {
  const container = $("adminAnnouncementsList");
  if (!container) return;

  container.innerHTML = loadingHTML("📢", "Loading Announcements...");

  const unsub = onSnapshot(
    query(collection(db, "message")),
    snap => {
      if (snap.empty) {
        container.innerHTML = emptyHTML("📢", "No Announcements", "Create an announcement.");
        return;
      }

      const docs = snap.docs
        .map(d => ({ id: d.id, data: d.data() || {} }))
        .sort((a, b) => getMillis(b.data.createdAt) - getMillis(a.data.createdAt));

      container.innerHTML = docs.map(item => adminAnnouncementCardHTML(item.id, item.data)).join("");
    },
    err => {
      console.error("Admin announcement listener error:", err);
      container.innerHTML = errorHTML("Failed to load announcements.");
    }
  );

  unsubscribes.push(unsub);
}

// --- ANNOUNCEMENT CARD HTML ---
function adminAnnouncementCardHTML(id, data) {
  const active = data.active !== false;
  const important = data.important === true;
  const title = String(data.title || "Announcement");
  const message = String(data.message || "");
  const priorityText = important ? "Important" : "Normal";
  const priorityIcon = important ? "⭐" : "📌";
  const statusText = active ? "Active" : "Disabled";
  const statusIcon = active ? "🟢" : "🔴";
  const safeId = escapeHTML(String(id));

  return `
    <div class="admin-level-card announcement-admin-card">
      <div class="admin-announcement-header">
        <div class="admin-announcement-title">
          <strong>📢 ${escapeHTML(title)}</strong>
          <small>${escapeHTML(message)}</small>
        </div>
      </div>
      <div class="admin-level-details">
        <span>Status: <strong>${statusIcon} ${statusText}</strong></span>
        <span>Priority: <strong>${priorityIcon} ${priorityText}</strong></span>
        <span>Created: <strong>${escapeHTML(formatDate(data.createdAt))}</strong></span>
      </div>
      <div class="admin-action-row">
        <button type="button" class="admin-secondary-btn" onclick="window.editAdminAnnouncement('${safeId}')">✏️ Edit</button>
        <button type="button" class="admin-secondary-btn" onclick="window.toggleAdminAnnouncement('${safeId}', ${active})">${active ? "🔴 Disable" : "🟢 Enable"}</button>
        <button type="button" class="admin-danger-btn" onclick="window.deleteAdminAnnouncement('${safeId}')">🗑️ Delete</button>
      </div>
    </div>`;
}

// --- ADD ANNOUNCEMENT ---
window.addAdminAnnouncement = async function () {
  const title = $("newAnnouncementTitle")?.value.trim() || "Announcement";
  const message = $("newAnnouncementMessage")?.value.trim() || "";
  const active = $("newAnnouncementActive")?.value !== "false";
  const important = $("newAnnouncementImportant")?.value === "true";

  if (!message) {
    return showMessage("adminAnnouncementMessage", "Enter announcement message.", "error");
  }

  try {
    await addDoc(collection(db, "message"), {
      title,
      message,
      active,
      important,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: currentAdmin?.uid || null
    });

    clearInputs(["newAnnouncementTitle", "newAnnouncementMessage"]);
    if ($("newAnnouncementActive")) $("newAnnouncementActive").value = "true";
    if ($("newAnnouncementImportant")) $("newAnnouncementImportant").value = "false";

    showMessage("adminAnnouncementMessage", "Announcement added successfully.", "success");
  } catch (err) {
    console.error("Add announcement error:", err);
    showMessage("adminAnnouncementMessage", err.message || "Failed to add announcement.", "error");
  }
};

// --- EDIT ANNOUNCEMENT ---
window.editAdminAnnouncement = async function (id) {
  try {
    const announcementRef = doc(db, "message", id);
    const snap = await getDoc(announcementRef);

    if (!snap.exists()) return alert("Announcement not found.");

    const data = snap.data() || {};
    const oldTitle = String(data.title || "");
    const oldMessage = String(data.message || "");
    const oldImportant = data.important === true;
    const oldActive = data.active !== false;

    const newTitle = prompt("Edit Announcement Title:", oldTitle);
    if (newTitle === null) return;

    const newMessage = prompt("Edit Announcement Message:", oldMessage);
    if (newMessage === null) return;
    if (!newMessage.trim()) return alert("Announcement message cannot be empty.");

    const importantAnswer = confirm(
      oldImportant
        ? "This announcement is currently IMPORTANT.\n\nOK = Important\nCancel = Normal"
        : "Make this announcement IMPORTANT?\n\nOK = Important\nCancel = Normal"
    );

    await updateDoc(announcementRef, {
      title: newTitle.trim() || "Announcement",
      message: newMessage.trim(),
      important: importantAnswer,
      active: oldActive,
      updatedAt: serverTimestamp()
    });

    showMessage("adminAnnouncementMessage", "Announcement updated successfully.", "success");
  } catch (err) {
    console.error("Edit announcement error:", err);
    alert(err.message || "Failed to edit announcement.");
  }
};

// --- ENABLE / DISABLE ---
window.toggleAdminAnnouncement = async function (id, active) {
  try {
    await updateDoc(doc(db, "message", id), {
      active: !active,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Toggle announcement error:", err);
    alert(err.message || "Failed to update announcement status.");
  }
};

// --- DELETE ---
window.deleteAdminAnnouncement = async function (id) {
  if (!confirm("Are you sure you want to delete this announcement?")) return;

  try {
    await deleteDoc(doc(db, "message", id));
    showMessage("adminAnnouncementMessage", "Announcement deleted successfully.", "success");
  } catch (err) {
    console.error("Delete announcement error:", err);
    alert(err.message || "Failed to delete announcement.");
  }
};

/* CALENDAR CONTROL */
async function getAdminCalendarData() {
  const snap = await getDoc(doc(db, "settings", "calendar"));
  if (!snap.exists()) return { closed: false, closedDates: [], restDates: [] };
  const data = snap.data();
  return {
    closed: data.closed === true,
    closedDates: Array.isArray(data.closedDates) ? data.closedDates : [],
    restDates: Array.isArray(data.restDates) ? data.restDates : []
  };
}

async function loadAdminCalendar() {
  const container = $("adminCalendarList");
  if (!container) return;
  container.innerHTML = loadingHTML("📅", "Loading Calendar...");
  try {
    const data = await getAdminCalendarData();
    renderAdminCalendar(data);
  } catch { container.innerHTML = errorHTML("Failed to load calendar."); }
}

function renderAdminCalendar(data) {
  const container = $("adminCalendarList");
  if (!container) return;

  const allDates = [
    ...data.closedDates.map(date => ({ date, type: "closed" })),
    ...data.restDates.map(date => ({ date, type: "rest" }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (!allDates.length) {
    container.innerHTML = emptyHTML("📅", "No Special Dates", "No rest or closed dates configured.");
  } else {
    container.innerHTML = allDates.map(item => `
      <div class="admin-level-card">
        <div><strong>📅 ${escapeHTML(item.date)}</strong><small>${item.type === "closed" ? "Closed" : "Rest Day"}</small></div>
        <div class="admin-action-row">
          <button type="button" class="admin-danger-btn" onclick="window.removeAdminCalendarDate('${escapeHTML(item.date)}', '${item.type}')">Remove</button>
        </div>
      </div>`).join("");
  }

  setElementText("adminCalendarStatus", data.closed ? "🔴 Calendar CLOSED" : "🟢 Calendar OPEN");
  if ($("toggleGlobalCalendarButton")) {
    $("toggleGlobalCalendarButton").textContent = data.closed ? "Open Calendar" : "Close Calendar";
  }
}

async function saveAdminCalendarData(data) {
  await setDoc(doc(db, "settings", "calendar"), {
    closed: data.closed === true, closedDates: data.closedDates, restDates: data.restDates,
    updatedAt: serverTimestamp(), updatedBy: currentAdmin?.uid || null
  }, { merge: true });
}

window.addAdminRestDate = async function () {
  const date = $("newCalendarDate")?.value.trim();
  if (!date) return showMessage("adminCalendarMessage", "Select a date.", "error");
  try {
    const data = await getAdminCalendarData();
    data.closedDates = data.closedDates.filter(d => d !== date);
    if (!data.restDates.includes(date)) data.restDates.push(date);
    await saveAdminCalendarData(data);
    renderAdminCalendar(data);
    showMessage("adminCalendarMessage", `${date} added as Rest Day.`, "success");
  } catch (err) { showMessage("adminCalendarMessage", err.message, "error"); }
};

window.addAdminClosedDate = async function () {
  const date = $("newCalendarDate")?.value.trim();
  if (!date) return showMessage("adminCalendarMessage", "Select a date.", "error");
  try {
    const data = await getAdminCalendarData();
    data.restDates = data.restDates.filter(d => d !== date);
    if (!data.closedDates.includes(date)) data.closedDates.push(date);
    await saveAdminCalendarData(data);
    renderAdminCalendar(data);
    showMessage("adminCalendarMessage", `${date} added as Closed.`, "success");
  } catch (err) { showMessage("adminCalendarMessage", err.message, "error"); }
};

window.removeAdminCalendarDate = async function (date, type) {
  if (!confirm(`Remove ${date}?`)) return;
  try {
    const data = await getAdminCalendarData();
    if (type === "closed") data.closedDates = data.closedDates.filter(d => d !== date);
    else data.restDates = data.restDates.filter(d => d !== date);
    await saveAdminCalendarData(data);
    renderAdminCalendar(data);
  } catch (err) { showMessage("adminCalendarMessage", err.message, "error"); }
};

window.toggleGlobalCalendarClosed = async function () {
  try {
    const data = await getAdminCalendarData();
    data.closed = !data.closed;
    await saveAdminCalendarData(data);
    renderAdminCalendar(data);
  } catch (err) { showMessage("adminCalendarMessage", err.message, "error"); }
};

/* DOM FALLBACKS */
function ensureAdminAnnouncementCalendarSections() {
  const parent = $("adminDashboardPage") || document.body;

  if (!$("adminAnnouncementsSection")) {
    const section = document.createElement("section");
    section.id = "adminAnnouncementsSection";
    section.className = "admin-section hidden";
    section.innerHTML = `
      <div class="admin-section-header"><h2>📢 Announcements</h2></div>
      <div class="admin-form-card">
        <input type="text" id="newAnnouncementTitle" placeholder="Title" />
        <textarea id="newAnnouncementMessage" rows="3" placeholder="Message"></textarea>
        <select id="newAnnouncementActive"><option value="true">Active</option><option value="false">Disabled</option></select>
        <select id="newAnnouncementImportant"><option value="false">Normal</option><option value="true">Important</option></select>
        <button type="button" class="admin-primary-btn" onclick="window.addAdminAnnouncement()">Publish</button>
        <div id="adminAnnouncementMessage" class="admin-message"></div>
      </div>
      <div id="adminAnnouncementsList" class="admin-list"></div>`;
    parent.appendChild(section);
  }

  if (!$("adminCalendarSection")) {
    const section = document.createElement("section");
    section.id = "adminCalendarSection";
    section.className = "admin-section hidden";
    section.innerHTML = `
      <div class="admin-section-header"><h2>📅 Calendar Control</h2></div>
      <div class="admin-form-card">
        <div id="adminCalendarStatus" class="admin-message">Loading...</div>
        <button type="button" id="toggleGlobalCalendarButton" class="admin-secondary-btn" onclick="window.toggleGlobalCalendarClosed()">Toggle Calendar</button>
      </div>
      <div class="admin-form-card">
        <input type="date" id="newCalendarDate" />
        <div class="admin-action-row">
          <button type="button" class="admin-primary-btn" onclick="window.addAdminRestDate()">Add Rest Day</button>
          <button type="button" class="admin-danger-btn" onclick="window.addAdminClosedDate()">Add Closed Date</button>
        </div>
        <div id="adminCalendarMessage" class="admin-message"></div>
      </div>
      <div id="adminCalendarList" class="admin-list"></div>`;
    parent.appendChild(section);
  }
}

function ensureAdminGTeamDepositSection() {
  const parent = $("adminDashboardPage") || document.body;
  if ($("adminGTeamDepositLevelsSection")) return;

  const section = document.createElement("section");
  section.id = "adminGTeamDepositLevelsSection";
  section.className = "admin-section hidden";
  section.innerHTML = `
    <div class="admin-section-header">
      <h2>👥 G Team Deposit Levels</h2>
      <p>Deposit levels and fixed team commission settings.</p>
    </div>
    <div class="admin-form-card">
      <h3>Add G Team Deposit Level</h3>
      <input type="text" id="gTeamDepositName" placeholder="Level Name" />
      <input type="number" id="gTeamDepositAmount" placeholder="Deposit Amount" min="1" />
      <input type="number" id="gTeamDepositCommission" placeholder="Fixed Team Commission" min="0" />
      <input type="number" id="gTeamDepositTaskLimit" placeholder="Task Limit" min="1" value="1" />
      <input type="number" id="gTeamDepositOrder" placeholder="Order" min="1" />
      <button type="button" class="admin-primary-btn" onclick="window.addGTeamDepositLevel()">Add Deposit Level</button>
      <div id="gTeamDepositMessage" class="admin-message"></div>
    </div>
    <div id="adminGTeamDepositLevelsList" class="admin-list"></div>`;
  parent.appendChild(section);
}

/* GENERIC UI BUILDERS */
function loadingHTML(icon, title) {
  return `<div class="admin-empty"><div>${escapeHTML(icon)}</div><h3>${escapeHTML(title)}</h3><p>Please wait...</p></div>`;
}
function emptyHTML(icon, title, desc) {
  return `<div class="admin-empty"><div>${escapeHTML(icon)}</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(desc)}</p></div>`;
}
function errorHTML(message) {
  return `<div class="admin-empty"><div>⚠️</div><h3>Error</h3><p>${escapeHTML(message)}</p></div>`;
}

/* INIT */
ensureAdminAnnouncementCalendarSections();
ensureAdminGTeamDepositSection();
window.addEventListener("beforeunload", stopAllListeners);

console.log("CCUS Admin Panel loaded successfully.");
