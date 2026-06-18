import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/sqlite";
import { dealsTable } from "../lib/deals-schema";

const router: IRouter = Router();

function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env["ADMIN_KEY"]) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/admin/deals", requireAdminKey, (_req, res) => {
  const deals = db.select().from(dealsTable).all();
  res.json(deals);
});

router.patch("/admin/deals/:dealId", requireAdminKey, (req, res) => {
  const dealId = req.params["dealId"] as string;
  const { status } = req.body as { status: string };

  const allowed = ["released", "disputed", "resolved", "failed", "pending"];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    return;
  }

  const updated = db
    .update(dealsTable)
    .set({ status })
    .where(eq(dealsTable.dealId, dealId))
    .run();

  if (updated.changes === 0) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  res.json({ success: true, dealId, status });
});

router.get("/admin", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin — Deals Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f0faf4;
      color: #1a2e1a;
      min-height: 100vh;
    }
    #lock-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 16px;
    }
    #lock-screen h1 { font-size: 1.6rem; color: #1a7a40; }
    #lock-screen input {
      border: 2px solid #34a85a;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 1rem;
      width: 280px;
      outline: none;
    }
    #lock-screen input:focus { border-color: #1a7a40; box-shadow: 0 0 0 3px #c6f0d4; }
    #lock-error { color: #c0392b; font-size: 0.9rem; display: none; }
    #app { display: none; padding: 24px 16px; max-width: 960px; margin: 0 auto; }
    header {
      background: #1a7a40;
      color: #fff;
      padding: 18px 24px;
      border-radius: 12px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    header h1 { font-size: 1.3rem; font-weight: 700; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    .card {
      background: #fff;
      border: 1.5px solid #b2e0c4;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
    }
    .card .label { font-size: 0.75rem; color: #5a7a5a; text-transform: uppercase; letter-spacing: .05em; }
    .card .value { font-size: 1.6rem; font-weight: 700; color: #1a7a40; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
    thead { background: #1a7a40; color: #fff; }
    th, td { padding: 11px 14px; text-align: left; font-size: 0.88rem; }
    tr:not(:last-child) td { border-bottom: 1px solid #e5f5ec; }
    tbody tr:hover { background: #f5fdf8; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 99px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .badge-released  { background: #d4f5e2; color: #1a7a40; }
    .badge-disputed  { background: #fde8c8; color: #b05a00; }
    .badge-resolved  { background: #dbeafe; color: #1e40af; }
    .badge-failed    { background: #fee2e2; color: #b91c1c; }
    .badge-pending   { background: #f1f5f9; color: #475569; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    button {
      border: none;
      border-radius: 6px;
      padding: 5px 11px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s;
    }
    button:hover { opacity: .82; }
    .btn-disputed { background: #fde8c8; color: #b05a00; }
    .btn-resolved { background: #dbeafe; color: #1e40af; }
    .btn-released { background: #d4f5e2; color: #1a7a40; }
    #loading { text-align: center; padding: 40px; color: #5a7a5a; }
    @media (max-width: 600px) {
      th:nth-child(1), td:nth-child(1),
      th:nth-child(7), td:nth-child(7) { display: none; }
    }
  </style>
</head>
<body>

<div id="lock-screen">
  <h1>🔐 Admin Access</h1>
  <input type="password" id="password-input" placeholder="Enter admin password" autocomplete="current-password" />
  <p id="lock-error">Incorrect password. Try again.</p>
</div>

<div id="app">
  <header>
    <h1>Deals Dashboard</h1>
    <span id="last-updated" style="font-size:.82rem;opacity:.85"></span>
  </header>
  <div class="summary">
    <div class="card"><div class="label">Total Deals</div><div class="value" id="stat-total">—</div></div>
    <div class="card"><div class="label">KES Locked</div><div class="value" id="stat-locked">—</div></div>
    <div class="card"><div class="label">Released</div><div class="value" id="stat-released">—</div></div>
    <div class="card"><div class="label">Disputed</div><div class="value" id="stat-disputed">—</div></div>
  </div>
  <div id="loading">Loading deals…</div>
  <table id="deals-table" style="display:none">
    <thead>
      <tr>
        <th>Deal ID</th>
        <th>Item</th>
        <th>Amount (KES)</th>
        <th>Buyer</th>
        <th>Seller</th>
        <th>Status</th>
        <th>Timestamp</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="deals-body"></tbody>
  </table>
</div>

<script>
  let ADMIN_KEY = "";

  const passwordInput = document.getElementById("password-input");
  const lockError = document.getElementById("lock-error");

  passwordInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const entered = passwordInput.value.trim();
    if (!entered) return;

    const test = await fetch("/api/admin/deals", {
      headers: { "x-admin-key": entered }
    });

    if (test.ok) {
      ADMIN_KEY = entered;
      document.getElementById("lock-screen").style.display = "none";
      document.getElementById("app").style.display = "block";
      loadDeals(await test.json());
    } else {
      lockError.style.display = "block";
      passwordInput.value = "";
    }
  });

  function badgeClass(status) {
    return "badge badge-" + (status || "pending");
  }

  function fmt(ts) {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  function renderDeals(deals) {
    const body = document.getElementById("deals-body");
    body.innerHTML = "";

    let totalLocked = 0, released = 0, disputed = 0;
    deals.forEach(d => {
      totalLocked += d.amount;
      if (d.status === "released") released++;
      if (d.status === "disputed") disputed++;

      const tr = document.createElement("tr");
      tr.id = "row-" + d.dealId;
      tr.innerHTML = \`
        <td style="font-family:monospace;font-size:.8rem">\${d.dealId}</td>
        <td>\${d.itemTitle}</td>
        <td>\${Number(d.amount).toLocaleString()}</td>
        <td>\${d.buyerPhone}</td>
        <td>\${d.sellerPhone}</td>
        <td><span id="badge-\${d.dealId}" class="\${badgeClass(d.status)}">\${d.status}</span></td>
        <td>\${fmt(d.timestamp)}</td>
        <td class="actions">
          <button class="btn-disputed" onclick="setStatus('\${d.dealId}','disputed')">Dispute</button>
          <button class="btn-resolved" onclick="setStatus('\${d.dealId}','resolved')">Resolve</button>
          <button class="btn-released" onclick="setStatus('\${d.dealId}','released')">Release</button>
        </td>
      \`;
      body.appendChild(tr);
    });

    document.getElementById("stat-total").textContent = deals.length;
    document.getElementById("stat-locked").textContent = totalLocked.toLocaleString();
    document.getElementById("stat-released").textContent = released;
    document.getElementById("stat-disputed").textContent = disputed;
    document.getElementById("last-updated").textContent =
      "Updated " + new Date().toLocaleTimeString();
  }

  async function loadDeals(preloaded) {
    document.getElementById("loading").style.display = "block";
    document.getElementById("deals-table").style.display = "none";

    const deals = preloaded ?? await fetch("/api/admin/deals", {
      headers: { "x-admin-key": ADMIN_KEY }
    }).then(r => r.json());

    renderDeals(deals);
    document.getElementById("loading").style.display = "none";
    document.getElementById("deals-table").style.display = "table";
  }

  async function setStatus(dealId, status) {
    const res = await fetch(\`/api/admin/deals/\${dealId}\`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      const badge = document.getElementById("badge-" + dealId);
      if (badge) {
        badge.className = badgeClass(status);
        badge.textContent = status;
      }
    } else {
      alert("Failed to update status.");
    }
  }
</script>
</body>
</html>`);
});

export default router;
