import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyB50UVQNH8ibiMUvll4HUYHtByag1LqSfM",
    authDomain: "built-at.firebaseapp.com",
    projectId: "built-at",
    storageBucket: "built-at.firebasestorage.app",
    messagingSenderId: "427030152659",
    appId: "1:427030152659:web:85da7b0b14fcfeac3d9b26"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
