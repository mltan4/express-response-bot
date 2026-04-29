// ReplyKit content script — runs on linkedin.com
// Injects a ✨ button into:
//   1) Message composer (DMs)
//   2) Post comment box
// Opens a panel that generates 3 variants and inserts the chosen one.

(() => {
  if (window.__replykit_injected) return;
  window.__replykit_injected = true;

  const TONES = ["professional", "casual", "witty", "warm", "direct", "enthusiastic"];
  const LENGTHS = ["short", "medium", "long"];

  let state = {
    tone: "casual",
    length: "medium",
    surface: "message", // or "comment"
    targetEditor: null, // element to write into
    contextText: "",
    authorName: "",
    panel: null,
    variants: [],
    historyId: null,
    pickedIdx: null,
    loading: false,
    error: null,
  };

  // ---- Utilities ----------------------------------------------------------

  const sparkleSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4z"/></svg>`;

  function makeBtn(label = "ReplyKit") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rk-trigger-btn";
    b.innerHTML = `${sparkleSVG}<span>${label}</span>`;
    b.setAttribute("data-replykit", "1");
    return b;
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // Insert text into a contentEditable or textarea
  function insertIntoEditor(editor, text) {
    if (!editor) return;
    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      const proto = editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(editor, text);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    // contentEditable
    editor.focus();
    // clear placeholder structure
    editor.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = text;
    editor.appendChild(p);
    // Notify LinkedIn's React of the change
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    editor.dispatchEvent(new Event("blur", { bubbles: true }));
    editor.focus();
  }

  // ---- Context extraction --------------------------------------------------

  function extractMessageThread(composerRoot) {
    // Walk up to find the conversation container, then read message bubbles.
    let convo = composerRoot.closest('[class*="msg-convo"], [class*="msg-thread"], .msg-overlay-conversation-bubble, .msg-s-message-list-container');
    if (!convo) {
      // Fallback: search up
      let n = composerRoot;
      for (let i = 0; i < 10 && n; i++) {
        if (n.querySelector && n.querySelector(".msg-s-message-list, .msg-s-message-list-container")) {
          convo = n; break;
        }
        n = n.parentElement;
      }
    }
    if (!convo) return { text: "", author: "" };

    const list = convo.querySelector(".msg-s-message-list, .msg-s-message-list-container") || convo;
    const items = list.querySelectorAll(".msg-s-message-list__event, li.msg-s-message-list__event, .msg-s-event-listitem, .msg-s-event-with-indicator");
    const lines = [];
    let lastAuthor = "";
    items.forEach((item) => {
      const nameEl = item.querySelector(".msg-s-message-group__name, .msg-s-message-group__profile-link");
      if (nameEl) lastAuthor = nameEl.textContent.trim();
      const bodyEl = item.querySelector(".msg-s-event-listitem__body, .msg-s-event__content");
      if (bodyEl) {
        const text = bodyEl.innerText.trim();
        if (text) lines.push(`${lastAuthor || "Them"}: ${text}`);
      }
    });

    // Try to identify the other person's name from the conversation header
    let author = "";
    const header = convo.querySelector(".msg-overlay-bubble-header__title, .msg-entity-lockup__entity-title, h2");
    if (header) author = header.textContent.trim();

    return {
      text: lines.slice(-12).join("\n") || convo.innerText.slice(-2000),
      author,
    };
  }

  function extractPostContext(commentEditor) {
    // Walk up to the post container
    let post = commentEditor.closest('[data-id^="urn:li:activity"], .feed-shared-update-v2, article, [data-urn^="urn:li:activity"]');
    if (!post) {
      let n = commentEditor;
      for (let i = 0; i < 15 && n; i++) {
        if (n.querySelector && (n.querySelector(".feed-shared-update-v2__description") || n.querySelector(".update-components-text"))) {
          post = n; break;
        }
        n = n.parentElement;
      }
    }
    if (!post) return { text: "", author: "" };
    const bodyEl = post.querySelector(".feed-shared-update-v2__description, .update-components-text, .feed-shared-text");
    const text = bodyEl ? bodyEl.innerText.trim() : post.innerText.slice(0, 2000);
    const authorEl = post.querySelector(".update-components-actor__title, .feed-shared-actor__name, .update-components-actor__name");
    const author = authorEl ? authorEl.innerText.trim().split("\n")[0] : "";
    return { text, author };
  }

  // ---- Panel UI ------------------------------------------------------------

  function closePanel() {
    if (state.panel) { state.panel.remove(); state.panel = null; }
    state.variants = []; state.historyId = null; state.pickedIdx = null; state.error = null; state.loading = false;
  }

  function renderPanel(anchorRect) {
    if (state.panel) state.panel.remove();
    const panel = document.createElement("div");
    panel.className = "rk-panel";
    state.panel = panel;

    const top = Math.min(window.innerHeight - 480, Math.max(12, anchorRect.bottom + 8));
    const left = Math.min(window.innerWidth - 392, Math.max(12, anchorRect.left));
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    panel.innerHTML = `
      <div class="rk-panel-header">
        <div class="rk-panel-title">
          <span class="rk-panel-title-badge">${sparkleSVG}</span>
          ReplyKit · ${state.surface === "comment" ? "Comment" : "Reply"}
        </div>
        <button class="rk-panel-close" aria-label="Close">×</button>
      </div>
      <div class="rk-panel-body">
        <div class="rk-label">Context</div>
        <div class="rk-context">${state.contextText ? escapeHtml(state.contextText) : "<em>No context detected — generation may be generic.</em>"}</div>

        <div class="rk-label">Tone</div>
        <div class="rk-row" data-rk-tones>
          ${TONES.map(t => `<button class="rk-chip ${t === state.tone ? "active" : ""}" data-tone="${t}">${cap(t)}</button>`).join("")}
        </div>

        <div class="rk-label">Length</div>
        <div class="rk-row" data-rk-lengths>
          ${LENGTHS.map(l => `<button class="rk-chip ${l === state.length ? "active" : ""}" data-length="${l}">${cap(l)}</button>`).join("")}
        </div>

        <button class="rk-generate-btn" data-rk-go>
          ${state.loading ? '<span class="rk-spinner"></span> Generating…' : "✨ Generate 3 " + (state.surface === "comment" ? "comments" : "replies")}
        </button>

        ${state.error ? `<div class="rk-error">${escapeHtml(state.error)}</div>` : ""}

        <div class="rk-variants">
          ${state.variants.length === 0 && !state.loading ? '' :
            state.variants.map((v, i) => `
              <div class="rk-variant ${state.pickedIdx === i ? "picked" : ""}">
                <span class="rk-variant-label">${escapeHtml(v.label)}</span>
                <div class="rk-variant-text">${escapeHtml(v.text)}</div>
                <div class="rk-variant-actions">
                  <button class="rk-btn-sm" data-copy="${i}">Copy</button>
                  <button class="rk-btn-sm primary" data-use="${i}">Use this</button>
                </div>
              </div>
            `).join("")
          }
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector(".rk-panel-close").addEventListener("click", closePanel);
    panel.querySelectorAll("[data-tone]").forEach(b => b.addEventListener("click", () => {
      state.tone = b.getAttribute("data-tone"); renderPanel(anchorRect);
    }));
    panel.querySelectorAll("[data-length]").forEach(b => b.addEventListener("click", () => {
      state.length = b.getAttribute("data-length"); renderPanel(anchorRect);
    }));
    panel.querySelector("[data-rk-go]").addEventListener("click", () => generate(anchorRect));
    panel.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
      const i = +b.getAttribute("data-copy");
      navigator.clipboard.writeText(state.variants[i].text);
      b.textContent = "Copied!";
      setTimeout(() => { b.textContent = "Copy"; }, 1200);
    }));
    panel.querySelectorAll("[data-use]").forEach(b => b.addEventListener("click", () => {
      const i = +b.getAttribute("data-use");
      usePick(i, anchorRect);
    }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- Backend calls -------------------------------------------------------

  function generate(anchorRect) {
    state.loading = true; state.error = null; state.variants = []; state.historyId = null; state.pickedIdx = null;
    renderPanel(anchorRect);
    chrome.runtime.sendMessage({
      type: "RK_GENERATE",
      payload: {
        surface: state.surface,
        conversation: state.contextText || "(no context provided)",
        authorName: state.authorName,
        tone: state.tone,
        length: state.length,
      },
    }, (resp) => {
      state.loading = false;
      if (!resp?.ok) {
        state.error = resp?.error || "Failed to generate. Are you signed in?";
      } else {
        state.variants = resp.data.variants || [];
        state.historyId = resp.data.historyId || null;
      }
      renderPanel(anchorRect);
    });
  }

  function usePick(i, anchorRect) {
    state.pickedIdx = i;
    insertIntoEditor(state.targetEditor, state.variants[i].text);
    if (state.historyId) {
      chrome.runtime.sendMessage({
        type: "RK_PICK",
        payload: { historyId: state.historyId, variantIndex: i },
      });
    }
    renderPanel(anchorRect);
    setTimeout(closePanel, 600);
  }

  // ---- Injection logic -----------------------------------------------------

  function findMessageComposers() {
    // LinkedIn DM composer is a contentEditable with role="textbox" inside .msg-form
    return document.querySelectorAll(
      '.msg-form__contenteditable, .msg-form__msg-content-container [contenteditable="true"], .msg-form [role="textbox"]'
    );
  }

  function findCommentBoxes() {
    // LinkedIn post comment editor
    return document.querySelectorAll(
      '.comments-comment-box__form [contenteditable="true"], .comments-comment-texteditor [contenteditable="true"], .ql-editor[data-placeholder*="comment" i]'
    );
  }

  function attachToEditor(editor, surface) {
    if (!editor || editor.dataset.rkAttached === "1") return;
    editor.dataset.rkAttached = "1";

    // Find a sensible toolbar/footer to inject into
    const composer = editor.closest(
      surface === "message"
        ? ".msg-form, .msg-form__msg-content-container"
        : ".comments-comment-box, .comments-comment-texteditor, .comments-comment-box__form"
    ) || editor.parentElement;

    // Skip if we already added a button for this composer
    if (composer.querySelector('[data-replykit="1"]')) return;

    const btn = makeBtn();
    btn.style.position = "absolute";
    btn.style.right = "8px";
    btn.style.bottom = "8px";
    btn.style.zIndex = "10";

    // Make the composer relatively positioned so absolute child works
    const cs = getComputedStyle(composer);
    if (cs.position === "static") composer.style.position = "relative";
    composer.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      state.surface = surface;
      state.targetEditor = editor;
      const ctx = surface === "message" ? extractMessageThread(composer) : extractPostContext(editor);
      state.contextText = ctx.text;
      state.authorName = ctx.author;
      const rect = btn.getBoundingClientRect();
      renderPanel(rect);
    });
  }

  const scan = debounce(() => {
    findMessageComposers().forEach(e => attachToEditor(e, "message"));
    findCommentBoxes().forEach(e => attachToEditor(e, "comment"));
  }, 300);

  // Re-scan as LinkedIn mutates the DOM
  const obs = new MutationObserver(scan);
  obs.observe(document.body, { childList: true, subtree: true });
  scan();

  // Close panel on outside click / escape
  document.addEventListener("click", (e) => {
    if (state.panel && !state.panel.contains(e.target) && !e.target.closest('[data-replykit="1"]')) {
      closePanel();
    }
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
})();
