// ReplyKit background service worker
// Holds shared config and brokers messages between content scripts and the popup.

const SUPABASE_URL = "https://qrgtlojcgbnptdorloro.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZ3Rsb2pjZ2JucHRkb3Jsb3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5OTA3MTksImV4cCI6MjA5MjU2NjcxOX0.ybBqKfTZgB0hBSvy3AOHnTH22fjavJGiWXivYwxq5Ao";

async function getToken() {
  const { rk_token } = await chrome.storage.local.get("rk_token");
  return rk_token || null;
}

async function callEdge(path, payload) {
  const token = await getToken();
  if (!token) throw new Error("Not signed in. Click the ReplyKit icon to sign in.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Receive a token from the web app via externally_connectable
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "RK_SET_TOKEN" && typeof msg.token === "string") {
    chrome.storage.local.set({ rk_token: msg.token, rk_email: msg.email || null }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "RK_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
});

// Content / popup messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "RK_GENERATE") {
        const data = await callEdge("extension-generate", msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg?.type === "RK_PICK") {
        const data = await callEdge("extension-pick", msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg?.type === "RK_AUTH_STATE") {
        const { rk_token, rk_email } = await chrome.storage.local.get(["rk_token", "rk_email"]);
        sendResponse({ ok: true, signedIn: !!rk_token, email: rk_email || null });
      } else if (msg?.type === "RK_SIGN_OUT") {
        await chrome.storage.local.remove(["rk_token", "rk_email"]);
        sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // async
});
