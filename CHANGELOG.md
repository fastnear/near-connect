# 0.12.0

- **Per-network storage namespacing.** Wallet executors now read and write
  storage at `<walletId>:<network>:<key>` instead of `<walletId>:<key>`, and
  `selected-wallet` is stored as `selected-wallet:<network>`. This unblocks
  parallel mainnet+testnet sessions on the same page — signing in on one
  network no longer overwrites the other network's session state.
- **Backwards-compatible migration.** On first construction of a
  `NearConnector` and each `SandboxExecutor`, any pre-existing legacy keys
  (no network segment) are moved to the `mainnet` slot and the legacy keys
  are removed. Existing users keep their session.
- `clearStorage(network?)` now scopes deletion to a single network instead
  of clearing everything for the wallet. `signOut({ network })` passes the
  argument through, so signing out of testnet leaves a mainnet session
  untouched.
- **MyNearWallet manifest entry now lists `testnet` as a supported feature**
  and includes `https://testnet.mynearwallet.com` in `allowsOpen`. MNW now
  appears in the testnet wallet picker and the testnet redirect succeeds
  through the parent-window allowlist.
- **MNW signOut now revokes the on-chain function-call key.** When a
  function-call key is present, `signOut` first broadcasts a `DeleteKey`
  transaction via the wallet popup, then clears local state. If the popup
  is cancelled, local state still clears (orphan-key risk over a stuck UI).
- **Local FCK signing in MNW is more resilient.** `signUsingKeyPair` now
  retries `view_access_key` on both *thrown* not-found errors and *resolved*
  responses missing a usable nonce (covers the AddKey-not-yet-visible race
  after sign-in redirect, plus adapter quirks that return error envelopes
  as values). A clearer `console.error` in `signAndSendTransaction`'s catch
  makes any future fallback to the wallet popup easy to diagnose.
- **Shared `requireAccessKeyNonce` guard** in `near-wallets/src/utils/accessKey.ts`
  is now used by `mnw.ts`, `nightly/helper.ts`, and `wallet-connect.ts` so
  every site that builds a transaction nonce from a `view_access_key`
  response fails cleanly on a malformed RPC reply instead of silently
  producing `NaN` / `BigInt(undefined)` errors.
- Type-check fixes in `near-wallets/`: explicit return type on
  WalletConnect's `requestAccounts`, type assertion on
  `near_signTransactions` results, and `vite.config.ts` plugins typed as
  `PluginOption[]`.

# 0.10.0

- Add **signInAndSignMessage** method
- Fix footer branding bugs
- Remove default HOT Branding
- Make icon in branding optional

# 0.9.0

- Add connect.use(WalletPlugin): **Experimental** feature to override wallet methods
- Add footerBranding property to disable or override footer UI
- Add signDelegateAction

# 0.8.2

- Fix css styles

# 0.8.0

- Remove WalletConnect as optional dep
- Change types for UseGlobalContractAction and DeployGlobalContractAction

# 0.7.0

- Add UseGlobalContractAction, DeployGlobalContractAction
- Support Actions from @near-js

# 0.6.11

- Add `signIn` to setup limited access key (deprecated flow)

# 0.6.10

- Fix SSR issues
- Fix random class name

# 0.6.9

- Fix SSR issues
- Move styles to isolated className

# 0.6.8

- Add fallback for manifest
- Remove contractId and methods from signIn method

# 0.6.7

- Move all intents specific code and multichain connector to @hot-labs/wibe3
- remove connectWithKey option
- add excludeWallets, providers and isBannedNearAddress options
- some cache improvements

# 0.6.4

- Add Intents class and more exports

# 0.6.3

- Add autoConnect option for NearConnector (usable for ParentFrameWallets)

# 0.6.2

- Improve html templater, fix ui bugs

# 0.6.1

- Fix MultichainPopup ui bug

# 0.6.0

- add html templater and improve Popup lifecycle render flow
- add debug manifests
- improve styles

# 0.5.7

- fix returns types for `signAndSendTransactions` in `InjectedWallet`

# 0.5.6

- Add `HotConnector.disconnect(type, { silent: true })`
- Change `signIntentsWithAuth` for NearWallet, use accountId as signerId for intents
