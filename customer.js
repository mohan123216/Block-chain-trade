/* =====================================================
   CUSTOMER.JS — Customer Dashboard Logic
   Depends on: shared.js
   ===================================================== */

let availableProducts = []; // products currently owned by retailers
let myRequests        = []; // customer's submitted requests
let myInventory       = []; // products currently owned by customer
let activeTab         = "browse"; // "browse" | "requests" | "inventory"

// ─── Init ──────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  (async () => {
    // MetaMask no longer reliably exposes `selectedAddress`; use `eth_accounts` instead.
    if (window.ethereum) {
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (Array.isArray(accs) && accs.length > 0) {
          await initConnect(true);
          return;
        }
      } catch (e) { console.warn("eth_accounts failed:", e); }
    }
    // If not connected, still load browse view read-only.
    await loadAvailableProducts();
  })();
});

async function initConnect(silent = false) {
  await connectWallet(async () => {
    userRole = await getUserRole();
    if (userRole === ROLE.None) {
      const ok = await registerRole(ROLE.Customer);
      if (ok) userRole = ROLE.Customer;
    } else if (userRole !== ROLE.Customer) {
      showToast(`⚠ Wallet registered as ${ROLE_NAMES[userRole]}, not Customer.`, "warning");
    }
    await loadAll();
  });
}

function doDisconnect() {
  disconnectWallet(() => {
    availableProducts = []; myRequests = []; myInventory = [];
    renderBrowseTable([]);
    renderRequestsPanel([]);
    renderInventoryTable([]);
    updateStats();
    switchTab("browse");
  });
}

async function loadAll() {
  showLoading("Loading products…");
  try {
    await Promise.all([loadAvailableProducts(), loadMyRequests(), loadInventory()]);
    updateStats();
  } finally { hideLoading(); }
}

// ─── Tabs ──────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  ["browse", "requests", "inventory"].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle("tab-active", t === tab);
    document.getElementById(`panel-${t}`)?.classList.toggle("hidden", t !== tab);
  });
}

function updateStats() {
  document.getElementById("stat-available").textContent = availableProducts.length;
  document.getElementById("stat-pending").textContent   = myRequests.filter(r => r.status === REQ_STATUS.Pending).length;
  document.getElementById("stat-approved").textContent  = myRequests.filter(r => r.status === REQ_STATUS.Approved).length;
  document.getElementById("stat-owned").textContent     = myInventory.length;
}

// ─── Browse: Retailer-owned Products ───────────────────
async function loadAvailableProducts() {
  // Prefer connected signer contract, otherwise use read-only (MetaMask if possible, else public Sepolia RPC).
  let readContract = getBestReadContract?.();
  if (!readContract) { renderBrowseTable([]); return; }

  try {
    let ids = [];
    try {
      ids = await readContract.getAllProductIds();
    } catch (e) {
      console.error("getAllProductIds:", e);
      const fallback = getReadOnlyContract?.();
      if (fallback && fallback !== readContract) {
        readContract = fallback;
        ids = await readContract.getAllProductIds();
        showToast("Loaded products via public Sepolia RPC (read-only). Connect + switch to Sepolia to request/buy.", "info");
      } else {
        showToast("Failed to fetch products. Connect MetaMask and switch to Sepolia.", "error");
        renderBrowseTable([]);
        return;
      }
    }

    if (!ids.length) {
      availableProducts = [];
      renderBrowseTable([]);
      return;
    }

    // Fetch product details
    const all = (await Promise.all(ids.map(async id => {
      try {
        const r = await readContract.getProduct(id);
        return {
          id: r[0].toString(),
          name: r[1],
          owner: r[2],
          price: parseFloat(ethers.utils.formatEther(r[3])),
          priceWei: r[3],
          manufacturer: r[4],
          quantity: r[5].toNumber(),
          history: []
        };
      } catch (e) {
        console.warn("getProduct error for id", id.toString(), e.message);
        return null;
      }
    }))).filter(Boolean);

    // Filter to retailer-owned products by checking the owner's registered role.
    const owners = [...new Set(all.map(p => p.owner.toLowerCase()))];
    const roles = await Promise.all(owners.map(async addr => {
      try { return Number(await readContract.getRole(addr)); } catch { return ROLE.None; }
    }));
    const roleMap = new Map(owners.map((o, i) => [o, roles[i]]));
    availableProducts = all.filter(p => roleMap.get(p.owner.toLowerCase()) === ROLE.Retailer);

    // Attach my request status if wallet connected
    if (walletAddress && contract) {
      for (const p of availableProducts) {
        p.myStatus = REQ_STATUS.NotRequested;
        try {
          const reqs = await getCustomerRequestsFull(p.id);
          const myReqs = reqs.filter(r => r.customer.toLowerCase() === walletAddress.toLowerCase());
          if (myReqs.length > 0) {
            const latestReq = myReqs[myReqs.length - 1]; // newest
            p.myStatus = latestReq.status;
            p.myReqQuantity = latestReq.quantity;
          }
        } catch (e) { console.error("Could not fetch request details", e); }
      }
    }

    renderBrowseTable(availableProducts);
  } catch (e) {
    console.error("loadAvailableProducts:", e);
    showToast("Failed to load products: " + friendlyError(e), "error");
    availableProducts = [];
    renderBrowseTable([]);
  }
}

function renderBrowseTable(products) {
  const tbody = document.getElementById("browse-tbody");
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
      <p>No products available</p>
      <small>Retailers haven't listed any products yet</small>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const status    = p.myStatus ?? REQ_STATUS.NotRequested;
    const notReq    = status === REQ_STATUS.NotRequested;
    const pending   = status === REQ_STATUS.Pending;
    const approved  = status === REQ_STATUS.Approved;
    const rejected  = status === REQ_STATUS.Rejected;
    const completed = status === REQ_STATUS.Completed;

    let actionBtn = "";
    if (!walletAddress) {
      actionBtn = `<button class="btn btn-ghost" onclick="initConnect()">Connect to Request</button>`;
    } else if (completed) {
      if (p.quantity > 0) {
        actionBtn = `
          <span style="color:var(--accent-success);font-size:.78rem;font-weight:700;margin-right:8px">✅ Purchased</span>
          <button class="btn btn-request" onclick="handleRequest('${p.id}', '${escapeHtml(p.name)}', ${p.quantity})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Request More
          </button>`;
      } else {
        actionBtn = `<span style="color:var(--text-muted);font-size:.78rem;font-weight:700">✅ Sold Out / Purchased</span>`;
      }
    } else if (approved) {
      const qty = p.myReqQuantity || 1;
      const totalPrice = parseFloat(ethers.utils.formatEther(ethers.BigNumber.from(p.priceWei).mul(qty)));
      actionBtn = `<button class="btn btn-pay" onclick="handlePay('${p.id}', '${escapeHtml(p.name)}', '${p.priceWei}', ${qty})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Pay ${totalPrice} ETH
      </button>`;
    } else if (pending) {
      actionBtn = `<button class="btn btn-ghost" disabled style="opacity:.5;cursor:not-allowed">Requested</button>`;
    } else if (rejected) {
      actionBtn = `<span style="color:var(--accent-danger);font-size:.78rem;font-weight:700">❌ Rejected</span>`;
    } else {
      actionBtn = `<button class="btn btn-request" onclick="handleRequest('${p.id}', '${escapeHtml(p.name)}', ${p.quantity})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Request
      </button>`;
    }

    return `<tr>
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="owner-address" title="${p.owner}">${shortAddress(p.owner, 6)}</span></td>
      <td><span class="price-tag">${p.price} ETH</span></td>
      <td><span style="font-weight:600">${p.quantity} Units</span></td>
      <td>${statusBadge(status)}</td>
      <td><div class="actions-cell">
        ${actionBtn}
        <button class="btn btn-ghost" onclick='openHistoryModal("${p.id}", "${escapeHtml(p.name)}")' title="View history">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join("");
}

async function handleRequest(productId, productName, maxQty) {
  if (!walletAddress) { showToast("Connect wallet first.", "warning"); return; }
  const qtyStr = prompt(`Enter quantity to request for "${productName}" (Max: ${maxQty}):`, "1");
  if (!qtyStr) return;
  const qty = parseInt(qtyStr, 10);
  if (isNaN(qty) || qty < 1 || qty > maxQty) { showToast("Invalid quantity.", "error"); return; }
  
  await requestFromRetailerOnChain(productId, qty, async () => {
    await loadAll();
    switchTab("requests");
  });
}

async function handlePay(productId, productName, priceWeiStr, reqQuantity) {
  const priceWei = ethers.BigNumber.from(priceWeiStr);
  const totalWei = priceWei.mul(reqQuantity);
  const totalEth = ethers.utils.formatEther(totalWei);
  if (!confirm(`Pay ${totalEth} SepoliaETH for ${reqQuantity} Units of Product #${productId} "${productName}"?\n\nThis amount will be sent to the retailer.`)) return;
  await payRetailerForProductOnChain(productId, totalWei, async () => {
    await loadAll();
    switchTab("inventory");
  });
}

async function handleCancelRequest(productId) {
  if (!confirm(`Cancel your request for Product #${productId}?`)) return;
  await cancelCustomerRequestOnChain(productId, walletAddress, async () => {
    await loadAll();
    switchTab("requests");
  });
}

// ─── My Requests ───────────────────────────────────────
async function loadMyRequests() {
  if (!contract || !walletAddress) return;
  try {
    const all = await getAllProducts();
    const results = [];
    await Promise.all(all.map(async p => {
      const allReqs = await getCustomerRequestsFull(p.id);
      const myReqs = allReqs.filter(r => r.customer.toLowerCase() === walletAddress.toLowerCase());
      myReqs.forEach(req => {
        results.push({ product: p, status: req.status, quantity: req.quantity, timestamp: req.timestamp });
      });
    }));
    myRequests = results;
    myRequests.sort((a, b) => {
      const order = { 1: 0, 0: 1, 2: 2, 3: 3 };
      return (order[a.status] ?? 99) - (order[b.status] ?? 99);
    });
    renderRequestsPanel(myRequests);
  } catch (e) {
    console.error("loadMyRequests:", e);
  }
}

function renderRequestsPanel(requests) {
  const tbody = document.getElementById("requests-tbody");
  if (!tbody) return;
  if (!requests.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>No requests submitted yet</p>
      <small>Go to "Browse Products" tab to request products</small>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(r => {
    const p         = r.product;
    const pending   = r.status === REQ_STATUS.Pending;
    const approved  = r.status === REQ_STATUS.Approved;
    const completed = r.status === REQ_STATUS.Completed;

    return `<tr ${approved ? 'style="background:rgba(34,211,160,.04)"' : ''}>
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="price-tag">${p.price} ETH</span></td>
      <td><span style="font-weight:600">${r.quantity} Units</span></td>
      <td>
        <div class="actions-cell">
          ${approved
            ? `<button class="btn btn-pay" onclick="handlePay('${p.id}', '${escapeHtml(p.name)}', '${p.priceWei}', ${r.quantity})">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                 Pay ${parseFloat(ethers.utils.formatEther(ethers.BigNumber.from(p.priceWei).mul(r.quantity)))} ETH
               </button>
               <button class="btn btn-ghost" style="color:var(--accent-danger);" onclick="handleCancelRequest('${p.id}')">Cancel</button>`
            : pending
               ? `<button class="btn btn-ghost" style="color:var(--accent-danger);" onclick="handleCancelRequest('${p.id}')">Cancel</button>`
            : completed
              ? `<span style="color:var(--accent-success);font-size:.78rem;font-weight:700">✅ In Inventory</span>`
              : `<span style="color:var(--text-muted);font-size:.78rem">Waiting…</span>`}
        </div>
      </td>
    </tr>`;
  }).join("");
}

// ─── Inventory ─────────────────────────────────────────
async function loadInventory() {
  if (!contract || !walletAddress) return;
  try {
    myInventory = await getProductsOwnedBy(walletAddress);
    renderInventoryTable(myInventory);
  } catch (e) {
    console.error("loadInventory:", e);
  }
}

function renderInventoryTable(products) {
  const tbody = document.getElementById("inventory-tbody");
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <p>No products in your inventory yet</p>
      <small>Request and purchase a product to see it here</small>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="owner-address" title="${p.manufacturer}">${shortAddress(p.manufacturer, 6)}</span></td>
      <td><span class="price-tag">${p.price} ETH</span></td>
      <td><span style="font-weight:600">${p.quantity} Units</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-ghost" onclick='openHistoryModal("${p.id}", "${escapeHtml(p.name)}")'>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>
            History
          </button>
        </div>
      </td>
    </tr>`).join("");
}

// ─── Search ────────────────────────────────────────────
function filterBrowse() {
  const q = document.getElementById("search-browse").value.toLowerCase();
  renderBrowseTable(availableProducts.filter(p =>
    p.name.toLowerCase().includes(q) || String(p.id).includes(q) || p.owner.toLowerCase().includes(q)));
}

function filterInventory() {
  const q = document.getElementById("search-inventory").value.toLowerCase();
  renderInventoryTable(myInventory.filter(p =>
    p.name.toLowerCase().includes(q) || String(p.id).includes(q)));
}

