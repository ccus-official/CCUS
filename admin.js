/* =========================================================
   CCUS - admin.js
   ADMIN PANEL
   Firebase Authentication + Firestore

   FIXED VERSION
   ---------------------------------------------------------
   • Recharge Requests
   • Deposit Level + Commission
   • taskLimit in rechargeLevels
   • teamCommissions/{rechargeRequestId}
   • Withdraw Requests
   • VIP Levels
   • Recharge Levels
   • Withdraw Levels
   • Payment Methods
   • Users
   • Tasks
   • Announcements
   • Calendar
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================================
   FIREBASE CONFIG
   ========================================================= */

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


/* =========================================================
   STATE
   ========================================================= */

let currentAdmin = null;

let unsubscribeRecharge = null;
let unsubscribeWithdraw = null;
let unsubscribeVip = null;
let unsubscribeRechargeLevels = null;
let unsubscribeWithdrawLevels = null;
let unsubscribePayments = null;
let unsubscribeUsers = null;
let unsubscribeTasks = null;
let unsubscribeAnnouncementsAdmin = null;


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}


function money(value) {
  return `Br ${safeNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatDate(timestamp) {
  if (!timestamp) return "—";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString();

  } catch {
    return "—";
  }
}


function getMillis(timestamp) {
  try {
    if (!timestamp) return 0;

    if (typeof timestamp.toMillis === "function") {
      return timestamp.toMillis();
    }

    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().getTime();
    }

    const value = new Date(timestamp).getTime();

    return Number.isFinite(value) ? value : 0;

  } catch {
    return 0;
  }
}


function showMessage(elementId, message, type = "") {
  const el = $(elementId);

  if (!el) return;

  el.textContent = message;
  el.className = "admin-message";

  if (type) {
    el.classList.add(type);
  }
}


function setElementText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}


function clearInputs(ids) {
  ids.forEach(id => {
    const el = $(id);

    if (el) {
      el.value = "";
    }
  });
}


/* =========================================================
   ADMIN AUTHORIZATION
   ========================================================= */

async function requireAdmin(user) {
  if (!user) {
    return false;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      return false;
    }

    const data = snap.data();

    return data.isAdmin === true;

  } catch (error) {
    console.error("Admin verification error:", error);
    return false;
  }
}


/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, async user => {

  if (!user) {

    currentAdmin = null;

    $("adminLoginPage")?.classList.remove("hidden");
    $("adminDashboardPage")?.classList.add("hidden");

    stopAllSectionListeners();

    return;
  }


  const isAdmin = await requireAdmin(user);


  if (!isAdmin) {

    await signOut(auth);

    currentAdmin = null;

    $("adminLoginPage")?.classList.remove("hidden");
    $("adminDashboardPage")?.classList.add("hidden");

    showMessage(
      "adminLoginMessage",
      "You do not have admin permission.",
      "error"
    );

    return;
  }


  currentAdmin = user;

  $("adminLoginPage")?.classList.add("hidden");
  $("adminDashboardPage")?.classList.remove("hidden");

  ensureAdminAnnouncementCalendarSections();

  adminNavigate("dashboard");

});


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

window.adminLogin = async function () {

  const email =
    $("adminEmail")?.value.trim();

  const password =
    $("adminPassword")?.value;


  if (!email || !password) {

    showMessage(
      "adminLoginMessage",
      "Please enter email and password.",
      "error"
    );

    return;
  }


  showMessage(
    "adminLoginMessage",
    "Signing in..."
  );


  try {

    const credential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );


    const isAdmin =
      await requireAdmin(
        credential.user
      );


    if (!isAdmin) {

      await signOut(auth);

      showMessage(
        "adminLoginMessage",
        "This account is not an admin account.",
        "error"
      );

      return;
    }


    showMessage(
      "adminLoginMessage",
      "Login successful.",
      "success"
    );


  } catch (error) {

    console.error(
      "Admin login error:",
      error
    );


    let message =
      "Login failed.";


    switch (error.code) {

      case "auth/invalid-credential":
        message =
          "Invalid email or password.";
        break;

      case "auth/user-not-found":
        message =
          "Admin account not found.";
        break;

      case "auth/wrong-password":
        message =
          "Incorrect password.";
        break;

      case "auth/invalid-email":
        message =
          "Invalid email address.";
        break;

      case "auth/too-many-requests":
        message =
          "Too many login attempts. Please try again later.";
        break;

      case "auth/network-request-failed":
        message =
          "Network error. Check your internet connection.";
        break;

      default:
        message =
          error.message ||
          "Login failed.";
    }


    showMessage(
      "adminLoginMessage",
      message,
      "error"
    );
  }
};


/* =========================================================
   ADMIN LOGOUT
   ========================================================= */

window.adminLogout = async function () {

  try {

    stopAllSectionListeners();

    await signOut(auth);

    currentAdmin = null;

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );
  }
};


/* =========================================================
   STOP LISTENERS
   ========================================================= */

function stopAllSectionListeners() {

  if (unsubscribeRecharge) {
    unsubscribeRecharge();
    unsubscribeRecharge = null;
  }

  if (unsubscribeWithdraw) {
    unsubscribeWithdraw();
    unsubscribeWithdraw = null;
  }

  if (unsubscribeVip) {
    unsubscribeVip();
    unsubscribeVip = null;
  }

  if (unsubscribeRechargeLevels) {
    unsubscribeRechargeLevels();
    unsubscribeRechargeLevels = null;
  }

  if (unsubscribeWithdrawLevels) {
    unsubscribeWithdrawLevels();
    unsubscribeWithdrawLevels = null;
  }

  if (unsubscribePayments) {
    unsubscribePayments();
    unsubscribePayments = null;
  }

  if (unsubscribeUsers) {
    unsubscribeUsers();
    unsubscribeUsers = null;
  }

  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }

  if (unsubscribeAnnouncementsAdmin) {
    unsubscribeAnnouncementsAdmin();
    unsubscribeAnnouncementsAdmin = null;
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

window.adminNavigate = function(section) {

  if (!currentAdmin) return;


  ensureAdminAnnouncementCalendarSections();

  stopAllSectionListeners();


  const pages = [
    "adminDashboardContent",
    "adminRechargeSection",
    "adminWithdrawSection",
    "adminVipSection",
    "adminLevelsSection",
    "adminWithdrawLevelsSection",
    "adminPaymentsSection",
    "adminUsersSection",
    "adminRewardsSection",
    "adminTasksSection",
    "adminAnnouncementsSection",
    "adminCalendarSection"
  ];


  pages.forEach(id => {
    $(id)?.classList.add("hidden");
  });


  const titles = {

    dashboard:
      "Dashboard",

    recharge:
      "Recharge Requests",

    withdraw:
      "Withdraw Requests",

    vip:
      "VIP Levels",

    levels:
      "Recharge Levels",

    withdrawLevels:
      "Withdraw Levels",

    payments:
      "Payment Methods",

    users:
      "Users",

    rewards:
      "Rewards",

    tasks:
      "Daily Tasks",

    announcements:
      "Announcements",

    calendar:
      "Calendar"
  };


  setElementText(
    "adminPageTitle",
    titles[section] || "Dashboard"
  );


  if (section === "dashboard") {

    $("adminDashboardContent")
      ?.classList.remove("hidden");

    loadDashboard();

    return;
  }


  if (section === "recharge") {

    $("adminRechargeSection")
      ?.classList.remove("hidden");

    loadAdminRechargeRequests();

    return;
  }


  if (section === "withdraw") {

    $("adminWithdrawSection")
      ?.classList.remove("hidden");

    loadAdminWithdrawRequests();

    return;
  }


  if (section === "vip") {

    $("adminVipSection")
      ?.classList.remove("hidden");

    loadAdminVipLevels();

    return;
  }


  if (section === "levels") {

    $("adminLevelsSection")
      ?.classList.remove("hidden");

    loadAdminRechargeLevels();

    return;
  }


  if (section === "withdrawLevels") {

    $("adminWithdrawLevelsSection")
      ?.classList.remove("hidden");

    loadAdminWithdrawLevels();

    return;
  }


  if (section === "payments") {

    $("adminPaymentsSection")
      ?.classList.remove("hidden");

    loadAdminPaymentMethods();

    return;
  }


  if (section === "users") {

    $("adminUsersSection")
      ?.classList.remove("hidden");

    loadAdminUsers();

    return;
  }


  if (section === "rewards") {

    $("adminRewardsSection")
      ?.classList.remove("hidden");

    return;
  }


  if (section === "tasks") {

    $("adminTasksSection")
      ?.classList.remove("hidden");

    loadAdminTasks();
    loadTaskSettings();

    return;
  }


  if (section === "announcements") {

    $("adminAnnouncementsSection")
      ?.classList.remove("hidden");

    loadAdminAnnouncements();

    return;
  }


  if (section === "calendar") {

    $("adminCalendarSection")
      ?.classList.remove("hidden");

    loadAdminCalendar();

    return;
  }
};


window.openAdminSection = function(section) {
  window.adminNavigate(section);
};


/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {

  await Promise.all([
    loadUserCount(),
    loadRechargeStatistics(),
    loadWithdrawStatistics(),
    loadRecentRecharge(),
    loadRecentWithdraw()
  ]);

}


async function loadUserCount() {

  try {

    const snapshot =
      await getDocs(
        collection(db, "users")
      );

    setElementText(
      "adminTotalUsers",
      snapshot.size
    );

  } catch (error) {

    console.error(
      "User count error:",
      error
    );

    setElementText(
      "adminTotalUsers",
      "0"
    );
  }
}


async function loadRechargeStatistics() {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "rechargeRequests"
        )
      );


    let pending = 0;
    let approved = 0;


    snapshot.docs.forEach(item => {

      const data =
        item.data();

      const amount =
        safeNumber(
          data.amount
        );


      if (
        data.status === "pending"
      ) {
        pending += amount;
      }


      if (
        data.status === "approved" ||
        data.status === "successful"
      ) {
        approved += amount;
      }

    });


    setElementText(
      "adminPendingRecharge",
      money(pending)
    );


    setElementText(
      "adminApprovedRecharge",
      money(approved)
    );


  } catch (error) {

    console.error(
      "Recharge statistics error:",
      error
    );
  }
}


async function loadWithdrawStatistics() {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "withdrawRequests"
        )
      );


    let pending = 0;
    let approved = 0;


    snapshot.docs.forEach(item => {

      const data =
        item.data();

      const amount =
        safeNumber(
          data.amount
        );


      if (
        data.status === "pending"
      ) {
        pending += amount;
      }


      if (
        data.status === "approved" ||
        data.status === "successful"
      ) {
        approved += amount;
      }

    });


    setElementText(
      "adminPendingWithdraw",
      money(pending)
    );


    setElementText(
      "adminApprovedWithdraw",
      money(approved)
    );


  } catch (error) {

    console.error(
      "Withdraw statistics error:",
      error
    );
  }
}


/* =========================================================
   RECHARGE COLLECTION
   ========================================================= */

async function getRechargeCollectionSnapshot() {

  return await getDocs(
    collection(
      db,
      "rechargeRequests"
    )
  );
}


/* =========================================================
   RECENT RECHARGE
   ========================================================= */

async function loadRecentRecharge() {

  const container =
    $("adminRecentRecharge");

  if (!container) return;


  try {

    const snapshot =
      await getRechargeCollectionSnapshot();


    if (snapshot.empty) {

      container.innerHTML =
        emptyHTML(
          "💰",
          "No Recharge Requests",
          "No recharge requests yet."
        );

      return;
    }


    const docs =
      snapshot.docs.map(
        docSnap => ({
          id: docSnap.id,
          data: docSnap.data()
        })
      );


    docs.sort(
      (a, b) =>
        getMillis(b.data.createdAt) -
        getMillis(a.data.createdAt)
    );


    container.innerHTML =
      docs
        .slice(0, 5)
        .map(item =>
          rechargeCardHTML(
            item.id,
            item.data,
            true
          )
        )
        .join("");


  } catch (error) {

    console.error(
      "Recent recharge error:",
      error
    );

    container.innerHTML =
      errorHTML(
        "Failed to load recharge requests."
      );
  }
}


/* =========================================================
   RECENT WITHDRAW
   ========================================================= */

async function loadRecentWithdraw() {

  const container =
    $("adminRecentWithdraw");

  if (!container) return;


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "withdrawRequests"
        )
      );


    if (snapshot.empty) {

      container.innerHTML =
        emptyHTML(
          "💸",
          "No Withdraw Requests",
          "No withdrawal requests yet."
        );

      return;
    }


    const docs =
      snapshot.docs.map(
        docSnap => ({
          id: docSnap.id,
          data: docSnap.data()
        })
      );


    docs.sort(
      (a, b) =>
        getMillis(b.data.createdAt) -
        getMillis(a.data.createdAt)
    );


    container.innerHTML =
      docs
        .slice(0, 5)
        .map(item =>
          withdrawCardHTML(
            item.id,
            item.data,
            true
          )
        )
        .join("");


  } catch (error) {

    console.error(
      "Recent withdraw error:",
      error
    );

    container.innerHTML =
      errorHTML(
        "Failed to load withdrawal requests."
      );
  }
}


/* =========================================================
   RECHARGE REQUESTS
   ========================================================= */

window.loadAdminRechargeRequests =
function() {

  const container =
    $("rechargeRequestsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "💰",
      "Loading Recharge Requests..."
    );


  const q =
    query(
      collection(
        db,
        "rechargeRequests"
      )
    );


  unsubscribeRecharge =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "💰",
              "No Recharge Requests",
              "Recharge requests will appear here."
            );

          return;
        }


        const docs =
          snapshot.docs.map(
            docSnap => ({
              id: docSnap.id,
              data: docSnap.data()
            })
          );


        docs.sort(
          (a, b) =>
            getMillis(b.data.createdAt) -
            getMillis(a.data.createdAt)
        );


        container.innerHTML =
          docs
            .map(item =>
              rechargeCardHTML(
                item.id,
                item.data,
                false
              )
            )
            .join("");
      },


      error => {

        console.error(
          "Recharge listener error:",
          error
        );

        container.innerHTML =
          errorHTML(
            "Failed to load recharge requests."
          );
      }
    );
};


/* =========================================================
   RECHARGE CARD
   ========================================================= */

function rechargeCardHTML(
  id,
  data,
  compact = false
) {

  const status =
    String(
      data.status || "pending"
    ).toLowerCase();


  const amount =
    safeNumber(
      data.amount
    );


  const statusClass =
    status === "approved" ||
    status === "successful"
      ? "success"
      : status === "rejected"
      ? "error"
      : "pending";


  const level =
    data.levelName ||
    data.depositLevel ||
    "Custom";


  const commission =
    safeNumber(
      data.commissionAmount
    );


  const actionButtons =
    status === "pending" &&
    !compact

      ? `
        <div class="admin-action-row">

          <button
            type="button"
            class="admin-primary-btn"
            onclick="window.approveRecharge('${escapeHTML(id)}')"
          >
            ✓ Approve
          </button>

          <button
            type="button"
            class="admin-danger-btn"
            onclick="window.rejectRecharge('${escapeHTML(id)}')"
          >
            ✕ Reject
          </button>

        </div>
      `

      : "";


  return `
    <div class="admin-request-card">

      <div class="admin-request-header">

        <div>

          <strong>
            ${escapeHTML(
              data.userName ||
              data.fullName ||
              "Unknown User"
            )}
          </strong>

          <small>
            ${escapeHTML(
              data.userEmail ||
              data.email ||
              ""
            )}
          </small>

        </div>

        <span class="admin-status ${statusClass}">
          ${escapeHTML(status)}
        </span>

      </div>


      <div class="admin-request-body">

        <div>
          <span>Amount</span>
          <strong>${money(amount)}</strong>
        </div>

        <div>
          <span>Level</span>
          <strong>${escapeHTML(level)}</strong>
        </div>

        <div>
          <span>Commission</span>
          <strong>${money(commission)}</strong>
        </div>

        <div>
          <span>Payment Method</span>
          <strong>
            ${escapeHTML(
              data.paymentMethod ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>Transaction ID</span>
          <strong>
            ${escapeHTML(
              data.transactionId ||
              data.referenceNumber ||
              data.transactionReference ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>Created</span>
          <strong>
            ${escapeHTML(
              formatDate(
                data.createdAt
              )
            )}
          </strong>
        </div>

      </div>

      ${actionButtons}

    </div>
  `;
}


/* =========================================================
   FIND RECHARGE LEVEL
   ========================================================= */

async function findRechargeLevel(amount) {

  const snapshot =
    await getDocs(
      collection(
        db,
        "rechargeLevels"
      )
    );


  const levels =
    snapshot.docs.map(
      levelDoc => ({
        id: levelDoc.id,
        ...levelDoc.data()
      })
    );


  levels.sort(
    (a, b) =>
      safeNumber(a.order) -
      safeNumber(b.order)
  );


  for (const level of levels) {

    if (
      level.active !== false &&
      safeNumber(level.amount) ===
        safeNumber(amount)
    ) {

      return level;
    }
  }


  return null;
}


/* =========================================================
   FIND REFERRER
   ========================================================= */

async function findReferrer(
  userData,
  rechargeData
) {

  const referredBy =
    userData.referredBy ||
    userData.referrerCode ||
    userData.referralBy ||
    rechargeData.referredBy ||
    rechargeData.referrerCode ||
    null;


  if (!referredBy) {
    return null;
  }


  const value =
    String(referredBy).trim();


  if (!value) {
    return null;
  }


  try {

    const q =
      query(
        collection(
          db,
          "users"
        ),
        where(
          "referralCode",
          "==",
          value
        ),
        limit(1)
      );


    const snapshot =
      await getDocs(q);


    if (!snapshot.empty) {

      const referrerDoc =
        snapshot.docs[0];


      return {
        id: referrerDoc.id,
        data: referrerDoc.data()
      };
    }

  } catch (error) {

    console.warn(
      "Referral code lookup failed:",
      error
    );
  }


  /* Try UID */

  try {

    const referrerRef =
      doc(
        db,
        "users",
        value
      );


    const referrerSnap =
      await getDoc(
        referrerRef
      );


    if (
      referrerSnap.exists()
    ) {

      return {
        id: referrerSnap.id,
        data: referrerSnap.data()
      };
    }

  } catch (error) {

    console.warn(
      "Referral UID lookup failed:",
      error
    );
  }


  return null;
}


/* =========================================================
   APPROVE RECHARGE
   ---------------------------------------------------------
   IMPORTANT SCHEMA

   teamCommissions
      └── [rechargeRequestId]
           ├── referrerId
           ├── referredUserId
           ├── referredUserName
           ├── depositAmount
           ├── depositLevel
           ├── commissionAmount
           ├── status
           └── createdAt

   rechargeLevels
      └── [levelId]
           ├── amount
           ├── commission
           ├── taskLimit
           ├── name
           ├── order
           └── active
   ========================================================= */

window.approveRecharge =
async function(requestId) {

  if (!currentAdmin) {
    alert("Admin session not found.");
    return;
  }


  if (
    !confirm(
      "Approve this recharge?"
    )
  ) {
    return;
  }


  try {

    const rechargeRef =
      doc(
        db,
        "rechargeRequests",
        requestId
      );


    const rechargeSnap =
      await getDoc(
        rechargeRef
      );


    if (!rechargeSnap.exists()) {

      alert(
        "Recharge request not found."
      );

      return;
    }


    const rechargeData =
      rechargeSnap.data();


    if (
      rechargeData.status !==
      "pending"
    ) {

      alert(
        "This recharge has already been processed."
      );

      return;
    }


    const userId =
      rechargeData.userId;


    if (!userId) {

      alert(
        "Recharge request has no userId."
      );

      return;
    }


    const userRef =
      doc(
        db,
        "users",
        userId
      );


    const userSnap =
      await getDoc(
        userRef
      );


    if (!userSnap.exists()) {

      alert(
        "User account not found."
      );

      return;
    }


    const userData =
      userSnap.data();


    const referredUserName =
      userData.fullName ||
      userData.name ||
      rechargeData.userName ||
      "Unknown User";


    const amount =
      safeNumber(
        rechargeData.amount
      );


    if (amount <= 0) {

      alert(
        "Invalid recharge amount."
      );

      return;
    }


    /* -----------------------------------------
       FIND RECHARGE LEVEL
       ----------------------------------------- */

    const matchedLevel =
      await findRechargeLevel(
        amount
      );


    let levelId = null;

    let levelName =
      "Custom";

    let commissionAmount =
      0;

    let taskLimit =
      1;


    if (matchedLevel) {

      levelId =
        matchedLevel.id;


      levelName =
        matchedLevel.name ||
        `Level ${safeNumber(
          matchedLevel.order
        )}`;


      commissionAmount =
        Math.max(
          0,
          safeNumber(
            matchedLevel.commission
          )
        );


      taskLimit =
        Math.max(
          1,
          Math.floor(
            safeNumber(
              matchedLevel.taskLimit ||
              1
            )
          )
        );
    }


    /* -----------------------------------------
       FIND REFERRER
       ----------------------------------------- */

    const referrer =
      await findReferrer(
        userData,
        rechargeData
      );


    let referrerId =
      referrer?.id || null;


    if (
      referrerId === userId
    ) {
      referrerId = null;
    }


    /* -----------------------------------------
       DETERMINISTIC COMMISSION DOC

       One recharge = one commission record.
       ----------------------------------------- */

    const commissionRef =
      doc(
        db,
        "teamCommissions",
        requestId
      );


    const adminId =
      currentAdmin.uid;


    await runTransaction(
      db,
      async transaction => {

        /* -----------------------------------
           ALL READS FIRST
           ----------------------------------- */

        const freshRechargeSnap =
          await transaction.get(
            rechargeRef
          );


        if (
          !freshRechargeSnap.exists()
        ) {

          throw new Error(
            "Recharge request no longer exists."
          );
        }


        const freshRecharge =
          freshRechargeSnap.data();


        if (
          freshRecharge.status !==
          "pending"
        ) {

          throw new Error(
            "Recharge request has already been processed."
          );
        }


        const freshUserSnap =
          await transaction.get(
            userRef
          );


        if (
          !freshUserSnap.exists()
        ) {

          throw new Error(
            "User account no longer exists."
          );
        }


        const commissionSnap =
          await transaction.get(
            commissionRef
          );


        let referrerRef =
          null;

        let referrerSnap =
          null;


        if (
          commissionAmount > 0 &&
          referrerId &&
          !commissionSnap.exists()
        ) {

          referrerRef =
            doc(
              db,
              "users",
              referrerId
            );


          referrerSnap =
            await transaction.get(
              referrerRef
            );
        }


        /* -----------------------------------
           NOW WRITES
           ----------------------------------- */

        const freshUser =
          freshUserSnap.data();


        const currentTotalRecharge =
          safeNumber(
            freshUser.totalRecharge
          );


        /* -----------------------------------
           APPROVED RECHARGE
           ----------------------------------- */

        transaction.update(
          userRef,
          {
            totalRecharge:
              currentTotalRecharge +
              amount,

            updatedAt:
              serverTimestamp()
          }
        );


        let commissionStatus =
          "none";


        /* -----------------------------------
           COMMISSION
           ----------------------------------- */

        if (
          commissionAmount > 0 &&
          referrerId &&
          !commissionSnap.exists()
        ) {

          if (
            referrerSnap &&
            referrerSnap.exists()
          ) {

            const referrerData =
              referrerSnap.data();


            const currentBalance =
              safeNumber(
                referrerData.totalBalance
              );


            /* Add commission to referrer */

            transaction.update(
              referrerRef,
              {
                totalBalance:
                  currentBalance +
                  commissionAmount,

                updatedAt:
                  serverTimestamp()
              }
            );


            /* --------------------------------
               CREATE EXACT TEAM COMMISSION
               SCHEMA
               -------------------------------- */

            transaction.set(
              commissionRef,
              {

                referrerId:
                  referrerId,

                referredUserId:
                  userId,

                referredUserName:
                  referredUserName,

                depositAmount:
                  amount,

                depositLevel:
                  levelName,

                commissionAmount:
                  commissionAmount,

                status:
                  "approved",

                createdAt:
                  serverTimestamp()
              }
            );


            commissionStatus =
              "credited";

          } else {

            commissionStatus =
              "referrer_not_found";
          }


        } else if (
          commissionAmount <= 0
        ) {

          commissionStatus =
            matchedLevel
              ? "zero_commission"
              : "custom_deposit";


        } else if (
          !referrerId
        ) {

          commissionStatus =
            "no_referrer";


        } else if (
          commissionSnap.exists()
        ) {

          commissionStatus =
            "already_credited";
        }


        /* -----------------------------------
           UPDATE RECHARGE REQUEST
           ----------------------------------- */

        transaction.update(
          rechargeRef,
          {

            status:
              "approved",

            depositLevelId:
              levelId,

            depositLevel:
              levelName,

            levelName:
              levelName,

            commissionAmount:
              commissionAmount,

            commissionReceiverId:
              referrerId,

            commissionStatus:
              commissionStatus,

            taskLimit:
              taskLimit,

            approvedAt:
              serverTimestamp(),

            approvedBy:
              adminId,

            updatedAt:
              serverTimestamp()
          }
        );

      }
    );


    /* -----------------------------------------
       SUCCESS MESSAGE
       ----------------------------------------- */

    if (
      commissionAmount > 0 &&
      referrerId
    ) {

      alert(
        "Recharge approved successfully.\n\n" +
        `${money(amount)} added to Total Recharge.\n` +
        `${money(commissionAmount)} referral commission credited.\n\n` +
        `Deposit Level: ${levelName}`
      );

    } else {

      alert(
        "Recharge approved successfully.\n\n" +
        `${money(amount)} added to Total Recharge.\n` +
        `Deposit Level: ${levelName}`
      );
    }


    await loadDashboard();

  } catch (error) {

    console.error(
      "Approve recharge error:",
      error
    );


    alert(
      error.message ||
      "Failed to approve recharge."
    );
  }
};


/* =========================================================
   REJECT RECHARGE
   ========================================================= */

window.rejectRecharge =
async function(requestId) {

  if (!currentAdmin) return;


  const reason =
    prompt(
      "Enter rejection reason:",
      "Recharge rejected by admin"
    );


  if (reason === null) {
    return;
  }


  try {

    const rechargeRef =
      doc(
        db,
        "rechargeRequests",
        requestId
      );


    await runTransaction(
      db,
      async transaction => {

        const snap =
          await transaction.get(
            rechargeRef
          );


        if (!snap.exists()) {

          throw new Error(
            "Recharge request not found."
          );
        }


        const data =
          snap.data();


        if (
          data.status !==
          "pending"
        ) {

          throw new Error(
            "Recharge request has already been processed."
          );
        }


        transaction.update(
          rechargeRef,
          {

            status:
              "rejected",

            rejectionReason:
              reason.trim(),

            rejectedAt:
              serverTimestamp(),

            rejectedBy:
              currentAdmin.uid,

            updatedAt:
              serverTimestamp()
          }
        );

      }
    );


    alert(
      "Recharge rejected."
    );


    await loadDashboard();

  } catch (error) {

    console.error(
      "Reject recharge error:",
      error
    );


    alert(
      error.message ||
      "Failed to reject recharge."
    );
  }
};


/* =========================================================
   WITHDRAW REQUESTS
   ========================================================= */

window.loadAdminWithdrawRequests =
function() {

  const container =
    $("withdrawRequestsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "💸",
      "Loading Withdrawal Requests..."
    );


  const filter =
    $("withdrawStatusFilter")
      ?.value ||
    "all";


  let q =
    query(
      collection(
        db,
        "withdrawRequests"
      )
    );


  if (
    filter !== "all"
  ) {

    q =
      query(
        collection(
          db,
          "withdrawRequests"
        ),
        where(
          "status",
          "==",
          filter
        )
      );
  }


  unsubscribeWithdraw =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "💸",
              "No Withdrawal Requests",
              "No requests found."
            );

          return;
        }


        const docs =
          snapshot.docs.map(
            docSnap => ({
              id: docSnap.id,
              data: docSnap.data()
            })
          );


        docs.sort(
          (a, b) =>
            getMillis(b.data.createdAt) -
            getMillis(a.data.createdAt)
        );


        container.innerHTML =
          docs
            .map(item =>
              withdrawCardHTML(
                item.id,
                item.data,
                false
              )
            )
            .join("");
      },


      error => {

        console.error(
          "Withdraw listener error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load withdrawal requests."
          );
      }
    );
};


/* =========================================================
   WITHDRAW CARD
   ========================================================= */

function withdrawCardHTML(
  id,
  data,
  compact = false
) {

  const status =
    String(
      data.status || "pending"
    ).toLowerCase();


  const amount =
    safeNumber(
      data.amount
    );


  const statusClass =
    status === "approved" ||
    status === "successful"
      ? "success"
      : status === "rejected"
      ? "error"
      : "pending";


  const actionButtons =
    status === "pending" &&
    !compact

      ? `
        <div class="admin-action-row">

          <button
            type="button"
            class="admin-primary-btn"
            onclick="window.approveWithdraw('${escapeHTML(id)}')"
          >
            ✓ Approve
          </button>

          <button
            type="button"
            class="admin-danger-btn"
            onclick="window.rejectWithdraw('${escapeHTML(id)}')"
          >
            ✕ Reject
          </button>

        </div>
      `

      : "";


  return `
    <div class="admin-request-card">

      <div class="admin-request-header">

        <div>

          <strong>
            ${escapeHTML(
              data.userName ||
              data.fullName ||
              "Unknown User"
            )}
          </strong>

          <small>
            ${escapeHTML(
              data.userEmail ||
              data.email ||
              ""
            )}
          </small>

        </div>

        <span class="admin-status ${statusClass}">
          ${escapeHTML(status)}
        </span>

      </div>


      <div class="admin-request-body">

        <div>
          <span>Amount</span>
          <strong>${money(amount)}</strong>
        </div>

        <div>
          <span>Payment Method</span>
          <strong>
            ${escapeHTML(
              data.paymentMethod ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>Account Name</span>
          <strong>
            ${escapeHTML(
              data.accountName ||
              data.bankAccountName ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>Account Number</span>
          <strong>
            ${escapeHTML(
              data.accountNumber ||
              data.bankAccountNumber ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>Balance Reserved</span>
          <strong>
            ${
              data.balanceDeducted === true
                ? "Yes"
                : "No / Unknown"
            }
          </strong>
        </div>

        <div>
          <span>Created</span>
          <strong>
            ${escapeHTML(
              formatDate(
                data.createdAt
              )
            )}
          </strong>
        </div>

      </div>

      ${actionButtons}

    </div>
  `;
}


/* =========================================================
   APPROVE WITHDRAW
   ========================================================= */

window.approveWithdraw =
async function(requestId) {

  if (!currentAdmin) return;


  if (
    !confirm(
      "Approve this withdrawal?"
    )
  ) {
    return;
  }


  try {

    const requestRef =
      doc(
        db,
        "withdrawRequests",
        requestId
      );


    await runTransaction(
      db,
      async transaction => {

        const snap =
          await transaction.get(
            requestRef
          );


        if (!snap.exists()) {

          throw new Error(
            "Withdrawal request not found."
          );
        }


        const data =
          snap.data();


        if (
          data.status !==
          "pending"
        ) {

          throw new Error(
            "Withdrawal request has already been processed."
          );
        }


        transaction.update(
          requestRef,
          {

            status:
              "approved",

            approvedAt:
              serverTimestamp(),

            approvedBy:
              currentAdmin.uid,

            updatedAt:
              serverTimestamp()
          }
        );

      }
    );


    alert(
      "Withdrawal approved successfully."
    );


    await loadDashboard();

  } catch (error) {

    console.error(
      "Approve withdraw error:",
      error
    );


    alert(
      error.message ||
      "Failed to approve withdrawal."
    );
  }
};


/* =========================================================
   REJECT WITHDRAW
   ========================================================= */

window.rejectWithdraw =
async function(requestId) {

  if (!currentAdmin) return;


  const reason =
    prompt(
      "Enter rejection reason:",
      "Withdrawal rejected by admin"
    );


  if (reason === null) {
    return;
  }


  try {

    const requestRef =
      doc(
        db,
        "withdrawRequests",
        requestId
      );


    await runTransaction(
      db,
      async transaction => {

        const snap =
          await transaction.get(
            requestRef
          );


        if (!snap.exists()) {

          throw new Error(
            "Withdrawal request not found."
          );
        }


        const data =
          snap.data();


        if (
          data.status !==
          "pending"
        ) {

          throw new Error(
            "Withdrawal request has already been processed."
          );
        }


        const shouldRefund =
          data.balanceDeducted === true;


        let userRef = null;
        let userSnap = null;


        if (
          shouldRefund &&
          data.userId
        ) {

          userRef =
            doc(
              db,
              "users",
              data.userId
            );


          userSnap =
            await transaction.get(
              userRef
            );


          if (
            !userSnap.exists()
          ) {

            throw new Error(
              "User account not found."
            );
          }
        }


        if (
          shouldRefund &&
          userSnap &&
          userSnap.exists()
        ) {

          const user =
            userSnap.data();


          const currentBalance =
            safeNumber(
              user.totalBalance
            );


          const amount =
            safeNumber(
              data.amount
            );


          if (
            amount <= 0
          ) {

            throw new Error(
              "Invalid withdrawal amount."
            );
          }


          transaction.update(
            userRef,
            {

              totalBalance:
                currentBalance +
                amount,

              updatedAt:
                serverTimestamp()
            }
          );
        }


        transaction.update(
          requestRef,
          {

            status:
              "rejected",

            rejectionReason:
              reason.trim(),

            balanceRefunded:
              shouldRefund,

            rejectedAt:
              serverTimestamp(),

            rejectedBy:
              currentAdmin.uid,

            updatedAt:
              serverTimestamp()
          }
        );

      }
    );


    alert(
      "Withdrawal rejected."
    );


    await loadDashboard();

  } catch (error) {

    console.error(
      "Reject withdraw error:",
      error
    );


    alert(
      error.message ||
      "Failed to reject withdrawal."
    );
  }
};


/* =========================================================
   VIP LEVELS
   ========================================================= */

function loadAdminVipLevels() {

  const container =
    $("adminVipLevelsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "👑",
      "Loading VIP Levels..."
    );


  const q =
    query(
      collection(
        db,
        "vip_levels"
      ),
      orderBy(
        "level",
        "asc"
      )
    );


  unsubscribeVip =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "👑",
              "No VIP Levels",
              "Add your first VIP level."
            );

          return;
        }


        container.innerHTML =
          snapshot.docs
            .map(
              docSnap =>
                vipCardHTML(
                  docSnap.id,
                  docSnap.data()
                )
            )
            .join("");
      },


      error => {

        console.error(
          "VIP listener error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load VIP levels."
          );
      }
    );
}


window.addVipLevel =
async function() {

  const level =
    Math.floor(
      safeNumber(
        $("newVipLevel")?.value
      )
    );


  const name =
    $("newVipName")
      ?.value
      .trim() || "";


  const price =
    safeNumber(
      $("newVipPrice")?.value
    );


  const profit =
    safeNumber(
      $("newVipProfit")?.value
    );


  const validDays =
    Math.floor(
      safeNumber(
        $("newVipValidDays")?.value
      )
    );


  if (
    level < 1 ||
    !name ||
    price <= 0 ||
    profit < 0 ||
    validDays < 1
  ) {

    showMessage(
      "adminVipMessage",
      "Please enter valid VIP information.",
      "error"
    );

    return;
  }


  try {

    const q =
      query(
        collection(
          db,
          "vip_levels"
        ),
        where(
          "level",
          "==",
          level
        ),
        limit(1)
      );


    const existing =
      await getDocs(q);


    if (!existing.empty) {

      const existingDoc =
        existing.docs[0];


      await updateDoc(
        existingDoc.ref,
        {

          level,
          name,
          price,
          profit,
          validDays,
          active: true,
          order: level,

          updatedAt:
            serverTimestamp()
        }
      );


      showMessage(
        "adminVipMessage",
        `VIP ${level} updated successfully.`,
        "success"
      );


    } else {

      await addDoc(
        collection(
          db,
          "vip_levels"
        ),
        {

          level,
          name,
          price,
          profit,
          validDays,
          active: true,
          order: level,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        }
      );


      showMessage(
        "adminVipMessage",
        `VIP ${level} added successfully.`,
        "success"
      );
    }


    clearInputs([
      "newVipLevel",
      "newVipName",
      "newVipPrice",
      "newVipProfit",
      "newVipValidDays"
    ]);


  } catch (error) {

    console.error(
      "Add / Update VIP error:",
      error
    );


    showMessage(
      "adminVipMessage",
      error.message ||
      "Failed to save VIP level.",
      "error"
    );
  }
};


function vipCardHTML(
  id,
  data
) {

  const level =
    Math.floor(
      safeNumber(
        data.level
      )
    );


  const name =
    data.name ||
    `VIP ${level}`;


  const price =
    safeNumber(
      data.price
    );


  const profit =
    safeNumber(
      data.profit
    );


  const validDays =
    Math.floor(
      safeNumber(
        data.validDays
      )
    );


  const payoutAmount =
    price + profit;


  const active =
    data.active !== false;


  const order =
    Math.floor(
      safeNumber(
        data.order || level
      )
    );


  return `
    <div
      class="admin-level-card"
      data-vip-id="${escapeHTML(id)}"
    >

      <div>

        <strong>
          👑 ${escapeHTML(name)}
        </strong>

        <small>
          Level ${level}
        </small>

      </div>


      <div class="admin-level-details">

        <span>
          Price:
          <strong>
            ${money(price)}
          </strong>
        </span>

        <span>
          Profit:
          <strong>
            ${money(profit)}
          </strong>
        </span>

        <span>
          Valid:
          <strong>
            ${validDays} days
          </strong>
        </span>

        <span>
          Final Payout:
          <strong>
            ${money(payoutAmount)}
          </strong>
        </span>

        <span>
          Order:
          <strong>
            ${order}
          </strong>
        </span>

        <span>
          Status:
          <strong>
            ${active ? "Active" : "Disabled"}
          </strong>
        </span>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editVipLevel('${escapeHTML(id)}')"
        >
          Edit
        </button>


        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleVipLevel('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Enable"}
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteVipLevel('${escapeHTML(id)}')"
        >
          Delete
        </button>

      </div>

    </div>
  `;
}


window.editVipLevel =
async function(id) {

  try {

    const ref =
      doc(
        db,
        "vip_levels",
        id
      );


    const snap =
      await getDoc(ref);


    if (!snap.exists()) {

      alert(
        "VIP Level not found."
      );

      return;
    }


    const data =
      snap.data();


    const name =
      prompt(
        "VIP Name:",
        data.name || ""
      );


    if (name === null) return;


    const priceInput =
      prompt(
        "Price (ETB):",
        safeNumber(
          data.price
        )
      );


    if (
      priceInput === null
    ) return;


    const profitInput =
      prompt(
        "Profit (ETB):",
        safeNumber(
          data.profit
        )
      );


    if (
      profitInput === null
    ) return;


    const daysInput =
      prompt(
        "Valid Days:",
        safeNumber(
          data.validDays
        )
      );


    if (
      daysInput === null
    ) return;


    const price =
      Number(priceInput);


    const profit =
      Number(profitInput);


    const validDays =
      Number(daysInput);


    if (
      !name.trim() ||
      price <= 0 ||
      profit < 0 ||
      validDays < 1
    ) {

      alert(
        "Invalid input values."
      );

      return;
    }


    await updateDoc(
      ref,
      {

        name:
          name.trim(),

        price,

        profit,

        validDays:
          Math.floor(validDays),

        updatedAt:
          serverTimestamp()
      }
    );


    alert(
      "VIP Level updated successfully."
    );


  } catch (error) {

    console.error(
      "Edit VIP error:",
      error
    );


    alert(
      "Failed to update VIP Level."
    );
  }
};


window.toggleVipLevel =
async function(
  id,
  currentActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "vip_levels",
        id
      ),
      {

        active:
          !Boolean(
            currentActive
          ),

        updatedAt:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "Toggle VIP error:",
      error
    );


    alert(
      error.message ||
      "Failed to update VIP."
    );
  }
};


window.deleteVipLevel =
async function(id) {

  if (!id) return;


  if (
    !confirm(
      "Delete this VIP level?\n\nExisting VIP purchases/orders will NOT be changed."
    )
  ) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "vip_levels",
        id
      )
    );

  } catch (error) {

    console.error(
      "Delete VIP error:",
      error
    );


    alert(
      error.message ||
      "Failed to delete VIP level."
    );
  }
};


/* =========================================================
   RECHARGE LEVELS
   ---------------------------------------------------------
   SCHEMA:

   rechargeLevels
      └── [Document ID]
           ├── active: true
           ├── amount: 500
           ├── commission: 20
           ├── createdAt
           ├── createdBy
           ├── name: "500"
           ├── order: 1
           ├── taskLimit: 1
           └── updatedAt
   ========================================================= */

function loadAdminRechargeLevels() {

  const container =
    $("adminRechargeLevelsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "⚙️",
      "Loading Recharge Levels..."
    );


  const q =
    query(
      collection(
        db,
        "rechargeLevels"
      ),
      orderBy(
        "order",
        "asc"
      )
    );


  unsubscribeRechargeLevels =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "⚙️",
              "No Recharge Levels",
              "Add recharge levels below."
            );

          return;
        }


        container.innerHTML =
          snapshot.docs
            .map(
              docSnap =>
                rechargeLevelHTML(
                  docSnap.id,
                  docSnap.data()
                )
            )
            .join("");
      },


      error => {

        console.error(
          "Recharge levels error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load recharge levels."
          );
      }
    );
}


window.addRechargeLevel =
async function() {

  const amount =
    safeNumber(
      $("newRechargeAmount")?.value
    );


  const name =
    $("newRechargeName")
      ?.value
      .trim();


  const commission =
    safeNumber(
      $("newRechargeCommission")?.value
    );


  const taskLimit =
    Math.floor(
      safeNumber(
        $("newRechargeTaskLimit")
          ?.value || 1
      )
    );


  const order =
    Math.floor(
      safeNumber(
        $("newRechargeOrder")?.value
      )
    );


  if (
    amount <= 0 ||
    !name ||
    commission < 0 ||
    taskLimit < 1 ||
    order < 1
  ) {

    alert(
      "Please enter valid recharge level information."
    );

    return;
  }


  try {

    const existing =
      await getDocs(
        query(
          collection(
            db,
            "rechargeLevels"
          ),
          where(
            "amount",
            "==",
            amount
          ),
          limit(1)
        )
      );


    if (
      !existing.empty
    ) {

      alert(
        "A recharge level with this amount already exists."
      );

      return;
    }


    await addDoc(
      collection(
        db,
        "rechargeLevels"
      ),
      {

        active:
          true,

        amount:
          amount,

        commission:
          commission,

        createdAt:
          serverTimestamp(),

        createdBy:
          currentAdmin?.uid ||
          null,

        name:
          name,

        order:
          order,

        taskLimit:
          taskLimit,

        updatedAt:
          serverTimestamp()
      }
    );


    clearInputs([
      "newRechargeAmount",
      "newRechargeName",
      "newRechargeCommission",
      "newRechargeTaskLimit",
      "newRechargeOrder"
    ]);


    alert(
      "Recharge level added successfully."
    );


  } catch (error) {

    console.error(
      "Add recharge level error:",
      error
    );


    alert(
      error.message ||
      "Failed to add recharge level."
    );
  }
};


function rechargeLevelHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  const amount =
    safeNumber(
      data.amount
    );


  const commission =
    safeNumber(
      data.commission
    );


  const taskLimit =
    Math.max(
      1,
      Math.floor(
        safeNumber(
          data.taskLimit ||
          1
        )
      )
    );


  return `
    <div class="admin-level-card">

      <div>

        <strong>
          ${escapeHTML(
            data.name ||
            "Recharge Level"
          )}
        </strong>

        <small>
          Level order:
          ${safeNumber(data.order)}
        </small>

      </div>


      <div class="admin-level-details">

        <span>
          Amount:
          <strong>
            ${money(amount)}
          </strong>
        </span>

        <span>
          Commission:
          <strong>
            ${money(commission)}
          </strong>
        </span>

        <span>
          Task Limit:
          <strong>
            ${taskLimit}
          </strong>
        </span>

        <span>
          Status:
          <strong>
            ${active ? "Active" : "Disabled"}
          </strong>
        </span>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editRechargeLevel('${escapeHTML(id)}')"
        >
          Edit
        </button>


        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleRechargeLevel('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Enable"}
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteRechargeLevel('${escapeHTML(id)}')"
        >
          Delete
        </button>

      </div>

    </div>
  `;
}


window.editRechargeLevel =
async function(id) {

  try {

    const ref =
      doc(
        db,
        "rechargeLevels",
        id
      );


    const snap =
      await getDoc(ref);


    if (!snap.exists()) {

      alert(
        "Recharge level not found."
      );

      return;
    }


    const data =
      snap.data();


    const name =
      prompt(
        "Display Name:",
        data.name || ""
      );


    if (name === null) return;


    const amountInput =
      prompt(
        "Amount (ETB):",
        safeNumber(
          data.amount
        )
      );


    if (
      amountInput === null
    ) return;


    const commissionInput =
      prompt(
        "Commission (ETB):",
        safeNumber(
          data.commission
        )
      );


    if (
      commissionInput === null
    ) return;


    const taskLimitInput =
      prompt(
        "Task Limit:",
        safeNumber(
          data.taskLimit || 1
        )
      );


    if (
      taskLimitInput === null
    ) return;


    const orderInput =
      prompt(
        "Order:",
        safeNumber(
          data.order
        )
      );


    if (
      orderInput === null
    ) return;


    const amount =
      Number(amountInput);


    const commission =
      Number(commissionInput);


    const taskLimit =
      Number(taskLimitInput);


    const order =
      Number(orderInput);


    if (
      !name.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(commission) ||
      commission < 0 ||
      !Number.isFinite(taskLimit) ||
      taskLimit < 1 ||
      !Number.isFinite(order) ||
      order < 1
    ) {

      alert(
        "Invalid recharge level values."
      );

      return;
    }


    await updateDoc(
      ref,
      {

        name:
          name.trim(),

        amount,

        commission,

        taskLimit:
          Math.floor(
            taskLimit
          ),

        order:
          Math.floor(
            order
          ),

        updatedAt:
          serverTimestamp()
      }
    );


    alert(
      "Recharge level updated."
    );


  } catch (error) {

    console.error(
      "Edit recharge level error:",
      error
    );


    alert(
      error.message ||
      "Failed to update recharge level."
    );
  }
};


window.toggleRechargeLevel =
async function(
  id,
  currentActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "rechargeLevels",
        id
      ),
      {

        active:
          !Boolean(
            currentActive
          ),

        updatedAt:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "Toggle recharge level error:",
      error
    );


    alert(
      error.message ||
      "Failed to update recharge level."
    );
  }
};


window.deleteRechargeLevel =
async function(id) {

  if (!id) return;


  if (
    !confirm(
      "Delete this recharge level?"
    )
  ) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "rechargeLevels",
        id
      )
    );

  } catch (error) {

    console.error(
      "Delete recharge level error:",
      error
    );


    alert(
      error.message ||
      "Failed to delete recharge level."
    );
  }
};


/* =========================================================
   WITHDRAW LEVELS
   ========================================================= */

function loadAdminWithdrawLevels() {

  const container =
    $("adminWithdrawLevelsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "💸",
      "Loading Withdraw Levels..."
    );


  const q =
    query(
      collection(
        db,
        "withdrawLevels"
      ),
      orderBy(
        "order",
        "asc"
      )
    );


  unsubscribeWithdrawLevels =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "💸",
              "No Withdraw Levels",
              "Add withdrawal levels below."
            );

          return;
        }


        container.innerHTML =
          snapshot.docs
            .map(
              docSnap =>
                withdrawLevelHTML(
                  docSnap.id,
                  docSnap.data()
                )
            )
            .join("");
      },


      error => {

        console.error(
          "Withdraw levels error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load withdraw levels."
          );
      }
    );
}


window.addWithdrawLevel =
async function() {

  const amount =
    safeNumber(
      $("newWithdrawAmount")?.value
    );


  const name =
    $("newWithdrawName")
      ?.value
      .trim();


  const order =
    Math.floor(
      safeNumber(
        $("newWithdrawOrder")?.value
      )
    );


  if (
    amount <= 0 ||
    !name ||
    order < 1
  ) {

    alert(
      "Please enter valid withdrawal level information."
    );

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "withdrawLevels"
      ),
      {

        amount,
        name,
        order,
        active: true,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );


    clearInputs([
      "newWithdrawAmount",
      "newWithdrawName",
      "newWithdrawOrder"
    ]);


    alert(
      "Withdraw level added successfully."
    );


  } catch (error) {

    console.error(
      "Add withdraw level error:",
      error
    );


    alert(
      error.message ||
      "Failed to add withdrawal level."
    );
  }
};


function withdrawLevelHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `
    <div class="admin-level-card">

      <div>

        <strong>
          ${escapeHTML(
            data.name ||
            "Withdraw Level"
          )}
        </strong>

        <small>
          Order:
          ${safeNumber(data.order)}
        </small>

      </div>


      <div class="admin-level-details">

        <span>
          Amount:
          <strong>
            ${money(data.amount)}
          </strong>
        </span>

        <span>
          Status:
          <strong>
            ${active ? "Active" : "Disabled"}
          </strong>
        </span>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleWithdrawLevel('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Enable"}
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteWithdrawLevel('${escapeHTML(id)}')"
        >
          Delete
        </button>

      </div>

    </div>
  `;
}


window.toggleWithdrawLevel =
async function(
  id,
  currentActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "withdrawLevels",
        id
      ),
      {

        active:
          !Boolean(
            currentActive
          ),

        updatedAt:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "Toggle withdraw level error:",
      error
    );


    alert(
      error.message ||
      "Failed to update withdrawal level."
    );
  }
};


window.deleteWithdrawLevel =
async function(id) {

  if (!confirm(
    "Delete this withdrawal level?"
  )) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "withdrawLevels",
        id
      )
    );

  } catch (error) {

    console.error(
      "Delete withdraw level error:",
      error
    );


    alert(
      error.message ||
      "Failed to delete withdrawal level."
    );
  }
};


/* =========================================================
   PAYMENT METHODS
   ========================================================= */

function loadAdminPaymentMethods() {

  const container =
    $("adminPaymentMethodsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "🏦",
      "Loading Payment Methods..."
    );


  const q =
    query(
      collection(
        db,
        "settings",
        "paymentMethods",
        "methods"
      ),
      orderBy(
        "order",
        "asc"
      )
    );


  unsubscribePayments =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "🏦",
              "No Payment Methods",
              "Add a payment method below."
            );

          return;
        }


        container.innerHTML =
          snapshot.docs
            .map(
              docSnap =>
                paymentMethodHTML(
                  docSnap.id,
                  docSnap.data()
                )
            )
            .join("");
      },


      error => {

        console.error(
          "Payment methods error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load payment methods."
          );
      }
    );
}


window.addPaymentMethod =
async function() {

  const name =
    $("newPaymentName")
      ?.value
      .trim();


  const accountName =
    $("newPaymentAccountName")
      ?.value
      .trim();


  const accountNumber =
    $("newPaymentAccountNumber")
      ?.value
      .trim();


  const order =
    Math.floor(
      safeNumber(
        $("newPaymentOrder")
          ?.value
      )
    );


  if (
    !name ||
    !accountName ||
    !accountNumber ||
    order < 1
  ) {

    alert(
      "Please complete all payment method fields."
    );

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "settings",
        "paymentMethods",
        "methods"
      ),
      {

        name,
        accountName,
        accountNumber,
        order,
        active: true,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );


    clearInputs([
      "newPaymentName",
      "newPaymentAccountName",
      "newPaymentAccountNumber",
      "newPaymentOrder"
    ]);


    alert(
      "Payment method added successfully."
    );


  } catch (error) {

    console.error(
      "Add payment method error:",
      error
    );


    alert(
      error.message ||
      "Failed to add payment method."
    );
  }
};


function paymentMethodHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `
    <div class="admin-level-card">

      <div>

        <strong>
          ${escapeHTML(
            data.name ||
            "Payment Method"
          )}
        </strong>

        <small>
          ${escapeHTML(
            data.accountName ||
            ""
          )}
        </small>

      </div>


      <div class="admin-level-details">

        <span>
          Account:
          <strong>
            ${escapeHTML(
              data.accountNumber ||
              "—"
            )}
          </strong>
        </span>

        <span>
          Status:
          <strong>
            ${active ? "Active" : "Disabled"}
          </strong>
        </span>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.togglePaymentMethod('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Enable"}
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deletePaymentMethod('${escapeHTML(id)}')"
        >
          Delete
        </button>

      </div>

    </div>
  `;
}


window.togglePaymentMethod =
async function(
  id,
  currentActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "settings",
        "paymentMethods",
        "methods",
        id
      ),
      {

        active:
          !Boolean(
            currentActive
          ),

        updatedAt:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "Toggle payment error:",
      error
    );


    alert(
      error.message ||
      "Failed to update payment method."
    );
  }
};


window.deletePaymentMethod =
async function(id) {

  if (
    !confirm(
      "Delete this payment method?"
    )
  ) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "settings",
        "paymentMethods",
        "methods",
        id
      )
    );

  } catch (error) {

    console.error(
      "Delete payment error:",
      error
    );


    alert(
      error.message ||
      "Failed to delete payment method."
    );
  }
};


/* =========================================================
   USERS
   ========================================================= */

function loadAdminUsers() {

  const container =
    $("adminUsersList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "👥",
      "Loading Users..."
    );


  const q =
    query(
      collection(
        db,
        "users"
      )
    );


  unsubscribeUsers =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "👥",
              "No Users",
              "No registered users."
            );

          return;
        }


        const docs =
          snapshot.docs.map(
            docSnap => ({
              id: docSnap.id,
              data: docSnap.data()
            })
          );


        docs.sort(
          (a, b) =>
            getMillis(b.data.createdAt) -
            getMillis(a.data.createdAt)
        );


        container.innerHTML =
          docs
            .map(
              item =>
                userCardHTML(
                  item.id,
                  item.data
                )
            )
            .join("");
      },


      error => {

        console.error(
          "Users listener error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load users."
          );
      }
    );
}


function userCardHTML(
  id,
  data
) {

  const vip =
    String(
      data.vipLevel ??
      "VIP 0"
    );


  return `
    <div class="admin-request-card">

      <div class="admin-request-header">

        <div>

          <strong>
            ${escapeHTML(
              data.fullName ||
              data.name ||
              "Unknown User"
            )}
          </strong>

          <small>
            ${escapeHTML(
              data.email ||
              ""
            )}
          </small>

        </div>


        <span class="admin-status success">
          ${
            data.isAdmin
              ? "ADMIN"
              : "USER"
          }
        </span>

      </div>


      <div class="admin-request-body">

        <div>
          <span>Account</span>
          <strong>
            ${escapeHTML(
              data.accountNumber ||
              id
            )}
          </strong>
        </div>

        <div>
          <span>Total Balance</span>
          <strong>
            ${money(
              data.totalBalance
            )}
          </strong>
        </div>

        <div>
          <span>Total Recharge</span>
          <strong>
            ${money(
              data.totalRecharge
            )}
          </strong>
        </div>

        <div>
          <span>VIP Level</span>
          <strong>
            ${escapeHTML(vip)}
          </strong>
        </div>

        <div>
          <span>Referral Code</span>
          <strong>
            ${escapeHTML(
              data.referralCode ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <span>Created</span>
          <strong>
            ${escapeHTML(
              formatDate(
                data.createdAt
              )
            )}
          </strong>
        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   TASK SETTINGS
   ========================================================= */

async function loadTaskSettings() {

  const ref =
    doc(
      db,
      "settings",
      "taskSettings"
    );


  try {

    const snap =
      await getDoc(ref);


    if (!snap.exists()) {

      if (
        $("taskSettingsActive")
      ) {
        $("taskSettingsActive").value =
          "true";
      }


      if (
        $("taskSettingsCount")
      ) {
        $("taskSettingsCount").value =
          "0";
      }


      if (
        $("taskSettingsReward")
      ) {
        $("taskSettingsReward").value =
          "0";
      }


      return;
    }


    const data =
      snap.data();


    if (
      $("taskSettingsActive")
    ) {

      $("taskSettingsActive").value =
        String(
          data.active !== false
        );
    }


    if (
      $("taskSettingsCount")
    ) {

      $("taskSettingsCount").value =
        safeNumber(
          data.dailyTaskCount
        );
    }


    if (
      $("taskSettingsReward")
    ) {

      $("taskSettingsReward").value =
        safeNumber(
          data.rewardPerTask
        );
    }


  } catch (error) {

    console.error(
      "Load task settings error:",
      error
    );
  }
}


window.saveTaskSettings =
async function() {

  const active =
    $("taskSettingsActive")
      ?.value === "true";


  const dailyTaskCount =
    Math.floor(
      safeNumber(
        $("taskSettingsCount")
          ?.value
      )
    );


  const rewardPerTask =
    safeNumber(
      $("taskSettingsReward")
        ?.value
    );


  if (
    dailyTaskCount < 0 ||
    rewardPerTask < 0
  ) {

    showMessage(
      "taskSettingsMessage",
      "Enter valid task settings.",
      "error"
    );

    return;
  }


  try {

    await setDoc(
      doc(
        db,
        "settings",
        "taskSettings"
      ),
      {

        active,
        dailyTaskCount,
        rewardPerTask,

        updatedAt:
          serverTimestamp()
      },
      {
        merge: true
      }
    );


    showMessage(
      "taskSettingsMessage",
      "Task settings saved successfully.",
      "success"
    );


  } catch (error) {

    console.error(
      "Save task settings error:",
      error
    );


    showMessage(
      "taskSettingsMessage",
      "Failed to save task settings.",
      "error"
    );
  }
};


/* =========================================================
   TASKS
   ========================================================= */

function loadAdminTasks() {

  const container =
    $("adminTasksList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "📋",
      "Loading Tasks..."
    );


  const q =
    query(
      collection(
        db,
        "tasks"
      ),
      orderBy(
        "order",
        "asc"
      )
    );


  unsubscribeTasks =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "📋",
              "No Tasks",
              "Add your first daily task."
            );

          return;
        }


        container.innerHTML =
          snapshot.docs
            .map(
              docSnap =>
                taskCardHTML(
                  docSnap.id,
                  docSnap.data()
                )
            )
            .join("");
      },


      error => {

        console.error(
          "Tasks listener error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load tasks."
          );
      }
    );
}


window.addAdminTask =
async function() {

  const title =
    $("newTaskTitle")
      ?.value
      .trim();


  const description =
    $("newTaskDescription")
      ?.value
      .trim();


  const order =
    Math.floor(
      safeNumber(
        $("newTaskOrder")
          ?.value
      )
    );


  const active =
    $("newTaskActive")
      ?.value === "true";


  if (
    !title ||
    !description ||
    order < 1
  ) {

    showMessage(
      "adminTaskMessage",
      "Please complete the task fields.",
      "error"
    );

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "tasks"
      ),
      {

        title,
        description,
        order,
        active,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );


    clearInputs([
      "newTaskTitle",
      "newTaskDescription",
      "newTaskOrder"
    ]);


    showMessage(
      "adminTaskMessage",
      "Task added successfully.",
      "success"
    );


  } catch (error) {

    console.error(
      "Add task error:",
      error
    );


    showMessage(
      "adminTaskMessage",
      "Failed to add task.",
      "error"
    );
  }
};


function taskCardHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `
    <div class="admin-level-card">

      <div>

        <strong>
          ${escapeHTML(
            data.title ||
            "Daily Task"
          )}
        </strong>

        <small>
          ${escapeHTML(
            data.description ||
            ""
          )}
        </small>

      </div>


      <div class="admin-level-details">

        <span>
          Order:
          <strong>
            ${safeNumber(
              data.order
            )}
          </strong>
        </span>

        <span>
          Reward:
          <strong>
            Controlled globally
          </strong>
        </span>

        <span>
          Status:
          <strong>
            ${active ? "Active" : "Disabled"}
          </strong>
        </span>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleAdminTask('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Enable"}
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteAdminTask('${escapeHTML(id)}')"
        >
          Delete
        </button>

      </div>

    </div>
  `;
}


window.toggleAdminTask =
async function(
  id,
  currentActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "tasks",
        id
      ),
      {

        active:
          !Boolean(
            currentActive
          ),

        updatedAt:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "Toggle task error:",
      error
    );


    alert(
      error.message ||
      "Failed to update task."
    );
  }
};


window.deleteAdminTask =
async function(id) {

  if (
    !confirm(
      "Delete this task?"
    )
  ) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "tasks",
        id
      )
    );

  } catch (error) {

    console.error(
      "Delete task error:",
      error
    );


    alert(
      error.message ||
      "Failed to delete task."
    );
  }
};


/* =========================================================
   ANNOUNCEMENTS
   ========================================================= */

function loadAdminAnnouncements() {

  const container =
    $("adminAnnouncementsList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "📢",
      "Loading Announcements..."
    );


  const q =
    query(
      collection(
        db,
        "message"
      )
    );


  unsubscribeAnnouncementsAdmin =
    onSnapshot(
      q,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML =
            emptyHTML(
              "📢",
              "No Announcements",
              "Create your first announcement."
            );

          return;
        }


        const docs =
          snapshot.docs.map(
            docSnap => ({
              id: docSnap.id,
              data: docSnap.data()
            })
          );


        docs.sort(
          (a, b) =>
            getMillis(b.data.createdAt) -
            getMillis(a.data.createdAt)
        );


        container.innerHTML =
          docs
            .map(
              item =>
                adminAnnouncementCardHTML(
                  item.id,
                  item.data
                )
            )
            .join("");
      },


      error => {

        console.error(
          "Announcement listener error:",
          error
        );


        container.innerHTML =
          errorHTML(
            "Failed to load announcements."
          );
      }
    );
}


function adminAnnouncementCardHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  const important =
    data.important === true;


  return `
    <div class="admin-level-card">

      <div>

        <strong>
          📢 ${escapeHTML(
            data.title ||
            "Announcement"
          )}
        </strong>

        <small>
          ${escapeHTML(
            data.message ||
            ""
          )}
        </small>

      </div>


      <div class="admin-level-details">

        <span>
          Status:
          <strong>
            ${active ? "Active" : "Disabled"}
          </strong>
        </span>

        <span>
          Important:
          <strong>
            ${important ? "Yes" : "No"}
          </strong>
        </span>

        <span>
          Created:
          <strong>
            ${escapeHTML(
              formatDate(
                data.createdAt
              )
            )}
          </strong>
        </span>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editAdminAnnouncement('${escapeHTML(id)}')"
        >
          Edit
        </button>


        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleAdminAnnouncement('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Enable"}
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteAdminAnnouncement('${escapeHTML(id)}')"
        >
          Delete
        </button>

      </div>

    </div>
  `;
}


window.addAdminAnnouncement =
async function() {

  const title =
    $("newAnnouncementTitle")
      ?.value
      .trim() ||
    "Announcement";


  const message =
    $("newAnnouncementMessage")
      ?.value
      .trim();


  const active =
    $("newAnnouncementActive")
      ?.value !== "false";


  const important =
    $("newAnnouncementImportant")
      ?.value === "true";


  if (!message) {

    showMessage(
      "adminAnnouncementMessage",
      "Please enter announcement message.",
      "error"
    );

    return;
  }


  try {

    await addDoc(
      collection(
        db,
        "message"
      ),
      {

        title,
        message,
        active,
        important,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),

        createdBy:
          currentAdmin?.uid ||
          null
      }
    );


    clearInputs([
      "newAnnouncementTitle",
      "newAnnouncementMessage"
    ]);


    showMessage(
      "adminAnnouncementMessage",
      "Announcement added successfully.",
      "success"
    );


  } catch (error) {

    console.error(
      "Add announcement error:",
      error
    );


    showMessage(
      "adminAnnouncementMessage",
      error.message ||
      "Failed to add announcement.",
      "error"
    );
  }
};


window.editAdminAnnouncement =
async function(id) {

  try {

    const ref =
      doc(
        db,
        "message",
        id
      );


    const snap =
      await getDoc(ref);


    if (!snap.exists()) {

      alert(
        "Announcement not found."
      );

      return;
    }


    const data =
      snap.data();


    const title =
      prompt(
        "Announcement Title:",
        data.title ||
        "Announcement"
      );


    if (title === null) return;


    const message =
      prompt(
        "Announcement Message:",
        data.message ||
        ""
      );


    if (message === null) return;


    if (
      !message.trim()
    ) {

      alert(
        "Message cannot be empty."
      );

      return;
    }


    const importantInput =
      prompt(
        "Important? Enter yes or no:",
        data.important
          ? "yes"
          : "no"
      );


    if (
      importantInput === null
    ) return;


    const important =
      String(
        importantInput
      )
        .trim()
        .toLowerCase() ===
      "yes";


    await updateDoc(
      ref,
      {

        title:
          title.trim() ||
          "Announcement",

        message:
          message.trim(),

        important,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentAdmin?.uid ||
          null
      }
    );


    alert(
      "Announcement updated successfully."
    );


  } catch (error) {

    console.error(
      "Edit announcement error:",
      error
    );


    alert(
      error.message ||
      "Failed to update announcement."
    );
  }
};


window.toggleAdminAnnouncement =
async function(
  id,
  currentActive
) {

  try {

    await updateDoc(
      doc(
        db,
        "message",
        id
      ),
      {

        active:
          !Boolean(
            currentActive
          ),

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentAdmin?.uid ||
          null
      }
    );

  } catch (error) {

    console.error(
      "Toggle announcement error:",
      error
    );


    alert(
      error.message ||
      "Failed to update announcement."
    );
  }
};


window.deleteAdminAnnouncement =
async function(id) {

  if (
    !confirm(
      "Delete this announcement?"
    )
  ) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "message",
        id
      )
    );

  } catch (error) {

    console.error(
      "Delete announcement error:",
      error
    );


    alert(
      error.message ||
      "Failed to delete announcement."
    );
  }
};


/* =========================================================
   CALENDAR
   ========================================================= */

async function getAdminCalendarData() {

  const ref =
    doc(
      db,
      "settings",
      "calendar"
    );


  const snap =
    await getDoc(ref);


  if (!snap.exists()) {

    return {
      closed: false,
      closedDates: [],
      restDates: []
    };
  }


  const data =
    snap.data();


  return {

    closed:
      data.closed === true,

    closedDates:
      Array.isArray(
        data.closedDates
      )
        ? data.closedDates
        : [],

    restDates:
      Array.isArray(
        data.restDates
      )
        ? data.restDates
        : []
  };
}


async function loadAdminCalendar() {

  const container =
    $("adminCalendarList");

  if (!container) return;


  container.innerHTML =
    loadingHTML(
      "📅",
      "Loading Calendar..."
    );


  try {

    const data =
      await getAdminCalendarData();


    renderAdminCalendar(
      data
    );


  } catch (error) {

    console.error(
      "Load calendar error:",
      error
    );


    container.innerHTML =
      errorHTML(
        "Failed to load calendar."
      );
  }
}


function renderAdminCalendar(
  data
) {

  const container =
    $("adminCalendarList");

  if (!container) return;


  const closedDates =
    Array.isArray(
      data.closedDates
    )
      ? data.closedDates
      : [];


  const restDates =
    Array.isArray(
      data.restDates
    )
      ? data.restDates
      : [];


  const allDates = [];


  closedDates.forEach(
    date =>
      allDates.push({
        date,
        type: "closed"
      })
  );


  restDates.forEach(
    date =>
      allDates.push({
        date,
        type: "rest"
      })
  );


  allDates.sort(
    (a, b) =>
      a.date.localeCompare(
        b.date
      )
  );


  if (
    !allDates.length
  ) {

    container.innerHTML =
      emptyHTML(
        "📅",
        "No Special Dates",
        "No rest or closed dates configured."
      );

  } else {

    container.innerHTML =
      allDates
        .map(item => {

          const label =
            item.type === "closed"
              ? "Closed"
              : "Rest Day";


          return `
            <div class="admin-level-card">

              <div>

                <strong>
                  📅 ${escapeHTML(
                    item.date
                  )}
                </strong>

                <small>
                  ${label}
                </small>

              </div>


              <div class="admin-level-details">

                <span>
                  Type:
                  <strong>
                    ${label}
                  </strong>
                </span>

              </div>


              <div class="admin-action-row">

                <button
                  type="button"
                  class="admin-danger-btn"
                  onclick="window.removeAdminCalendarDate('${escapeHTML(item.date)}', '${item.type}')"
                >
                  Remove
                </button>

              </div>

            </div>
          `;
        })
        .join("");
  }


  const statusElement =
    $("adminCalendarStatus");


  if (statusElement) {

    statusElement.textContent =
      data.closed
        ? "🔴 Calendar globally CLOSED"
        : "🟢 Calendar OPEN";
  }


  const toggleButton =
    $("toggleGlobalCalendarButton");


  if (toggleButton) {

    toggleButton.textContent =
      data.closed
        ? "Open Calendar"
        : "Close Calendar";
  }
}


async function saveAdminCalendarData(
  data
) {

  const ref =
    doc(
      db,
      "settings",
      "calendar"
    );


  await setDoc(
    ref,
    {

      closed:
        data.closed === true,

      closedDates:
        Array.isArray(
          data.closedDates
        )
          ? data.closedDates
          : [],

      restDates:
        Array.isArray(
          data.restDates
        )
          ? data.restDates
          : [],

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentAdmin?.uid ||
        null

    },
    {
      merge: true
    }
  );
}


window.addAdminRestDate =
async function() {

  const input =
    $("newCalendarDate");


  const date =
    input?.value.trim();


  if (!date) {

    showMessage(
      "adminCalendarMessage",
      "Please select a date.",
      "error"
    );

    return;
  }


  try {

    const data =
      await getAdminCalendarData();


    if (
      data.restDates.includes(
        date
      )
    ) {

      showMessage(
        "adminCalendarMessage",
        "This date is already a Rest Day.",
        "error"
      );

      return;
    }


    data.closedDates =
      data.closedDates.filter(
        item =>
          item !== date
      );


    data.restDates.push(
      date
    );


    data.restDates.sort();


    await saveAdminCalendarData(
      data
    );


    if (input) {
      input.value = "";
    }


    showMessage(
      "adminCalendarMessage",
      `${date} added as Rest Day.`,
      "success"
    );


    renderAdminCalendar(
      data
    );


  } catch (error) {

    console.error(
      "Add rest date error:",
      error
    );


    showMessage(
      "adminCalendarMessage",
      error.message ||
      "Failed to add Rest Day.",
      "error"
    );
  }
};


window.addAdminClosedDate =
async function() {

  const input =
    $("newCalendarDate");


  const date =
    input?.value.trim();


  if (!date) {

    showMessage(
      "adminCalendarMessage",
      "Please select a date.",
      "error"
    );

    return;
  }


  try {

    const data =
      await getAdminCalendarData();


    if (
      data.closedDates.includes(
        date
      )
    ) {

      showMessage(
        "adminCalendarMessage",
        "This date is already Closed.",
        "error"
      );

      return;
    }


    data.restDates =
      data.restDates.filter(
        item =>
          item !== date
      );


    data.closedDates.push(
      date
    );


    data.closedDates.sort();


    await saveAdminCalendarData(
      data
    );


    if (input) {
      input.value = "";
    }


    showMessage(
      "adminCalendarMessage",
      `${date} added as Closed Date.`,
      "success"
    );


    renderAdminCalendar(
      data
    );


  } catch (error) {

    console.error(
      "Add closed date error:",
      error
    );


    showMessage(
      "adminCalendarMessage",
      error.message ||
      "Failed to add Closed Date.",
      "error"
    );
  }
};


window.removeAdminCalendarDate =
async function(
  date,
  type
) {

  if (
    !confirm(
      `Remove ${date} from ${
        type === "closed"
          ? "Closed Dates"
          : "Rest Days"
      }?`
    )
  ) {
    return;
  }


  try {

    const data =
      await getAdminCalendarData();


    if (
      type === "closed"
    ) {

      data.closedDates =
        data.closedDates.filter(
          item =>
            item !== date
        );

    } else {

      data.restDates =
        data.restDates.filter(
          item =>
            item !== date
        );
    }


    await saveAdminCalendarData(
      data
    );


    showMessage(
      "adminCalendarMessage",
      `${date} removed successfully.`,
      "success"
    );


    renderAdminCalendar(
      data
    );


  } catch (error) {

    console.error(
      "Remove calendar date error:",
      error
    );


    showMessage(
      "adminCalendarMessage",
      error.message ||
      "Failed to remove date.",
      "error"
    );
  }
};


window.toggleGlobalCalendarClosed =
async function() {

  try {

    const data =
      await getAdminCalendarData();


    data.closed =
      !data.closed;


    await saveAdminCalendarData(
      data
    );


    renderAdminCalendar(
      data
    );


    showMessage(
      "adminCalendarMessage",
      data.closed
        ? "Calendar is now CLOSED."
        : "Calendar is now OPEN.",
      "success"
    );


  } catch (error) {

    console.error(
      "Toggle calendar error:",
      error
    );


    showMessage(
      "adminCalendarMessage",
      error.message ||
      "Failed to update calendar.",
      "error"
    );
  }
};


/* =========================================================
   ANNOUNCEMENT / CALENDAR FALLBACK
   ---------------------------------------------------------
   admin.html kee keessatti sections jiraachuu qabu.
   Yoo hin jirre qofa fallback kana hojjeta.
   ========================================================= */

function ensureAdminAnnouncementCalendarSections() {

  const parent =
    $("adminDashboardPage") ||
    document.body;


  /* -----------------------------------------
     ANNOUNCEMENTS FALLBACK
     ----------------------------------------- */

  if (
    !$("adminAnnouncementsSection")
  ) {

    const section =
      document.createElement(
        "section"
      );


    section.id =
      "adminAnnouncementsSection";


    section.className =
      "admin-section hidden";


    section.innerHTML = `
      <div class="admin-section-header">

        <h2>
          📢 Announcements
        </h2>

      </div>


      <div class="admin-form-card">

        <h3>
          Create Announcement
        </h3>


        <input
          type="text"
          id="newAnnouncementTitle"
          placeholder="Announcement title"
        />


        <textarea
          id="newAnnouncementMessage"
          rows="4"
          placeholder="Announcement message"
        ></textarea>


        <select id="newAnnouncementActive">

          <option value="true">
            Active
          </option>

          <option value="false">
            Disabled
          </option>

        </select>


        <select id="newAnnouncementImportant">

          <option value="false">
            Normal
          </option>

          <option value="true">
            Important
          </option>

        </select>


        <button
          type="button"
          class="admin-primary-btn"
          onclick="window.addAdminAnnouncement()"
        >
          📢 Publish Announcement
        </button>


        <div
          id="adminAnnouncementMessage"
          class="admin-message"
        ></div>

      </div>


      <div
        id="adminAnnouncementsList"
        class="admin-list"
      ></div>
    `;


    parent.appendChild(
      section
    );
  }


  /* -----------------------------------------
     CALENDAR FALLBACK
     ----------------------------------------- */

  if (
    !$("adminCalendarSection")
  ) {

    const section =
      document.createElement(
        "section"
      );


    section.id =
      "adminCalendarSection";


    section.className =
      "admin-section hidden";


    section.innerHTML = `
      <div class="admin-section-header">

        <h2>
          📅 Calendar
        </h2>

        <p>
          Manage Rest Days and Closed Dates.
        </p>

      </div>


      <div class="admin-form-card">

        <h3>
          Calendar Control
        </h3>


        <div
          id="adminCalendarStatus"
          class="admin-message"
        >
          Loading...
        </div>


        <button
          type="button"
          id="toggleGlobalCalendarButton"
          class="admin-secondary-btn"
          onclick="window.toggleGlobalCalendarClosed()"
        >
          Close Calendar
        </button>

      </div>


      <div class="admin-form-card">

        <h3>
          Add Calendar Date
        </h3>


        <input
          type="date"
          id="newCalendarDate"
        />


        <div class="admin-action-row">

          <button
            type="button"
            class="admin-primary-btn"
            onclick="window.addAdminRestDate()"
          >
            💤 Add Rest Day
          </button>


          <button
            type="button"
            class="admin-danger-btn"
            onclick="window.addAdminClosedDate()"
          >
            🔒 Add Closed Date
          </button>

        </div>


        <div
          id="adminCalendarMessage"
          class="admin-message"
        ></div>

      </div>


      <div
        id="adminCalendarList"
        class="admin-list"
      ></div>
    `;


    parent.appendChild(
      section
    );
  }
}


/* =========================================================
   UI HELPERS
   ========================================================= */

function loadingHTML(
  icon,
  title
) {

  return `
    <div class="admin-empty">

      <div>
        ${icon}
      </div>

      <h3>
        ${escapeHTML(title)}
      </h3>

      <p>
        Please wait...
      </p>

    </div>
  `;
}


function emptyHTML(
  icon,
  title,
  description
) {

  return `
    <div class="admin-empty">

      <div>
        ${icon}
      </div>

      <h3>
        ${escapeHTML(title)}
      </h3>

      <p>
        ${escapeHTML(description)}
      </p>

    </div>
  `;
}


function errorHTML(
  message
) {

  return `
    <div class="admin-empty">

      <div>
        ⚠️
      </div>

      <h3>
        Error
      </h3>

      <p>
        ${escapeHTML(message)}
      </p>

    </div>
  `;
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

ensureAdminAnnouncementCalendarSections();


/* Global exports */

window.loadAdminAnnouncements =
  loadAdminAnnouncements;

window.loadAdminCalendar =
  loadAdminCalendar;

window.loadAdminRechargeRequests =
  window.loadAdminRechargeRequests;

window.addAdminAnnouncement =
  window.addAdminAnnouncement;

window.addAdminRestDate =
  window.addAdminRestDate;

window.addAdminClosedDate =
  window.addAdminClosedDate;

window.toggleGlobalCalendarClosed =
  window.toggleGlobalCalendarClosed;

window.addAdminTask =
  window.addAdminTask;

window.addVipLevel =
  window.addVipLevel;

window.addRechargeLevel =
  window.addRechargeLevel;

window.addWithdrawLevel =
  window.addWithdrawLevel;

window.addPaymentMethod =
  window.addPaymentMethod;

window.addTaskSettings =
  window.saveTaskSettings;


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {
    stopAllSectionListeners();
  }
);


console.log(
  "CCUS Admin Panel loaded successfully."
);