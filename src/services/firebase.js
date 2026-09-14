import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDN-IGLe9ykq0kDJd8X9UqwPC2qS8ksam0",
  authDomain: "exercise-7daec.firebaseapp.com",
  projectId: "exercise-7daec",
  storageBucket: "exercise-7daec.appspot.com",
  messagingSenderId: "848108890571",
  appId: "1:848108890571:web:e331b04cfb053888ae4e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);