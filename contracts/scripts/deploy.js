const hre = require("hardhat");

async function main() {
  console.log("Deploying ScoreBoard contract...");

  const ScoreBoard = await hre.ethers.getContractFactory("ScoreBoard");
  const scoreBoard = await ScoreBoard.deploy();

  await scoreBoard.waitForDeployment();

  const address = await scoreBoard.getAddress();
  console.log(`ScoreBoard deployed to: ${address}`);

  // Wait for a few blocks before verifying
  console.log("Waiting for block confirmations...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

  // Verify on Basescan (if API key is set)
  if (process.env.BASESCAN_API_KEY) {
    console.log("Verifying contract on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
      });
      console.log("Contract verified successfully!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
