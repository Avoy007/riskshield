// ============================================================
//  main.js — Risk Management Dashboard
//  Handles: API calls, DOM rendering, form submissions
// ============================================================

const API = "";  // Same origin — Flask serves both HTML and API

// ── Utility: Toast Notifications ────────────────────────────
function showToast(message, type = "success") {
  const icons = { success: "✅", error: "❌" };
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

// ── Utility: Format currency ─────────────────────────────────
function formatCurrency(val) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  }).format(val);
}

// ── Utility: Format date ─────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Utility: Risk badge HTML ─────────────────────────────────
function riskBadge(level) {
  const cls = { High: "risk-high", Medium: "risk-medium", Low: "risk-low" };
  return `<span class="risk-badge ${cls[level] || "risk-low"}">${level || "N/A"}</span>`;
}

// ── Utility: Account type badge ──────────────────────────────
function acctBadge(type) {
  const t = (type || "").toLowerCase();
  const map = { savings: "acct-savings", checking: "acct-checking", loan: "acct-loan" };
  return `<span class="acct-badge ${map[t] || "acct-other"}">${type}</span>`;
}

// ── Utility: Probability bar ─────────────────────────────────
function probBar(prob, level) {
  const colors = { High: "#ef4444", Medium: "#f59e0b", Low: "#10b981" };
  const color = colors[level] || "#6366f1";
  const pct = Math.round((prob || 0) * 100);
  return `
    <div class="prob-bar-wrap">
      <div class="prob-bar-track">
        <div class="prob-bar-fill" style="width:${pct}%; background:${color};"></div>
      </div>
      <span class="prob-val">${pct}%</span>
    </div>`;
}

// ── Update live clock ─────────────────────────────────────────
function startClock() {
  const el = document.getElementById("topbar-time");
  if (!el) return;
  const update = () => {
    el.textContent = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  };
  update();
  setInterval(update, 1000);
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════

async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/dashboard`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Stat cards
    animateCount("stat-customers",    data.total_customers);
    animateCount("stat-accounts",     data.total_accounts);
    animateCount("stat-transactions", data.total_transactions);
    animateCount("stat-risks",        data.total_risks);

    // High-risk alerts
    const alertsEl = document.getElementById("alerts-list");
    if (alertsEl) {
      if (!data.high_risk_alerts.length) {
        alertsEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛡️</div><div class="empty-state-text">No high-risk alerts</div></div>`;
      } else {
        alertsEl.innerHTML = data.high_risk_alerts.map(a => `
          <div class="alert-card">
            <div class="alert-icon">⚠️</div>
            <div class="alert-body">
              <div class="alert-title">${a.risk_type} — ${a.customer_name}</div>
              <div class="alert-desc">${a.description || "No description"}</div>
            </div>
            <div class="alert-meta">${Math.round((a.probability||0)*100)}% prob.</div>
          </div>`).join("");
      }
    }

    // Recent transactions
    const txEl = document.getElementById("recent-tx");
    if (txEl) {
      txEl.innerHTML = data.recent_transactions.length
        ? `<table class="data-table">
            <thead><tr>
              <th>ID</th><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th>
            </tr></thead>
            <tbody>${data.recent_transactions.map(t => `
              <tr>
                <td><span class="id-tag">#${t.transaction_id}</span></td>
                <td>${t.customer_name}</td>
                <td>${acctBadge(t.account_type)}</td>
                <td class="balance-positive">${formatCurrency(t.amount)}</td>
                <td class="mono-sm">${formatDate(t.transaction_date)}</td>
              </tr>`).join("")}
            </tbody>
          </table>`
        : `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No transactions yet</div></div>`;
    }

    // Risk distribution
    const distEl = document.getElementById("risk-dist");
    if (distEl && data.risk_distribution.length) {
      const total = data.risk_distribution.reduce((s, r) => s + r.count, 0);
      const colors = { High: "#ef4444", Medium: "#f59e0b", Low: "#10b981" };
      distEl.innerHTML = `<div class="dist-list">` +
        data.risk_distribution.map(r => {
          const pct = Math.round((r.count / total) * 100);
          return `
            <div class="dist-item">
              <div class="dist-header">
                <span class="dist-label" style="color:${colors[r.risk_level]}">${r.risk_level} Risk</span>
                <span class="dist-count">${r.count} / ${total}</span>
              </div>
              <div class="dist-track">
                <div class="dist-fill" style="width:${pct}%; background:${colors[r.risk_level]};"></div>
              </div>
            </div>`;
        }).join("") + `</div>`;
    }

    // Alert badge in topbar
    const badge = document.getElementById("alert-badge");
    if (badge) badge.textContent = `${data.high_risk_alerts.length} ALERTS`;

  } catch (err) {
    console.error("Dashboard error:", err);
    showToast("Failed to load dashboard data", "error");
  }
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.floor(target / 40));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString();
    if (current >= target) clearInterval(timer);
  }, 25);
}

// ════════════════════════════════════════════════════════════
//  CUSTOMERS PAGE
// ════════════════════════════════════════════════════════════

async function loadCustomers() {
  const tbody = document.getElementById("customers-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="margin:20px;"></div></td></tr>`;

  try {
    const res = await fetch(`${API}/api/customers`);
    const data = await res.json();

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-text">No customers found</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(c => `
      <tr>
        <td><span class="id-tag">#${c.customer_id}</span></td>
        <td><strong>${c.customer_name}</strong></td>
        <td class="mono-sm">${c.email}</td>
        <td class="mono-sm">${c.phone}</td>
        <td>${c.total_accounts}</td>
        <td class="balance-positive">${formatCurrency(c.total_balance)}</td>
      </tr>`).join("");

    document.getElementById("customer-count").textContent = `${data.length} records`;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--accent-red);text-align:center;padding:24px">Failed to load customers</td></tr>`;
  }
}

// ════════════════════════════════════════════════════════════
//  ACCOUNTS PAGE
// ════════════════════════════════════════════════════════════

async function loadAccounts() {
  const tbody = document.getElementById("accounts-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton" style="margin:20px;"></div></td></tr>`;

  try {
    const res = await fetch(`${API}/api/accounts`);
    const data = await res.json();

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">🏦</div><div class="empty-state-text">No accounts found</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(a => `
      <tr>
        <td><span class="id-tag">#${a.account_id}</span></td>
        <td><strong>${a.customer_name}</strong></td>
        <td class="mono-sm">${a.email}</td>
        <td>${acctBadge(a.account_type)}</td>
        <td class="balance-positive">${formatCurrency(a.balance)}</td>
        <td>${a.transaction_count}</td>
      </tr>`).join("");

    document.getElementById("account-count").textContent = `${data.length} records`;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--accent-red);text-align:center;padding:24px">Failed to load accounts</td></tr>`;
  }
}

// ════════════════════════════════════════════════════════════
//  RISKS PAGE
// ════════════════════════════════════════════════════════════

async function loadRisks() {
  const tbody = document.getElementById("risks-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8"><div class="skeleton" style="margin:20px;"></div></td></tr>`;

  try {
    const res = await fetch(`${API}/api/risks`);
    const data = await res.json();

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🔒</div><div class="empty-state-text">No risks recorded</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td><span class="id-tag">#${r.risk_id}</span></td>
        <td><strong>${r.customer_name}</strong></td>
        <td>${r.risk_type}</td>
        <td>${r.department_name}</td>
        <td>${riskBadge(r.risk_level)}</td>
        <td>${probBar(r.probability, r.risk_level)}</td>
        <td class="mono-sm" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.description}">${r.description || "—"}</td>
        <td class="mono-sm" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.action_description}">${r.action_description || "—"}</td>
      </tr>`).join("");

    document.getElementById("risk-count").textContent = `${data.length} records`;

    // Update filter counts
    const high   = data.filter(r => r.risk_level === "High").length;
    const medium = data.filter(r => r.risk_level === "Medium").length;
    const low    = data.filter(r => r.risk_level === "Low").length;

    const hEl = document.getElementById("count-high");
    const mEl = document.getElementById("count-medium");
    const lEl = document.getElementById("count-low");
    if (hEl) hEl.textContent = high;
    if (mEl) mEl.textContent = medium;
    if (lEl) lEl.textContent = low;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--accent-red);text-align:center;padding:24px">Failed to load risks</td></tr>`;
  }
}

// ── Risk filter ───────────────────────────────────────────────
function filterRisks(level) {
  const rows = document.querySelectorAll("#risks-tbody tr");
  rows.forEach(row => {
    if (!level) { row.style.display = ""; return; }
    const badge = row.querySelector(".risk-badge");
    row.style.display = (badge && badge.textContent.trim() === level) ? "" : "none";
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.level === (level || ""));
  });
}

// ════════════════════════════════════════════════════════════
//  ADD DATA PAGE — FORMS
// ════════════════════════════════════════════════════════════

// Tab switching
function switchTab(tabName) {
  document.querySelectorAll(".form-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === tabName)
  );
  document.querySelectorAll(".form-panel").forEach(p =>
    p.classList.toggle("active", p.id === `panel-${tabName}`)
  );
}

// ── Add Customer ──────────────────────────────────────────────
async function submitAddCustomer(e) {
  e.preventDefault();
  const btn = e.target.querySelector(".btn-submit");
  btn.textContent = "Saving…";
  btn.disabled = true;

  const payload = {
    customer_name: document.getElementById("c_name").value.trim(),
    email:         document.getElementById("c_email").value.trim(),
    phone:         document.getElementById("c_phone").value.trim()
  };

  try {
    const res = await fetch(`${API}/api/add_customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showToast(`Customer added! ID #${data.id}`);
    e.target.reset();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.textContent = "Add Customer";
    btn.disabled = false;
  }
}

// ── Add Account ───────────────────────────────────────────────
async function submitAddAccount(e) {
  e.preventDefault();
  const btn = e.target.querySelector(".btn-submit");
  btn.textContent = "Saving…";
  btn.disabled = true;

  const payload = {
    customer_id:  document.getElementById("a_customer").value,
    account_type: document.getElementById("a_type").value,
    balance:      parseFloat(document.getElementById("a_balance").value)
  };

  try {
    const res = await fetch(`${API}/api/add_account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showToast(`Account created! ID #${data.id}`);
    e.target.reset();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.textContent = "Create Account";
    btn.disabled = false;
  }
}

// ── Add Risk ──────────────────────────────────────────────────
async function submitAddRisk(e) {
  e.preventDefault();
  const btn = e.target.querySelector(".btn-submit");
  btn.textContent = "Saving…";
  btn.disabled = true;

  const payload = {
    transaction_id:     document.getElementById("r_transaction").value,
    department_id:      document.getElementById("r_department").value,
    risk_type:          document.getElementById("r_type").value,
    description:        document.getElementById("r_desc").value.trim(),
    risk_level:         document.getElementById("r_level").value,
    probability:        parseFloat(document.getElementById("r_prob").value) / 100,
    action_description: document.getElementById("r_action").value.trim()
  };

  try {
    const res = await fetch(`${API}/api/add_risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showToast(`Risk logged! ID #${data.risk_id}`);
    e.target.reset();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.textContent = "Log Risk";
    btn.disabled = false;
  }
}

// ── Populate dropdowns for Add-Data forms ─────────────────────
async function populateDropdowns() {
  // Customer dropdown
  const custSel = document.getElementById("a_customer");
  if (custSel) {
    try {
      const res = await fetch(`${API}/api/customers/list`);
      const data = await res.json();
      custSel.innerHTML = `<option value="">Select Customer</option>` +
        data.map(c => `<option value="${c.customer_id}">${c.customer_name}</option>`).join("");
    } catch {}
  }

  // Transaction dropdown
  const txSel = document.getElementById("r_transaction");
  if (txSel) {
    try {
      const res = await fetch(`${API}/api/transactions/list`);
      const data = await res.json();
      txSel.innerHTML = `<option value="">Select Transaction</option>` +
        data.map(t => `<option value="${t.transaction_id}">#${t.transaction_id} — ₹${t.amount} (${formatDate(t.transaction_date)})</option>`).join("");
    } catch {}
  }

  // Department dropdown
  const deptSel = document.getElementById("r_department");
  if (deptSel) {
    try {
      const res = await fetch(`${API}/api/departments/list`);
      const data = await res.json();
      deptSel.innerHTML = `<option value="">Select Department</option>` +
        data.map(d => `<option value="${d.department_id}">${d.department_name}</option>`).join("");
    } catch {}
  }
}

// ════════════════════════════════════════════════════════════
//  INIT on DOM ready
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  startClock();

  // Highlight active nav link
  const path = window.location.pathname;
  document.querySelectorAll(".nav-item").forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === path);
  });

  // Page-specific loaders
  if (document.getElementById("stat-customers"))  loadDashboard();
  if (document.getElementById("customers-tbody")) loadCustomers();
  if (document.getElementById("accounts-tbody"))  loadAccounts();
  if (document.getElementById("risks-tbody"))     loadRisks();

  // Add-data page
  if (document.getElementById("panel-customer")) {
    populateDropdowns();
    document.getElementById("form-customer")?.addEventListener("submit", submitAddCustomer);
    document.getElementById("form-account")?.addEventListener("submit", submitAddAccount);
    document.getElementById("form-risk")?.addEventListener("submit", submitAddRisk);
  }

  // Risk filter buttons
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => filterRisks(btn.dataset.level));
  });

  // Probability range live display
  const probInput = document.getElementById("r_prob");
  const probDisplay = document.getElementById("r_prob_display");
  if (probInput && probDisplay) {
    probInput.addEventListener("input", () => {
      probDisplay.textContent = `${probInput.value}%`;
    });
  }
});
// ── Theme Toggle Advanced ─────────────────────────────
function setTheme(theme) {
  const body = document.body;
  const btn = document.getElementById("theme-toggle");

  if (theme === "light") {
    body.classList.add("light");
    if (btn) btn.textContent = "🌙";
  } else {
    body.classList.remove("light");
    if (btn) btn.textContent = "☀️";
  }

  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light");
  setTheme(isLight ? "dark" : "light");
}

// ── Auto Load Theme ─────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("theme");

  if (saved) {
    setTheme(saved);
  } else {
    // Detect system theme
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(prefersLight ? "light" : "dark");
  }
});