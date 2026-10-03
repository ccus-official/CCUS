/* =========================================================
CCUS - app.js
Stable Client Application
Firebase JS SDK 12.18.0

IMPORTANT:
Financial operations such as:
- recharge approval
- withdrawal approval/rejection/refund
- referral commission credit
- VIP payout

MUST be enforced by trusted backend / Cloud Functions
and Firestore Security Rules.
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
  EmailAuthProvider,
  updateEmail
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
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


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

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

setPersistence(
  auth,
  browserLocalPersistence
).catch(console.error);


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

let unsubs = {};

window.dailyTasksCache =
  window.dailyTasksCache || [];

window.taskSettings =
  window.taskSettings || {
    active: true,
    taskCount: 0,
    rewardPerTask: 0
  };


/* =========================================================
STORAGE KEYS
========================================================= */

const COUNT_KEY =
  "ccus_announcement_unread_count";

const SEEN_KEY =
  "ccus_seen_announcement_ids";

const INITIALIZED_KEY =
  "ccus_announcement_initialized";


/* =========================================================
HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


const setText = (
  id,
  value
) => {
  const el = $(id);

  if (el) {
    el.textContent =
      value ?? "";
  }
};


const money = amount =>
  Number(amount || 0).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );


/* ---------------------------------------------------------
SAFE HTML ESCAPE
--------------------------------------------------------- */

const escapeHtml = value =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");


/* ---------------------------------------------------------
SHOW / HIDE
--------------------------------------------------------- */

const showElement = id => {
  const el = $(id);

  if (el) {
    el.classList.remove("hidden");
  }
};


const hideElement = id => {
  const el = $(id);

  if (el) {
    el.classList.add("hidden");
  }
};


/* ---------------------------------------------------------
TIME
--------------------------------------------------------- */

const getTime = value => {
  if (!value) return 0;

  try {
    if (
      typeof value.toMillis ===
      "function"
    ) {
      return value.toMillis();
    }

    const time =
      new Date(value).getTime();

    return Number.isFinite(time)
      ? time
      : 0;

  } catch {
    return 0;
  }
};


/* ---------------------------------------------------------
ETHIOPIA DATE
--------------------------------------------------------- */

function getEthiopiaDateParts(
  date = new Date()
) {
  const utcMs =
    date.getTime();

  const ethiopia =
    new Date(
      utcMs +
      3 * 60 * 60 * 1000
    );

  return {
    year:
      ethiopia.getUTCFullYear(),

    month:
      ethiopia.getUTCMonth() + 1,

    day:
      ethiopia.getUTCDate(),

    hour:
      ethiopia.getUTCHours(),

    minute:
      ethiopia.getUTCMinutes(),

    weekday:
      ethiopia.getUTCDay()
  };
}


function getLocalDateString() {
  const d =
    getEthiopiaDateParts();

  return `${d.year}-${String(
    d.month
  ).padStart(2, "0")}-${String(
    d.day
  ).padStart(2, "0")}`;
}


function getEthiopiaMinutes() {
  const d =
    getEthiopiaDateParts();

  return (
    d.hour * 60 +
    d.minute
  );
}


/* ---------------------------------------------------------
TASK ERROR HELPERS
--------------------------------------------------------- */

const isTaskAbortError =
  error => {
    const text =
      String(
        error?.name ||
        error?.message ||
        ""
      ).toLowerCase();

    return [
      "aborterror",
      "aborted",
      "cancelled",
      "canceled",
      "failed to fetch",
      "network error"
    ].some(
      item =>
        text.includes(item)
    );
  };


const isTaskPermissionError =
  error => {
    return error?.code === "permission-denied";
  };


/* =========================================================
LOCAL STORAGE
========================================================= */

function getStorage(
  key,
  fallback
) {
  try {
    const value =
      localStorage.getItem(key);

    if (value === null) {
      return fallback;
    }

    const parsed =
      JSON.parse(value);

    return parsed ?? fallback;

  } catch {
    return fallback;
  }
}


function getSeenIds() {
  const value =
    getStorage(
      SEEN_KEY,
      []
    );

  return Array.isArray(value)
    ? value.map(String)
    : [];
}


function saveSeenIds(ids) {
  try {
    const uniqueIds = [
      ...new Set(
        (ids || [])
          .filter(Boolean)
          .map(String)
      )
    ];

    localStorage.setItem(
      SEEN_KEY,
      JSON.stringify(uniqueIds)
    );

  } catch (error) {
    console.warn(
      "Failed to save announcement seen IDs:",
      error
    );
  }
}


function getAnnouncementUnreadCount() {
  try {
    return Math.max(
      0,
      Number(
        localStorage.getItem(
          COUNT_KEY
        ) || 0
      )
    );

  } catch {
    return 0;
  }
}


function setAnnouncementUnreadCount(
  count
) {
  const safeCount =
    Math.max(
      0,
      Math.floor(
        Number(count || 0)
      )
    );

  try {
    localStorage.setItem(
      COUNT_KEY,
      String(safeCount)
    );
  } catch {}

  if (
    typeof window.ccusNotifUpdateBadge ===
    "function"
  ) {
    window.ccusNotifUpdateBadge();
  }
}


/* =========================================================
ERROR MESSAGE
========================================================= */

function firebaseErrorMessage(
  error
) {
  switch (error?.code) {

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
      return "Network error. Check your connection.";

    case "auth/requires-recent-login":
      return "Please sign in again before changing sensitive information.";

    case "permission-denied":
    case "firestore/permission-denied":
      return "You do not have permission to perform this action.";

    default:
      return (
        error?.message ||
        "An error occurred. Please try again."
      );
  }
}


/* =========================================================
MESSAGE UI
========================================================= */

function showMessage(
  message
) {
  const ids = [
    "loginMessage",
    "signupMessage",
    "withdrawMessage",
    "personalInfoMessage",
    "personalInformationMessage"
  ];

  for (const id of ids) {

    const box = $(id);

    if (
      box &&
      !box.closest(".hidden")
    ) {
      box.textContent =
        message;

      box.className =
        "message error";

      return;
    }
  }

  alert(message);
}


/* =========================================================
TELEGRAM SUPPORT
========================================================= */

window.openTelegramSupport =
  () => {
    const username =
      "CCUSSuppor";

    window.open(
      `https://t.me/${username}`,
      "_blank",
      "noopener,noreferrer"
    );
  };


/* =========================================================
AUTH FUNCTIONS
========================================================= */

const loginUser = async () => {
  const email =
    $("loginEmail")
      ?.value
      ?.trim();

  const password =
    $("loginPassword")
      ?.value || "";

  if (
    !email ||
    !password
  ) {
    return showMessage(
      "Please enter email and password."
    );
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  } catch (error) {
    showMessage(
      firebaseErrorMessage(error)
    );
  }
};


const logoutUser = async () => {
  try {
    cleanupListeners();
    await signOut(auth);
  } catch (error) {
    showMessage(
      firebaseErrorMessage(error)
    );
  }
};


const forgotPassword = async () => {
  const email =
    $("loginEmail")
      ?.value
      ?.trim();

  if (!email) {
    return showMessage(
      "Please enter your email first."
    );
  }

  try {
    await sendPasswordResetEmail(
      auth,
      email
    );

    showMessage(
      "Password reset link sent to your email."
    );

  } catch (error) {
    showMessage(
      firebaseErrorMessage(error)
    );
  }
};


const signupUser = async () => {
  const name =
    $("signupName")
      ?.value
      ?.trim() || "";

  const email =
    $("signupEmail")
      ?.value
      ?.trim() || "";

  const password =
    $("signupPassword")
      ?.value || "";

  const confirmPassword =
    $("signupConfirmPassword")
      ?.value || "";

  const referralCode =
    $("referralCode")
      ?.value
      ?.trim() || "";

  if (
    !name ||
    !email
  ) {
    return showMessage(
      "Please fill all required fields."
    );
  }

  if (
    password.length < 6
  ) {
    return showMessage(
      "Password must be at least 6 characters."
    );
  }

  if (
    password !==
    confirmPassword
  ) {
    return showMessage(
      "Passwords do not match."
    );
  }

  try {
    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(
      credential.user,
      {
        displayName:
          name
      }
    );

    const uid =
      credential.user.uid;

    const referralGenerated =
      "CCUS" +
      uid
        .substring(0, 6)
        .toUpperCase();

    const accountNumber =
      "CCUS" +
      uid
        .substring(0, 8)
        .toUpperCase();

    await setDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        uid,
        fullName: name,
        email,
        accountNumber,
        referralCode: referralGenerated,
        referredBy: referralCode,
        totalBalance: 0,
        totalRecharge: 0,
        vipLevel: "VIP 0",
        createdAt: serverTimestamp()
      }
    );

    if (referralCode) {
      await addDoc(
        collection(
          db,
          "referrals"
        ),
        {
          referredUserId: uid,
          referredUserName: name,
          referralCode,
          createdAt: serverTimestamp()
        }
      ).catch(
        error => {
          console.warn(
            "Referral record failed:",
            error
          );
        }
      );
    }

    showMessage(
      "Account created successfully."
    );

  } catch (error) {
    showMessage(
      firebaseErrorMessage(error)
    );
  }
};

/* =========================================================
CCUS LOGIN
GLOBAL FUNCTION
========================================================= */

window.loginUser = async function () {

  const emailInput =
    document.getElementById("loginEmail");

  const passwordInput =
    document.getElementById("loginPassword");

  const messageElement =
    document.getElementById("loginMessage");

  if (!emailInput || !passwordInput) {

    console.error(
      "❌ Login inputs not found."
    );

    return;
  }


  const email =
    String(
      emailInput.value || ""
    ).trim();

  const password =
    String(
      passwordInput.value || ""
    );


  if (!email) {

    if (messageElement) {
      messageElement.textContent =
        "Email galchi.";
    }

    return;
  }


  if (!password) {

    if (messageElement) {
      messageElement.textContent =
        "Password galchi.";
    }

    return;
  }


  try {

    if (
      typeof signInWithEmailAndPassword !==
      "function"
    ) {

      throw new Error(
        "Firebase Authentication hin qophaa'in."
      );
    }


    const result =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );


    console.log(
      "✅ Login successful:",
      result.user.uid
    );


    if (messageElement) {

      messageElement.style.color =
        "green";

      messageElement.textContent =
        "Login successful.";
    }


    /*
     * onAuthStateChanged kee yoo jiru,
     * inni user UI gara Home geessa.
     */


  } catch (error) {

    console.error(
      "❌ LOGIN ERROR:",
      error?.code,
      error?.message,
      error
    );


    let message =
      "Login failed.";


    switch (
      error?.code
    ) {

      case "auth/invalid-credential":

        message =
          "Email ykn password sirrii miti.";

        break;


      case "auth/invalid-email":

        message =
          "Email sirrii galchi.";

        break;


      case "auth/user-disabled":

        message =
          "Account kun disabled dha.";

        break;


      case "auth/user-not-found":

        message =
          "Account kana hin argamne.";

        break;


      case "auth/wrong-password":

        message =
          "Password sirrii miti.";

        break;


      case "auth/too-many-requests":

        message =
          "Login yaalii baay'ee ta'e. Mee yeroo muraasa eegi.";

        break;


      default:

        message =
          error?.message ||
          "Login failed.";
    }


    if (messageElement) {

      messageElement.style.color =
        "#d9534f";

      messageElement.textContent =
        message;
    }
  }
};


/* =========================================================
PAGE ROUTING
========================================================= */

function hideAllPages() {
  [
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
    "incomePage",
    "announcementsPage"
  ].forEach(
    hideElement
  );
}


function updateBottomNav(
  activePage
) {
  const items =
    $("bottomNav")
      ?.querySelectorAll(
        ".nav-item"
      );

  if (!items) return;

  items.forEach(
    item =>
      item.classList.remove(
        "active"
      )
  );

  const indexMap = {
    home: 0,
    tasks: 1,
    vip: 1,
    team: 2,
    referral: 2,
    wallet: 3,
    profile: 4
  };

  const index =
    indexMap[activePage];

  if (
    index !== undefined &&
    items[index]
  ) {
    items[index].classList.add(
      "active"
    );
  }
}


/* =========================================================
LISTENER CLEANUP
========================================================= */

function stopListener(
  key
) {
  if (
    typeof unsubs[key] ===
    "function"
  ) {
    try {
      unsubs[key]();
    } catch (error) {
      console.warn(
        `Failed to stop listener "${key}":`,
        error
      );
    }
  }

  unsubs[key] = null;
}


function clearPageSpecificListeners() {
  [
    "rechargeLevels",
    "withdrawLevels",
    "userPaymentMethods",
    "rechargeHistory",
    "withdrawHistory",
    "tasks",
    "vipLevels",
    "teamCommissions"
  ].forEach(
    stopListener
  );

  if (
    typeof window.ccusNotifStopListener ===
    "function"
  ) {
    window.ccusNotifStopListener();
  }
}


function cleanupListeners() {
  clearPageSpecificListeners();
  stopListener("user");
  unsubs = {};
  window.dailyTasksCache = [];
}


/* =========================================================
OPEN PAGE
========================================================= */

window.openPage = function(page) {
  if (
    page === "login" ||
    page === "signup"
  ) {
    cleanupListeners();
    hideAllPages();
    hideElement("bottomNav");

    showElement(
      page === "login"
        ? "loginPage"
        : "signupPage"
    );
    return;
  }

  if (!currentUser) {
    return window.showLogin();
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
    income: "incomePage"
  };

  if (page === "announcements") {
    if ($("announcementsPage")) {
      showElement("announcementsPage");
      showElement("bottomNav");
      updateBottomNav("home");

      if (typeof window.loadAnnouncements === "function") {
        window.loadAnnouncements(true);
      }
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
      if (typeof window.loadAnnouncements === "function") {
        window.loadAnnouncements(false);
      }
      break;

    case "tasks":
      updateUserUI();
      if (typeof window.loadDailyTasks === "function") {
        window.loadDailyTasks();
      }
      break;

    case "vip":
      updateUserUI();
      if (typeof window.loadVIPLevels === "function") {
        window.loadVIPLevels();
      }
      break;

    case "income":
      updateUserUI();
      if (typeof window.loadIncomeLevels === "function") {
        window.loadIncomeLevels();
      }
      break;

    case "wallet":
      updateUserUI();
      loadRechargeHistory();
      if (typeof window.loadWithdrawHistory === "function") {
        window.loadWithdrawHistory();
      }
      break;

    case "deposit":
      resetRechargePage();
      loadRechargeLevels();
      loadUserPaymentMethods();
      break;

    case "withdraw":
      if (typeof window.resetWithdrawPage === "function") {
        window.resetWithdrawPage();
      }
      updateUserUI();

      if (typeof window.loadWithdrawLevels === "function") {
        window.loadWithdrawLevels();
      }

      if (typeof window.loadWithdrawHistory === "function") {
        window.loadWithdrawHistory();
      }
      break;

    case "profile":
      updateUserUI();
      loadPersonalInformation();
      break;

    case "referral":
    case "team":
      updateUserUI();
      if (typeof window.loadReferral === "function") {
        window.loadReferral();
      }
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

onAuthStateChanged(
  auth,
  async user => {
    currentUser = user || null;

    if (!user) {
      currentUserData = null;
      cleanupListeners();
      hideAllPages();
      hideElement("bottomNav");
      showElement("loginPage");

      if (typeof window.ccusNotifUpdateBadge === "function") {
        window.ccusNotifUpdateBadge();
      }
      return;
    }

    try {
      const userSnap = await getDoc(
        doc(
          db,
          "users",
          user.uid
        )
      );

      currentUserData = userSnap.exists()
        ? userSnap.data()
        : null;

      hideAllPages();
      showElement("homePage");
      showElement("bottomNav");
      updateBottomNav("home");

      updateUserUI();
      startUserListener();

      if (typeof window.loadAnnouncements === "function") {
        window.loadAnnouncements(false);
      }

    } catch (error) {
      console.error(
        "Auth initialization error:",
        error
      );
    }
  }
);


/* =========================================================
USER LISTENER
========================================================= */

function startUserListener() {
  if (!currentUser) return;

  stopListener("user");

  unsubs.user = onSnapshot(
    doc(
      db,
      "users",
      currentUser.uid
    ),
    snap => {
      if (!snap.exists()) {
        currentUserData = null;
        return;
      }
      currentUserData = snap.data();
      updateUserUI();
    },
    error => {
      console.error(
        "User listener error:",
        error
      );
    }
  );
}


/* =========================================================
USER UI
========================================================= */

function updateUserUI() {
  if (!currentUserData) {
    return;
  }

  const balance = money(currentUserData.totalBalance);
  const recharge = money(currentUserData.totalRecharge);

  [
    "totalBalance",
    "walletTotalBalance",
    "withdrawTotalBalance"
  ].forEach(
    id => setText(id, balance)
  );

  [
    "totalRecharge",
    "walletTotalRecharge"
  ].forEach(
    id => setText(id, recharge)
  );

  setText(
    "profileName",
    currentUserData.fullName ||
    currentUser?.displayName ||
    "CCUS User"
  );

  setText(
    "profileEmail",
    currentUserData.email ||
    currentUser?.email ||
    "No email"
  );

  setText(
    "referralCodeDisplay",
    currentUserData.referralCode || ""
  );
}


/* =========================================================
PERSONAL INFORMATION
========================================================= */

function loadPersonalInformation() {
  if (!currentUser) {
    return;
  }

  const data = currentUserData || {};

  const setValue = (id, value) => {
    const el = $(id);
    if (el) {
      el.value = value ?? "";
    }
  };

  setValue(
    "personalFullName",
    data.fullName || currentUser.displayName || ""
  );

  setValue(
    "personalEmail",
    data.email || currentUser.email || ""
  );



  setValue(
    "personalPaymentMethod",
    data.withdrawPaymentMethod || ""
  );

  hidePersonalInformationMessage();
}


function showPersonalInformationMessage(
  message,
  type = "success"
) {
  const box = $("personalInfoMessage");
  if (!box) return;

  box.textContent = message;
  box.className = `message ${type}`;
  box.classList.remove("hidden");
}


function hidePersonalInformationMessage() {
  const box = $("personalInfoMessage");
  if (!box) return;

  box.textContent = "";
  box.className = "hidden";
}


window.savePersonalInformation = async function() {
  if (!currentUser) {
    return showPersonalInformationMessage(
      "Please login first.",
      "error"
    );
  }

  if (window._ccusPersonalInformationSaving) {
    return;
  }

  const getValue = id =>
    $(id)?.value?.trim() || "";

  const name = getValue("personalFullName");
  const email = getValue("personalEmail");
  const paymentMethod = getValue("personalPaymentMethod");
  const accountNumber = getValue("personalAccountNumber");
  const password = $("personalPassword")?.value || "";

  if (!name) {
    return showPersonalInformationMessage(
      "Please enter your full name.",
      "error"
    );
  }

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return showPersonalInformationMessage(
      "Please enter a valid email address.",
      "error"
    );
  }

  if (!password) {
    return showPersonalInformationMessage(
      "Please enter your current password.",
      "error"
    );
  }

  const saveButton = document.querySelector("#personalInfo .save-btn");
  window._ccusPersonalInformationSaving = true;

  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }

    const currentEmail =
      currentUser.email ||
      currentUserData?.email ||
      "";

    if (!currentEmail) {
      throw new Error("Current email is unavailable.");
    }

    const credential = EmailAuthProvider.credential(
      currentEmail,
      password
    );

    await reauthenticateWithCredential(
      currentUser,
      credential
    );

    if (name !== (currentUser.displayName || "")) {
      await updateProfile(
        currentUser,
        { displayName: name }
      );
    }

    if (email.toLowerCase() !== currentEmail.toLowerCase()) {
      await updateEmail(currentUser, email);
    }

    const userUpdate = {
      fullName: name,
      email,
      withdrawPaymentMethod: paymentMethod,
      withdrawAccountNumber: accountNumber,
      updatedAt: serverTimestamp()
    };

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      userUpdate
    );

    currentUserData = {
      ...(currentUserData || {}),
      ...userUpdate,
      email,
      fullName: name,
      withdrawPaymentMethod: paymentMethod
    };

    updateUserUI();

    showPersonalInformationMessage(
      "Personal information saved successfully.",
      "success"
    );

    if ($("personalPassword")) {
      $("personalPassword").value = "";
    }

  } catch (error) {
    showPersonalInformationMessage(
      firebaseErrorMessage(error),
      "error"
    );

  } finally {
    window._ccusPersonalInformationSaving = false;

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save";
    }
  }
};


window.saveProfile = window.savePersonalInformation;


/* =========================================================
   WITHDRAWAL & OPERATING STATUS
========================================================= */

const isWithdrawalTimeOpen = () => {
  const m = getEthiopiaMinutes();
  return m >= 540 && m < 1050; // 09:00 - 17:30 EAT
};

const getWithdrawalOperatingMessage = () => "Withdrawal is available from 9:00 AM to 5:30 PM EAT.";

async function checkWithdrawalAllowed() {
  if (!isWithdrawalTimeOpen()) {
    showMessage(getWithdrawalOperatingMessage());
    return false;
  }
  const status = await getTodayOperatingStatus();
  if (!status.allowed) {
    showMessage(status.message || "Withdrawals are unavailable today.");
    return false;
  }
  return true;
}

async function getTodayOperatingStatus() {
  const ethiopia = getEthiopiaDateParts();
  const isSunday = ethiopia.weekday === 0;

  try {
    const snapshot = await getDoc(doc(db, "settings", "calendar"));
    if (!snapshot.exists()) {
      return isSunday ? { allowed: false, message: "Today is Sunday.", reason: "sunday" } : { allowed: true, message: "", reason: "normal" };
    }

    const data = snapshot.data() || {};
    const today = getLocalDateString();
    const closedValues = [...(data.closedDates || []), ...(data.restDates || []), ...(data.closedDays || []), ...(data.dates || [])].map(String);
    const daySetting = data.days?.[today];

    const isClosed = closedValues.includes(today) || data.closed === true || data.isClosed === true ||
                     daySetting === true || daySetting === "true" || daySetting?.closed || daySetting?.isClosed || daySetting?.rest || daySetting?.restDay;

    if (isClosed) return { allowed: false, message: "Today is Rest Day.", reason: "rest" };
    if (isSunday) return { allowed: false, message: "Today is Sunday.", reason: "sunday" };

    return { allowed: true, message: "", reason: "normal" };
  } catch (error) {
    console.error("Calendar status error:", error);
    return isSunday ? { allowed: false, message: "Today is Sunday.", reason: "sunday" } : { allowed: true, message: "", reason: "calendar-error" };
  }
}

/* =========================================================
   CCUS - RECHARGE LEVELS + UPGRADE DEPOSIT
========================================================= */

function normalizeRechargeLevel(id, data = {}) {
  const amount = Number(data.amount ?? data.depositAmount ?? data.price ?? 0);

  return {
    id: String(id || ""),
    amount,
    depositAmount: amount,
    level: data.level || data.name || data.displayName || `Level ${id}`,
    commission: Number(data.commission ?? data.referralCommission ?? 0),
    order: Number(data.order ?? 9999),
    taskLimit: Math.max(0, Math.floor(Number(data.taskLimit ?? data.dailyTaskLimit ?? 0))),
    active: data.active !== false
  };
}

function loadRechargeLevels() {
  const container = $("rechargeAmountList");
  if (!container) return;

  stopListener("rechargeLevels");

  unsubs.rechargeLevels = onSnapshot(
    collection(db, "rechargeLevels"),
    snapshot => {
      rechargeLevels = [];
      snapshot.forEach(docSnap => {
        const level = normalizeRechargeLevel(docSnap.id, docSnap.data() || {});
        if (level.active && level.amount > 0) {
          rechargeLevels.push(level);
        }
      });

      rechargeLevels.sort((a, b) => Number(a.amount) - Number(b.amount) || Number(a.order) - Number(b.order));

      renderRechargeLevels(rechargeLevels);

      if (typeof window.renderTeamDepositLevels === "function") {
        window.renderTeamDepositLevels(rechargeLevels);
      }

      loadUpgradeDeposit();
    },
    error => {
      console.error("Recharge levels error:", error);
      container.innerHTML = `<p style="text-align:center;color:#c62828;">Unable to load recharge options.</p>`;
    }
  );
}

function renderRechargeLevels(levels = rechargeLevels) {
  const container = $("rechargeAmountList");
  if (!container) return;

  if (!Array.isArray(levels) || !levels.length) {
    container.innerHTML = `<p style="text-align:center;color:#777;padding:12px;">No recharge levels available.</p>`;
    return;
  }

  container.innerHTML = "";

  levels.forEach(level => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "amount-btn";
    button.innerHTML = `<strong>${money(level.amount)} ETB</strong>`;

    button.onclick = () => {
      selectedRechargeAmount = Number(level.amount);
      selectedRechargeLevel = {
        ...level,
        isUpgrade: false,
        targetLevelId: level.id,
        targetLevel: level.level,
        targetLevelAmount: Number(level.amount)
      };

      if ($("rechargeAmount")) {
        $("rechargeAmount").value = Number(level.amount);
      }

      container.querySelectorAll(".amount-btn").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
    };

    container.appendChild(button);
  });
}

async function getApprovedRechargeRecordsForUpgrade(userId = currentUser?.uid) {
  if (!userId) return [];

  try {
    const snapshot = await getDocs(
      query(collection(db, "rechargeRequests"), where("userId", "==", userId), where("status", "==", "approved"))
    );
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.error("Approved recharge records error:", error);
    return [];
  }
}

async function getUserApprovedRechargeTotal(userId = currentUser?.uid) {
  const records = await getApprovedRechargeRecordsForUpgrade(userId);
  let total = 0;

  records.forEach(record => {
    const isUpgrade = record.isUpgrade === true || String(record.isUpgrade).toLowerCase() === "true";
    let amount = isUpgrade
      ? Number(record.upgradeAmount ?? record.amount ?? record.depositAmount ?? 0)
      : Number(record.amount ?? record.depositAmount ?? record.rechargeAmount ?? 0);

    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  });

  return total;
}

function getCurrentRechargeLevelFromTotal(approvedTotal, levels = rechargeLevels) {
  if (!Array.isArray(levels) || !levels.length) return null;

  const total = Number(approvedTotal) || 0;
  const sorted = [...levels]
    .filter(level => level.active !== false && Number(level.amount) > 0)
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  let currentLevel = null;
  sorted.forEach(level => {
    if (total >= Number(level.amount)) {
      currentLevel = level;
    }
  });

  return currentLevel;
}

function getNextRechargeLevelFromCurrentLevel(currentLevel, levels = rechargeLevels) {
  if (!Array.isArray(levels) || !levels.length) return null;

  const sorted = [...levels]
    .filter(level => level.active !== false && Number(level.amount) > 0)
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  if (!currentLevel) return sorted[0] || null;

  const currentAmount = Number(currentLevel.amount) || 0;
  return sorted.find(level => Number(level.amount) > currentAmount) || null;
}

function getUpgradeDepositInfo(approvedTotal, levels = rechargeLevels) {
  const total = Number(approvedTotal) || 0;
  const currentLevel = getCurrentRechargeLevelFromTotal(total, levels);
  const nextLevel = getNextRechargeLevelFromCurrentLevel(currentLevel, levels);

  if (!nextLevel) {
    return { approvedTotal: total, currentLevel, nextLevel: null, upgradeAmount: 0, isMaximum: true };
  }

  let upgradeAmount = currentLevel
    ? Math.max(0, Number(nextLevel.amount) - Number(currentLevel.amount))
    : Number(nextLevel.amount);

  return { approvedTotal: total, currentLevel, nextLevel, upgradeAmount, isMaximum: false };
}

async function loadUpgradeDeposit() {
  const containers = [$("upgradeDepositContainer"), $("upgradeDeposit"), $("rechargeUpgradeContainer")].filter(Boolean);
  if (!containers.length) return;

  if (!currentUser) {
    containers.forEach(container => { container.innerHTML = ""; });
    return;
  }

  try {
    const approvedTotal = await getUserApprovedRechargeTotal(currentUser.uid);
    const info = getUpgradeDepositInfo(approvedTotal, rechargeLevels);

    if (info.isMaximum) {
      containers.forEach(container => {
        const currentLabel = info.currentLevel ? String(info.currentLevel.level) : "No Level";
        container.innerHTML = `
          <div style="padding:15px;border:1px solid #ddd;border-radius:12px;text-align:center;">
            <strong>Maximum Level Reached</strong>
            <div style="margin-top:6px;color:#777;font-size:13px;">
              Current Level: ${escapeHtml(currentLabel)}
            </div>
          </div>`;
      });
      return;
    }

    const currentLabel = info.currentLevel ? String(info.currentLevel.level) : "No Level";
    const nextLabel = String(info.nextLevel.level);

    containers.forEach((container, index) => {
      const buttonId = `ccusUpgradeDepositBtn_${index}`;
      container.innerHTML = `
        <div class="simple-card" style="margin-top:12px;padding:15px;border:1px solid #f0a500;border-radius:12px;background:#fffaf0;">
          <div style="font-weight:800;font-size:16px;">⬆️ Upgrade Deposit</div>
          <div style="margin-top:8px;font-size:13px;color:#666;">
            Current Level: <strong>${escapeHtml(currentLabel)}</strong>
          </div>
          <div style="margin-top:10px;font-size:13px;color:#666;">
            Next Level: <strong>${escapeHtml(nextLabel)}</strong> · ETB ${money(info.nextLevel.amount)}
          </div>
          <div style="margin-top:12px;font-size:20px;font-weight:900;color:#d88900;">
            Upgrade Deposit: ETB ${money(info.upgradeAmount)}
          </div>
          <button type="button" class="primary-btn upgrade-deposit-btn" style="width:100%;margin-top:12px;" id="${buttonId}">
            ⬆️ Upgrade to ${escapeHtml(nextLabel)}
          </button>
          <p class="upgradeDepositMessage" style="margin-top:8px;font-size:12px;text-align:center;"></p>
        </div>`;

      const button = container.querySelector(`#${buttonId}`);
      if (button) {
        button.onclick = () => selectUpgradeDeposit(info);
      }
    });
  } catch (error) {
    console.error("Upgrade deposit error:", error);
    containers.forEach(container => {
      container.innerHTML = `<p style="text-align:center;color:#c62828;">Unable to load upgrade option.</p>`;
    });
  }
}

function selectUpgradeDeposit(info) {
  if (!info || !info.nextLevel || Number(info.upgradeAmount) <= 0) return;

  const upgradeAmount = Number(info.upgradeAmount);
  const targetLevelAmount = Number(info.nextLevel.amount);

  if (!Number.isFinite(upgradeAmount) || upgradeAmount <= 0) return;

  selectedRechargeAmount = upgradeAmount;
  selectedRechargeLevel = {
    ...info.nextLevel,
    isUpgrade: true,
    upgradeAmount,
    targetLevelId: info.nextLevel.id,
    targetLevel: info.nextLevel.level,
    targetLevelAmount,
    currentLevelId: info.currentLevel?.id || "",
    currentLevel: info.currentLevel?.level || "No Level",
    currentApprovedTotal: Number(info.approvedTotal) || 0
  };

  if ($("rechargeAmount")) {
    $("rechargeAmount").value = upgradeAmount;
  }

  showElement("rechargeStep1");
  hideElement("rechargeStep2");
  hideElement("rechargeStep3");
  hideElement("rechargePending");

  const form = $("rechargeStep1");
  if (form) {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

window.resetRechargePage = function () {
  selectedRechargeAmount = 0;
  selectedRechargeLevel = null;
  selectedDepositPaymentMethod = null;

  showElement("rechargeStep1");
  hideElement("rechargeStep2");
  hideElement("rechargeStep3");
  hideElement("rechargePending");

  if ($("rechargeAmount")) $("rechargeAmount").value = "";
  if ($("transactionId")) $("transactionId").value = "";

  if (typeof loadUpgradeDeposit === "function") {
    loadUpgradeDeposit();
  }
};

/* =========================================================
   CCUS - PAYMENT METHODS & RECHARGE STEPS
   STABLE VERSION
========================================================= */

/* =========================================================
   LOAD USER PAYMENT METHODS
========================================================= */

function loadUserPaymentMethods() {

  const container = $("depositPaymentMethods");

  if (!container) {
    console.warn(
      "depositPaymentMethods container not found."
    );
    return;
  }

  /* ---------------------------------------------------------
     Stop previous listener
  --------------------------------------------------------- */

  stopListener("userPaymentMethods");

  /* ---------------------------------------------------------
     Clear old selected method
  --------------------------------------------------------- */

  selectedDepositPaymentMethod = null;

  /* ---------------------------------------------------------
     Firestore listener

     PATH:
     settings/paymentMethods/methods
  --------------------------------------------------------- */

  const paymentMethodsRef =
    collection(
      db,
      "settings",
      "paymentMethods",
      "methods"
    );

  unsubs.userPaymentMethods =
    onSnapshot(

      paymentMethodsRef,

      snapshot => {

        userPaymentMethods = [];

        snapshot.forEach(docSnap => {

          const data =
            docSnap.data() || {};

          /* -----------------------------------------------
             Ignore disabled methods
          ------------------------------------------------ */

          if (data.active === false) {
            return;
          }

          userPaymentMethods.push({

            id: docSnap.id,

            ...data,

            name:
              String(
                data.name ||
                "Payment"
              )

          });

        });


        /* -------------------------------------------------
           SORT BY ADMIN ORDER
        ------------------------------------------------- */

        userPaymentMethods.sort(
          (a, b) =>
            Number(a.order ?? 9999)
            -
            Number(b.order ?? 9999)
        );


        /* -------------------------------------------------
           RENDER
        ------------------------------------------------- */

        renderPaymentMethods();

      },

      error => {

        console.error(
          "Payment method error:",
          error
        );

        userPaymentMethods = [];

        container.innerHTML = `
          <p
            style="
              text-align:center;
              color:#c62828;
              padding:12px;
            "
          >
            Unable to load payment methods.
          </p>
        `;

      }
    );
}


/* =========================================================
   RENDER PAYMENT METHODS
========================================================= */

function renderPaymentMethods() {

  const container =
    $("depositPaymentMethods");

  if (!container) {
    return;
  }


  /* ---------------------------------------------------------
     No methods
  --------------------------------------------------------- */

  if (!userPaymentMethods.length) {

    container.innerHTML = `
      <p
        style="
          text-align:center;
          color:#777;
          padding:12px;
        "
      >
        No payment methods available.
      </p>
    `;

    return;
  }


  /* ---------------------------------------------------------
     Clear
  --------------------------------------------------------- */

  container.innerHTML = "";


  /* ---------------------------------------------------------
     Render each method
  --------------------------------------------------------- */

  userPaymentMethods.forEach(
    method => {

      const button =
        document.createElement(
          "button"
        );

      button.type = "button";

      button.className =
        "payment-method-btn";

      button.style.cssText =
        `
          width:100%;
          padding:10px;
          margin-bottom:8px;
          border:1px solid #ccc;
          border-radius:6px;
          background:#fff;
          cursor:pointer;
        `;

      button.textContent =
        method.name;


      /* -----------------------------------------------------
         SELECT PAYMENT METHOD
      ----------------------------------------------------- */

      button.onclick = () => {

        selectedDepositPaymentMethod =
          method;


        container
          .querySelectorAll(
            ".payment-method-btn"
          )
          .forEach(btn => {

            btn.classList.remove(
              "active"
            );

            btn.style.borderColor =
              "#ccc";

            btn.style.background =
              "#fff";

          });


        button.classList.add(
          "active"
        );

        button.style.borderColor =
          "#1976d2";

        button.style.background =
          "#e3f2fd";

      };


      container.appendChild(
        button
      );

    }
  );
}


/* =========================================================
   GO TO PAYMENT METHOD STEP
========================================================= */

window.goToPaymentMethod =
  function () {

    const amount =
      Number(
        $("rechargeAmount")?.value || 0
      );


    /* -------------------------------------------------------
       Amount entered
    ------------------------------------------------------- */

    if (
      Number.isFinite(amount)
      &&
      amount > 0
    ) {

      selectedRechargeAmount =
        amount;


      /* -----------------------------------------------------
         Upgrade
      ----------------------------------------------------- */

      if (
        selectedRechargeLevel
        &&
        selectedRechargeLevel.isUpgrade
          === true
      ) {

        selectedRechargeAmount =
          amount;

      }

      /* -----------------------------------------------------
         Normal recharge
      ----------------------------------------------------- */

      else {

        selectedRechargeLevel =
          rechargeLevels.find(
            level =>
              Number(level.amount)
              ===
              Number(amount)
          )
          ||
          null;


        if (!selectedRechargeLevel) {

          return alert(
            "Please select a valid recharge level."
          );

        }

      }

    }


    /* -------------------------------------------------------
       Validate amount
    ------------------------------------------------------- */

    if (
      !Number.isFinite(
        Number(selectedRechargeAmount)
      )
      ||
      Number(selectedRechargeAmount) <= 0
    ) {

      return alert(
        "Please select or enter a valid amount."
      );

    }


    /* -------------------------------------------------------
       Display amount
    ------------------------------------------------------- */

    setText(
      "transferAmount",
      `ETB ${money(selectedRechargeAmount)}`
    );


    /* -------------------------------------------------------
       Reset selected payment method
    ------------------------------------------------------- */

    selectedDepositPaymentMethod =
      null;


    /* -------------------------------------------------------
       Steps
    ------------------------------------------------------- */

    hideElement(
      "rechargeStep1"
    );

    showElement(
      "rechargeStep2"
    );


    /* -------------------------------------------------------
       Load methods
    ------------------------------------------------------- */

    loadUserPaymentMethods();

  };


/* =========================================================
   GO TO PAYMENT DETAILS
========================================================= */

window.goToPaymentDetails =
  function () {

    if (
      !selectedDepositPaymentMethod
    ) {

      return alert(
        "Please select a payment method."
      );

    }


    const method =
      selectedDepositPaymentMethod;


    setText(
      "finalPaymentMethod",
      method.name || "Payment"
    );


    setText(
      "finalAccountName",
      method.accountName || "—"
    );


    setText(
      "finalAccountNumber",
      method.accountNumber || "—"
    );


    setText(
      "finalTransferAmount",
      `ETB ${money(selectedRechargeAmount)}`
    );


    hideElement(
      "rechargeStep2"
    );

    showElement(
      "rechargeStep3"
    );

  };


/* =========================================================
   BACK TO AMOUNT
========================================================= */

window.backToAmountStep =
  function () {

    hideElement(
      "rechargeStep2"
    );

    showElement(
      "rechargeStep1"
    );

  };


/* =========================================================
   BACK TO PAYMENT METHOD
========================================================= */

window.backToPaymentMethod =
  function () {

    hideElement(
      "rechargeStep3"
    );

    showElement(
      "rechargeStep2"
    );

  };


/* =========================================================
   SUBMIT RECHARGE
========================================================= */

window.submitRecharge =
  async function () {

    if (
      !currentUser
      ||
      window._ccusRechargeSubmitting
    ) {

      return;
    }


    /* -------------------------------------------------------
       Transaction ID
    ------------------------------------------------------- */

    const transactionId =
      $("transactionId")
        ?.value
        ?.trim();


    if (!transactionId) {

      return alert(
        "Please enter Transaction ID."
      );

    }


    /* -------------------------------------------------------
       Validate payment method
    ------------------------------------------------------- */

    if (
      !selectedDepositPaymentMethod
    ) {

      return alert(
        "Please select a payment method."
      );

    }


    /* -------------------------------------------------------
       Validate amount
    ------------------------------------------------------- */

    if (
      !Number.isFinite(
        Number(selectedRechargeAmount)
      )
      ||
      Number(selectedRechargeAmount) <= 0
    ) {

      return alert(
        "Invalid recharge amount."
      );

    }


    window._ccusRechargeSubmitting =
      true;


    try {

      let amount =
        Number(
          selectedRechargeAmount
        );


      const isUpgrade =
        selectedRechargeLevel?.isUpgrade
        === true;


      let level = null;


      /* =====================================================
         NORMAL RECHARGE
      ===================================================== */

      if (!isUpgrade) {

        level =
          rechargeLevels.find(
            item =>
              Number(item.amount)
              ===
              Number(amount)
          )
          ||
          null;


        if (!level) {

          throw new Error(
            "Selected recharge level was not found."
          );

        }

      }


      /* =====================================================
         UPGRADE RECHARGE
      ===================================================== */

      if (isUpgrade) {

        const approvedTotal =
          await getUserApprovedRechargeTotal(
            currentUser.uid
          );


        const freshInfo =
          getUpgradeDepositInfo(
            approvedTotal,
            rechargeLevels
          );


        if (
          freshInfo.isMaximum
          ||
          !freshInfo.nextLevel
        ) {

          throw new Error(
            "You are already at the maximum level."
          );

        }


        level =
          freshInfo.nextLevel;


        const expectedUpgradeAmount =
          Number(level.amount)
          -
          Number(
            freshInfo.currentLevel?.amount
            || 0
          );


        const finalUpgradeAmount =
          freshInfo.currentLevel
            ? expectedUpgradeAmount
            : Number(level.amount);


        amount =
          Number(
            $("rechargeAmount")?.value
            ||
            selectedRechargeAmount
            ||
            0
          );


        if (
          !Number.isFinite(amount)
          ||
          amount <= 0
        ) {

          throw new Error(
            "Invalid upgrade amount."
          );

        }


        if (
          Math.abs(
            amount -
            finalUpgradeAmount
          ) > 0.001
        ) {

          throw new Error(
            `Upgrade amount must be ETB ${money(finalUpgradeAmount)}`
          );

        }


        selectedRechargeAmount =
          finalUpgradeAmount;


        selectedRechargeLevel = {

          ...level,

          isUpgrade: true,

          upgradeAmount:
            finalUpgradeAmount,

          targetLevelId:
            level.id,

          targetLevel:
            level.level,

          targetLevelAmount:
            Number(level.amount),

          currentLevelId:
            freshInfo.currentLevel?.id
            || "",

          currentLevel:
            freshInfo.currentLevel?.level
            || "No Level",

          currentApprovedTotal:
            approvedTotal

        };

      }


      /* =====================================================
         PAYMENT METHOD
      ===================================================== */

      const paymentMethod =
        selectedDepositPaymentMethod;


      /* =====================================================
         RECHARGE REQUEST DATA
      ===================================================== */

      const requestData = {

        userId:
          currentUser.uid,

        userEmail:
          currentUser.email || "",

        userName:
          currentUserData?.fullName
          ||
          currentUser.displayName
          ||
          "",

        amount:
          amount,

        depositAmount:
          amount,

        rechargeLevelId:
          level?.id || "",

        depositLevel:
          level?.level
          ||
          "General Deposit",

        levelName:
          level?.level
          ||
          "General Deposit",

        commissionAmount:
          Number(
            level?.commission || 0
          ),

        paymentMethod:
          paymentMethod.name || "Payment",

        paymentMethodId:
          paymentMethod.id || "",

        accountName:
          paymentMethod.accountName
          ||
          "",

        accountNumber:
          paymentMethod.accountNumber
          ||
          "",

        transactionId:
          transactionId,

        status:
          "pending",

        createdAt:
          serverTimestamp()

      };


      /* =====================================================
         UPGRADE INFORMATION
      ===================================================== */

      if (isUpgrade) {

        requestData.isUpgrade =
          true;

        requestData.upgradeFromLevel =
          selectedRechargeLevel.currentLevel
          ||
          "No Level";

        requestData.upgradeFromAmount =
          Number(
            selectedRechargeLevel.currentApprovedTotal
            || 0
          );

        requestData.targetLevelId =
          level.id;

        requestData.targetLevel =
          level.level;

        requestData.targetLevelAmount =
          Number(level.amount);

        requestData.upgradeAmount =
          Number(amount);

      } else {

        requestData.isUpgrade =
          false;

      }


      /* =====================================================
         CREATE RECHARGE REQUEST

         USER CAN CREATE PENDING REQUEST.
         ADMIN APPROVES/REJECTS LATER.
      ===================================================== */

      await addDoc(
        collection(
          db,
          "rechargeRequests"
        ),
        requestData
      );


      /* =====================================================
         SUCCESS UI
      ===================================================== */

      hideElement(
        "rechargeStep3"
      );

      showElement(
        "rechargePending"
      );


      if ($("transactionId")) {

        $("transactionId").value =
          "";

      }


      /* -----------------------------------------------------
         Reset selection
      ----------------------------------------------------- */

      selectedDepositPaymentMethod =
        null;


    } catch (error) {

      console.error(
        "Submit recharge error:",
        error
      );

      alert(
        error?.message
        ||
        firebaseErrorMessage(error)
        ||
        "Unable to submit recharge request."
      );

    } finally {

      window._ccusRechargeSubmitting =
        false;

    }

  };
/* =========================================================
   RECHARGE HISTORY
========================================================= */

function loadRechargeHistory() {
  const container = $("rechargeHistory");
  if (!container || !currentUser) return;

  stopListener("rechargeHistory");

  unsubs.rechargeHistory = onSnapshot(
    query(collection(db, "rechargeRequests"), where("userId", "==", currentUser.uid)),
    snapshot => {
      const records = [];
      snapshot.forEach(docSnap => {
        records.push({ id: docSnap.id, ...docSnap.data() });
      });

      records.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderRechargeHistory(records);
    },
    error => {
      console.error("Recharge history error:", error);
      container.innerHTML = `<div class="empty-transactions"><h3>Unable to load recharge history</h3></div>`;
    }
  );
}

function getStatusIcon(status) {
  switch (String(status || "").toLowerCase()) {
    case "approved": return "🟢";
    case "rejected": return "🔴";
    default: return "🟡";
  }
}

function renderRechargeHistory(records) {
  const container = $("rechargeHistory");
  if (!container) return;

  if (!records.length) {
    container.innerHTML = `<div class="empty-transactions"><h3>No recharge records found</h3></div>`;
    return;
  }

  container.innerHTML = records.map(record => {
    const status = String(record.status || "pending").toLowerCase();
    const isUpgrade = record.isUpgrade === true || String(record.isUpgrade).toLowerCase() === "true";

    const displayAmount = isUpgrade
      ? Number(record.upgradeAmount ?? record.amount ?? record.depositAmount ?? 0)
      : Number(record.amount ?? record.depositAmount ?? 0);

    const displayLevel = isUpgrade
      ? (record.targetLevel || record.depositLevel || "Upgrade")
      : (record.depositLevel || record.levelName || "—");

    return `
      <div class="history-item ${escapeHtml(status)}">
        <div class="history-info">
          <strong>${isUpgrade ? "Upgrade to" : "Level"} : ${escapeHtml(String(displayLevel))}</strong>
          <span>Ref: ${escapeHtml(record.transactionId || "—")}${isUpgrade ? " · Upgrade" : ""}</span>
        </div>
        <div class="history-right">
          <strong>ETB ${money(displayAmount)}</strong>
          <span class="history-status ${escapeHtml(status)}">
            ${getStatusIcon(status)} ${escapeHtml(status)}
          </span>
        </div>
      </div>`;
  }).join("");
}

window.checkCCUSUpgradeLevels = function () {
  const levels = [...rechargeLevels]
    .filter(level => level.active !== false && Number(level.amount) > 0)
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  const result = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const current = Number(levels[i].amount);
    const next = Number(levels[i + 1].amount);
    result.push({
      from: levels[i].level,
      to: levels[i + 1].level,
      currentAmount: current,
      nextAmount: next,
      upgradeAmount: next - current
    });
  }

  console.table(result);
  return result;
};

/* =========================================================
   WITHDRAW LEVELS & HISTORY
========================================================= */

function loadWithdrawLevels() {
  const container = $("withdrawAmountList");
  if (!container) return;
  stopListener("withdrawLevels");

  unsubs.withdrawLevels = onSnapshot(collection(db, "withdrawLevels"), snapshot => {
    withdrawLevels = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      const amount = Number(data.amount || 0);
      if (data.active !== false && Number.isFinite(amount) && amount > 0) {
        withdrawLevels.push({ id: docSnap.id, amount, order: Number(data.order ?? 9999) });
      }
    });
    withdrawLevels.sort((a, b) => a.order - b.order || a.amount - b.amount);
    renderWithdrawLevels();
  }, error => {
    console.error("Withdraw levels error:", error);
    container.innerHTML = `<p style="text-align:center;color:#c62828;">Unable to load withdrawal options.</p>`;
  });
}

function renderWithdrawLevels() {
  const container = $("withdrawAmountList");
  if (!container) return;
  if (!withdrawLevels.length) {
    container.innerHTML = `<p style="text-align:center;color:#777;">No withdrawal options available.</p>`;
    return;
  }

  container.innerHTML = "";
  withdrawLevels.forEach(level => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "amount-btn";
    button.textContent = `ETB ${money(level.amount)}`;

    button.onclick = async () => {
      if (!await checkWithdrawalAllowed()) return;
      selectedWithdrawAmount = level.amount;
      if ($("withdrawAmount")) $("withdrawAmount").value = level.amount;
      container.querySelectorAll(".amount-btn").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
    };
    container.appendChild(button);
  });
}

window.resetWithdrawPage = function () {
  selectedWithdrawAmount = 0;
  if ($("withdrawAmount")) $("withdrawAmount").value = "";
  if ($("withdrawPassword")) $("withdrawPassword").value = "";
  hideElement("withdrawPending");
  document.querySelectorAll("#withdrawAmountList .amount-btn").forEach(btn => btn.classList.remove("active"));
};

window.submitWithdraw = async function () {
  if (!currentUser || window._ccusWithdrawSubmitting) return;
  if (!await checkWithdrawalAllowed()) return;

  const amount = Number($("withdrawAmount")?.value || selectedWithdrawAmount || 0);
  const password = $("withdrawPassword")?.value?.trim() || "";

  if (!Number.isFinite(amount) || amount <= 0) return showMessage("Enter a valid withdrawal amount.");
  if (!password) return showMessage("Enter your password.");

  window._ccusWithdrawSubmitting = true;

  try {
    if (!currentUser.email) throw new Error("Email authentication is required for withdrawal.");

    await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password));

    const userRef = doc(db, "users", currentUser.uid);
    const withdrawRef = doc(collection(db, "withdrawRequests"));

    await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error("User profile not found.");

      const userData = userSnap.data() || {};
      const balance = Number(userData.totalBalance || 0);

      if (amount > balance) throw new Error(`Insufficient balance. Your balance is ETB ${money(balance)}.`);

      transaction.update(userRef, { totalBalance: balance - amount, updatedAt: serverTimestamp() });
      transaction.set(withdrawRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        userName: userData.fullName || "",
        amount,
        paymentMethod: userData.withdrawPaymentMethod || "Standard",
        accountNumber: userData.withdrawAccountNumber || userData.accountNumber || "",
        status: "pending",
        balanceDeducted: true,
        refundProcessed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    showElement("withdrawPending");
    window.resetWithdrawPage();
    await updateUserUI();
  } catch (error) {
    console.error("Withdrawal submission error:", error);
    showMessage(firebaseErrorMessage(error));
  } finally {
    window._ccusWithdrawSubmitting = false;
  }
};

function loadWithdrawHistory() {
  const container = $("withdrawHistory");
  if (!container || !currentUser) return;
  stopListener("withdrawHistory");

  unsubs.withdrawHistory = onSnapshot(
    query(collection(db, "withdrawRequests"), where("userId", "==", currentUser.uid)),
    snapshot => {
      const records = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      records.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      renderWithdrawHistory(records);
    },
    error => {
      console.error("Withdraw history error:", error);
      container.innerHTML = `<div class="empty-transactions"><h3>Unable to load withdrawal history</h3></div>`;
    }
  );
}

function renderWithdrawHistory(records) {
  const container = $("withdrawHistory");
  if (!container) return;
  if (!records.length) {
    container.innerHTML = `<div class="empty-transactions"><h3>No withdrawal transactions found</h3></div>`;
    return;
  }

  container.innerHTML = records.map(record => {
    const status = String(record.status || "pending").toLowerCase();
    return `
      <div class="history-item ${escapeHtml(status)}">
        <div class="history-info">
          <strong>Withdrawal Request</strong>
          <span>Method: ${escapeHtml(record.paymentMethod || "Standard")}</span>
        </div>
        <div class="history-right">
          <strong>ETB ${money(record.amount)}</strong>
          <span class="history-status ${escapeHtml(status)}">
            ${getStatusIcon(status)} ${escapeHtml(status)}
          </span>
        </div>
      </div>`;
  }).join("");
}

/* =========================================================
   CCUS - VIP SYSTEM
   FINAL STABLE VERSION
   PURCHASE + EXPIRY + MISSED PAYOUT RECOVERY
   ATOMIC ONE-TIME PAYOUT

   IMPORTANT BUSINESS RULES
   ---------------------------------------------------------

   1. VIP PURCHASE
      totalBalance ONLY decreases.
      totalRecharge NEVER changes.

   2. VIP EXPIRY
      totalBalance += price + profit.
      totalRecharge NEVER changes.

   3. ONE-TIME PAYOUT
      payoutCompleted === true
      is the payout lock.

   4. status === "completed"
      DOES NOT mean payout was completed.

   5. OLD MISSED PAYOUTS
      Are recovered from vip_orders.

   6. ACTIVE VIP
      Is determined from vip_orders:
        - payoutCompleted !== true
        - status is not cancelled/rejected/refunded
        - expiresAt > now

   7. STALE USER VIP FIELDS
      Never block a new purchase if there is
      no real active unpaid VIP order.

   8. VIP EXPIRY
      User becomes:
        vipLevel = "VIP 0"
        vipLevelId = "0"
        vipExpiresAt = null
        lastVipOrderId = null

   9. totalRecharge
      IS NEVER MODIFIED BY THIS VIP SYSTEM.

   ========================================================= */

(() => {

"use strict";

/* =========================================================
   WINDOW
   ========================================================= */

const W =
  typeof window !== "undefined"
    ? window
    : globalThis;


/* =========================================================
   GLOBAL STATE
   ========================================================= */

if (!W._ccusVIPState) {

  W._ccusVIPState = {

    listeners: {},

    expiryPromise: null,

    expiryInterval: null,

    submitting: false,

    initialized: false,

    visibilityStarted: false

  };

}

const ccusVIPState =
  W._ccusVIPState;


/* =========================================================
   FIREBASE DEPENDENCIES
   ========================================================= */

function ccusVIPGetFirebase() {

  return {

    db:
      typeof db !== "undefined"
        ? db
        : W.db,

    collection:
      typeof collection !== "undefined"
        ? collection
        : W.collection,

    doc:
      typeof doc !== "undefined"
        ? doc
        : W.doc,

    query:
      typeof query !== "undefined"
        ? query
        : W.query,

    where:
      typeof where !== "undefined"
        ? where
        : W.where,

    getDocs:
      typeof getDocs !== "undefined"
        ? getDocs
        : W.getDocs,

    runTransaction:
      typeof runTransaction !== "undefined"
        ? runTransaction
        : W.runTransaction,

    onSnapshot:
      typeof onSnapshot !== "undefined"
        ? onSnapshot
        : W.onSnapshot,

    serverTimestamp:
      typeof serverTimestamp !== "undefined"
        ? serverTimestamp
        : W.serverTimestamp

  };

}


/* =========================================================
   REQUIRE FIREBASE
   ========================================================= */

function ccusVIPRequireFirebase() {

  const api =
    ccusVIPGetFirebase();

  const required = [
    "db",
    "collection",
    "doc",
    "query",
    "where",
    "getDocs",
    "runTransaction",
    "onSnapshot"
  ];

  const missing = [];

  for (const key of required) {

    if (key === "db") {

      if (!api.db) {
        missing.push(key);
      }

    } else {

      if (
        typeof api[key] !== "function"
      ) {

        missing.push(key);

      }

    }

  }

  if (missing.length) {

    throw new Error(
      "CCUS VIP Firebase dependencies missing: " +
      missing.join(", ")
    );

  }

  return api;

}


/* =========================================================
   CURRENT USER
   ========================================================= */

function ccusVIPGetCurrentUser() {

  try {

    if (
      typeof currentUser !== "undefined"
    ) {

      return currentUser || null;

    }

  } catch (error) {}

  return W.currentUser || null;

}


/* =========================================================
   CURRENT USER DATA
   ========================================================= */

function ccusVIPGetCurrentUserData() {

  try {

    if (
      typeof currentUserData !== "undefined"
    ) {

      return currentUserData || {};

    }

  } catch (error) {}

  return W.currentUserData || {};

}


/* =========================================================
   REFRESH USER UI
   ========================================================= */

async function ccusVIPRefreshUserUI() {

  try {

    if (
      typeof loadUserData === "function"
    ) {

      await loadUserData();

    }

  } catch (error) {

    console.warn(
      "CCUS VIP loadUserData refresh failed:",
      error
    );

  }

  try {

    if (
      typeof updateUserUI === "function"
    ) {

      await updateUserUI();

    }

  } catch (error) {

    console.warn(
      "CCUS VIP updateUserUI refresh failed:",
      error
    );

  }

}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function ccusVIPEscapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   MONEY
   ========================================================= */

function ccusVIPMoney(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {

    return "0.00";

  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );

}


/* =========================================================
   SERVER TIMESTAMP
   ========================================================= */

function ccusVIPServerTime() {

  const api =
    ccusVIPGetFirebase();

  if (
    typeof api.serverTimestamp === "function"
  ) {

    return api.serverTimestamp();

  }

  return new Date();

}


/* =========================================================
   DATE PARSER
   ========================================================= */

function ccusVIPDateValue(value) {

  if (!value) {
    return 0;
  }

  try {

    if (
      typeof value.toMillis === "function"
    ) {

      const result =
        value.toMillis();

      return Number.isFinite(result)
        ? result
        : 0;

    }

    if (
      typeof value.toDate === "function"
    ) {

      const result =
        value.toDate().getTime();

      return Number.isFinite(result)
        ? result
        : 0;

    }

    if (
      value instanceof Date
    ) {

      return value.getTime();

    }

    if (
      typeof value === "number"
    ) {

      return Number.isFinite(value)
        ? value
        : 0;

    }

    if (
      typeof value === "string"
    ) {

      const result =
        new Date(value).getTime();

      return Number.isFinite(result)
        ? result
        : 0;

    }

    if (
      typeof value === "object" &&
      typeof value.seconds === "number"
    ) {

      return (
        value.seconds * 1000 +
        Math.floor(
          Number(value.nanoseconds || 0) /
          1000000
        )
      );

    }

  } catch (error) {

    console.warn(
      "CCUS VIP date conversion failed:",
      error
    );

  }

  return 0;

}


/* =========================================================
   NORMALIZE VIP LEVEL
   ========================================================= */

function ccusVIPNormalizeLevel(
  id,
  data = {}
) {

  const price =
    Number(
      data.price ??
      data.amount ??
      data.requiredDeposit ??
      0
    );

  const profit =
    Number(
      data.profit ??
      data.reward ??
      data.returnProfit ??
      0
    );

  const validDays =
    Number(
      data.validDays ??
      data.durationDays ??
      data.days ??
      0
    );

  const order =
    Number(
      data.order ??
      data.displayOrder ??
      data.level ??
      9999
    );

  const name =
    data.displayName ||
    data.name ||
    (
      data.level !== undefined
        ? `VIP ${data.level}`
        : "VIP"
    );

  return {

    id:
      String(
        id ||
        data.id ||
        ""
      ),

    name:
      String(name),

    displayName:
      String(name),

    price,

    profit,

    validDays,

    order,

    active:
      data.active !== false

  };

}


/* =========================================================
   VIP LEVEL CACHE
   ========================================================= */

let ccusVIPLevelsList =
  Array.isArray(W.vipLevelsList)
    ? W.vipLevelsList
    : [];


/* =========================================================
   STOP LISTENER
   ========================================================= */

function ccusVIPStopListener(name) {

  try {

    const unsubscribe =
      ccusVIPState.listeners[name];

    if (
      typeof unsubscribe === "function"
    ) {

      unsubscribe();

    }

  } catch (error) {

    console.warn(
      "CCUS VIP listener stop error:",
      error
    );

  }

  delete ccusVIPState.listeners[name];

  if (W.unsubs) {

    try {

      if (
        typeof W.unsubs[name] === "function"
      ) {

        W.unsubs[name]();

      }

    } catch (error) {}

    delete W.unsubs[name];

  }

}


/* =========================================================
   LOAD VIP LEVELS
   ========================================================= */

function ccusVIPLoadLevels() {

  const api =
    ccusVIPRequireFirebase();

  const container =
    document.querySelector(
      "#vipContainer, .vip-container"
    );

  if (!container) {

    console.warn(
      "CCUS VIP: VIP container not found."
    );

    return;

  }

  ccusVIPStopListener(
    "vipLevels"
  );

  container.innerHTML = `
    <div
      style="
        text-align:center;
        padding:25px;
        color:#777;
      "
    >
      Loading VIP Levels...
    </div>
  `;

  try {

    const unsubscribe =
      api.onSnapshot(

        api.collection(
          api.db,
          "vip_levels"
        ),

        snapshot => {

          const levels = [];

          snapshot.forEach(
            docSnap => {

              const level =
                ccusVIPNormalizeLevel(
                  docSnap.id,
                  docSnap.data() || {}
                );

              if (
                level.active &&
                level.price > 0 &&
                level.validDays > 0 &&
                level.profit >= 0
              ) {

                levels.push(level);

              }

            }
          );

          levels.sort(
            (a, b) => {

              if (
                a.order !== b.order
              ) {

                return (
                  a.order -
                  b.order
                );

              }

              return (
                a.price -
                b.price
              );

            }
          );

          ccusVIPLevelsList =
            levels;

          W.vipLevelsList =
            levels;

          ccusVIPRenderLevels(
            levels
          );

        },

        error => {

          console.error(
            "❌ CCUS VIP levels error:",
            error
          );

          container.innerHTML = `
            <div
              style="
                text-align:center;
                padding:25px;
              "
            >
              <h3>
                Unable to Load VIP Levels
              </h3>

              <p style="color:#777;">
                Please try again later.
              </p>
            </div>
          `;

        }

      );

    ccusVIPState.listeners.vipLevels =
      unsubscribe;

    W.unsubs =
      W.unsubs || {};

    W.unsubs.vipLevels =
      unsubscribe;

  } catch (error) {

    console.error(
      "❌ VIP listener initialization error:",
      error
    );

  }

}


/* =========================================================
   CALCULATE ORDER EXPIRY
   ========================================================= */

function ccusVIPCalculateExpiry(orderData) {

  if (!orderData) {
    return null;
  }

  const directExpiry =
    ccusVIPDateValue(
      orderData.expiresAt
    );

  if (
    directExpiry > 0
  ) {

    return new Date(
      directExpiry
    );

  }

  const started =
    ccusVIPDateValue(
      orderData.startedAt
    );

  const validDays =
    Number(
      orderData.validDays ??
      orderData.durationDays ??
      orderData.days ??
      0
    );

  if (
    started <= 0 ||
    !Number.isFinite(validDays) ||
    validDays <= 0
  ) {

    return null;

  }

  return new Date(
    started +
    validDays *
    24 *
    60 *
    60 *
    1000
  );

}


/* =========================================================
   NON-PAYABLE STATUSES
   ========================================================= */

function ccusVIPIsNonPayableStatus(status) {

  const value =
    String(status || "")
      .trim()
      .toLowerCase();

  return [
    "cancelled",
    "canceled",
    "rejected",
    "refunded"
  ].includes(value);

}


/* =========================================================
   ACTIVE UNPAID ORDER
   IMPORTANT:
   DO NOT depend on status === "active"
   ========================================================= */

function ccusVIPIsActiveUnpaidOrder(
  orderData,
  now = Date.now()
) {

  if (!orderData) {
    return false;
  }

  if (
    orderData.payoutCompleted === true
  ) {

    return false;

  }

  if (
    ccusVIPIsNonPayableStatus(
      orderData.status
    )
  ) {

    return false;

  }

  const expiry =
    ccusVIPCalculateExpiry(
      orderData
    );

  if (!expiry) {
    return false;
  }

  return (
    expiry.getTime() > now
  );

}


/* =========================================================
   FIND ALL USER VIP ORDERS
   NO STATUS FILTER
   ========================================================= */

async function ccusVIPFindUserOrders(
  userId
) {

  const api =
    ccusVIPRequireFirebase();

  const q =
    api.query(
      api.collection(
        api.db,
        "vip_orders"
      ),
      api.where(
        "userId",
        "==",
        String(userId)
      )
    );

  const snapshot =
    await api.getDocs(q);

  return snapshot.docs.map(
    snap => ({

      id:
        snap.id,

      ref:
        snap.ref,

      data:
        snap.data() || {}

    })
  );

}


/* =========================================================
   FIND REAL CURRENT ACTIVE ORDER
   ========================================================= */

async function ccusVIPFindCurrentOrder(
  userId
) {

  const orders =
    await ccusVIPFindUserOrders(
      userId
    );

  const now =
    Date.now();

  const active =
    orders.filter(
      item =>
        ccusVIPIsActiveUnpaidOrder(
          item.data,
          now
        )
    );

  if (!active.length) {
    return null;
  }

  active.sort(
    (a, b) => {

      const aTime =
        ccusVIPDateValue(
          a.data.startedAt ||
          a.data.createdAt
        );

      const bTime =
        ccusVIPDateValue(
          b.data.startedAt ||
          b.data.createdAt
        );

      return (
        bTime -
        aTime
      );

    }
  );

  return active[0];

}


/* =========================================================
   REPAIR STALE USER VIP STATE

   IMPORTANT:
   This does NOT change balance.

   It only clears old:
     vipLevel
     vipLevelId
     vipExpiresAt
     lastVipOrderId

   when there is no real active unpaid VIP.
   ========================================================= */

async function ccusVIPRepairStaleUserState(
  userId
) {

  const api =
    ccusVIPRequireFirebase();

  const orders =
    await ccusVIPFindUserOrders(
      userId
    );

  const activeOrder =
    orders.find(
      item =>
        ccusVIPIsActiveUnpaidOrder(
          item.data,
          Date.now()
        )
    );

  if (activeOrder) {

    return {

      repaired:
        false,

      reason:
        "real-active-vip-exists",

      orderId:
        activeOrder.id

    };

  }

  const userRef =
    api.doc(
      api.db,
      "users",
      String(userId)
    );

  const result =
    await api.runTransaction(
      api.db,
      async transaction => {

        const userSnap =
          await transaction.get(
            userRef
          );

        if (!userSnap.exists()) {

          return {

            repaired:
              false,

            reason:
              "user-not-found"

          };

        }

        const data =
          userSnap.data() || {};

        const vipLevel =
          String(
            data.vipLevel ||
            "VIP 0"
          );

        const vipLevelId =
          String(
            data.vipLevelId ||
            "0"
          );

        const lastOrder =
          String(
            data.lastVipOrderId ||
            ""
          );

        const expiry =
          ccusVIPDateValue(
            data.vipExpiresAt
          );

        const hasStaleState =
          (
            vipLevel !== "VIP 0" ||
            vipLevelId !== "0" ||
            lastOrder !== "" ||
            expiry > 0
          );

        if (!hasStaleState) {

          return {

            repaired:
              false,

            reason:
              "already-clean"

          };

        }

        transaction.update(
          userRef,
          {

            vipLevel:
              "VIP 0",

            vipLevelId:
              "0",

            vipExpiresAt:
              null,

            lastVipOrderId:
              null,

            vipUpdatedAt:
              ccusVIPServerTime(),

            updatedAt:
              ccusVIPServerTime()

          }
        );

        return {

          repaired:
            true,

          reason:
            "stale-vip-state-cleared"

        };

      }
    );

  return result;

}


/* =========================================================
   COMPLETE EXPIRED VIP
   ========================================================= */

async function ccusVIPCompleteExpired(
  orderId
) {

  const api =
    ccusVIPRequireFirebase();

  if (!orderId) {

    return {

      success:
        false,

      reason:
        "missing-order-id"

    };

  }

  const orderRef =
    api.doc(
      api.db,
      "vip_orders",
      String(orderId)
    );

  const result =
    await api.runTransaction(
      api.db,
      async transaction => {

        /* -----------------------------------------
           READ ORDER FIRST
           ----------------------------------------- */

        const orderSnap =
          await transaction.get(
            orderRef
          );

        if (!orderSnap.exists()) {

          return {

            success:
              false,

            reason:
              "order-not-found"

          };

        }

        const orderData =
          orderSnap.data() || {};


        /* -----------------------------------------
           ONE-TIME PAYOUT LOCK
           ----------------------------------------- */

        if (
          orderData.payoutCompleted === true
        ) {

          return {

            success:
              false,

            alreadyCompleted:
              true,

            reason:
              "already-paid",

            orderId:
              String(orderId)

          };

        }


        /* -----------------------------------------
           USER ID
           ----------------------------------------- */

        const userId =
          String(
            orderData.userId || ""
          );

        if (!userId) {

          throw new Error(
            "VIP order has no userId."
          );

        }


        /* -----------------------------------------
           READ USER
           ----------------------------------------- */

        const userRef =
          api.doc(
            api.db,
            "users",
            userId
          );

        const userSnap =
          await transaction.get(
            userRef
          );

        if (!userSnap.exists()) {

          return {

            success:
              false,

            reason:
              "user-not-found"

          };

        }

        const userData =
          userSnap.data() || {};


        /* -----------------------------------------
           STATUS
           ----------------------------------------- */

        const status =
          String(
            orderData.status ||
            "active"
          )
            .trim()
            .toLowerCase();

        if (
          ccusVIPIsNonPayableStatus(
            status
          )
        ) {

          return {

            success:
              false,

            reason:
              "non-payable-order-status",

            status

          };

        }


        /* -----------------------------------------
           ORDER EXPIRY
           ----------------------------------------- */

        let expiresAt =
          ccusVIPCalculateExpiry(
            orderData
          );


        /* -----------------------------------------
           HISTORICAL VIP PACKAGE FALLBACK
           ----------------------------------------- */

        let fallbackVIPData =
          null;

        const vipId =
          String(
            orderData.vipId ||
            ""
          );

        let needPackage =
          !expiresAt;


        let rawPrice =
          orderData.price ??
          orderData.amount ??
          null;

        let rawProfit =
          orderData.profit ??
          orderData.reward ??
          orderData.returnProfit ??
          null;


        if (
          rawPrice === null ||
          rawPrice === undefined ||
          Number(rawPrice) <= 0
        ) {

          needPackage = true;

        }

        if (
          rawProfit === null ||
          rawProfit === undefined
        ) {

          needPackage = true;

        }


        /* -----------------------------------------
           READ PACKAGE ONLY WHEN NECESSARY
           ----------------------------------------- */

        if (
          needPackage &&
          vipId
        ) {

          const vipRef =
            api.doc(
              api.db,
              "vip_levels",
              vipId
            );

          const vipSnap =
            await transaction.get(
              vipRef
            );

          if (
            vipSnap.exists()
          ) {

            fallbackVIPData =
              vipSnap.data() || {};

          }

        }


        /* -----------------------------------------
           RECOVER EXPIRY
           ----------------------------------------- */

        if (!expiresAt) {

          const fallbackDays =
            Number(
              orderData.validDays ??
              fallbackVIPData?.validDays ??
              fallbackVIPData?.durationDays ??
              fallbackVIPData?.days ??
              0
            );

          const started =
            ccusVIPDateValue(
              orderData.startedAt
            );

          if (
            started > 0 &&
            Number.isFinite(
              fallbackDays
            ) &&
            fallbackDays > 0
          ) {

            expiresAt =
              new Date(
                started +
                fallbackDays *
                24 *
                60 *
                60 *
                1000
              );

          }

        }


        if (!expiresAt) {

          throw new Error(
            "VIP expiry date is missing and could not be recovered."
          );

        }


        /* -----------------------------------------
           NOT EXPIRED
           ----------------------------------------- */

        if (
          expiresAt.getTime() >
          Date.now()
        ) {

          return {

            success:
              false,

            reason:
              "not-expired",

            orderId:
              String(orderId),

            expiresAt

          };

        }


        /* -----------------------------------------
           PRICE
           ----------------------------------------- */

        let price =
          Number(
            rawPrice ??
            0
          );

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {

          price = 0;

        }


        /* -----------------------------------------
           PROFIT
           ----------------------------------------- */

        let profit =
          Number(
            rawProfit ??
            0
          );

        if (
          !Number.isFinite(profit) ||
          profit < 0
        ) {

          profit = 0;

        }


        /* -----------------------------------------
           HISTORICAL FALLBACK
           ----------------------------------------- */

        if (
          price <= 0 &&
          fallbackVIPData
        ) {

          const fallbackPrice =
            Number(
              fallbackVIPData.price ??
              fallbackVIPData.amount ??
              fallbackVIPData.requiredDeposit ??
              0
            );

          if (
            Number.isFinite(
              fallbackPrice
            ) &&
            fallbackPrice > 0
          ) {

            price =
              fallbackPrice;

          }

        }


        if (
          (
            rawProfit === null ||
            rawProfit === undefined
          ) &&
          fallbackVIPData
        ) {

          const fallbackProfit =
            Number(
              fallbackVIPData.profit ??
              fallbackVIPData.reward ??
              fallbackVIPData.returnProfit ??
              0
            );

          if (
            Number.isFinite(
              fallbackProfit
            ) &&
            fallbackProfit >= 0
          ) {

            profit =
              fallbackProfit;

          }

        }


        /* -----------------------------------------
           VALIDATION
           ----------------------------------------- */

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {

          throw new Error(
            "Invalid VIP price."
          );

        }

        if (
          !Number.isFinite(profit) ||
          profit < 0
        ) {

          throw new Error(
            "Invalid VIP profit."
          );

        }

        const payout =
          price +
          profit;

        if (
          !Number.isFinite(payout) ||
          payout <= 0
        ) {

          throw new Error(
            "Invalid VIP payout amount."
          );

        }


        /* -----------------------------------------
           CURRENT BALANCE
           ----------------------------------------- */

        const currentBalance =
          Number(
            userData.totalBalance ??
            0
          );

        if (
          !Number.isFinite(
            currentBalance
          )
        ) {

          throw new Error(
            "Invalid user totalBalance."
          );

        }

        const newBalance =
          currentBalance +
          payout;


        /* -----------------------------------------
           IS CURRENT ORDER?
           ----------------------------------------- */

        const lastVipOrderId =
          String(
            userData.lastVipOrderId ||
            ""
          );

        const isCurrentOrder =
          lastVipOrderId ===
          String(orderId);


        /* -----------------------------------------
           USER UPDATE
           IMPORTANT:
           totalRecharge NOT included.
           ----------------------------------------- */

        const userUpdate = {

          totalBalance:
            newBalance,

          lastVipPayoutOrderId:
            String(orderId),

          lastVipPayoutAmount:
            payout,

          lastVipPayoutAt:
            ccusVIPServerTime(),

          vipUpdatedAt:
            ccusVIPServerTime(),

          updatedAt:
            ccusVIPServerTime()

        };


        /* -----------------------------------------
           RESET CURRENT VIP
           ----------------------------------------- */

        if (
          isCurrentOrder
        ) {

          userUpdate.vipLevel =
            "VIP 0";

          userUpdate.vipLevelId =
            "0";

          userUpdate.vipExpiresAt =
            null;

          userUpdate.lastVipOrderId =
            null;

        }


        /* -----------------------------------------
           WRITE USER
           ----------------------------------------- */

        transaction.update(
          userRef,
          userUpdate
        );


        /* -----------------------------------------
           WRITE ORDER
           ----------------------------------------- */

        transaction.update(
          orderRef,
          {

            status:
              "completed",

            payoutCompleted:
              true,

            payoutAmount:
              payout,

            payoutCompletedAt:
              ccusVIPServerTime(),

            expiresAt:
              expiresAt,

            updatedAt:
              ccusVIPServerTime()

          }
        );


        /* -----------------------------------------
           RETURN
           ----------------------------------------- */

        return {

          success:
            true,

          orderId:
            String(orderId),

          price,

          profit,

          payout,

          oldBalance:
            currentBalance,

          newBalance,

          expiresAt

        };

      }
    );

  return result;

}


/* =========================================================
   PROCESS ALL EXPIRED VIPs
   ========================================================= */

async function ccusVIPProcessExpired() {

  const user =
    ccusVIPGetCurrentUser();

  if (!user) {

    return {

      success:
        false,

      reason:
        "not-logged-in"

    };

  }

  if (
    ccusVIPState.expiryPromise
  ) {

    return ccusVIPState.expiryPromise;

  }

  ccusVIPState.expiryPromise =
    (async () => {

      try {

        const userId =
          String(user.uid);

        let orders =
          await ccusVIPFindUserOrders(
            userId
          );

        if (!orders.length) {

          await ccusVIPRepairStaleUserState(
            userId
          );

          return {

            success:
              false,

            reason:
              "no-orders",

            processed:
              0,

            paid:
              0

          };

        }

        const now =
          Date.now();


        /* -----------------------------------------
           FIND EXPIRED UNPAID ORDERS
           ----------------------------------------- */

        const expiredOrders =
          orders.filter(
            item => {

              const data =
                item.data || {};

              if (
                data.payoutCompleted === true
              ) {

                return false;

              }

              if (
                ccusVIPIsNonPayableStatus(
                  data.status
                )
              ) {

                return false;

              }

              const expiry =
                ccusVIPCalculateExpiry(
                  data
                );

              if (!expiry) {

                return false;

              }

              return (
                expiry.getTime() <=
                now
              );

            }
          );


        /* -----------------------------------------
           OLDEST FIRST
           ----------------------------------------- */

        expiredOrders.sort(
          (a, b) => {

            const aTime =
              ccusVIPDateValue(
                a.data.startedAt ||
                a.data.createdAt
              );

            const bTime =
              ccusVIPDateValue(
                b.data.startedAt ||
                b.data.createdAt
              );

            return (
              aTime -
              bTime
            );

          }
        );


        const results = [];


        /* -----------------------------------------
           PAY EVERY MISSED VIP
           ----------------------------------------- */

        for (
          const order of expiredOrders
        ) {

          try {

            const result =
              await ccusVIPCompleteExpired(
                order.id
              );

            results.push(
              result
            );

            if (
              result?.success
            ) {

              console.log(
                "✅ CCUS VIP payout recovered:",
                {
                  orderId:
                    result.orderId,

                  price:
                    result.price,

                  profit:
                    result.profit,

                  payout:
                    result.payout,

                  oldBalance:
                    result.oldBalance,

                  newBalance:
                    result.newBalance
                }
              );

            }

          } catch (error) {

            console.error(
              "❌ VIP payout failed:",
              order.id,
              error
            );

            results.push({

              success:
                false,

              orderId:
                order.id,

              reason:
                "error",

              error

            });

          }

        }


        /* -----------------------------------------
           RE-READ ORDERS AFTER PAYOUT
           ----------------------------------------- */

        orders =
          await ccusVIPFindUserOrders(
            userId
          );


        /* -----------------------------------------
           CHECK REAL ACTIVE VIP
           ----------------------------------------- */

        const activeOrder =
          orders.find(
            item =>
              ccusVIPIsActiveUnpaidOrder(
                item.data,
                Date.now()
              )
          );


        /* -----------------------------------------
           REPAIR STALE USER STATE
           ----------------------------------------- */

        let repaired =
          false;

        if (!activeOrder) {

          const repair =
            await ccusVIPRepairStaleUserState(
              userId
            );

          repaired =
            repair?.repaired === true;

        }


        const successful =
          results.filter(
            item =>
              item?.success === true
          );


        const alreadyPaid =
          results.filter(
            item =>
              item?.alreadyCompleted === true
          );


        if (
          successful.length ||
          repaired
        ) {

          await ccusVIPRefreshUserUI();

          try {

            ccusVIPRenderLevels(
              ccusVIPLevelsList
            );

          } catch (error) {

            console.warn(
              "VIP cards refresh failed:",
              error
            );

          }

        }


        return {

          success:
            successful.length > 0 ||
            repaired,

          processed:
            results.length,

          paid:
            successful.length,

          alreadyPaid:
            alreadyPaid.length,

          repaired,

          active:
            !!activeOrder,

          activeOrderId:
            activeOrder?.id || null,

          results

        };

      } catch (error) {

        console.error(
          "❌ CCUS VIP expiry recovery error:",
          error
        );

        return {

          success:
            false,

          reason:
            "error",

          error

        };

      } finally {

        ccusVIPState.expiryPromise =
          null;

      }

    })();

  return ccusVIPState.expiryPromise;

}


/* =========================================================
   RENDER VIP LEVELS
   IMPORTANT:
   DO NOT USE STALE user.vipLevel TO DISABLE BUTTON.
   BUY FUNCTION WILL CHECK REAL ORDER.
   ========================================================= */

function ccusVIPRenderLevels(
  levels
) {

  const container =
    document.querySelector(
      "#vipContainer, .vip-container"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(levels) ||
    !levels.length
  ) {

    container.innerHTML = `
      <div
        style="
          text-align:center;
          padding:25px;
          color:#666;
        "
      >
        <h3>
          No VIP Packages Available
        </h3>
      </div>
    `;

    ccusVIPRenderCompanySalary();

    return;

  }


  container.innerHTML =
    levels
      .map(
        (vip, index) => {

          return `
            <div
              class="simple-card vip-card"
              data-vip-id="${ccusVIPEscapeHtml(
                vip.id
              )}"
              style="
                border:1px solid #f0a500;
                margin-bottom:15px;
                padding:15px;
                border-radius:12px;
                background:#fff;
                box-shadow:
                  0 2px 8px
                  rgba(0,0,0,.05);
              "
            >

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  align-items:center;
                  gap:10px;
                  margin-bottom:8px;
                "
              >

                <div>

                  <h3
                    style="
                      margin:0;
                      color:#f0a500;
                      font-size:17px;
                    "
                  >
                    👑
                    ${ccusVIPEscapeHtml(
                      vip.name
                    )}
                  </h3>

                  <div
                    style="
                      margin-top:3px;
                      color:#777;
                      font-size:12px;
                    "
                  >
                    VIP Level ${index + 1}
                  </div>

                </div>

                <span
                  style="
                    font-weight:bold;
                    background:#fff3cd;
                    color:#856404;
                    padding:5px 10px;
                    border-radius:15px;
                    white-space:nowrap;
                  "
                >
                  ETB
                  ${ccusVIPMoney(
                    vip.price
                  )}
                </span>

              </div>


              <hr
                style="
                  border:0;
                  border-top:
                    1px solid #eee;
                  margin:10px 0;
                "
              />


              <div
                style="
                  font-size:.95rem;
                  line-height:1.7;
                "
              >

                <p>
                  <strong>
                    Package Price:
                  </strong>
                  ETB
                  ${ccusVIPMoney(
                    vip.price
                  )}
                </p>

                <p>
                  <strong>
                    Profit:
                  </strong>
                  ETB
                  ${ccusVIPMoney(
                    vip.profit
                  )}
                </p>

                <p>
                  <strong>
                    Validity:
                  </strong>
                  ${vip.validDays}
                  Days
                </p>

                <p>
                  <strong>
                    Total Return:
                  </strong>
                  ETB
                  ${ccusVIPMoney(
                    vip.price +
                    vip.profit
                  )}
                </p>

              </div>


              <button
                type="button"
                class="primary-btn buy-vip-btn"
                data-vip-id="${ccusVIPEscapeHtml(
                  vip.id
                )}"
                style="
                  margin-top:12px;
                  width:100%;
                  padding:11px;
                  font-weight:bold;
                  border-radius:8px;
                "
              >
                Purchase
              </button>

            </div>
          `;

        }
      )
      .join("");


  container
    .querySelectorAll(
      ".buy-vip-btn"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            const vip =
              levels.find(
                item =>
                  String(item.id) ===
                  String(
                    button.dataset.vipId
                  )
              );

            if (!vip) {

              alert(
                "VIP package not found."
              );

              return;

            }

            await ccusVIPBuy(
              vip.id
            );

          };

      }
    );


  ccusVIPRenderCompanySalary();

}


/* =========================================================
   BUY VIP
   ========================================================= */

async function ccusVIPBuy(
  vipId
) {

  const api =
    ccusVIPRequireFirebase();

  const user =
    ccusVIPGetCurrentUser();

  if (!user) {

    alert(
      "Please login first."
    );

    return {

      success:
        false,

      reason:
        "not-logged-in"

    };

  }


  if (
    ccusVIPState.submitting
  ) {

    return {

      success:
        false,

      reason:
        "already-submitting"

    };

  }


  ccusVIPState.submitting =
    true;


  try {

    /* -----------------------------------------
       STEP 1
       RECOVER EXPIRED VIP FIRST
       ----------------------------------------- */

    await ccusVIPProcessExpired();


    /* -----------------------------------------
       STEP 2
       RELOAD USER
       ----------------------------------------- */

    try {

      if (
        typeof loadUserData ===
        "function"
      ) {

        await loadUserData();

      }

    } catch (error) {

      console.warn(
        "VIP user refresh failed:",
        error
      );

    }


    /* -----------------------------------------
       STEP 3
       FIND REAL ACTIVE ORDER
       OUTSIDE TRANSACTION
       ----------------------------------------- */

    let orders =
      await ccusVIPFindUserOrders(
        String(user.uid)
      );


    let activeOrder =
      orders.find(
        item =>
          ccusVIPIsActiveUnpaidOrder(
            item.data,
            Date.now()
          )
      );


    if (activeOrder) {

      const expiry =
        ccusVIPCalculateExpiry(
          activeOrder.data
        );

      const expiryText =
        expiry
          ? expiry.toLocaleString()
          : "the scheduled expiry time";

      throw new Error(
        "VIP is already active. It expires on " +
        expiryText +
        "."
      );

    }


    /* -----------------------------------------
       STEP 4
       CHECK AGAIN FOR EXPIRED UNPAID
       ----------------------------------------- */

    const expiredUnpaid =
      orders.filter(
        item => {

          const data =
            item.data || {};

          if (
            data.payoutCompleted === true
          ) {

            return false;

          }

          if (
            ccusVIPIsNonPayableStatus(
              data.status
            )
          ) {

            return false;

          }

          const expiry =
            ccusVIPCalculateExpiry(
              data
            );

          return (
            expiry &&
            expiry.getTime() <=
            Date.now()
          );

        }
      );


    if (
      expiredUnpaid.length
    ) {

      /* Try one more recovery */
      await ccusVIPProcessExpired();

      orders =
        await ccusVIPFindUserOrders(
          String(user.uid)
        );


      activeOrder =
        orders.find(
          item =>
            ccusVIPIsActiveUnpaidOrder(
              item.data,
              Date.now()
            )
        );


      if (activeOrder) {

        const expiry =
          ccusVIPCalculateExpiry(
            activeOrder.data
          );

        throw new Error(
          "VIP is already active. It expires on " +
          (
            expiry
              ? expiry.toLocaleString()
              : "the scheduled expiry time"
          ) +
          "."
        );

      }


      const stillUnpaid =
        orders.some(
          item => {

            const data =
              item.data || {};

            if (
              data.payoutCompleted === true
            ) {

              return false;

            }

            if (
              ccusVIPIsNonPayableStatus(
                data.status
              )
            ) {

              return false;

            }

            const expiry =
              ccusVIPCalculateExpiry(
                data
              );

            return (
              expiry &&
              expiry.getTime() <=
              Date.now()
            );

          }
        );


      if (stillUnpaid) {

        throw new Error(
          "Your expired VIP payout is still being processed. Please try again."
        );

      }

    }


    /* -----------------------------------------
       STEP 5
       CLEAN STALE USER VIP FIELDS
       ----------------------------------------- */

    await ccusVIPRepairStaleUserState(
      String(user.uid)
    );


    /* -----------------------------------------
       REFERENCES
       ----------------------------------------- */

    const userRef =
      api.doc(
        api.db,
        "users",
        String(user.uid)
      );

    const vipRef =
      api.doc(
        api.db,
        "vip_levels",
        String(vipId)
      );

    const orderRef =
      api.doc(
        api.collection(
          api.db,
          "vip_orders"
        )
      );


    /* -----------------------------------------
       STEP 6
       TRANSACTION

       IMPORTANT:
       NO vip_orders QUERY INSIDE TRANSACTION.
       ----------------------------------------- */

    const result =
      await api.runTransaction(
        api.db,
        async transaction => {

          /* READ USER */

          const userSnap =
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


          /* READ VIP */

          const vipSnap =
            await transaction.get(
              vipRef
            );

          if (
            !vipSnap.exists()
          ) {

            throw new Error(
              "VIP package no longer exists."
            );

          }


          const userData =
            userSnap.data() || {};

          const vipData =
            vipSnap.data() || {};


          /* -------------------------------------
             PACKAGE ACTIVE
             ------------------------------------- */

          if (
            vipData.active === false
          ) {

            throw new Error(
              "This VIP package is currently unavailable."
            );

          }


          /* -------------------------------------
             AUTHORITATIVE VALUES
             ------------------------------------- */

          const price =
            Number(
              vipData.price ??
              vipData.amount ??
              vipData.requiredDeposit ??
              0
            );

          const profit =
            Number(
              vipData.profit ??
              vipData.reward ??
              vipData.returnProfit ??
              0
            );

          const validDays =
            Number(
              vipData.validDays ??
              vipData.durationDays ??
              vipData.days ??
              0
            );

          const vipName =
            String(
              vipData.displayName ||
              vipData.name ||
              (
                vipData.level !== undefined
                  ? `VIP ${vipData.level}`
                  : "VIP"
              )
            );


          /* -------------------------------------
             VALIDATE
             ------------------------------------- */

          if (
            !Number.isFinite(price) ||
            price <= 0
          ) {

            throw new Error(
              "Invalid VIP price."
            );

          }

          if (
            !Number.isFinite(profit) ||
            profit < 0
          ) {

            throw new Error(
              "Invalid VIP profit."
            );

          }

          if (
            !Number.isFinite(validDays) ||
            validDays <= 0
          ) {

            throw new Error(
              "Invalid VIP validity period."
            );

          }


          /* -------------------------------------
             USER BALANCE
             ------------------------------------- */

          const balance =
            Number(
              userData.totalBalance ??
              0
            );

          if (
            !Number.isFinite(balance)
          ) {

            throw new Error(
              "Invalid account balance."
            );

          }


          /* -------------------------------------
             BALANCE CHECK
             ------------------------------------- */

          if (
            balance < price
          ) {

            throw new Error(
              `Insufficient balance! Costs ETB ${ccusVIPMoney(
                price
              )}, but your balance is ETB ${ccusVIPMoney(
                balance
              )}.`
            );

          }


          /* -------------------------------------
             PURCHASE
             ------------------------------------- */

          const newBalance =
            balance -
            price;

          const startedAt =
            new Date();

          const expiresAt =
            new Date(
              startedAt.getTime() +
              validDays *
              24 *
              60 *
              60 *
              1000
            );


          /* -------------------------------------
             USER UPDATE

             totalRecharge is intentionally absent.
             ------------------------------------- */

          transaction.update(
            userRef,
            {

              totalBalance:
                newBalance,

              vipLevel:
                vipName,

              vipLevelId:
                String(vipId),

              vipExpiresAt:
                expiresAt,

              lastVipOrderId:
                orderRef.id,

              vipUpdatedAt:
                ccusVIPServerTime(),

              updatedAt:
                ccusVIPServerTime()

            }
          );


          /* -------------------------------------
             CREATE ORDER
             ------------------------------------- */

          transaction.set(
            orderRef,
            {

              userId:
                String(user.uid),

              userName:
                userData.fullName ||
                user.displayName ||
                "User",

              userEmail:
                user.email ||
                "",

              vipId:
                String(vipId),

              vipName:
                vipName,

              price:
                price,

              profit:
                profit,

              payoutAmount:
                price +
                profit,

              validDays:
                validDays,

              startedAt:
                startedAt,

              expiresAt:
                expiresAt,

              status:
                "active",

              payoutCompleted:
                false,

              createdAt:
                ccusVIPServerTime(),

              updatedAt:
                ccusVIPServerTime()

            }
          );


          return {

            success:
              true,

            orderId:
              orderRef.id,

            vipName:
              vipName,

            price:
              price,

            profit:
              profit,

            validDays:
              validDays,

            startedAt:
              startedAt,

            expiresAt:
              expiresAt,

            oldBalance:
              balance,

            newBalance:
              newBalance

          };

        }
      );


    /* -----------------------------------------
       SUCCESS
       ----------------------------------------- */

    if (
      result?.success
    ) {

      alert(
        `${result.vipName} purchased successfully.\n\n` +
        `Price: ETB ${ccusVIPMoney(
          result.price
        )}\n` +
        `Profit: ETB ${ccusVIPMoney(
          result.profit
        )}\n` +
        `Validity: ${result.validDays} days.\n\n` +
        `VIP will expire on:\n` +
        `${result.expiresAt.toLocaleString()}`
      );

    }


    await ccusVIPRefreshUserUI();


    try {

      ccusVIPRenderLevels(
        ccusVIPLevelsList
      );

    } catch (error) {

      console.warn(
        "VIP render refresh failed:",
        error
      );

    }


    return result;


  } catch (error) {

    console.error(
      "❌ CCUS VIP purchase error:",
      error
    );


    if (
      error?.code ===
      "permission-denied"
    ) {

      alert(
        "VIP purchase was blocked by Firestore Security Rules."
      );

    } else {

      alert(
        error?.message ||
        "VIP purchase failed."
      );

    }


    return {

      success:
        false,

      reason:
        "error",

      error

    };


  } finally {

    ccusVIPState.submitting =
      false;

  }

}


/* =========================================================
   COMPANY SALARY STRUCTURE
   ========================================================= */

const ccusVIPCompanySalaryLevels = [

  {
    level: 1,
    position:
      "Team Leader",
    requirement:
      "10 A-level employees + 15 ABC level",
    salary:
      2000
  },

  {
    level: 2,
    position:
      "Reserve Manager",
    requirement:
      "15 A-level + 50 ABC employees",
    salary:
      6000
  },

  {
    level: 3,
    position:
      "Senior Trainee Manager",
    requirement:
      "150+ ABC employees",
    salary:
      15000
  },

  {
    level: 4,
    position:
      "Marketing Manager",
    requirement:
      "240+ team members",
    salary:
      25000
  },

  {
    level: 5,
    position:
      "Marketing General Manager",
    requirement:
      "550+ team members",
    salary:
      75000
  },

  {
    level: 6,
    position:
      "Regional Manager",
    requirement:
      "1,200+ team members",
    salary:
      250000
  },

  {
    level: 7,
    position:
      "Regional General Manager",
    requirement:
      "2,000+ team members",
    salary:
      750000
  },

  {
    level: 8,
    position:
      "City Partner",
    requirement:
      "3,000+ team members",
    salary:
      1500000
  }

];


/* =========================================================
   RENDER COMPANY SALARY
   ========================================================= */

function ccusVIPRenderCompanySalary() {

  const vipContainer =
    document.querySelector(
      "#vipContainer, .vip-container"
    );

  if (!vipContainer) {
    return;
  }

  let container =
    document.getElementById(
      "ccusCompanySalaryStructure"
    );

  if (!container) {

    container =
      document.createElement(
        "div"
      );

    container.id =
      "ccusCompanySalaryStructure";

    vipContainer.appendChild(
      container
    );

  }


  container.innerHTML = `

    <div
      style="
        margin-top:20px;
        padding:16px;
        border-radius:12px;
        background:#fff;
        border:1px solid #eee;
      "
    >

      <h3
        style="
          margin:0 0 14px;
          font-size:18px;
        "
      >
        🏢 Company Monthly Salary Structure
      </h3>


      <div
        style="
          width:100%;
          overflow-x:auto;
        "
      >

        <table
          style="
            width:100%;
            min-width:650px;
            border-collapse:collapse;
            font-size:13px;
          "
        >

          <thead>

            <tr
              style="
                background:#fff3cd;
              "
            >

              <th
                style="
                  padding:10px;
                  border:1px solid #eee;
                "
              >
                Level
              </th>

              <th
                style="
                  padding:10px;
                  border:1px solid #eee;
                  text-align:left;
                "
              >
                Position
              </th>

              <th
                style="
                  padding:10px;
                  border:1px solid #eee;
                  text-align:left;
                "
              >
                Team Requirement
              </th>

              <th
                style="
                  padding:10px;
                  border:1px solid #eee;
                  text-align:right;
                "
              >
                Monthly Salary
              </th>

            </tr>

          </thead>


          <tbody>

            ${
              ccusVIPCompanySalaryLevels
                .map(
                  item => `

                    <tr>

                      <td
                        style="
                          padding:10px;
                          border:1px solid #eee;
                          text-align:center;
                          font-weight:bold;
                        "
                      >
                        ${item.level}
                      </td>

                      <td
                        style="
                          padding:10px;
                          border:1px solid #eee;
                          font-weight:600;
                        "
                      >
                        ${ccusVIPEscapeHtml(
                          item.position
                        )}
                      </td>

                      <td
                        style="
                          padding:10px;
                          border:1px solid #eee;
                        "
                      >
                        ${ccusVIPEscapeHtml(
                          item.requirement
                        )}
                      </td>

                      <td
                        style="
                          padding:10px;
                          border:1px solid #eee;
                          text-align:right;
                          font-weight:bold;
                        "
                      >
                        ETB
                        ${ccusVIPMoney(
                          item.salary
                        )}
                      </td>

                    </tr>

                  `
                )
                .join("")
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   INCOME LEVELS
   ========================================================= */

let ccusVIPIncomeLevelsCache =
  [];


function ccusVIPRenderIncomeTable(
  tbody,
  levels
) {

  if (!tbody) {
    return;
  }

  if (
    !Array.isArray(levels) ||
    !levels.length
  ) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="
            text-align:center;
            padding:20px;
          "
        >
          No income levels available.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    levels
      .map(
        level => `

          <tr>

            <td>
              ${Number(
                level.level || 0
              )}
            </td>

            <td>
              ETB
              ${ccusVIPMoney(
                level.price || 0
              )}
            </td>

            <td>
              ETB
              ${ccusVIPMoney(
                level.daily || 0
              )}
            </td>

            <td>
              ETB
              ${ccusVIPMoney(
                level.monthly || 0
              )}
            </td>

            <td>
              ETB
              ${ccusVIPMoney(
                level.yearly || 0
              )}
            </td>

          </tr>

        `
      )
      .join("");

}


/* =========================================================
   LOAD INCOME LEVELS
   ========================================================= */

function ccusVIPLoadIncomeLevels() {

  const api =
    ccusVIPRequireFirebase();

  const tbody =
    document.getElementById(
      "incomeLevelsTableBody"
    );

  if (!tbody) {
    return;
  }

  ccusVIPStopListener(
    "incomeLevels"
  );

  try {

    const unsubscribe =
      api.onSnapshot(

        api.collection(
          api.db,
          "incomeLevels"
        ),

        snapshot => {

          const levels =
            snapshot.docs
              .map(
                docSnap => ({

                  id:
                    docSnap.id,

                  ...docSnap.data()

                })
              )
              .filter(
                item =>
                  item.active !== false
              )
              .sort(
                (a, b) =>
                  Number(
                    a.level || 0
                  ) -
                  Number(
                    b.level || 0
                  )
              );


          ccusVIPIncomeLevelsCache =
            levels;


          ccusVIPRenderIncomeTable(
            tbody,
            levels
          );

        },

        error => {

          console.error(
            "❌ Income levels error:",
            error
          );


          if (
            ccusVIPIncomeLevelsCache.length
          ) {

            ccusVIPRenderIncomeTable(
              tbody,
              ccusVIPIncomeLevelsCache
            );

          } else {

            tbody.innerHTML = `
              <tr>
                <td
                  colspan="5"
                  style="
                    text-align:center;
                    padding:20px;
                    color:#c00;
                  "
                >
                  Failed to load income levels.
                </td>
              </tr>
            `;

          }

        }

      );


    ccusVIPState.listeners.incomeLevels =
      unsubscribe;

    W.unsubs =
      W.unsubs || {};

    W.unsubs.incomeLevels =
      unsubscribe;


  } catch (error) {

    console.error(
      "❌ Income levels listener error:",
      error
    );

  }

}


/* =========================================================
   EXPIRY CHECKER
   ========================================================= */

function ccusVIPStartExpiryChecker() {

  if (
    ccusVIPState.expiryInterval
  ) {

    clearInterval(
      ccusVIPState.expiryInterval
    );

  }


  /* Immediate recovery */

  if (
    ccusVIPGetCurrentUser()
  ) {

    ccusVIPProcessExpired()
      .catch(
        error =>
          console.warn(
            "VIP immediate expiry check:",
            error
          )
      );

  }


  /* Every 60 seconds */

  ccusVIPState.expiryInterval =
    setInterval(
      () => {

        if (
          ccusVIPGetCurrentUser()
        ) {

          ccusVIPProcessExpired()
            .catch(
              error =>
                console.warn(
                  "VIP interval expiry check:",
                  error
                )
            );

        }

      },
      60 * 1000
    );

}


/* =========================================================
   VISIBILITY / FOCUS CHECKER
   ========================================================= */

function ccusVIPStartVisibilityChecker() {

  if (
    ccusVIPState.visibilityStarted
  ) {

    return;

  }

  ccusVIPState.visibilityStarted =
    true;


  if (
    typeof document !== "undefined"
  ) {

    document.addEventListener(
      "visibilitychange",
      () => {

        if (
          document.visibilityState ===
          "visible"
        ) {

          if (
            ccusVIPGetCurrentUser()
          ) {

            ccusVIPProcessExpired()
              .catch(
                error =>
                  console.warn(
                    "VIP visibility check:",
                    error
                  )
              );

          }

        }

      }
    );

  }


  if (
    typeof window !== "undefined"
  ) {

    window.addEventListener(
      "focus",
      () => {

        if (
          ccusVIPGetCurrentUser()
        ) {

          ccusVIPProcessExpired()
            .catch(
              error =>
                console.warn(
                  "VIP focus check:",
                  error
                )
            );

        }

      }
    );

  }

}


/* =========================================================
   INITIALIZE
   ========================================================= */

async function ccusVIPInitialize() {

  if (
    ccusVIPState.initialized
  ) {

    if (
      ccusVIPGetCurrentUser()
    ) {

      await ccusVIPProcessExpired();

    }

    return;

  }


  ccusVIPState.initialized =
    true;


  try {

    ccusVIPLoadLevels();

  } catch (error) {

    console.error(
      "VIP level loading failed:",
      error
    );

  }


  try {

    const incomeTable =
      document.getElementById(
        "incomeLevelsTableBody"
      );

    if (incomeTable) {

      ccusVIPLoadIncomeLevels();

    }

  } catch (error) {

    console.error(
      "Income level loading failed:",
      error
    );

  }


  try {

    if (
      ccusVIPGetCurrentUser()
    ) {

      await ccusVIPProcessExpired();

    }

  } catch (error) {

    console.warn(
      "Initial VIP expiry recovery failed:",
      error
    );

  }


  ccusVIPStartExpiryChecker();

  ccusVIPStartVisibilityChecker();

}


/* =========================================================
   PUBLIC API
   ========================================================= */

W.buyVIP =
  ccusVIPBuy;

W.loadVIPLevels =
  ccusVIPLoadLevels;

W.renderVIPLevels =
  ccusVIPRenderLevels;

W.completeExpiredVIP =
  ccusVIPCompleteExpired;

W.processExpiredVIPForCurrentUser =
  ccusVIPProcessExpired;

W.loadIncomeLevels =
  ccusVIPLoadIncomeLevels;

W.renderCompanySalaryStructure =
  ccusVIPRenderCompanySalary;

W.initializeCCUSVIP =
  ccusVIPInitialize;


/* =========================================================
   DEBUG API
   ========================================================= */

W.ccusVIPDebug = {

  getCurrentUser:
    ccusVIPGetCurrentUser,

  getCurrentUserData:
    ccusVIPGetCurrentUserData,

  findCurrentOrder:
    ccusVIPFindCurrentOrder,

  findUserOrders:
    ccusVIPFindUserOrders,

  repairStaleUserState:
    ccusVIPRepairStaleUserState,

  processExpired:
    ccusVIPProcessExpired,

  completeExpired:
    ccusVIPCompleteExpired,

  loadLevels:
    ccusVIPLoadLevels

};


/* =========================================================
   AUTO INITIALIZATION
   ========================================================= */

function ccusVIPAutoInit() {

  setTimeout(
    () => {

      ccusVIPInitialize()
        .catch(
          error =>
            console.error(
              "❌ CCUS VIP initialization failed:",
              error
            )
        );

    },
    300
  );

}


if (
  typeof document !== "undefined"
) {

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      ccusVIPAutoInit,
      {
        once:
          true
      }
    );

  } else {

    ccusVIPAutoInit();

  }

}

})();

/* =========================================================
   CCUS - DAILY TASKS SYSTEM
   FINAL STABLE / CORRECTED VERSION

   BUSINESS RULES
   ---------------------------------------------------------
   1. Approved recharge determines task level.
   2. Highest eligible approved recharge level is used.
   3. Upgrade recharge uses upgradeAmount.
   4. Task levels come from rechargeLevels.
   5. Sunday = blocked.
   6. Task hours = 09:00 - 21:00 Ethiopia time.
   7. One task can be claimed once per day.
   8. Daily task limit comes from recharge level.
   9. Task reward increases totalBalance.
   10. totalRecharge is NOT changed by task claim.
   11. vipLevel is NOT required.
   12. users/{uid}.taskLimit is NOT required.
   13. tasks/{taskId}.reward is authoritative.
   14. Claim ID = YYYY-MM-DD_taskId.
   15. Firestore transaction is used.
   16. Transaction reads are DocumentReferences only.
   17. Daily limit is checked atomically using:
       users/{uid}/taskDailyStats/{YYYY-MM-DD}
========================================================= */


/* =========================================================
GLOBAL STATE
========================================================= */

window.dailyTasksCache =
  Array.isArray(window.dailyTasksCache)
    ? window.dailyTasksCache
    : [];

window.dailyTasksLoaded =
  Boolean(window.dailyTasksLoaded);

window.dailyTasksLoading =
  false;

window.dailyTasksMeta =
  window.dailyTasksMeta || {
    dailyLimit: 0,
    isSunday: false,
    noDeposit: false,
    status: {},
    claimedCount: 0,
    approvedTotal: 0,
    currentLevel: null
  };

window.ccusTaskClaimLocks =
  window.ccusTaskClaimLocks instanceof Set
    ? window.ccusTaskClaimLocks
    : new Set();


/* =========================================================
SAFE ACTIVE VALUE
========================================================= */

function isTaskActiveValue(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0
  ) {
    return false;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  return ![
    "false",
    "0",
    "inactive",
    "disabled",
    "off"
  ].includes(normalized);
}


/* =========================================================
SAFE NUMBER
========================================================= */

function ccusTaskNumber(
  value,
  fallback = 0
) {

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


/* =========================================================
TASK SETTINGS
========================================================= */

async function loadTaskSettings() {

  try {

    const snap =
      await getDoc(
        doc(
          db,
          "settings",
          "taskSettings"
        )
      );

    const data =
      snap.exists()
        ? snap.data() || {}
        : {};

    /*
     * rewardPerTask is kept only for
     * admin compatibility.
     *
     * IMPORTANT:
     * It is NOT used as task reward.
     *
     * Authoritative reward:
     * tasks/{taskId}.reward
     */

    const reward =
      Number(
        data.rewardPerTask ?? 0
      );

    window.taskSettings = {

      active:
        isTaskActiveValue(
          data.active
        ),

      rewardPerTask:
        Number.isFinite(reward)
          ? Math.max(0, reward)
          : 0
    };

    return window.taskSettings;

  } catch (error) {

    console.error(
      "❌ Task settings load error:",
      error
    );

    window.taskSettings = {

      active: true,

      rewardPerTask: 0
    };

    return window.taskSettings;
  }
}


/* =========================================================
LOAD RECHARGE LEVELS
========================================================= */

async function ensureTaskRechargeLevels() {

  try {

    const snap =
      await getDocs(
        collection(
          db,
          "rechargeLevels"
        )
      );

    const levels = [];

    snap.forEach(
      levelSnap => {

        const data =
          levelSnap.data() || {};

        let level = null;


        /* -------------------------------------------------
           NORMALIZER
        ------------------------------------------------- */

        if (
          typeof normalizeRechargeLevel ===
          "function"
        ) {

          try {

            level =
              normalizeRechargeLevel(
                levelSnap.id,
                data
              );

          } catch (error) {

            console.warn(
              "⚠️ normalizeRechargeLevel error:",
              error
            );
          }
        }


        /* -------------------------------------------------
           FALLBACK NORMALIZER
        ------------------------------------------------- */

        if (!level) {

          level = {

            id:
              levelSnap.id,

            level:
              data.level ??
              data.name ??
              levelSnap.id,

            name:
              data.name ??
              data.level ??
              levelSnap.id,

            amount:
              Number(
                data.amount ??
                data.depositAmount ??
                data.price ??
                0
              ),

            taskLimit:
              Number(
                data.taskLimit ??
                0
              ),

            active:
              isTaskActiveValue(
                data.active
              ),

            order:
              Number(
                data.order ??
                999999
              )
          };
        }


        const amount =
          Number(
            level.amount ??
            level.depositAmount ??
            level.price ??
            0
          );


        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          return;
        }


        if (
          !isTaskActiveValue(
            level.active
          )
        ) {

          return;
        }


        const taskLimit =
          Number(
            level.taskLimit ?? 0
          );


        levels.push({

          ...level,

          id:
            level.id ||
            levelSnap.id,

          name:
            level.name ??
            level.level ??
            levelSnap.id,

          amount,

          taskLimit:
            Number.isFinite(taskLimit)
              ? Math.max(
                  0,
                  Math.floor(taskLimit)
                )
              : 0,

          active: true,

          order:
            Number(
              level.order ??
              data.order ??
              999999
            )
        });
      }
    );


    /* -----------------------------------------------------
       SORT BY AMOUNT
    ----------------------------------------------------- */

    levels.sort(
      (a, b) => {

        const amountDiff =
          Number(a.amount || 0) -
          Number(b.amount || 0);

        if (
          amountDiff !== 0
        ) {

          return amountDiff;
        }

        return (
          Number(a.order ?? 999999) -
          Number(b.order ?? 999999)
        );
      }
    );


    try {

      if (
        typeof rechargeLevels !==
        "undefined"
      ) {

        rechargeLevels =
          levels;
      }

    } catch (error) {
      /* ignore */
    }


    window.rechargeLevels =
      levels;


    return levels;

  } catch (error) {

    console.error(
      "❌ Recharge levels load error:",
      error
    );

    window.rechargeLevels =
      [];

    return [];
  }
}


/* =========================================================
GET APPROVED RECHARGE RECORDS
========================================================= */

async function getApprovedRechargeRecords(
  userId = currentUser?.uid
) {

  if (!userId) {

    return [];
  }


  try {

    const snap =
      await getDocs(
        query(
          collection(
            db,
            "rechargeRequests"
          ),

          where(
            "userId",
            "==",
            userId
          )
        )
      );


    return snap.docs

      .map(
        item => ({

          id:
            item.id,

          ...item.data()
        })
      )

      .filter(
        item =>
          String(
            item.status ?? ""
          )
            .trim()
            .toLowerCase() ===
          "approved"
      );

  } catch (error) {

    console.error(
      "❌ Approved recharge records error:",
      error
    );

    return [];
  }
}


/* =========================================================
GET APPROVED RECHARGE CONTRIBUTION
========================================================= */

function getApprovedRechargeContribution(
  record
) {

  if (!record) {

    return 0;
  }


  /* -------------------------------------------------------
     UPGRADE
  ------------------------------------------------------- */

  const isUpgrade =
    record.isUpgrade === true ||
    String(
      record.isUpgrade ?? ""
    )
      .trim()
      .toLowerCase() ===
    "true";


  if (isUpgrade) {

    const upgradeAmount =
      Number(
        record.upgradeAmount ?? 0
      );


    if (
      Number.isFinite(upgradeAmount) &&
      upgradeAmount > 0
    ) {

      return upgradeAmount;
    }
  }


  /* -------------------------------------------------------
     LEGACY UPGRADE
  ------------------------------------------------------- */

  const legacyUpgradeAmount =
    Number(
      record.upgradeAmount ?? 0
    );


  if (
    Number.isFinite(
      legacyUpgradeAmount
    ) &&

    legacyUpgradeAmount > 0 &&

    (
      record.levelAmount !==
      undefined ||

      record.approvedTotalRecharge !==
      undefined ||

      record.targetLevelAmount !==
      undefined
    )
  ) {

    return legacyUpgradeAmount;
  }


  /* -------------------------------------------------------
     NORMAL RECHARGE
  ------------------------------------------------------- */

  const amount =
    Number(
      record.amount ??
      record.depositAmount ??
      record.rechargeAmount ??
      record.approvedAmount ??
      0
    );


  return (
    Number.isFinite(amount) &&
    amount > 0
  )
    ? amount
    : 0;
}


/* =========================================================
GET APPROVED TOTAL
========================================================= */

async function getApprovedRechargeTotal(
  userId = currentUser?.uid
) {

  if (!userId) {

    return 0;
  }


  let userTotal = 0;


  /* -------------------------------------------------------
     USERS TOTAL RECHARGE
  ------------------------------------------------------- */

  try {

    const userSnap =
      await getDoc(
        doc(
          db,
          "users",
          userId
        )
      );


    if (
      userSnap.exists()
    ) {

      const data =
        userSnap.data() || {};

      const total =
        Number(
          data.totalRecharge ?? 0
        );


      if (
        Number.isFinite(total) &&
        total >= 0
      ) {

        userTotal =
          total;
      }
    }

  } catch (error) {

    console.warn(
      "⚠️ totalRecharge read warning:",
      error
    );
  }


  /* -------------------------------------------------------
     APPROVED REQUEST FALLBACK
  ------------------------------------------------------- */

  try {

    const approved =
      await getApprovedRechargeRecords(
        userId
      );


    if (
      approved.length > 0
    ) {

      const requestTotal =
        approved.reduce(
          (
            total,
            record
          ) => {

            return (
              total +
              getApprovedRechargeContribution(
                record
              )
            );
          },
          0
        );


      if (
        userTotal <= 0 &&
        requestTotal > 0
      ) {

        return requestTotal;
      }
    }

  } catch (error) {

    console.warn(
      "⚠️ Approved recharge fallback warning:",
      error
    );
  }


  return userTotal;
}


/* =========================================================
GET HIGHEST ELIGIBLE RECHARGE LEVEL
========================================================= */

async function getApprovedRechargeLevel(
  userId = currentUser?.uid
) {

  if (!userId) {

    return null;
  }


  const levels =
    await ensureTaskRechargeLevels();


  if (
    !Array.isArray(levels) ||
    levels.length === 0
  ) {

    return null;
  }


  const approvedTotal =
    await getApprovedRechargeTotal(
      userId
    );


  if (
    !Number.isFinite(approvedTotal) ||
    approvedTotal <= 0
  ) {

    return null;
  }


  let currentLevel =
    null;


  for (
    const level of levels
  ) {

    const amount =
      Number(
        level.amount ?? 0
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      continue;
    }


    if (
      approvedTotal >= amount
    ) {

      if (
        !currentLevel ||
        amount >
        Number(
          currentLevel.amount ?? 0
        )
      ) {

        currentLevel =
          level;
      }
    }
  }


  if (!currentLevel) {

    return null;
  }


  return {

    ...currentLevel,

    approvedTotal,

    calculatedByTotal: true
  };
}


/* =========================================================
GET USER DAILY TASK LIMIT
========================================================= */

async function getUserDailyTaskLimit(
  userId = currentUser?.uid
) {

  if (!userId) {

    return 0;
  }


  const level =
    await getApprovedRechargeLevel(
      userId
    );


  if (!level) {

    return 0;
  }


  const limit =
    Number(
      level.taskLimit ?? 0
    );


  return Number.isFinite(limit)

    ? Math.max(
        0,
        Math.floor(limit)
      )

    : 0;
}


/* =========================================================
GET TODAY CLAIMS
========================================================= */

async function getTodayTaskClaims(
  userId = currentUser?.uid
) {

  if (!userId) {

    return {

      ids:
        new Set(),

      count:
        0
    };
  }


  try {

    const today =
      getLocalDateString();


    const claimsRef =
      collection(
        db,
        "users",
        userId,
        "taskClaims"
      );


    const ids =
      new Set();


    /* -----------------------------------------------------
       NEW FORMAT
    ----------------------------------------------------- */

    try {

      const dateSnap =
        await getDocs(
          query(
            claimsRef,

            where(
              "date",
              "==",
              today
            )
          )
        );


      dateSnap.forEach(
        claimSnap => {

          const data =
            claimSnap.data() || {};


          if (
            data.taskId !==
            undefined &&
            data.taskId !==
            null
          ) {

            ids.add(
              String(
                data.taskId
              )
            );
          }
        }
      );

    } catch (error) {

      console.warn(
        "⚠️ date claim query warning:",
        error
      );
    }


    /* -----------------------------------------------------
       LEGACY FORMAT
    ----------------------------------------------------- */

    try {

      const claimDateSnap =
        await getDocs(
          query(
            claimsRef,

            where(
              "claimDate",
              "==",
              today
            )
          )
        );


      claimDateSnap.forEach(
        claimSnap => {

          const data =
            claimSnap.data() || {};


          if (
            data.taskId !==
            undefined &&
            data.taskId !==
            null
          ) {

            ids.add(
              String(
                data.taskId
              )
            );
          }
        }
      );

    } catch (error) {

      console.warn(
        "⚠️ claimDate query warning:",
        error
      );
    }


    return {

      ids,

      count:
        ids.size
    };

  } catch (error) {

    console.error(
      "❌ Today's claims error:",
      error
    );


    return {

      ids:
        new Set(),

      count:
        0
    };
  }
}


/* =========================================================
OPERATING STATUS
========================================================= */

async function getSafeTaskOperatingStatus() {

  const parts =
    getEthiopiaDateParts();


  /* -------------------------------------------------------
     SUNDAY
  ------------------------------------------------------- */

  if (
    Number(parts.weekday) === 0
  ) {

    return {

      allowed: false,

      isSunday: true,

      reason:
        "sunday",

      message:
        "Today is Sunday. Tasks cannot be claimed today."
    };
  }


  /* -------------------------------------------------------
     HOURS
     09:00 - 21:00
  ------------------------------------------------------- */

  const hour =
    Number(
      parts.hour ?? 0
    );


  const minute =
    Number(
      parts.minute ?? 0
    );


  const totalMinutes =
    hour * 60 +
    minute;


  if (
    totalMinutes < 540 ||
    totalMinutes >= 1260
  ) {

    return {

      allowed: false,

      isSunday: false,

      reason:
        "outside_task_hours",

      message:
        "Daily Tasks are available from 9:00 AM to 9:00 PM only."
    };
  }


  /* -------------------------------------------------------
     ADMIN CALENDAR
  ------------------------------------------------------- */

  try {

    if (
      typeof getTodayOperatingStatus ===
      "function"
    ) {

      const calendar =
        await getTodayOperatingStatus();


      if (calendar) {

        return {

          ...calendar,

          isSunday:
            calendar.reason ===
            "sunday" ||
            calendar.isSunday === true
        };
      }
    }

  } catch (error) {

    console.warn(
      "⚠️ Calendar status warning:",
      error
    );
  }


  return {

    allowed: true,

    isSunday: false,

    reason:
      "open"
  };
}


/* =========================================================
GET ACTIVE DAILY TASKS
========================================================= */

async function getActiveDailyTasks() {

  try {

    const snap =
      await getDocs(
        collection(
          db,
          "tasks"
        )
      );


    const tasks = [];


    snap.forEach(
      taskSnap => {

        const data =
          taskSnap.data() || {};


        /* -------------------------------------------------
           ACTIVE
        ------------------------------------------------- */

        if (
          !isTaskActiveValue(
            data.active
          )
        ) {

          return;
        }


        /* -------------------------------------------------
           REAL FIRESTORE DOCUMENT ID
        ------------------------------------------------- */

        const firestoreTaskId =
          String(
            taskSnap.id
          );


        /* -------------------------------------------------
           AUTHORITATIVE REWARD
        ------------------------------------------------- */

        const rawReward =
          data.reward;


        const reward =
          Number(
            rawReward
          );


        if (
          rawReward === null ||
          rawReward === undefined ||
          rawReward === "" ||
          !Number.isFinite(reward) ||
          reward <= 0
        ) {

          console.warn(
            "⚠️ TASK SKIPPED - INVALID REWARD:",
            {

              taskId:
                firestoreTaskId,

              title:
                data.title ??
                data.name ??
                "Daily Task",

              reward:
                rawReward
            }
          );

          return;
        }


        /* -------------------------------------------------
           ORDER
        ------------------------------------------------- */

        const rawOrder =
          Number(
            data.order
          );


        const order =
          Number.isFinite(rawOrder)
            ? rawOrder
            : 999999;


        tasks.push({

          id:
            firestoreTaskId,

          taskId:
            firestoreTaskId,

          title:
            String(
              data.title ??
              data.name ??
              "Daily Task"
            ).trim(),

          description:
            String(
              data.description ??
              data.message ??
              ""
            ).trim(),

          order,

          reward,

          active:
            true
        });
      }
    );


    /* -----------------------------------------------------
       SORT
    ----------------------------------------------------- */

    tasks.sort(
      (a, b) => {

        const orderDiff =
          Number(a.order) -
          Number(b.order);


        if (
          orderDiff !== 0
        ) {

          return orderDiff;
        }


        return String(
          a.taskId
        ).localeCompare(
          String(
            b.taskId
          )
        );
      }
    );


    return tasks.map(
      (
        task,
        index
      ) => ({

        ...task,

        taskNumber:
          index + 1
      })
    );

  } catch (error) {

    console.error(
      "❌ Active tasks error:",
      error
    );

    throw error;
  }
}


/* =========================================================
LOADING UI
========================================================= */

function showDailyTasksLoading() {

  [
    $("taskListContainer"),
    $("homeTaskListContainer"),
    $("tasksPageContainer")
  ]
    .filter(Boolean)
    .forEach(
      container => {

        container.innerHTML = `

          <div
            style="
              text-align:center;
              padding:20px;
            "
          >
            Loading daily tasks...
          </div>

        `;
      }
    );
}


/* =========================================================
RENDER FROM CACHE
========================================================= */

function renderDailyTasksFromCache() {

  if (
    !window.dailyTasksLoaded
  ) {

    return false;
  }


  const meta =
    window.dailyTasksMeta || {};


  renderDailyTasks(

    window.dailyTasksCache || [],

    Number(
      meta.dailyLimit || 0
    ),

    Boolean(
      meta.isSunday
    ),

    Boolean(
      meta.noDeposit
    ),

    meta.status || {}
  );


  return true;
}


/* =========================================================
LOAD DAILY TASKS
========================================================= */

async function loadDailyTasks(
  options = {}
) {

  if (
    !options.force &&
    window.dailyTasksLoaded &&
    Array.isArray(
      window.dailyTasksCache
    )
  ) {

    renderDailyTasksFromCache();

    return window.dailyTasksCache;
  }


  if (
    window.dailyTasksLoading ||
    !currentUser
  ) {

    return (
      window.dailyTasksCache || []
    );
  }


  window.dailyTasksLoading =
    true;


  showDailyTasksLoading();


  try {

    const settings =
      await loadTaskSettings();


    if (
      !settings.active
    ) {

      window.dailyTasksCache =
        [];

      window.dailyTasksLoaded =
        true;


      window.dailyTasksMeta = {

        dailyLimit: 0,

        isSunday: false,

        noDeposit: false,

        approvedTotal: 0,

        currentLevel: null,

        claimedCount: 0,

        status: {

          allowed: false,

          reason:
            "disabled",

          message:
            "Tasks are currently unavailable."
        }
      };


      renderDailyTasks(
        [],
        0,
        false,
        false,
        window.dailyTasksMeta.status
      );


      return [];
    }


    /* -----------------------------------------------------
       OPERATING STATUS
    ----------------------------------------------------- */

    const status =
      await getSafeTaskOperatingStatus();


    const isSunday =
      status.reason ===
      "sunday" ||
      status.isSunday === true;


    /* -----------------------------------------------------
       ACTIVE TASKS
    ----------------------------------------------------- */

    const tasks =
      await getActiveDailyTasks();


    if (
      !tasks.length
    ) {

      window.dailyTasksCache =
        [];

      window.dailyTasksLoaded =
        true;


      window.dailyTasksMeta = {

        dailyLimit: 0,

        isSunday,

        noDeposit: false,

        approvedTotal: 0,

        currentLevel: null,

        claimedCount: 0,

        status
      };


      renderDailyTasks(
        [],
        0,
        isSunday,
        false,
        status
      );


      return [];
    }


    /* -----------------------------------------------------
       LEVEL
    ----------------------------------------------------- */

    const level =
      await getApprovedRechargeLevel(
        currentUser.uid
      );


    const approvedTotal =
      level?.approvedTotal ??
      await getApprovedRechargeTotal(
        currentUser.uid
      );


    /* -----------------------------------------------------
       CLAIMS
    ----------------------------------------------------- */

    const claimed =
      await getTodayTaskClaims(
        currentUser.uid
      );


    /* -----------------------------------------------------
       NO APPROVED LEVEL
    ----------------------------------------------------- */

    if (!level) {

      const mapped =
        tasks.map(
          task => {

            const taskId =
              String(
                task.taskId ??
                task.id
              );

            return {

              ...task,

              id:
                taskId,

              taskId,

              submitted:
                claimed.ids.has(
                  taskId
                )
            };
          }
        );


      window.dailyTasksCache =
        mapped;

      window.dailyTasksLoaded =
        true;


      window.dailyTasksMeta = {

        dailyLimit: 0,

        isSunday,

        noDeposit: true,

        approvedTotal,

        currentLevel: null,

        claimedCount:
          claimed.count,

        status
      };


      renderDailyTasks(
        mapped,
        0,
        isSunday,
        true,
        status
      );


      return mapped;
    }


    /* -----------------------------------------------------
       DAILY LIMIT
    ----------------------------------------------------- */

    const dailyLimit =
      Math.max(
        0,
        Math.floor(
          Number(
            level.taskLimit ?? 0
          )
        )
      );


    /* -----------------------------------------------------
       MAP
    ----------------------------------------------------- */

    const mapped =
      tasks.map(
        task => {

          const taskId =
            String(
              task.taskId ??
              task.id
            );


          return {

            ...task,

            id:
              taskId,

            taskId,

            reward:
              Number(
                task.reward
              ),

            submitted:
              claimed.ids.has(
                taskId
              )
          };
        }
      );


    window.dailyTasksCache =
      mapped;

    window.dailyTasksLoaded =
      true;


    window.dailyTasksMeta = {

      dailyLimit,

      isSunday,

      noDeposit: false,

      approvedTotal,

      currentLevel: level,

      claimedCount:
        claimed.count,

      status
    };


    renderDailyTasks(
      mapped,
      dailyLimit,
      isSunday,
      false,
      status
    );


    return mapped;

  } catch (error) {

    console.error(
      "❌ Daily task load error:",
      error
    );


    [
      $("taskListContainer"),
      $("homeTaskListContainer"),
      $("tasksPageContainer")
    ]
      .filter(Boolean)
      .forEach(
        container => {

          container.innerHTML = `

            <div
              class="empty-state"
              style="
                text-align:center;
                padding:25px;
              "
            >

              <h3>
                Unable to Load Tasks
              </h3>

              <p>
                Please try again later.
              </p>

            </div>

          `;
        }
      );


    return [];

  } finally {

    window.dailyTasksLoading =
      false;
  }
}


/* =========================================================
DISABLED BUTTON
========================================================= */

function getDisabledBtn(
  text,
  bg = "#eee"
) {

  return `

    <button
      type="button"
      disabled
      style="
        margin-top:8px;
        width:100%;
        padding:10px;
        border:0;
        border-radius:8px;
        background:${bg};
        color:#777;
      "
    >
      ${escapeHtml(text)}
    </button>

  `;
}


/* =========================================================
RENDER DAILY TASKS
========================================================= */

function renderDailyTasks(
  tasks,
  dailyLimit = 0,
  isSunday = false,
  noDeposit = false,
  status = {}
) {

  const containers = [

    $("taskListContainer"),

    $("homeTaskListContainer"),

    $("tasksPageContainer")

  ].filter(Boolean);


  if (
    !containers.length
  ) {

    return;
  }


  if (
    !Array.isArray(tasks) ||
    tasks.length === 0
  ) {

    containers.forEach(
      container => {

        container.innerHTML = `

          <div
            class="empty-state"
            style="
              text-align:center;
              padding:25px;
            "
          >

            <h3>
              No Daily Tasks Available
            </h3>

          </div>

        `;
      }
    );


    updateTaskSummary(
      0,
      dailyLimit,
      isSunday,
      noDeposit,
      status
    );


    return;
  }


  const claimedCount =
    tasks.filter(
      task =>
        task.submitted === true
    ).length;


  const html =
    tasks.map(
      (
        task,
        index
      ) => {

        const taskId =
          String(
            task.taskId ??
            task.id
          );


        const taskNumber =
          Number(
            task.taskNumber ??
            index + 1
          );


        let buttonHTML =
          "";


        if (
          task.submitted === true
        ) {

          buttonHTML =
            getDisabledBtn(
              "✓ Completed",
              "#ddd"
            );

        } else {

          buttonHTML = `

            <button
              type="button"
              class="primary-btn task-claim-btn"
              data-id="${escapeHtml(taskId)}"
              data-task-id="${escapeHtml(taskId)}"
              style="
                margin-top:8px;
                width:100%;
              "
            >
              ✅ Claim Reward
            </button>

          `;
        }


        return `

          <div
            class="simple-card task-card"
            data-task-id="${escapeHtml(taskId)}"
            style="
              margin-bottom:12px;
              padding:14px;
              border:1px solid #ddd;
              border-radius:10px;
            "
          >

            <h3>
              Task ${taskNumber}:
              ${escapeHtml(task.title)}
            </h3>

            ${
              task.description
                ? `<p>${escapeHtml(task.description)}</p>`
                : ""
            }

            <div>
              Reward:
              ETB ${money(task.reward)}
            </div>

            ${buttonHTML}

            <p
              class="task-message"
              style="
                margin-top:7px;
                min-height:20px;
              "
            ></p>

          </div>

        `;
      }
    ).join("");


  containers.forEach(
    container => {

      container.innerHTML =
        html;


      container
        .querySelectorAll(
          ".task-claim-btn"
        )
        .forEach(
          button => {

            button.onclick =
              async event => {

                event.preventDefault();

                event.stopPropagation();


                if (
                  button.disabled
                ) {

                  return;
                }


                const selectedTaskId =
                  String(
                    button.dataset.taskId ||
                    button.dataset.id ||
                    ""
                  );


                const selectedTask =
                  tasks.find(
                    item => {

                      const itemTaskId =
                        String(
                          item.taskId ??
                          item.id
                        );

                      return (
                        itemTaskId ===
                        selectedTaskId
                      );
                    }
                  );


                if (!selectedTask) {

                  console.error(
                    "❌ Selected task not found:",
                    selectedTaskId
                  );

                  return;
                }


                const messageElement =
                  button
                    .closest(
                      ".task-card"
                    )
                    ?.querySelector(
                      ".task-message"
                    );


                await claimTask(
                  selectedTask,
                  button,
                  messageElement
                );
              };
          }
        );
    }
  );


  updateTaskSummary(
    claimedCount,
    dailyLimit,
    isSunday,
    noDeposit,
    status
  );
}


/* =========================================================
TASK SUMMARY
========================================================= */

function updateTaskSummary(
  claimedCount = 0,
  dailyLimit = 0,
  isSunday = false,
  noDeposit = false,
  status = {}
) {

  const summaries = [

    $("taskClaimSummary"),

    $("homeTaskClaimSummary"),

    $("tasksPageClaimSummary")

  ].filter(Boolean);


  if (
    !summaries.length
  ) {

    return;
  }


  let message =
    "";


  if (isSunday) {

    message =
      "Today is Sunday. Tasks cannot be claimed today.";

  }

  else if (noDeposit) {

    message =
      "Approved deposit is required to claim daily tasks.";

  }

  else if (
    status.reason ===
    "outside_task_hours"
  ) {

    message =
      "Daily Tasks are available from 9:00 AM to 9:00 PM only.";

  }

  else if (
    status.allowed === false
  ) {

    message =
      status.message ||
      "Tasks are unavailable today.";

  }

  else {

    const claimed =
      Math.max(
        0,
        Number(
          claimedCount || 0
        )
      );


    const limit =
      Math.max(
        0,
        Number(
          dailyLimit || 0
        )
      );


    if (
      limit > 0 &&
      claimed >= limit
    ) {

      message =
        `Your daily task limit of ${limit} has been reached.`;

    }

    else if (
      limit > 0
    ) {

      message =
        `${Math.min(
          claimed,
          limit
        )} / ${limit} tasks claimed today`;

    }

    else {

      message =
        "No daily task limit is currently available.";
    }
  }


  summaries.forEach(
    summary => {

      summary.textContent =
        message;
    }
  );
}


/* =========================================================
UPDATE AFTER SUCCESSFUL CLAIM
========================================================= */

function updateTaskAfterSuccessfulClaim(
  taskId
) {

  const id =
    String(
      taskId
    );


  if (
    Array.isArray(
      window.dailyTasksCache
    )
  ) {

    window.dailyTasksCache =
      window.dailyTasksCache.map(
        task => {

          const currentId =
            String(
              task.taskId ??
              task.id
            );


          if (
            currentId !== id
          ) {

            return task;
          }


          return {

            ...task,

            id,

            taskId:
              id,

            submitted:
              true
          };
        }
      );
  }


  const meta =
    window.dailyTasksMeta || {};


  const claimedCount =
    Array.isArray(
      window.dailyTasksCache
    )

      ? window.dailyTasksCache.filter(
          task =>
            task.submitted === true
        ).length

      : Number(
          meta.claimedCount || 0
        ) + 1;


  window.dailyTasksMeta = {

    ...meta,

    claimedCount
  };


  document
    .querySelectorAll(
      ".task-card"
    )
    .forEach(
      card => {

        if (
          String(
            card.dataset.taskId
          ) !== id
        ) {

          return;
        }


        const button =
          card.querySelector(
            ".task-claim-btn"
          );


        if (button) {

          button.disabled =
            true;

          button.textContent =
            "✓ Completed";
        }


        const message =
          card.querySelector(
            ".task-message"
          );


        if (message) {

          message.style.color =
            "green";

          message.textContent =
            "Reward claimed successfully.";
        }
      }
    );


  updateTaskSummary(

    window.dailyTasksMeta
      ?.claimedCount || 0,

    window.dailyTasksMeta
      ?.dailyLimit || 0,

    window.dailyTasksMeta
      ?.isSunday || false,

    window.dailyTasksMeta
      ?.noDeposit || false,

    window.dailyTasksMeta
      ?.status || {}

  );
}


/* =========================================================
CLAIM TASK
FINAL FIX
========================================================= */

async function claimTask(
  task,
  button,
  messageElement
) {

  if (
    !currentUser ||
    !task
  ) {

    return;
  }


  const userId =
    String(
      currentUser.uid
    );


  /* -------------------------------------------------------
     REAL FIRESTORE TASK ID
  ------------------------------------------------------- */

  const taskId =
    String(
      task.taskId ??
      task.id ??
      ""
    );


  if (!taskId) {

    console.error(
      "❌ CLAIM TASK: Missing task ID.",
      task
    );

    return;
  }


  const today =
    getLocalDateString();


  const claimId =
    `${today}_${taskId}`;


  const lockKey =
    `${userId}_${claimId}`;


  if (
    !(window.ccusTaskClaimLocks instanceof Set)
  ) {

    window.ccusTaskClaimLocks =
      new Set();
  }


  if (
    window.ccusTaskClaimLocks.has(
      lockKey
    )
  ) {

    return;
  }


  window.ccusTaskClaimLocks.add(
    lockKey
  );


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "✅ Claiming...";
  }


  try {

    /* ===================================================
       1. OPERATING STATUS
    =================================================== */

    const status =
      await getSafeTaskOperatingStatus();


    if (
      status.reason ===
      "sunday"
    ) {

      throw new Error(
        "Today is Sunday. Tasks cannot be claimed today."
      );
    }


    if (
      status.reason ===
      "outside_task_hours"
    ) {

      throw new Error(
        "Daily Tasks are available from 9:00 AM to 9:00 PM only."
      );
    }


    if (
      status.allowed === false
    ) {

      throw new Error(
        status.message ||
        "Tasks are unavailable today."
      );
    }


    /* ===================================================
       2. SETTINGS
    =================================================== */

    const settings =
      await loadTaskSettings();


    if (
      !settings.active
    ) {

      throw new Error(
        "Tasks are currently unavailable."
      );
    }


    /* ===================================================
       3. CURRENT APPROVED LEVEL
    =================================================== */

    const level =
      await getApprovedRechargeLevel(
        userId
      );


    if (!level) {

      throw new Error(
        "🔒 Approved deposit is required to claim this task."
      );
    }


    /* ===================================================
       4. DAILY LIMIT
    =================================================== */

    const dailyLimit =
      Math.max(
        0,
        Math.floor(
          Number(
            level.taskLimit ?? 0
          )
        )
      );


    if (
      dailyLimit <= 0
    ) {

      throw new Error(
        "Your current recharge level does not have a daily task limit configured."
      );
    }


    console.log(
      "CCUS TASK LEVEL:",
      {

        approvedTotal:
          level.approvedTotal,

        levelId:
          level.id,

        levelName:
          level.name ??
          level.level,

        levelAmount:
          level.amount,

        taskLimit:
          dailyLimit
      }
    );


    /* ===================================================
       5. PRE-CHECK CLAIM
    =================================================== */

    const todayClaims =
      await getTodayTaskClaims(
        userId
      );


    if (
      todayClaims.ids.has(
        taskId
      )
    ) {

      throw new Error(
        "Task already completed today."
      );
    }


    if (
      todayClaims.count >=
      dailyLimit
    ) {

      throw new Error(
        `Your daily task limit of ${dailyLimit} has been reached.`
      );
    }


    /* ===================================================
       6. FIRESTORE REFERENCES

       IMPORTANT:
       Every transaction.get() below receives
       DocumentReference.

       NO transaction.get(query).
    =================================================== */

    const userRef =
      doc(
        db,
        "users",
        userId
      );


    const claimRef =
      doc(
        db,
        "users",
        userId,
        "taskClaims",
        claimId
      );


    const taskRef =
      doc(
        db,
        "tasks",
        taskId
      );


    /*
     * NEW:
     *
     * users/{uid}/taskDailyStats/{YYYY-MM-DD}
     *
     * This document is the atomic daily counter.
     */

    const dailyStatsRef =
      doc(
        db,
        "users",
        userId,
        "taskDailyStats",
        today
      );


    let claimedReward =
      0;


    let claimedTaskTitle =
      "";


    let claimedTaskNumber =
      Number(
        task.taskNumber ?? 0
      );


    /* ===================================================
       7. ATOMIC TRANSACTION
    =================================================== */

    await runTransaction(
      db,
      async transaction => {

        /* ------------------------------------------------
           ALL TRANSACTION READS FIRST
           
           IMPORTANT:
           ALL ARE DOCUMENT REFERENCES.
        ------------------------------------------------ */

        const userSnap =
          await transaction.get(
            userRef
          );


        const claimSnap =
          await transaction.get(
            claimRef
          );


        const taskSnap =
          await transaction.get(
            taskRef
          );


        const dailyStatsSnap =
          await transaction.get(
            dailyStatsRef
          );


        /* ------------------------------------------------
           USER
        ------------------------------------------------ */

        if (
          !userSnap.exists()
        ) {

          throw new Error(
            "User profile not found."
          );
        }


        /* ------------------------------------------------
           TASK
        ------------------------------------------------ */

        if (
          !taskSnap.exists()
        ) {

          throw new Error(
            "Task not found."
          );
        }


        /* ------------------------------------------------
           DUPLICATE CLAIM
        ------------------------------------------------ */

        if (
          claimSnap.exists()
        ) {

          throw new Error(
            "Task already completed today."
          );
        }


        /* ------------------------------------------------
           DAILY STATS
        ------------------------------------------------ */

        const dailyStats =
          dailyStatsSnap.exists()
            ? (
                dailyStatsSnap.data() ||
                {}
              )
            : {};


        let transactionClaimCount =
          Number(
            dailyStats.claimedCount ?? 0
          );


        if (
          !Number.isFinite(
            transactionClaimCount
          ) ||
          transactionClaimCount < 0
        ) {

          transactionClaimCount =
            0;
        }


        transactionClaimCount =
          Math.floor(
            transactionClaimCount
          );


        /* ------------------------------------------------
           DAILY LIMIT - ATOMIC
        ------------------------------------------------ */

        if (
          transactionClaimCount >=
          dailyLimit
        ) {

          throw new Error(
            `Your daily task limit of ${dailyLimit} has been reached.`
          );
        }


        /* ------------------------------------------------
           TASK DATA
        ------------------------------------------------ */

        const taskData =
          taskSnap.data() || {};


        /* ------------------------------------------------
           ACTIVE
        ------------------------------------------------ */

        if (
          !isTaskActiveValue(
            taskData.active
          )
        ) {

          throw new Error(
            "This task is currently unavailable."
          );
        }


        /* ------------------------------------------------
           AUTHORITATIVE REWARD
           
           ONLY:
           tasks/{taskId}.reward
        ------------------------------------------------ */

        const rawReward =
          taskData.reward;


        const reward =
          Number(
            rawReward
          );


        if (
          rawReward === null ||
          rawReward === undefined ||
          rawReward === "" ||
          !Number.isFinite(reward) ||
          reward <= 0
        ) {

          console.error(
            "❌ INVALID TASK REWARD:",
            {

              taskId,

              taskData
            }
          );


          throw new Error(
            "Invalid task reward."
          );
        }


        claimedReward =
          reward;


        claimedTaskTitle =
          String(
            taskData.title ??
            taskData.name ??
            "Daily Task"
          ).trim();


        /* ------------------------------------------------
           TASK NUMBER
        ------------------------------------------------ */

        claimedTaskNumber =
          Number(
            task.taskNumber ??
            taskData.taskNumber ??
            taskData.order ??
            0
          );


        if (
          !Number.isFinite(
            claimedTaskNumber
          )
        ) {

          claimedTaskNumber =
            0;
        }


        /* ------------------------------------------------
           USER DATA
        ------------------------------------------------ */

        const userData =
          userSnap.data() || {};


        const balance =
          Number(
            userData.totalBalance ?? 0
          );


        if (
          !Number.isFinite(balance)
        ) {

          throw new Error(
            "Invalid wallet balance."
          );
        }


        /* ------------------------------------------------
           NEW CLAIM
        ------------------------------------------------ */

        transaction.set(
          claimRef,
          {

            userId:
              userId,

            taskId:
              taskId,

            taskTitle:
              claimedTaskTitle,

            taskNumber:
              claimedTaskNumber,

            reward:
              reward,

            date:
              today,

            claimDate:
              today,

            claimedAt:
              serverTimestamp(),

            createdAt:
              serverTimestamp()
          }
        );


        /* ------------------------------------------------
           ATOMIC DAILY COUNTER
        ------------------------------------------------ */

        transaction.set(
          dailyStatsRef,
          {

            date:
              today,

            claimedCount:
              transactionClaimCount + 1,

            lastTaskId:
              taskId,

            lastClaimAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          },

          {
            merge: true
          }
        );


        /* ------------------------------------------------
           UPDATE USER BALANCE
           
           ONLY:
           totalBalance
           
           NEVER:
           totalRecharge
           vipLevel
           taskLimit
        ------------------------------------------------ */

        transaction.update(
          userRef,
          {

            totalBalance:
              balance + reward,

            lastTaskClaimId:
              claimId,

            updatedAt:
              serverTimestamp()
          }
        );
      }
    );


    /* ===================================================
       SUCCESS
    =================================================== */

    if (button) {

      button.disabled =
        true;

      button.textContent =
        "✓ Completed";
    }


    if (messageElement) {

      messageElement.style.color =
        "green";

      messageElement.textContent =
        `Reward claimed: ETB ${money(claimedReward)}`;
    }


    updateTaskAfterSuccessfulClaim(
      taskId
    );


    /* ===================================================
       UPDATE USER UI
    =================================================== */

    if (
      typeof updateUserUI ===
      "function"
    ) {

      try {

        await updateUserUI();

      } catch (uiError) {

        console.warn(
          "⚠️ User UI update warning:",
          uiError
        );
      }
    }


  } catch (error) {

    console.error(
      "❌ CLAIM TASK ERROR:",
      error?.code,
      error?.message,
      error
    );


    let userMessage =
      error?.message ||
      "Error claiming task.";


    /* ---------------------------------------------------
       PERMISSION
    --------------------------------------------------- */

    if (
      error?.code ===
      "permission-denied"
    ) {

      userMessage =
        "Missing or insufficient permissions. Firestore Rules keessatti task claim, daily stats fi balance update hayyamamuu qaba.";
    }


    /* ---------------------------------------------------
       FAILED PRECONDITION
    --------------------------------------------------- */

    if (
      error?.code ===
      "failed-precondition"
    ) {

      userMessage =
        "Firestore transaction failed. Mee Firestore Rules fi network ilaali.";
    }


    /* ---------------------------------------------------
       ABORTED
    --------------------------------------------------- */

    if (
      error?.code ===
      "aborted"
    ) {

      userMessage =
        "Transaction irra deebiin yaalame. Mee task sana ammas yaali.";
    }


    if (button) {

      button.disabled =
        false;

      button.textContent =
        "✅ Claim Reward";
    }


    if (messageElement) {

      messageElement.style.color =
        "#d9534f";

      messageElement.textContent =
        String(
          userMessage
        );
    }


    /* ---------------------------------------------------
       REFRESH CLAIM COUNT
    --------------------------------------------------- */

    try {

      const fresh =
        await getTodayTaskClaims(
          userId
        );


      window.dailyTasksMeta = {

        ...(window.dailyTasksMeta || {}),

        claimedCount:
          fresh.count
      };

    } catch (refreshError) {

      console.warn(
        "⚠️ Claim refresh error:",
        refreshError
      );
    }


    updateTaskSummary(

      window.dailyTasksMeta
        ?.claimedCount || 0,

      window.dailyTasksMeta
        ?.dailyLimit || 0,

      window.dailyTasksMeta
        ?.isSunday || false,

      window.dailyTasksMeta
        ?.noDeposit || false,

      window.dailyTasksMeta
        ?.status || {}

    );

  } finally {

    window.ccusTaskClaimLocks.delete(
      lockKey
    );
  }
}


/* =========================================================
DEBUG - CURRENT TASK LEVEL
========================================================= */

window.checkCCUSCurrentTaskLevel =
  async function () {

    try {

      if (!currentUser) {

        console.warn(
          "No current user."
        );

        return null;
      }


      const approvedTotal =
        await getApprovedRechargeTotal(
          currentUser.uid
        );


      const level =
        await getApprovedRechargeLevel(
          currentUser.uid
        );


      const levels =
        await ensureTaskRechargeLevels();


      const result = {

        approvedTotal,

        currentLevel:
          level
            ? {

                id:
                  level.id,

                level:
                  level.level,

                name:
                  level.name,

                amount:
                  level.amount,

                taskLimit:
                  level.taskLimit

              }
            : null,

        currentAdminLevels:
          levels.map(
            item => ({

              id:
                item.id,

              level:
                item.level,

              name:
                item.name,

              amount:
                item.amount,

              taskLimit:
                item.taskLimit,

              active:
                item.active

            })
          )
      };


      console.table(
        result.currentAdminLevels
      );


      console.log(
        "CCUS CURRENT TASK LEVEL:",
        result
      );


      return result;

    } catch (error) {

      console.error(
        "❌ Current level error:",
        error
      );

      return null;
    }
  };


/* =========================================================
DEBUG - TODAY CLAIMS
========================================================= */

window.checkCCUSTodayClaims =
  async function () {

    try {

      if (!currentUser) {

        console.warn(
          "No current user."
        );

        return null;
      }


      const today =
        getLocalDateString();


      const claimsRef =
        collection(
          db,
          "users",
          currentUser.uid,
          "taskClaims"
        );


      const claimsMap =
        new Map();


      /* ---------------------------------------------------
         DATE
      --------------------------------------------------- */

      try {

        const snap =
          await getDocs(
            query(
              claimsRef,

              where(
                "date",
                "==",
                today
              )
            )
          );


        snap.docs.forEach(
          item => {

            claimsMap.set(
              item.id,
              item
            );
          }
        );

      } catch (error) {

        console.warn(
          "⚠️ Debug date query warning:",
          error
        );
      }


      /* ---------------------------------------------------
         CLAIM DATE
      --------------------------------------------------- */

      try {

        const snap =
          await getDocs(
            query(
              claimsRef,

              where(
                "claimDate",
                "==",
                today
              )
            )
          );


        snap.docs.forEach(
          item => {

            claimsMap.set(
              item.id,
              item
            );
          }
        );

      } catch (error) {

        console.warn(
          "⚠️ Debug claimDate query warning:",
          error
        );
      }


      const claims =
        Array.from(
          claimsMap.values()
        ).map(
          item => {

            const data =
              item.data() || {};


            return {

              id:
                item.id,

              taskId:
                data.taskId ??
                null,

              taskTitle:
                data.taskTitle ??
                null,

              taskNumber:
                data.taskNumber ??
                null,

              reward:
                Number(
                  data.reward ?? 0
                ),

              date:
                data.date ??
                data.claimDate ??
                null
            };
          }
        );


      const result = {

        date:
          today,

        claimedCount:
          claims.length,

        claims
      };


      console.table(
        claims
      );


      console.log(
        "CCUS TODAY CLAIMS:",
        result
      );


      return result;

    } catch (error) {

      console.error(
        "❌ Today's claims debug error:",
        error
      );

      return null;
    }
  };


/* =========================================================
DEBUG - USER TASK INFORMATION
========================================================= */

window.checkCCUSUserTaskInfo =
  async function () {

    try {

      if (!currentUser) {

        console.warn(
          "No current user."
        );

        return null;
      }


      const userSnap =
        await getDoc(
          doc(
            db,
            "users",
            currentUser.uid
          )
        );


      if (
        !userSnap.exists()
      ) {

        console.warn(
          "User document does not exist."
        );

        return null;
      }


      const data =
        userSnap.data() || {};


      const level =
        await getApprovedRechargeLevel(
          currentUser.uid
        );


      const result = {

        uid:
          currentUser.uid,

        totalRecharge:
          Number(
            data.totalRecharge ?? 0
          ),

        totalBalance:
          Number(
            data.totalBalance ?? 0
          ),

        storedTaskLimit:
          Number(
            data.taskLimit ?? 0
          ),

        calculatedApprovedTotal:
          Number(
            level?.approvedTotal ?? 0
          ),

        calculatedLevel:
          level?.name ??
          level?.level ??
          null,

        calculatedLevelAmount:
          Number(
            level?.amount ?? 0
          ),

        calculatedTaskLimit:
          Number(
            level?.taskLimit ?? 0
          )
      };


      console.log(
        "CCUS USER TASK INFORMATION:",
        result
      );


      return result;

    } catch (error) {

      console.error(
        "❌ User task info error:",
        error
      );

      return null;
    }
  };


/* =========================================================
DEBUG - TODAY ATOMIC TASK STATS
========================================================= */

window.checkCCUSTodayTaskStats =
  async function () {

    try {

      if (!currentUser) {

        console.warn(
          "No current user."
        );

        return null;
      }


      const today =
        getLocalDateString();


      const statsRef =
        doc(
          db,
          "users",
          currentUser.uid,
          "taskDailyStats",
          today
        );


      const snap =
        await getDoc(
          statsRef
        );


      const result =
        snap.exists()
          ? {

              exists:
                true,

              id:
                snap.id,

              ...(
                snap.data() || {}
              )
            }

          : {

              exists:
                false,

              id:
                today,

              claimedCount:
                0
            };


      console.log(
        "CCUS TODAY TASK STATS:",
        result
      );


      return result;

    } catch (error) {

      console.error(
        "❌ Today task stats error:",
        error
      );

      return null;
    }
  };


/* =========================================================
FORCE REFRESH
========================================================= */

window.refreshCCUSDailyTasks =
  async function () {

    window.dailyTasksLoaded =
      false;


    window.dailyTasksCache =
      [];


    window.dailyTasksMeta = {

      dailyLimit: 0,

      isSunday: false,

      noDeposit: false,

      status: {},

      claimedCount: 0,

      approvedTotal: 0,

      currentLevel: null
    };


    return await loadDailyTasks({
      force: true
    });
  };


/* =========================================================
OPTIONAL GLOBAL TEST
========================================================= */

window.testCCUSTaskSystem =
  async function () {

    console.log(
      "========== CCUS TASK TEST =========="
    );


    const level =
      await window.checkCCUSCurrentTaskLevel();


    const claims =
      await window.checkCCUSTodayClaims();


    const user =
      await window.checkCCUSUserTaskInfo();


    const stats =
      await window.checkCCUSTodayTaskStats();


    console.log(
      "LEVEL:",
      level
    );


    console.log(
      "CLAIMS:",
      claims
    );


    console.log(
      "USER:",
      user
    );


    console.log(
      "TODAY STATS:",
      stats
    );


    console.log(
      "========== END TEST =========="
    );


    return {

      level,

      claims,

      user,

      stats
    };
  };


/* =========================================================
END CCUS DAILY TASK SYSTEM
========================================================= */ 

/* =========================================================
   CCUS USER APP
   ANNOUNCEMENTS + REFERRAL / TEAM + ADMIN NAVIGATION
   FINAL CORRECTED SECTION
========================================================= */

/* Safe Helper Utilities Fallbacks */
const safeGetTime = (val) => {
  if (typeof getTime === "function") return getTime(val);
  if (!val) return 0;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (val instanceof Date) return val.getTime();
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

const safeEscapeHtml = (str) => {
  if (typeof escapeHtml === "function") return escapeHtml(str);
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const safeMoney = (val) => {
  if (typeof money === "function") return money(val);
  const num = Number(val) || 0;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const SAFE_INITIALIZED_KEY =
  typeof INITIALIZED_KEY !== "undefined" ? INITIALIZED_KEY : "ccus_notif_initialized";


/* =========================================================
   ANNOUNCEMENTS
========================================================= */

const ccusNotifButtonIds = [
  "notificationButton",
  "notificationBtn",
  "notificationsButton",
  "announcementNotification",
  "announcementNotificationButton",
  "homeNotificationButton"
];

let ccusNotifAnnouncements = [];
let ccusNotifListener = null;
let ccusNotifToastTimer = null;


/* =========================================================
   BADGE
========================================================= */

function ccusNotifGetUnreadCount() {
  try {
    if (typeof getAnnouncementUnreadCount === "function") {
      return Number(getAnnouncementUnreadCount()) || 0;
    }
  } catch (error) {
    console.warn("getAnnouncementUnreadCount error:", error);
  }
  return 0;
}

function ccusNotifUpdateBadge() {
  const count = ccusNotifGetUnreadCount();
  const text = count > 99 ? "99+" : String(count);
  const display = count > 0 ? "flex" : "none";

  ccusNotifButtonIds.forEach((id) => {
    const button = typeof $ === "function" ? $(id) : document.getElementById(id);
    if (!button) return;

    if (window.getComputedStyle(button).position === "static") {
      button.style.position = "relative";
    }

    let badge = button.querySelector(".announcement-notification-badge");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "announcement-notification-badge";
      badge.style.cssText = [
        "position:absolute",
        "top:-5px",
        "right:-5px",
        "min-width:20px",
        "height:20px",
        "padding:0 5px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "box-sizing:border-box",
        "border-radius:999px",
        "background:#e53935",
        "color:#fff",
        "border:2px solid #fff",
        "font-size:10px",
        "font-weight:800",
        "line-height:1",
        "z-index:100",
        "pointer-events:none"
      ].join(";");

      button.appendChild(badge);
    }

    badge.textContent = text;
    badge.style.display = display;
  });

  ["announcementUnreadCount", "notificationCount"].forEach((id) => {
    const element = typeof $ === "function" ? $(id) : document.getElementById(id);
    if (!element) return;

    element.textContent = text;
    element.style.display = display;
  });
}


/* =========================================================
   MARK ANNOUNCEMENT READ
========================================================= */

function ccusNotifMarkRead(id) {
  const sid = String(id || "").trim();
  if (!sid) return;

  let seen = [];
  try {
    seen = typeof getSeenIds === "function" ? getSeenIds() : [];
  } catch {
    seen = [];
  }

  if (seen.includes(sid)) {
    return;
  }

  seen.push(sid);

  if (typeof saveSeenIds === "function") {
    saveSeenIds(seen);
  }

  let current = 0;
  try {
    current =
      typeof getAnnouncementUnreadCount === "function"
        ? Number(getAnnouncementUnreadCount()) || 0
        : 0;
  } catch {
    current = 0;
  }

  if (typeof setAnnouncementUnreadCount === "function") {
    setAnnouncementUnreadCount(Math.max(0, current - 1));
  }

  ccusNotifUpdateBadge();
}


/* =========================================================
   MARK ALL ANNOUNCEMENTS READ
========================================================= */

function ccusNotifMarkAllRead(announcements = []) {
  const list = Array.isArray(announcements) ? announcements : [];
  const ids = list.map((item) => String(item?.id || "").trim()).filter(Boolean);

  let existing = [];
  try {
    existing = typeof getSeenIds === "function" ? getSeenIds() : [];
  } catch {
    existing = [];
  }

  const merged = [...new Set([...existing, ...ids])];

  if (typeof saveSeenIds === "function") {
    saveSeenIds(merged);
  }

  if (typeof setAnnouncementUnreadCount === "function") {
    setAnnouncementUnreadCount(0);
  }

  ccusNotifUpdateBadge();
}


/* =========================================================
   ANNOUNCEMENT BUTTONS
========================================================= */

function ccusNotifSetupButtons() {
  ccusNotifButtonIds.forEach((id) => {
    const button = typeof $ === "function" ? $(id) : document.getElementById(id);

    if (!button || button.dataset.ccusNotifBound === "true") {
      return;
    }

    button.dataset.ccusNotifBound = "true";

    button.addEventListener("click", (event) => {
      if (typeof window.openPage === "function") {
        event.preventDefault();
        window.openPage("announcements");
      }
    });
  });

  ccusNotifUpdateBadge();
}


/* =========================================================
   ANNOUNCEMENT LISTENER
========================================================= */

function ccusNotifLoadAnnouncements(markRead = false) {
  ccusNotifStopListener();
  ccusNotifSetupButtons();

  const _db = typeof db !== "undefined" ? db : window.db;
  const _query = typeof query !== "undefined" ? query : window.query;
  const _collection = typeof collection !== "undefined" ? collection : window.collection;
  const _where = typeof where !== "undefined" ? where : window.where;
  const _onSnapshot = typeof onSnapshot !== "undefined" ? onSnapshot : window.onSnapshot;

  if (!_db || !_query || !_collection || !_where || !_onSnapshot) {
    console.error("Firestore instance or required query functions are not globally available.");
    return;
  }

  try {
    const announcementQuery = _query(
      _collection(_db, "message"),
      _where("active", "==", true)
    );

    ccusNotifListener = _onSnapshot(
      announcementQuery,
      (snapshot) => {
        const list = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (data.active === true) {
            list.push({
              id: docSnap.id,
              ...data
            });
          }
        });

        /* Latest announcement first */
        list.sort(
          (a, b) =>
            safeGetTime(b.createdAt || b.created) -
            safeGetTime(a.createdAt || a.created)
        );

        ccusNotifAnnouncements = list;

        let initialized = false;
        try {
          initialized = localStorage.getItem(SAFE_INITIALIZED_KEY) === "true";
        } catch {
          initialized = false;
        }

        if (!initialized) {
          ccusNotifMarkAllRead(list);
          try {
            localStorage.setItem(SAFE_INITIALIZED_KEY, "true");
          } catch {}
        } else if (markRead) {
          ccusNotifMarkAllRead(list);
          markRead = false;
        } else {
          let seen = [];
          try {
            seen = typeof getSeenIds === "function" ? getSeenIds() : [];
          } catch {
            seen = [];
          }

          const seenSet = new Set(seen.map(String));
          const unread = list.filter((item) => !seenSet.has(String(item.id))).length;

          if (typeof setAnnouncementUnreadCount === "function") {
            setAnnouncementUnreadCount(unread);
          }
        }

        ccusNotifRenderHomeAnnouncement(list);

        const container =
          typeof $ === "function"
            ? $("announcementContainer") || $("announcementList")
            : document.getElementById("announcementContainer") ||
              document.getElementById("announcementList");

        if (container) {
          ccusNotifRenderAnnouncements(list, container);
        }

        ccusNotifUpdateBadge();
      },
      (error) => {
        console.error("Announcement listener error:", error);
      }
    );
  } catch (error) {
    console.error("Announcement listener start error:", error);
  }
}

/* =========================================================
   STOP ANNOUNCEMENT LISTENER
========================================================= */

function ccusNotifStopListener() {
  if (typeof ccusNotifListener === "function") {
    try {
      ccusNotifListener();
    } catch (error) {
      console.warn("Announcement listener cleanup error:", error);
    }
  }

  ccusNotifListener = null;

  if (ccusNotifToastTimer) {
    clearTimeout(ccusNotifToastTimer);
    ccusNotifToastTimer = null;
  }
}


/* =========================================================
   HOME ANNOUNCEMENT
========================================================= */

function ccusNotifRenderHomeAnnouncement(announcements = []) {
  const element =
    typeof $ === "function"
      ? $("homeAnnouncement")
      : document.getElementById("homeAnnouncement");

  if (!element) return;

  if (!announcements.length) {
    element.textContent = "No announcements.";
    element.style.cursor = "default";
    element.onclick = null;
    return;
  }

  const latest = announcements[0];

  element.textContent = latest.message || latest.title || "Announcement";
  element.style.cursor = "pointer";

  element.onclick = (event) => {
    event?.preventDefault?.();

    ccusNotifMarkRead(latest.id);

    ccusNotifShowModal(
      latest.message || latest.title || "",
      latest.important === true,
      latest.title || "Announcement"
    );
  };
}


/* =========================================================
   ANNOUNCEMENT LIST
========================================================= */

function ccusNotifRenderAnnouncements(announcements = [], container) {
  if (!container) return;

  if (!announcements.length) {
    container.innerHTML = `
      <div style="padding:30px 20px; text-align:center;">
        <div style="font-size:42px; margin-bottom:10px;">📢</div>
        <p style="margin:0; color:#777;">No announcements.</p>
      </div>
    `;
    return;
  }

  let seen = [];
  try {
    seen = typeof getSeenIds === "function" ? getSeenIds() : [];
  } catch {
    seen = [];
  }

  const seenSet = new Set(seen.map(String));

  container.innerHTML = announcements
    .map((item) => {
      const id = String(item.id || "");
      const unread = !seenSet.has(id);
      const icon = item.important === true ? "⚠️" : "📢";
      const iconBackground =
        item.important === true ? "rgba(211,47,47,.10)" : "rgba(240,165,0,.12)";

      return `
        <button
          type="button"
          class="announcement-card"
          data-id="${safeEscapeHtml(id)}"
          style="
            width:100%;
            display:flex;
            align-items:flex-start;
            gap:12px;
            position:relative;
            box-sizing:border-box;
            text-align:left;
            cursor:pointer;
            border:0;
            background:transparent;
            padding:15px;
            border-radius:16px;
            margin-bottom:10px;
          "
        >
          ${
            unread
              ? `
                <span
                  class="announcement-new-badge"
                  style="
                    position:absolute;
                    top:9px;
                    right:9px;
                    background:#e53935;
                    color:#fff;
                    padding:3px 8px;
                    border-radius:999px;
                    font-size:9px;
                    font-weight:800;
                    z-index:2;
                  "
                >
                  NEW
                </span>
              `
              : ""
          }

          <div
            style="
              width:42px;
              height:42px;
              min-width:42px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:50%;
              background:${iconBackground};
              font-size:21px;
            "
          >
            ${icon}
          </div>

          <div
            class="announcement-content"
            style="
              flex:1;
              min-width:0;
              padding-right:35px;
            "
          >
            <div
              style="
                font-size:15px;
                font-weight:800;
                line-height:1.35;
                word-break:break-word;
              "
            >
              ${safeEscapeHtml(item.title || "Announcement")}
            </div>

            <div
              style="
                margin-top:5px;
                color:#666;
                font-size:13px;
                line-height:1.5;
                word-break:break-word;
              "
            >
              ${safeEscapeHtml(item.message || "")}
            </div>

            ${
              item.important === true
                ? `
                  <div
                    style="
                      margin-top:7px;
                      color:#b8860b;
                      font-size:11px;
                      font-weight:800;
                    "
                  >
                    ⭐ IMPORTANT
                  </div>
                `
                : ""
            }
          </div>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".announcement-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();

      const id = String(card.dataset.id || "");
      const announcement = announcements.find((item) => String(item.id) === id);

      if (!announcement) return;

      ccusNotifMarkRead(id);
      card.querySelector(".announcement-new-badge")?.remove();

      ccusNotifShowModal(
        announcement.message || announcement.title || "",
        announcement.important === true,
        announcement.title || "Announcement"
      );
    });
  });
}


/* =========================================================
   ANNOUNCEMENT MODAL
========================================================= */

function ccusNotifShowModal(message, important = false, title = "Announcement") {
  document.getElementById("announcementModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "announcementModal";

  modal.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:20px",
    "box-sizing:border-box",
    "background:rgba(0,0,0,.65)"
  ].join(";");

  modal.innerHTML = `
    <div
      role="dialog"
      aria-modal="true"
      style="
        width:100%;
        max-width:500px;
        max-height:80vh;
        overflow:auto;
        box-sizing:border-box;
        background:#fff;
        border-radius:18px;
        padding:22px;
        box-shadow:0 15px 50px rgba(0,0,0,.3);
      "
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          margin-bottom:18px;
        "
      >
        <h3
          style="
            margin:0;
            flex:1;
            font-size:19px;
            line-height:1.4;
            word-break:break-word;
            color:#222;
          "
        >
          ${safeEscapeHtml(title)}
        </h3>

        ${
          important
            ? `
              <span
                style="
                  color:#b8860b;
                  font-size:10px;
                  font-weight:800;
                  white-space:nowrap;
                "
              >
                ⭐ IMPORTANT
              </span>
            `
            : ""
        }
      </div>

      <div
        style="
          white-space:pre-wrap;
          line-height:1.7;
          color:#333;
          word-break:break-word;
          font-size:14px;
        "
      >
        ${safeEscapeHtml(message)}
      </div>

      <button
        id="announcementCloseButton"
        type="button"
        style="
          width:100%;
          margin-top:22px;
          padding:13px;
          border:0;
          border-radius:12px;
          background:#f0a500;
          color:#fff;
          font-weight:700;
          font-size:14px;
          cursor:pointer;
        "
      >
        Close
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();

  modal.querySelector("#announcementCloseButton")?.addEventListener("click", close);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      close();
    }
  });
}


/* =========================================================
   REFERRAL / TEAM
========================================================= */

function normalizeTeamDepositLevel(level = {}) {
  const amount = Number(
    level.amount ?? level.depositAmount ?? level.price ?? 0
  );

  const commission = Number(
    level.commission ?? level.referralCommission ?? level.teamCommission ?? 0
  );

  const taskLimit = Number(level.taskLimit ?? 0);
  const rawDisplayName = level.displayName ?? level.name ?? "";
  const displayName = String(rawDisplayName).trim();
  const levelNumber = Number(level.level ?? 0);

  let nameText = displayName;

  if (!nameText && levelNumber) {
    nameText = `Level ${levelNumber}`;
  }

  if (!nameText && amount > 0) {
    nameText = `ETB ${safeMoney(amount)}`;
  }

  if (!nameText) {
    nameText = "Deposit Level";
  }

  return {
    id: String(level.id || ""),
    name: nameText,
    displayName: nameText,
    amount,
    commission,
    taskLimit,
    level: levelNumber,
    order: Number(level.order ?? level.level ?? 9999),
    active: level.active !== false
  };
}


/* =========================================================
   LOAD REFERRAL
========================================================= */

async function loadReferral() {
  const _currentUser = typeof currentUser !== "undefined" ? currentUser : window.currentUser;
  const _currentUserData = typeof currentUserData !== "undefined" ? currentUserData : window.currentUserData;

  if (!_currentUser) {
    return;
  }

  try {
    const referralElement =
      typeof $ === "function"
        ? $("referralCodeDisplay")
        : document.getElementById("referralCodeDisplay");

    if (referralElement) {
      referralElement.textContent = _currentUserData?.referralCode || "";
    }

    let levels = typeof rechargeLevels !== "undefined" && Array.isArray(rechargeLevels)
      ? rechargeLevels
      : window.rechargeLevels || [];

    if (!levels.length) {
      const _db = typeof db !== "undefined" ? db : window.db;
      const _collection = typeof collection !== "undefined" ? collection : window.collection;
      const _getDocs = typeof getDocs !== "undefined" ? getDocs : window.getDocs;

      if (_db && _collection && _getDocs) {
        const snapshot = await _getDocs(_collection(_db, "rechargeLevels"));
        levels = [];
        snapshot.forEach((docSnap) => {
          levels.push(
            normalizeTeamDepositLevel({
              id: docSnap.id,
              ...docSnap.data()
            })
          );
        });
        window.rechargeLevels = levels;
      }
    }

    levels = levels
      .map(normalizeTeamDepositLevel)
      .filter((level) => level.amount > 0 && level.active !== false)
      .sort((a, b) => a.order - b.order || a.amount - b.amount);

    renderTeamDepositLevels(levels);
  } catch (error) {
    console.error("Referral loading error:", error);
    renderTeamDepositLevels([]);
  }

  loadTeamCommissionHistory();
}


/* =========================================================
   TEAM DEPOSIT LEVELS
========================================================= */

function renderTeamDepositLevels(levels = []) {
  const container =
    typeof $ === "function"
      ? $("teamDepositLevels")
      : document.getElementById("teamDepositLevels");

  if (!container) return;

  const validLevels = Array.isArray(levels)
    ? levels
        .map(normalizeTeamDepositLevel)
        .filter((level) => level.amount > 0 && level.active !== false)
    : [];

  if (!validLevels.length) {
    container.innerHTML = `
      <div class="empty-transactions" style="text-align:center; padding:20px;">
        <h3>No Deposit Levels Available</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = validLevels
    .map(
      (level, index) => `
        <div
          class="team-deposit-level-card"
          style="
            margin-bottom:12px;
            padding:15px;
            border:1px solid #e5e5e5;
            border-radius:12px;
            background:#fff;
          "
        >
          <div
            style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              margin-bottom:12px;
              gap:10px;
            "
          >
            <div style="display:flex; align-items:center; gap:10px;">
              <div
                style="
                  min-width:42px;
                  height:42px;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  border-radius:50%;
                  background:#fff3cd;
                  color:#856404;
                  font-weight:800;
                "
              >
                L${index + 1}
              </div>

              <div>
                <div style="font-weight:700; font-size:15px;">
                  ${safeEscapeHtml(level.displayName)}
                </div>
                <div style="font-size:12px; color:#777;">
                  Team Deposit Level
                </div>
              </div>
            </div>

            <span
              style="
                font-size:11px;
                color:#198754;
                background:#e8f7ee;
                padding:4px 8px;
                border-radius:12px;
              "
            >
              Active
            </span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div style="padding:10px; border-radius:8px; background:#f8f8f8;">
              <div style="font-size:11px; color:#777;">Required Deposit</div>
              <strong>ETB ${safeMoney(level.amount)}</strong>
            </div>

            <div style="padding:10px; border-radius:8px; background:#f8f8f8;">
              <div style="font-size:11px; color:#777;">Referral Commission</div>
              <strong style="color:#198754;">
                ETB ${safeMoney(level.commission)}
              </strong>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}


/* =========================================================
   TEAM COMMISSION HISTORY
========================================================= */

function loadTeamCommissionHistory() {
  const container =
    typeof $ === "function"
      ? $("teamCommissionHistory")
      : document.getElementById("teamCommissionHistory");

  const _currentUser = typeof currentUser !== "undefined" ? currentUser : window.currentUser;

  if (!container || !_currentUser) {
    return;
  }

  if (typeof stopListener === "function") {
    try {
      stopListener("teamCommissions");
    } catch {}
  }

  if (typeof unsubs !== "undefined" && typeof unsubs.teamCommissions === "function") {
    try {
      unsubs.teamCommissions();
    } catch {}
    unsubs.teamCommissions = null;
  }

  const _db = typeof db !== "undefined" ? db : window.db;
  const _query = typeof query !== "undefined" ? query : window.query;
  const _collection = typeof collection !== "undefined" ? collection : window.collection;
  const _where = typeof where !== "undefined" ? where : window.where;
  const _onSnapshot = typeof onSnapshot !== "undefined" ? onSnapshot : window.onSnapshot;

  if (!_db || !_query || !_collection || !_where || !_onSnapshot) {
    console.error("Firestore queries not available for team commission history.");
    return;
  }

  try {
    const commissionQuery = _query(
      _collection(_db, "teamCommissions"),
      _where("referrerId", "==", _currentUser.uid)
    );

    const unsubscribe = _onSnapshot(
      commissionQuery,
      (snapshot) => {
        const records = [];

        snapshot.forEach((docSnap) => {
          records.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });

        records.sort((a, b) => safeGetTime(b.createdAt) - safeGetTime(a.createdAt));

        renderTeamCommissionHistory(records);
      },
      (error) => {
        console.error("Team commission history error:", error);
        container.innerHTML = `
          <div class="empty-transactions" style="text-align:center; padding:20px;">
            <h3>Unable to load commission history</h3>
          </div>
        `;
      }
    );

    if (typeof unsubs !== "undefined") {
      unsubs.teamCommissions = unsubscribe;
    }
  } catch (error) {
    console.error("Team commission listener error:", error);
    container.innerHTML = `
      <div class="empty-transactions" style="text-align:center; padding:20px;">
        <h3>Unable to load commission history</h3>
      </div>
    `;
  }
}


/* =========================================================
   RENDER TEAM COMMISSION HISTORY
========================================================= */

function renderTeamCommissionHistory(records = []) {
  const container =
    typeof $ === "function"
      ? $("teamCommissionHistory")
      : document.getElementById("teamCommissionHistory");

  if (!container) return;

  if (!records.length) {
    container.innerHTML = `
      <div class="empty-transactions" style="text-align:center; padding:20px;">
        <div style="font-size:32px; margin-bottom:8px;">👥</div>
        <h3>No Commission Yet</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = records
    .map((record) => {
      const status = String(record.status || "approved")
        .toLowerCase()
        .trim();

      const commissionAmount = Number(
        record.commissionAmount ?? record.commission ?? 0
      );

      const depositLevel = String(
        record.depositLevel ?? record.levelName ?? record.level ?? "Deposit Level"
      );

      const referredUserName = String(
        record.referredUserName ?? record.referredName ?? "Team Member"
      );

      return `
        <div
          class="history-item ${safeEscapeHtml(status)}"
          style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            padding:13px 0;
            border-bottom:1px solid #eee;
          "
        >
          <div class="history-info">
            <strong>${safeEscapeHtml(depositLevel)}</strong>
            <span style="display:block; margin-top:4px; color:#555; font-size:13px;">
              Member: ${safeEscapeHtml(referredUserName)}
            </span>
          </div>

          <div class="history-right" style="text-align:right;">
            <strong style="color:#198754;">
              + ETB ${safeMoney(commissionAmount)}
            </strong>
            <span
              class="history-status ${safeEscapeHtml(status)}"
              style="display:block; margin-top:5px; font-size:11px;"
            >
              ${typeof getStatusIcon === "function" ? getStatusIcon(status) : ""}
              ${safeEscapeHtml(status)}
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   COPY REFERRAL CODE
========================================================= */

window.copyReferralCode = async function () {
  const _currentUserData = typeof currentUserData !== "undefined" ? currentUserData : window.currentUserData;
  const code = _currentUserData?.referralCode;

  if (!code) {
    alert("Referral Code not found.");
    return;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(code);
      alert("Referral Code copied successfully!");
    } else {
      alert("Referral Code: " + code);
    }
  } catch (error) {
    console.error("Copy referral code error:", error);
    alert("Referral Code: " + code);
  }
};


/* =========================================================
   ADMIN NAVIGATION
========================================================= */

function adminNavigate(page = "dashboard") {
  if (!page) {
    page = "dashboard";
  }

  document.querySelectorAll(".admin-page-content").forEach((section) => {
    section.classList.add("hidden");
  });

  const pageMap = {
    dashboard: "adminDashboardPage",
    recharge: "adminRechargeSection",
    withdraw: "adminWithdrawSection",
    vip: "adminVIPLevelsSection",
    rechargeLevels: "adminRechargeLevelsSection",
    withdrawLevels: "adminWithdrawLevelsSection",
    paymentMethods: "adminPaymentMethodsSection",
    users: "adminUsersSection",
    rewards: "adminRewardsSection",
    tasks: "adminTasksSection",
    announcements: "adminAnnouncementsSection",
    calendar: "adminCalendarSection",
    incomeLevels: "adminIncomeLevelsSection"
  };

  const targetId = pageMap[page];

  if (!targetId) {
    console.warn("Unknown admin page:", page);
    return;
  }

  const target = document.getElementById(targetId);

  if (!target) {
    console.warn("Admin section not found:", targetId);
    return;
  }

  target.classList.remove("hidden");
}


/* =========================================================
   GLOBAL EXPORTS & BINDINGS
========================================================= */

window.adminNavigate = adminNavigate;

Object.assign(window, {
  loadUserData: typeof updateUserUI === "function" ? updateUserUI : undefined,
  startUserListener: typeof startUserListener === "function" ? startUserListener : undefined,
  updateUserUI: typeof updateUserUI === "function" ? updateUserUI : undefined,
  cleanupListeners: typeof cleanupListeners === "function" ? cleanupListeners : undefined,
  loadDailyTasks: typeof loadDailyTasks === "function" ? loadDailyTasks : undefined,
  loadVIPLevels: typeof loadVIPLevels === "function" ? loadVIPLevels : undefined,
  loadIncomeLevels: typeof loadIncomeLevels === "function" ? loadIncomeLevels : undefined,
  loadRechargeLevels: typeof loadRechargeLevels === "function" ? loadRechargeLevels : undefined,
  loadWithdrawLevels: typeof loadWithdrawLevels === "function" ? loadWithdrawLevels : undefined,
  loadRechargeHistory: typeof loadRechargeHistory === "function" ? loadRechargeHistory : undefined,
  loadWithdrawHistory: typeof loadWithdrawHistory === "function" ? loadWithdrawHistory : undefined,
  loadProfile: typeof updateUserUI === "function" ? updateUserUI : undefined,
  loadReferral,
  renderTeamDepositLevels,
  loadTeamCommissionHistory,
  loadAnnouncements: ccusNotifLoadAnnouncements,
  getTodayOperatingStatus: typeof getTodayOperatingStatus === "function" ? getTodayOperatingStatus : undefined,
  loadPersonalInformation: typeof loadPersonalInformation === "function" ? loadPersonalInformation : undefined,
  savePersonalInformation: typeof window.savePersonalInformation === "function" ? window.savePersonalInformation : undefined,
  updateAnnouncementNotificationCount: ccusNotifUpdateBadge,
  markAllAnnouncementsAsRead: ccusNotifMarkAllRead,
  setupAnnouncementNotificationButtons: ccusNotifSetupButtons,
  adminNavigate
});


/* =========================================================
   ANNOUNCEMENT UNSUBSCRIBE COMPATIBILITY
========================================================= */

Object.defineProperty(window, "ccusAnnouncementUnsubscribe", {
  configurable: true,
  get: () => ccusNotifListener,
  set: (value) => {
    if (typeof value === "function") {
      if (typeof ccusNotifListener === "function") {
        try {
          ccusNotifListener();
        } catch {}
      }
      ccusNotifListener = value;
    }
  }
});


/* =========================================================
   ANNOUNCEMENT GLOBAL COMPATIBILITY
========================================================= */

window.loadAnnouncements = ccusNotifLoadAnnouncements;


/* =========================================================
   DOM READY
========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    ccusNotifSetupButtons();
    ccusNotifUpdateBadge();
  });
} else {
  ccusNotifSetupButtons();
  ccusNotifUpdateBadge();
}

console.log("CCUS User App initialized successfully.");
