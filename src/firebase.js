// Firebase initialization
// Provide your Firebase config via environment variables in a .env file:
// REACT_APP_FIREBASE_API_KEY, REACT_APP_FIREBASE_AUTH_DOMAIN, REACT_APP_FIREBASE_PROJECT_ID,
// REACT_APP_FIREBASE_STORAGE_BUCKET, REACT_APP_FIREBASE_MESSAGING_SENDER_ID, REACT_APP_FIREBASE_APP_ID

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBnSs5-epUeqsot81H38O1mUhXjyCGV3pU',
  authDomain: 'social-media-848c7.firebaseapp.com',
  projectId: 'social-media-848c7',
  storageBucket: 'social-media-848c7.appspot.com',
  messagingSenderId: '712801255409',
  appId: '1:712801255409:web:116c0c6b580f8a5a618e50',
};

// It is okay if config is empty during local UI development; Firestore calls will fail until configured.
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);


