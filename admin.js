/* =========================================================
   CCUS - admin.js
   COMPLETE STABLE ADMIN PANEL
   Firebase JS SDK 10.8.0
========================================================= */


/* =========================================================
   FIREBASE IMPORTS
========================================================= */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp
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
  measurementId: "G-CP5GQ4M96N"
};


/* =========================================================
   FIREBASE INITIALIZATION
========================================================= */

const app =
  initializeApp(firebaseConfig);

const auth =
  getAuth(app);

const db =
  getFirestore(app);


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentAdmin = null;

let unsubscribes = [];

let incomeLevelsCache = [];


/* =========================================================
   DOM HELPER
========================================================= */

const $ = id =>
  document.getElementById(id);


/* =========================================================
   MULTI-ID HELPER
========================================================= */

function getElementByIds(...ids) {

  for (const id of ids) {

    const element =
      $(id);

    if (element) {
      return element;
    }
  }

  return null;
}


/* =========================================================
   SAFE NUMBER
========================================================= */

function safeNumber(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}
/* =========================================================
   MONEY
========================================================= */

function money(value) {

  return safeNumber(value)
    .toFixed(2);
}


function formatAdminMoney(value) {

  return safeNumber(value)
    .toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   TIMESTAMP HELPER
========================================================= */

function getMillis(value) {

  if (!value) {
    return 0;
  }

  if (
    typeof value.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  if (
    typeof value === "number"
  ) {
    return value;
  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


/* =========================================================
   DATE FORMAT
========================================================= */

function formatDate(value) {

  const millis =
    getMillis(value);

  if (!millis) {
    return "—";
  }

  try {

    return new Intl.DateTimeFormat(
      "en-GB",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    ).format(
      new Date(millis)
    );

  } catch {

    return new Date(millis)
      .toLocaleString();
  }
}


/* =========================================================
   CLEAR INPUTS
========================================================= */

function clearInputs(...ids) {

  ids.forEach(id => {

    const element =
      $(id);

    if (!element) {
      return;
    }

    if (
      element.type ===
      "checkbox"
    ) {
      element.checked = false;
    } else {
      element.value = "";
    }
  });
}


/* =========================================================
   SHOW MESSAGE
========================================================= */

function showMessage(
  elementId,
  message,
  type = "info"
) {

  const element =
    $(elementId);

  if (!element) {
    console.warn(
      "Message element not found:",
      elementId,
      message
    );
    return;
  }

  element.textContent =
    message;

  element.className =
    `admin-message ${type}`;

  element.hidden = false;

  return element;
}


/* =========================================================
   SET TEXT
========================================================= */

function setElementText(
  id,
  value
) {

  const element =
    $(id);

  if (element) {
    element.textContent =
      value ?? "";
  }
}


/* =========================================================
   LOADING HTML
========================================================= */

function loadingHTML(
  icon = "⏳",
  message = "Loading..."
) {

  return `
    <div class="admin-loading">
      <div class="admin-loading-icon">
        ${escapeHTML(icon)}
      </div>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}


/* =========================================================
   EMPTY HTML
========================================================= */

function emptyHTML(
  icon = "📭",
  title = "No Data",
  message = ""
) {

  return `
    <div class="admin-empty">
      <div class="admin-empty-icon">
        ${escapeHTML(icon)}
      </div>

      <h3>
        ${escapeHTML(title)}
      </h3>

      ${
        message
          ? `<p>${escapeHTML(message)}</p>`
          : ""
      }
    </div>
  `;
}


/* =========================================================
   ERROR HTML
========================================================= */

function errorHTML(
  message
) {

  return `
    <div class="admin-error">
      <strong>⚠️ Error</strong>
      <p>
        ${escapeHTML(
          message ||
          "Something went wrong."
        )}
      </p>
    </div>
  `;
}


/* =========================================================
   STOP SECTION LISTENERS
========================================================= */

function stopAllListeners() {

  if (
    !Array.isArray(
      unsubscribes
    )
  ) {
    unsubscribes = [];
    return;
  }

  unsubscribes.forEach(
    unsubscribe => {

      try {

        if (
          typeof unsubscribe ===
          "function"
        ) {
          unsubscribe();
        }

      } catch (error) {

        console.warn(
          "Listener unsubscribe error:",
          error
        );
      }
    }
  );

  unsubscribes = [];
}


/* =========================================================
   ADMIN AUTHORIZATION
========================================================= */

async function requireAdmin(user) {

  if (!user) {
    return false;
  }

  try {

    const userRef =
      doc(
        db,
        "users",
        user.uid
      );

    const snap =
      await getDoc(
        userRef
      );

    if (!snap.exists()) {
      return false;
    }

    const data =
      snap.data() || {};

    return (
      data.isAdmin === true ||
      data.role === "admin"
    );

  } catch (error) {

    console.error(
      "Admin authorization error:",
      error
    );

    return false;
  }
}


/* =========================================================
   HIDE / SHOW SECTION
========================================================= */

function hideSection(element) {

  if (!element) {
    return;
  }

  element.hidden = true;

  element.classList.add(
    "hidden"
  );
}


function showSection(element) {

  if (!element) {
    return;
  }

  element.hidden = false;

  element.classList.remove(
    "hidden"
  );
}


/* =========================================================
   DYNAMIC INCOME SECTION
   ========================================================= */

function ensureAdminIncomeLevelsSection() {

  const parent =
    $("adminDashboardPage") ||
    document.body;

  let section =
    $("adminIncomeLevelsSection");

  /* -------------------------------------------------------
     CREATE SECTION ONLY IF IT DOES NOT EXIST
  ------------------------------------------------------- */

  if (!section) {

    section =
      document.createElement("section");

    section.id =
      "adminIncomeLevelsSection";

    section.className =
      "admin-section admin-page-content hidden";

    section.hidden = true;

    parent.appendChild(section);
  }

  /* -------------------------------------------------------
     CREATE CONTENT ONLY IF LIST DOES NOT EXIST
  ------------------------------------------------------- */

  if (!$("adminIncomeLevelsList")) {

    section.innerHTML = `

      <div class="admin-section-header">

        <div>

          <h2>
            📊 Income Levels
          </h2>

          <p>
            Manage price, daily,
            monthly and yearly income.
          </p>

        </div>

        <button
          type="button"
          class="admin-primary-btn"
          onclick="window.openAdminIncomeLevelForm?.()"
        >
          + Add Income Level
        </button>

      </div>

      <div
        id="adminIncomeLevelForm"
        class="hidden"
        hidden
      ></div>

      <div
        id="adminIncomeLevelsList"
        class="admin-list"
      ></div>

    `;
  }

  return section;
}


/* =========================================================
   TEAM DEPOSIT SECTION CHECK
   ========================================================= */

window.ensureAdminTeamDepositSection =
  function () {

    const section =
      $("adminTeamDepositLevelsSection");

    if (!section) {

      console.warn(
        "⚠️ adminTeamDepositLevelsSection not found in HTML."
      );

      return false;
    }

    return true;
  };


/* =========================================================
   TEAM DEPOSIT SECTION ALIASES
   ========================================================= */

window.loadTeamDepositLevels =
  function () {

    if (
      typeof loadAdminTeamDepositLevels ===
      "function"
    ) {

      return loadAdminTeamDepositLevels();

    }

    console.error(
      "❌ loadAdminTeamDepositLevels() not found."
    );

  };


window.loadGTeamDepositLevels =
  function () {

    if (
      typeof loadAdminTeamDepositLevels ===
      "function"
    ) {

      return loadAdminTeamDepositLevels();

    }

    console.error(
      "❌ loadAdminTeamDepositLevels() not found."
    );

  };


/* =========================================================
   ADMIN LOADER COMPATIBILITY
   IMPORTANT:
   admin.js IS type="module".
   Module functions are NOT automatically window.*
   ========================================================= */

function exposeAdminLoaders() {

  /* -------------------------------------------------------
     DASHBOARD
  ------------------------------------------------------- */

  if (
    typeof loadAdminDashboard ===
    "function"
  ) {

    window.loadAdminDashboard =
      loadAdminDashboard;

  }


  /* -------------------------------------------------------
     RECHARGE REQUESTS
  ------------------------------------------------------- */

  if (
    typeof loadAdminRechargeRequests ===
    "function"
  ) {

    window.loadAdminRechargeRequests =
      loadAdminRechargeRequests;

  }


  /* -------------------------------------------------------
     WITHDRAW REQUESTS
  ------------------------------------------------------- */

  if (
    typeof loadAdminWithdrawRequests ===
    "function"
  ) {

    window.loadAdminWithdrawRequests =
      loadAdminWithdrawRequests;

  }


  /* -------------------------------------------------------
     VIP LEVELS
  ------------------------------------------------------- */

  if (
    typeof loadAdminVipLevels ===
    "function"
  ) {

    window.loadAdminVipLevels =
      loadAdminVipLevels;

    window.loadVipLevels =
      loadAdminVipLevels;

  }


  /* -------------------------------------------------------
     RECHARGE LEVELS
  ------------------------------------------------------- */

  if (
    typeof loadAdminRechargeLevels ===
    "function"
  ) {

    window.loadAdminRechargeLevels =
      loadAdminRechargeLevels;

    window.loadRechargeLevels =
      loadAdminRechargeLevels;

  }


  /* -------------------------------------------------------
     WITHDRAW LEVELS
  ------------------------------------------------------- */

  if (
    typeof loadAdminWithdrawLevels ===
    "function"
  ) {

    window.loadAdminWithdrawLevels =
      loadAdminWithdrawLevels;

    window.loadWithdrawLevels =
      loadAdminWithdrawLevels;

  }


  /* -------------------------------------------------------
     TEAM DEPOSIT LEVELS
  ------------------------------------------------------- */

  if (
    typeof loadAdminTeamDepositLevels ===
    "function"
  ) {

    window.loadAdminTeamDepositLevels =
      loadAdminTeamDepositLevels;

  }


  /* -------------------------------------------------------
     PAYMENT METHODS
  ------------------------------------------------------- */

  if (
    typeof loadAdminPaymentMethods ===
    "function"
  ) {

    window.loadAdminPaymentMethods =
      loadAdminPaymentMethods;

    window.loadPaymentMethods =
      loadAdminPaymentMethods;

  }


  /* -------------------------------------------------------
     USERS
  ------------------------------------------------------- */

  if (
    typeof loadAdminUsers ===
    "function"
  ) {

    window.loadAdminUsers =
      loadAdminUsers;

    window.loadUsers =
      loadAdminUsers;

  }


  /* -------------------------------------------------------
     REWARDS
  ------------------------------------------------------- */

  if (
    typeof loadAdminRewards ===
    "function"
  ) {

    window.loadAdminRewards =
      loadAdminRewards;

  }


  /* -------------------------------------------------------
     TASKS
  ------------------------------------------------------- */

  if (
    typeof loadAdminTasks ===
    "function"
  ) {

    window.loadAdminTasks =
      loadAdminTasks;

    window.loadTasksAdmin =
      loadAdminTasks;

  }


  /* -------------------------------------------------------
     TASK SETTINGS
  ------------------------------------------------------- */

  if (
    typeof loadTaskSettings ===
    "function"
  ) {

    window.loadTaskSettings =
      loadTaskSettings;

  }


  /* -------------------------------------------------------
     ANNOUNCEMENTS
  ------------------------------------------------------- */

  if (
    typeof loadAdminAnnouncements ===
    "function"
  ) {

    window.loadAdminAnnouncements =
      loadAdminAnnouncements;

  }


  /* -------------------------------------------------------
     CALENDAR
  ------------------------------------------------------- */

  if (
    typeof loadAdminCalendar ===
    "function"
  ) {

    window.loadAdminCalendar =
      loadAdminCalendar;

  }


  /* -------------------------------------------------------
     INCOME LEVELS
  ------------------------------------------------------- */

  if (
    typeof loadAdminIncomeLevels ===
    "function"
  ) {

    window.loadAdminIncomeLevels =
      loadAdminIncomeLevels;

    window.loadIncomeLevelsAdmin =
      loadAdminIncomeLevels;

  }

}


/* =========================================================
   HIDE ADMIN PAGE CONTENT
   ========================================================= */

function hideAdminPageContent() {

  document
    .querySelectorAll(
      ".admin-page-content"
    )
    .forEach(section => {

      section.classList.add(
        "hidden"
      );

      section.hidden = true;

    });

}


/* =========================================================
   SHOW ADMIN SECTION
   ========================================================= */

function showAdminPageContent(sectionId) {

  const section =
    document.getElementById(
      sectionId
    );

  if (!section) {

    console.error(
      "❌ Admin section not found:",
      sectionId
    );

    return false;
  }

  section.classList.remove(
    "hidden"
  );

  section.hidden = false;

  return true;
}


/* =========================================================
   ADMIN SECTION MAP
   ========================================================= */

const ADMIN_SECTION_MAP = {

  dashboard:
    "adminDashboardContent",

  recharge:
    "adminRechargeSection",

  withdraw:
    "adminWithdrawSection",

  vip:
    "adminVipSection",

  levels:
    "adminLevelsSection",

  rechargeLevels:
    "adminLevelsSection",

  rechargeLevel:
    "adminLevelsSection",

  withdrawLevels:
    "adminWithdrawLevelsSection",

  teamLevels:
    "adminTeamDepositLevelsSection",

  teamDeposit:
    "adminTeamDepositLevelsSection",

  teamDepositLevels:
    "adminTeamDepositLevelsSection",

  gTeamDepositLevels:
    "adminTeamDepositLevelsSection",

  payments:
    "adminPaymentsSection",

  payment:
    "adminPaymentsSection",

  paymentMethods:
    "adminPaymentsSection",

  users:
    "adminUsersSection",

  rewards:
    "adminRewardsSection",

  tasks:
    "adminTasksSection",

  announcements:
    "adminAnnouncementsSection",

  calendar:
    "adminCalendarSection",

  incomeLevels:
    "adminIncomeLevelsSection"

};


/* =========================================================
   ADMIN PAGE TITLES
   ========================================================= */

const ADMIN_PAGE_TITLES = {

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

  rechargeLevels:
    "Recharge Levels",

  rechargeLevel:
    "Recharge Levels",

  withdrawLevels:
    "Withdraw Levels",

  teamLevels:
    "Team Deposit Levels",

  teamDeposit:
    "Team Deposit Levels",

  teamDepositLevels:
    "Team Deposit Levels",

  gTeamDepositLevels:
    "Team Deposit Levels",

  payments:
    "Payment Methods",

  payment:
    "Payment Methods",

  paymentMethods:
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
    "Calendar",

  incomeLevels:
    "Income Levels"

};


/* =========================================================
   ADMIN NAVIGATE
   STABLE VERSION
   ========================================================= */

window.adminNavigate =
  function(section) {

    console.log(
      "➡️ ADMIN NAVIGATE:",
      section
    );


    /* -----------------------------------------------------
       ADMIN SESSION CHECK
    ----------------------------------------------------- */

    if (!currentAdmin) {

      console.warn(
        "⚠️ Admin is not signed in."
      );

      return;
    }


    /* -----------------------------------------------------
       NORMALIZE
    ----------------------------------------------------- */

    const normalized =
      String(section || "")
        .trim();


    const sectionId =
      ADMIN_SECTION_MAP[
        normalized
      ];


    if (!sectionId) {

      console.error(
        "❌ Unknown admin section:",
        normalized
      );

      return;
    }


    /* -----------------------------------------------------
       INCOME SECTION SAFETY
    ----------------------------------------------------- */

    if (
      normalized ===
      "incomeLevels"
    ) {

      ensureAdminIncomeLevelsSection();

    }


    /* -----------------------------------------------------
       EXPOSE MODULE LOADERS
    ----------------------------------------------------- */

    exposeAdminLoaders();


    /* -----------------------------------------------------
       STOP OLD LISTENERS
    ----------------------------------------------------- */

    try {

      stopAllListeners();

    } catch (error) {

      console.warn(
        "⚠️ Listener cleanup warning:",
        error
      );

    }


    /* -----------------------------------------------------
       HIDE OLD SECTIONS
    ----------------------------------------------------- */

    hideAdminPageContent();


    /* -----------------------------------------------------
       SHOW SELECTED SECTION
    ----------------------------------------------------- */

    const opened =
      showAdminPageContent(
        sectionId
      );


    if (!opened) {

      return;

    }


    /* -----------------------------------------------------
       PAGE TITLE
    ----------------------------------------------------- */

    const title =
      document.getElementById(
        "adminPageTitle"
      );


    if (title) {

      title.textContent =
        ADMIN_PAGE_TITLES[
          normalized
        ] ||
        "CCUS Admin";

    }


    /* =====================================================
       LOAD SELECTED SECTION
       ===================================================== */

    try {

      switch (normalized) {


        /* =================================================
           DASHBOARD
        ================================================= */

        case "dashboard":

          if (
            typeof window.loadAdminDashboard ===
            "function"
          ) {

            window.loadAdminDashboard();

          }

          break;


        /* =================================================
           RECHARGE
        ================================================= */

        case "recharge":

          if (
            typeof window.loadAdminRechargeRequests ===
            "function"
          ) {

            window.loadAdminRechargeRequests();

          } else {

            console.error(
              "❌ Recharge loader not found."
            );

          }

          break;


        /* =================================================
           WITHDRAW
        ================================================= */

        case "withdraw":

          if (
            typeof window.loadAdminWithdrawRequests ===
            "function"
          ) {

            window.loadAdminWithdrawRequests();

          } else {

            console.error(
              "❌ Withdraw loader not found."
            );

          }

          break;


        /* =================================================
           VIP
        ================================================= */

        case "vip":

          if (
            typeof window.loadAdminVipLevels ===
            "function"
          ) {

            window.loadAdminVipLevels();

          } else {

            console.error(
              "❌ VIP loader not found."
            );

          }

          break;


        /* =================================================
           RECHARGE LEVELS
        ================================================= */

        case "levels":
        case "rechargeLevels":
        case "rechargeLevel":

          if (
            typeof window.loadAdminRechargeLevels ===
            "function"
          ) {

            window.loadAdminRechargeLevels();

          } else {

            console.error(
              "❌ Recharge Levels loader not found."
            );

          }

          break;


        /* =================================================
           WITHDRAW LEVELS
        ================================================= */

        case "withdrawLevels":

          if (
            typeof window.loadAdminWithdrawLevels ===
            "function"
          ) {

            window.loadAdminWithdrawLevels();

          } else {

            console.error(
              "❌ Withdraw Levels loader not found."
            );

          }

          break;


        /* =================================================
           TEAM DEPOSIT LEVELS
        ================================================= */

        case "teamLevels":
        case "teamDeposit":
        case "teamDepositLevels":
        case "gTeamDepositLevels":

          if (
            typeof window.loadAdminTeamDepositLevels ===
            "function"
          ) {

            window.loadAdminTeamDepositLevels();

          } else {

            console.error(
              "❌ Team Deposit Levels loader not found."
            );

          }

          break;


        /* =================================================
           PAYMENT METHODS
        ================================================= */

        case "payments":
        case "payment":
        case "paymentMethods":

          if (
            typeof window.loadAdminPaymentMethods ===
            "function"
          ) {

            window.loadAdminPaymentMethods();

          } else {

            console.error(
              "❌ Payment Methods loader not found."
            );

          }

          break;


        /* =================================================
           USERS
        ================================================= */

        case "users":

          if (
            typeof window.loadAdminUsers ===
            "function"
          ) {

            window.loadAdminUsers();

          } else {

            console.error(
              "❌ Users loader not found."
            );

          }

          break;


        /* =================================================
           REWARDS
        ================================================= */

        case "rewards":

          if (
            typeof window.loadAdminRewards ===
            "function"
          ) {

            window.loadAdminRewards();

          } else {

            console.error(
              "❌ Rewards loader not found."
            );

          }

          break;


        /* =================================================
           TASKS
        ================================================= */

        case "tasks":

          if (
            typeof window.loadAdminTasks ===
            "function"
          ) {

            window.loadAdminTasks();

          } else {

            console.error(
              "❌ Tasks loader not found."
            );

          }


          if (
            typeof window.loadTaskSettings ===
            "function"
          ) {

            window.loadTaskSettings();

          }

          break;


        /* =================================================
           ANNOUNCEMENTS
        ================================================= */

        case "announcements":

          if (
            typeof window.loadAdminAnnouncements ===
            "function"
          ) {

            window.loadAdminAnnouncements();

          } else {

            console.error(
              "❌ Announcements loader not found."
            );

          }

          break;


        /* =================================================
           CALENDAR
        ================================================= */

        case "calendar":

          if (
            typeof window.loadAdminCalendar ===
            "function"
          ) {

            window.loadAdminCalendar();

          } else {

            console.error(
              "❌ Calendar loader not found."
            );

          }

          break;


        /* =================================================
           INCOME LEVELS
        ================================================= */

        case "incomeLevels":

          if (
            typeof window.loadAdminIncomeLevels ===
            "function"
          ) {

            window.loadAdminIncomeLevels();

          } else {

            console.error(
              "❌ Income Levels loader not found."
            );

          }

          break;


        default:

          console.warn(
            "⚠️ No loader configured for:",
            normalized
          );

          break;

      }

    } catch (error) {

      console.error(
        "❌ Admin section loader error:",
        normalized,
        error
      );

    }


    /* =====================================================
       ACTIVE BOTTOM NAV
       ===================================================== */

    document
      .querySelectorAll(
        ".admin-nav-item"
      )
      .forEach(button => {

        button.classList.remove(
          "active"
        );

      });


    const activeButton =
      Array.from(
        document.querySelectorAll(
          ".admin-nav-item"
        )
      )
      .find(button => {

        const onclick =
          button.getAttribute(
            "onclick"
          ) || "";

        return (
          onclick.includes(
            `'${normalized}'`
          ) ||
          onclick.includes(
            `"${normalized}"`
          )
        );

      });


    if (activeButton) {

      activeButton.classList.add(
        "active"
      );

    }

  };


/* =========================================================
   OPEN ADMIN SECTION
   ========================================================= */

window.openAdminSection =
  function(section) {

    return window.adminNavigate(
      section
    );

  };


/* =========================================================
   INITIALIZE LOADER ALIASES
   ========================================================= */

try {

  exposeAdminLoaders();

} catch (error) {

  console.warn(
    "⚠️ Admin loader alias initialization warning:",
    error
  );

}


/* =========================================================
   FINAL COMPATIBILITY ALIASES
   ========================================================= */

window.loadIncomeLevelsAdmin =
  window.loadIncomeLevelsAdmin ||
  window.loadAdminIncomeLevels;


window.loadTeamDepositLevels =
  window.loadTeamDepositLevels ||
  window.loadAdminTeamDepositLevels;


window.loadGTeamDepositLevels =
  window.loadGTeamDepositLevels ||
  window.loadAdminTeamDepositLevels;


/* =========================================================
   END ADMIN NAVIGATION
========================================================= */
/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  stopAllListeners();

  setElementText(
    "adminTotalUsers",
    "..."
  );

  setElementText(
    "adminPendingRecharge",
    "..."
  );

  setElementText(
    "adminApprovedRecharge",
    "..."
  );

  setElementText(
    "adminPendingWithdraw",
    "..."
  );

  setElementText(
    "adminApprovedWithdraw",
    "..."
  );


  /* USERS */

  try {

    const unsubscribeUsers =
      onSnapshot(
        collection(
          db,
          "users"
        ),

        snapshot => {

          setElementText(
            "adminTotalUsers",
            snapshot.size
          );
        },

        error => {

          console.error(
            "Dashboard users error:",
            error
          );

          setElementText(
            "adminTotalUsers",
            "0"
          );
        }
      );

    unsubscribes.push(
      unsubscribeUsers
    );

  } catch (error) {

    console.error(
      "Users dashboard listener error:",
      error
    );
  }


  /* RECHARGE */

  try {

    const rechargeQuery =
      query(
        collection(
          db,
          "rechargeRequests"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );


    const unsubscribeRecharge =
      onSnapshot(
        rechargeQuery,

        snapshot => {

          let pending = 0;

          let approved = 0;

          const items =
            snapshot.docs
              .map(
                docSnap => ({
                  id:
                    docSnap.id,

                  ...(docSnap.data() || {})
                })
              );


          items.forEach(
            item => {

              const status =
                String(
                  item.status ||
                  ""
                ).toLowerCase();


              if (
                status ===
                "pending"
              ) {
                pending++;
              }

              if (
                status ===
                "approved"
              ) {
                approved++;
              }
            }
          );


          setElementText(
            "adminPendingRecharge",
            pending
          );

          setElementText(
            "adminApprovedRecharge",
            approved
          );


          const recentContainer =
            getElementByIds(
              "adminRecentRecharge",
              "adminRecentRechargeList"
            );


          if (
            recentContainer
          ) {

            const recent =
              items.slice(
                0,
                5
              );


            recentContainer.innerHTML =
              recent.length
                ? recent
                    .map(
                      item =>
                        rechargeCardHTML(
                          item.id,
                          item,
                          true
                        )
                    )
                    .join("")
                : emptyHTML(
                    "💳",
                    "No Recharge Requests"
                  );
          }
        },

        error => {

          console.error(
            "Recharge dashboard error:",
            error
          );
        }
      );


    unsubscribes.push(
      unsubscribeRecharge
    );

  } catch (error) {

    console.error(
      "Recharge dashboard listener setup error:",
      error
    );
  }


  /* WITHDRAW */

  try {

    const withdrawQuery =
      query(
        collection(
          db,
          "withdrawRequests"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );


    const unsubscribeWithdraw =
      onSnapshot(
        withdrawQuery,

        snapshot => {

          let pending = 0;

          let approved = 0;


          const items =
            snapshot.docs
              .map(
                docSnap => ({
                  id:
                    docSnap.id,

                  ...(docSnap.data() || {})
                })
              );


          items.forEach(
            item => {

              const status =
                String(
                  item.status ||
                  ""
                ).toLowerCase();


              if (
                status ===
                "pending"
              ) {
                pending++;
              }

              if (
                status ===
                "approved"
              ) {
                approved++;
              }
            }
          );


          setElementText(
            "adminPendingWithdraw",
            pending
          );

          setElementText(
            "adminApprovedWithdraw",
            approved
          );


          const recentContainer =
            getElementByIds(
              "adminRecentWithdraw",
              "adminRecentWithdrawList"
            );


          if (
            recentContainer
          ) {

            const recent =
              items.slice(
                0,
                5
              );


            recentContainer.innerHTML =
              recent.length
                ? recent
                    .map(
                      item =>
                        withdrawCardHTML(
                          item.id,
                          item,
                          true
                        )
                    )
                    .join("")
                : emptyHTML(
                    "💸",
                    "No Withdraw Requests"
                  );
          }
        },

        error => {

          console.error(
            "Withdraw dashboard error:",
            error
          );
        }
      );


    unsubscribes.push(
      unsubscribeWithdraw
    );

  } catch (error) {

    console.error(
      "Withdraw dashboard listener setup error:",
      error
    );
  }
}


/* =========================================================
   CCUS ADMIN - RECHARGE REQUESTS
   STABLE / CORRECTED VERSION
========================================================= */


/* =========================================================
   LOAD RECHARGE REQUESTS
   - No Firestore orderBy dependency
   - Client-side sorting
   - Handles missing createdAt safely
========================================================= */

async function loadAdminRechargeRequests() {

  const container = getElementByIds(
    "rechargeRequestsList",
    "adminRechargeList"
  );

  if (!container) {
    console.error(
      "❌ Recharge request list not found."
    );
    return;
  }

  container.innerHTML = loadingHTML(
    "💳",
    "Loading Recharge Requests..."
  );

  try {

    const rechargeRef = collection(
      db,
      "rechargeRequests"
    );

    const unsubscribe = onSnapshot(
      rechargeRef,

      snapshot => {

        try {

          const items = snapshot.docs
            .map(docSnap => ({
              id: docSnap.id,
              ...(docSnap.data() || {})
            }))
            .sort(
              (a, b) =>
                getMillis(b.createdAt) -
                getMillis(a.createdAt)
            );

          if (!items.length) {

            container.innerHTML = emptyHTML(
              "💳",
              "No Recharge Requests",
              "No recharge request found."
            );

            return;
          }

          container.innerHTML = items
            .map(item =>
              rechargeCardHTML(
                item.id,
                item
              )
            )
            .join("");

        } catch (renderError) {

          console.error(
            "❌ Recharge render error:",
            renderError
          );

          container.innerHTML = errorHTML(
            renderError?.message ||
            "Failed to display recharge requests."
          );
        }
      },

      error => {

        console.error(
          "❌ Load recharge requests error:",
          error
        );

        container.innerHTML = errorHTML(
          error?.message ||
          "Failed to load recharge requests."
        );
      }
    );

    unsubscribes.push(
      unsubscribe
    );

  } catch (error) {

    console.error(
      "❌ Recharge listener initialization error:",
      error
    );

    container.innerHTML = errorHTML(
      error?.message ||
      "Failed to initialize recharge requests."
    );
  }
}


/* =========================================================
   FIND RECHARGE LEVEL
========================================================= */

async function findRechargeLevel(amount) {

  const numericAmount =
    safeNumber(amount);

  if (numericAmount <= 0) {
    return null;
  }

  try {

    const snapshot = await getDocs(
      collection(
        db,
        "rechargeLevels"
      )
    );

    const levels = snapshot.docs
      .map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() || {})
      }))
      .filter(level =>
        level.active !== false &&
        safeNumber(level.amount) > 0
      )
      .sort(
        (a, b) =>
          safeNumber(a.amount) -
          safeNumber(b.amount)
      );

    if (!levels.length) {
      return null;
    }

    /* Exact level */

    const exact = levels.find(
      level =>
        safeNumber(level.amount) ===
        numericAmount
    );

    if (exact) {
      return exact;
    }

    /* Highest level <= recharge amount */

    const eligible = levels.filter(
      level =>
        safeNumber(level.amount) <=
        numericAmount
    );

    if (eligible.length) {
      return eligible[
        eligible.length - 1
      ];
    }

    /*
       If recharge amount is below
       the first configured level,
       return null rather than incorrectly
       assigning the first level.
    */

    return null;

  } catch (error) {

    console.error(
      "❌ Find recharge level error:",
      error
    );

    throw error;
  }
}


/* =========================================================
   FIND REFERRER
========================================================= */

async function findReferrer(userData) {

  if (!userData) {
    return null;
  }

  const referralCode =
    String(
      userData.referredBy ||
      userData.referrerCode ||
      ""
    ).trim();

  if (!referralCode) {
    return null;
  }

  try {

    const usersRef =
      collection(
        db,
        "users"
      );

    /*
       First:
       Search referralCode
    */

    const byReferral =
      await getDocs(
        query(
          usersRef,
          where(
            "referralCode",
            "==",
            referralCode
          ),
          limit(1)
        )
      );

    if (!byReferral.empty) {

      const snap =
        byReferral.docs[0];

      return {
        id: snap.id,
        data: snap.data() || {}
      };
    }

    /*
       Second:
       Search accountNumber
    */

    const byAccount =
      await getDocs(
        query(
          usersRef,
          where(
            "accountNumber",
            "==",
            referralCode
          ),
          limit(1)
        )
      );

    if (!byAccount.empty) {

      const snap =
        byAccount.docs[0];

      return {
        id: snap.id,
        data: snap.data() || {}
      };
    }

  } catch (error) {

    console.warn(
      "⚠️ Find referrer error:",
      error
    );
  }

  return null;
}


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
      data?.status ||
      "pending"
    )
      .trim()
      .toLowerCase();

  const amount =
    safeNumber(
      data?.upgradeAmount ??
      data?.depositAmount ??
      data?.amount
    );

  const level =
    data?.levelName ||
    data?.rechargeLevelName ||
    data?.level ||
    "—";

  const commission =
    safeNumber(
      data?.commission
    );

  const payment =
    data?.paymentMethod ||
    data?.method ||
    "—";

  const transaction =
    data?.transactionId ||
    data?.reference ||
    "—";

  const created =
    formatDate(
      data?.createdAt
    );

  const userId =
    data?.userId ||
    data?.uid ||
    "—";

  const statusClass =
    escapeHTML(
      status.replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
    );

  return `

    <div class="admin-request-card">

      <!-- HEADER -->

      <div class="admin-card-header">

        <div>

          <h3>
            💳 Recharge
          </h3>

          <small>
            Request:
            ${escapeHTML(String(id))}
          </small>

        </div>

        <span
          class="status-${statusClass}"
        >
          ${escapeHTML(
            status.toUpperCase()
          )}
        </span>

      </div>


      <!-- DETAILS -->

      <div class="admin-card-grid">

        <div>
          <small>Amount</small>

          <strong>
            ETB ${formatAdminMoney(amount)}
          </strong>
        </div>


        <div>
          <small>Level</small>

          <strong>
            ${escapeHTML(
              String(level)
            )}
          </strong>
        </div>


        <div>
          <small>Commission</small>

          <strong>
            ETB ${formatAdminMoney(
              commission
            )}
          </strong>
        </div>


        <div>
          <small>Payment</small>

          <strong>
            ${escapeHTML(
              String(payment)
            )}
          </strong>
        </div>


        <div>
          <small>Transaction</small>

          <strong>
            ${escapeHTML(
              String(transaction)
            )}
          </strong>
        </div>


        <div>
          <small>Date</small>

          <strong>
            ${escapeHTML(
              String(created)
            )}
          </strong>
        </div>


        <div>
          <small>User ID</small>

          <strong>
            ${escapeHTML(
              String(userId)
            )}
          </strong>
        </div>

      </div>


      <!-- ACTIONS -->

      ${
        !compact &&
        status === "pending"
          ? `

            <div class="admin-action-row">

              <button
                type="button"
                class="admin-primary-btn"
                onclick="window.approveRecharge('${escapeHTML(
                  String(id)
                )}')"
              >
                ✅ Approve
              </button>


              <button
                type="button"
                class="admin-danger-btn"
                onclick="window.rejectRecharge('${escapeHTML(
                  String(id)
                )}')"
              >
                ❌ Reject
              </button>

            </div>

          `
          : ""
      }

    </div>

  `;
}


/* =========================================================
   APPROVE RECHARGE / UPGRADE
   ---------------------------------------------------------
   BUSINESS RULES
   ---------------------------------------------------------
   1. Recharge approval:
      - totalRecharge INCREASES
      - totalBalance MUST NOT increase

   2. NORMAL DEPOSIT:
      Example:
        Old Total Recharge = 0
        Payment            = 1600
        New Total Recharge = 1600

   3. UPGRADE:
      Example:
        Old Total Recharge = 6000
        Payment            = 4000
        Target Level       = 10000
        New Total Recharge = 10000

      IMPORTANT:
      Payment amount is NOT necessarily the level amount.

   4. Recharge levels:
      1600  -> Task Limit 2
      6000  -> Task Limit 8
      10000 -> Task Limit 13
      21000 -> Task Limit 26
      45000 -> Task Limit 56
      90000 -> Task Limit 118

   5. Highest eligible ACTIVE level is selected.

   6. Referral commission:
      - Credited only once
      - teamCommissions/{requestId}

   7. Recharge request:
      - Can only be approved once

   8. active accepts:
      - true
      - 1
      - "true"

   9. Firestore transaction:
      - ALL transaction reads happen BEFORE writes
========================================================= */

window.approveRecharge = async function (requestId) {

  /* =======================================================
     0. ADMIN CHECK
  ======================================================= */

  if (!currentAdmin) {
    alert("Admin session not found.");
    return;
  }

  if (!requestId) {
    alert("Recharge request ID is missing.");
    return;
  }

  try {

    /* =====================================================
       1. REQUEST REFERENCE
    ===================================================== */

    const requestRef = doc(
      db,
      "rechargeRequests",
      requestId
    );


    /* =====================================================
       2. INITIAL REQUEST READ
    ===================================================== */

    const requestSnap = await getDoc(
      requestRef
    );

    if (!requestSnap.exists()) {

      alert(
        "Recharge request not found."
      );

      return;
    }


    const requestData =
      requestSnap.data() || {};


    /* =====================================================
       3. CHECK REQUEST STATUS
    ===================================================== */

    const currentStatus =
      String(
        requestData.status || "pending"
      )
        .trim()
        .toLowerCase();


    if (currentStatus !== "pending") {

      alert(
        "This recharge request has already been processed."
      );

      return;
    }


    /* =====================================================
       4. GET PAYMENT / UPGRADE AMOUNT
       -----------------------------------------------------
       For upgrade:

       Old Total = 6000
       Payment   = 4000

       Therefore:

       New Total = 6000 + 4000
                 = 10000
    ===================================================== */

    const paymentAmount =
      safeNumber(
        requestData.upgradeAmount ??
        requestData.depositAmount ??
        requestData.amount
      );


    if (paymentAmount <= 0) {

      alert(
        "Invalid recharge / upgrade amount."
      );

      return;
    }


    /* =====================================================
       5. GET USER ID
    ===================================================== */

    const userId =
      requestData.userId ||
      requestData.uid;


    if (!userId) {

      alert(
        "User ID is missing."
      );

      return;
    }


    /* =====================================================
       6. USER REFERENCE
    ===================================================== */

    const userRef = doc(
      db,
      "users",
      userId
    );


    /* =====================================================
       7. LOAD ALL RECHARGE LEVELS
    ===================================================== */

    const levelsSnap =
      await getDocs(
        collection(
          db,
          "rechargeLevels"
        )
      );


    const activeLevels = [];


    levelsSnap.forEach(
      levelDoc => {

        const data =
          levelDoc.data() || {};


        const isActive =
          data.active === true ||
          data.active === 1 ||
          data.active === "true";


        if (!isActive) {
          return;
        }


        const levelAmount =
          safeNumber(
            data.amount
          );


        if (levelAmount <= 0) {
          return;
        }


        const taskLimit =
          Math.max(
            0,
            Math.floor(
              safeNumber(
                data.taskLimit
              )
            )
          );


        activeLevels.push({

          id:
            levelDoc.id,

          name:
            data.name ||
            levelDoc.id,

          amount:
            levelAmount,

          taskLimit:
            taskLimit,

          order:
            safeNumber(
              data.order
            ),

          commission:
            safeNumber(
              data.commission
            )

        });

      }
    );


    /* =====================================================
       8. SORT LEVELS
       -----------------------------------------------------
       LOW → HIGH
    ===================================================== */

    activeLevels.sort(
      (a, b) =>
        a.amount - b.amount
    );


    if (
      activeLevels.length === 0
    ) {

      alert(
        "No active recharge levels found."
      );

      return;
    }


    /* =====================================================
       9. FIND REFERRER HINT
       -----------------------------------------------------
       This is done BEFORE the transaction.

       The actual referrer document will still be read
       INSIDE the transaction before any write.
    ===================================================== */

    let referrerHint = null;


    try {

      const initialUserSnap =
        await getDoc(
          userRef
        );


      if (
        initialUserSnap.exists()
      ) {

        const initialUserData =
          initialUserSnap.data() || {};


        if (
          typeof findReferrer ===
          "function"
        ) {

          referrerHint =
            await findReferrer(
              initialUserData
            );

        }

      }

    } catch (referrerError) {

      console.warn(
        "⚠️ Could not resolve referrer before transaction:",
        referrerError
      );

      referrerHint = null;
    }


    /* =====================================================
       10. TRANSACTION VARIABLES
    ===================================================== */

    let oldTotalRecharge = 0;

    let approvedTotalRecharge = 0;

    let selectedTaskLimit = 0;

    let selectedLevel = null;

    let commission = 0;

    let commissionCredited = false;

    let upgradeAmount = paymentAmount;


    /* =====================================================
       11. FIRESTORE TRANSACTION
    ===================================================== */

    await runTransaction(
      db,
      async transaction => {

        /* =================================================
           IMPORTANT:

           ALL transaction.get() CALLS MUST FINISH
           BEFORE transaction.update()/set().
        ================================================= */


        /* ================================================
           11.1 FRESH REQUEST
        ================================================ */

        const freshRequest =
          await transaction.get(
            requestRef
          );


        if (
          !freshRequest.exists()
        ) {

          throw new Error(
            "Recharge request no longer exists."
          );

        }


        const freshRequestData =
          freshRequest.data() || {};


        const freshStatus =
          String(
            freshRequestData.status ||
            "pending"
          )
            .trim()
            .toLowerCase();


        if (
          freshStatus !==
          "pending"
        ) {

          throw new Error(
            "Recharge request was already processed."
          );

        }


        /* ================================================
           11.2 FRESH USER
        ================================================ */

        const freshUser =
          await transaction.get(
            userRef
          );


        if (
          !freshUser.exists()
        ) {

          throw new Error(
            "User account no longer exists."
          );

        }


        const freshUserData =
          freshUser.data() || {};


        /* ================================================
           11.3 OLD TOTAL RECHARGE
        ================================================ */

        oldTotalRecharge =
          safeNumber(
            freshUserData.totalRecharge
          );


        /* ================================================
           11.4 CALCULATE NEW TOTAL
           ------------------------------------------------
           Example:

           Old Total = 6000
           Payment   = 4000

           New Total = 10000
        ================================================ */

        approvedTotalRecharge =
          oldTotalRecharge +
          paymentAmount;


        if (
          approvedTotalRecharge <=
          oldTotalRecharge
        ) {

          throw new Error(
            "New total recharge must be greater than the current total recharge."
          );

        }


        /* ================================================
           11.5 FIND TARGET LEVEL
           ------------------------------------------------
           IMPORTANT:

           We do NOT require:

             paymentAmount == level.amount

           Instead we require:

             oldTotalRecharge + paymentAmount
             == target level amount

           Example:

             6000 + 4000 = 10000

           Therefore target = 10000.
        ================================================ */

        selectedLevel = null;


        for (
          const rechargeLevel
          of activeLevels
        ) {

          if (
            rechargeLevel.amount ===
            approvedTotalRecharge
          ) {

            selectedLevel =
              rechargeLevel;

            break;
          }

        }


        /* ================================================
           11.6 IF EXACT TARGET LEVEL NOT FOUND
        ================================================ */

        if (!selectedLevel) {

          throw new Error(

            "Invalid recharge upgrade.\n\n" +

            "Current Total Recharge: ETB " +
            oldTotalRecharge.toFixed(2) +

            "\nPayment: ETB " +
            paymentAmount.toFixed(2) +

            "\nNew Total Recharge: ETB " +
            approvedTotalRecharge.toFixed(2) +

            "\n\nThe new total must exactly match an active recharge level."

          );

        }


        /* ================================================
           11.7 VERIFY IT IS A REAL UPGRADE
           ------------------------------------------------
           Target level must be greater than old level.
        ================================================ */

        if (
          selectedLevel.amount <=
          oldTotalRecharge
        ) {

          throw new Error(
            "Selected recharge level is not higher than the user's current level."
          );

        }


        /* ================================================
           11.8 TASK LIMIT
        ================================================ */

        selectedTaskLimit =
          Math.max(
            0,
            Math.floor(
              safeNumber(
                selectedLevel.taskLimit
              )
            )
          );


        /* ================================================
           11.9 COMMISSION
           ------------------------------------------------
           Commission belongs to TARGET LEVEL.
        ================================================ */

        commission =
          safeNumber(
            selectedLevel.commission
          );


        /* ================================================
           11.10 COMMISSION REFERENCES
        ================================================ */

        let commissionRef = null;

        let referrerRef = null;

        let commissionSnap = null;

        let referrerSnap = null;


        /* ================================================
           11.11 PREPARE REFERRER DOCUMENT
        ================================================ */

        if (
          referrerHint &&
          referrerHint.id &&
          referrerHint.id !== userId &&
          commission > 0
        ) {

          commissionRef =
            doc(
              db,
              "teamCommissions",
              requestId
            );


          referrerRef =
            doc(
              db,
              "users",
              referrerHint.id
            );


          /* ---------------------------------------------
             READ COMMISSION DOCUMENT
          --------------------------------------------- */

          commissionSnap =
            await transaction.get(
              commissionRef
            );


          /* ---------------------------------------------
             READ REFERRER DOCUMENT
          --------------------------------------------- */

          referrerSnap =
            await transaction.get(
              referrerRef
            );

        }


        /* =================================================
           ALL TRANSACTION READS ARE NOW FINISHED.
           FROM HERE: WRITES ONLY.
        ================================================= */


        /* ================================================
           11.12 UPDATE USER
           ------------------------------------------------
           IMPORTANT:

           totalBalance is NOT changed.

           Only:

             totalRecharge
             taskLimit
             taskLevelId
             taskLevelName
        ================================================ */

        transaction.update(
          userRef,
          {

            totalRecharge:
              approvedTotalRecharge,

            taskLimit:
              selectedTaskLimit,

            taskLevelId:
              selectedLevel.id,

            taskLevelName:
              selectedLevel.name,

            updatedAt:
              serverTimestamp()

          }
        );


        /* ================================================
           11.13 REFERRAL COMMISSION
        ================================================ */

        if (
          referrerHint &&
          referrerHint.id &&
          referrerHint.id !== userId &&
          commission > 0 &&
          commissionSnap &&
          !commissionSnap.exists() &&
          referrerSnap &&
          referrerSnap.exists()
        ) {

          const referrerData =
            referrerSnap.data() || {};


          const referrerBalance =
            safeNumber(
              referrerData.totalBalance
            );


          /* ---------------------------------------------
             ADD COMMISSION TO REFERRER
          --------------------------------------------- */

          transaction.update(
            referrerRef,
            {

              totalBalance:
                referrerBalance +
                commission,

              updatedAt:
                serverTimestamp()

            }
          );


          /* ---------------------------------------------
             CREATE COMMISSION RECORD
          --------------------------------------------- */

          transaction.set(
            commissionRef,
            {

              requestId:
                requestId,

              rechargeUserId:
                userId,

              referrerUserId:
                referrerHint.id,

              amount:
                paymentAmount,

              commission:
                commission,

              status:
                "credited",

              createdAt:
                serverTimestamp(),

              createdBy:
                currentAdmin.uid

            }
          );


          commissionCredited =
            true;

        }


        /* ================================================
           11.14 UPDATE RECHARGE REQUEST
        ================================================ */

        transaction.update(
          requestRef,
          {

            status:
              "approved",

            approvedAt:
              serverTimestamp(),

            approvedBy:
              currentAdmin.uid,

            /* -------------------------------------------
               Actual money paid by user
            ------------------------------------------- */

            approvedAmount:
              paymentAmount,

            /* -------------------------------------------
               Upgrade payment
            ------------------------------------------- */

            upgradeAmount:
              paymentAmount,

            /* -------------------------------------------
               Old total before approval
            ------------------------------------------- */

            oldTotalRecharge:
              oldTotalRecharge,

            /* -------------------------------------------
               Target level
            ------------------------------------------- */

            levelName:
              selectedLevel.name,

            levelId:
              selectedLevel.id,

            levelAmount:
              selectedLevel.amount,

            /* -------------------------------------------
               New total after approval
            ------------------------------------------- */

            approvedTotalRecharge:
              approvedTotalRecharge,

            /* -------------------------------------------
               Task limit
            ------------------------------------------- */

            taskLimit:
              selectedTaskLimit,

            /* -------------------------------------------
               Commission
            ------------------------------------------- */

            commission:
              commission,

            commissionCredited:
              commissionCredited,

            updatedAt:
              serverTimestamp()

          }
        );

      }
    );


    /* =====================================================
       12. SUCCESS MESSAGE
    ===================================================== */

    alert(

      "Recharge / Upgrade approved successfully.\n\n" +

      "Old Total Recharge: ETB " +
      oldTotalRecharge.toFixed(2) +

      "\n" +

      "Upgrade Payment: ETB " +
      upgradeAmount.toFixed(2) +

      "\n" +

      "New Total Recharge: ETB " +
      approvedTotalRecharge.toFixed(2) +

      "\n" +

      "Target Level: " +
      (
        selectedLevel?.name ||
        "N/A"
      ) +

      "\n" +

      "Level Amount: ETB " +
      (
        selectedLevel?.amount ||
        0
      ).toFixed(2) +

      "\n" +

      "Task Limit: " +
      selectedTaskLimit

    );


    /* =====================================================
       13. REFRESH ADMIN RECHARGE LIST
    ===================================================== */

    if (
      typeof loadAdminRechargeRequests ===
      "function"
    ) {

      await loadAdminRechargeRequests();

    }


    /* =====================================================
       14. REFRESH ADMIN DASHBOARD
    ===================================================== */

    if (
      typeof loadAdminDashboard ===
      "function"
    ) {

      await loadAdminDashboard();

    }


  } catch (error) {

    console.error(
      "❌ Approve recharge error:",
      error?.code,
      error?.message,
      error
    );


    alert(
      error?.message ||
      "Failed to approve recharge."
    );

  }

};

/* =========================================================
   WITHDRAW REQUESTS
========================================================= */

window.loadAdminWithdrawRequests =
  async function () {

    const container =
      getElementByIds(
        "withdrawRequestsList",
        "adminWithdrawList"
      );


    if (!container) {

      console.error(
        "Withdraw request list not found."
      );

      return;
    }


    container.innerHTML =
      loadingHTML(
        "💸",
        "Loading Withdraw Requests..."
      );


    const filterElement =
      getElementByIds(
        "withdrawStatusFilter",
        "adminWithdrawStatusFilter"
      );


    try {

      const withdrawQuery =
        query(
          collection(
            db,
            "withdrawRequests"
          ),
          orderBy(
            "createdAt",
            "desc"
          )
        );


      const unsubscribe =
        onSnapshot(
          withdrawQuery,

          snapshot => {

            const filter =
              String(
                filterElement?.value ||
                "all"
              ).toLowerCase();


            let items =
              snapshot.docs
                .map(
                  docSnap => ({
                    id:
                      docSnap.id,

                    ...(docSnap.data() || {})
                  })
                );


            if (
              filter !== "all"
            ) {

              items =
                items.filter(
                  item =>
                    String(
                      item.status ||
                      ""
                    ).toLowerCase() ===
                    filter
                );
            }


            if (
              !items.length
            ) {

              container.innerHTML =
                emptyHTML(
                  "💸",
                  "No Withdraw Requests"
                );

              return;
            }


            container.innerHTML =
              items
                .map(
                  item =>
                    withdrawCardHTML(
                      item.id,
                      item
                    )
                )
                .join("");
          },

          error => {

            console.error(
              "Load withdraw requests error:",
              error
            );

            container.innerHTML =
              errorHTML(
                error?.message
              );
          }
        );


      unsubscribes.push(
        unsubscribe
      );


      if (
        filterElement &&
        !filterElement.dataset.listenerAttached
      ) {

        filterElement.addEventListener(
          "change",
          () => {

            loadAdminWithdrawRequests();
          }
        );

        filterElement.dataset.listenerAttached =
          "true";
      }

    } catch (error) {

      console.error(
        "Withdraw listener error:",
        error
      );

      container.innerHTML =
        errorHTML(
          error?.message
        );
    }
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
      data.status ||
      "pending"
    ).toLowerCase();


  const amount =
    safeNumber(
      data.amount
    );


  const paymentMethod =
    data.paymentMethod ||
    data.method ||
    "—";


  const accountName =
    data.accountName ||
    data.paymentAccountName ||
    "—";


  const accountNumber =
    data.accountNumber ||
    data.paymentAccountNumber ||
    "—";


  const balanceDeducted =
    data.balanceDeducted === true;


  const refundProcessed =
    data.refundProcessed === true;


  return `

    <div class="admin-request-card">

      <div class="admin-card-header">

        <div>

          <h3>
            💸 Withdraw
          </h3>

          <small>
            ${escapeHTML(id)}
          </small>

        </div>

        <span
          class="status-${escapeHTML(status)}"
        >
          ${escapeHTML(
            status.toUpperCase()
          )}
        </span>

      </div>


      <div class="admin-card-grid">

        <div>
          <small>Amount</small>
          <strong>
            ETB ${formatAdminMoney(amount)}
          </strong>
        </div>

        <div>
          <small>Payment</small>
          <strong>
            ${escapeHTML(paymentMethod)}
          </strong>
        </div>

        <div>
          <small>Account Name</small>
          <strong>
            ${escapeHTML(accountName)}
          </strong>
        </div>

        <div>
          <small>Account Number</small>
          <strong>
            ${escapeHTML(accountNumber)}
          </strong>
        </div>

        <div>
          <small>Balance Deducted</small>
          <strong>
            ${balanceDeducted ? "Yes" : "No"}
          </strong>
        </div>

        <div>
          <small>Refund Processed</small>
          <strong>
            ${refundProcessed ? "Yes" : "No"}
          </strong>
        </div>

        <div>
          <small>Date</small>
          <strong>
            ${escapeHTML(
              formatDate(
                data.createdAt
              )
            )}
          </strong>
        </div>

      </div>


      ${
        !compact &&
        status === "pending"
          ? `
            <div class="admin-action-row">

              <button
                type="button"
                class="admin-primary-btn"
                onclick="window.approveWithdraw('${escapeHTML(id)}')"
              >
                ✅ Approve
              </button>

              <button
                type="button"
                class="admin-danger-btn"
                onclick="window.rejectWithdraw('${escapeHTML(id)}')"
              >
                ❌ Reject
              </button>

            </div>
          `
          : ""
      }

    </div>
  `;
}


/* =========================================================
   APPROVE WITHDRAW
========================================================= */

window.approveWithdraw =
  async function (requestId) {

    if (!currentAdmin) {

      return alert(
        "Admin session not found."
      );
    }


    if (!requestId) {
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

          const requestSnap =
            await transaction.get(
              requestRef
            );


          if (
            !requestSnap.exists()
          ) {

            throw new Error(
              "Withdraw request not found."
            );
          }


          const data =
            requestSnap.data() ||
            {};


          if (
            String(
              data.status ||
              ""
            ).toLowerCase() !==
            "pending"
          ) {

            throw new Error(
              "Withdraw request has already been processed."
            );
          }


          const userId =
            data.userId ||
            data.uid;


          if (!userId) {

            throw new Error(
              "User ID is missing."
            );
          }


          const userRef =
            doc(
              db,
              "users",
              userId
            );


          /*
             IMPORTANT:
             If submitWithdraw() already deducted
             the balance, DO NOT deduct again.
          */

          if (
            data.balanceDeducted !==
            true
          ) {

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


            const userData =
              userSnap.data() ||
              {};


            const balance =
              safeNumber(
                userData.totalBalance
              );


            const amount =
              safeNumber(
                data.amount
              );


            if (
              balance < amount
            ) {

              throw new Error(
                "Insufficient user balance."
              );
            }


            transaction.update(
              userRef,
              {
                totalBalance:
                  balance - amount,

                updatedAt:
                  serverTimestamp()
              }
            );
          }


          transaction.update(
            requestRef,
            {
              status:
                "approved",

              balanceDeducted:
                true,

              approvedAt:
                serverTimestamp(),

              approvedBy:
                currentAdmin.uid
            }
          );
        }
      );


      alert(
        "Withdrawal approved successfully."
      );


    } catch (error) {

      console.error(
        "Approve withdraw error:",
        error
      );

      alert(
        error?.message ||
        "Failed to approve withdrawal."
      );
    }
  };


/* =========================================================
   REJECT WITHDRAW
========================================================= */

window.rejectWithdraw =
  async function (requestId) {

    if (!currentAdmin) {

      return alert(
        "Admin session not found."
      );
    }


    const reason =
      prompt(
        "Enter rejection reason:",
        "Withdrawal request rejected."
      );


    if (
      reason === null
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

          const requestSnap =
            await transaction.get(
              requestRef
            );


          if (
            !requestSnap.exists()
          ) {

            throw new Error(
              "Withdraw request not found."
            );
          }


          const data =
            requestSnap.data() ||
            {};


          if (
            String(
              data.status ||
              ""
            ).toLowerCase() !==
            "pending"
          ) {

            throw new Error(
              "Withdraw request has already been processed."
            );
          }


          const userId =
            data.userId ||
            data.uid;


          const amount =
            safeNumber(
              data.amount
            );


          /*
             Refund only when:
             1. balance was deducted
             2. refund was not already processed
          */

          const shouldRefund =
            data.balanceDeducted === true &&
            data.refundProcessed !== true;


          if (
            shouldRefund
          ) {

            if (!userId) {

              throw new Error(
                "User ID is missing for refund."
              );
            }


            const userRef =
              doc(
                db,
                "users",
                userId
              );


            const userSnap =
              await transaction.get(
                userRef
              );


            if (
              !userSnap.exists()
            ) {

              throw new Error(
                "User account not found for refund."
              );
            }


            const userData =
              userSnap.data() ||
              {};


            const balance =
              safeNumber(
                userData.totalBalance
              );


            transaction.update(
              userRef,
              {
                totalBalance:
                  balance +
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
                reason.trim() ||
                "Rejected",

              rejectedAt:
                serverTimestamp(),

              rejectedBy:
                currentAdmin.uid,

              balanceRefunded:
                shouldRefund,

              refundProcessed:
                shouldRefund
                  ? true
                  : data.refundProcessed === true
            }
          );
        }
      );


      alert(
        "Withdrawal rejected successfully."
      );


    } catch (error) {

      console.error(
        "Reject withdraw error:",
        error
      );

      alert(
        error?.message ||
        "Failed to reject withdrawal."
      );
    }
  };


/* =========================================================
   VIP LEVELS
========================================================= */

async function loadAdminVipLevels() {

  const container =
    getElementByIds(
      "adminVipLevelsList",
      "adminVIPLevelsList"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "👑",
      "Loading VIP Levels..."
    );


  try {

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "vip_levels"
          ),
          orderBy(
            "level",
            "asc"
          )
        )
      );


    const items =
      snapshot.docs.map(
        docSnap => ({
          id:
            docSnap.id,

          ...(docSnap.data() || {})
        })
      );


    container.innerHTML =
      items.length
        ? items
            .map(
              item =>
                vipCardHTML(
                  item.id,
                  item
                )
            )
            .join("")
        : emptyHTML(
            "👑",
            "No VIP Levels"
          );

  } catch (error) {

    console.error(
      "Load VIP levels error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   VIP CARD
========================================================= */

function vipCardHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `

    <div class="admin-level-card">

      <div class="admin-card-header">

        <div>

          <h3>
            👑 VIP
            ${safeNumber(data.level)}
            ${
              data.name
                ? `- ${escapeHTML(data.name)}`
                : ""
            }
          </h3>

          <span
            class="${
              active
                ? "status-active"
                : "status-inactive"
            }"
          >
            ${active ? "Active" : "Inactive"}
          </span>

        </div>

      </div>


      <div class="admin-card-grid">

        <div>
          <small>Price</small>
          <strong>
            ETB ${formatAdminMoney(data.price)}
          </strong>
        </div>

        <div>
          <small>Profit</small>
          <strong>
            ETB ${formatAdminMoney(data.profit)}
          </strong>
        </div>

        <div>
          <small>Valid Days</small>
          <strong>
            ${safeNumber(data.validDays)}
          </strong>
        </div>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editAdminVipLevel('${escapeHTML(id)}')"
        >
          ✏️ Edit
        </button>

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleAdminVipLevel('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Activate"}
        </button>

        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteAdminVipLevel('${escapeHTML(id)}')"
        >
          🗑️ Delete
        </button>

      </div>

    </div>

  `;
}


/* =========================================================
   ADD / UPDATE VIP
========================================================= */

window.addVipLevel =
  async function () {

    if (!currentAdmin) {
      return showMessage(
        "adminVipMessage",
        "Admin session not found.",
        "error"
      );
    }


    const level =
      Math.floor(
        safeNumber(
          $("newVipLevel")?.value
        )
      );


    const name =
      $("newVipName")
        ?.value
        ?.trim() ||
      `VIP ${level}`;


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


    if (level < 1) {

      return showMessage(
        "adminVipMessage",
        "VIP level must be at least 1.",
        "error"
      );
    }


    if (
      price < 0 ||
      profit < 0 ||
      validDays < 1
    ) {

      return showMessage(
        "adminVipMessage",
        "Please enter valid VIP values.",
        "error"
      );
    }


    try {

      const activeElement =
        $("newVipActive");


      const active =
        activeElement
          ? activeElement.checked !== false
          : true;


      const snapshot =
        await getDocs(
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
          )
        );


      const data = {

        level,

        name,

        price,

        profit,

        validDays,

        active,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentAdmin.uid
      };


      if (
        !snapshot.empty
      ) {

        await updateDoc(
          snapshot.docs[0].ref,
          data
        );

      } else {

        await addDoc(
          collection(
            db,
            "vip_levels"
          ),
          {
            ...data,

            createdAt:
              serverTimestamp(),

            createdBy:
              currentAdmin.uid
          }
        );
      }


      clearInputs(
        "newVipLevel",
        "newVipName",
        "newVipPrice",
        "newVipProfit",
        "newVipValidDays"
      );


      showMessage(
        "adminVipMessage",
        "VIP level saved successfully.",
        "success"
      );


      await loadAdminVipLevels();

    } catch (error) {

      console.error(
        "Save VIP error:",
        error
      );

      showMessage(
        "adminVipMessage",
        error?.message ||
        "Failed to save VIP level.",
        "error"
      );
    }
  };


/* =========================================================
   EDIT VIP
========================================================= */

window.editAdminVipLevel =
  async function (id) {

    try {

      const snap =
        await getDoc(
          doc(
            db,
            "vip_levels",
            id
          )
        );


      if (!snap.exists()) {
        return alert(
          "VIP level not found."
        );
      }


      const data =
        snap.data() || {};


      const level =
        prompt(
          "VIP Level:",
          data.level ?? ""
        );


      if (level === null) {
        return;
      }


      const name =
        prompt(
          "VIP Name:",
          data.name || ""
        );


      if (name === null) {
        return;
      }


      const price =
        prompt(
          "Price:",
          data.price ?? 0
        );


      if (price === null) {
        return;
      }


      const profit =
        prompt(
          "Profit:",
          data.profit ?? 0
        );


      if (profit === null) {
        return;
      }


      const validDays =
        prompt(
          "Valid Days:",
          data.validDays ?? 1
        );


      if (
        validDays === null
      ) {
        return;
      }


      await updateDoc(
        doc(
          db,
          "vip_levels",
          id
        ),
        {
          level:
            Math.floor(
              safeNumber(level)
            ),

          name:
            name.trim(),

          price:
            safeNumber(price),

          profit:
            safeNumber(profit),

          validDays:
            Math.floor(
              safeNumber(validDays)
            ),

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminVipLevels();

    } catch (error) {

      console.error(
        "Edit VIP error:",
        error
      );

      alert(
        error?.message ||
        "Failed to edit VIP level."
      );
    }
  };


/* =========================================================
   TOGGLE VIP
========================================================= */

window.toggleAdminVipLevel =
  async function (
    id,
    active
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
            !active,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminVipLevels();

    } catch (error) {

      console.error(
        "Toggle VIP error:",
        error
      );

      alert(
        error?.message ||
        "Failed to update VIP."
      );
    }
  };


/* =========================================================
   DELETE VIP
========================================================= */

window.deleteAdminVipLevel =
  async function (id) {

    if (
      !confirm(
        "Delete this VIP level?"
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


      await loadAdminVipLevels();

    } catch (error) {

      console.error(
        "Delete VIP error:",
        error
      );

      alert(
        error?.message ||
        "Failed to delete VIP."
      );
    }
  };


/* =========================================================
   RECHARGE LEVELS
========================================================= */

async function loadAdminRechargeLevels() {

  const container =
    getElementByIds(
      "adminRechargeLevelsList",
      "adminLevelsList"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "💰",
      "Loading Recharge Levels..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "rechargeLevels"
        )
      );


    const items =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            safeNumber(a.order) -
            safeNumber(b.order)
        );


    container.innerHTML =
      items.length
        ? items
            .map(
              item =>
                rechargeLevelHTML(
                  item.id,
                  item
                )
            )
            .join("")
        : emptyHTML(
            "💰",
            "No Recharge Levels"
          );

  } catch (error) {

    console.error(
      "Load recharge levels error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   RECHARGE LEVEL CARD
========================================================= */

function rechargeLevelHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `

    <div class="admin-level-card">

      <div class="admin-card-header">

        <div>

          <h3>
            💰
            ${escapeHTML(
              data.name ||
              "Recharge Level"
            )}
          </h3>

          <span>
            Order:
            ${safeNumber(data.order)}
          </span>

        </div>

        <span
          class="${
            active
              ? "status-active"
              : "status-inactive"
          }"
        >
          ${active ? "Active" : "Inactive"}
        </span>

      </div>


      <div class="admin-card-grid">

        <div>
          <small>Amount</small>
          <strong>
            ETB ${formatAdminMoney(data.amount)}
          </strong>
        </div>

        <div>
          <small>Commission</small>
          <strong>
            ETB ${formatAdminMoney(data.commission)}
          </strong>
        </div>

        <div>
          <small>Task Limit</small>
          <strong>
            ${safeNumber(data.taskLimit)}
          </strong>
        </div>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editRechargeLevel('${escapeHTML(id)}')"
        >
          ✏️ Edit
        </button>

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleRechargeLevel('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Activate"}
        </button>

        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteRechargeLevel('${escapeHTML(id)}')"
        >
          🗑️ Delete
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   ADD RECHARGE LEVEL
========================================================= */

window.addRechargeLevel =
  async function () {

    if (!currentAdmin) {
      return showMessage(
        "adminRechargeLevelMessage",
        "Admin session not found.",
        "error"
      );
    }


    const name =
      getElementByIds(
        "newRechargeName",
        "newRechargeLevelName"
      )
        ?.value
        ?.trim() ||
      "Recharge Level";


    const amount =
      safeNumber(
        getElementByIds(
          "newRechargeAmount",
          "newRechargeLevelAmount"
        )?.value
      );


    const commission =
      safeNumber(
        getElementByIds(
          "newRechargeCommission",
          "newRechargeLevelCommission"
        )?.value
      );


    const taskLimit =
      Math.floor(
        safeNumber(
          getElementByIds(
            "newRechargeTaskLimit",
            "newRechargeLevelTaskLimit"
          )?.value
        )
      );


    const order =
      Math.floor(
        safeNumber(
          getElementByIds(
            "newRechargeOrder",
            "newRechargeLevelOrder"
          )?.value
        )
      );


    const activeElement =
      getElementByIds(
        "newRechargeLevelActive"
      );


    const active =
      activeElement
        ? activeElement.checked !== false
        : true;


    if (
      amount <= 0
    ) {

      return showMessage(
        "adminRechargeLevelMessage",
        "Recharge amount must be greater than 0.",
        "error"
      );
    }


    if (
      commission < 0 ||
      taskLimit < 0
    ) {

      return showMessage(
        "adminRechargeLevelMessage",
        "Commission and task limit cannot be negative.",
        "error"
      );
    }


    try {

      await addDoc(
        collection(
          db,
          "rechargeLevels"
        ),
        {
          name,

          amount,

          commission,

          taskLimit,

          order,

          active,

          createdAt:
            serverTimestamp(),

          createdBy:
            currentAdmin.uid,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      clearInputs(
        "newRechargeName",
        "newRechargeAmount",
        "newRechargeCommission",
        "newRechargeTaskLimit",
        "newRechargeOrder",
        "newRechargeLevelName",
        "newRechargeLevelAmount",
        "newRechargeLevelCommission",
        "newRechargeLevelTaskLimit",
        "newRechargeLevelOrder"
      );


      showMessage(
        "adminRechargeLevelMessage",
        "Recharge level added successfully.",
        "success"
      );


      await loadAdminRechargeLevels();

    } catch (error) {

      console.error(
        "Add recharge level error:",
        error
      );

      showMessage(
        "adminRechargeLevelMessage",
        error?.message ||
        "Failed to add recharge level.",
        "error"
      );
    }
  };


/* =========================================================
   EDIT RECHARGE LEVEL
========================================================= */

window.editRechargeLevel =
  async function (id) {

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
        return alert(
          "Recharge level not found."
        );
      }


      const data =
        snap.data() || {};


      const name =
        prompt(
          "Name:",
          data.name || ""
        );


      if (name === null) {
        return;
      }


      const amount =
        prompt(
          "Amount:",
          data.amount ?? 0
        );


      if (amount === null) {
        return;
      }


      const commission =
        prompt(
          "Commission:",
          data.commission ?? 0
        );


      if (
        commission === null
      ) {
        return;
      }


      const taskLimit =
        prompt(
          "Task Limit:",
          data.taskLimit ?? 0
        );


      if (
        taskLimit === null
      ) {
        return;
      }


      const order =
        prompt(
          "Order:",
          data.order ?? 0
        );


      if (order === null) {
        return;
      }


      await updateDoc(
        ref,
        {
          name:
            name.trim(),

          amount:
            safeNumber(amount),

          commission:
            safeNumber(commission),

          taskLimit:
            Math.floor(
              safeNumber(taskLimit)
            ),

          order:
            Math.floor(
              safeNumber(order)
            ),

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminRechargeLevels();

    } catch (error) {

      console.error(
        "Edit recharge level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to edit recharge level."
      );
    }
  };


/* =========================================================
   TOGGLE RECHARGE LEVEL
========================================================= */

window.toggleRechargeLevel =
  async function (
    id,
    active
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
            !active,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminRechargeLevels();

    } catch (error) {

      console.error(
        "Toggle recharge level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to update recharge level."
      );
    }
  };


/* =========================================================
   DELETE RECHARGE LEVEL
========================================================= */

window.deleteRechargeLevel =
  async function (id) {

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


      await loadAdminRechargeLevels();

    } catch (error) {

      console.error(
        "Delete recharge level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to delete recharge level."
      );
    }
  };


/* =========================================================
   TEAM DEPOSIT LEVELS
   SAME rechargeLevels COLLECTION
========================================================= */

async function loadAdminTeamDepositLevels() {

  window.ensureAdminTeamDepositSection?.();


  const container =
    getElementByIds(
      "adminTeamDepositLevelsList",
      "adminGTeamDepositLevelsList"
    );


  if (!container) {

    console.error(
      "Team Deposit Levels list not found."
    );

    return;
  }


  container.innerHTML =
    loadingHTML(
      "👥",
      "Loading Team Deposit Levels..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "rechargeLevels"
        )
      );


    const items =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            safeNumber(a.order) -
            safeNumber(b.order)
        );


    const countElement =
      getElementByIds(
        "adminTeamDepositCount"
      );


    if (countElement) {

      countElement.textContent =
        String(
          items.length
        );
    }


    if (!items.length) {

      container.innerHTML =
        emptyHTML(
          "👥",
          "No Team Deposit Levels",
          "Add Recharge Levels first."
        );

      return;
    }


    container.innerHTML =
      items
        .map(
          item =>
            rechargeLevelHTML(
              item.id,
              item
            )
        )
        .join("");

  } catch (error) {

    console.error(
      "Load Team Deposit Levels error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   WITHDRAW LEVELS
========================================================= */

async function loadAdminWithdrawLevels() {

  const container =
    getElementByIds(
      "adminWithdrawLevelsList"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "💸",
      "Loading Withdraw Levels..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "withdrawLevels"
        )
      );


    const items =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            safeNumber(a.order) -
            safeNumber(b.order)
        );


    container.innerHTML =
      items.length
        ? items
            .map(
              item =>
                withdrawLevelHTML(
                  item.id,
                  item
                )
            )
            .join("")
        : emptyHTML(
            "💸",
            "No Withdraw Levels"
          );

  } catch (error) {

    console.error(
      "Load withdraw levels error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   WITHDRAW LEVEL CARD
========================================================= */

function withdrawLevelHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `

    <div class="admin-level-card">

      <div class="admin-card-header">

        <div>

          <h3>
            💸
            ${escapeHTML(
              data.name ||
              "Withdraw Level"
            )}
          </h3>

          <span>
            Order:
            ${safeNumber(data.order)}
          </span>

        </div>

        <span
          class="${
            active
              ? "status-active"
              : "status-inactive"
          }"
        >
          ${active ? "Active" : "Inactive"}
        </span>

      </div>


      <div class="admin-card-grid">

        <div>
          <small>Amount</small>
          <strong>
            ETB ${formatAdminMoney(data.amount)}
          </strong>
        </div>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editWithdrawLevel('${escapeHTML(id)}')"
        >
          ✏️ Edit
        </button>

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleWithdrawLevel('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Activate"}
        </button>

        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteWithdrawLevel('${escapeHTML(id)}')"
        >
          🗑️ Delete
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   ADD WITHDRAW LEVEL
========================================================= */

window.addWithdrawLevel =
  async function () {

    const name =
      getElementByIds(
        "newWithdrawName",
        "newWithdrawLevelName"
      )
        ?.value
        ?.trim() ||
      "Withdraw Level";


    const amount =
      safeNumber(
        getElementByIds(
          "newWithdrawAmount",
          "newWithdrawLevelAmount"
        )?.value
      );


    const order =
      Math.floor(
        safeNumber(
          getElementByIds(
            "newWithdrawOrder",
            "newWithdrawLevelOrder"
          )?.value
        )
      );


    if (
      amount <= 0
    ) {

      return showMessage(
        "adminWithdrawLevelMessage",
        "Withdraw amount must be greater than 0.",
        "error"
      );
    }


    try {

      await addDoc(
        collection(
          db,
          "withdrawLevels"
        ),
        {
          name,

          amount,

          order,

          active: true,

          createdAt:
            serverTimestamp(),

          createdBy:
            currentAdmin.uid,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      clearInputs(
        "newWithdrawName",
        "newWithdrawAmount",
        "newWithdrawOrder",
        "newWithdrawLevelName",
        "newWithdrawLevelAmount",
        "newWithdrawLevelOrder"
      );


      showMessage(
        "adminWithdrawLevelMessage",
        "Withdraw level added successfully.",
        "success"
      );


      await loadAdminWithdrawLevels();

    } catch (error) {

      console.error(
        "Add withdraw level error:",
        error
      );

      showMessage(
        "adminWithdrawLevelMessage",
        error?.message ||
        "Failed to add withdraw level.",
        "error"
      );
    }
  };


/* =========================================================
   EDIT WITHDRAW LEVEL
========================================================= */

window.editWithdrawLevel =
  async function (id) {

    try {

      const ref =
        doc(
          db,
          "withdrawLevels",
          id
        );


      const snap =
        await getDoc(ref);


      if (!snap.exists()) {
        return alert(
          "Withdraw level not found."
        );
      }


      const data =
        snap.data() || {};


      const name =
        prompt(
          "Name:",
          data.name || ""
        );


      if (name === null) {
        return;
      }


      const amount =
        prompt(
          "Amount:",
          data.amount ?? 0
        );


      if (amount === null) {
        return;
      }


      const order =
        prompt(
          "Order:",
          data.order ?? 0
        );


      if (order === null) {
        return;
      }


      await updateDoc(
        ref,
        {
          name:
            name.trim(),

          amount:
            safeNumber(amount),

          order:
            Math.floor(
              safeNumber(order)
            ),

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminWithdrawLevels();

    } catch (error) {

      console.error(
        "Edit withdraw level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to edit withdraw level."
      );
    }
  };


/* =========================================================
   TOGGLE WITHDRAW LEVEL
========================================================= */

window.toggleWithdrawLevel =
  async function (
    id,
    active
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
            !active,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminWithdrawLevels();

    } catch (error) {

      console.error(
        "Toggle withdraw level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to update withdraw level."
      );
    }
  };


/* =========================================================
   DELETE WITHDRAW LEVEL
========================================================= */

window.deleteWithdrawLevel =
  async function (id) {

    if (
      !confirm(
        "Delete this withdraw level?"
      )
    ) {
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


      await loadAdminWithdrawLevels();

    } catch (error) {

      console.error(
        "Delete withdraw level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to delete withdraw level."
      );
    }
  };


/* =========================================================
   PAYMENT METHODS
========================================================= */

async function loadAdminPaymentMethods() {

  const container =
    getElementByIds(
      "adminPaymentMethodsList",
      "adminPaymentsList"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "💳",
      "Loading Payment Methods..."
    );


  try {

    const ref =
      collection(
        db,
        "settings",
        "paymentMethods",
        "methods"
      );


    const snapshot =
      await getDocs(ref);


    const items =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            safeNumber(a.order) -
            safeNumber(b.order)
        );


    container.innerHTML =
      items.length
        ? items
            .map(
              item =>
                paymentMethodHTML(
                  item.id,
                  item
                )
            )
            .join("")
        : emptyHTML(
            "💳",
            "No Payment Methods"
          );

  } catch (error) {

    console.error(
      "Load payment methods error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   PAYMENT METHOD CARD
========================================================= */

function paymentMethodHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `

    <div class="admin-level-card">

      <div class="admin-card-header">

        <div>

          <h3>
            💳
            ${escapeHTML(
              data.name ||
              "Payment Method"
            )}
          </h3>

        </div>

        <span
          class="${
            active
              ? "status-active"
              : "status-inactive"
          }"
        >
          ${active ? "Active" : "Inactive"}
        </span>

      </div>


      <div class="admin-card-grid">

        <div>
          <small>Account Name</small>
          <strong>
            ${escapeHTML(
              data.accountName ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <small>Account Number</small>
          <strong>
            ${escapeHTML(
              data.accountNumber ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <small>Order</small>
          <strong>
            ${safeNumber(data.order)}
          </strong>
        </div>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editPaymentMethod('${escapeHTML(id)}')"
        >
          ✏️ Edit
        </button>

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.togglePaymentMethod('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Activate"}
        </button>

        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deletePaymentMethod('${escapeHTML(id)}')"
        >
          🗑️ Delete
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   ADD PAYMENT METHOD
========================================================= */

window.addPaymentMethod =
  async function () {

    const name =
      getElementByIds(
        "newPaymentName",
        "newPaymentMethodName"
      )
        ?.value
        ?.trim();


    const accountName =
      $("newPaymentAccountName")
        ?.value
        ?.trim();


    const accountNumber =
      $("newPaymentAccountNumber")
        ?.value
        ?.trim();


    const order =
      Math.floor(
        safeNumber(
          getElementByIds(
            "newPaymentOrder",
            "newPaymentMethodOrder"
          )?.value
        )
      );


    if (
      !name ||
      !accountName ||
      !accountNumber
    ) {

      return showMessage(
        "adminPaymentMessage",
        "Please fill all payment method fields.",
        "error"
      );
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

          createdBy:
            currentAdmin.uid,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      clearInputs(
        "newPaymentName",
        "newPaymentMethodName",
        "newPaymentAccountName",
        "newPaymentAccountNumber",
        "newPaymentOrder",
        "newPaymentMethodOrder"
      );


      showMessage(
        "adminPaymentMessage",
        "Payment method added successfully.",
        "success"
      );


      await loadAdminPaymentMethods();

    } catch (error) {

      console.error(
        "Add payment method error:",
        error
      );

      showMessage(
        "adminPaymentMessage",
        error?.message ||
        "Failed to add payment method.",
        "error"
      );
    }
  };


/* =========================================================
   EDIT PAYMENT METHOD
========================================================= */

window.editPaymentMethod =
  async function (id) {

    try {

      const ref =
        doc(
          db,
          "settings",
          "paymentMethods",
          "methods",
          id
        );


      const snap =
        await getDoc(ref);


      if (!snap.exists()) {
        return alert(
          "Payment method not found."
        );
      }


      const data =
        snap.data() || {};


      const name =
        prompt(
          "Payment method name:",
          data.name || ""
        );


      if (name === null) {
        return;
      }


      const accountName =
        prompt(
          "Account name:",
          data.accountName || ""
        );


      if (
        accountName === null
      ) {
        return;
      }


      const accountNumber =
        prompt(
          "Account number:",
          data.accountNumber || ""
        );


      if (
        accountNumber === null
      ) {
        return;
      }


      const order =
        prompt(
          "Order:",
          data.order ?? 0
        );


      if (order === null) {
        return;
      }


      await updateDoc(
        ref,
        {
          name:
            name.trim(),

          accountName:
            accountName.trim(),

          accountNumber:
            accountNumber.trim(),

          order:
            Math.floor(
              safeNumber(order)
            ),

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminPaymentMethods();

    } catch (error) {

      console.error(
        "Edit payment method error:",
        error
      );

      alert(
        error?.message ||
        "Failed to edit payment method."
      );
    }
  };


/* =========================================================
   TOGGLE PAYMENT METHOD
========================================================= */

window.togglePaymentMethod =
  async function (
    id,
    active
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
            !active,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminPaymentMethods();

    } catch (error) {

      console.error(
        "Toggle payment method error:",
        error
      );

      alert(
        error?.message ||
        "Failed to update payment method."
      );
    }
  };


/* =========================================================
   DELETE PAYMENT METHOD
========================================================= */

window.deletePaymentMethod =
  async function (id) {

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


      await loadAdminPaymentMethods();

    } catch (error) {

      console.error(
        "Delete payment method error:",
        error
      );

      alert(
        error?.message ||
        "Failed to delete payment method."
      );
    }
  };


/* =========================================================
   USERS
========================================================= */

async function loadAdminUsers() {

  const container =
    $("adminUsersList");


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "👤",
      "Loading Users..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "users"
        )
      );


    const items =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            getMillis(b.createdAt) -
            getMillis(a.createdAt)
        );


    container.innerHTML =
      items.length
        ? items
            .map(
              item =>
                userCardHTML(
                  item.id,
                  item
                )
            )
            .join("")
        : emptyHTML(
            "👤",
            "No Users"
          );

  } catch (error) {

    console.error(
      "Load users error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   USER CARD
========================================================= */

function userCardHTML(
  id,
  data
) {

  return `

    <div class="admin-user-card">

      <div class="admin-card-header">

        <div>

          <h3>
            👤
            ${escapeHTML(
              data.fullName ||
              data.name ||
              "User"
            )}
          </h3>

          <small>
            ${escapeHTML(
              data.email ||
              "No email"
            )}
          </small>

        </div>

        <span>
          ${
            data.isAdmin === true ||
            data.role === "admin"
              ? "ADMIN"
              : "USER"
          }
        </span>

      </div>


      <div class="admin-card-grid">

        <div>
          <small>Total Balance</small>
          <strong>
            ETB ${formatAdminMoney(data.totalBalance)}
          </strong>
        </div>

        <div>
          <small>Total Recharge</small>
          <strong>
            ETB ${formatAdminMoney(data.totalRecharge)}
          </strong>
        </div>

        <div>
          <small>VIP</small>
          <strong>
            ${escapeHTML(
              data.vipLevel ||
              "VIP 0"
            )}
          </strong>
        </div>

        <div>
          <small>Referral Code</small>
          <strong>
            ${escapeHTML(
              data.referralCode ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <small>Account Number</small>
          <strong>
            ${escapeHTML(
              data.accountNumber ||
              "—"
            )}
          </strong>
        </div>

        <div>
          <small>Created</small>
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
   CCUS ADMIN - TASK SETTINGS + TASK MANAGEMENT
   FINAL STABLE VERSION

   IMPORTANT RULES
   ---------------------------------------------------------
   1. Each task has its OWN Firestore reward.

   2. taskSettings.rewardPerTask is NOT the authoritative
      reward for individual tasks.

   3. Firestore:
        tasks/{taskId}.reward
      is the ONLY authoritative task reward.

   4. Every active task must have:
        reward > 0

   5. Invalid reward cannot be saved.

   6. Toggle ACTIVE / INACTIVE never changes reward.

   7. Task ID is the REAL Firestore document ID.

   8. Task LIMIT is NOT managed here.
      User taskLimit must be updated by the
      APPROVED RECHARGE / LEVEL logic.

   9. Task claim logic must enforce:
        users/{uid}.taskLimit

   10. taskSettings.rewardPerTask is retained only
       for admin configuration / compatibility UI.
========================================================= */


/* =========================================================
   SAFE NUMBER
========================================================= */

function taskAdminSafeNumber(value, fallback = 0) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


/* =========================================================
   TASK REWARD VALIDATOR
========================================================= */

function isValidAdminTaskReward(value) {

  const reward =
    Number(value);

  return (
    Number.isFinite(reward) &&
    reward > 0
  );
}


/* =========================================================
   TASK TITLE
========================================================= */

function getAdminTaskTitle(data = {}) {

  return String(
    data.title ??
    data.name ??
    "Task"
  ).trim() || "Task";
}


/* =========================================================
   TASK SETTINGS
========================================================= */

async function loadTaskSettings() {

  try {

    const ref =
      doc(
        db,
        "settings",
        "taskSettings"
      );

    const snap =
      await getDoc(ref);

    const activeInput =
      $("taskSettingsActive");

    const rewardInput =
      $("taskSettingsReward");


    /* -------------------------------------------------------
       DOCUMENT DOES NOT EXIST
    ------------------------------------------------------- */

    if (!snap.exists()) {

      if (activeInput) {
        activeInput.checked = true;
      }

      if (rewardInput) {
        rewardInput.value = "";
      }

      return;
    }


    const data =
      snap.data() || {};


    /* -------------------------------------------------------
       ACTIVE
    ------------------------------------------------------- */

    if (activeInput) {

      activeInput.checked =
        data.active !== false;
    }


    /* -------------------------------------------------------
       GLOBAL REWARD
       IMPORTANT:
       This value is NOT used for individual tasks.
    ------------------------------------------------------- */

    if (rewardInput) {

      const value =
        Number(
          data.rewardPerTask
        );

      rewardInput.value =
        Number.isFinite(value)
          ? value
          : "";
    }


    console.log(
      "⚙️ TASK SETTINGS LOADED:",
      {
        active:
          data.active !== false,

        rewardPerTask:
          data.rewardPerTask
      }
    );

  } catch (error) {

    console.error(
      "❌ Load task settings error:",
      error
    );

  }
}


/* =========================================================
   SAVE TASK SETTINGS

   IMPORTANT:
   rewardPerTask is ONLY an admin setting.

   It MUST NOT replace:
      tasks/{taskId}.reward
========================================================= */

window.saveTaskSettings =
async function () {

  if (!currentAdmin?.uid) {

    return showMessage(
      "adminTaskMessage",
      "Admin session not found.",
      "error"
    );
  }


  const active =
    $("taskSettingsActive")
      ?.checked !== false;


  const rewardInput =
    $("taskSettingsReward")
      ?.value;


  const rewardPerTask =
    Number(
      rewardInput
    );


  if (
    rewardInput === undefined ||
    rewardInput === null ||
    rewardInput === "" ||
    !Number.isFinite(
      rewardPerTask
    ) ||
    rewardPerTask <= 0
  ) {

    return showMessage(
      "adminTaskMessage",
      "Reward must be greater than 0.",
      "error"
    );
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

        rewardPerTask,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentAdmin.uid

      },
      {
        merge: true
      }
    );


    console.log(
      "✅ TASK SETTINGS SAVED:",
      {
        active,
        rewardPerTask
      }
    );


    showMessage(
      "adminTaskMessage",
      "Task settings saved successfully.",
      "success"
    );

  } catch (error) {

    console.error(
      "❌ Save task settings error:",
      error
    );


    showMessage(
      "adminTaskMessage",
      error?.message ||
      "Failed to save task settings.",
      "error"
    );

  }
};


/* =========================================================
   LOAD ADMIN TASKS
========================================================= */

async function loadAdminTasks() {

  const container =
    $("adminTasksList");


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "📝",
      "Loading Tasks..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "tasks"
        )
      );


    const items =
      snapshot.docs
        .map(
          docSnap => {

            const data =
              docSnap.data() || {};


            return {

              /* REAL FIRESTORE DOCUMENT ID */
              id:
                docSnap.id,

              ...data

            };

          }
        )
        .sort(
          (a, b) => {

            const orderA =
              taskAdminSafeNumber(
                a.order
              );

            const orderB =
              taskAdminSafeNumber(
                b.order
              );

            return (
              orderA -
              orderB
            );

          }
        );


    console.log(
      "📋 ADMIN TASK COUNT:",
      items.length
    );


    container.innerHTML =
      items.length

        ? items
            .map(
              item =>
                taskCardHTML(
                  item.id,
                  item
                )
            )
            .join("")

        : emptyHTML(
            "📝",
            "No Tasks"
          );


  } catch (error) {

    console.error(
      "❌ Load tasks error:",
      error
    );


    container.innerHTML =
      errorHTML(
        error?.message ||
        "Failed to load tasks."
      );

  }
}


/* =========================================================
   TASK CARD
========================================================= */

function taskCardHTML(
  id,
  data = {}
) {

  const active =
    data.active !== false;


  const reward =
    Number(
      data.reward
    );


  const validReward =
    isValidAdminTaskReward(
      reward
    );


  const rewardDisplay =
    validReward

      ? formatAdminMoney(
          reward
        )

      : "INVALID";


  const title =
    getAdminTaskTitle(
      data
    );


  const description =
    String(
      data.description ??
      data.message ??
      ""
    );


  const order =
    taskAdminSafeNumber(
      data.order
    );


  const safeId =
    escapeHTML(
      String(id)
    );


  return `

    <div
      class="admin-task-card"
      data-task-id="${safeId}"
    >

      <div class="admin-card-header">

        <div>

          <h3>

            📝

            ${escapeHTML(
              title
            )}

          </h3>


          <small>

            Order:
            ${order}

          </small>

        </div>


        <span
          class="${
            active
              ? "status-active"
              : "status-inactive"
          }"
        >

          ${
            active
              ? "Active"
              : "Inactive"
          }

        </span>

      </div>


      <p>

        ${escapeHTML(
          description
        )}

      </p>


      <div class="admin-card-grid">

        <div>

          <small>
            Reward
          </small>


          <strong
            ${
              !validReward
                ? 'style="color:#d00;"'
                : ""
            }
          >

            ${
              validReward
                ? `ETB ${rewardDisplay}`
                : "⚠️ INVALID REWARD"
            }

          </strong>

        </div>

      </div>


      <div class="admin-action-row">


        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editAdminTask('${safeId}')"
        >

          ✏️ Edit

        </button>


        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleAdminTask('${safeId}', ${active})"
        >

          ${
            active
              ? "Disable"
              : "Activate"
          }

        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteAdminTask('${safeId}')"
        >

          🗑️ Delete

        </button>


      </div>

    </div>

  `;
}


/* =========================================================
   ADD TASK

   Each task MUST have its own reward.

   Example:
     Task 1 -> reward 28
     Task 2 -> reward 35
     Task 3 -> reward 50

   No global reward fallback.
========================================================= */

window.addAdminTask =
async function () {

  if (!currentAdmin?.uid) {

    return showMessage(
      "adminTaskMessage",
      "Admin session not found.",
      "error"
    );
  }


  const title =
    $("newTaskTitle")
      ?.value
      ?.trim();


  const description =
    $("newTaskDescription")
      ?.value
      ?.trim();


  const order =
    Math.floor(
      taskAdminSafeNumber(
        $("newTaskOrder")
          ?.value
      )
    );


  const rewardInput =
    $("newTaskReward")
      ?.value;


  const active =
    $("newTaskActive")
      ? $("newTaskActive")
          .checked !== false
      : true;


  /* -------------------------------------------------------
     TITLE
  ------------------------------------------------------- */

  if (!title) {

    return showMessage(
      "adminTaskMessage",
      "Task title is required.",
      "error"
    );
  }


  /* -------------------------------------------------------
     REWARD
  ------------------------------------------------------- */

  const reward =
    Number(
      rewardInput
    );


  if (
    rewardInput === undefined ||
    rewardInput === null ||
    rewardInput === "" ||
    !Number.isFinite(reward) ||
    reward <= 0
  ) {

    return showMessage(
      "adminTaskMessage",
      "Task reward is required and must be greater than 0.",
      "error"
    );
  }


  /* -------------------------------------------------------
     ORDER
  ------------------------------------------------------- */

  if (
    !Number.isFinite(order) ||
    order < 0
  ) {

    return showMessage(
      "adminTaskMessage",
      "Invalid task order.",
      "error"
    );
  }


  try {

    const taskData = {

      title,

      name:
        title,

      description:
        description || "",

      message:
        description || "",

      order,

      /*
       * AUTHORITATIVE REWARD
       */
      reward,

      active,

      createdAt:
        serverTimestamp(),

      createdBy:
        currentAdmin.uid,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentAdmin.uid

    };


    const taskRef =
      await addDoc(
        collection(
          db,
          "tasks"
        ),
        taskData
      );


    console.log(
      "✅ TASK CREATED:",
      {
        id:
          taskRef.id,

        title,

        reward,

        order,

        active
      }
    );


    clearInputs(
      "newTaskTitle",
      "newTaskDescription",
      "newTaskOrder",
      "newTaskReward"
    );


    showMessage(
      "adminTaskMessage",
      "Task added successfully.",
      "success"
    );


    await loadAdminTasks();


  } catch (error) {

    console.error(
      "❌ Add task error:",
      error
    );


    showMessage(
      "adminTaskMessage",
      error?.message ||
      "Failed to add task.",
      "error"
    );

  }
};


/* =========================================================
   EDIT TASK
========================================================= */

window.editAdminTask =
async function (id) {

  if (!currentAdmin?.uid) {

    return alert(
      "Admin session not found."
    );
  }


  if (!id) {

    return alert(
      "Invalid task ID."
    );
  }


  try {

    const ref =
      doc(
        db,
        "tasks",
        String(id)
      );


    const snap =
      await getDoc(
        ref
      );


    if (!snap.exists()) {

      return alert(
        "Task not found."
      );
    }


    const data =
      snap.data() || {};


    /* -----------------------------------------------------
       TITLE
    ----------------------------------------------------- */

    const title =
      prompt(
        "Task title:",
        getAdminTaskTitle(
          data
        )
      );


    if (title === null) {
      return;
    }


    const cleanTitle =
      title.trim();


    if (!cleanTitle) {

      return alert(
        "Task title is required."
      );
    }


    /* -----------------------------------------------------
       DESCRIPTION
    ----------------------------------------------------- */

    const description =
      prompt(
        "Description:",
        String(
          data.description ??
          data.message ??
          ""
        )
      );


    if (
      description === null
    ) {

      return;
    }


    /* -----------------------------------------------------
       ORDER
    ----------------------------------------------------- */

    const order =
      prompt(
        "Order:",
        data.order ?? 0
      );


    if (
      order === null
    ) {

      return;
    }


    const orderNumber =
      Number(
        order
      );


    if (
      !Number.isFinite(
        orderNumber
      ) ||
      orderNumber < 0
    ) {

      return alert(
        "Invalid task order."
      );
    }


    /* -----------------------------------------------------
       REWARD
    ----------------------------------------------------- */

    const existingReward =
      Number(
        data.reward
      );


    const reward =
      prompt(
        "Reward:",
        Number.isFinite(
          existingReward
        )
          ? existingReward
          : ""
      );


    if (
      reward === null
    ) {

      return;
    }


    const rewardNumber =
      Number(
        reward
      );


    if (
      !isValidAdminTaskReward(
        rewardNumber
      )
    ) {

      return alert(
        "Reward must be greater than 0."
      );
    }


    /* -----------------------------------------------------
       UPDATE

       IMPORTANT:
       Do NOT modify active here.
       Existing active state is preserved.
    ----------------------------------------------------- */

    await updateDoc(
      ref,
      {

        title:
          cleanTitle,

        name:
          cleanTitle,

        description:
          description.trim(),

        message:
          description.trim(),

        order:
          Math.floor(
            orderNumber
          ),

        /*
         * AUTHORITATIVE TASK REWARD
         */
        reward:
          rewardNumber,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentAdmin.uid

      }
    );


    console.log(
      "✅ TASK UPDATED:",
      {
        id,
        reward:
          rewardNumber
      }
    );


    showMessage(
      "adminTaskMessage",
      "Task updated successfully.",
      "success"
    );


    await loadAdminTasks();


  } catch (error) {

    console.error(
      "❌ Edit task error:",
      error
    );


    alert(
      error?.message ||
      "Failed to edit task."
    );

  }
};


/* =========================================================
   TOGGLE TASK

   IMPORTANT:
   Toggle changes ONLY active status.
   Reward is preserved.
========================================================= */

window.toggleAdminTask =
async function (
  id,
  active
) {

  if (!currentAdmin?.uid) {

    return alert(
      "Admin session not found."
    );
  }


  if (!id) {

    return alert(
      "Invalid task ID."
    );
  }


  try {

    const ref =
      doc(
        db,
        "tasks",
        String(id)
      );


    const snap =
      await getDoc(
        ref
      );


    if (!snap.exists()) {

      return alert(
        "Task not found."
      );
    }


    const data =
      snap.data() || {};


    /*
     * Prevent activating an invalid-reward task.
     */
    if (
      active === false
    ) {

      const reward =
        Number(
          data.reward
        );


      if (
        !isValidAdminTaskReward(
          reward
        )
      ) {

        return alert(
          "This task cannot be activated because its reward is invalid. Edit the task and set a reward greater than 0."
        );
      }
    }


    const newActive =
      !Boolean(
        active
      );


    await updateDoc(
      ref,
      {

        active:
          newActive,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          currentAdmin.uid

      }
    );


    console.log(
      "🔄 TASK STATUS UPDATED:",
      {
        id,

        oldActive:
          active,

        newActive
      }
    );


    await loadAdminTasks();


  } catch (error) {

    console.error(
      "❌ Toggle task error:",
      error
    );


    alert(
      error?.message ||
      "Failed to update task."
    );

  }
};


/* =========================================================
   DELETE TASK
========================================================= */

window.deleteAdminTask =
async function (id) {

  if (!currentAdmin?.uid) {

    return alert(
      "Admin session not found."
    );
  }


  if (!id) {

    return alert(
      "Invalid task ID."
    );
  }


  const confirmed =
    confirm(
      "Delete this task?"
    );


  if (!confirmed) {
    return;
  }


  try {

    await deleteDoc(
      doc(
        db,
        "tasks",
        String(id)
      )
    );


    console.log(
      "🗑️ TASK DELETED:",
      id
    );


    showMessage(
      "adminTaskMessage",
      "Task deleted successfully.",
      "success"
    );


    await loadAdminTasks();


  } catch (error) {

    console.error(
      "❌ Delete task error:",
      error
    );


    alert(
      error?.message ||
      "Failed to delete task."
    );

  }
};


/* =========================================================
   DEBUG - CHECK ALL TASKS

   Console:
     checkCCUSAdminTasks()
========================================================= */

window.checkCCUSAdminTasks =
async function () {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "tasks"
        )
      );


    let total =
      snapshot.size;


    let active =
      0;


    let validReward =
      0;


    let invalidReward =
      0;


    const invalidTasks =
      [];


    const activeTasks =
      [];


    snapshot.forEach(
      docSnap => {

        const data =
          docSnap.data() || {};


        const isActive =
          data.active !== false;


        const reward =
          Number(
            data.reward
          );


        const valid =
          isValidAdminTaskReward(
            reward
          );


        if (isActive) {

          active++;

          activeTasks.push({
            id:
              docSnap.id,

            title:
              getAdminTaskTitle(
                data
              ),

            reward,

            validReward:
              valid
          });
        }


        if (valid) {

          validReward++;

        } else {

          invalidReward++;


          invalidTasks.push({

            id:
              docSnap.id,

            title:
              getAdminTaskTitle(
                data
              ),

            reward:
              data.reward

          });

        }

      }
    );


    console.table(
      activeTasks
    );


    console.table(
      invalidTasks
    );


    console.log(
      "========== CCUS TASK CHECK =========="
    );


    console.log(
      "TOTAL TASKS:",
      total
    );


    console.log(
      "ACTIVE TASKS:",
      active
    );


    console.log(
      "VALID REWARD:",
      validReward
    );


    console.log(
      "INVALID REWARD:",
      invalidReward
    );


    console.log(
      "ACTIVE TASKS:",
      activeTasks
    );


    console.log(
      "INVALID TASKS:",
      invalidTasks
    );


    return {

      total,

      active,

      validReward,

      invalidReward,

      activeTasks,

      invalidTasks

    };


  } catch (error) {

    console.error(
      "❌ Task check error:",
      error
    );


    return null;
  }
};


/* =========================================================
   DEBUG - CHECK ONE TASK
========================================================= */

window.checkCCUSAdminTask =
async function (taskId) {

  if (!taskId) {

    console.error(
      "❌ Task ID is required."
    );

    return null;
  }


  try {

    const ref =
      doc(
        db,
        "tasks",
        String(taskId)
      );


    const snap =
      await getDoc(
        ref
      );


    if (!snap.exists()) {

      console.error(
        "❌ Task not found:",
        taskId
      );

      return null;
    }


    const data =
      snap.data() || {};


    const result = {

      id:
        snap.id,

      title:
        getAdminTaskTitle(
          data
        ),

      active:
        data.active !== false,

      reward:
        Number(
          data.reward
        ),

      validReward:
        isValidAdminTaskReward(
          data.reward
        ),

      order:
        taskAdminSafeNumber(
          data.order
        )

    };


    console.log(
      "========== CCUS TASK =========="
    );


    console.table(
      result
    );


    return result;


  } catch (error) {

    console.error(
      "❌ Check task error:",
      error
    );


    return null;
  }
};


/* =========================================================
   REFRESH TASKS
========================================================= */

window.refreshAdminTasks =
async function () {

  await loadAdminTasks();

};


/* =========================================================
   OPTIONAL INITIAL LOAD
========================================================= */

window.loadAdminTasks =
loadAdminTasks;


window.loadTaskSettings =
loadTaskSettings;

/* =========================================================
   ANNOUNCEMENTS
========================================================= */

async function loadAdminAnnouncements() {

  const container =
    $("adminAnnouncementsList");


  if (!container) {
    return;
  }


  container.innerHTML =
    loadingHTML(
      "📢",
      "Loading Announcements..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "message"
        )
      );


    const items =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            getMillis(b.createdAt) -
            getMillis(a.createdAt)
        );


    container.innerHTML =
      items.length
        ? items
            .map(
              item =>
                adminAnnouncementCardHTML(
                  item.id,
                  item
                )
            )
            .join("")
        : emptyHTML(
            "📢",
            "No Announcements"
          );

  } catch (error) {

    console.error(
      "Load announcements error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message
      );
  }
}


/* =========================================================
   ANNOUNCEMENT CARD
========================================================= */

function adminAnnouncementCardHTML(
  id,
  data
) {

  const active =
    data.active !== false;


  return `

    <div class="admin-announcement-card">

      <div class="admin-card-header">

        <div>

          <h3>
            📢
            ${escapeHTML(
              data.title ||
              "Announcement"
            )}
          </h3>

          ${
            data.important === true
              ? `<span class="status-important">IMPORTANT</span>`
              : ""
          }

        </div>

        <span
          class="${
            active
              ? "status-active"
              : "status-inactive"
          }"
        >
          ${active ? "Active" : "Inactive"}
        </span>

      </div>


      <p>
        ${escapeHTML(
          data.message ||
          ""
        )}
      </p>


      <small>
        ${escapeHTML(
          formatDate(
            data.createdAt
          )
        )}
      </small>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editAdminAnnouncement('${escapeHTML(id)}')"
        >
          ✏️ Edit
        </button>

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleAdminAnnouncement('${escapeHTML(id)}', ${active})"
        >
          ${active ? "Disable" : "Activate"}
        </button>

        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteAdminAnnouncement('${escapeHTML(id)}')"
        >
          🗑️ Delete
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   ADD ANNOUNCEMENT
========================================================= */

window.addAdminAnnouncement =
  async function () {

    const title =
      $("newAnnouncementTitle")
        ?.value
        ?.trim();


    const message =
      $("newAnnouncementMessage")
        ?.value
        ?.trim();


    const active =
      $("newAnnouncementActive")
        ? $("newAnnouncementActive").checked !== false
        : true;


    const important =
      $("newAnnouncementImportant")
        ? $("newAnnouncementImportant").checked === true
        : false;


    if (!title || !message) {

      return showMessage(
        "adminAnnouncementMessage",
        "Title and message are required.",
        "error"
      );
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

          createdBy:
            currentAdmin.uid,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      clearInputs(
        "newAnnouncementTitle",
        "newAnnouncementMessage"
      );


      showMessage(
        "adminAnnouncementMessage",
        "Announcement added successfully.",
        "success"
      );


      await loadAdminAnnouncements();

    } catch (error) {

      console.error(
        "Add announcement error:",
        error
      );

      showMessage(
        "adminAnnouncementMessage",
        error?.message ||
        "Failed to add announcement.",
        "error"
      );
    }
  };


/* =========================================================
   EDIT ANNOUNCEMENT
========================================================= */

window.editAdminAnnouncement =
  async function (id) {

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
        return alert(
          "Announcement not found."
        );
      }


      const data =
        snap.data() || {};


      const title =
        prompt(
          "Title:",
          data.title || ""
        );


      if (title === null) {
        return;
      }


      const message =
        prompt(
          "Message:",
          data.message || ""
        );


      if (
        message === null
      ) {
        return;
      }


      const important =
        confirm(
          "Should this announcement be marked IMPORTANT?"
        );


      await updateDoc(
        ref,
        {
          title:
            title.trim(),

          message:
            message.trim(),

          important,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminAnnouncements();

    } catch (error) {

      console.error(
        "Edit announcement error:",
        error
      );

      alert(
        error?.message ||
        "Failed to edit announcement."
      );
    }
  };


/* =========================================================
   TOGGLE ANNOUNCEMENT
========================================================= */

window.toggleAdminAnnouncement =
  async function (
    id,
    active
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
            !active,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminAnnouncements();

    } catch (error) {

      console.error(
        "Toggle announcement error:",
        error
      );

      alert(
        error?.message ||
        "Failed to update announcement."
      );
    }
  };


/* =========================================================
   DELETE ANNOUNCEMENT
========================================================= */

window.deleteAdminAnnouncement =
  async function (id) {

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


      await loadAdminAnnouncements();

    } catch (error) {

      console.error(
        "Delete announcement error:",
        error
      );

      alert(
        error?.message ||
        "Failed to delete announcement."
      );
    }
  };


/* =========================================================
   CALENDAR DATA
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
    snap.data() || {};


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


  return {

    closed:
      data.closed === true ||
      data.isClosed === true,

    closedDates:
      [...new Set(
        closedDates
          .map(String)
      )],

    restDates:
      [...new Set(
        restDates
          .map(String)
      )]
  };
}


/* =========================================================
   LOAD CALENDAR
========================================================= */

async function loadAdminCalendar() {

  const container =
    $("adminCalendarList");


  if (!container) {
    return;
  }


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
        error?.message
      );
  }
}


/* =========================================================
   RENDER CALENDAR
========================================================= */

function renderAdminCalendar(
  data
) {

  const container =
    $("adminCalendarList");


  if (!container) {
    return;
  }


  const globalClosed =
    $("adminCalendarGlobalClosed");


  if (globalClosed) {

    if (
      globalClosed.type ===
      "checkbox"
    ) {

      globalClosed.checked =
        data.closed === true;
    }
  }


  const dates = [];


  data.closedDates.forEach(
    date => {

      dates.push({
        date,
        type:
          "Closed"
      });
    }
  );


  data.restDates.forEach(
    date => {

      dates.push({
        date,
        type:
          "Rest"
      });
    }
  );


  dates.sort(
    (a, b) =>
      a.date.localeCompare(
        b.date
      )
  );


  if (!dates.length) {

    container.innerHTML =
      emptyHTML(
        "📅",
        "No Special Dates"
      );

    return;
  }


  container.innerHTML =
    dates
      .map(
        item => `

          <div class="admin-calendar-item">

            <div>

              <strong>
                ${escapeHTML(item.date)}
              </strong>

              <span>
                ${escapeHTML(item.type)}
              </span>

            </div>

            <button
              type="button"
              class="admin-danger-btn"
              onclick="window.removeAdminCalendarDate('${escapeHTML(item.date)}')"
            >
              🗑️ Remove
            </button>

          </div>

        `
      )
      .join("");
}


/* =========================================================
   SAVE CALENDAR
========================================================= */

async function saveAdminCalendarData(
  data
) {

  const closedDates =
    [...new Set(
      (data.closedDates || [])
        .map(String)
    )];


  const restDates =
    [...new Set(
      (data.restDates || [])
        .map(String)
    )];


  /*
     Same date cannot be both
     Closed and Rest.
  */

  const cleanRestDates =
    restDates.filter(
      date =>
        !closedDates.includes(
          date
        )
    );


  await setDoc(
    doc(
      db,
      "settings",
      "calendar"
    ),
    {
      closed:
        data.closed === true,

      isClosed:
        data.closed === true,

      closedDates,

      restDates:
        cleanRestDates,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentAdmin.uid
    },
    {
      merge: true
    }
  );
}


/* =========================================================
   ADD REST DATE
========================================================= */

window.addAdminRestDate =
  async function () {

    const date =
      $("newCalendarDate")
        ?.value
        ?.trim();


    if (!date) {

      return showMessage(
        "adminCalendarMessage",
        "Please select a date.",
        "error"
      );
    }


    try {

      const data =
        await getAdminCalendarData();


      data.restDates.push(
        date
      );


      data.closedDates =
        data.closedDates.filter(
          item =>
            item !== date
        );


      await saveAdminCalendarData(
        data
      );


      showMessage(
        "adminCalendarMessage",
        "Rest date saved.",
        "success"
      );


      await loadAdminCalendar();

    } catch (error) {

      console.error(
        "Add rest date error:",
        error
      );

      showMessage(
        "adminCalendarMessage",
        error?.message ||
        "Failed to save rest date.",
        "error"
      );
    }
  };


/* =========================================================
   ADD CLOSED DATE
========================================================= */

window.addAdminClosedDate =
  async function () {

    const date =
      $("newCalendarDate")
        ?.value
        ?.trim();


    if (!date) {

      return showMessage(
        "adminCalendarMessage",
        "Please select a date.",
        "error"
      );
    }


    try {

      const data =
        await getAdminCalendarData();


      data.closedDates.push(
        date
      );


      data.restDates =
        data.restDates.filter(
          item =>
            item !== date
        );


      await saveAdminCalendarData(
        data
      );


      showMessage(
        "adminCalendarMessage",
        "Closed date saved.",
        "success"
      );


      await loadAdminCalendar();

    } catch (error) {

      console.error(
        "Add closed date error:",
        error
      );

      showMessage(
        "adminCalendarMessage",
        error?.message ||
        "Failed to save closed date.",
        "error"
      );
    }
  };


/* =========================================================
   REMOVE CALENDAR DATE
========================================================= */

window.removeAdminCalendarDate =
  async function (date) {

    try {

      const data =
        await getAdminCalendarData();


      data.closedDates =
        data.closedDates.filter(
          item =>
            item !== date
        );


      data.restDates =
        data.restDates.filter(
          item =>
            item !== date
        );


      await saveAdminCalendarData(
        data
      );


      await loadAdminCalendar();

    } catch (error) {

      console.error(
        "Remove calendar date error:",
        error
      );

      alert(
        error?.message ||
        "Failed to remove calendar date."
      );
    }
  };


/* =========================================================
   COMPATIBILITY ALIAS
========================================================= */

window.removeAdminCalendarDate =
  window.removeAdminCalendarDate;


/* =========================================================
   TOGGLE GLOBAL CALENDAR
========================================================= */

window.toggleGlobalCalendarClosed =
  async function () {

    try {

      const data =
        await getAdminCalendarData();


      data.closed =
        !data.closed;


      await saveAdminCalendarData(
        data
      );


      showMessage(
        "adminCalendarMessage",
        data.closed
          ? "Calendar globally closed."
          : "Calendar globally opened.",
        "success"
      );


      await loadAdminCalendar();

    } catch (error) {

      console.error(
        "Toggle global calendar error:",
        error
      );

      showMessage(
        "adminCalendarMessage",
        error?.message ||
        "Failed to update calendar.",
        "error"
      );
    }
  };


/* =========================================================
   INCOME LEVELS
========================================================= */

async function loadAdminIncomeLevels() {

  ensureAdminIncomeLevelsSection();


  const container =
    $("adminIncomeLevelsList");


  if (!container) {

    console.error(
      "adminIncomeLevelsList NOT FOUND"
    );

    return;
  }


  container.innerHTML =
    loadingHTML(
      "📊",
      "Loading Income Levels..."
    );


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "incomeLevels"
        )
      );


    incomeLevelsCache =
      snapshot.docs
        .map(
          docSnap => ({
            id:
              docSnap.id,

            ...(docSnap.data() || {})
          })
        )
        .sort(
          (a, b) =>
            safeNumber(a.level) -
            safeNumber(b.level)
        );


    if (
      incomeLevelsCache.length === 0
    ) {

      container.innerHTML =
        emptyHTML(
          "📊",
          "No Income Levels",
          "Click + Add Income Level."
        );

      return;
    }


    container.innerHTML =
      incomeLevelsCache
        .map(
          level =>
            incomeLevelCardHTML(
              level.id,
              level
            )
        )
        .join("");

  } catch (error) {

    console.error(
      "Load income levels error:",
      error
    );

    container.innerHTML =
      errorHTML(
        error?.message ||
        "Failed to load Income Levels."
      );
  }
}


/* =========================================================
   INCOME LEVEL CARD
========================================================= */

function incomeLevelCardHTML(
  id,
  level
) {

  const levelNumber =
    safeNumber(
      level.level
    );


  const price =
    safeNumber(
      level.price
    );


  const daily =
    safeNumber(
      level.daily
    );


  const monthly =
    safeNumber(
      level.monthly
    );


  const yearly =
    safeNumber(
      level.yearly
    );


  const active =
    level.active !== false;


  return `

    <div class="admin-level-card">

      <div class="income-level-header">

        <div>

          <h3>
            📊 Income Level
            ${levelNumber}
          </h3>

          <span
            class="${
              active
                ? "status-active"
                : "status-inactive"
            }"
          >
            ${
              active
                ? "Active"
                : "Inactive"
            }
          </span>

        </div>


        <div class="income-level-price">

          ETB
          ${formatAdminMoney(price)}

        </div>

      </div>


      <div class="income-level-details">

        <div>
          <small>Daily</small>
          <strong>
            ETB
            ${formatAdminMoney(daily)}
          </strong>
        </div>

        <div>
          <small>Monthly</small>
          <strong>
            ETB
            ${formatAdminMoney(monthly)}
          </strong>
        </div>

        <div>
          <small>Yearly</small>
          <strong>
            ETB
            ${formatAdminMoney(yearly)}
          </strong>
        </div>

      </div>


      <div class="admin-action-row">

        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.editAdminIncomeLevel('${escapeHTML(id)}')"
        >
          ✏️ Edit
        </button>


        <button
          type="button"
          class="admin-secondary-btn"
          onclick="window.toggleAdminIncomeLevel('${escapeHTML(id)}', ${active})"
        >
          ${
            active
              ? "Disable"
              : "Activate"
          }
        </button>


        <button
          type="button"
          class="admin-danger-btn"
          onclick="window.deleteAdminIncomeLevel('${escapeHTML(id)}')"
        >
          🗑️ Delete
        </button>

      </div>

    </div>

  `;
}


/* =========================================================
   OPEN INCOME FORM
========================================================= */

window.openAdminIncomeLevelForm =
  function (
    levelId = ""
  ) {

    const existing =
      incomeLevelsCache.find(
        item =>
          String(item.id) ===
          String(levelId)
      );


    const level =
      existing || {

        level: "",

        price: "",

        daily: "",

        monthly: "",

        yearly: "",

        active: true
      };


    const formContainer =
      $("adminIncomeLevelForm");


    if (!formContainer) {

      console.error(
        "adminIncomeLevelForm NOT FOUND"
      );

      return;
    }


    formContainer.innerHTML = `

      <div class="income-form-box admin-form-card">

        <h3>
          ${
            existing
              ? "Edit Income Level"
              : "Add Income Level"
          }
        </h3>


        <div class="admin-form-grid">

          <label>
            Level

            <input
              type="number"
              id="incomeLevelNumber"
              min="1"
              step="1"
              value="${escapeHTML(
                level.level
              )}"
            >
          </label>


          <label>
            Price (ETB)

            <input
              type="number"
              id="incomeLevelPrice"
              min="0"
              step="0.01"
              value="${escapeHTML(
                level.price
              )}"
            >
          </label>


          <label>
            Daily Income (ETB)

            <input
              type="number"
              id="incomeLevelDaily"
              min="0"
              step="0.01"
              value="${escapeHTML(
                level.daily
              )}"
            >
          </label>


          <label>
            Monthly Income (ETB)

            <input
              type="number"
              id="incomeLevelMonthly"
              min="0"
              step="0.01"
              value="${escapeHTML(
                level.monthly
              )}"
            >
          </label>


          <label>
            Yearly Income (ETB)

            <input
              type="number"
              id="incomeLevelYearly"
              min="0"
              step="0.01"
              value="${escapeHTML(
                level.yearly
              )}"
            >
          </label>


          <label>
            Status

            <select
              id="incomeLevelActive"
            >

              <option
                value="true"
                ${
                  level.active !== false
                    ? "selected"
                    : ""
                }
              >
                Active
              </option>

              <option
                value="false"
                ${
                  level.active === false
                    ? "selected"
                    : ""
                }
              >
                Inactive
              </option>

            </select>

          </label>

        </div>


        <div
          class="income-form-actions admin-action-row"
        >

          <button
            type="button"
            class="admin-primary-btn"
            onclick="window.saveAdminIncomeLevel('${existing ? encodeURIComponent(existing.id) : ""}')"
          >
            💾 Save
          </button>


          <button
            type="button"
            class="admin-secondary-btn"
            onclick="window.closeAdminIncomeLevelForm()"
          >
            Cancel
          </button>

        </div>


        <div
          id="incomeLevelFormMessage"
          class="admin-message"
        ></div>

      </div>

    `;


    formContainer.classList.remove(
      "hidden"
    );

    formContainer.hidden = false;
  };


/* =========================================================
   CLOSE INCOME FORM
========================================================= */

window.closeAdminIncomeLevelForm =
  function () {

    const container =
      $("adminIncomeLevelForm");


    if (!container) {
      return;
    }


    container.innerHTML = "";

    container.classList.add(
      "hidden"
    );

    container.hidden = true;
  };


/* =========================================================
   SAVE INCOME LEVEL
========================================================= */

window.saveAdminIncomeLevel =
  async function (
    encodedId = ""
  ) {

    if (!currentAdmin) {

      return showMessage(
        "incomeLevelFormMessage",
        "Admin session not found.",
        "error"
      );
    }


    const level =
      Math.floor(
        safeNumber(
          $("incomeLevelNumber")
            ?.value
        )
      );


    const price =
      safeNumber(
        $("incomeLevelPrice")
          ?.value
      );


    const daily =
      safeNumber(
        $("incomeLevelDaily")
          ?.value
      );


    const monthly =
      safeNumber(
        $("incomeLevelMonthly")
          ?.value
      );


    const yearly =
      safeNumber(
        $("incomeLevelYearly")
          ?.value
      );


    const active =
      $("incomeLevelActive")
        ? $("incomeLevelActive").value !== "false"
        : true;


    if (
      level < 1
    ) {

      return showMessage(
        "incomeLevelFormMessage",
        "Income Level must be at least 1.",
        "error"
      );
    }


    if (
      price < 0 ||
      daily < 0 ||
      monthly < 0 ||
      yearly < 0
    ) {

      return showMessage(
        "incomeLevelFormMessage",
        "Income values cannot be negative.",
        "error"
      );
    }


    const decodedId =
      encodedId
        ? decodeURIComponent(
            encodedId
          )
        : "";


    const duplicate =
      incomeLevelsCache.find(
        item =>
          Number(item.level) ===
            level &&
          String(item.id) !==
            String(decodedId)
      );


    if (duplicate) {

      return showMessage(
        "incomeLevelFormMessage",
        `Income Level ${level} already exists.`,
        "error"
      );
    }


    const incomeData = {

      level,

      price,

      daily,

      monthly,

      yearly,

      active,

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentAdmin.uid
    };


    try {

      if (decodedId) {

        await updateDoc(
          doc(
            db,
            "incomeLevels",
            decodedId
          ),
          incomeData
        );


        showMessage(
          "incomeLevelFormMessage",
          "Income Level updated successfully.",
          "success"
        );

      } else {

        await addDoc(
          collection(
            db,
            "incomeLevels"
          ),
          {
            ...incomeData,

            createdAt:
              serverTimestamp(),

            createdBy:
              currentAdmin.uid
          }
        );


        showMessage(
          "incomeLevelFormMessage",
          "Income Level added successfully.",
          "success"
        );
      }


      setTimeout(
        async () => {

          window.closeAdminIncomeLevelForm();

          await loadAdminIncomeLevels();

        },
        400
      );

    } catch (error) {

      console.error(
        "Save income level error:",
        error
      );

      showMessage(
        "incomeLevelFormMessage",
        error?.message ||
        "Failed to save Income Level.",
        "error"
      );
    }
  };


/* =========================================================
   OLD INCOME COMPATIBILITY
========================================================= */

window.saveIncomeLevel =
  function (
    levelId = ""
  ) {

    return window.saveAdminIncomeLevel(
      levelId
    );
  };


/* =========================================================
   EDIT INCOME LEVEL
========================================================= */

window.editAdminIncomeLevel =
  function (id) {

    if (!id) {

      return alert(
        "Income Level ID is missing."
      );
    }


    window.openAdminIncomeLevelForm(
      id
    );
  };


/* =========================================================
   TOGGLE INCOME LEVEL
========================================================= */

window.toggleAdminIncomeLevel =
  async function (
    id,
    active
  ) {

    if (!currentAdmin) {

      return alert(
        "Admin session not found."
      );
    }


    if (!id) {

      return alert(
        "Income Level ID is missing."
      );
    }


    try {

      await updateDoc(
        doc(
          db,
          "incomeLevels",
          id
        ),
        {
          active:
            !active,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            currentAdmin.uid
        }
      );


      await loadAdminIncomeLevels();

    } catch (error) {

      console.error(
        "Toggle income level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to update Income Level."
      );
    }
  };


/* =========================================================
   DELETE INCOME LEVEL
========================================================= */

window.deleteAdminIncomeLevel =
  async function (id) {

    if (!currentAdmin) {

      return alert(
        "Admin session not found."
      );
    }


    if (!id) {

      return alert(
        "Income Level ID is missing."
      );
    }


    if (
      !confirm(
        "Are you sure you want to delete this Income Level?"
      )
    ) {
      return;
    }


    try {

      await deleteDoc(
        doc(
          db,
          "incomeLevels",
          id
        )
      );


      await loadAdminIncomeLevels();

    } catch (error) {

      console.error(
        "Delete income level error:",
        error
      );

      alert(
        error?.message ||
        "Failed to delete Income Level."
      );
    }
  };


/* =========================================================
   ANNOUNCEMENT + CALENDAR CHECK
========================================================= */

window.ensureAdminAnnouncementCalendarSections =
  function () {

    const announcementSection =
      $("adminAnnouncementsSection");


    const calendarSection =
      $("adminCalendarSection");


    if (!announcementSection) {

      console.warn(
        "adminAnnouncementsSection not found in HTML."
      );
    }


    if (!calendarSection) {

      console.warn(
        "adminCalendarSection not found in HTML."
      );
    }
  };


/* =========================================================
   ADMIN LOGIN
========================================================= */

window.adminLogin = async function () {

  const email =
    $("adminEmail")?.value?.trim() || "";

  const password =
    $("adminPassword")?.value || "";

  const messageEl =
    $("adminLoginMessage");

  const button =
    $("adminLoginButton");

  if (!email || !password) {

    showMessage(
      "adminLoginMessage",
      "Please enter email and password.",
      "error"
    );

    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Logging in...";
  }

  try {

    const credential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    const user =
      credential.user;

    /* -----------------------------------------
       CHECK ADMIN PERMISSION
    ----------------------------------------- */

    const allowed =
      await requireAdmin(user);

    if (!allowed) {

      await signOut(auth);

      throw new Error(
        "This account does not have admin permission."
      );
    }

    currentAdmin = user;

    console.log(
      "✅ Admin login successful:",
      user.uid
    );

    showMessage(
      "adminLoginMessage",
      "Admin login successful.",
      "success"
    );

    /* -----------------------------------------
       SHOW ADMIN DASHBOARD
    ----------------------------------------- */

    const loginPage =
      $("adminLoginPage");

    const dashboardPage =
      $("adminDashboardPage");

    if (loginPage) {
      loginPage.hidden = true;
      loginPage.classList.add("hidden");
    }

    if (dashboardPage) {
      dashboardPage.hidden = false;
      dashboardPage.classList.remove("hidden");
    }

    /* -----------------------------------------
       LOAD DASHBOARD
    ----------------------------------------- */

    await loadDashboard();

  } catch (error) {

    console.error(
      "❌ Admin login error:",
      error
    );

    let message =
      "Admin login failed.";

    if (error?.code === "auth/invalid-credential") {
      message =
        "Email or password is incorrect.";
    }

    else if (
      error?.code === "auth/invalid-email"
    ) {
      message =
        "Invalid email address.";
    }

    else if (
      error?.code === "auth/user-not-found"
    ) {
      message =
        "Admin account was not found.";
    }

    else if (
      error?.code === "auth/wrong-password"
    ) {
      message =
        "Incorrect password.";
    }

    else if (
      error?.code === "auth/too-many-requests"
    ) {
      message =
        "Too many login attempts. Please try again later.";
    }

    else if (
      error?.message
    ) {
      message =
        error.message;
    }

    showMessage(
      "adminLoginMessage",
      message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Login";
    }
  }
};


/* =========================================================
   ADMIN LOGOUT
========================================================= */

window.adminLogout = async function () {

  try {

    stopAllListeners();

    await signOut(auth);

    currentAdmin = null;

    const dashboardPage =
      $("adminDashboardPage");

    const loginPage =
      $("adminLoginPage");

    if (dashboardPage) {
      dashboardPage.hidden = true;
      dashboardPage.classList.add("hidden");
    }

    if (loginPage) {
      loginPage.hidden = false;
      loginPage.classList.remove("hidden");
    }

    const email =
      $("adminEmail");

    const password =
      $("adminPassword");

    if (email) {
      email.value = "";
    }

    if (password) {
      password.value = "";
    }

    console.log(
      "✅ Admin logged out."
    );

  } catch (error) {

    console.error(
      "❌ Admin logout error:",
      error
    );

    alert(
      error?.message ||
      "Logout failed."
    );
  }
};


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    try {

      /* -----------------------------------------
         NO USER
      ----------------------------------------- */

      if (!user) {

        currentAdmin = null;

        stopAllListeners();

        const dashboardPage =
          $("adminDashboardPage");

        const loginPage =
          $("adminLoginPage");

        if (dashboardPage) {
          dashboardPage.hidden = true;
          dashboardPage.classList.add("hidden");
        }

        if (loginPage) {
          loginPage.hidden = false;
          loginPage.classList.remove("hidden");
        }

        return;
      }


      /* -----------------------------------------
         CHECK ADMIN
      ----------------------------------------- */

      const allowed =
        await requireAdmin(user);

      if (!allowed) {

        console.warn(
          "⚠️ Authenticated user is not an admin."
        );

        currentAdmin = null;

        stopAllListeners();

        await signOut(auth);

        const dashboardPage =
          $("adminDashboardPage");

        const loginPage =
          $("adminLoginPage");

        if (dashboardPage) {
          dashboardPage.hidden = true;
          dashboardPage.classList.add("hidden");
        }

        if (loginPage) {
          loginPage.hidden = false;
          loginPage.classList.remove("hidden");
        }

        showMessage(
          "adminLoginMessage",
          "This account does not have admin permission.",
          "error"
        );

        return;
      }


      /* -----------------------------------------
         ADMIN AUTHENTICATED
      ----------------------------------------- */

      currentAdmin = user;

      console.log(
        "✅ Admin authenticated:",
        user.uid
      );

      const loginPage =
        $("adminLoginPage");

      const dashboardPage =
        $("adminDashboardPage");

      if (loginPage) {
        loginPage.hidden = true;
        loginPage.classList.add("hidden");
      }

      if (dashboardPage) {
        dashboardPage.hidden = false;
        dashboardPage.classList.remove("hidden");
      }

      await loadDashboard();

      console.log(
        "✅ CCUS Admin dashboard ready."
      );

    } catch (error) {

      console.error(
        "❌ Admin auth state error:",
        error
      );

      currentAdmin = null;
    }
  }
);


/* =========================================================
   LOGIN FORM ENTER SUPPORT
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const loginForm =
      $("adminLoginForm");

    if (
      loginForm &&
      !loginForm.dataset.listenerAttached
    ) {

      loginForm.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          window.adminLogin();
        }
      );

      loginForm.dataset.listenerAttached =
        "true";
    }

    console.log(
      "CCUS admin DOM ready."
    );
  }
);

/* =========================================================
   INITIAL GLOBAL LOG
========================================================= */

console.log(
  "CCUS admin.js loaded successfully."
);

console.log(
  "📦 Firebase project: ccus-6900f"
);

console.log(
  "🔐 Admin authentication enabled."
);

console.log(
  "📌 Recharge collection: rechargeRequests"
);

console.log(
  "📌 Withdraw collection: withdrawRequests"
);

console.log(
  "📌 Task collection: tasks"
);

console.log(
  "📌 Announcement collection: message"
);

console.log(
  "📌 Calendar: settings/calendar"
);

console.log(
  "📌 Income levels: incomeLevels"
);

console.log(
  "📌 VIP levels: vip_levels"
);

console.log(
  "📌 Team Deposit Levels: rechargeLevels"
);

console.log(
  "🔒 Recharge approval updates TOTAL RECHARGE ONLY."
);

console.log(
  "🔒 Withdrawal rejection refunds only once."
);

console.log(
  "✅ CCUS admin.js initialized successfully."
);
