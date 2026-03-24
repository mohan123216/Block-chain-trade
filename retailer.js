/* =====================================================
   RETAILER.JS — Retailer Dashboard Logic
   Depends on: shared.js
   ===================================================== */

let availableProducts = [];  // all products still with manufacturer
let myRequests        = [];  // retailer's submitted requests (to manufacturers)
let myInventory       = [];  // products currently owned by retailer
let customerReqRows   = [];  // customer requests for products I own
let activeTab         = "browse"; // "browse" | "requests" | "inventory" | "customer"

// ─── Init ─────────────────────────────────────────────
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
      } catch (e) {
        console.warn("eth_accounts failed:", e);
      }
    }
    // If not connected, still load the browse view read-only.
    await loadAvailableProducts();
  })();
});

async function initConnect(silent = false) {
  await connectWallet(async () => {
    userRole = await getUserRole();
    if (userRole === ROLE.None) {
      const ok = await registerRole(ROLE.Retailer);
      if (ok) userRole = ROLE.Retailer;
      // Always continue to loadAll — don't return early even if registration failed
    } else if (userRole !== ROLE.Retailer) {
      showToast(`⚠ Wallet registered as ${ROLE_NAMES[userRole]}, not Retailer.`, "warning");
    }
    await loadAll(); // Always load products after connecting
  });
}

function doDisconnect() {
  disconnectWallet(() => {
    availableProducts = []; myRequests = []; myInventory = []; customerReqRows = [];
    switchTab("browse");
  });
}

async function loadAll() {
  showLoading("Loading products…");
  try {
    await Promise.all([loadAvailableProducts(), loadMyRequests(), loadInventory(), loadCustomerRequests()]);
    updateStats();
  } finally { hideLoading(); }
}

// ─── Tab Switcher ─────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  ["browse", "requests", "inventory", "customer"].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle("tab-active", t === tab);
    document.getElementById(`panel-${t}`)?.classList.toggle("hidden", t !== tab);
  });
}

// ─── Stats ────────────────────────────────────────────
function updateStats() {
  document.getElementById("stat-available").textContent = availableProducts.length;
  document.getElementById("stat-pending").textContent   = myRequests.filter(r => r.status === REQ_STATUS.Pending).length;
  document.getElementById("stat-approved").textContent  = myRequests.filter(r => r.status === REQ_STATUS.Approved).length;
  document.getElementById("stat-owned").textContent     = myInventory.length;
}

// ─── Browse: Available Products ────────────────────────
async function loadAvailableProducts() {
  // Prefer connected signer contract, otherwise use read-only (MetaMask if possible, else public Sepolia RPC).
  let readContract = getBestReadContract?.();
  if (!readContract) {
    renderBrowseTable([]);
    showToast("Contract not configured (missing address/ABI).", "warning");
    return;
  }

  try {
    // Fetch all product IDs from chain
    let ids = [];
    try { 
      ids = await readContract.getAllProductIds(); 
    } catch (e) { 
      console.error("getAllProductIds (primary):", e);

      // If there's no bytecode at the configured address on the current chain,
      // calls will always fail. Distinguish "wrong chain" vs "wrong address".
      try {
        const p   = readContract.provider;
        const net = await p.getNetwork();
        const code = await p.getCode(CONTRACT_ADDRESS);
        if (!code || code === "0x") {
          if (typeof SEPOLIA_CHAIN_ID === "number" && net.chainId === SEPOLIA_CHAIN_ID) {
            showToast(
              `No contract deployed at ${shortAddress(CONTRACT_ADDRESS, 6)} on Sepolia. Update CONTRACT_ADDRESS in shared.js.`,
              "error"
            );
            return;
          }
          showToast(
            `Contract not found on ${networkName(net.chainId)}. Trying Sepolia read-only…`,
            "warning"
          );
        }
      } catch {}

      // If MetaMask is on the wrong chain / not authorized, try the public Sepolia RPC fallback.
      const fallback = getReadOnlyContract?.();
      if (fallback && fallback !== readContract) {
        try {
          readContract = fallback;
          ids = await readContract.getAllProductIds();
          showToast("Loaded products via public Sepolia RPC (read-only). Connect + switch to Sepolia to request/buy.", "info");
        } catch (e2) {
          console.error("getAllProductIds (fallback):", e2);
          showToast("Failed to fetch products. Connect MetaMask and switch to Sepolia.", "error");
          return;
        }
      } else {
        showToast("Failed to fetch products. Connect MetaMask and switch to Sepolia.", "error");
        return;
      }
    }
    
    console.log("All product IDs on chain:", ids.map(id => id.toString()));

    if (ids.length === 0) {
      // Common gotcha: Manufacturer created on Sepolia, but retailer is currently on a different chain.
      // If that's the case, try Sepolia public RPC once before concluding "no products".
      let chainId = null;
      try {
        const hex = await window.ethereum?.request?.({ method: "eth_chainId" });
        if (typeof hex === "string" && hex.startsWith("0x")) chainId = parseInt(hex, 16);
      } catch {}

      const fallback = getReadOnlyContract?.();
      if (fallback && chainId && typeof SEPOLIA_CHAIN_ID === "number" && chainId !== SEPOLIA_CHAIN_ID && fallback !== readContract) {
        try {
          const sepoliaIds = await fallback.getAllProductIds();
          if (Array.isArray(sepoliaIds) && sepoliaIds.length > 0) {
            readContract = fallback;
            ids = sepoliaIds;
            showToast("You're not on Sepolia. Showing Sepolia products read-only; switch to Sepolia to request/buy.", "warning");
          }
        } catch (e) {
          console.warn("Sepolia fallback getAllProductIds failed:", e);
        }
      }

      if (ids.length === 0) {
        availableProducts = [];
        renderBrowseTable([]);
        showToast("No products on chain. The manufacturer needs to create some first.", "info");
        return;
      }
    }

    // Fetch each product detail
    const all = (await Promise.all(ids.map(async id => {
      try {
        const r = await readContract.getProduct(id);
        return { id: r[0].toString(), name: r[1], owner: r[2], price: parseFloat(ethers.utils.formatEther(r[3])), priceWei: r[3], manufacturer: r[4], quantity: r[5].toNumber(), history: [] };
      } catch (e) { 
        console.warn("getProduct error for id", id.toString(), e.message); 
        return null; 
      }
    }))).filter(Boolean);

    if (all.length === 0 && ids.length > 0) {
      showToast(`Found ${ids.length} product IDs, but failed to load their data. ABI mismatch?`, "error");
      return;
    }

    // Show products still owned by manufacturer (available to request)
    availableProducts = all.filter(p => p.owner.toLowerCase() === p.manufacturer.toLowerCase());
    
    if (all.length > 0 && availableProducts.length === 0) {
      showToast(`There are ${all.length} products, but all of them are already sold.`, "info");
    }

    // Attach my request status if wallet connected
    if (walletAddress) {
      for (const p of availableProducts) {
        p.myStatus = REQ_STATUS.NotRequested;
        try {
          const reqs = await getProductRequestsFull(p.id);
          const myReqs = reqs.filter(r => r.retailer.toLowerCase() === walletAddress.toLowerCase());
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
    renderBrowseTable([]);
  }
}

function renderBrowseTable(products) {
  const tbody = document.getElementById("browse-tbody");
  if (!products.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
      <p>No products available for purchase</p>
      <small>Manufacturers haven't listed any products yet</small>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const status   = p.myStatus ?? REQ_STATUS.NotRequested;
    const notReq   = status === 255;
    const pending  = status === REQ_STATUS.Pending;
    const approved = status === REQ_STATUS.Approved;
    const rejected = status === REQ_STATUS.Rejected;
    const completed = status === REQ_STATUS.Completed;

    let actionBtn = "";
    if (completed) {
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
      <td><span class="owner-address" title="${p.manufacturer}">${shortAddress(p.manufacturer, 6)}</span></td>
      <td><span class="price-tag">${p.price} ETH</span></td>
      <td><span style="font-weight:600">${p.quantity} Units</span></td>
      <td>${notReq || pending || rejected || completed || approved ? statusBadge(pending ? 0 : rejected ? 2 : approved ? 1 : completed ? 3 : 255) : statusBadge(255)}</td>
      <td><div class="actions-cell">
        ${actionBtn}
        <button class="btn btn-ghost" onclick='openHistoryModal("${p.id}", "${escapeHtml(p.name)}")' title="View history">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join("");
}

// ─── My Requests Panel ────────────────────────────────
async function loadMyRequests() {
  if (!contract || !walletAddress) return;
  try {
    const all = await getAllProducts();
    const results = [];
    await Promise.all(all.map(async p => {
      const allReqs = await getProductRequestsFull(p.id);
      const myReqs = allReqs.filter(r => r.retailer.toLowerCase() === walletAddress.toLowerCase());
      myReqs.forEach(req => {
        results.push({ product: p, status: req.status, quantity: req.quantity, timestamp: req.timestamp });
      });
    }));
    myRequests = results;
    // Sort: approved first, then pending, then others
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
  if (!requests.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>No requests submitted yet</p>
      <small>Go to "Browse Products" tab to request products</small>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(r => {
    const p        = r.product;
    const approved = r.status === REQ_STATUS.Approved;
    const completed = r.status === REQ_STATUS.Completed;

    return `<tr ${approved ? 'style="background:rgba(34,211,160,.04)"' : ''}>
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="price-tag">${p.price} ETH</span></td>
      <td><span style="font-weight:600">${r.quantity} Units</span></td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div class="actions-cell">
          ${approved
            ? `<button class="btn btn-pay" onclick="handlePay('${p.id}', '${escapeHtml(p.name)}', '${p.priceWei}', ${r.quantity})">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                 Pay ${parseFloat(ethers.utils.formatEther(ethers.BigNumber.from(p.priceWei).mul(r.quantity)))} ETH
               </button>
               <button class="btn btn-ghost" style="color:var(--accent-danger);" onclick="handleCancelRequest('${p.id}')">Cancel</button>`
            : r.status === REQ_STATUS.Pending
              ? `<button class="btn btn-ghost" style="color:var(--accent-danger);" onclick="handleCancelRequest('${p.id}')">Cancel</button>`
            : completed
              ? `<span style="color:var(--accent-success);font-size:.78rem;font-weight:700">✅ In Inventory</span>`
              : `<span style="color:var(--text-muted);font-size:.78rem">Waiting…</span>`}
        </div>
      </td>
    </tr>`;
  }).join("");
}

// ─── My Inventory ─────────────────────────────────────
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
  if (!products.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
      <p>Inventory is empty</p>
      <small>Purchase approved products to add them here</small>
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
          <button class="btn btn-ghost" onclick="switchTab('customer'); loadCustomerRequests();" title="View customer requests">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Requests
          </button>
        </div>
      </td>
    </tr>`).join("");
}

// â”€â”€â”€ Customer Requests (Customerâ†’Retailer) â”€â”€â”€â”€â”€â”€â”€â”€
async function loadCustomerRequests() {
  const tbody = document.getElementById("customer-tbody");
  if (!tbody) return;
  if (!contract || !walletAddress) { renderCustomerRequestsTable([]); return; }

  try {
    // Ensure inventory is available.
    if (!myInventory.length) {
      myInventory = await getProductsOwnedBy(walletAddress);
    }

    const rows = [];
    for (const p of myInventory) {
      const reqs = await getCustomerRequestsFull(p.id);
      for (const r of reqs) {
        rows.push({ product: p, customer: r.customer, status: r.status, timestamp: r.timestamp, quantity: r.quantity });
      }
    }

    // Pending first, then approved, then others. Newer first within status.
    rows.sort((a, b) => {
      const order = { 0: 0, 1: 1, 2: 2, 3: 3, 255: 9 };
      const oa = order[a.status] ?? 99;
      const ob = order[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    });

    customerReqRows = rows;
    renderCustomerRequestsTable(customerReqRows);
  } catch (e) {
    console.error("loadCustomerRequests:", e);
    renderCustomerRequestsTable([]);
  }
}

function renderCustomerRequestsTable(rows) {
  const tbody = document.getElementById("customer-tbody");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state" style="padding:2.5rem">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>No customer requests yet</p>
      <small>Customers will request products once you have inventory</small>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const p = r.product;
    const pending = r.status === REQ_STATUS.Pending;
    const approved = r.status === REQ_STATUS.Approved;
    const completed = r.status === REQ_STATUS.Completed;

    let action = `<span style="color:var(--text-muted);font-size:.78rem">â€”</span>`;
    if (pending) {
      action = `<button class="btn btn-approve" onclick="handleApproveCustomer('${p.id}', '${r.customer}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Approve
      </button>`;
    } else if (approved) {
      action = `<span style="color:var(--accent-success);font-size:.78rem;font-weight:700">âœ… Awaiting Payment</span>`;
    } else if (completed) {
      action = `<span style="color:var(--text-muted);font-size:.78rem">Completed</span>`;
    }

    return `<tr ${pending ? 'style="background:rgba(245,158,11,.04)"' : approved ? 'style="background:rgba(34,211,160,.04)"' : ''}>
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="owner-address" title="${r.customer}">${shortAddress(r.customer, 6)}</span></td>
      <td><span style="font-weight:600">${r.quantity} Units</span></td>
      <td>${statusBadge(r.status)}</td>
      <td><div class="actions-cell">
         ${action}
         ${(pending || approved) ? `<button class="btn btn-ghost" style="color:var(--accent-danger);" onclick="handleCancelCustomerRequest('${p.id}', '${r.customer}')">Cancel</button>` : ''}
      </div></td>
    </tr>`;
  }).join("");
}

async function handleApproveCustomer(productId, customerAddr) {
  await approveCustomerRequestOnChain(productId, customerAddr, async () => {
    await loadCustomerRequests();
    switchTab("customer");
  });
}

async function handleCancelCustomerRequest(productId, customerAddr) {
  if (!confirm(`Cancel/Reject request for Product #${productId} from ${shortAddress(customerAddr)}?`)) return;
  await cancelCustomerRequestOnChain(productId, customerAddr, async () => {
    await loadCustomerRequests();
    switchTab("customer");
  });
}

// ─── Request Handler ──────────────────────────────────
async function handleRequest(productId, productName, maxQty) {
  if (!walletAddress) { showToast("Connect wallet first.", "warning"); return; }
  const qtyStr = prompt(`Enter quantity to request for "${productName}" (Max: ${maxQty}):`, "1");
  if (!qtyStr) return;
  const qty = parseInt(qtyStr, 10);
  if (isNaN(qty) || qty < 1 || qty > maxQty) { showToast("Invalid quantity.", "error"); return; }
  
  await requestProductOnChain(productId, qty, async () => {
    await loadAll();
    switchTab("requests");
  });
}

async function handleCancelRequest(productId) {
  if (!confirm(`Cancel your request for Product #${productId}?`)) return;
  await cancelRequestOnChain(productId, walletAddress, async () => {
    await loadAll();
    switchTab("requests");
  });
}

// ─── Payment Handler ──────────────────────────────────
async function handlePay(productId, productName, priceWeiStr, reqQuantity) {
  const priceWei = ethers.BigNumber.from(priceWeiStr);
  const totalWei = priceWei.mul(reqQuantity);
  const totalEth = ethers.utils.formatEther(totalWei);
  if (!confirm(`Pay ${totalEth} SepoliaETH for ${reqQuantity} Units of Product #${productId} "${productName}"?\n\nThis amount will be sent to the manufacturer.`)) return;
  await payForProductOnChain(productId, totalWei, async () => {
    await loadAll();
    switchTab("inventory");
  });
}

// ─── Sell to Customer (Transfer from inventory) ────────
let sellProductId = null;
function openSellModal(productId, productName) {
  sellProductId = productId;
  document.getElementById("sell-product-label").textContent = `Product #${productId} — ${productName}`;
  document.getElementById("sell-to").value = "";
  document.getElementById("sell-modal").classList.remove("hidden");
}
function closeSellModal() {
  sellProductId = null;
  document.getElementById("sell-modal").classList.add("hidden");
}
async function confirmSell() {
  const toAddr = document.getElementById("sell-to").value.trim();
  if (!toAddr || !toAddr.startsWith("0x") || toAddr.length !== 42) {
    showToast("Enter a valid Ethereum address.", "error"); return;
  }
  closeSellModal();
  await transferProductOnChain(sellProductId, toAddr, loadAll);
}

// ─── Search ────────────────────────────────────────────
function filterBrowse() {
  const q = document.getElementById("search-browse").value.toLowerCase();
  renderBrowseTable(availableProducts.filter(p =>
    p.name.toLowerCase().includes(q) || String(p.id).includes(q) || p.manufacturer.toLowerCase().includes(q)));
}
function filterInventory() {
  const q = document.getElementById("search-inventory").value.toLowerCase();
  renderInventoryTable(myInventory.filter(p =>
    p.name.toLowerCase().includes(q) || String(p.id).includes(q)));
}
