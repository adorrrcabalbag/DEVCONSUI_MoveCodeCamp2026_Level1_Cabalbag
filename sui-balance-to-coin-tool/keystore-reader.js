import fs from 'fs';
import os from 'os';
import path from 'path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

async function main() {
    // 1. Determine Keystore Path
    // os.homedir() automatically handles C:\Users\\ on Windows and ~/ on Mac/Linux
    const defaultKeystorePath = path.join(os.homedir(), '.sui', 'sui_config', 'sui.keystore');
    const keystorePath = process.env.SUI_KEYSTORE_PATH || defaultKeystorePath;

    if (!fs.existsSync(keystorePath)) {
        throw new Error(`Keystore not found at ${keystorePath}`);
    }

    // 2. Load Keystore Data
    const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));

    // 3. Find the Target Keypair
    let activeKeypair = null;
    const targetAddress = process.env.SUI_ADDRESS?.toLowerCase();

    for (const keyBase64 of keystore) {
        const rawBytes = Buffer.from(keyBase64, 'base64');
        
        // The first byte determines the signature scheme (0x00 is Ed25519)
        const schemeFlag = rawBytes[0];
        if (schemeFlag !== 0) continue; // Skip secp256k1/secp256r1 keys
        
        // The remaining 32 bytes are the raw secret key
        const secretKey = rawBytes.slice(1);
        const keypair = Ed25519Keypair.fromSecretKey(secretKey);
        const address = `0x${keypair.toSuiAddress()}`;
        
        if (targetAddress) {
            if (address === targetAddress) {
                activeKeypair = keypair;
                break;
            }
        } else {
            // If SUI_ADDRESS isn't set, default to the first ed25519 key found
            activeKeypair = keypair;
            break;
        }
    }

    if (!activeKeypair) {
        throw new Error("No matching Ed25519 key found in keystore.");
    }

    // 4. Setup the Network Client
    const network = process.env.SUI_NETWORK || 'mainnet';
    const client = new SuiClient({ url: getFullnodeUrl(network) });

    console.log(`✅ Loaded address: 0x${activeKeypair.toSuiAddress()}`);
    console.log(`🌍 Connected to: ${network}`);
    
    // The private key is now loaded securely into memory as `activeKeypair`.
    // You can now use it to sign transactions, and it is never saved anywhere else!
}

main().catch(console.error);