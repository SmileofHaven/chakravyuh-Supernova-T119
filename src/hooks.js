import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import bundled from "../data/digital-electronics.json";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    []
  );
  return {
    user,
    ready,
    signIn: () => signInWithPopup(auth, googleProvider),
    signOut: () => signOut(auth),
  };
}

const NAMES = ["lessons", "questions", "labs", "challenges", "sims", "gameItems"];

// Renders instantly from the bundled copy, then swaps in Firestore content when it loads.
export function useContent() {
  const [content, setContent] = useState(bundled);
  useEffect(() => {
    (async () => {
      try {
        const snaps = await Promise.all(NAMES.map((n) => getDocs(collection(db, n))));
        const out = {};
        NAMES.forEach((n, i) => (out[n] = snaps[i].docs.map((d) => d.data())));
        if (out.lessons.length && out.questions.length) setContent({ ...bundled, ...out });
      } catch (e) {
        console.warn("Using bundled content (Firestore read failed):", e.message);
      }
    })();
  }, []);
  return content;
}
