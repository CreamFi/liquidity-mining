const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe('LiquidityMiningProxy', () => {
  let accounts;
  let admin, adminAddress;
  let user1, user1Address;

  let comptroller;
  let liquidityMining;
  let rewardToken;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    admin = accounts[0];
    adminAddress = await admin.getAddress();
    user1 = accounts[1];
    user1Address = await user1.getAddress();

    const comptrollerFactory = await ethers.getContractFactory('MockComptroller');
    comptroller = await comptrollerFactory.deploy();

    const liquidityMiningFactory = await ethers.getContractFactory('LiquidityMining');
    liquidityMining = await upgrades.deployProxy(liquidityMiningFactory, [adminAddress, comptroller.address], { kind: 'uups' });

    const rewardTokenFactory = await ethers.getContractFactory('MockRewardToken');
    rewardToken = await rewardTokenFactory.deploy();
  });

  it('changes implementation', async () => {
    await liquidityMining._addRewardToken(rewardToken.address);

    const liquidityMiningFactory = await ethers.getContractFactory('LiquidityMiningExtension');
    liquidityMining = await upgrades.upgradeProxy(liquidityMining.address, liquidityMiningFactory, [adminAddress, comptroller.address]);

    expect(await liquidityMining.test()).to.eq('test');
  });
});
