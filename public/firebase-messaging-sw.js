// ==============================================================================
// Firebase Cloud Messaging (FCM) Service Worker - IFPR Campus Ivaiporã
// Handles background Push Notifications when the app is closed or in background
// ==============================================================================

importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// Initialize Firebase in Service Worker using IFPR project credentials
const firebaseConfig = {
  projectId: "gen-lang-client-0490390966",
  appId: "1:965991369560:web:e3a8c1506c5ffbd81e732d",
  apiKey: "AIzaSyCWdYzD9jmM0vSDTAHXLuxFQB4hNxRY6-8",
  authDomain: "gen-lang-client-0490390966.firebaseapp.com",
  messagingSenderId: "965991369560",
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Background Message Handler
  messaging.onBackgroundMessage((payload) => {
    console.log("[FCM-SW] Notificação push em segundo plano recebida:", payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || "IFPR Achados & Perdidos • Alerta de Pertence";
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || "Um objeto similar ao que você relatou foi registrado no Campus Ivaiporã.",
      icon: payload.notification?.icon || payload.data?.icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200, 100, 200],
      tag: payload.data?.tag || `ifpr-match-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: payload.data?.url || "/",
        itemId: payload.data?.itemId,
        matchScore: payload.data?.matchScore,
      },
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (err) {
  console.warn("[FCM-SW] Inicialização do Firebase Messaging SW compat:", err);
}

// Fallback native push event listener
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.notification?.title || data.title || "IFPR Achados & Perdidos";
    const options = {
      body: data.notification?.body || data.body || "Alerta de correspondência em tempo real recebido.",
      icon: data.notification?.icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [300, 100, 300],
      data: data.data || { url: "/" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (_) {
    const rawText = event.data.text();
    event.waitUntil(
      self.registration.showNotification("IFPR Achados & Perdidos", {
        body: rawText,
        icon: "/icon-192.png",
      })
    );
  }
});

// Handle notification click to focus or open the item
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
