require("@nomicfoundation/hardhat-toolbox");

// ⚠ Never commit your private key to git.
// Replace the values below before deploying to a real network.
const SEPOLIA_RPC_URL   = "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID";
const PRIVATE_KEY       = "YOUR_WALLET_PRIVATE_KEY"; // MetaMask → Account → Export Private Key

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 1 }
    }
  },
  networks: {
    // ── Local Hardhat node (default) ──────────────────────
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    // ── Sepolia testnet ───────────────────────────────────
    sepolia: {
      url:      SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId:  11155111
    }
  }
};
