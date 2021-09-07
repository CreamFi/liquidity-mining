const { expect } = require("chai");
const { ethers } = require("hardhat");

// We intentionally don't use oz's plugin to deploy or upgrade the proxy contract here so we could simulate the production interaction.
describe('LiquidityMiningProxy', () => {
  let accounts;
  let admin, adminAddress;
  let user1, user1Address;

  let comptroller;
  let ve;
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

    const veFactory = await ethers.getContractFactory('MockVotingEscrow');
    ve = await veFactory.deploy();

    const liquidityMiningFactory = await ethers.getContractFactory('LiquidityMining');
    const implementation = await liquidityMiningFactory.deploy();
    const fragment = liquidityMiningFactory.interface.getFunction('initialize');
    const initData = liquidityMiningFactory.interface.encodeFunctionData(fragment, [adminAddress, comptroller.address, ve.address]);

    const liquidityMiningProxyFactory = await ethers.getContractFactory('LiquidityMiningProxy');
    const proxy = await liquidityMiningProxyFactory.deploy(implementation.address, initData);

    liquidityMining = liquidityMiningFactory.attach(proxy.address);

    const rewardTokenFactory = await ethers.getContractFactory('MockRewardToken');
    rewardToken = await rewardTokenFactory.deploy();
  });

  it('changes implementation', async () => {
    await liquidityMining._addRewardToken(rewardToken.address);
    expect(await liquidityMining.rewardTokensMap(rewardToken.address)).to.eq(true);

    const liquidityMiningFactory = await ethers.getContractFactory('LiquidityMiningExtension');
    const implementation = await liquidityMiningFactory.deploy();
    await liquidityMining.upgradeTo(implementation.address);
    liquidityMining = liquidityMiningFactory.attach(liquidityMining.address);

    expect(await liquidityMining.test()).to.eq('test');
    expect(await liquidityMining.rewardTokensMap(rewardToken.address)).to.eq(true);
  });

  it('fails to call initialize again', async () => {
    await expect(liquidityMining.connect(user1).initialize(user1Address, comptroller.address)).to.be.revertedWith('Initializable: contract is already initialized');
  });

  it('fails to change implementation for non-admin', async () => {
    const liquidityMiningFactory = await ethers.getContractFactory('LiquidityMiningExtension');
    const implementation = await liquidityMiningFactory.deploy();
    await expect(liquidityMining.connect(user1).upgradeTo(implementation.address)).to.be.revertedWith('Ownable: caller is not the owner');
  });

  // This is useful to encode the init data for the mainnet contract deployment.
  it.skip('outputs the init data', async () => {
    const admin = '';
    const comptroller = '';

    const liquidityMiningFactory = await ethers.getContractFactory('LiquidityMining');
    const fragment = liquidityMiningFactory.interface.getFunction('initialize');
    const initData = liquidityMiningFactory.interface.encodeFunctionData(fragment, [admin, comptroller]);
    console.log('initData', initData);
  });
});
