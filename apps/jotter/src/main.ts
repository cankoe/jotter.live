import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/landing.css";
import "./styles/settings.css";
import "katex/dist/katex.min.css";
import { App } from "./components/App";
import { registerSW } from "virtual:pwa-register";
import { showToast } from "./components/Toast";
import { handleOAuthRedirect } from "./sync/google-auth";

// Handle OAuth redirect, then boot the app
handleOAuthRedirect().then(() => {
  const root = document.getElementById("app")!;
  const app = new App(root);
  app.init().catch((err) => {
    console.error("Failed to initialize Jotter:", err);
    root.textContent = "Failed to load. Please refresh.";
  });
});

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
