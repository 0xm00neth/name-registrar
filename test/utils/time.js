const { ethers } = require("hardhat");

async function advanceBlock() {
  return ethers.provider.send("evm_mine", []);
}

async function advanceBlocks(blockCount) {
  for (let i = 0; i < blockCount; i++) {
    await advanceBlock();
  }
}

async function advanceTime(time) {
  await ethers.provider.send("evm_increaseTime", [time]);
}

async function advanceTimeAndBlock(time) {
  await advanceTime(time);
  await advanceBlock();
}

module.exports = {
  advanceBlock,
  advanceBlocks,
  advanceTime,
  advanceTimeAndBlock,
};
