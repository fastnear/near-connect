const assert = require("node:assert/strict");
const test = require("node:test");
const { assertGasKeyActionsSupported, isGasKeyAction } = require("../build");

const pk = "ed25519:3ARMH9zfVCnU2TKiphU4xcEyWdA45fc1sjKEtYMdf3gr";
const plainAddKey = { type: "AddKey", params: { publicKey: pk, accessKey: { permission: "FullAccess" } } };
const gasAddKey = { type: "AddKey", params: { publicKey: pk, accessKey: { permission: "FullAccess" }, gasKeyInfo: { balance: "0", numNonces: 4 } } };
const fund = { type: "TransferToGasKey", params: { publicKey: pk, deposit: "1" } };
const withdraw = { type: "WithdrawFromGasKey", params: { publicKey: pk, amount: "1" } };

test("isGasKeyAction recognises exactly the three gas-key shapes", () => {
  assert.equal(isGasKeyAction(plainAddKey), false);
  assert.equal(isGasKeyAction({ type: "Transfer", params: { deposit: "1" } }), false);
  assert.equal(isGasKeyAction(gasAddKey), true);
  assert.equal(isGasKeyAction(fund), true);
  assert.equal(isGasKeyAction(withdraw), true);
});

test("plain actions pass regardless of the flag", () => {
  assert.doesNotThrow(() => assertGasKeyActionsSupported(undefined, [plainAddKey], "Some Wallet"));
  assert.doesNotThrow(() => assertGasKeyActionsSupported({ gasKeys: false }, [plainAddKey], "Some Wallet"));
});

test("gas-key actions are refused unless features.gasKeys is set (fail-closed)", () => {
  for (const action of [gasAddKey, fund, withdraw]) {
    assert.throws(() => assertGasKeyActionsSupported(undefined, [action], "Some Wallet"), /Some Wallet does not advertise gas-key support/);
    assert.throws(() => assertGasKeyActionsSupported({ gasKeys: false }, [action], "Some Wallet"), /features\.gasKeys/);
  }
  assert.doesNotThrow(() => assertGasKeyActionsSupported({ gasKeys: true }, [gasAddKey, fund, withdraw], "Gas Wallet"));
});

test("the error names every refused action type once", () => {
  assert.throws(() => assertGasKeyActionsSupported({}, [fund, fund, withdraw], "W"), /TransferToGasKey, WithdrawFromGasKey/);
});
