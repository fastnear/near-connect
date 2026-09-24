const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");

// Byte-level regression test for the executors' transaction serialization.
// mnw.ts, wallet-connect.ts and nightly/helper.ts all do
//   serialize(SCHEMA.Transaction, mapTransaction({ ..., actions: connectorActionsToFastnearActions(actions) }))
// with `serialize` from @fastnear/borsh and SCHEMA/mapTransaction from @fastnear/utils, resolved from
// near-wallets/node_modules (the executor project's own dependencies).
//
// EXPECTED bytes were generated once with @near-js/transactions 2.5.1 (generator script in the PR
// description) and are hardcoded so this test has no near-api-js runtime dependency.

const WALLETS_DIR = path.join(__dirname, "../near-wallets");

// Import the ESM build on purpose: it is what Vite bundles into the executors, and the CJS build of
// @fastnear/utils 0.9.x does not load under Node (its index.cjs requires "./crypto.js", which is crypto.cjs).
function walletDepEsmEntry(name) {
  const dir = path.join(WALLETS_DIR, "node_modules", name);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    throw new Error(`${name} is not installed in near-wallets/node_modules; run \`cd near-wallets && yarn install\``);
  }
  const entry = manifest.exports?.["."]?.import ?? manifest.module ?? manifest.main;
  return pathToFileURL(path.join(dir, entry)).href;
}

function loadConnectorActionConverter() {
  const filename = path.join(WALLETS_DIR, "src/utils/action.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const context = vm.createContext({
    exports: {},
    module: { exports: {} },
    btoa, // action.ts inlines a base64 encoder over the btoa global (DeployContract branch)
    require: (specifier) => {
      throw new Error(`near-wallets/src/utils/action.ts must stay import-free; unexpected import: ${specifier}`);
    },
  });
  context.exports = context.module.exports;
  vm.runInContext(compiled, context, { filename });
  return context.module.exports.connectorActionsToFastnearActions;
}

let depsPromise;
const loadDeps = () =>
  (depsPromise ??= (async () => {
    const [utils, borsh] = await Promise.all([
      import(walletDepEsmEntry("@fastnear/utils")),
      import(walletDepEsmEntry("@fastnear/borsh")),
    ]);
    return { utils, serialize: borsh.serialize, toFastnearActions: loadConnectorActionConverter() };
  })());

// ── Fixtures (deterministic byte patterns; base58 forms pinned below) ─────────────────────────────
const SIGNER_PK_BYTES = Uint8Array.from({ length: 32 }, (_, i) => i); // 00..1f
const NEW_KEY_BYTES = Uint8Array.from({ length: 32 }, (_, i) => 0x20 + i); // 20..3f
const BLOCK_HASH_BYTES = Uint8Array.from({ length: 32 }, (_, i) => 0x40 + i); // 40..5f
const SIGNATURE_BYTES = Uint8Array.from({ length: 64 }, (_, i) => 0x60 + i); // 60..9f
const SIGNER_PK = "ed25519:1thX6LZfHDZZKUs92febYZhYRcXddmzfzF2NvTkPNE";
const NEW_KEY = "ed25519:3ARMH9zfVCnU2TKiphU4xcEyWdA45fc1sjKEtYMdf3gr";
const BLOCK_HASH = "5KporntzQkHiVMKxnFuUGcwPKhtVdhaFkneEkhnoZi1U";
const SIGNER_ID = "alice.near";
const NONCE = 42;

const hex = (bytes) => Buffer.from(bytes).toString("hex");

const CASES = [
  { name: "transfer", receiverId: "bob.near", actions: [{ type: "Transfer", params: { deposit: "1000000000000000000000000" } }] },
  {
    name: "function-call",
    receiverId: "bob.near",
    actions: [{ type: "FunctionCall", params: { methodName: "set_greeting", args: { greeting: "hello" }, gas: "30000000000000", deposit: "1250000000000000000000" } }],
  },
  { name: "add-key-full-access", receiverId: SIGNER_ID, actions: [{ type: "AddKey", params: { publicKey: NEW_KEY, accessKey: { permission: "FullAccess" } } }] },
  {
    name: "add-key-function-call-with-allowance",
    receiverId: SIGNER_ID,
    actions: [{ type: "AddKey", params: { publicKey: NEW_KEY, accessKey: { permission: { receiverId: "app.near", methodNames: ["foo", "bar"], allowance: "250000000000000000000000" } } } }],
  },
  {
    name: "add-key-function-call-no-allowance",
    receiverId: SIGNER_ID,
    actions: [{ type: "AddKey", params: { publicKey: NEW_KEY, accessKey: { permission: { receiverId: "app.near" } } } }],
  },
  { name: "delete-key", receiverId: SIGNER_ID, actions: [{ type: "DeleteKey", params: { publicKey: NEW_KEY } }] },
  {
    name: "create-account-and-transfer",
    receiverId: "sub.alice.near",
    actions: [{ type: "CreateAccount" }, { type: "Transfer", params: { deposit: "100000000000000000000000" } }],
  },
  { name: "delete-account", receiverId: SIGNER_ID, actions: [{ type: "DeleteAccount", params: { beneficiaryId: "bob.near" } }] },
];

// Generated with @near-js/transactions 2.5.1 — see PR description. Do not regenerate with @fastnear/*.
const EXPECTED = {
  "transfer":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a0000000000000008000000626f622e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f0100000003000000a1edccce1bc2d3000000000000",
  "function-call":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a0000000000000008000000626f622e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f01000000020c0000007365745f6772656574696e67140000007b226772656574696e67223a2268656c6c6f227d00e057eb481b00000000485637193cc34300000000000000",
  "add-key-full-access":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a000000000000000a000000616c6963652e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f010000000500202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f000000000000000001",
  "add-key-function-call-with-allowance":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a000000000000000a000000616c6963652e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f010000000500202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f00000000000000000001000040683bb3f386f034000000000000080000006170702e6e6561720200000003000000666f6f03000000626172",
  "add-key-function-call-no-allowance":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a000000000000000a000000616c6963652e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f010000000500202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f00000000000000000000080000006170702e6e65617200000000",
  "delete-key":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a000000000000000a000000616c6963652e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f010000000600202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f",
  "create-account-and-transfer":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a000000000000000e0000007375622e616c6963652e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f020000000003000080f64ae1c7022d15000000000000",
  "delete-account":
    "0a000000616c6963652e6e65617200000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2a000000000000000a000000616c6963652e6e656172404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f010000000708000000626f622e6e656172",
};
// SignedTransaction = Transaction bytes ‖ 0x00 (ed25519Signature variant) ‖ 64 signature bytes
EXPECTED["signed-transfer"] = EXPECTED["transfer"] + "00" + hex(SIGNATURE_BYTES);

const plainTx = (receiverId, actions, nonce = NONCE) => ({ signerId: SIGNER_ID, publicKey: SIGNER_PK, nonce, receiverId, blockHash: BLOCK_HASH, actions });

test("fixtures decode to the documented byte patterns", async () => {
  const { utils } = await loadDeps();
  assert.equal(hex(utils.keyFromString(SIGNER_PK)), hex(SIGNER_PK_BYTES));
  assert.equal(hex(utils.keyFromString(NEW_KEY)), hex(NEW_KEY_BYTES));
  assert.equal(hex(utils.fromBase58(BLOCK_HASH)), hex(BLOCK_HASH_BYTES));
});

for (const { name, receiverId, actions } of CASES) {
  test(`executor transaction bytes: ${name}`, async () => {
    const { utils, serialize, toFastnearActions } = await loadDeps();
    const tx = plainTx(receiverId, toFastnearActions(actions));
    const bytes = serialize(utils.SCHEMA.Transaction, utils.mapTransaction(tx));
    assert.equal(hex(bytes), EXPECTED[name]);
  });
}

test("bigint nonce (mnw.ts path) serializes identically to a number nonce", async () => {
  const { utils, serialize, toFastnearActions } = await loadDeps();
  const { receiverId, actions } = CASES[0];
  const bytes = serialize(utils.SCHEMA.Transaction, utils.mapTransaction(plainTx(receiverId, toFastnearActions(actions), 42n)));
  assert.equal(hex(bytes), EXPECTED["transfer"]);
});

test("signed transaction wrapper as built by mnw.ts", async () => {
  const { utils, serialize, toFastnearActions } = await loadDeps();
  const { receiverId, actions } = CASES[0];
  const mappedTx = utils.mapTransaction(plainTx(receiverId, toFastnearActions(actions)));
  const bytes = serialize(utils.SCHEMA.SignedTransaction, { transaction: mappedTx, signature: { ed25519Signature: { data: SIGNATURE_BYTES } } });
  assert.equal(hex(bytes), EXPECTED["signed-transfer"]);
});
