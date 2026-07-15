const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const { InjectedWallet, ParentFrameWallet, SandboxWallet } = require("../build");
const { prepareDelegateActionsForTransport, validateBlockHeightTtl } = require("../build/helpers/delegateActions");

const transfer = {
  receiverId: "wrap.testnet",
  actions: [{ type: "Transfer", params: { deposit: "1" } }],
  blockHeightTtl: 300,
};

test("validates delegate TTLs as positive safe integers", () => {
  assert.doesNotThrow(() => validateBlockHeightTtl(1));
  assert.doesNotThrow(() => validateBlockHeightTtl(Number.MAX_SAFE_INTEGER));

  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateBlockHeightTtl(invalid), /blockHeightTtl must be a positive safe integer/);
  }
});

test("preserves TTL while preparing delegate actions", () => {
  const prepared = prepareDelegateActionsForTransport([transfer]);

  assert.notStrictEqual(prepared[0], transfer);
  assert.equal(prepared[0].blockHeightTtl, 300);
  assert.deepEqual(prepared[0].actions, transfer.actions);
});

test("allows legacy delegate requests without a TTL", () => {
  const { blockHeightTtl: _ignored, ...legacy } = transfer;
  const prepared = prepareDelegateActionsForTransport([legacy]);

  assert.equal("blockHeightTtl" in prepared[0], false);
});

test("rejects invalid TTLs before calling an injected wallet", async () => {
  let called = false;
  const wallet = {
    signDelegateActions: async () => {
      called = true;
      return { signedDelegateActions: [] };
    },
  };
  const injected = new InjectedWallet({ network: "testnet" }, wallet);

  await assert.rejects(
    injected.signDelegateActions({
      delegateActions: [{ ...transfer, blockHeightTtl: 0 }],
    }),
    /blockHeightTtl must be a positive safe integer/,
  );
  assert.equal(called, false);
});

test("forwards TTL through injected, parent-frame, and sandbox transports", async () => {
  const calls = [];
  const response = {
    signedDelegateActions: [{ borshSerializedBase64: "AA==" }],
  };

  const injected = new InjectedWallet(
    { network: "testnet" },
    {
      signDelegateActions: async (params) => {
        calls.push(["injected", params]);
        return response;
      },
    },
  );
  await injected.signDelegateActions({ delegateActions: [transfer] });

  const parent = new ParentFrameWallet({ network: "testnet" }, { id: "parent" });
  parent.callParentFrame = async (method, params) => {
    calls.push([method, params]);
    return response;
  };
  await parent.signDelegateActions({ delegateActions: [transfer] });

  const sandbox = Object.create(SandboxWallet.prototype);
  sandbox.connector = { network: "testnet" };
  sandbox.executor = {
    call: async (method, params) => {
      calls.push([method, params]);
      return response;
    },
  };
  await sandbox.signDelegateActions({ delegateActions: [transfer] });

  assert.equal(calls.length, 3);
  for (const [, params] of calls) {
    assert.equal(params.network, "testnet");
    assert.equal(params.delegateActions[0].blockHeightTtl, 300);
  }
});

test("default manifest does not advertise timeout-aware signing", async () => {
  const manifest = JSON.parse(await readFile(path.join(__dirname, "../repository/manifest.json"), "utf8"));

  for (const wallet of manifest.wallets) {
    assert.notEqual(wallet.features?.signDelegateActionsWithTtl, true);
  }
});
