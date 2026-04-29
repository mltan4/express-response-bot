const INSTALL_URL = "https://express-response-bot.lovable.app/install";

function render(state) {
  const el = document.getElementById("auth-area");
  if (state.signedIn) {
    el.innerHTML = `
      <div class="signed-in"><span class="dot"></span> Signed in${state.email ? ` as ${escapeHtml(state.email)}` : ""}</div>
      <button class="ghost" id="signout">Sign out</button>
    `;
    document.getElementById("signout").onclick = () => {
      chrome.runtime.sendMessage({ type: "RK_SIGN_OUT" }, () => refresh());
    };
  } else {
    el.innerHTML = `
      <div class="row muted">You're not signed in.</div>
      <button class="primary" id="signin">Sign in to ReplyKit</button>
    `;
    document.getElementById("signin").onclick = () => {
      chrome.tabs.create({ url: INSTALL_URL });
    };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function refresh() {
  chrome.runtime.sendMessage({ type: "RK_AUTH_STATE" }, (resp) => {
    render(resp || { signedIn: false });
  });
}
refresh();
