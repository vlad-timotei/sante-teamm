// Admin Tests v1.2.0
// Modal UI for managing test definitions, injected into the Sante portal

function buildTeammSearchUrl(query) {
  const params = new URLSearchParams({
    length: "50",
    start: "0",
    search: query,
  });
  return `https://teamm.work/admin/medical/data/intakes?${params}`;
}

function openTestAdmin() {
  if (document.getElementById("test-admin-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "test-admin-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 100000; display: flex; align-items: center; justify-content: center;
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeTestAdmin(); };

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #f5f6fa; border-radius: 12px; width: 90%; max-width: 860px;
    max-height: 85vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  modal.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #17a2b8, #1289a0);
      color: white; padding: 16px 24px; border-radius: 12px 12px 0 0;
      display: flex; align-items: center; justify-content: space-between;
    ">
      <span style="font-size: 16px; font-weight: bold;">⚙️ Administrare Teste Medicale</span>
      <div>
        <a href="https://teamm.work/admin/medical/intakes?length=50&usedIn=table&start=0"
           target="_blank"
           style="color: rgba(255,255,255,0.85); text-decoration: none; font-size: 12px; margin-right: 16px;">
          📋 Date medicale Teamm ↗
        </a>
        <button data-action="close" style="
          background: none; border: none; color: white; font-size: 20px;
          cursor: pointer; padding: 0 4px; line-height: 1;
        ">✕</button>
      </div>
    </div>

    <div style="padding: 20px 24px;">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
        <button data-action="add" style="
          padding: 9px 20px; border: none; border-radius: 18px; font-size: 13px;
          font-weight: 600; cursor: pointer;
          background: linear-gradient(135deg, #17a2b8, #1289a0); color: white;
          box-shadow: 0 2px 6px rgba(23,162,184,0.35);
        ">➕ Adaugă test nou</button>
      </div>

      <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-size: 14px; font-weight: bold; color: #17a2b8; margin-bottom: 12px;">
          Teste configurate (<span id="ta-count">0</span>)
        </div>
        <div id="ta-list" style="font-size: 13px;"></div>
      </div>
    </div>
  `;

  modal.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "close") closeTestAdmin();
    else if (action === "add") openTestEditor(null);
    else if (action === "edit") openTestEditor(window._taTests[parseInt(btn.dataset.index)]);
    else if (action === "delete") taAdminDelete(btn.dataset.key);
    else if (action === "teamm-setup") openTeammSetupForExistingTest(window._taTests[parseInt(btn.dataset.index)]);
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  taLoadTests();
}

function closeTestAdmin() {
  const overlay = document.getElementById("test-admin-overlay");
  if (overlay) overlay.remove();
}

async function taLoadTests() {
  const result = await window.SyncManager.fetchTestDefinitions();
  if (!result?.success) return;

  const tests = result.tests || [];
  window._taTests = tests;
  document.getElementById("ta-count").textContent = tests.length;

  if (tests.length === 0) {
    document.getElementById("ta-list").innerHTML =
      '<div style="text-align: center; padding: 30px; color: #999;">Niciun test configurat.</div>';
    return;
  }

  const thStyle = 'text-align: left; padding: 8px 10px; background: #f8f9fa; border-bottom: 2px solid #dee2e6; font-size: 11px; color: #666; text-transform: uppercase;';
  let html = `<table style="width: 100%; border-collapse: collapse;">
    <thead><tr>
      <th style="${thStyle}">Cheie</th>
      <th style="${thStyle}">Nume</th>
      <th style="${thStyle}">Pattern</th>
      <th style="${thStyle}"></th>
    </tr></thead><tbody>`;

  tests.forEach((t, i) => {
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 6px 10px; font-weight: bold;">${escHtml(t.key)}</td>
      <td style="padding: 6px 10px;">${escHtml(t.name)}</td>
      <td style="padding: 6px 10px; font-family: monospace; font-size: 11px; color: #666; word-break: break-all;">${escHtml(t.pattern)}</td>
      <td style="padding: 6px 10px; white-space: nowrap;">
        <button data-action="teamm-setup" data-index="${i}" title="Setup în Teamm" style="
          padding: 3px 10px; border: none; border-radius: 12px; font-size: 11px;
          cursor: pointer; background: #1289a0; color: white; margin-right: 4px;
        ">🚀</button>
        <button data-action="edit" data-index="${i}" style="
          padding: 3px 10px; border: none; border-radius: 12px; font-size: 11px;
          cursor: pointer; background: #17a2b8; color: white; margin-right: 4px;
        ">✏️</button>
        <button data-action="delete" data-key="${escHtml(t.key)}" style="
          padding: 3px 10px; border: none; border-radius: 12px; font-size: 11px;
          cursor: pointer; background: #dc3545; color: white;
        ">🗑️</button>
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  document.getElementById("ta-list").innerHTML = html;
}

function textToPattern(text) {
  return text
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
}

// ----------------------------------------------------------------
// Add / edit modal (separate from the admin list)
// ----------------------------------------------------------------

function openTestEditor(existing) {
  const previous = document.getElementById("test-editor-overlay");
  if (previous) previous.remove();

  const isEdit = !!existing;

  const overlay = document.createElement("div");
  overlay.id = "test-editor-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    z-index: 100002; display: flex; align-items: center; justify-content: center;
    animation: ta-fade-in 180ms ease-out;
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeTestEditor(); };

  // One-shot animation styles
  if (!document.getElementById("ta-editor-anim")) {
    const style = document.createElement("style");
    style.id = "ta-editor-anim";
    style.textContent = `
      @keyframes ta-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes ta-scale-in {
        from { opacity: 0; transform: scale(0.94) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  const card = document.createElement("div");
  card.style.cssText = `
    background: white; border-radius: 14px; width: 92%; max-width: 520px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: ta-scale-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
    overflow: hidden;
  `;

  const headerTitle = isEdit ? `Editează: ${escHtml(existing.name)}` : "Adaugă test nou";
  const submitLabel = isEdit ? "Actualizează" : "Salvează & continuă";

  const inputStyle = "width: 100%; padding: 9px 12px; border: 1px solid #d8dde3; border-radius: 6px; font-size: 14px; box-sizing: border-box; transition: border-color 120ms;";
  const labelStyle = "display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 4px;";

  const extraFieldsHtml = isEdit ? "" : `
    <div style="
      background: #f8fbfc; border: 1px dashed #b8dde4; border-radius: 8px;
      padding: 14px; margin-top: 6px;
    ">
      <div style="font-size: 11px; font-weight: 700; color: #1289a0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
        🚀 Pentru setup-ul în teamm (temporar)
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
        <div>
          <label style="${labelStyle}">Unitate</label>
          <input type="text" id="te-unit" placeholder="ex: pg/mL" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}">Min</label>
          <input type="text" id="te-min" placeholder="ex: 187" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}">Max</label>
          <input type="text" id="te-max" placeholder="ex: 883" style="${inputStyle}">
        </div>
      </div>
      <div style="font-size: 11px; color: #888; margin-top: 8px;">
        Aceste câmpuri sunt folosite o singură dată pentru configurarea testului în teamm.work și nu se salvează.
      </div>
    </div>
  `;

  card.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #17a2b8, #1289a0);
      color: white; padding: 16px 22px;
      display: flex; align-items: center; justify-content: space-between;
    ">
      <span style="font-size: 15px; font-weight: bold;">${isEdit ? "✏️" : "➕"} ${headerTitle}</span>
      <button data-action="cancel" style="
        background: none; border: none; color: white; font-size: 20px;
        cursor: pointer; padding: 0 4px; line-height: 1;
      ">✕</button>
    </div>

    <div style="padding: 20px 22px;">
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="${labelStyle}">Cheie Teamm</label>
          <input type="text" id="te-key" placeholder="ex: B12" style="${inputStyle}${isEdit ? "; background: #f0f2f5; color: #777; cursor: not-allowed;" : ""}" ${isEdit ? 'readonly title="Cheia nu poate fi modificată. Șterge testul și creează altul nou dacă vrei să o schimbi."' : "autofocus"}>
        </div>
        <div>
          <label style="${labelStyle}">Nume afișat</label>
          <input type="text" id="te-name" placeholder="ex: Vitamina B12" style="${inputStyle}">
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="${labelStyle}">Text din PDF</label>
        <input type="text" id="te-pattern" placeholder="ex: Vitamina B12" style="${inputStyle}">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px;">
          <span style="font-size: 11px; color: #888;">
            💡 Spațiile devin flexibile automat.
          </span>
          <label style="font-size: 11px; color: #888; cursor: pointer; white-space: nowrap;">
            <input type="checkbox" id="te-raw-regex"> Regex avansat
          </label>
        </div>
      </div>

      ${extraFieldsHtml}

      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button data-action="cancel" style="
          padding: 9px 18px; border: 1px solid #d8dde3; border-radius: 18px;
          font-size: 13px; cursor: pointer; background: white; color: #555;
        ">Anulează</button>
        <button data-action="submit" id="te-submit-btn" style="
          padding: 9px 22px; border: none; border-radius: 18px; font-size: 13px;
          font-weight: 600; cursor: pointer;
          background: linear-gradient(135deg, #17a2b8, #1289a0); color: white;
          box-shadow: 0 2px 6px rgba(23,162,184,0.35);
        ">${submitLabel}</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "cancel") closeTestEditor();
    else if (action === "submit") submitTestEditor(existing);
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
      e.preventDefault();
      submitTestEditor(existing);
    } else if (e.key === "Escape") {
      closeTestEditor();
    }
  });

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  if (isEdit) {
    document.getElementById("te-key").value = existing.key;
    document.getElementById("te-name").value = existing.name;
    document.getElementById("te-pattern").value = existing.pattern;
    document.getElementById("te-raw-regex").checked = true;
  }

  setTimeout(() => {
    const first = document.getElementById(isEdit ? "te-name" : "te-key");
    if (first) first.focus();
  }, 50);
}

function closeTestEditor() {
  const el = document.getElementById("test-editor-overlay");
  if (el) el.remove();
}

async function submitTestEditor(existing) {
  const isEdit = !!existing;
  // For edit mode, the key is fixed to the original — the backend's
  // INSERT ... ON DUPLICATE KEY UPDATE only updates when the key matches,
  // so any change here would silently create a new row instead of editing.
  const key = isEdit ? existing.key : document.getElementById("te-key").value.trim();
  const name = document.getElementById("te-name").value.trim();
  const rawText = document.getElementById("te-pattern").value.trim();
  const isRawRegex = document.getElementById("te-raw-regex").checked;

  if (!key || !name || !rawText) {
    taToast("Completează cheia, numele și textul.", true);
    return;
  }

  const pattern = isRawRegex ? rawText : textToPattern(rawText);

  const submitBtn = document.getElementById("te-submit-btn");
  submitBtn.disabled = true;
  submitBtn.style.opacity = "0.6";
  submitBtn.textContent = "Se salvează...";

  const result = await window.SyncManager.apiCall("POST", "test_definitions", {
    key, name, pattern,
  });

  if (!result?.success) {
    taToast("❌ Eroare la salvare", true);
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
    submitBtn.textContent = isEdit ? "Actualizează" : "Salvează & continuă";
    return;
  }

  // For edit, we're done — just refresh and close.
  if (isEdit) {
    closeTestEditor();
    taLoadTests();
    await window.refreshTestDefinitions();
    taToast("✅ Test actualizat");
    return;
  }

  // For add, harvest the optional teamm-setup fields.
  const unit = document.getElementById("te-unit")?.value.trim() || "";
  const minVal = document.getElementById("te-min")?.value.trim() || "";
  const maxVal = document.getElementById("te-max")?.value.trim() || "";
  const hasTeammPayload = unit || minVal || maxVal;

  closeTestEditor();
  taLoadTests();
  await window.refreshTestDefinitions();
  taToast("✅ Test salvat");

  if (!hasTeammPayload) return;

  const payload = buildTeammSetupPayload({ key, name, pattern }, unit, minVal, maxVal);
  await GM.setValue("sante-pending-teamm-setup", JSON.stringify(payload));
  promptStartTeammSetup(payload);
}

function buildTeammSetupPayload(test, unit, min, max) {
  return {
    key: test.key, name: test.name, pattern: test.pattern,
    unit, min, max,
    step: "lookup_existing",
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 min window
  };
}

function openTeammSetupForExistingTest(test) {
  const previous = document.getElementById("teamm-setup-existing-overlay");
  if (previous) previous.remove();

  const overlay = document.createElement("div");
  overlay.id = "teamm-setup-existing-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    z-index: 100003; display: flex; align-items: center; justify-content: center;
    animation: ta-fade-in 180ms ease-out;
  `;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const card = document.createElement("div");
  card.style.cssText = `
    background: white; border-radius: 14px; width: 92%; max-width: 460px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: ta-scale-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
    overflow: hidden;
  `;

  const inputStyle = "width: 100%; padding: 9px 12px; border: 1px solid #d8dde3; border-radius: 6px; font-size: 14px; box-sizing: border-box;";
  const labelStyle = "display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 4px;";

  card.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #17a2b8, #1289a0);
      color: white; padding: 16px 22px;
      display: flex; align-items: center; justify-content: space-between;
    ">
      <span style="font-size: 15px; font-weight: bold;">🚀 Setup teamm: ${escHtml(test.name)}</span>
      <button data-action="cancel" style="
        background: none; border: none; color: white; font-size: 20px;
        cursor: pointer; padding: 0 4px; line-height: 1;
      ">✕</button>
    </div>
    <div style="padding: 20px 22px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 14px; line-height: 1.5;">
        Completează valorile pentru configurarea testului în teamm.work.
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px;">
        <div>
          <label style="${labelStyle}">Unitate</label>
          <input type="text" id="tse-unit" placeholder="ex: pg/mL" style="${inputStyle}" autofocus>
        </div>
        <div>
          <label style="${labelStyle}">Min</label>
          <input type="text" id="tse-min" placeholder="ex: 187" style="${inputStyle}">
        </div>
        <div>
          <label style="${labelStyle}">Max</label>
          <input type="text" id="tse-max" placeholder="ex: 883" style="${inputStyle}">
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button data-action="cancel" style="
          padding: 9px 18px; border: 1px solid #d8dde3; border-radius: 18px;
          font-size: 13px; cursor: pointer; background: white; color: #555;
        ">Anulează</button>
        <button data-action="go" id="tse-go-btn" style="
          padding: 9px 22px; border: none; border-radius: 18px; font-size: 13px;
          font-weight: 600; cursor: pointer;
          background: linear-gradient(135deg, #17a2b8, #1289a0); color: white;
          box-shadow: 0 2px 6px rgba(23,162,184,0.35);
        ">Pornește</button>
      </div>
    </div>
  `;

  const submit = async () => {
    const unit = document.getElementById("tse-unit").value.trim();
    const min = document.getElementById("tse-min").value.trim();
    const max = document.getElementById("tse-max").value.trim();
    if (!unit && !min && !max) {
      taToast("Completează cel puțin un câmp.", true);
      return;
    }
    const goBtn = document.getElementById("tse-go-btn");
    goBtn.disabled = true;
    goBtn.style.opacity = "0.6";
    goBtn.textContent = "...";
    const payload = buildTeammSetupPayload(test, unit, min, max);
    await GM.setValue("sante-pending-teamm-setup", JSON.stringify(payload));
    const url = buildTeammSearchUrl(test.key);
    const tab = window.open(url, "_blank");
    if (!tab) {
      taToast("⚠️ Popup blocat — deschid în fila curentă", true);
      window.location.assign(url);
      return;
    }
    overlay.remove();
    taToast("🚀 Setup teamm pornit în altă filă");
  };

  card.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "cancel") overlay.remove();
    else if (btn.dataset.action === "go") submit();
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      overlay.remove();
    }
  });

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById("tse-unit")?.focus(), 50);
}

function promptStartTeammSetup(payload) {
  const existing = document.getElementById("teamm-setup-prompt-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "teamm-setup-prompt-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    z-index: 100003; display: flex; align-items: center; justify-content: center;
    animation: ta-fade-in 180ms ease-out;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    background: white; border-radius: 14px; width: 90%; max-width: 440px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: ta-scale-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
    overflow: hidden;
  `;

  card.innerHTML = `
    <div style="padding: 24px;">
      <div style="font-size: 32px; text-align: center; margin-bottom: 8px;">🚀</div>
      <div style="font-size: 16px; font-weight: bold; color: #1289a0; text-align: center; margin-bottom: 6px;">
        Pornesc setup-ul în teamm acum?
      </div>
      <div style="font-size: 13px; color: #666; text-align: center; margin-bottom: 18px; line-height: 1.5;">
        Vei fi redirecționat către teamm.work și extensia va completa
        automat <strong>${escHtml(payload.name)}</strong> cu unitatea
        <strong>${escHtml(payload.unit || "—")}</strong> și intervalul
        <strong>${escHtml(payload.min || "—")}–${escHtml(payload.max || "—")}</strong>.
      </div>
      <div style="display: flex; gap: 8px; justify-content: center;">
        <button data-action="later" style="
          padding: 9px 18px; border: 1px solid #d8dde3; border-radius: 18px;
          font-size: 13px; cursor: pointer; background: white; color: #555;
        ">Mai târziu</button>
        <button data-action="go" style="
          padding: 9px 22px; border: none; border-radius: 18px; font-size: 13px;
          font-weight: 600; cursor: pointer;
          background: linear-gradient(135deg, #17a2b8, #1289a0); color: white;
          box-shadow: 0 2px 6px rgba(23,162,184,0.35);
        ">Pornește</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "later") {
      overlay.remove();
    } else if (btn.dataset.action === "go") {
      const url = buildTeammSearchUrl(payload.key);
      const tab = window.open(url, "_blank");
      if (!tab) {
        taToast("⚠️ Popup blocat — deschid în fila curentă", true);
        overlay.remove();
        window.location.assign(url);
        return;
      }
      overlay.remove();
      taToast("🚀 Setup teamm pornit în altă filă");
    }
  });

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

async function taAdminDelete(key) {
  if (!confirm('Ștergi testul "' + key + '"?')) return;

  const result = await window.SyncManager.apiCall(
    "DELETE",
    "test_definitions&key=" + encodeURIComponent(key)
  );

  if (result?.success) {
    taLoadTests();
    await window.refreshTestDefinitions();
    taToast("🗑️ Test șters");
  } else {
    taToast("❌ Eroare la ștergere", true);
  }
}

function taToast(msg, isError = false) {
  const existing = document.getElementById("ta-toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "ta-toast";
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; bottom: 60px; right: 20px; padding: 10px 20px;
    border-radius: 8px; color: white; font-size: 13px; font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 100010;
    background: ${isError ? '#dc3545' : '#28a745'};
    transition: opacity 0.3s;
  `;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

// Export
window.openTestAdmin = openTestAdmin;
window.closeTestAdmin = closeTestAdmin;
