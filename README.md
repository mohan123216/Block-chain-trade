# Block-chain-trade (Blockchain Trade System)

An **Ethereum smart-contract based** trade/supply-chain demo dApp.

It supports a simple flow across 3 roles:

- **Manufacturer**: creates products, approves retailer requests
- **Retailer**: requests products from manufacturers, pays, manages inventory, approves customer requests
- **Customer**: requests and pays for products from a retailer

Smart contract: `contracts/TradeSupplyChain.sol`

## Tech Stack

- **Solidity**: `contracts/TradeSupplyChain.sol`
- **Remix IDE** (for compile + deploy)
- **MetaMask** wallet (to sign transactions)
- **Frontend**: static HTML/CSS/JavaScript + **ethers.js** (connects to the deployed contract)

### Database / Backend
- **No MongoDB and no backend server** are used.
- All data (products, roles, requests, ownership history) is stored **on-chain**.

---

## How to Deploy (Remix + MetaMask)

### 1) Open the contract in Remix
1. Open Remix IDE (online).
2. Create/open `TradeSupplyChain.sol`.
3. Copy/paste from `contracts/TradeSupplyChain.sol` in this repository.

### 2) Compile
- Remix → **Solidity Compiler**
- Select Solidity `0.8.x`
- Click **Compile TradeSupplyChain.sol**

### 3) Deploy
Remix → **Deploy & Run Transactions**

Choose one:

#### Option A: Remix VM
- Environment: **Remix VM**
- Best for quick testing (no real ETH).

#### Option B: Injected Provider (MetaMask)
- Environment: **Injected Provider - MetaMask**
- Use **Sepolia** (or another testnet) in MetaMask
- Click **Deploy** and confirm in MetaMask

Copy the deployed **contract address**.

---

## Configure the Frontend

Update:
- `shared.js` → `const CONTRACT_ADDRESS = "PASTE_DEPLOYED_ADDRESS_HERE";`

Open (examples):
- `index.html`
- `manufacturer.html`
- `retailer.html`
- `customer.html`

Tip (if browser blocks local file access):
```bash
npx http-server .
```

---

## Roles (Important)

Users must register a role before using features:
- Manufacturer
- Retailer
- Customer

(Role registration is via `registerRole`.)

---

## License
MIT
