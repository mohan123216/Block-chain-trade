/* =====================================================
   BLOCKCHAIN TRADE SYSTEM — shared.js
   Common wallet, contract, and utility code
   used by all 3 role dashboards.
   ===================================================== */

// ─── Configuration ────────────────────────────────────
const CONTRACT_ADDRESS = "0x51AE5e53a9aD1baB0FDBCfCa2Fd3a1382fdF3b97"; // ← update after redeployment
// Read-only fallback RPCs (used when MetaMask isn't connected/authorized).
// Keep Sepolia first because the UI copy assumes Sepolia.
const SEPOLIA_CHAIN_ID = 11155111;
const READONLY_RPC_URLS = [
  "https://ethereum-sepolia.publicnode.com",
  "https://rpc.sepolia.org"
];

const CONTRACT_ABI = [
  // registerRole(uint8)
  { inputs: [{ internalType: "uint8", name: "role", type: "uint8" }], name: "registerRole", outputs: [], stateMutability: "nonpayable", type: "function" },
  // getRole(address) → uint8
  { inputs: [{ internalType: "address", name: "account", type: "address" }], name: "getRole", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  // createProduct(uint256, string, uint256, uint256)
  { inputs: [{ internalType: "uint256", name: "id", type: "uint256" }, { internalType: "string", name: "name", type: "string" }, { internalType: "uint256", name: "price", type: "uint256" }, { internalType: "uint256", name: "quantity", type: "uint256" }], name: "createProduct", outputs: [], stateMutability: "nonpayable", type: "function" },
  // requestProduct(uint256, uint256) — Retailer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "uint256", name: "quantity", type: "uint256" }], name: "requestProduct", outputs: [], stateMutability: "nonpayable", type: "function" },
  // approveRequest(uint256, address) — Manufacturer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "address", name: "retailerAddr", type: "address" }], name: "approveRequest", outputs: [], stateMutability: "nonpayable", type: "function" },
  // cancelRequest(uint256, address) — Manufacturer or Retailer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "address", name: "requester", type: "address" }], name: "cancelRequest", outputs: [], stateMutability: "nonpayable", type: "function" },
  // payForProduct(uint256) payable — Retailer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }], name: "payForProduct", outputs: [], stateMutability: "payable", type: "function" },
  // requestFromRetailer(uint256, uint256) — Customer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "uint256", name: "quantity", type: "uint256" }], name: "requestFromRetailer", outputs: [], stateMutability: "nonpayable", type: "function" },
  // approveCustomerRequest(uint256, address) — Retailer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "address", name: "customerAddr", type: "address" }], name: "approveCustomerRequest", outputs: [], stateMutability: "nonpayable", type: "function" },
  // cancelCustomerRequest(uint256, address) — Retailer or Customer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "address", name: "requester", type: "address" }], name: "cancelCustomerRequest", outputs: [], stateMutability: "nonpayable", type: "function" },
  // payRetailerForProduct(uint256) payable — Customer
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }], name: "payRetailerForProduct", outputs: [], stateMutability: "payable", type: "function" },
  // transferProduct(uint256, address) — current owner → any address (retailer→customer)
  { inputs: [{ internalType: "uint256", name: "id", type: "uint256" }, { internalType: "address", name: "to", type: "address" }], name: "transferProduct", outputs: [], stateMutability: "nonpayable", type: "function" },
  // updatePrice(uint256, uint256)
  { inputs: [{ internalType: "uint256", name: "id", type: "uint256" }, { internalType: "uint256", name: "newPrice", type: "uint256" }], name: "updatePrice", outputs: [], stateMutability: "nonpayable", type: "function" },
  // getProduct(uint256) → (productId, name, currentOwner, price, manufacturer, quantity)
  {
    inputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    name: "getProduct",
    outputs: [
      { internalType: "uint256", name: "productId",    type: "uint256" },
      { internalType: "string",  name: "name",         type: "string"  },
      { internalType: "address", name: "currentOwner", type: "address" },
      { internalType: "uint256", name: "price",        type: "uint256" },
      { internalType: "address", name: "manufacturer", type: "address" },
      { internalType: "uint256", name: "quantity",     type: "uint256" }
    ],
    stateMutability: "view", type: "function"
  },
  // getHistory(uint256) → address[]
  { inputs: [{ internalType: "uint256", name: "id", type: "uint256" }], name: "getHistory", outputs: [{ internalType: "address[]", name: "", type: "address[]" }], stateMutability: "view", type: "function" },
  // getManufacturerProducts(address) → uint256[]
  { inputs: [{ internalType: "address", name: "manufacturer", type: "address" }], name: "getManufacturerProducts", outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }], stateMutability: "view", type: "function" },
  // getAllProductIds() → uint256[]
  { inputs: [], name: "getAllProductIds", outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }], stateMutability: "view", type: "function" },
  // productExistsCheck(uint256) → bool
  { inputs: [{ internalType: "uint256", name: "id", type: "uint256" }], name: "productExistsCheck", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
  // getProductRequests(uint256) → (address[], uint256[], uint8[], uint256[])
  {
    inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }],
    name: "getProductRequests",
    outputs: [
      { internalType: "address[]", name: "retailers",  type: "address[]" },
      { internalType: "uint256[]", name: "timestamps", type: "uint256[]" },
      { internalType: "uint8[]",   name: "statuses",   type: "uint8[]"   },
      { internalType: "uint256[]", name: "quantities", type: "uint256[]" }
    ],
    stateMutability: "view", type: "function"
  },
  // getRetailerRequestStatus(uint256, address) → uint8
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "address", name: "retailer", type: "address" }], name: "getRetailerRequestStatus", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  // getCustomerRequests(uint256) → (address[], uint256[], uint8[], uint256[])
  {
    inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }],
    name: "getCustomerRequests",
    outputs: [
      { internalType: "address[]", name: "customers",  type: "address[]" },
      { internalType: "uint256[]", name: "timestamps", type: "uint256[]" },
      { internalType: "uint8[]",   name: "statuses",   type: "uint8[]"   },
      { internalType: "uint256[]", name: "quantities", type: "uint256[]" }
    ],
    stateMutability: "view", type: "function"
  },
  // getCustomerRequestStatus(uint256, address) → uint8
  { inputs: [{ internalType: "uint256", name: "productId", type: "uint256" }, { internalType: "address", name: "customer", type: "address" }], name: "getCustomerRequestStatus", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  // getRetailerRequests(address) → (uint256[], uint8[])
  {
    inputs: [{ internalType: "address", name: "retailer", type: "address" }],
    name: "getRetailerRequests",
    outputs: [
      { internalType: "uint256[]", name: "productIds", type: "uint256[]" },
      { internalType: "uint8[]",   name: "statuses",   type: "uint8[]"   }
    ],
    stateMutability: "view", type: "function"
  },
  // Events
  { anonymous: false, inputs: [{ indexed: true, internalType: "address", name: "account", type: "address" }, { indexed: false, internalType: "uint8", name: "role", type: "uint8" }], name: "RoleAssigned", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "id", type: "uint256" }, { indexed: false, internalType: "string", name: "name", type: "string" }, { indexed: true, internalType: "address", name: "manufacturer", type: "address" }, { indexed: false, internalType: "uint256", name: "price", type: "uint256" }], name: "ProductCreated", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "productId", type: "uint256" }, { indexed: true, internalType: "address", name: "retailer", type: "address" }], name: "ProductRequested", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "productId", type: "uint256" }, { indexed: true, internalType: "address", name: "retailer", type: "address" }], name: "RequestApproved", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "productId", type: "uint256" }, { indexed: true, internalType: "address", name: "retailer", type: "address" }], name: "RequestRejected", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "productId", type: "uint256" }, { indexed: true, internalType: "address", name: "retailer", type: "address" }, { indexed: false, internalType: "uint256", name: "amount", type: "uint256" }], name: "ProductPurchased", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, internalType: "uint256", name: "id", type: "uint256" }, { indexed: true, internalType: "address", name: "from", type: "address" }, { indexed: true, internalType: "address", name: "to", type: "address" }, { indexed: false, internalType: "uint256", name: "price", type: "uint256" }], name: "ProductTransferred", type: "event" }
];

// ─── Constants ─────────────────────────────────────────
const ROLE         = { None: 0, Manufacturer: 1, Retailer: 2, Customer: 3 };
const ROLE_NAMES   = { 0: "None", 1: "Manufacturer", 2: "Retailer", 3: "Customer" };

const REQ_STATUS   = { Pending: 0, Approved: 1, Rejected: 2, Completed: 3, NotRequested: 255 };
const REQ_LABELS   = { 0: "Pending", 1: "Approved", 2: "Rejected", 3: "Completed", 255: "Not Requested" };
const REQ_COLORS   = {
  0:   { bg: "rgba(245,158,11,.15)",  color: "#f59e0b" },  // Pending   — amber
  1:   { bg: "rgba(34,211,160,.15)",  color: "#22d3a0" },  // Approved  — green
  2:   { bg: "rgba(244,63,94,.15)",   color: "#f43f5e" },  // Rejected  — red
  3:   { bg: "rgba(108,99,255,.15)",  color: "#6c63ff" },  // Completed — purple
  255: { bg: "rgba(255,255,255,.06)", color: "#8b95b0" }   // Not requested
};

// ─── Shared State ──────────────────────────────────────
let provider      = null;
let signer        = null;
let contract      = null;
let walletAddress = null;
let userRole      = 0;

// Read-only fallback (public RPC)
let readOnlyProvider = null;
let readOnlyContract = null;
let readOnlyRpcUrl   = null;

function getReadOnlyProvider() {
  if (readOnlyProvider) return readOnlyProvider;
  const url = READONLY_RPC_URLS.find(Boolean);
  if (!url) return null;
  readOnlyRpcUrl = url;
  readOnlyProvider = new ethers.providers.StaticJsonRpcProvider(url, SEPOLIA_CHAIN_ID);
  return readOnlyProvider;
}

function getReadOnlyContract() {
  if (readOnlyContract) return readOnlyContract;
  const p = getReadOnlyProvider();
  if (!p || !CONTRACT_ADDRESS || CONTRACT_ADDRESS === "YOUR_DEPLOYED_CONTRACT_ADDRESS") return null;
  readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
  return readOnlyContract;
}

function getBestReadContract() {
  // Prefer signer-connected contract, then MetaMask read-only, then public RPC fallback.
  if (contract) return contract;
  if (window.ethereum) {
    try {
      const rp = new ethers.providers.Web3Provider(window.ethereum);
      return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rp);
    } catch (e) {
      console.warn("MetaMask read-only contract init failed:", e);
    }
  }
  return getReadOnlyContract();
}

// ─── Wallet Connection ─────────────────────────────────
async function connectWallet(onConnected) {
  if (!window.ethereum) {
    showToast("MetaMask not detected. Install MetaMask first.", "error"); return;
  }
  try {
    showLoading("Connecting wallet…");
    provider      = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer        = provider.getSigner();
    walletAddress = await signer.getAddress();
	    if (CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "YOUR_DEPLOYED_CONTRACT_ADDRESS") {
	      // Guardrail: if the address has no code on the current chain,
	      // transactions would "succeed" but do nothing (sent to an EOA).
	      const net  = await provider.getNetwork();
	      const code = await provider.getCode(CONTRACT_ADDRESS);
	      if (!code || code === "0x") {
	        contract = null;
	        showToast(
	          `No contract found at ${shortAddress(CONTRACT_ADDRESS, 6)} on ${networkName(net.chainId)}. Update CONTRACT_ADDRESS in shared.js.`,
	          "error"
	        );
	      } else {
	        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
	      }
	    }
    updateSharedWalletUI();
    await updateSharedNetworkBanner();
    if (onConnected) await onConnected();
    showToast("Wallet connected!", "success");
  } catch (err) {
    console.error("connectWallet:", err);
    showToast(friendlyError(err), "error");
  } finally { hideLoading(); }
}

function disconnectWallet(onDisconnected) {
  provider = signer = contract = walletAddress = null;
  userRole = 0;
  document.getElementById("connect-wallet-btn")?.classList.remove("hidden");
  document.getElementById("disconnect-btn")?.classList.add("hidden");
  document.getElementById("wallet-info")?.classList.add("hidden");
  document.getElementById("network-banner")?.classList.add("hidden");
  if (onDisconnected) onDisconnected();
  showToast("Wallet disconnected.", "info");
}

function updateSharedWalletUI() {
  if (!walletAddress) return;
  document.getElementById("connect-wallet-btn")?.classList.add("hidden");
  document.getElementById("disconnect-btn")?.classList.remove("hidden");
  document.getElementById("wallet-info")?.classList.remove("hidden");
  const el = document.getElementById("wallet-address");
  if (el) el.textContent = shortAddress(walletAddress, 6);
}

async function updateSharedNetworkBanner() {
  if (!provider) return;
  try {
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(walletAddress);
    const eth     = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);
    const el = id => document.getElementById(id);
    if (el("network-name"))   el("network-name").textContent   = networkName(network.chainId);
    if (el("wallet-balance")) el("wallet-balance").textContent = `${eth} ETH`;
    if (el("wallet-eth"))     el("wallet-eth").textContent     = eth;
    document.getElementById("network-banner")?.classList.remove("hidden");
  } catch (e) { console.warn("network banner:", e); }
}

// ─── Role Management ───────────────────────────────────
async function getUserRole() {
  if (!contract || !walletAddress) return 0;
  try { return Number(await contract.getRole(walletAddress)); }
  catch (e) { console.error("getRole:", e); return 0; }
}

async function registerRole(roleNum) {
  if (!contract) { showToast("Contract not connected.", "error"); return false; }
  try {
    showLoading(`Registering as ${ROLE_NAMES[roleNum]}…`);
    const tx = await contract.registerRole(roleNum);
    await tx.wait();
    userRole = roleNum;
    showToast(`✅ Registered as ${ROLE_NAMES[roleNum]}!`, "success");
    return true;
  } catch (err) { showToast(friendlyError(err), "error"); return false; }
  finally { hideLoading(); }
}

// ─── Product Queries ────────────────────────────────────
async function getAllProducts() {
  if (!contract) return [];
  let ids = [];
  try { ids = await contract.getAllProductIds(); } catch (e) { console.error("getAllProductIds:", e); return []; }
  return await fetchProductsByIds(ids);
}

async function getProductsOwnedBy(ownerAddr) {
  const all = await getAllProducts();
  return all.filter(p => p.owner.toLowerCase() === ownerAddr.toLowerCase());
}

async function getProductsStillWithManufacturer() {
  const all = await getAllProducts();
  return all.filter(p => p.owner.toLowerCase() === p.manufacturer.toLowerCase());
}

async function getManufacturerProductsFull(mfgAddr) {
  if (!contract) return [];
  let ids = [];
  try { ids = await contract.getManufacturerProducts(mfgAddr); } catch (e) { console.error("getManufacturerProducts:", e); return []; }
  return await fetchProductsByIds(ids);
}

async function fetchProductsByIds(ids) {
  const results = await Promise.all(ids.map(async id => {
    try {
      const r = await contract.getProduct(id);
      return { id: r[0].toString(), name: r[1], owner: r[2], price: parseFloat(ethers.utils.formatEther(r[3])), priceWei: r[3], manufacturer: r[4], quantity: r[5].toNumber(), history: [] };
    } catch (e) { console.warn("getProduct failed:", id.toString(), e.message); return null; }
  }));
  return results.filter(Boolean);
}

async function getProductById(id) {
  if (!contract) return null;
  try {
    const r = await contract.getProduct(id);
    return { id: r[0].toString(), name: r[1], owner: r[2], price: parseFloat(ethers.utils.formatEther(r[3])), priceWei: r[3], manufacturer: r[4], quantity: r[5].toNumber(), history: [] };
  } catch (e) { console.error("getProduct:", e); return null; }
}

async function getProductHistory(id) {
  if (!contract) return [];
  try { return await contract.getHistory(id.toString()); } catch (e) { console.error("getHistory:", e); return []; }
}

// ─── Request Flow ──────────────────────────────────────
/**
 * Retailer requests to purchase a product.
 */
async function requestProductOnChain(productId, quantity, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Sending purchase request to blockchain…");
    const tx = await contract.requestProduct(productId, quantity);
    showLoading("Waiting for confirmation…");
    await tx.wait();
    showToast(`✅ Request sent for Product #${productId}!`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("requestProduct:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Manufacturer approves one retailer's request (auto-rejects others).
 */
async function approveRequestOnChain(productId, retailerAddr, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Approving request on blockchain…");
    const tx = await contract.approveRequest(productId, retailerAddr);
    showLoading("Waiting for confirmation…");
    await tx.wait();
    showToast(`✅ Request approved! Other requests auto-rejected.`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("approveRequest:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Approved retailer pays for the product (sends ETH = product price).
 */
async function payForProductOnChain(productId, priceWei, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Sending payment to blockchain…");
    const tx = await contract.payForProduct(productId, { value: priceWei });
    showLoading("Waiting for confirmation…");
    const receipt = await tx.wait();
    showToast(`✅ Payment successful! Product transferred to your wallet. Block #${receipt.blockNumber}`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("payForProduct:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Cancel a pending or approved retailer request.
 */
async function cancelRequestOnChain(productId, requester, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Calling cancel request on blockchain…");
    const tx = await contract.cancelRequest(productId, requester);
    showLoading("Waiting for confirmation…");
    await tx.wait();
    showToast(`✅ Request cancelled!`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("cancelRequest:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Customer requests to purchase a product from a retailer.
 */
async function requestFromRetailerOnChain(productId, quantity, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Sending request to retailer on blockchain…");
    const tx = await contract.requestFromRetailer(productId, quantity);
    showLoading("Waiting for confirmation…");
    await tx.wait();
    showToast(`✅ Request sent for Product #${productId}!`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("requestFromRetailer:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Retailer approves one customer request (auto-rejects other pending ones).
 */
async function approveCustomerRequestOnChain(productId, customerAddr, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Approving customer request…");
    const tx = await contract.approveCustomerRequest(productId, customerAddr);
    showLoading("Waiting for confirmation…");
    await tx.wait();
    showToast("✅ Customer request approved!", "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("approveCustomerRequest:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Cancel a pending or approved customer request.
 */
async function cancelCustomerRequestOnChain(productId, requester, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Calling cancel customer request on blockchain…");
    const tx = await contract.cancelCustomerRequest(productId, requester);
    showLoading("Waiting for confirmation…");
    await tx.wait();
    showToast(`✅ Customer request cancelled!`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("cancelCustomerRequest:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Approved customer pays the retailer and receives the product.
 */
async function payRetailerForProductOnChain(productId, priceWei, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Sending payment to retailer…");
    const tx = await contract.payRetailerForProduct(productId, { value: priceWei });
    showLoading("Waiting for confirmation…");
    const receipt = await tx.wait();
    showToast(`✅ Payment successful! Product transferred to your wallet. Block #${receipt.blockNumber}`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("payRetailerForProduct:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}

/**
 * Get all requests for a specific product (for manufacturer).
 * Returns: [{ retailer, timestamp, status, quantity, statusLabel, statusColor }]
 */
async function getProductRequestsFull(productId) {
  if (!contract) return [];
  try {
    const [retailers, timestamps, statuses, quantities] = await contract.getProductRequests(productId);
    return retailers.map((r, i) => ({
      retailer:    r,
      timestamp:   Number(timestamps[i]),
      status:      Number(statuses[i]),
      quantity:    quantities ? Number(quantities[i]) : 1, // Fallback for old ABI deploy
      statusLabel: REQ_LABELS[Number(statuses[i])] || "Unknown",
      statusColor: REQ_COLORS[Number(statuses[i])] || REQ_COLORS[255]
    }));
  } catch (e) { console.error("getProductRequests:", e); return []; }
}

/**
 * Get all customer requests for a specific product (for retailer).
 * Returns: [{ customer, timestamp, status, quantity, statusLabel, statusColor }]
 */
async function getCustomerRequestsFull(productId) {
  if (!contract) return [];
  try {
    const [customers, timestamps, statuses, quantities] = await contract.getCustomerRequests(productId);
    return customers.map((c, i) => ({
      customer:    c,
      timestamp:   Number(timestamps[i]),
      status:      Number(statuses[i]),
      quantity:    quantities ? Number(quantities[i]) : 1, // Fallback for old ABI deploy
      statusLabel: REQ_LABELS[Number(statuses[i])] || "Unknown",
      statusColor: REQ_COLORS[Number(statuses[i])] || REQ_COLORS[255]
    }));
  } catch (e) { console.error("getCustomerRequests:", e); return []; }
}

/**
 * Get all requests a retailer has made, with product details.
 * Returns: [{ product, status }]
 */
let warnedRetailerRequestsFallback = false;
async function getRetailerRequestsFull(retailerAddr) {
  if (!contract) return [];
  try {
    const [productIds, statuses] = await contract.getRetailerRequests(retailerAddr);
    const results = await Promise.all(productIds.map(async (pid, i) => {
      const product = await getProductById(pid.toString());
      return product ? { product, status: Number(statuses[i]) } : null;
    }));
    return results.filter(Boolean);
  } catch (e) {
    console.error("getRetailerRequests:", e);

    // If the configured contract address isn't actually a contract on this chain, calls often revert with empty data.
    try {
      const code = await contract.provider.getCode(CONTRACT_ADDRESS);
      if (!code || code === "0x") {
        showToast(`No contract found at ${shortAddress(CONTRACT_ADDRESS, 6)} on the connected network. Update CONTRACT_ADDRESS in shared.js.`, "error");
        return [];
      }
    } catch {}

    // Compatibility fallback: some deployed contract versions may not have `getRetailerRequests(address)`.
    // Reconstruct the retailer's requested products by scanning all products and calling `getRetailerRequestStatus`.
    const isEmptyCallException =
      e?.code === "CALL_EXCEPTION" &&
      (e?.data === "0x" || e?.data == null) &&
      !e?.reason;

    if (!isEmptyCallException) return [];

    if (!warnedRetailerRequestsFallback) {
      warnedRetailerRequestsFallback = true;
      showToast("Contract method getRetailerRequests() is unavailable on this deployment. Using a slower compatibility mode.", "warning");
    }

    let ids = [];
    try {
      ids = await contract.getAllProductIds();
    } catch (e2) {
      console.error("getAllProductIds (fallback for retailer requests):", e2);
      return [];
    }

    const results = await Promise.all(ids.map(async (pid) => {
      const productId = pid?.toString ? pid.toString() : String(pid);
      let status = 255;
      try {
        status = Number(await contract.getRetailerRequestStatus(productId, retailerAddr));
      } catch {
        return null;
      }
      if (status === 255) return null;
      const product = await getProductById(productId);
      return product ? { product, status } : null;
    }));

    return results.filter(Boolean);
  }
}

/**
 * Check if a retailer has already requested a specific product.
 * Returns: 0=Pending, 1=Approved, 2=Rejected, 3=Completed, 255=not requested
 */
async function getMyRequestStatus(productId, retailerAddr) {
  if (!contract) return 255;
  try { return Number(await contract.getRetailerRequestStatus(productId.toString(), retailerAddr)); }
  catch (e) { return 255; }
}

/**
 * Check if a customer has already requested a specific product from a retailer.
 * Returns: 0=Pending, 1=Approved, 2=Rejected, 3=Completed, 255=not requested
 */
async function getMyCustomerRequestStatus(productId, customerAddr) {
  if (!contract) return 255;
  try { return Number(await contract.getCustomerRequestStatus(productId.toString(), customerAddr)); }
  catch (e) { return 255; }
}

// ─── Transfer (Retailer→Customer) ─────────────────────
async function transferProductOnChain(productId, toAddress, onSuccess) {
  if (!contract) { showToast("Contract not connected.", "error"); return; }
  try {
    showLoading("Sending transfer to blockchain…");
    const tx = await contract.transferProduct(productId, toAddress);
    showLoading("Waiting for confirmation…");
    const receipt = await tx.wait();
    showToast(`✅ Product #${productId} transferred! Block #${receipt.blockNumber}`, "success");
    if (onSuccess) await onSuccess();
  } catch (err) { console.error("transferProduct:", err); showToast(friendlyError(err), "error"); }
  finally { hideLoading(); }
}



// ─── Status Badge HTML ─────────────────────────────────
function statusBadge(statusNum) {
  const c = REQ_COLORS[statusNum] || REQ_COLORS[255];
  const l = REQ_LABELS[statusNum] || "Unknown";
  return `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .6rem;border-radius:6px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;background:${c.bg};color:${c.color}">${l}</span>`;
}

// ─── History Renderer ──────────────────────────────────
function renderHistoryHTML(history) {
  if (!history || history.length === 0) return `<p style="color:var(--text-muted);padding:1rem 0;">No ownership history found.</p>`;
  return `<div class="history-timeline">${history.map((addr, idx) => {
    const label = idx === 0 ? "🏭 Manufacturer (Origin)" : idx === history.length - 1 ? "👤 Current Owner" : `🔄 Transfer Step ${idx + 1}`;
    return `<div class="history-item"><div class="history-dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg></div><div class="history-body"><div class="history-step">${label}</div><div class="history-addr">${addr}</div><div class="history-meta">Step ${idx + 1} of ${history.length}</div></div></div>`;
  }).join("")}</div>`;
}

async function openHistoryModal(productId, productName) {
  const content = document.getElementById("history-content");
  if(!content) return;
  document.getElementById("history-modal-title").textContent = "Ownership History";
  document.getElementById("history-product-name").textContent = `Product #${productId} — ${productName}`;
  content.innerHTML = `<div class="history-loading"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;margin-right:8px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg> Loading history…</div>`;
  document.getElementById("history-modal").classList.remove("hidden");

  try {
    if (!contract) throw new Error("Contract not connected.");
    const history = await contract.getHistory(productId);
    content.innerHTML = renderHistoryHTML(history);
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p style="color:var(--accent-danger);padding:1rem;">Failed to load history: ${friendlyError(err)}</p>`;
  }
}

function closeHistoryModal() {
  const modal = document.getElementById("history-modal");
  if(modal) modal.classList.add("hidden");
}


// ─── Toast ─────────────────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container"); if (!container) return;
  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || icons.info}<span class="toast-msg">${message}</span><div class="toast-progress"></div>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add("toast-out"); el.addEventListener("animationend", () => el.remove(), { once: true }); }, 4200);
}

// ─── Loading ────────────────────────────────────────────
function showLoading(text = "Processing…") {
  const o = document.getElementById("loading-overlay"); const t = document.getElementById("loading-text");
  if (o) o.classList.remove("hidden"); if (t) t.textContent = text;
}
function hideLoading() { document.getElementById("loading-overlay")?.classList.add("hidden"); }

// ─── Utils ──────────────────────────────────────────────
function shortAddress(addr, chars = 6) { if (!addr || addr.length < 12) return addr || "—"; return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`; }
function networkName(chainId) { const m = { 1: "Ethereum Mainnet", 11155111: "Sepolia Testnet", 5: "Goerli", 137: "Polygon", 80001: "Mumbai", 31337: "Hardhat Local", 1337: "Ganache" }; return m[chainId] || `Chain ${chainId}`; }
function friendlyError(err) {
  if (!err) return "Unknown error";
  if (err.code === 4001 || err.message?.includes("user rejected")) return "Transaction rejected by user.";
  if (err.code === "INSUFFICIENT_FUNDS") return "Insufficient ETH balance.";
  if (err.message?.includes("Unauthorized role")) return "Your wallet is not registered for this role.";
  if (err.message?.includes("already sold")) return "Product has already been sold.";
  if (err.message?.includes("Already requested")) return "You already submitted a request for this product.";
  if (err.message?.includes("No approved request")) return "Your request has not been approved yet.";
  if (err.message?.includes("Incorrect payment")) return "Payment amount does not match product price.";
  if (err.message?.includes("already exists")) return "Product ID already exists.";
  return err.reason || err.message?.slice(0, 120) || "Transaction failed.";
}
function escapeHtml(str) { if (typeof str !== "string") return str ?? ""; return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

// ─── MetaMask listeners ─────────────────────────────────
if (window.ethereum) {
  window.ethereum.on("accountsChanged", accs => { if (accs.length === 0) disconnectWallet(() => {}); else window.location.reload(); });
  window.ethereum.on("chainChanged", () => window.location.reload());
}
