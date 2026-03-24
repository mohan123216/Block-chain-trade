/* =====================================================
   MANUFACTURER.JS — Manufacturer Dashboard Logic
   Depends on: shared.js
   ===================================================== */

let mfgProducts = [];

// ─── Init ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const cd = document.getElementById("contract-display");
  if (cd) cd.textContent = shortAddress(CONTRACT_ADDRESS, 10);
  if (window.ethereum?.selectedAddress) initConnect(true);
});

async function initConnect(silent = false) {
  await connectWallet(async () => {
    userRole = await getUserRole();
    if (userRole === ROLE.None) {
      const ok = await registerRole(ROLE.Manufacturer);
      if (!ok) return;
      userRole = ROLE.Manufacturer;
    } else if (userRole !== ROLE.Manufacturer) {
      showToast(`⚠ Wallet registered as ${ROLE_NAMES[userRole]}, not Manufacturer.`, "warning");
    }
    await loadMyProducts();
    await loadAllRequests();
  });
}

function doDisconnect() {
  disconnectWallet(() => {
    mfgProducts = [];
    renderProductTable([]);
    updateStats([]);
    document.getElementById("requests-body").innerHTML = emptyRequestsRow("Connect your wallet to see requests.");
  });
}

// ─── Create Product ────────────────────────────────────
async function handleCreateProduct(event) {
  event.preventDefault();
  if (!walletAddress) { showToast("Connect your wallet first.", "warning"); return; }

  const idIn = document.getElementById("product-id");
  const nameIn = document.getElementById("product-name");
  const priceIn = document.getElementById("product-price");
  const qtyIn = document.getElementById("product-quantity");
  clearFormErrors([idIn, nameIn, priceIn, qtyIn]);

  const pid = idIn.value.trim();
  const pname = nameIn.value.trim();
  const pprice = priceIn.value.trim();
  const pqty = qtyIn.value.trim();
  let valid = true;

  if (!pid || isNaN(pid) || Number(pid) < 1)           { markFormError(idIn,    "Enter a valid Product ID > 0."); valid = false; }
  if (!pname || pname.length < 2)                       { markFormError(nameIn,  "Name must be at least 2 chars."); valid = false; }
  if (pprice === "" || isNaN(pprice) || Number(pprice) < 0) { markFormError(priceIn, "Enter a valid price ≥ 0."); valid = false; }
  if (pqty === "" || isNaN(pqty) || Number(pqty) < 1) { markFormError(qtyIn, "Quantity must be ≥ 1."); valid = false; }
  if (!valid) return;
  if (!contract) { showToast("Contract not connected.", "error"); return; }

  try {
    showLoading("Sending transaction to blockchain…");
    const priceWei = ethers.utils.parseEther(pprice);
    const tx = await contract.createProduct(Number(pid), pname, priceWei, Number(pqty));
    showLoading("Waiting for confirmation…");
    const receipt = await tx.wait();
    showToast(`✅ Product "${pname}" registered on Sepolia! Block #${receipt.blockNumber}`, "success");
    event.target.reset();
    await loadMyProducts();
    await loadAllRequests();
  } catch (err) {
    console.error("createProduct:", err);
    showToast(friendlyError(err), "error");
  } finally { hideLoading(); }
}

// ─── Load My Products ─────────────────────────────────
async function loadMyProducts() {
  if (!contract || !walletAddress) return;
  showLoading("Loading your products…");
  try {
    const allIds = await contract.getAllProductIds();
    const allProds = await fetchProductsByIds(allIds);
    // Manufacturer's original products (still held by manufacturer, or just representing the remaining batch)
    const myOriginalProducts = allProds.filter(p => p.manufacturer.toLowerCase() === walletAddress.toLowerCase() && p.owner.toLowerCase() === walletAddress.toLowerCase());
    
    // soldProducts are those where manufacturer is walletAddress BUT owner is NOT
    const soldProducts = allProds.filter(p => p.manufacturer.toLowerCase() === walletAddress.toLowerCase() && p.owner.toLowerCase() !== walletAddress.toLowerCase());
    
    mfgProducts = myOriginalProducts;
    updateStats(mfgProducts, soldProducts);
    renderProductTable(mfgProducts);
  } catch (e) {
    console.error("loadMyProducts:", e);
    showToast("Failed to load products: " + friendlyError(e), "error");
  } finally { hideLoading(); }
}

function updateStats(ownedProducts, soldProducts) {
  const ownedCount = ownedProducts.length;
  const soldCount  = soldProducts ? soldProducts.length : 0;
  document.getElementById("stat-total").textContent       = ownedCount + soldCount;
  document.getElementById("stat-owned").textContent       = ownedCount;
  document.getElementById("stat-transferred").textContent = soldCount;
}

// ─── Product Table ────────────────────────────────────
function renderProductTable(products) {
  const tbody = document.getElementById("product-tbody");
  if (!products.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
      <p>No products created yet</p><small>Use the form on the left to register your first product</small>
    </div></td></tr>`;
    return;
  }
  const isMine = addr => addr.toLowerCase() === walletAddress?.toLowerCase();
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="price-tag">${p.price} ETH</span></td>
      <td><span style="font-weight:600">${p.quantity} Units</span></td>
      <td>
        ${isMine(p.owner)
          ? (p.quantity > 0 ? `<span class="badge-you">In Stock</span>` : `<span class="badge-transferred">Sold Out</span>`)
          : `<span class="badge-transferred">Sold</span>`}
      </td>
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

// ─── Search ───────────────────────────────────────────
function filterTable() {
  const isMine = addr => addr.toLowerCase() === walletAddress?.toLowerCase();
  const ownedProducts = mfgProducts.filter(p => isMine(p.owner));
  const q = document.getElementById("search-input").value.toLowerCase();
  renderProductTable(ownedProducts.filter(p =>
    p.name.toLowerCase().includes(q) || String(p.id).includes(q)));
}

// ─── Requests Panel ───────────────────────────────────
async function loadAllRequests() {
  if (!contract || !walletAddress || !mfgProducts.length) {
    document.getElementById("requests-body").innerHTML = emptyRequestsRow("No products yet. Create a product first.");
    return;
  }

  showLoading("Loading incoming requests…");
  try {
    // Collect all requests across all products
    let allRequests = [];
    for (const product of mfgProducts) {
      const reqs = await getProductRequestsFull(product.id);
      reqs.forEach(r => allRequests.push({ ...r, product }));
    }

    // Sort by timestamp descending (newest first)
    allRequests.sort((a, b) => b.timestamp - a.timestamp);

    renderRequestsTable(allRequests);
    updateRequestStat(allRequests);
  } catch (e) {
    console.error("loadAllRequests:", e);
    showToast("Failed to load requests: " + friendlyError(e), "error");
  } finally { hideLoading(); }
}

function updateRequestStat(reqs) {
  const pending = reqs.filter(r => r.status === REQ_STATUS.Pending).length;
  document.getElementById("stat-requests").textContent = pending;
  const badge = document.getElementById("pending-badge");
  if (badge) {
    badge.textContent    = pending > 0 ? pending : "";
    badge.style.display  = pending > 0 ? "inline-flex" : "none";
  }
}

function renderRequestsTable(requests) {
  const tbody = document.getElementById("requests-body");
  if (!requests.length) {
    tbody.innerHTML = emptyRequestsRow("No requests from retailers yet.");
    return;
  }
  tbody.innerHTML = requests.map(r => {
    const time     = new Date(r.timestamp * 1000);
    const timeStr  = time.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    const isPending = r.status === REQ_STATUS.Pending;
    const isSold    = r.product.quantity === 0;
    return `
    <tr>
      <td>${timeStr}</td>
      <td><span class="product-id-badge">#${r.product.id}</span> <span style="font-weight:600;margin-left:.4rem">${escapeHtml(r.product.name)}</span></td>
      <td><span class="price-tag">${r.product.price} ETH</span></td>
      <td>
        <span class="owner-address mono-text" title="${r.retailer}">${shortAddress(r.retailer, 8)}</span>
      </td>
      <td><span style="font-weight:600">${r.quantity} Units</span></td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div class="actions-cell">
        ${isPending && !isSold
          ? `<button class="btn btn-approve" onclick="handleApprove('${r.product.id}', '${r.retailer}', '${escapeHtml(r.product.name)}')">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
               Approve
             </button>
             <button class="btn btn-ghost" style="color:var(--text-muted)" onclick="handleCancel('${r.product.id}', '${r.retailer}')">Reject</button>`
          : r.status === REQ_STATUS.Approved
            ? `<button class="btn btn-ghost" style="color:var(--accent-danger);" onclick="handleCancel('${r.product.id}', '${r.retailer}')">Cancel</button>`
            : r.status === REQ_STATUS.Completed
              ? `<span style="color:var(--accent-success);font-weight:700;font-size:.78rem">Finished</span>`
              : `<span style="color:var(--text-muted);font-size:.78rem">—</span>`
        }
        </div>
      </td>
    </tr>`;
  }).join("");
}

async function handleApprove(productId, retailerAddr, productName) {
  if (!confirm(`Approve ${shortAddress(retailerAddr)} to purchase Product #${productId} "${productName}"?`)) return;
  await approveRequestOnChain(productId, retailerAddr, async () => {
    await loadMyProducts();
    await loadAllRequests();
  });
}

async function handleCancel(productId, retailerAddr) {
  if (!confirm(`Cancel/Reject request for Product #${productId} from ${shortAddress(retailerAddr)}?`)) return;
  await cancelRequestOnChain(productId, retailerAddr, async () => {
    await loadMyProducts();
    await loadAllRequests();
  });
}

function emptyRequestsRow(msg) {
  return `<tr class="empty-row"><td colspan="6"><div class="empty-state" style="padding:2rem">
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <p>${msg}</p>
  </div></td></tr>`;
}

// ─── Form Helpers ─────────────────────────────────────
function markFormError(input, msg) {
  input.classList.add("error");
  let hint = input.closest(".form-group")?.querySelector(".field-hint");
  if (!hint) { hint = document.createElement("span"); hint.className = "field-hint"; input.closest(".form-group")?.appendChild(hint); }
  hint.style.color = "var(--accent-danger)"; hint.textContent = msg;
  input.addEventListener("input", () => { input.classList.remove("error"); hint.style.color = ""; }, { once: true });
}
function clearFormErrors(inputs) {
  inputs.forEach(i => { i.classList.remove("error"); const h = i.closest(".form-group")?.querySelector(".field-hint"); if (h) h.style.color = ""; });
}
