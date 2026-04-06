import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// These values are pulled directly from your Project Settings in the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyD3hIIKBwC5t8to9WrkXc4aNnZStaN7mQg",
  authDomain: "health-tracker-pro-f0fb6.firebaseapp.com",
  projectId: "health-tracker-pro-f0fb6",
  storageBucket: "health-tracker-pro-f0fb6.firebasestorage.app",
  messagingSenderId: "792291617884",
  appId: "1:792291617884:web:ab16fe16f9c3ad3f2b8a99",
  measurementId: "G-VPV3BXHLRP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);