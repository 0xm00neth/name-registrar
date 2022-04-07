const { ethers } = require("hardhat");
const { expect } = require("chai");
const { takeSnapshot, revertToSnapShot } = require("./utils/snapshot");
const { advanceTimeAndBlock } = require("./utils/time");

let alice;
let bob;

let registrar;

let snapshotId;

describe("NameRegistrar Contract Tests", async function () {
  before(async function () {
    const accounts = await ethers.getSigners();
    alice = accounts[1];
    bob = accounts[2];

    const NameRegistrar = await ethers.getContractFactory("NameRegistrar");
    registrar = await NameRegistrar.deploy();
    await registrar.deployed();
  });

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapShot(snapshotId);
  });

  describe("Commit tests", async function () {
    it("should commit hash", async function () {
      const nonce = 123;
      const name = "Alice";
      const hash = await registrar.digest(nonce, name, alice.address);
      await registrar.connect(alice).commit(hash);

      const commited = await registrar.commits(alice.address);
      expect(commited).to.be.eq(hash);
    });
  });

  describe("Reveal tests", async function () {
    const nonce = 123;
    const name = "Alice";

    beforeEach(async function () {
      const hash = await registrar.digest(nonce, name, alice.address);
      await registrar.connect(alice).commit(hash);
    });

    it("should reveal the name", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      const lockAmount = await registrar.LOCK_AMOUNT();

      await expect(
        registrar.connect(alice).reveal(nonce, name)
      ).to.be.revertedWith("insufficient fee and lock amount");

      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      expect(await registrar.registered(name)).to.be.eq(alice.address);
      expect(await registrar.names(alice.address)).to.be.eq(name);
      expect(await registrar.locked(alice.address)).to.be.eq(true);
    });

    it("should not register same name for 2 users", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      const lockAmount = await registrar.LOCK_AMOUNT();

      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      const bobNonce = 333;
      const hash = await registrar.digest(bobNonce, name, bob.address);
      await registrar.connect(bob).commit(hash);

      await expect(
        registrar.connect(bob).reveal(bobNonce, name, {
          value: feePerChar.mul(name.length).add(lockAmount),
        })
      ).to.be.revertedWith("already registered");
    });

    it("should be able to register same name after LOCK_PERIOD", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      const lockAmount = await registrar.LOCK_AMOUNT();

      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      const bobNonce = 333;
      const hash = await registrar.digest(bobNonce, name, bob.address);
      await registrar.connect(bob).commit(hash); // 1

      let lockPeriod = await registrar.LOCK_PERIOD();
      lockPeriod = parseInt(lockPeriod.toString());
      await advanceTimeAndBlock(lockPeriod - 3);

      await expect(
        registrar.connect(bob).reveal(bobNonce, name, {
          value: feePerChar.mul(name.length).add(lockAmount),
        })
      ).to.be.revertedWith("already registered");

      await advanceTimeAndBlock(1);

      await registrar.connect(bob).reveal(bobNonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });
    });

    it("should not register 2 names for one user at the same time", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      const lockAmount = await registrar.LOCK_AMOUNT();

      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      const newNonce = 100;
      const newName = "NewAlice";
      const hash = await registrar.digest(newNonce, newName, alice.address);
      await expect(registrar.connect(alice).commit(hash)).to.be.revertedWith(
        "user already have name"
      );
    });

    it("should expire after LOCK_PERIOD", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      const lockAmount = await registrar.LOCK_AMOUNT();

      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      let registeredName = await registrar.getName(alice.address);
      expect(registeredName).to.be.eq(name);

      let lockPeriod = await registrar.LOCK_PERIOD();
      lockPeriod = parseInt(lockPeriod.toString());
      await advanceTimeAndBlock(lockPeriod - 1);

      registeredName = await registrar.getName(alice.address);
      expect(registeredName).to.be.eq(name);

      await advanceTimeAndBlock(1);

      registeredName = await registrar.getName(alice.address);
      expect(registeredName).to.be.eq("");
    });
  });

  describe("Renew tests", async function () {
    const nonce = 123;
    const name = "Alice";

    beforeEach(async function () {
      const hash = await registrar.digest(nonce, name, alice.address);
      await registrar.connect(alice).commit(hash);

      const feePerChar = await registrar.PRICE_PER_CHAR();
      const lockAmount = await registrar.LOCK_AMOUNT();
      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });
    });

    it("should renew name", async function () {
      let lockPeriod = await registrar.LOCK_PERIOD();
      lockPeriod = parseInt(lockPeriod.toString());
      await advanceTimeAndBlock(lockPeriod - 2);

      await registrar.connect(alice).renew(name);

      await advanceTimeAndBlock(lockPeriod - 1);

      let registeredName = await registrar.getName(alice.address);
      expect(registeredName).to.be.eq(name);

      await advanceTimeAndBlock(1);

      registeredName = await registrar.getName(alice.address);
      expect(registeredName).to.be.eq("");
    });

    it("should not renew after name expires", async function () {
      let lockPeriod = await registrar.LOCK_PERIOD();
      lockPeriod = parseInt(lockPeriod.toString());
      await advanceTimeAndBlock(lockPeriod - 1);

      await expect(registrar.connect(alice).renew(name)).to.be.revertedWith(
        "not registered or already expired"
      );
    });

    it("should not renew unregistered name", async function () {
      await expect(
        registrar.connect(alice).renew(name + "aa")
      ).to.be.revertedWith("not registered or already expired");
    });
  });

  describe("Unlock Balance tests", async function () {
    const nonce = 123;
    const name = "Alice";
    let lockAmount;

    beforeEach(async function () {
      const hash = await registrar.digest(nonce, name, alice.address);
      await registrar.connect(alice).commit(hash);
    });

    it("should not unlock when no name registered", async function () {
      await expect(registrar.connect(alice).unlockBalance()).to.be.revertedWith(
        "no name registered"
      );
    });

    it("should not unlock before name expires", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      lockAmount = await registrar.LOCK_AMOUNT();
      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      let lockPeriod = await registrar.LOCK_PERIOD();
      lockPeriod = parseInt(lockPeriod.toString());
      await advanceTimeAndBlock(lockPeriod - 2);

      await expect(registrar.connect(alice).unlockBalance()).to.be.revertedWith(
        "name not expired yet"
      );

      await advanceTimeAndBlock(1);

      const beforeBalance = await alice.getBalance();
      const tx = await registrar.connect(alice).unlockBalance();
      const afterBalance = await alice.getBalance();
      const receipt = await tx.wait();

      // Check changes in user's ETH balance
      expect(afterBalance).to.be.eq(
        beforeBalance
          .add(lockAmount)
          .sub(receipt.gasUsed.mul(receipt.effectiveGasPrice))
      );
    });

    it("should not unlock twice", async function () {
      const feePerChar = await registrar.PRICE_PER_CHAR();
      lockAmount = await registrar.LOCK_AMOUNT();
      await registrar.connect(alice).reveal(nonce, name, {
        value: feePerChar.mul(name.length).add(lockAmount),
      });

      let lockPeriod = await registrar.LOCK_PERIOD();
      lockPeriod = parseInt(lockPeriod.toString());
      await advanceTimeAndBlock(lockPeriod - 1);

      await registrar.connect(alice).unlockBalance();

      await expect(registrar.connect(alice).unlockBalance()).to.be.revertedWith(
        "already unlocked"
      );
    });
  });
});
