// Admin Tests v1.1.0
// Modal UI for managing test definitions, injected into the Sante portal

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
      <!-- Add/edit form -->
      <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-size: 14px; font-weight: bold; color: #17a2b8; margin-bottom: 12px;" id="ta-form-title">Adaugă test nou</div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
          <div style="flex: 1; min-width: 100px;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 3px;">Cheie Teamm</label>
            <input type="text" id="ta-key" placeholder="ex: B12" style="width: 100%; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
          </div>
          <div style="flex: 1.5; min-width: 120px;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 3px;">Nume afișat</label>
            <input type="text" id="ta-name" placeholder="ex: Vitamina B12" style="width: 100%; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
          </div>
          <div style="flex: 2; min-width: 150px;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 3px;">Text din PDF</label>
            <input type="text" id="ta-pattern" placeholder="ex: Vitamina B12" style="width: 100%; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
          </div>
          <div style="flex: 0 0 auto;">
            <button data-action="save" id="ta-save-btn" style="
              padding: 7px 18px; border: none; border-radius: 16px; font-size: 12px;
              font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #17a2b8, #1289a0);
              color: white;
            ">Salvează</button>
          </div>
        </div>
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 16px;">
          <span style="font-size: 11px; color: #888;">
            💡 <strong>Text din PDF</strong> = textul exact cum apare în PDF. Spațiile devin flexibile automat.
          </span>
          <label style="font-size: 11px; color: #888; cursor: pointer; white-space: nowrap;">
            <input type="checkbox" id="ta-raw-regex"> Regex avansat
          </label>
        </div>
      </div>

      <!-- Test list -->
      <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-size: 14px; font-weight: bold; color: #17a2b8; margin-bottom: 12px;">
          Teste configurate (<span id="ta-count">0</span>)
        </div>
        <div id="ta-list" style="font-size: 13px;"></div>
      </div>
    </div>
  `;

  // Event delegation for buttons inside the modal
  modal.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "save") taAdminSave();
    else if (action === "close") closeTestAdmin();
    else if (action === "edit") taAdminEdit(window._taTests[parseInt(btn.dataset.index)]);
    else if (action === "delete") taAdminDelete(btn.dataset.key);
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

async function taAdminSave() {
  const key = document.getElementById("ta-key").value.trim();
  const name = document.getElementById("ta-name").value.trim();
  const rawText = document.getElementById("ta-pattern").value.trim();
  const isRawRegex = document.getElementById("ta-raw-regex").checked;

  if (!key || !name || !rawText) {
    alert("Completează toate câmpurile.");
    return;
  }

  const pattern = isRawRegex ? rawText : textToPattern(rawText);

  const result = await window.SyncManager.apiCall("POST", "test_definitions", {
    key, name, pattern,
  });

  if (result?.success) {
    taClearForm();
    taLoadTests();
    await window.refreshTestDefinitions();
    taToast("✅ Test salvat");
  } else {
    taToast("❌ Eroare la salvare", true);
  }
}

function taAdminEdit(t) {
  document.getElementById("ta-key").value = t.key;
  document.getElementById("ta-name").value = t.name;
  document.getElementById("ta-pattern").value = t.pattern;
  document.getElementById("ta-raw-regex").checked = true;
  document.getElementById("ta-form-title").textContent = "Editează: " + t.name;
  document.getElementById("ta-save-btn").textContent = "Actualizează";
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

function taClearForm() {
  document.getElementById("ta-key").value = "";
  document.getElementById("ta-name").value = "";
  document.getElementById("ta-pattern").value = "";
  document.getElementById("ta-raw-regex").checked = false;
  document.getElementById("ta-form-title").textContent = "Adaugă test nou";
  document.getElementById("ta-save-btn").textContent = "Salvează";
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
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 100001;
    background: ${isError ? '#dc3545' : '#28a745'};
    transition: opacity 0.3s;
  `;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// Export
window.openTestAdmin = openTestAdmin;
window.closeTestAdmin = closeTestAdmin;
