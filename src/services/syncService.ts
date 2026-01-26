import { db, auth } from "../firebase";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import browser from "webextension-polyfill";

interface SyncData {
  timeTracking: any;
  weeklyHistory: any;
  limitedSites: string[];
  productiveSites: string[];
  lastSync: any;
}

let userId: string | null = null;
let unsubscribe: (() => void) | null = null;
let isSyncing = false;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

// Get sync status
export function getSyncStatus() {
  return {
    userId,
    isSyncing,
    isInitialized: userId !== null,
    isInitializing,
  };
}

// Set admin user ID (for testing or admin purposes)
export async function setAdminUserId(adminId: string) {
  userId = adminId;
  console.log("Admin user ID set:", userId);
  await startSync();
  return { success: true, userId };
}

// Initialize Firebase Auth
export async function initializeSync() {
  // If already initializing, return the existing promise
  if (initPromise) {
    return initPromise;
  }

  // Check if admin user ID is stored
  const stored = await browser.storage.local.get("adminUserId");
  if (stored.adminUserId) {
    userId = stored.adminUserId;
    console.log("Using stored admin user ID:", userId);
    await startSync();
    return;
  }

  isInitializing = true;

  initPromise = new Promise<void>((resolve) => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        userId = user.uid;
        console.log("User authenticated:", userId);
        await startSync();
        isInitializing = false;
        unsubscribeAuth();
        resolve();
      } else {
        // Try to sign in anonymously, fallback to default user ID
        try {
          const userCredential = await signInAnonymously(auth);
          userId = userCredential.user.uid;
          console.log("User signed in anonymously:", userId);
          await startSync();
          isInitializing = false;
          unsubscribeAuth();
          resolve();
        } catch (error) {
          console.error("Error signing in, using default user ID:", error);
          // Use default user ID "dest" if authentication fails
          userId = "dest";
          console.log("Using default user ID:", userId);
          await startSync();
          isInitializing = false;
          unsubscribeAuth();
          resolve();
        }
      }
    });

    // Timeout fallback - if auth doesn't respond in 3 seconds, use default
    setTimeout(() => {
      if (!userId) {
        console.log("Auth timeout, using default user ID: dest");
        userId = "dest";
        startSync();
        isInitializing = false;
        resolve();
      }
    }, 3000);
  });

  return initPromise;
}

// Start syncing data
async function startSync() {
  if (!userId) return;

  // Check if document exists, if not create it with current local data
  const userDocRef = doc(db, "users", userId);
  const docSnap = await getDoc(userDocRef);

  if (!docSnap.exists()) {
    // First time sync - push local data to remote
    console.log("First time sync - creating remote document");
    await syncToRemote();
  }

  // Listen for remote changes
  unsubscribe = onSnapshot(
    userDocRef,
    async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const remoteData = docSnapshot.data() as SyncData;

        // Get local data
        const localData = await browser.storage.local.get([
          "timeTracking",
          "weeklyHistory",
          "limitedSites",
          "productiveSites",
          "lastSync",
        ]);

        // Merge data (remote takes precedence if newer)
        const localLastSync = localData.lastSync || 0;
        const remoteLastSync = remoteData.lastSync?.toMillis() || 0;

        if (remoteLastSync > localLastSync) {
          // Remote is newer, update local
          await browser.storage.local.set({
            timeTracking: remoteData.timeTracking || {},
            weeklyHistory: remoteData.weeklyHistory || {},
            limitedSites: remoteData.limitedSites || [],
            productiveSites: remoteData.productiveSites || [],
            lastSync: remoteLastSync,
          });
          console.log("Synced from remote to local");

          // Notify popup to refresh
          try {
            await browser.runtime.sendMessage({ type: "syncComplete" });
          } catch (e) {
            // Popup might not be open
          }
        }
      }
    },
    (error) => {
      console.error("Snapshot listener error:", error);
    }
  );
}

// Sync local data to Firebase
export async function syncToRemote() {
  // Wait for initialization if in progress
  if (isInitializing && initPromise) {
    await initPromise;
  }

  if (!userId) {
    console.log("No user ID, skipping sync");
    return { success: false, error: "Not authenticated" };
  }

  if (isSyncing) {
    console.log("Sync already in progress");
    return { success: false, error: "Sync in progress" };
  }

  isSyncing = true;

  try {
    const localData = await browser.storage.local.get([
      "timeTracking",
      "weeklyHistory",
      "limitedSites",
      "productiveSites",
    ]);

    const userDocRef = doc(db, "users", userId);

    await setDoc(
      userDocRef,
      {
        timeTracking: localData.timeTracking || {},
        weeklyHistory: localData.weeklyHistory || {},
        limitedSites: localData.limitedSites || [],
        productiveSites: localData.productiveSites || [],
        lastSync: serverTimestamp(),
      },
      { merge: true }
    );

    // Update local lastSync timestamp
    await browser.storage.local.set({ lastSync: Date.now() });

    console.log("Synced to remote successfully");
    isSyncing = false;
    return { success: true };
  } catch (error) {
    console.error("Error syncing to remote:", error);
    isSyncing = false;
    return { success: false, error: String(error) };
  }
}

// Stop syncing
export function stopSync() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

// Manual sync trigger
export async function manualSync() {
  await syncToRemote();
}
