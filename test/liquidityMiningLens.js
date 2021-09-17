const { expect } = require("chai");
const { ethers, upgrades, waffle } = require("hardhat");

describe('LiquidityMiningLens', () => {
  const provider = waffle.provider;
  const toWei = ethers.utils.parseEther;
  const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  let accounts;
  let admin, adminAddress;
  let user1, user1Address;
  let user2, user2Address;

  let comptroller;
  let ve;
  let lens;
  let cToken;
  let cToken2;
  let liquidityMining;
  let rewardToken;
  let rewardToken2;

  let speed1, speed2, start, end;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    admin = accounts[0];
    adminAddress = await admin.getAddress();
    user1 = accounts[1];
    user1Address = await user1.getAddress();
    user2 = accounts[2];
    user2Address = await user2.getAddress();

    const comptrollerFactory = await ethers.getContractFactory('MockComptroller');
    comptroller = await comptrollerFactory.deploy();

    const cTokenFactory = await ethers.getContractFactory('MockCToken');
    cToken = await cTokenFactory.deploy();
    cToken2 = await cTokenFactory.deploy();
    await cToken.setBorrowIndex(toWei('1'));
    await cToken2.setBorrowIndex(toWei('1'));

    const veFactory = await ethers.getContractFactory('MockVotingEscrow');
    ve = await veFactory.deploy();

    await comptroller.addMarket(cToken.address);
    await comptroller.addMarket(cToken2.address);

    const liquidityMiningFactory = await ethers.getContractFactory('MockLiquidityMining');
    liquidityMining = await upgrades.deployProxy(liquidityMiningFactory, [adminAddress, comptroller.address, ve.address], { kind: 'uups' });

    const liquidityMiningLensFactory = await ethers.getContractFactory('LiquidityMiningLens');
    lens = await liquidityMiningLensFactory.deploy(liquidityMining.address);

    await comptroller.setLiquidityMining(liquidityMining.address);

    const rewardTokenFactory = await ethers.getContractFactory('MockRewardToken');
    rewardToken = await rewardTokenFactory.deploy();
    rewardToken2 = await rewardTokenFactory.deploy();

    await Promise.all([
      liquidityMining._addRewardToken(rewardToken.address),
      liquidityMining._addRewardToken(rewardToken2.address),
      rewardToken.transfer(liquidityMining.address, toWei('100')),
      rewardToken2.transfer(liquidityMining.address, toWei('100')),
    ]);

    /**
     * supplySpeed  = 1e18
     * supplySpeed2 = 1e18
     * blockTimestamp  = 100000 -> 100110 (deltaBlock = 10)
     * totalSupply  = 2e8    (user1Supply = 1e8)
     *
     * totalReward1  = 1e18 * 10 = 10e18
     * user1Accrued1 = 10e18 / 2 = 5e18
     * totalReward2  = 2e18 * 10 = 20e18
     * user1Accrued2 = 20e18 / 2 = 10e18
     */
    let blockTimestamp = 100000;
    await liquidityMining.setBlockTimestamp(blockTimestamp);

    speed1 = toWei('1'); // 1e18
    speed2 = toWei('2'); // 2e18
    start = 100100;
    end = 100120;
    await Promise.all([
      liquidityMining._setRewardSupplySpeeds(rewardToken.address, [cToken.address], [speed1], [start], [end]),
      liquidityMining._setRewardSupplySpeeds(rewardToken2.address, [cToken2.address], [speed2], [start], [end])
    ]);

    const totalSupply = '200000000'; // 2e8
    const userBalance = '100000000'; // 1e8
    await Promise.all([
      cToken.setTotalSupply(totalSupply),
      cToken.setBalance(user1Address, userBalance),
      cToken.setBalance(user2Address, userBalance),
      cToken2.setTotalSupply(totalSupply),
      cToken2.setBalance(user1Address, userBalance),
      cToken2.setBalance(user2Address, userBalance)
    ]);

    expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
    expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    expect(await rewardToken2.balanceOf(user1Address)).to.eq(0);
    expect(await liquidityMining.rewardAccrued(rewardToken2.address, user1Address)).to.eq(0);

    // Pretend to supply first to initialize rewardSupplierIndex.
    await Promise.all([
      liquidityMining.updateSupplyIndex(cToken.address, [user1Address, user2Address]),
      liquidityMining.updateSupplyIndex(cToken2.address, [user1Address, user2Address])
    ]);

    blockTimestamp = 100110;
    await liquidityMining.setBlockTimestamp(blockTimestamp);
  });

  it('getRewardsAvailable', async () => {
    const result = await lens.callStatic.getRewardsAvailable(user1Address);
    expect(result.length).to.eq(2); // 2 reward tokens
    expect(result[0].rewardToken.rewardTokenAddress).to.eq(rewardToken.address);
    expect(result[0].amount).to.eq(toWei('5'));
    expect(result[1].rewardToken.rewardTokenAddress).to.eq(rewardToken2.address);
    expect(result[1].amount).to.eq(toWei('10'));
  });

  it('getRewardTokenUserBalance', async () => {
    const amount = toWei('1');
    await rewardToken.transfer(user2Address, amount);

    const ethBalance = await lens.getRewardTokenUserBalance(ethAddress, user2Address);
    expect(ethBalance).to.eq(await provider.getBalance(user2Address));
    const tokenBalance = await lens.getRewardTokenUserBalance(rewardToken.address, user2Address);
    expect(tokenBalance).to.eq(amount);
  });

  it('getAllMarketRewardSpeeds', async () => {
    const result = await lens.getAllMarketRewardSpeeds([cToken.address, cToken2.address]);
    expect(result.length).to.eq(2); // 2 markets
    expect(result[0].cToken).to.eq(cToken.address);
    expect(result[0].rewardSpeeds.length).to.eq(2); // 2 reward tokens
    expect(result[0].rewardSpeeds[0].rewardToken.rewardTokenAddress).to.eq(rewardToken.address);
    expect(result[0].rewardSpeeds[0].supplySpeed.speed).to.eq(speed1);
    expect(result[0].rewardSpeeds[0].borrowSpeed.speed).to.eq(0);
    expect(result[0].rewardSpeeds[1].rewardToken.rewardTokenAddress).to.eq(rewardToken2.address);
    expect(result[0].rewardSpeeds[1].supplySpeed.speed).to.eq(0);
    expect(result[0].rewardSpeeds[1].borrowSpeed.speed).to.eq(0);
    expect(result[1].cToken).to.eq(cToken2.address);
    expect(result[1].rewardSpeeds.length).to.eq(2); // 2 reward tokens
    expect(result[1].rewardSpeeds[0].rewardToken.rewardTokenAddress).to.eq(rewardToken.address);
    expect(result[1].rewardSpeeds[0].supplySpeed.speed).to.eq(0);
    expect(result[1].rewardSpeeds[0].borrowSpeed.speed).to.eq(0);
    expect(result[1].rewardSpeeds[1].rewardToken.rewardTokenAddress).to.eq(rewardToken2.address);
    expect(result[1].rewardSpeeds[1].supplySpeed.speed).to.eq(speed2);
    expect(result[1].rewardSpeeds[1].borrowSpeed.speed).to.eq(0);
  });
});
