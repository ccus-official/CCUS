import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

/* =========================
   CCUS FIREBASE CONFIG
========================= */

const firebaseConfig = {
  apiKey: "AIzaSyBzUV7DuR87GmVwvbzwww_tfxlpzfBMp6k",
  authDomain: "ccus-6900f.firebaseapp.com",
  projectId: "ccus-6900f",
  storageBucket: "ccus-6900f.firebasestorage.app",
  messagingSenderId: "42142918720",
  appId: "1:42142918720:web:d2b907be0bb8c1575097a5",
  measurementId: "G-CP5GQ4M96N"
};

/* =========================
   INITIALIZE FIREBASE
========================= */

const app = initializeApp(firebaseConfig);

/* =========================
   AUTH
========================= */

const auth = getAuth(app);

/* =========================
   REALTIME DATABASE
========================= */

const db = getDatabase(app);

/* =========================
   KEEP USER LOGGED IN
========================= */

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("CCUS: Authentication persistence enabled.");
  })
  .catch((error) => {
    console.error("CCUS: Persistence error:", error);
  });

/* =========================
   EXPORT
========================= */

export {
  app,
  auth,
  db
};
