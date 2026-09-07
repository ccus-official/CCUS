 /* =========================================================
   CCUS - app.js
   USER APP
   Firebase Authentication + Firestore
========================================================= */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


/* =========================================================
   FIREBASE CONFIG & INITIALIZATION
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

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

setPersistence(auth, browserLocalPersistence).catch(error => {
  console.error("Auth persistence error:", error);
});


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let currentUserData = null;

let selectedRechargeAmount = 0;
let selectedRechargeLevel = null;
let selectedDepositPaymentMethod = null;
let selectedWithdrawAmount = 0;

let rechargeLevels = [];
let withdrawLevels = [];
let userPaymentMethods = [];
let vipLevelsList = [];

let taskSettings = {
  active: true,
  taskCount: 0,
  rewardPerTask: 0
};


/* =========================================================
   LISTENERS
========================================================= */

let unsubscribeUser = null;
let unsubscribeRechargeLevels = null;
let unsubscribeWithdrawLevels = null;
let unsubscribeUserPaymentMethods = null;
let unsubscribeRechargeHistory = null;
let unsubscribeWithdrawHistory = null;
let unsubscribeTasks = null;
let unsubscribeVipLevels = null;
let unsubscribeTeamCommissionHistory = null;


/* =========================================================
   DOM HELPERS & UTILS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = $(id);
  if (element) {
    element.textContent = value;
  }
}

function money(amount) {
  const value = Number(amount || 0);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showElement(id) {
  const element = $(id);
  if (element) {
    element.classList.remove("hidden");
  }
}

function hideElement(id) {
  const element = $(id);
  if (element) {
    element.classList.add("hidden");
  }
}

function getTime(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}


/* =========================================================
   DATE HELPERS
========================================================= */

function getLocalDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}


/* =========================================================
   CALENDAR / OPERATING DAY SYSTEM
========================================================= */

async function getTodayOperatingStatus() {
  const today = getLocalDateString();
  const dayOfWeek = new Date().getDay();

  /* Sunday is ALWAYS blocked */
  if (dayOfWeek === 0) {
    return {
      allowed: false,
      message: "Today is Sunday",
      reason: "sunday"
    };
  }

  try {
    const calendarRef = doc(db, "settings", "calendar");
    const calendarSnap = await getDoc(calendarRef);

    if (!calendarSnap.exists()) {
      return {
        allowed: true,
        message: "",
        reason: "normal"
      };
    }

    const data = calendarSnap.data() || {};

    const closedDates = Array.isArray(data.closedDates) ? data.closedDates.map(String) : [];
    const restDates = Array.isArray(data.restDates) ? data.restDates.map(String) : [];
    const additionalDates = Array.isArray(data.closedDays) ? data.closedDays.map(String) : [];
    const dates = Array.isArray(data.dates) ? data.dates.map(String) : [];

    const allClosedDates = [
      ...closedDates,
      ...restDates,
      ...additionalDates,
      ...dates
    ];

    if (allClosedDates.includes(today)) {
      return {
        allowed: false,
        message: "Today is Rest Day",
        reason: "rest"
      };
    }

    if (data.closed === true || data.isClosed === true) {
      return {
        allowed: false,
        message: "Today is Rest Day",
        reason: "closed"
      };
    }

    if (data.days && typeof data.days === "object") {
      const todaySetting = data.days[today];
      if (
        todaySetting === true ||
        todaySetting === "true" ||
        (
          todaySetting &&
          typeof todaySetting === "object" &&
          (
            todaySetting.closed === true ||
            todaySetting.isClosed === true ||
            todaySetting.rest === true ||
            todaySetting.restDay === true
          )
        )
      ) {
        return {
          allowed: false,
          message: "Today is Rest Day",
          reason: "rest"
        };
      }
    }

    return {
      allowed: true,
      message: "",
      reason: "normal"
    };

  } catch (error) {
    console.warn("Calendar status could not be loaded:", error?.message || error);
    return {
      allowed: true,
      message: "",
      reason: "calendar-error"
    };
  }
}


/* =========================================================
   DEPOSIT CHECK HELPER
========================================================= */

async function hasApprovedDeposit(userId) {
  if (!userId) return false;

  try {
    const q = query(
      collection(db, "rechargeRequests"),
      where("userId", "==", userId),
      where("status", "==", "approved")
    );

    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking approved deposit:", error);
    return false;
  }
}


/* =========================================================
   FIREBASE ERROR & MESSAGES
========================================================= */

function firebaseErrorMessage(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Invalid email or password.";

    case "auth/user-not-found":
      return "No user found with this email.";

    case "auth/email-already-in-use":
      return "This email is already registered.";

    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";

    case "permission-denied":
    case "firestore/permission-denied":
      return "You do not have permission to perform this operation.";

    default:
      return error?.message || "An error occurred. Please try again.";
  }
}

function showMessage(message) {
  const possibleBoxes = [
    "loginMessage",
    "signupMessage",
    "withdrawMessage",
    "personalInfoMessage"
  ];

  for (const id of possibleBoxes) {
    const box = $(id);
    if (box && !box.closest(".hidden")) {
      box.textContent = message;
      box.className = "message error";
      return;
    }
  }

  alert(message);
}


/* =========================================================
   TELEGRAM SUPPORT
========================================================= */

window.openTelegramSupport = function () {
  const telegramUrl = "https://t.me/CCUSSuppor";
  window.open(telegramUrl, "_blank", "noopener,noreferrer");
};


/* =========================================================
   NOTIFICATION BADGE
========================================================= */

const CCUS_ANNOUNCEMENT_SEEN_KEY = "ccus_seen_announcement_ids";
const CCUS_ANNOUNCEMENT_COUNT_KEY = "ccus_unread_announcement_count";

function getSeenAnnouncementIds() {
  try {
    const raw = localStorage.getItem(CCUS_ANNOUNCEMENT_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
}

function saveSeenAnnouncementIds(ids) {
  try {
    const uniqueIds = [...new Set(ids.map(String))];
    const limited = uniqueIds.slice(-100);
    localStorage.setItem(CCUS_ANNOUNCEMENT_SEEN_KEY, JSON.stringify(limited));
  } catch (error) {
    console.warn("Could not save announcement state:", error);
  }
}

function getUnreadAnnouncementCount() {
  try {
    return Number(localStorage.getItem(CCUS_ANNOUNCEMENT_COUNT_KEY) || 0);
  } catch (error) {
    return 0;
  }
}

function saveUnreadAnnouncementCount(count) {
  try {
    const safeCount = Math.max(0, Number(count || 0));
    localStorage.setItem(CCUS_ANNOUNCEMENT_COUNT_KEY, String(safeCount));
    updateNotificationBadge(safeCount);
  } catch (error) {
    updateNotificationBadge(count);
  }
}

function updateNotificationBadge(count) {
  const badge = $("notificationBadge");
  const button = document.querySelector(".notification-btn");
  const safeCount = Math.max(0, Number(count || 0));

  if (badge) {
    if (safeCount <= 0) {
      badge.textContent = "";
      badge.classList.add("hidden");
    } else {
      badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
      badge.classList.remove("hidden");
    }
  }

  if (button) {
    button.setAttribute(
      "aria-label",
      safeCount > 0 ? `${safeCount} new announcements` : "Notifications"
    );
  }
}

function markAnnouncementsAsRead(announcements = []) {
  const ids = announcements
    .map(item => item?.id)
    .filter(Boolean)
    .map(String);

  if (ids.length > 0) {
    const oldIds = getSeenAnnouncementIds();
    saveSeenAnnouncementIds([...oldIds, ...ids]);
  }

  saveUnreadAnnouncementCount(0);
}

function handleAnnouncementNotifications(announcements, changes) {
  const activeAnnouncements = Array.isArray(announcements)
    ? announcements.filter(item => item.active !== false)
    : [];

  const seenIds = getSeenAnnouncementIds();

  const unread = activeAnnouncements.filter(
    item => item?.id && !seenIds.includes(String(item.id))
  );

  const addedIds = (changes || [])
    .filter(change => change.type === "added")
    .map(change => String(change.doc.id));

  let unreadIds = unread.map(item => String(item.id));

  addedIds.forEach(id => {
    if (!seenIds.includes(id) && !unreadIds.includes(id)) {
      unreadIds.push(id);
    }
  });

  saveUnreadAnnouncementCount(unreadIds.length);
}

function initializeNotificationBadge() {
  const count = getUnreadAnnouncementCount();
  updateNotificationBadge(count);
}


/* =========================================================
   AUTHENTICATION
========================================================= */

window.loginUser = async function () {
  const email = $("loginEmail")?.value?.trim() || "";
  const password = $("loginPassword")?.value || "";

  if (!email || !password) {
    showMessage("Please enter both email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showMessage(firebaseErrorMessage(error));
  }
};

window.logoutUser = async function () {
  try {
    cleanupListeners();
    await signOut(auth);
  } catch (error) {
    showMessage(firebaseErrorMessage(error));
  }
};

window.forgotPassword = async function () {
  const email = $("loginEmail")?.value?.trim() || "";

  if (!email) {
    showMessage("Please enter your email address first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset link has been sent to your email.");
  } catch (error) {
    showMessage(firebaseErrorMessage(error));
  }
};

window.signupUser = async function () {
  const name = $("signupName")?.value?.trim() || "";
  const email = $("signupEmail")?.value?.trim() || "";
  const password = $("signupPassword")?.value || "";
  const confirmPassword = $("signupConfirmPassword")?.value || "";
  const referralCode = $("referralCode")?.value?.trim() || "";

  if (!name || !email) {
    showMessage("Please fill in all required fields.");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must be at least 6 characters long.");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords do not match.");
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    await updateProfile(user, { displayName: name });

    const generatedReferralCode = "CCUS" + String(user.uid).substring(0, 6).toUpperCase();

    const userData = {
      uid: user.uid,
      fullName: name,
      email: email,
      accountNumber: "CCUS" + String(user.uid).substring(0, 8).toUpperCase(),
      referralCode: generatedReferralCode,
      referredBy: referralCode || "",
      totalBalance: 0,
      totalRecharge: 0,
      vipLevel: "VIP 0",
      withdrawPaymentMethod: "",
      withdrawAccountNumber: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "users", user.uid), userData);

    if (referralCode) {
      try {
        await addDoc(collection(db, "referrals"), {
          referredUserId: user.uid,
          referredUserName: name,
          referralCode: referralCode,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("Referral tracking error:", e);
      }
    }

    showMessage("Account created successfully.");

  } catch (error) {
    showMessage(firebaseErrorMessage(error));
  }
};


/* =========================================================
   NAVIGATION & LISTENER CLEANUP
========================================================= */

function hideAllPages() {
  const pages = [
    "loginPage",
    "signupPage",
    "homePage",
    "tasksPage",
    "walletPage",
    "depositPage",
    "withdrawPage",
    "profilePage",
    "referralPage",
    "helpPage",
    "aboutPage",
    "vipPage",
    "announcementsPage"
  ];

  pages.forEach(id => hideElement(id));
}

function updateBottomNav(activePage) {
  const bottomNav = $("bottomNav");
  if (!bottomNav) return;

  const items = bottomNav.querySelectorAll(".nav-item");
  items.forEach(item => item.classList.remove("active"));

  const mapping = {
    home: 0,
    tasks: 1,
    vip: 1,
    team: 2,
    referral: 2,
    wallet: 3,
    profile: 4
  };

  const index = mapping[activePage];
  if (index !== undefined && items[index]) {
    items[index].classList.add("active");
  }
}

function clearPageSpecificListeners() {
  if (typeof unsubscribeRechargeLevels === "function") {
    unsubscribeRechargeLevels();
    unsubscribeRechargeLevels = null;
  }

  if (typeof unsubscribeWithdrawLevels === "function") {
    unsubscribeWithdrawLevels();
    unsubscribeWithdrawLevels = null;
  }

  if (typeof unsubscribeUserPaymentMethods === "function") {
    unsubscribeUserPaymentMethods();
    unsubscribeUserPaymentMethods = null;
  }

  if (typeof unsubscribeRechargeHistory === "function") {
    unsubscribeRechargeHistory();
    unsubscribeRechargeHistory = null;
  }

  if (typeof unsubscribeWithdrawHistory === "function") {
    unsubscribeWithdrawHistory();
    unsubscribeWithdrawHistory = null;
  }

  if (typeof unsubscribeTasks === "function") {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }

  if (typeof unsubscribeVipLevels === "function") {
    unsubscribeVipLevels();
    unsubscribeVipLevels = null;
  }

  if (typeof unsubscribeTeamCommissionHistory === "function") {
    unsubscribeTeamCommissionHistory();
    unsubscribeTeamCommissionHistory = null;
  }

  if (typeof window.ccusAnnouncementUnsubscribe === "function") {
    try {
      window.ccusAnnouncementUnsubscribe();
    } catch (e) {}
    window.ccusAnnouncementUnsubscribe = null;
  }
}

function cleanupListeners() {
  if (typeof unsubscribeUser === "function") {
    unsubscribeUser();
    unsubscribeUser = null;
  }
  clearPageSpecificListeners();
}

window.openPage = function (page) {
  if (page === "login" || page === "signup") {
    cleanupListeners();
    hideAllPages();
    hideElement("bottomNav");
    showElement(page === "login" ? "loginPage" : "signupPage");
    return;
  }

  if (!currentUser) {
    window.showLogin();
    return;
  }

  clearPageSpecificListeners();
  hideAllPages();

  const pageMap = {
    home: "homePage",
    tasks: "tasksPage",
    wallet: "walletPage",
    deposit: "depositPage",
    withdraw: "withdrawPage",
    profile: "profilePage",
    referral: "referralPage",
    team: "referralPage",
    help: "helpPage",
    about: "aboutPage",
    vip: "vipPage",
    announcements: "homePage"
  };

  if (page === "announcements") {
    const announcementPage = $("announcementsPage");
    if (announcementPage) {
      hideAllPages();
      showElement("announcementsPage");
      showElement("bottomNav");
      updateBottomNav("home");
      loadAnnouncements(true);
      return;
    }
    page = "home";
  }

  showElement(pageMap[page] || "homePage");
  showElement("bottomNav");
  updateBottomNav(page);

  switch (page) {
    case "home":
      updateUserUI();
      loadAnnouncements();
      break;

    case "tasks":
      updateUserUI();
      loadDailyTasks();
      break;

    case "vip":
      updateUserUI();
      loadVIPLevels();
      break;

    case "wallet":
      updateUserUI();
      loadRechargeHistory();
      loadWithdrawHistory();
      break;

    case "deposit":
      resetRechargePage();
      loadRechargeLevels();
      loadUserPaymentMethods();
      break;

    case "withdraw":
      resetWithdrawPage();
      updateUserUI();
      loadWithdrawLevels();
      loadWithdrawHistory();
      break;

    case "profile":
      updateUserUI();
      loadProfile();
      break;

    case "referral":
    case "team":
      updateUserUI();
      loadReferral();
      break;

    case "help":
    case "about":
      break;
  }
};

window.navigate = window.openPage;

window.showLogin = () => {
  cleanupListeners();
  hideAllPages();
  hideElement("bottomNav");
  showElement("loginPage");
};

window.showSignup = () => {
  cleanupListeners();
  hideAllPages();
  hideElement("bottomNav");
  showElement("signupPage");
};


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(auth, async user => {
  currentUser = user || null;

  if (!user) {
    currentUserData = null;
    cleanupListeners();
    hideAllPages();
    hideElement("bottomNav");
    showElement("loginPage");
    initializeNotificationBadge();
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    currentUserData = userSnap.exists() ? userSnap.data() : null;

    hideAllPages();
    showElement("homePage");
    showElement("bottomNav");

    updateBottomNav("home");
    updateUserUI();
    startUserListener();

    loadAnnouncements();
    checkAndProcessVIPPayouts();

  } catch (error) {
    console.error("Auth state load error:", error);
  }
});

function startUserListener() {
  if (!currentUser) return;

  if (typeof unsubscribeUser === "function") {
    unsubscribeUser();
  }

  unsubscribeUser = onSnapshot(
    doc(db, "users", currentUser.uid),
    snapshot => {
      if (snapshot.exists()) {
        currentUserData = snapshot.data();
        updateUserUI();
      }
    },
    err => console.warn("User listener reconnect:", err.message)
  );
}

function updateUserUI() {
  if (!currentUserData) return;

  const totalBalance = Number(currentUserData.totalBalance || 0);
  const totalRecharge = Number(currentUserData.totalRecharge || 0);

  setText("totalBalance", money(totalBalance));
  setText("totalRecharge", money(totalRecharge));
  setText("walletTotalBalance", money(totalBalance));
  setText("walletTotalRecharge", money(totalRecharge));
  setText("withdrawTotalBalance", money(totalBalance));

  setText("profileName", currentUserData.fullName || currentUser?.displayName || "CCUS User");
  setText("profileEmail", currentUserData.email || currentUser?.email || "No email");
  setText("referralCodeDisplay", currentUserData.referralCode || "");

  if ($("personalFullName") && !$("personalFullName").value) {
    $("personalFullName").value = currentUserData.fullName || "";
  }
  if ($("personalEmail") && !$("personalEmail").value) {
    $("personalEmail").value = currentUserData.email || "";
  }
  if ($("personalAccountNumber") && !$("personalAccountNumber").value) {
    $("personalAccountNumber").value = currentUserData.accountNumber || "";
  }
  if ($("personalPaymentMethod") && !$("personalPaymentMethod").value) {
    $("personalPaymentMethod").value = currentUserData.withdrawPaymentMethod || "";
  }
}


/* =========================================================
   RECHARGE LEVEL SYSTEM
========================================================= */

function loadRechargeLevels() {
  const container = $("rechargeAmountList");
  if (!container) return;

  if (typeof unsubscribeRechargeLevels === "function") {
    unsubscribeRechargeLevels();
  }

  unsubscribeRechargeLevels = onSnapshot(
    collection(db, "rechargeLevels"),
    snapshot => {
      rechargeLevels = [];

      snapshot.forEach(item => {
        const data = item.data() || {};
        if (data.active === false) return;

        const amount = Number(data.amount || 0);
        if (amount <= 0) return;

        rechargeLevels.push({
          id: item.id,
          amount: amount,
          depositAmount: amount,
          level: data.level || data.name || `Level ${item.id}`,
          name: data.name || data.displayName || data.level || `Level ${item.id}`,
          commission: Number(data.commission || 0),
          order: Number(data.order ?? 9999),
          taskLimit: Number(data.taskLimit ?? 0),
          active: true
        });
      });

      rechargeLevels.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999));
      renderRechargeLevels();
    },
    err => {
      console.warn("Recharge levels error:", err.message);
      if ($("rechargeAmountList")) {
        $("rechargeAmountList").innerHTML = `<p style="text-align:center;color:#c00;padding:10px;">Could not load recharge levels.</p>`;
      }
    }
  );
}

function renderRechargeLevels() {
  const container = $("rechargeAmountList");
  if (!container) return;

  container.innerHTML = "";

  if (rechargeLevels.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#777;padding:12px;">No recharge levels available.</p>`;
    return;
  }

  rechargeLevels.forEach(level => {
    const amount = Number(level.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "amount-btn";
    button.innerHTML = `<strong>${money(amount)} ETB</strong>`;

    button.addEventListener("click", () => {
      selectedRechargeAmount = amount;
      selectedRechargeLevel = level;

      const input = $("rechargeAmount");
      if (input) input.value = amount;

      container.querySelectorAll(".amount-btn").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
    });

    container.appendChild(button);
  });
}

function resetRechargePage() {
  selectedRechargeAmount = 0;
  selectedRechargeLevel = null;
  selectedDepositPaymentMethod = null;

  showElement("rechargeStep1");
  hideElement("rechargeStep2");
  hideElement("rechargeStep3");
  hideElement("rechargePending");

  if ($("rechargeAmount")) $("rechargeAmount").value = "";
  if ($("transactionId")) $("transactionId").value = "";
}

function loadUserPaymentMethods() {
  const container = $("depositPaymentMethods");
  if (!container) return;

  if (typeof unsubscribeUserPaymentMethods === "function") {
    unsubscribeUserPaymentMethods();
  }

  unsubscribeUserPaymentMethods = onSnapshot(
    collection(db, "settings", "paymentMethods", "methods"),
    snapshot => {
      userPaymentMethods = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        if (data.active === false) return;

        userPaymentMethods.push({
          id: docSnap.id,
          name: data.name || data.title || "Payment",
          accountName: data.accountName || "",
          accountNumber: data.accountNumber || "",
          order: Number(data.order ?? 9999),
          ...data
        });
      });

      userPaymentMethods.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999));
      renderPaymentMethods();
    },
    err => console.warn("Payment methods error:", err.message)
  );
}

function renderPaymentMethods() {
  const container = $("depositPaymentMethods");
  if (!container) return;

  container.innerHTML = "";

  if (userPaymentMethods.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#777;padding:10px;">No payment methods available right now.</p>`;
    return;
  }

  userPaymentMethods.forEach(method => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "payment-method-btn";
    button.style.cssText = "width:100%;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px;background:#fff;";
    button.textContent = method.name;

    button.addEventListener("click", () => {
      selectedDepositPaymentMethod = method;
      container.querySelectorAll(".payment-method-btn").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
    });

    container.appendChild(button);
  });
}

window.goToPaymentMethod = function () {
  const inputAmount = Number($("rechargeAmount")?.value || 0);

  if (inputAmount > 0) {
    selectedRechargeAmount = inputAmount;
    selectedRechargeLevel = rechargeLevels.find(level => Number(level.amount) === inputAmount) || null;
  }

  if (selectedRechargeAmount <= 0) {
    alert("Please select or enter a valid recharge amount.");
    return;
  }

  setText("transferAmount", `ETB ${money(selectedRechargeAmount)}`);
  hideElement("rechargeStep1");
  showElement("rechargeStep2");
  loadUserPaymentMethods();
};

window.goToPaymentDetails = function () {
  if (!selectedDepositPaymentMethod) {
    alert("Please select a payment method.");
    return;
  }

  setText("finalPaymentMethod", selectedDepositPaymentMethod.name);
  setText("finalAccountName", selectedDepositPaymentMethod.accountName || "—");
  setText("finalAccountNumber", selectedDepositPaymentMethod.accountNumber || "—");
  setText("finalTransferAmount", `ETB ${money(selectedRechargeAmount)}`);

  hideElement("rechargeStep2");
  showElement("rechargeStep3");
};

window.backToAmountStep = () => {
  hideElement("rechargeStep2");
  showElement("rechargeStep1");
};

window.backToPaymentMethod = () => {
  hideElement("rechargeStep3");
  showElement("rechargeStep2");
};

window.submitRecharge = async function () {
  if (!currentUser) return;

  const transactionId = $("transactionId")?.value?.trim() || "";

  if (!transactionId) {
    alert("Please enter the Transaction ID.");
    return;
  }

  if (selectedRechargeAmount <= 0) {
    alert("Invalid recharge amount.");
    return;
  }

  if (!selectedDepositPaymentMethod) {
    alert("Please select a payment method.");
    return;
  }

  if (window._ccusRechargeSubmitting) return;
  window._ccusRechargeSubmitting = true;

  try {
    const matchedLevel = rechargeLevels.find(level => Number(level.amount) === Number(selectedRechargeAmount)) || null;
    const depositLevel = matchedLevel?.level || matchedLevel?.name || "General Deposit";
    const commissionAmount = Number(matchedLevel?.commission || 0);

    await addDoc(collection(db, "rechargeRequests"), {
      userId: currentUser.uid,
      userEmail: currentUser.email || "",
      userName: currentUserData?.fullName || "",
      amount: Number(selectedRechargeAmount),
      depositAmount: Number(selectedRechargeAmount),
      depositLevel: depositLevel,
      rechargeLevelId: matchedLevel?.id || "",
      commissionAmount: commissionAmount,
      paymentMethod: selectedDepositPaymentMethod.name,
      paymentMethodId: selectedDepositPaymentMethod.id,
      accountName: selectedDepositPaymentMethod.accountName || "",
      accountNumber: selectedDepositPaymentMethod.accountNumber || "",
      transactionId: transactionId,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    hideElement("rechargeStep3");
    showElement("rechargePending");

    if ($("transactionId")) $("transactionId").value = "";

  } catch (error) {
    alert(firebaseErrorMessage(error));
  } finally {
    window._ccusRechargeSubmitting = false;
  }
};

function loadRechargeHistory() {
  const container = $("rechargeHistory");
  if (!container || !currentUser) return;

  if (typeof unsubscribeRechargeHistory === "function") {
    unsubscribeRechargeHistory();
  }

  const q = query(
    collection(db, "rechargeRequests"),
    where("userId", "==", currentUser.uid)
  );

  unsubscribeRechargeHistory = onSnapshot(
    q,
    snapshot => {
      const records = [];
      snapshot.forEach(docSnap => records.push({ id: docSnap.id, ...docSnap.data() }));
      records.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderRechargeHistory(records);
    },
    err => console.warn("Recharge history error:", err.message)
  );
}

function renderRechargeHistory(records) {
  const container = $("rechargeHistory");
  if (!container) return;

  container.innerHTML = records.length === 0
    ? `<div class="empty-transactions"><h3>No recharge records found</h3></div>`
    : "";

  records.forEach(r => {
    const statusClass = String(r.status || "pending").toLowerCase();
    const item = document.createElement("div");
    item.className = `history-item ${statusClass}`;
    item.setAttribute("data-status", statusClass);

    item.innerHTML = `
      <div class="history-info">
        <strong>Recharge Level: ${escapeHtml(r.depositLevel || "—")}</strong>
        <span>Ref: ${escapeHtml(r.transactionId || "—")}</span>
      </div>
      <div class="history-right">
        <strong>ETB ${money(r.amount)}</strong>
        <span class="history-status ${statusClass}">${escapeHtml(r.status || "pending")}</span>
      </div>
    `;

    container.appendChild(item);
  });
}


/* =========================================================
   WITHDRAW SYSTEM
========================================================= */

function showWithdrawDayMessage(message) {
  const box = $("withdrawMessage");
  if (box) {
    box.textContent = message;
    box.className = "message error";
    if (!box.closest(".hidden")) return;
  }
  alert(message);
}

function loadWithdrawLevels() {
  const container = $("withdrawAmountList");
  if (!container) return;

  if (typeof unsubscribeWithdrawLevels === "function") {
    unsubscribeWithdrawLevels();
  }

  unsubscribeWithdrawLevels = onSnapshot(
    collection(db, "withdrawLevels"),
    snapshot => {
      withdrawLevels = [];

      snapshot.forEach(item => {
        const data = item.data() || {};
        if (data.active === false) return;

        const amount = Number(data.amount || 0);
        if (amount <= 0) return;

        withdrawLevels.push({
          id: item.id,
          amount: amount,
          name: data.name || item.id,
          order: Number(data.order ?? 9999),
          active: true
        });
      });

      withdrawLevels.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999));
      renderWithdrawLevels();
    },
    err => console.warn("Withdraw levels error:", err.message)
  );
}

function renderWithdrawLevels() {
  const container = $("withdrawAmountList");
  if (!container) return;

  container.innerHTML = "";

  if (withdrawLevels.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#777;">No withdrawal options available.</p>`;
    return;
  }

  withdrawLevels.forEach(level => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "amount-btn";
    button.textContent = `ETB ${money(level.amount)}`;

    button.addEventListener("click", async () => {
      const status = await getTodayOperatingStatus();
      if (!status.allowed) {
        showWithdrawDayMessage(status.message);
        return;
      }

      selectedWithdrawAmount = level.amount;
      if ($("withdrawAmount")) $("withdrawAmount").value = level.amount;

      container.querySelectorAll(".amount-btn").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
    });

    container.appendChild(button);
  });
}

function resetWithdrawPage() {
  selectedWithdrawAmount = 0;
  if ($("withdrawAmount")) $("withdrawAmount").value = "";
  if ($("withdrawPassword")) $("withdrawPassword").value = "";
  hideElement("withdrawPending");
}

window.submitWithdraw = async function () {
  if (!currentUser) return;

  const operatingStatus = await getTodayOperatingStatus();
  if (!operatingStatus.allowed) {
    showWithdrawDayMessage(operatingStatus.message);
    return;
  }

  const amount = Number($("withdrawAmount")?.value || selectedWithdrawAmount);
  const password = $("withdrawPassword")?.value?.trim() || "";

  if (amount <= 0) {
    showMessage("Please enter a valid withdrawal amount.");
    return;
  }

  if (!password) {
    showMessage("Please enter your password.");
    return;
  }

  if (window._ccusWithdrawSubmitting) return;
  window._ccusWithdrawSubmitting = true;

  try {
    if (!currentUser.email) {
      throw new Error("User email address not found.");
    }

    const finalStatus = await getTodayOperatingStatus();
    if (!finalStatus.allowed) {
      showWithdrawDayMessage(finalStatus.message);
      return;
    }

    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);

    const userRef = doc(db, "users", currentUser.uid);
    const withdrawRef = doc(collection(db, "withdrawRequests"));

    await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error("User profile not found.");
      }

      const userData = userSnap.data();
      const currentBalance = Number(userData.totalBalance || 0);

      if (amount > currentBalance) {
        throw new Error("Insufficient total balance for this withdrawal.");
      }

      transaction.update(userRef, {
        totalBalance: currentBalance - amount,
        updatedAt: serverTimestamp()
      });

      transaction.set(withdrawRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        userName: userData.fullName || "",
        amount: amount,
        paymentMethod: userData.withdrawPaymentMethod || "Standard",
        accountNumber: userData.withdrawAccountNumber || "",
        status: "pending",
        balanceDeducted: true,
        balanceRefunded: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    showElement("withdrawPending");
    updateUserUI();

  } catch (error) {
    showMessage(firebaseErrorMessage(error));
  } finally {
    window._ccusWithdrawSubmitting = false;
  }
};

function loadWithdrawHistory() {
  const container = $("withdrawHistory");
  if (!container || !currentUser) return;

  if (typeof unsubscribeWithdrawHistory === "function") {
    unsubscribeWithdrawHistory();
  }

  const q = query(
    collection(db, "withdrawRequests"),
    where("userId", "==", currentUser.uid)
  );

  unsubscribeWithdrawHistory = onSnapshot(
    q,
    snapshot => {
      const records = [];
      snapshot.forEach(docSnap => records.push({ id: docSnap.id, ...docSnap.data() }));
      records.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderWithdrawHistory(records);
    },
    err => console.warn("Withdraw history error:", err.message)
  );
}

function renderWithdrawHistory(records) {
  const container = $("withdrawHistory");
  if (!container) return;

  container.innerHTML = records.length === 0
    ? `<div class="empty-transactions"><h3>No withdrawal transactions found</h3></div>`
    : "";

  records.forEach(r => {
    const statusClass = String(r.status || "pending").toLowerCase();
    const item = document.createElement("div");
    item.className = `history-item ${statusClass}`;
    item.setAttribute("data-status", statusClass);

    item.innerHTML = `
      <div class="history-info">
        <strong>Withdrawal Request</strong>
        <span>Method: ${escapeHtml(r.paymentMethod || "Standard")}</span>
      </div>
      <div class="history-right">
        <strong>ETB ${money(r.amount)}</strong>
        <span class="history-status ${statusClass}">${escapeHtml(r.status || "pending")}</span>
      </div>
    `;

    container.appendChild(item);
  });
}


/* =========================================================
   VIP SYSTEM
========================================================= */

function loadVIPLevels() {
  const container = document.querySelector(".vip-container");
  if (!container) return;

  if (typeof unsubscribeVipLevels === "function") {
    unsubscribeVipLevels();
  }

  unsubscribeVipLevels = onSnapshot(
    collection(db, "vip_levels"),
    snapshot => {
      vipLevelsList = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        if (data.active === false) return;

        const price = Number(data.price || 0);
        const profit = Number(data.profit || 0);
        const validDays = Number(data.validDays || 0);

        if (price <= 0 || validDays <= 0 || profit < 0) return;

        vipLevelsList.push({
          id: docSnap.id,
          name: data.name || `VIP ${data.level || ""}`,
          level: Number(data.level || 0),
          price: price,
          profit: profit,
          validDays: validDays,
          active: true,
          order: Number(data.order ?? 9999)
        });
      });

      vipLevelsList.sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999));
      renderVIPLevels(vipLevelsList);
      checkAndProcessVIPPayouts();
    },
    error => console.warn("VIP connection warning:", error.message)
  );
}

function renderVIPLevels(levels) {
  const container = document.querySelector(".vip-container");
  if (!container) return;

  if (!levels || levels.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#666;padding:20px;">No VIP packages available.</p>`;
    return;
  }

  container.innerHTML = "";

  levels.forEach(vip => {
    const rawVipName = vip.name || `VIP ${vip.level || ""}`;
    const safeVipName = escapeHtml(rawVipName);
    const price = Number(vip.price || 0);
    const profit = Number(vip.profit || 0);
    const validDays = Number(vip.validDays || 0);
    const payoutAmount = price + profit;
    const isCurrentVip = currentUserData?.vipLevel === rawVipName;

    const card = document.createElement("div");
    card.className = "simple-card vip-card";
    card.style.cssText = "border:1px solid #f0a500;margin-bottom:15px;padding:15px;border-radius:10px;background:#ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.05);";

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;color:#f0a500;font-size:1.2rem;">👑 ${safeVipName}</h3>
        <span style="font-weight:bold;font-size:1rem;background:#fff3cd;color:#856404;padding:4px 10px;border-radius:15px;">
          ETB ${money(price)}
        </span>
      </div>
      <hr style="border:0;border-top:1px solid #eee;margin:10px 0;">
      <div style="font-size:0.95rem;line-height:1.7;color:#333;">
        <p style="margin:4px 0;"><strong>Profit:</strong> ETB ${money(profit)}</p>
        <p style="margin:4px 0;"><strong>Validity:</strong> ${validDays} Days</p>
        <p style="margin:4px 0;font-weight:bold;"><strong>Total Return at Expiry:</strong> ETB ${money(payoutAmount)}</p>
      </div>
      <button
        type="button"
        class="primary-btn buy-vip-btn"
        style="margin-top:12px;width:100%;padding:10px;font-weight:bold;cursor:pointer;"
        ${isCurrentVip ? "disabled" : ""}
      >
        ${isCurrentVip ? "Current Active VIP" : "Purchase"}
      </button>
    `;

    const buyBtn = card.querySelector(".buy-vip-btn");
    if (!isCurrentVip && buyBtn) {
      buyBtn.addEventListener("click", () => {
        window.buyVIP(vip.id, rawVipName, price, profit, validDays);
      });
    }

    container.appendChild(card);
  });
}

window.buyVIP = async function (vipId, vipName, price, profit, validDays) {
  if (!currentUser) {
    alert("Please login first!");
    return;
  }

  const vipPrice = Number(price || 0);
  const vipProfit = Number(profit || 0);
  const vipValidDays = Number(validDays || 0);

  if (vipPrice <= 0 || vipValidDays <= 0 || vipProfit < 0) {
    alert("Invalid VIP parameters.");
    return;
  }

  if (window._ccusVipSubmitting) return;
  window._ccusVipSubmitting = true;

  const userRef = doc(db, "users", currentUser.uid);

  try {
    await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error("User account not found.");
      }

      const userData = userSnap.data();
      const currentBalance = Number(userData.totalBalance || 0);

      if (currentBalance < vipPrice) {
        throw new Error(`Insufficient balance! ${vipName} costs ETB ${money(vipPrice)}, but your balance is ETB ${money(currentBalance)}.`);
      }

      const payoutAmount = vipPrice + vipProfit;

      transaction.update(userRef, {
        totalBalance: currentBalance - vipPrice,
        vipLevel: vipName,
        updatedAt: serverTimestamp()
      });

      const orderRef = doc(collection(db, "vip_orders"));
      transaction.set(orderRef, {
        userId: currentUser.uid,
        userName: userData.fullName || "User",
        userEmail: currentUser.email || "",
        vipId: vipId,
        vipName: vipName,
        price: vipPrice,
        profit: vipProfit,
        payoutAmount: payoutAmount,
        validDays: vipValidDays,
        status: "active",
        payoutCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    alert(`Congratulations! You have successfully purchased ${vipName}.`);
    updateUserUI();
    loadVIPLevels();

  } catch (error) {
    console.error("VIP purchase error:", error);
    alert(error.message || "Unable to complete VIP purchase.");
  } finally {
    window._ccusVipSubmitting = false;
  }
};

async function checkAndProcessVIPPayouts() {
  if (!currentUser || window._ccusVipPayoutChecking) return;
  window._ccusVipPayoutChecking = true;

  try {
    const q = query(
      collection(db, "vip_orders"),
      where("userId", "==", currentUser.uid),
      where("status", "==", "active"),
      where("payoutCompleted", "==", false)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    for (const orderDoc of snapshot.docs) {
      try {
        await processSingleVIPPayout(orderDoc.id);
      } catch (error) {
        console.warn("VIP payout skipped:", orderDoc.id, error.message);
      }
    }
  } catch (error) {
    console.warn("VIP payout check error:", error.message);
  } finally {
    window._ccusVipPayoutChecking = false;
  }
}

async function processSingleVIPPayout(orderId) {
  const orderRef = doc(db, "vip_orders", orderId);
  const userRef = doc(db, "users", currentUser.uid);

  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) return;

  const order = orderSnap.data() || {};
  if (order.payoutCompleted === true || String(order.status || "").toLowerCase() === "cancelled") {
    return;
  }

  const createdAt = order.createdAt;
  if (!createdAt || typeof createdAt.toMillis !== "function") return;

  const startTime = createdAt.toMillis();
  const validDays = Number(order.validDays || 0);
  if (validDays <= 0) return;

  const durationMs = validDays * 24 * 60 * 60 * 1000;
  const expiryTime = startTime + durationMs;

  if (Date.now() < expiryTime) return;

  const price = Number(order.price || 0);
  const profit = Number(order.profit || 0);
  let payoutAmount = Number(order.payoutAmount);

  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    payoutAmount = price + profit;
  }

  if (payoutAmount <= 0) return;

  await runTransaction(db, async transaction => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error("User document not found.");
    }

    const userData = userSnap.data();
    const currentBalance = Number(userData.totalBalance || 0);

    transaction.update(userRef, {
      totalBalance: currentBalance + payoutAmount,
      updatedAt: serverTimestamp()
    });

    transaction.update(orderRef, {
      status: "completed",
      payoutCompleted: true,
      payoutProcessedAt: serverTimestamp(),
      finalPayoutAmount: payoutAmount,
      updatedAt: serverTimestamp()
    });
  });
}


/* =========================================================
   DAILY TASKS
========================================================= */

async function loadTaskSettings() {
  try {
    const snapshot = await getDoc(doc(db, "settings", "taskSettings"));
    if (snapshot.exists()) {
      const data = snapshot.data();
      taskSettings = {
        active: data.active === true,
        taskCount: Number(data.taskCount ?? data.dailyTaskCount ?? 0),
        rewardPerTask: Number(data.rewardPerTask || 0)
      };
    }
  } catch (e) {
    console.error("Task settings error:", e);
  }
}

function getUserRechargeLevel() {
  if (!currentUserData) return null;

  const totalRecharge = Number(currentUserData.totalRecharge || 0);
  if (totalRecharge <= 0 || !Array.isArray(rechargeLevels) || rechargeLevels.length === 0) {
    return null;
  }

  const eligibleLevels = rechargeLevels
    .filter(level => Number(level.amount) <= totalRecharge)
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  return eligibleLevels[0] || null;
}

function getUserDailyTaskLimit() {
  const adminTaskCount = Number(taskSettings.taskCount || 0);
  const userLevel = getUserRechargeLevel();

  if (!userLevel) {
    return adminTaskCount;
  }

  const levelLimit = Number(userLevel.taskLimit ?? 0);

  if (Number.isFinite(levelLimit) && levelLimit > 0) {
    return Math.min(
      adminTaskCount > 0 ? adminTaskCount : levelLimit,
      levelLimit
    );
  }

  return adminTaskCount;
}

async function loadDailyTasks() {
  const container = $("taskListContainer");
  if (!container || !currentUser) return;

  if (typeof unsubscribeTasks === "function") {
    unsubscribeTasks();
  }

  if (rechargeLevels.length === 0) {
    try {
      const rechargeSnapshot = await getDocs(collection(db, "rechargeLevels"));
      rechargeLevels = [];

      rechargeSnapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        if (data.active === false) return;

        const amount = Number(data.amount || 0);
        if (amount <= 0) return;

        rechargeLevels.push({
          id: docSnap.id,
          amount: amount,
          name: data.name || data.displayName || data.level || `Level ${docSnap.id}`,
          commission: Number(data.commission || 0),
          order: Number(data.order ?? 9999),
          taskLimit: Number(data.taskLimit ?? 0),
          active: true
        });
      });

      rechargeLevels.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999));
    } catch (error) {
      console.warn("Task recharge levels error:", error.message);
    }
  }

  await loadTaskSettings();
  startDailyTaskListener();
}

function startDailyTaskListener() {
  const today = getLocalDateString();

  unsubscribeTasks = onSnapshot(
    collection(db, "tasks"),
    async snapshot => {
      const tasks = [];

      snapshot.forEach(tDoc => {
        const d = tDoc.data() || {};
        if (d.active !== false) {
          tasks.push({
            id: tDoc.id,
            title: d.title || "Daily Task",
            description: d.description || "",
            order: Number(d.order || 99)
          });
        }
      });

      tasks.sort((a, b) => a.order - b.order);

      if (!taskSettings.active) {
        renderDailyTasks([]);
        return;
      }

      const dailyTaskLimit = getUserDailyTaskLimit();
      const visibleTasks = tasks.slice(0, dailyTaskLimit);

      const tasksWithStatus = await Promise.all(
        visibleTasks.map(async task => {
          const claimRef = doc(
            db,
            "users",
            currentUser.uid,
            "taskClaims",
            `${today}_${task.id}`
          );
          const claimSnap = await getDoc(claimRef);
          return {
            ...task,
            submitted: claimSnap.exists()
          };
        })
      );

      renderDailyTasks(tasksWithStatus);
    },
    err => console.warn("Tasks error:", err.message)
  );
}

function renderDailyTasks(tasks) {
  const container = $("taskListContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!taskSettings.active) {
    container.innerHTML = "<h3 style='text-align:center;'>Tasks are currently disabled.</h3>";
    return;
  }

  if (!tasks || tasks.length === 0) {
    container.innerHTML = "<h3 style='text-align:center;'>No tasks available at the moment.</h3>";
    return;
  }

  tasks.forEach(task => {
    const card = document.createElement("div");
    card.className = "simple-card task-card";
    card.style.cssText = "margin-bottom:12px;padding:12px;border:1px solid #ddd;border-radius:8px;";

    card.innerHTML = `
      <h3>${escapeHtml(task.title)}</h3>
      <p>${escapeHtml(task.description)}</p>
      <div>Reward: ETB ${money(taskSettings.rewardPerTask)}</div>
      <button
        class="primary-btn task-claim-btn"
        style="margin-top:8px;"
        ${task.submitted ? "disabled" : ""}
      >
        ${task.submitted ? "Completed" : "Claim Reward"}
      </button>
      <p class="task-message" style="margin-top:5px;"></p>
    `;

    const btn = card.querySelector(".task-claim-btn");
    const msg = card.querySelector(".task-message");

    if (!task.submitted && btn) {
      btn.addEventListener("click", () => claimTask(task, btn, msg));
    }

    container.appendChild(card);
  });
}

async function claimTask(task, button, messageEl) {
  if (!currentUser) return;

  // 1. Operating Status Check (Sunday / Rest Day)
  const status = await getTodayOperatingStatus();
  if (!status.allowed) {
    if (messageEl) {
      messageEl.style.color = "#d9534f";
      messageEl.textContent = status.message;
    } else {
      alert(status.message);
    }
    return;
  }

  // 2. Deposit Status Check (Check yoo Approved Deposit qabaate)
  const userHasDeposit = await hasApprovedDeposit(currentUser.uid);
  if (!userHasDeposit) {
    const promptMsg = "Tasks claim gochuuf jalqaba dirqama deposit gochuu fi Admin irraa approved ta'uu qaba!";
    if (messageEl) {
      messageEl.style.color = "#d9534f";
      messageEl.textContent = promptMsg;
    } else {
      alert(promptMsg);
    }
    return;
  }

  button.disabled = true;

  try {
    const today = getLocalDateString();
    const userRef = doc(db, "users", currentUser.uid);
    const claimRef = doc(db, "users", currentUser.uid, "taskClaims", `${today}_${task.id}`);

    const finalStatus = await getTodayOperatingStatus();
    if (!finalStatus.allowed) {
      if (messageEl) {
        messageEl.style.color = "#d9534f";
        messageEl.textContent = finalStatus.message;
      }
      button.disabled = false;
      return;
    }

    const dailyTaskLimit = getUserDailyTaskLimit();
    const taskSnapshot = await getDocs(collection(db, "tasks"));
    const allActiveTasks = [];

    taskSnapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (data.active !== false) {
        allActiveTasks.push({
          id: docSnap.id,
          order: Number(data.order || 99)
        });
      }
    });

    allActiveTasks.sort((a, b) => a.order - b.order);

    const taskIndex = allActiveTasks.findIndex(item => item.id === task.id);
    if (taskIndex < 0 || taskIndex >= dailyTaskLimit) {
      throw new Error("This task is not available for your current recharge level.");
    }

    await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      const claimSnap = await transaction.get(claimRef);

      if (claimSnap.exists()) {
        throw new Error("This task has already been completed today.");
      }

      if (!userSnap.exists()) {
        throw new Error("User profile not found.");
      }

      const userData = userSnap.data();
      const currentBalance = Number(userData.totalBalance || 0);
      const reward = Number(taskSettings.rewardPerTask || 0);

      if (reward <= 0) {
        throw new Error("Task reward setting is invalid.");
      }

      transaction.update(userRef, {
        totalBalance: currentBalance + reward,
        updatedAt: serverTimestamp()
      });

      transaction.set(claimRef, {
        userId: currentUser.uid,
        taskId: task.id,
        reward: reward,
        date: today,
        createdAt: serverTimestamp()
      });
    });

    button.textContent = "Completed";
    if (messageEl) {
      messageEl.style.color = "green";
      messageEl.textContent = "Reward claimed successfully!";
    }

    updateUserUI();

  } catch (error) {
    button.disabled = false;

    if (messageEl) {
      messageEl.style.color = "#d9534f";
      messageEl.textContent = error.message || "An error occurred while claiming reward.";
    } else {
      alert(error.message || "An error occurred while claiming reward.");
    }
  }
}


/* =========================================================
   ANNOUNCEMENTS SYSTEM
========================================================= */

function getAnnouncementTime(item) {
  const value = item?.createdAt || item?.created || null;
  if (!value) return "";

  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString();
  } catch (error) {
    return "";
  }
}

function loadAnnouncements(markRead = false) {
  const container = $("announcementContainer") || $("announcementList");
  const homeMessage = $("homeAnnouncement");

  if (!container && !homeMessage && !currentUser) return;

  if (window.ccusAnnouncementUnsubscribe) {
    try {
      window.ccusAnnouncementUnsubscribe();
    } catch (e) {}
    window.ccusAnnouncementUnsubscribe = null;
  }

  const q = query(
    collection(db, "message"),
    where("active", "==", true)
  );

  window.ccusAnnouncementUnsubscribe = onSnapshot(
    q,
    snapshot => {
      const announcements = [];
      snapshot.forEach(docSnap => {
        announcements.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      announcements.sort((a, b) => {
        const getDate = item => {
          const value = item?.createdAt || item?.created || null;
          if (!value) return 0;
          try {
            return value?.toMillis ? value.toMillis() : new Date(value).getTime();
          } catch (error) {
            return 0;
          }
        };
        return getDate(b) - getDate(a);
      });

      const changes = snapshot.docChanges();
      handleAnnouncementNotifications(announcements, changes);

      if (markRead) {
        markAnnouncementsAsRead(announcements);
      }

      if (homeMessage) {
        if (announcements.length === 0) {
          homeMessage.textContent = "No announcements available.";
          homeMessage.style.cursor = "default";
          homeMessage.removeAttribute("role");
          homeMessage.removeAttribute("tabindex");
          homeMessage.onclick = null;
        } else {
          const latest = announcements[0];
          const message = latest.message || latest.title || "No announcement message.";

          homeMessage.textContent = message;
          homeMessage.style.cursor = "pointer";
          homeMessage.style.pointerEvents = "auto";
          homeMessage.setAttribute("role", "button");
          homeMessage.setAttribute("tabindex", "0");

          homeMessage.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            showAnnouncementModal(message, latest.important === true, latest.title || "Announcement");
          };

          homeMessage.onkeydown = function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              showAnnouncementModal(message, latest.important === true, latest.title || "Announcement");
            }
          };
        }
      }

      if (container) {
        renderAnnouncements(announcements, container);
      }
    },
    error => {
      console.error("Announcements listener error:", error);
      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📢</div>
            <p>Unable to load announcements.</p>
          </div>
        `;
      }
    }
  );
}

function renderAnnouncements(announcements, container) {
  if (!container) return;

  if (!announcements || announcements.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📢</div>
        <p>No announcements available.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = announcements
    .map(item => {
      const message = escapeHtml(item.message || item.title || "No announcement message.");
      const title = escapeHtml(item.title || "Announcement");
      const important = item.important === true;

      return `
        <button
          type="button"
          class="announcement-card"
          data-announcement-id="${escapeHtml(item.id)}"
          style="width:100%;text-align:left;cursor:pointer;"
        >
          <div class="announcement-icon">${important ? "⚠️" : "📢"}</div>
          <div class="announcement-content">
            <div class="announcement-title">${title}</div>
            <div class="announcement-message">${message}</div>
            <div class="announcement-time">${escapeHtml(getAnnouncementTime(item))}</div>
            <div class="announcement-read-more" style="margin-top:6px;font-size:12px;opacity:.75;">
              Tap to read full announcement →
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".announcement-card").forEach(card => {
    card.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      const id = this.dataset.announcementId;
      const item = announcements.find(a => a.id === id);
      if (!item) return;

      const oldIds = getSeenAnnouncementIds();
      if (!oldIds.includes(id)) {
        saveSeenAnnouncementIds([...oldIds, id]);
      }

      const unread = announcements.filter(
        a => a?.id && !getSeenAnnouncementIds().includes(String(a.id))
      );

      saveUnreadAnnouncementCount(unread.length);

      showAnnouncementModal(
        item.message || item.title || "",
        item.important === true,
        item.title || "Announcement"
      );
    });
  });
}

function showAnnouncementModal(message, important = false, title = "Announcement") {
  const oldModal = document.getElementById("announcementModal");
  if (oldModal) {
    oldModal.remove();
  }

  const modal = document.createElement("div");
  modal.id = "announcementModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.65);";

  modal.innerHTML = `
    <div id="announcementModalBox" style="width:100%;max-width:500px;max-height:80vh;overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:18px;">
        <h3 id="announcementModalTitle" style="margin:0;font-size:20px;">${escapeHtml(title)}</h3>
        ${important ? `<span style="font-size:12px;font-weight:700;color:#b8860b;">IMPORTANT</span>` : ""}
      </div>
      <div id="announcementModalBody" style="white-space:pre-wrap;line-height:1.7;font-size:15px;color:#333;">
        ${escapeHtml(message)}
      </div>
      <button id="announcementCloseButton" type="button" style="width:100%;margin-top:22px;padding:13px;border:none;border-radius:12px;background:#f0a500;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">
        Close
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  const closeButton = document.getElementById("announcementCloseButton");
  if (closeButton) {
    closeButton.onclick = function () {
      modal.remove();
    };
  }

  modal.addEventListener("click", function (event) {
    if (event.target === modal) {
      modal.remove();
    }
  });

  const escapeHandler = function (event) {
    if (event.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", escapeHandler);
    }
  };

  document.addEventListener("keydown", escapeHandler);
}

window.loadAnnouncements = loadAnnouncements;
window.showAnnouncementModal = showAnnouncementModal;


/* =========================================================
   REFERRAL / TEAM / PROFILE
========================================================= */

function loadProfile() {
  updateUserUI();
}

async function loadReferral() {
  if (!currentUser) return;

  setText("referralCodeDisplay", currentUserData?.referralCode || "");

  try {
    const snapshot = await getDocs(collection(db, "rechargeLevels"));
    const levels = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (data.active === false) return;

      const amount = Number(data.amount || 0);
      if (amount <= 0) return;

      levels.push({
        id: docSnap.id,
        amount: amount,
        name: data.name || data.displayName || data.level || `Level ${docSnap.id}`,
        commission: Number(data.commission || 0),
        order: Number(data.order ?? 9999)
      });
    });

    levels.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999));
    renderTeamDepositLevels(levels.slice(0, 4));

  } catch (error) {
    console.warn("Referral recharge levels error:", error.message);
    renderTeamDepositLevels([]);
  }

  loadTeamCommissionHistory();
}

function renderTeamDepositLevels(levels) {
  const map = [
    ["teamL1Amount", "teamL1Commission"],
    ["teamL2Amount", "teamL2Commission"],
    ["teamL3Amount", "teamL3Commission"],
    ["teamL4Amount", "teamL4Commission"]
  ];

  for (let i = 0; i < map.length; i++) {
    const level = levels[i];
    const amountElement = $(map[i][0]);
    const commissionElement = $(map[i][1]);

    if (level) {
      if (amountElement) amountElement.textContent = `ETB ${money(level.amount)}`;
      if (commissionElement) commissionElement.textContent = `ETB ${money(level.commission)}`;
    } else {
      if (amountElement) amountElement.textContent = "—";
      if (commissionElement) commissionElement.textContent = "—";
    }
  }
}

function loadTeamCommissionHistory() {
  const container = $("teamCommissionHistory");
  if (!container || !currentUser) return;

  if (typeof unsubscribeTeamCommissionHistory === "function") {
    unsubscribeTeamCommissionHistory();
  }

  const q = query(
    collection(db, "teamCommissions"),
    where("referrerId", "==", currentUser.uid)
  );

  unsubscribeTeamCommissionHistory = onSnapshot(
    q,
    snapshot => {
      const records = [];
      snapshot.forEach(docSnap => records.push({ id: docSnap.id, ...docSnap.data() }));
      records.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderTeamCommissionHistory(records);
    },
    error => {
      console.warn("Team commission history error:", error.message);
      renderTeamCommissionHistory([]);
    }
  );
}

function renderTeamCommissionHistory(records) {
  const container = $("teamCommissionHistory");
  if (!container) return;

  if (!records || records.length === 0) {
    container.innerHTML = `
      <div class="empty-transactions">
        <div style="text-align:center;padding:20px;">
          <div style="font-size:32px;margin-bottom:8px;">👥</div>
          <h3>No Commission Yet</h3>
          <p style="color:#777;margin:5px 0;">No referral commissions recorded yet.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  records.forEach(record => {
    const statusClass = String(record.status || "approved").toLowerCase();
    const item = document.createElement("div");
    item.className = `history-item ${statusClass}`;
    item.setAttribute("data-status", statusClass);

    const commission = Number(record.commissionAmount ?? record.commission ?? 0);
    const depositAmount = Number(record.depositAmount ?? record.amount ?? 0);
    const level = record.depositLevel || record.level || "Deposit Level";
    const referredUser = record.referredUserName || record.userName || "Team Member";

    item.innerHTML = `
      <div class="history-info">
        <strong>${escapeHtml(level)}</strong>
        <span>Member: ${escapeHtml(referredUser)}</span>
        <small>Deposit: ETB ${money(depositAmount)}</small>
      </div>
      <div class="history-right">
        <strong>+ ETB ${money(commission)}</strong>
        <span class="history-status ${statusClass}">${escapeHtml(record.status || "approved")}</span>
      </div>
    `;

    container.appendChild(item);
  });
}

window.copyReferralCode = async function () {
  const code = currentUserData?.referralCode || "";

  if (!code) {
    alert("Referral Code not found.");
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    alert("Referral code copied to clipboard!");
  } catch (e) {
    alert("Referral Code: " + code);
  }
};

window.savePersonalInformation = async function () {
  if (!currentUser) return;

  const name = $("personalFullName")?.value?.trim();
  const email = $("personalEmail")?.value?.trim();
  const accountNumber = $("personalAccountNumber")?.value?.trim();
  const paymentMethod = $("personalPaymentMethod")?.value?.trim();
  const password = $("personalPassword")?.value;

  if (!name || !email || !accountNumber || !password) {
    showMessage("Please complete all required fields.");
    return;
  }

  try {
    if (!currentUser.email) {
      throw new Error("User email address not found.");
    }

    const cred = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, cred);

    await updateDoc(doc(db, "users", currentUser.uid), {
      fullName: name,
      email: email,
      accountNumber: accountNumber,
      withdrawPaymentMethod: paymentMethod,
      withdrawAccountNumber: accountNumber,
      updatedAt: serverTimestamp()
    });

    alert("Personal information updated successfully.");

  } catch (error) {
    showMessage(firebaseErrorMessage(error));
  }
};


/* =========================================================
   INITIALIZE
========================================================= */

initializeNotificationBadge();


/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.loadUserData = function () {
  updateUserUI();
};

window.startUserListener = startUserListener;
window.updateUserUI = updateUserUI;
window.cleanupListeners = cleanupListeners;
window.loadDailyTasks = loadDailyTasks;
window.loadVIPLevels = loadVIPLevels;
window.loadRechargeLevels = loadRechargeLevels;
window.loadWithdrawLevels = loadWithdrawLevels;
window.loadRechargeHistory = loadRechargeHistory;
window.loadWithdrawHistory = loadWithdrawHistory;
window.loadProfile = loadProfile;
window.loadReferral = loadReferral;
window.loadAnnouncements = loadAnnouncements;
window.getTodayOperatingStatus = getTodayOperatingStatus;
window.openTelegramSupport = window.openTelegramSupport;
