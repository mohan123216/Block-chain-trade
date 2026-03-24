/* =====================================================
   BLOCKCHAIN TRADE SYSTEM — MANUFACTURER MODULE
   Ethers.js v5 + MetaMask + QRCode.js
   ===================================================== */

// ─────────────────────────────────────────────────────
// 🔧 CONFIGURATION — update after deploying your contract
// ─────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x6338c49480B315bF919BCAf94786267E8033305f"; // ← replace this

/**
 * Minimal ABI — matches the TradeSupplyChain contract functions used here.
 * Expand with your full ABI after deploying.
 */
const CONTRACT_ABI = [
  // Create a product
  {
    "inputs": [
      { "internalType": "uint256", "name": "id",   "type": "uint256" },
      { "internalType": "string",  "name": "name", "type": "string"  },
      { "internalType": "uint256", "name": "price","type": "uint256" }
    ],
    "name": "createProduct",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Get product details
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "getProduct",
    "outputs": [
      { "internalType": "uint256", "name": "productId",    "type": "uint256" },
      { "internalType": "string",  "name": "name",         "type": "string"  },
      { "internalType": "address", "name": "currentOwner", "type": "address" },
      { "internalType": "uint256", "name": "price",        "type": "uint256" },
      { "internalType": "address", "name": "manufacturer",  "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Get all product IDs created by a specific manufacturer
  {
    "inputs": [{ "internalType": "address", "name": "manufacturer", "type": "address" }],
    "name": "getManufacturerProducts",
    "outputs": [
      { "internalType": "uint256[]", "name": "", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Get ownership history
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "getHistory",
    "outputs": [
      { "internalType": "address[]", "name": "", "type": "address[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Get all product IDs created by this manufacturer
  {
    "inputs": [],
    "name": "getAllProductIds",
    "outputs": [
      { "internalType": "uint256[]", "name": "", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Event emitted when a product is created
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "internalType": "uint256", "name": "id",    "type": "uint256" },
      { "indexed": false, "internalType": "string",  "name": "name",  "type": "string"  },
      { "indexed": true,  "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "ProductCreated",
    "type": "event"
  }
];

// ─────────────────────────────────────────────────────
// 🌐 State
// ─────────────────────────────────────────────────────
let provider  = null;
let signer    = null;
let contract  = null;
let walletAddress = null;
let allProducts   = [];   // cache for search/filter

// ─────────────────────────────────────────────────────
// 🚀 Init
// ─────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Populate contract address display
  const contractDisplay = document.getElementById("contract-display");
  if (contractDisplay) {
    contractDisplay.textContent =
      CONTRACT_ADDRESS !== "YOUR_DEPLOYED_CONTRACT_ADDRESS"
        ? shortAddress(CONTRACT_ADDRESS, 10)
        : "⚠ Not configured — update CONTRACT_ADDRESS";
  }


  // Auto-reconnect if already authorised
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet(true);
  }

  // MetaMask account/chain change listeners
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        walletAddress = accounts[0];
        updateWalletUI();
        loadProducts();
      }
    });
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
});

// ─────────────────────────────────────────────────────
// 👛 WALLET — Connect
// ─────────────────────────────────────────────────────
async function connectWallet(silent = false) {
  if (!window.ethereum) {
    showToast(
      "MetaMask not detected. Please install the MetaMask extension.",
      "error"
    );
    return;
  }

  try {
    showLoading("Connecting wallet…");

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    walletAddress = await signer.getAddress();

    // Init contract (only if address is configured)
    if (CONTRACT_ADDRESS !== "YOUR_DEPLOYED_CONTRACT_ADDRESS") {
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    }

    updateWalletUI();
    await updateNetworkBanner();
    await loadProducts();

    if (!silent) showToast("Wallet connected successfully!", "success");
  } catch (err) {
    console.error(err);
    if (!silent) showToast(friendlyError(err), "error");
  } finally {
    hideLoading();
  }
}

// ─────────────────────────────────────────────────────
// 👛 WALLET — Disconnect (UI only — MetaMask manages auth)
// ─────────────────────────────────────────────────────
function disconnectWallet() {
  provider = signer = contract = walletAddress = null;
  allProducts = [];

  document.getElementById("connect-wallet-btn").classList.remove("hidden");
  document.getElementById("disconnect-btn").classList.add("hidden");
  document.getElementById("wallet-info").classList.add("hidden");
  document.getElementById("network-banner").classList.add("hidden");

  document.getElementById("total-products").textContent = "0";
  document.getElementById("wallet-eth").textContent = "0.00";
  document.getElementById("last-tx-status").textContent = "None";

  renderProductTable([]);
  showToast("Wallet disconnected.", "info");
}

// ─────────────────────────────────────────────────────
// 🖥  WALLET — Update UI
// ─────────────────────────────────────────────────────
function updateWalletUI() {
  if (!walletAddress) return;

  document.getElementById("connect-wallet-btn").classList.add("hidden");
  document.getElementById("disconnect-btn").classList.remove("hidden");

  const walletInfo = document.getElementById("wallet-info");
  walletInfo.classList.remove("hidden");
  document.getElementById("wallet-address").textContent = shortAddress(walletAddress, 6);
}

async function updateNetworkBanner() {
  if (!provider) return;
  try {
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(walletAddress);
    const ethBal  = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);

    document.getElementById("network-name").textContent =
      networkName(network.chainId);
    document.getElementById("wallet-balance").textContent = `${ethBal} ETH`;
    document.getElementById("wallet-eth").textContent = ethBal;
    document.getElementById("network-banner").classList.remove("hidden");
  } catch (e) {
    console.warn("Could not fetch network info:", e);
  }
}

// ─────────────────────────────────────────────────────
// 📦 CREATE PRODUCT
// ─────────────────────────────────────────────────────
async function createProduct(event) {
  event.preventDefault();

  // — Validation —
  if (!walletAddress) {
    showToast("Please connect your MetaMask wallet first.", "warning");
    return;
  }

  const idInput    = document.getElementById("product-id");
  const nameInput  = document.getElementById("product-name");
  const priceInput = document.getElementById("product-price");

  clearErrors([idInput, nameInput, priceInput]);

  const productId   = idInput.value.trim();
  const productName = nameInput.value.trim();
  const productPrice = priceInput.value.trim();

  let valid = true;

  if (!productId || isNaN(productId) || Number(productId) < 1) {
    markError(idInput, "Enter a valid positive Product ID.");
    valid = false;
  }
  if (!productName || productName.length < 2) {
    markError(nameInput, "Enter a product name (min 2 characters).");
    valid = false;
  }
  if (!productPrice || isNaN(productPrice) || Number(productPrice) < 0) {
    markError(priceInput, "Enter a valid price (≥ 0).");
    valid = false;
  }

  if (!valid) return;

  // — Contract call —
  if (!contract) {
    // Demo mode — store in memory
    return createProductDemo(productId.toString(), productName, Number(productPrice));
  }

  try {
    showLoading("Sending transaction to blockchain…");

    const priceWei = ethers.utils.parseEther(productPrice);
    const tx = await contract.createProduct(
      productId.toString(),
      productName,
      priceWei
    );

    updateLoadingText("Waiting for confirmation…");
    const receipt = await tx.wait();

    document.getElementById("last-tx-status").textContent =
      `Block #${receipt.blockNumber}`;

    showToast(`✅ Product "${productName}" registered on blockchain!`, "success");
    event.target.reset();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), "error");
    document.getElementById("last-tx-status").textContent = "Failed";
  } finally {
    hideLoading();
  }
}

// Demo mode (no contract deployed yet)
function createProductDemo(id, name, price) {
  const exists = allProducts.find((p) => p.id === id);
  if (exists) {
    showToast(`Product ID ${id} already exists.`, "error");
    return;
  }

  const product = {
    id,
    name,
    owner: walletAddress || "0xDEMO…",
    price,
    history: [walletAddress || "0xDEMO…"],
    createdAt: Date.now(),
  };

  allProducts.push(product);
  document.getElementById("total-products").textContent = allProducts.length;
  document.getElementById("last-tx-status").textContent = "Demo";

  renderProductTable(allProducts);
  showToast(
    `✅ [DEMO] Product "${name}" created locally. Deploy the contract to go live.`,
    "success"
  );

  document.getElementById("product-form").reset();
}

// ─────────────────────────────────────────────────────
// 📋 LOAD PRODUCTS
// ─────────────────────────────────────────────────────
async function loadProducts() {
  if (!contract) {
    renderProductTable(allProducts);
    document.getElementById("total-products").textContent = allProducts.length;
    return;
  }

  try {
    showLoading("Fetching products from blockchain…");

    // Try manufacturer-specific list first, fall back to all IDs
    let ids = [];
    try {
      ids = await contract.getManufacturerProducts(walletAddress);
      console.log("Loaded manufacturer product IDs:", ids.map(i => i.toString()));
    } catch (e1) {
      console.warn("getManufacturerProducts failed, trying getAllProductIds:", e1.message);
      try {
        ids = await contract.getAllProductIds();
        console.log("Loaded all product IDs:", ids.map(i => i.toString()));
      } catch (e2) {
        console.error("getAllProductIds also failed:", e2.message);
        ids = [];
      }
    }

    if (ids.length === 0) {
      allProducts = [];
      document.getElementById("total-products").textContent = "0";
      renderProductTable([]);
      hideLoading();
      return;
    }

    const products = await Promise.all(
      ids.map(async (id) => {
        try {
          const result = await contract.getProduct(id);
          // result[0]=productId, [1]=name, [2]=currentOwner, [3]=price, [4]=manufacturer
          const pid      = result[0];
          const name     = result[1];
          const owner    = result[2];
          const priceBN  = result[3];
          console.log(`Product ${pid.toString()}: name=${name}, owner=${owner}`);
          return {
            id:    pid.toString(),
            name,
            owner,
            price: parseFloat(ethers.utils.formatEther(priceBN)),
            history: [],
          };
        } catch (e) {
          console.error("Failed to load product ID", id.toString(), e.message);
          return null;
        }
      })
    );

    allProducts = products.filter(Boolean);
    document.getElementById("total-products").textContent = allProducts.length;
    renderProductTable(allProducts);
    if (allProducts.length === 0) {
      showToast("No products found for this wallet.", "info");
    }
  } catch (err) {
    console.error("loadProducts error:", err);
    showToast("Could not load products: " + friendlyError(err), "error");
  } finally {
    hideLoading();
  }
}

// ─────────────────────────────────────────────────────
// 🗂  RENDER TABLE
// ─────────────────────────────────────────────────────
function renderProductTable(products) {
  const tbody = document.getElementById("product-tbody");
  tbody.innerHTML = "";

  if (!products || products.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
            </svg>
            <p>No products registered yet</p>
            <small>Create your first product using the form</small>
          </div>
        </td>
      </tr>`;
    return;
  }

  products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="product-id-badge">#${p.id}</span></td>
      <td style="font-weight:600">${escapeHtml(p.name)}</td>
      <td><span class="owner-address" title="${p.owner}">${shortAddress(p.owner, 6)}</span></td>
      <td><span class="price-tag">${p.price} ETH</span></td>

      <td>
        <div class="actions-cell">
          <button class="btn btn-ghost" onclick="showHistoryModal('${p.id}', '${escapeHtml(p.name)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
            </svg>
            History
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────────────
// 🔍 SEARCH / FILTER
// ─────────────────────────────────────────────────────
function filterProducts() {
  const query = document.getElementById("search-input").value.toLowerCase();
  const filtered = allProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      String(p.id).includes(query) ||
      p.owner.toLowerCase().includes(query)
  );
  renderProductTable(filtered);
}

// ─────────────────────────────────────────────────────
// 🕑 HISTORY MODAL
// ─────────────────────────────────────────────────────
async function showHistoryModal(productId, productName) {
  document.getElementById("history-modal-title").textContent = "Ownership History";
  document.getElementById("history-product-name").textContent =
    `Product #${productId} — ${productName}`;
  document.getElementById("history-content").innerHTML =
    `<div class="history-loading">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;margin-right:8px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg>
       Loading history…
     </div>`;

  document.getElementById("history-modal").classList.remove("hidden");

  try {
    let history;

    if (contract) {
      const raw = await contract.getHistory(productId);
      history = raw; // address[]
    } else {
      // Demo mode — look up locally
      const product = allProducts.find((p) => p.id === productId);
      history = product ? product.history : [];
    }

    renderHistory(history, productId);
  } catch (err) {
    console.error(err);
    document.getElementById("history-content").innerHTML =
      `<p style="color:var(--accent-danger);padding:1rem;">Failed to load history: ${friendlyError(err)}</p>`;
  }
}

function renderHistory(history, productId) {
  const container = document.getElementById("history-content");

  if (!history || history.length === 0) {
    container.innerHTML =
      `<p style="color:var(--text-muted);padding:1rem 0;">No ownership history found for Product #${productId}.</p>`;
    return;
  }

  const labels = ["Created By (Manufacturer)", "Transferred To", "Current Owner"];
  const icons  = [
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 12 12 5 19 12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>`,
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  ];

  const html = history.map((addr, idx) => {
    const label =
      idx === 0 ? labels[0]
      : idx === history.length - 1 ? labels[2]
      : `${labels[1]} (Step ${idx})`;

    const icon = icons[Math.min(idx, icons.length - 1)];

    return `
      <div class="history-item">
        <div class="history-dot">${icon}</div>
        <div class="history-body">
          <div class="history-step">${label}</div>
          <div class="history-addr">${addr}</div>
          <div class="history-meta">Transfer index: ${idx + 1} of ${history.length}</div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `<div class="history-timeline">${html}</div>`;
}

function closeHistoryModal() {
  document.getElementById("history-modal").classList.add("hidden");
}


// ─────────────────────────────────────────────────────
// 📋 COPY CONTRACT ADDRESS
// ─────────────────────────────────────────────────────
function copyContractAddress() {
  if (CONTRACT_ADDRESS === "YOUR_DEPLOYED_CONTRACT_ADDRESS") {
    showToast("Contract address not configured yet.", "warning");
    return;
  }
  navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
    showToast("Contract address copied!", "success");
  });
}

// ─────────────────────────────────────────────────────
// 🔔 TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");

  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${icons[type] || icons.info}
    <span class="toast-msg">${message}</span>
    <div class="toast-progress"></div>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, 4200);
}

// ─────────────────────────────────────────────────────
// ⏳ LOADING OVERLAY
// ─────────────────────────────────────────────────────
function showLoading(text = "Processing…") {
  document.getElementById("loading-text").textContent = text;
  document.getElementById("loading-overlay").classList.remove("hidden");
}

function updateLoadingText(text) {
  document.getElementById("loading-text").textContent = text;
}

function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

// ─────────────────────────────────────────────────────
// 🧰 UTILITIES
// ─────────────────────────────────────────────────────

/** Shorten an Ethereum address for display */
function shortAddress(addr, chars = 6) {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/** Map chain ID to network name */
function networkName(chainId) {
  const names = {
    1:     "Ethereum Mainnet",
    5:     "Goerli Testnet",
    11155111: "Sepolia Testnet",
    137:   "Polygon",
    80001: "Mumbai Testnet",
    56:    "BSC Mainnet",
    43114: "Avalanche",
    31337: "Hardhat Local",
    1337:  "Ganache Local",
  };
  return names[chainId] || `Chain ${chainId}`;
}

/** Convert ethers errors to human-readable messages */
function friendlyError(err) {
  if (!err) return "Unknown error";
  if (err.code === 4001) return "Transaction rejected by user.";
  if (err.code === "INSUFFICIENT_FUNDS") return "Insufficient ETH balance.";
  if (err.code === "NETWORK_ERROR") return "Network error — check your connection.";
  if (err.message?.includes("already exists")) return "Product ID already exists on chain.";
  if (err.message?.includes("user rejected")) return "Transaction rejected by user.";
  if (err.message?.includes("MetaMask")) return err.message;
  return err.reason || err.message?.slice(0, 120) || "Transaction failed.";
}

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
  if (typeof str !== "string") return str ?? "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Mark an input as having an error */
function markError(input, message) {
  input.classList.add("error");
  let hint = input.closest(".form-group")?.querySelector(".field-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "field-hint";
    input.closest(".form-group")?.appendChild(hint);
  }
  hint.style.color = "var(--accent-danger)";
  hint.textContent = message;

  input.addEventListener("input", () => {
    input.classList.remove("error");
    if (hint) hint.style.color = "";
  }, { once: true });
}

function clearErrors(inputs) {
  inputs.forEach((input) => {
    input.classList.remove("error");
    const hint = input.closest(".form-group")?.querySelector(".field-hint");
    if (hint) {
      hint.style.color = "";
      // Restore any original hint text
      if (hint.dataset.original) hint.textContent = hint.dataset.original;
    }
  });
}
