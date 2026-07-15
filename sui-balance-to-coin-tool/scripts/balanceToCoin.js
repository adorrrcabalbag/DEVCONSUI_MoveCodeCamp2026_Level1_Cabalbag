// balanceToCoin.js
//
// Converts SUI sitting in your Sui "address balance" (the new post-v1.72
// balance model) into a real, spendable Coin<SUI> object — so `sui client
// publish` / `sui client call` can find a gas coin again.
//
// It reads your existing key from the same keystore file the `sui` CLI
// already uses (created back in "sui client addresses"), so you don't need
// to paste your private key anywhere.
//
// Usage:
//   npm install
//   npm run balance:to-coin:minimal -- <amount_in_mist>
//
// Example (converts 0.02 SUI = 20,000,000 MIST):
//   npm run balance:to-coin:minimal -- 20000000
//
// Optional env vars:
//   SUI_KEYSTORE_PATH  - override the default keystore location
//   SUI_ADDRESS        - which address to use, if your keystore has more than one
//   SUI_NETWORK        - "mainnet" (default), "testnet", or "devnet"

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const amountArg = process.argv[2];
const AMOUNT_MIST = amountArg ? BigInt(amountArg) : 0n;

if (!AMOUNT_MIST || AMOUNT_MIST <= 0n) {
  console.error('Usage: npm run balance:to-coin:minimal -- <amount_in_mist>');
  console.error('Example: npm run balance:to-coin:minimal -- 20000000   (= 0.02 SUI)');
  process.exit(1);
}

const KEYSTORE_PATH =
  process.env.SUI_KEYSTORE_PATH ||
  path.join(os.homedir(), '.sui', 'sui_config', 'sui.keystore');

const TARGET_ADDRESS = process.env.SUI_ADDRESS; // optional
const NETWORK = process.env.SUI_NETWORK || 'mainnet';

// SuiGrpcClient needs an explicit baseUrl — the gRPC service runs on the
// same fullnode hosts as the old JSON-RPC API, just accessed differently.
const GRPC_BASE_URLS = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
  localnet: 'http://127.0.0.1:9000',
};

// Sui keystore entries are base64(flag_byte + private_key_bytes).
// flag 0x00 = ed25519 (the default scheme this workshop's `sui client
// addresses` step uses when you pick "0" at the key-scheme prompt).
function loadEd25519Keypairs(keystorePath) {
  if (!fs.existsSync(keystorePath)) {
    throw new Error(`Keystore not found at ${keystorePath}. Set SUI_KEYSTORE_PATH if it's elsewhere.`);
  }
  const raw = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
  const keypairs = [];
  for (const entry of raw) {
    const bytes = Buffer.from(entry, 'base64');
    const flag = bytes[0];
    const secret = bytes.subarray(1);
    if (flag === 0x00) {
      try {
        keypairs.push(Ed25519Keypair.fromSecretKey(secret));
      } catch {
        // skip malformed entry
      }
    }
    // secp256k1 / secp256r1 keys (flags 0x01 / 0x02) are skipped — this tool
    // assumes the default ed25519 wallet from the workshop setup step.
  }
  return keypairs;
}

async function main() {
  const keypairs = loadEd25519Keypairs(KEYSTORE_PATH);
  if (keypairs.length === 0) {
    console.error(`No usable ed25519 keys found in ${KEYSTORE_PATH}`);
    process.exit(1);
  }

  let keypair = keypairs[0];
  if (TARGET_ADDRESS) {
    const match = keypairs.find(
      (kp) => kp.getPublicKey().toSuiAddress().toLowerCase() === TARGET_ADDRESS.toLowerCase(),
    );
    if (!match) {
      console.error(`No key in ${KEYSTORE_PATH} matches SUI_ADDRESS=${TARGET_ADDRESS}`);
      process.exit(1);
    }
    keypair = match;
  }

  const address = keypair.getPublicKey().toSuiAddress();
  console.log(`Using address: ${address}`);
  console.log(`Network: ${NETWORK}`);
  console.log(`Converting ${AMOUNT_MIST} MIST from address balance into a Coin<SUI> object...`);

  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC_BASE_URLS[NETWORK] });

  const tx = new Transaction();
  tx.setSender(address);

  // Withdraw from the address balance and redeem it into a real Coin<SUI>.
  const [coin] = tx.moveCall({
    target: '0x2::coin::redeem_funds',
    typeArguments: ['0x2::sui::SUI'],
    arguments: [tx.withdrawal({ amount: AMOUNT_MIST, type: '0x2::sui::SUI' })],
  });

  // Send the resulting coin object right back to yourself.
  tx.transferObjects([coin], address);

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showObjectChanges: true },
  });

  const status = result.effects?.status?.status;
  console.log('Status:', status);
  console.log('Digest:', result.digest);

  if (status !== 'success') {
    console.error('Transaction did not succeed — check the digest above on a Sui explorer for details.');
    process.exit(1);
  }

  const createdCoin = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('0x2::coin::Coin'),
  );

  if (createdCoin) {
    console.log('New coin object created:', createdCoin.objectId);
  } else {
    console.log('Done. Run `sui client gas` to confirm the new coin object shows up.');
  }
}

main().catch((err) => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
