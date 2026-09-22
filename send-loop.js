require("dotenv").config();
const { ethers } = require("ethers");

const {
  RPC_URL,
  PRIVATE_KEY,
  TO_ADDRESS,
  AMOUNT_ETH = "0.000001",
  INTERVAL_MS = "1000",
  MAX_RUNTIME_MIN = "0", // 0 = run forever (only sensible for a local/VPS run)
} = process.env;

if (!RPC_URL || !PRIVATE_KEY || !TO_ADDRESS) {
  console.error("Missing RPC_URL, PRIVATE_KEY, or TO_ADDRESS in .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const amountWei = ethers.parseEther(AMOUNT_ETH);
const intervalMs = Number(INTERVAL_MS);

let nonce;
let sending = false;
let stopped = false;

async function init() {
  nonce = await provider.getTransactionCount(wallet.address, "pending");
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Starting nonce: ${nonce}`);
  console.log(`Sending ${AMOUNT_ETH} ETH to ${TO_ADDRESS} every ${intervalMs}ms`);
}

async function sendOne() {
  if (sending || stopped) return; // skip tick if previous send still in flight
  sending = true;
  const myNonce = nonce;
  try {
    const feeData = await provider.getFeeData();
    const tx = await wallet.sendTransaction({
      to: TO_ADDRESS,
      value: amountWei,
      nonce: myNonce,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });
    nonce++;
    console.log(`[nonce ${myNonce}] sent: ${tx.hash}`);
  } catch (err) {
    console.error(`[nonce ${myNonce}] failed: ${err.shortMessage || err.message}`);
    // Resync nonce from chain in case it drifted (e.g. a tx was dropped/replaced)
    try {
      nonce = await provider.getTransactionCount(wallet.address, "pending");
    } catch (_) {}
  } finally {
    sending = false;
  }
}

function shutdown(timer, reason) {
  stopped = true;
  clearInterval(timer);
  console.log(`\nStopped (${reason}).`);
  process.exit(0);
}

async function main() {
  await init();
  const timer = setInterval(sendOne, intervalMs);

  process.on("SIGINT", () => shutdown(timer, "SIGINT"));
  process.on("SIGTERM", () => shutdown(timer, "SIGTERM"));

  const maxMin = Number(MAX_RUNTIME_MIN);
  if (maxMin > 0) {
    console.log(`Will self-stop after ${maxMin} minutes`);
    setTimeout(() => shutdown(timer, "max runtime reached"), maxMin * 60 * 1000);
  }
}

main();
