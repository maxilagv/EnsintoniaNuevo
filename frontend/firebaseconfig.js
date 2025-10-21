import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Se ha eliminado la importación de initializeAppCheck y ReCaptchaV3Provider

const firebaseConfig = {
  apiKey: "AIzaSyB5qnLpqxC0nvmEH6z95-5HRngZ0coQ23g",
  authDomain: "ensintonia-34d05.firebaseapp.com",
  projectId: "ensintonia-34d05",
  storageBucket: "ensintonia-34d05.appspot.com",
  messagingSenderId: "587936403360",
  appId: "1:587936403360:web:0b7814cdbf85501652dec5",
  measurementId: "G-HK2P1MGR5L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Se ha eliminado la inicialización de App Check

// ¡IMPORTANTE! Asegúrate de que firebaseConfig esté exportado aquí.
export { db, auth, firebaseConfig };