// Connexion à Firebase (projet de TEST — à remplacer par le projet du resto à la livraison).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCY9dlncwyNNcOZmoBAL-nn9Wo0dRHkyNY',
  authDomain: 'kramen-hygiene-test-c00ec.firebaseapp.com',
  projectId: 'kramen-hygiene-test-c00ec',
  storageBucket: 'kramen-hygiene-test-c00ec.firebasestorage.app',
  messagingSenderId: '600084946917',
  appId: '1:600084946917:web:a6b34a65cb1f3e71b1990c',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Cache local persistant : l'appli marche sans réseau et envoie les saisies au retour du réseau.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Domaine « technique » des comptes : l'employé ne tape que son prénom et son code.
export const LOGIN_DOMAIN = 'kramen-hygiene.app';
export const SDK = 'https://www.gstatic.com/firebasejs/13.3.0';
