// scripts/deploy.js
// Run with: npx hardhat run scripts/deploy.js --network <network>

const { ethers } = require("hardhat");

async function main() {
  console.log("=================================================");
  console.log("  Deploying TradeSupplyChain Contract...");
  console.log("=================================================");

  const [deployer] = await ethers.getSigners();
  const balance    = await deployer.getBalance();

  console.log(`\n📍 Deployer address : ${deployer.address}`);
  console.log(`💰 Deployer balance : ${ethers.utils.formatEther(balance)} ETH\n`);

  // Deploy
  const TradeSupplyChain = await ethers.getContractFactory("TradeSupplyChain");
  const contract         = await TradeSupplyChain.deploy();

  await contract.deployed();

  console.log("✅ Contract deployed!");
  console.log(`📄 Contract address : ${contract.address}`);
  console.log(`🔗 Transaction hash : ${contract.deployTransaction.hash}\n`);

  console.log("=================================================");
  console.log("  NEXT STEP:");
  console.log(`  Copy this address into shared.js (CONTRACT_ADDRESS):`);
  console.log(`  const CONTRACT_ADDRESS = "${contract.address}";`);
  console.log("=================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
