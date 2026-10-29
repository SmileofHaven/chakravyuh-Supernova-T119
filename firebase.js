import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Web config is public by design (security comes from Firestore rules + token checks)
const firebaseConfig = {
  apiKey: "AIzaSyCNRk3D6hVASj6MhhK2760iDRcc0a_6j94",
  authDomain: "supernova-efac3.firebaseapp.com",
  projectId: "supernova-efac3",
  storageBucket: "supernova-efac3.firebasestorage.app",
  messagingSenderId: "698296073760",
  appId: "1:698296073760:web:9cb1e97898c94910878645",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
