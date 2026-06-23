/**
 * Runs before every test file is imported. Must set the fake project config
 * BEFORE src/lib/firebase.ts is ever imported (it reads these at module-load
 * time to call initializeApp()).
 */
process.env.NEXT_PUBLIC_FIREBASE_API_KEY        = "demo-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN     = "demo-chronix-test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID      = "demo-chronix-test";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET  = "demo-chronix-test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "000000000000";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID          = "1:000000000000:web:0000000000000000000000";
