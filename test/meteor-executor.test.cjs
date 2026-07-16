const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

class MockTransportError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function loadMeteorWallet(adapter) {
  const filename = path.join(__dirname, "../near-wallets/src/meteor.ts");
  const source = await readFile(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;

  let readyWallet;
  const selector = {
    location: "https://example.test/",
    providers: { mainnet: [], testnet: [] },
    storage: {
      get: async () => null,
      set: async () => {},
      remove: async () => {},
    },
    open: () => null,
    ui: { whenApprove: async () => {} },
    ready: (wallet) => {
      readyWallet = wallet;
    },
  };
  const context = vm.createContext({
    console,
    exports: {},
    module: { exports: {} },
    require: (specifier) => {
      if (specifier === "@fastnear/wallet-adapter") {
        return {
          createMeteorAdapter: () => adapter,
          TransportError: MockTransportError,
        };
      }
      throw new Error(`Unexpected import: ${specifier}`);
    },
    window: { selector },
  });
  context.exports = context.module.exports;

  vm.runInContext(compiled, context, { filename });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(readyWallet, "Meteor executor did not register its wallet");
  return { wallet: readyWallet, selector };
}

test("Meteor executor forwards delegated actions and TTL unchanged", async () => {
  let received;
  const response = {
    signedDelegateActions: [{ borshSerializedBase64: "AA==" }],
  };
  const adapter = {
    signDelegateActions: async (params) => {
      received = params;
      return response;
    },
  };
  const { wallet } = await loadMeteorWallet(adapter);
  const params = {
    network: "testnet",
    signerId: "mike.testnet",
    delegateActions: [
      {
        receiverId: "wrap.testnet",
        actions: [{ type: "Transfer", params: { deposit: "1" } }],
        blockHeightTtl: 300,
      },
    ],
  };

  const result = await wallet.signDelegateActions(params);

  assert.strictEqual(received, params);
  assert.strictEqual(result, response);
  assert.equal(received.delegateActions[0].blockHeightTtl, 300);
});

test("Meteor executor fails clearly with an incompatible adapter", async () => {
  const { wallet } = await loadMeteorWallet({});

  await assert.rejects(wallet.signDelegateActions({ network: "testnet", delegateActions: [] }), /@fastnear\/wallet-adapter 1\.4\.0 or newer/);
});
