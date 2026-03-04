import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/landing.css";
import "./styles/settings.css";
import "./styles/native.css";
import "katex/dist/katex.min.css";
import { App } from "./components/App";
import { Capacitor } from "@capacitor/core";
import { showToast } from "./components/Toast";

// Add platform class for native-specific CSS
const platform = Capacitor.getPlatform();
if (platform === "android") document.body.classList.add("native-android");
else if (platform === "ios") document.body.classList.add("native-ios");

// Disable pinch-to-zoom on native (feels non-native)
if (Capacitor.isNativePlatform()) {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover");
  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
}

const root = document.getElementById("app")!
const app = new App(root);
app.init().catch((err) => {
  console.error("Failed to initialize Jotter:", err);
  root.textContent = "Failed to load. Please refresh.";
});

if (!Capacitor.isNativePlatform()) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        showToast({
          message: "New version available",
          action: {
            label: "Refresh",
            onClick: () => updateSW(true),
          },
          duration: 0,
        });
      },
    });
  });
} else {
  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Default });
    StatusBar.setOverlaysWebView({ overlay: false });
  });
}
