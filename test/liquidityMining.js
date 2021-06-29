const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");

describe('LiquidityMining', () => {
  const provider = waffle.provider;
  const toWei = ethers.utils.parseEther;
  const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  let accounts;
  let admin, adminAddress;
  let user1, user1Address;
  let user2, user2Address;

  let comptroller;
  let cToken;
  let liquidityMining;
  let rewardToken;

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

    await comptroller.addMarket(cToken.address);

    const liquidityMiningFactory = await ethers.getContractFactory('MockLiquidityMining');
    liquidityMining = await liquidityMiningFactory.deploy(comptroller.address);

    await comptroller.setLiquidityMining(liquidityMining.address);

    const rewardTokenFactory = await ethers.getContractFactory('MockRewardToken');
    rewardToken = await rewardTokenFactory.deploy();

    await liquidityMining._addRewardToken(rewardToken.address);
    await rewardToken.transfer(liquidityMining.address, toWei('100'));
    await admin.sendTransaction({
      to: liquidityMining.address,
      value: toWei('100'),
    });
  });

  it('updateSupplyIndex', async () => {
    /**
     * supplySpeed = 1e18
     * deltaBlock  = 10
     * totalSupply = 2e8 (user1Supply = 1e8)
     *
     * totalReward  = 1e18 * 10 = 10e18
     * user1Accrued = 10e18 / 2 = 5e18
     */
    let blockNumber = 100000;
    await liquidityMining.setBlockNumber(blockNumber);

    const speed = toWei('1'); // 1e18
    await liquidityMining._setRewardSupplySpeeds(rewardToken.address, [cToken.address], [speed]);

    blockNumber = 100010; // forward 10 blocks.
    const totalSupply = '200000000'; // 2e8
    const userBalance = '100000000'; // 1e8
    await Promise.all([
      liquidityMining.setBlockNumber(blockNumber),
      cToken.setTotalSupply(totalSupply),
      cToken.setBalance(user1Address, userBalance)
    ]);

    expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
    expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

    await comptroller.updateSupplyIndex(cToken.address, [user1Address]);

    expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
    expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
  });

  it('updateBorrowIndex', async () => {
    /**
     * borrowSpeed  = 1e18
     * deltaBlock   = 10
     * totalBorrows = 2e18 (user1Borrow = 1e18)
     *
     * totalReward  = 1e18 * 10 = 10e18
     * user1Accrued = 10e18 / 2 = 5e18
     */
    let blockNumber = 100000;
    const borrowIndex = toWei('1'); // 1e18
    await Promise.all([
      liquidityMining.setBlockNumber(blockNumber),
      cToken.setBorrowIndex(borrowIndex)
    ]);

    const speed = toWei('1'); // 1e18
    await liquidityMining._setRewardBorrowSpeeds(rewardToken.address, [cToken.address], [speed]);

    // Pretend to borrow first to initialize rewardBorrowerIndex.
    await comptroller.updateBorrowIndex(cToken.address, [user1Address]);

    blockNumber = 100010; // forward 10 blocks.
    const totalBorrows = toWei('2'); // 2e18
    const borrowBalance = toWei('1'); // 1e18
    await Promise.all([
      liquidityMining.setBlockNumber(blockNumber),
      cToken.setTotalBorrows(totalBorrows),
      cToken.setBorrowBalance(user1Address, borrowBalance)
    ]);

    expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
    expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

    await comptroller.updateBorrowIndex(cToken.address, [user1Address]);

    expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
    expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
  });

  describe('transferReward', async () => {
    let nonStandardRewardToken;

    beforeEach(async () => {
      const nonStandardRewardTokenFactory = await ethers.getContractFactory('MockNonStandardRewardToken');
      nonStandardRewardToken = await nonStandardRewardTokenFactory.deploy();

      await nonStandardRewardToken.transfer(liquidityMining.address, toWei('100'));
    });

    it('transfer native reward token', async () => {
      expect(await provider.getBalance(user1Address)).to.eq(toWei('10000'));

      await liquidityMining.transferTokens(ethAddress, user1Address, toWei('10'));

      expect(await provider.getBalance(user1Address)).to.eq(toWei('10010'));
    });

    it('transfer standard ERC20 reward token', async () => {
      const amount = toWei('10');

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);

      await liquidityMining.transferTokens(rewardToken.address, user1Address, amount);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(amount);
    });

    it('transfer non-standard ERC20 reward token', async () => {
      const amount = toWei('10');

      expect(await nonStandardRewardToken.balanceOf(user1Address)).to.eq(0);

      await liquidityMining.transferTokens(nonStandardRewardToken.address, user1Address, amount);

      expect(await nonStandardRewardToken.balanceOf(user1Address)).to.eq(amount);
    });
  });

  describe('updateDebtors', async () => {
    it('updates debtors', async () => {
      await Promise.all([
        comptroller.setAccountLiquidity(user1Address, 0, 1), // debtor
        comptroller.setAccountLiquidity(user2Address, 0, 0) // not debtor
      ]);

      await liquidityMining.updateDebtors([user1Address, user2Address]);
      expect(await liquidityMining.debtors(user1Address)).to.eq(true);
      expect(await liquidityMining.debtors(user2Address)).to.eq(false); // value unchange

      await comptroller.setAccountLiquidity(user1Address, 0, 0); // not debtor

      await liquidityMining.updateDebtors([user1Address, user2Address]);
      expect(await liquidityMining.debtors(user1Address)).to.eq(false);
      expect(await liquidityMining.debtors(user2Address)).to.eq(false); // value unchange
    });

    it('fails to update debtors for comptroller failure', async () => {
      await comptroller.setAccountLiquidity(user1Address, 1, 0); // comptroller error

      await expect(liquidityMining.updateDebtors([user1Address])).to.be.revertedWith('failed to get account liquidity from comptroller');
      expect(await liquidityMining.debtors(user1Address)).to.eq(false); // value unchange

      await comptroller.setAccountLiquidity(user1Address, 0, 1); // debtor

      await liquidityMining.updateDebtors([user1Address]);
      expect(await liquidityMining.debtors(user1Address)).to.eq(true);

      await comptroller.setAccountLiquidity(user1Address, 1, 0); // comptroller error
      await expect(liquidityMining.updateDebtors([user1Address])).to.be.revertedWith('failed to get account liquidity from comptroller');
      expect(await liquidityMining.debtors(user1Address)).to.eq(true); // value unchange
    });
  });
});
