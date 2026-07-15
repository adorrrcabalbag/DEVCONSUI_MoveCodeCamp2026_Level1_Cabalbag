# Sui Balance-to-Coin Tool

Converts SUI sitting in your Sui **address balance** (introduced by the May 2026
v1.72 upgrade) into a real, spendable `Coin<SUI>` object — fixing the
"Cannot find gas coin for signer address..." error.

## Why this exists

Since v1.72, SUI can sit in two places: classic coin objects, or the newer
"address balance." Wallets like Slush increasingly send funds via the
address-balance path. `sui client balance` shows both combined, but
`sui client publish` / `sui client call` need an actual coin object to pay
gas with — so the balance looks fine while gas payment still fails.

## Setup

1. Copy this whole folder (`sui-balance-to-coin-tool/`) anywhere on your
   machine, or drop it into your project alongside `portfolio_contract` /
   `portfolio_frontend`.
2. Open a terminal in this folder and run:
   ```
   npm install
   ```
3. Make sure you've already run `sui client addresses` at some point (from
   the workshop setup) — this tool reads the same keystore file that command
   created, so there's nothing extra to configure for your key.

## Usage

```
npm run balance:to-coin:minimal -- <amount_in_mist>
```

Example — convert 0.02 SUI (20,000,000 MIST):
```
npm run balance:to-coin:minimal -- 20000000
```

Then confirm it worked:
```
sui client gas
```
You should now see a coin object listed.

## Notes / assumptions

- Assumes the default **ed25519** key scheme (option `0` when `sui client
  addresses` first asked for a key scheme) — the same default this workshop
  uses. Secp256k1/secp256r1 keys are skipped.
- Defaults to reading the keystore from `~/.sui/sui_config/sui.keystore`
  (Windows: `C:\Users\<you>\.sui\sui_config\sui.keystore`). Override with the
  `SUI_KEYSTORE_PATH` environment variable if yours lives elsewhere.
- If your keystore has more than one address, set `SUI_ADDRESS=0xyouraddress`
  before running so it picks the right key.
- Defaults to mainnet. Set `SUI_NETWORK=testnet` (or `devnet`) if needed.
- This never asks for or stores your private key anywhere new — it only
  reads the keystore file the `sui` CLI itself already created.
