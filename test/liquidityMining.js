const { expect } = require("chai");
const { ethers, upgrades, waffle } = require("hardhat");

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
  let cToken2;
  let liquidityMining;
  let rewardToken;
  let rewardToken2;
  let rewardToken3;

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

    await comptroller.addMarket(cToken.address);
    await comptroller.addMarket(cToken2.address);

    const liquidityMiningFactory = await ethers.getContractFactory('MockLiquidityMining');
    liquidityMining = await upgrades.deployProxy(liquidityMiningFactory, [adminAddress, comptroller.address], { kind: 'uups' });

    await comptroller.setLiquidityMining(liquidityMining.address);

    const rewardTokenFactory = await ethers.getContractFactory('MockRewardToken');
    rewardToken = await rewardTokenFactory.deploy();
    rewardToken2 = await rewardTokenFactory.deploy();
    rewardToken3 = await rewardTokenFactory.deploy();

    await Promise.all([
      liquidityMining._addRewardToken(rewardToken.address),
      liquidityMining._addRewardToken(rewardToken2.address),
      rewardToken.transfer(liquidityMining.address, toWei('100')),
      rewardToken2.transfer(liquidityMining.address, toWei('100')),
      admin.sendTransaction({
        to: liquidityMining.address,
        value: toWei('100'),
      })
    ]);
  });

  // Nothing will happen when a comptroller is connected to a empty LM module.
  describe('initial status', async () => {
    beforeEach(async () => {
      const blockTimestamp = 100000;
      const totalSupply = '200000000'; // 2e8
      const userBalance = '100000000'; // 1e8
      const totalBorrows = toWei('2'); // 2e18
      const borrowBalance = toWei('1'); // 1e18
      const borrowIndex = toWei('1'); // 1e18
      await Promise.all([
        liquidityMining.setBlockTimestamp(blockTimestamp),
        cToken.setTotalSupply(totalSupply),
        cToken.setBalance(user1Address, userBalance),
        cToken.setTotalBorrows(totalBorrows),
        cToken.setBorrowBalance(user1Address, borrowBalance),
        cToken.setBorrowIndex(borrowIndex)
      ]);
    });

    it('updateSupplyIndex', async () => {
      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateSupplyIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });

    it('updateBorrowIndex', async () => {
      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateBorrowIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });
  });

  describe('updateSupplyIndex', async () => {
    beforeEach(async () => {
      /**
       * supplySpeed = 1e18
       * current     = 100000
       * start       = 100100
       * to          = 100120
       */
      const blockTimestamp = 100000;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      const speed = toWei('1'); // 1e18
      const start = 100100;
      const end = 100120;
      await liquidityMining._setRewardSupplySpeeds(rewardToken.address, [cToken.address], [speed], [start], [end]);
    });

    it('updates before the reward starts', async () => {
      /**
       * supplySpeed = 1e18
       * current     = 100090
       * totalSupply = 2e8    (user1Supply = 1e8)
       *
       * totalReward  = 0
       * user1Accrued = 0
       */
      const totalSupply = '200000000'; // 2e8
      const userBalance = '100000000'; // 1e8
      await Promise.all([
        cToken.setTotalSupply(totalSupply),
        cToken.setBalance(user1Address, userBalance)
      ]);

      const blockTimestamp = 100090;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateSupplyIndex(cToken.address, [user1Address]);

      // Reward hasn't started. Get nothing.
      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });

    it('updates after the reward starts and before it ends', async () => {
      /**
       * supplySpeed = 1e18
       * current     = 100110 (deltaBlock = 10)
       * totalSupply = 2e8    (user1Supply = 1e8)
       *
       * totalReward  = 1e18 * 10 = 10e18
       * user1Accrued = 10e18 / 2 = 5e18
       */
      const totalSupply = '200000000'; // 2e8
      const userBalance = '100000000'; // 1e8
      await Promise.all([
        cToken.setTotalSupply(totalSupply),
        cToken.setBalance(user1Address, userBalance)
      ]);

      const blockTimestamp = 100110;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateSupplyIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });

    it('updates after the reward ends', async () => {
      /**
       * supplySpeed = 1e18
       * current     = 100130 (deltaBlock = 30, rewardDeltaBlocks = 20)
       * totalSupply = 2e8    (user1Supply = 1e8)
       *
       * totalReward  = 1e18 * 20 = 20e18
       * user1Accrued = 20e18 / 2 = 10e18
       */
      const totalSupply = '200000000'; // 2e8
      const userBalance = '100000000'; // 1e8
      await Promise.all([
        cToken.setTotalSupply(totalSupply),
        cToken.setBalance(user1Address, userBalance)
      ]);

      let blockTimestamp = 100130;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateSupplyIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      const [_, block] = await liquidityMining.rewardSupplyState(rewardToken.address, cToken.address);
      expect(block).to.eq(blockTimestamp);

      // After the reward ends, the user should get no more rewards.
      blockTimestamp = 100140;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      await liquidityMining.updateSupplyIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });
  });

  describe('updateBorrowIndex', async () => {
    beforeEach(async () => {
      /**
       * borrowSpeed = 1e18
       * current     = 100000
       * start       = 100100
       * to          = 100120
       */
      const blockTimestamp = 100000;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      const speed = toWei('1'); // 1e18
      const start = 100100;
      const end = 100120;
      await liquidityMining._setRewardBorrowSpeeds(rewardToken.address, [cToken.address], [speed], [start], [end]);
    });

    it('updates before the reward starts', async () => {
      /**
       * borrowSpeed  = 1e18
       * current      = 100090
       * totalBorrows = 2e18   (user1Borrow = 1e18)
       *
       * totalReward  = 0
       * user1Accrued = 0
       */
      const totalBorrows = toWei('2'); // 2e18
      const borrowBalance = toWei('1'); // 1e18
      const borrowIndex = toWei('1'); // 1e18
      await Promise.all([
        cToken.setTotalBorrows(totalBorrows),
        cToken.setBorrowBalance(user1Address, borrowBalance),
        cToken.setBorrowIndex(borrowIndex)
      ]);

      const blockTimestamp = 100090;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateBorrowIndex(cToken.address, [user1Address]);

      // Reward hasn't started. Get nothing.
      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });

    it('updates after the reward starts and before it ends', async () => {
      /**
       * borrowSpeed  = 1e18
       * current      = 100110 (deltaBlock = 10)
       * totalBorrows = 2e18   (user1Borrow = 1e18)
       *
       * totalReward  = 1e18 * 10 = 10e18
       * user1Accrued = 10e18 / 2 = 5e18
       */
      const totalBorrows = toWei('2'); // 2e18
      const borrowBalance = toWei('1'); // 1e18
      const borrowIndex = toWei('1'); // 1e18
      await Promise.all([
        cToken.setTotalBorrows(totalBorrows),
        cToken.setBorrowBalance(user1Address, borrowBalance),
        cToken.setBorrowIndex(borrowIndex)
      ]);

      const blockTimestamp = 100110;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateBorrowIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });

    it('updates after the reward ends', async () => {
      /**
       * borrowSpeed  = 1e18
       * current      = 100130 (deltaBlock = 30, rewardDeltaBlocks = 20)
       * totalBorrows = 2e18   (user1Borrow = 1e18)
       *
       * totalReward  = 1e18 * 20 = 20e18
       * user1Accrued = 20e18 / 2 = 10e18
       */
      const totalBorrows = toWei('2'); // 2e18
      const borrowBalance = toWei('1'); // 1e18
      const borrowIndex = toWei('1'); // 1e18
      await Promise.all([
        cToken.setTotalBorrows(totalBorrows),
        cToken.setBorrowBalance(user1Address, borrowBalance),
        cToken.setBorrowIndex(borrowIndex)
      ]);

      let blockTimestamp = 100130;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      await liquidityMining.updateBorrowIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      const [_, block] = await liquidityMining.rewardBorrowState(rewardToken.address, cToken.address);
      expect(block).to.eq(blockTimestamp);

      // After the reward ends, the user should get no more rewards.
      blockTimestamp = 100140;
      await liquidityMining.setBlockTimestamp(blockTimestamp);

      await liquidityMining.updateBorrowIndex(cToken.address, [user1Address]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
    });
  });

  describe('claimAllRewards / claimRewards / claimSingleReward', async () => {
    beforeEach(async () => {
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

      const speed1 = toWei('1'); // 1e18
      const speed2 = toWei('2'); // 2e18
      const start = 100100;
      const end = 100120;
      await Promise.all([
        liquidityMining._setRewardSupplySpeeds(rewardToken.address, [cToken.address], [speed1], [start], [end]),
        liquidityMining._setRewardSupplySpeeds(rewardToken2.address, [cToken2.address], [speed2], [start], [end])
      ]);

      const totalSupply = '200000000'; // 2e8
      const userBalance = '100000000'; // 1e8
      await Promise.all([
        cToken.setTotalSupply(totalSupply),
        cToken.setBalance(user1Address, userBalance),
        cToken2.setTotalSupply(totalSupply),
        cToken2.setBalance(user1Address, userBalance)
      ]);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
      expect(await rewardToken2.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken2.address, user1Address)).to.eq(0);

      blockTimestamp = 100110;
      await liquidityMining.setBlockTimestamp(blockTimestamp);
    });

    it('claimAllRewards', async () => {
      await liquidityMining.claimAllRewards(user1Address);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
      expect(await rewardToken2.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken2.address, user1Address)).to.eq(0);
    });

    it('claimRewards', async () => {
      await liquidityMining.claimRewards([user1Address], [cToken.address], [rewardToken.address], true, true);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);
      expect(await rewardToken2.balanceOf(user1Address)).to.eq(0);
      expect(await liquidityMining.rewardAccrued(rewardToken2.address, user1Address)).to.eq(0);

      await liquidityMining.claimRewards([user1Address], [cToken2.address], [rewardToken2.address], true, true);

      expect(await rewardToken2.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken2.address, user1Address)).to.eq(0);
    });

    it('debtor is not allowed to claim rewards', async () => {
      await comptroller.setAccountLiquidity(user1Address, 0, 1);
      await liquidityMining.updateDebtors([user1Address]);
      expect(await liquidityMining.debtors(user1Address)).to.eq(true);

      await expect(liquidityMining.claimRewards([user1Address], [cToken2.address], [rewardToken2.address], true, true)).to.be.revertedWith('debtor is not allowed to claim rewards');
      await expect(liquidityMining.claimSingleReward(user1Address, rewardToken2.address)).to.be.revertedWith('debtor is not allowed to claim rewards');
    });

    it('claimSingleReward', async () => {
      const reward1Result = await liquidityMining.callStatic.claimSingleReward(user1Address, rewardToken.address);
      expect(reward1Result.length).to.eq(2); // 2 markets
      expect(reward1Result[0].market).to.eq(cToken.address);
      expect(reward1Result[0].supply).to.eq(true);
      expect(reward1Result[0].borrow).to.eq(false);
      expect(reward1Result[1].market).to.eq(cToken2.address);
      expect(reward1Result[1].supply).to.eq(false);
      expect(reward1Result[1].borrow).to.eq(false);

      await liquidityMining.claimSingleReward(user1Address, rewardToken.address);
      expect(await rewardToken.balanceOf(user1Address)).to.eq(toWei('5')); // 5e18
      expect(await liquidityMining.rewardAccrued(rewardToken.address, user1Address)).to.eq(0);

      const reward2Result = await liquidityMining.callStatic.claimSingleReward(user1Address, rewardToken2.address);
      expect(reward2Result.length).to.eq(2); // 2 markets
      expect(reward2Result[0].market).to.eq(cToken.address);
      expect(reward2Result[0].supply).to.eq(false);
      expect(reward2Result[0].borrow).to.eq(false);
      expect(reward2Result[1].market).to.eq(cToken2.address);
      expect(reward2Result[1].supply).to.eq(true);
      expect(reward2Result[1].borrow).to.eq(false);

      await liquidityMining.claimSingleReward(user1Address, rewardToken2.address);
      expect(await rewardToken2.balanceOf(user1Address)).to.eq(toWei('10')); // 10e18
      expect(await liquidityMining.rewardAccrued(rewardToken2.address, user1Address)).to.eq(0);
    });
  });

  describe('transferReward', async () => {
    let nonStandardRewardToken;

    beforeEach(async () => {
      const nonStandardRewardTokenFactory = await ethers.getContractFactory('MockNonStandardRewardToken');
      nonStandardRewardToken = await nonStandardRewardTokenFactory.deploy();

      await nonStandardRewardToken.transfer(liquidityMining.address, toWei('100'));

      await comptroller.setAccountLiquidity(user2Address, 0, 1); // debtor
      await liquidityMining.updateDebtors([user2Address]);
    });

    it('transfer native reward token but insufficient funds', async () => {
      expect(await provider.getBalance(user1Address)).to.eq(toWei('10000'));

      await liquidityMining.harnessTransferReward(ethAddress, user1Address, toWei('101'));

      expect(await provider.getBalance(user1Address)).to.eq(toWei('10000'));
    });

    it('not transfer native reward token to a debtor', async () => {
      expect(await provider.getBalance(user2Address)).to.eq(toWei('10000'));

      await liquidityMining.harnessTransferReward(ethAddress, user2Address, toWei('10'));

      expect(await provider.getBalance(user2Address)).to.eq(toWei('10000'));
    });

    it('transfer native reward token', async () => {
      expect(await provider.getBalance(user1Address)).to.eq(toWei('10000'));

      await liquidityMining.harnessTransferReward(ethAddress, user1Address, toWei('10'));

      expect(await provider.getBalance(user1Address)).to.eq(toWei('10010'));
    });

    it('transfer standard ERC20 reward token but insufficient funds', async () => {
      const amount = toWei('101');

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);

      await liquidityMining.harnessTransferReward(rewardToken.address, user1Address, amount);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);
    });

    it('not transfer standard ERC20 reward token to a debtor', async () => {
      const amount = toWei('10');

      expect(await rewardToken.balanceOf(user2Address)).to.eq(0);

      await liquidityMining.harnessTransferReward(rewardToken.address, user2Address, amount);

      expect(await rewardToken.balanceOf(user2Address)).to.eq(0);
    });

    it('transfer standard ERC20 reward token', async () => {
      const amount = toWei('10');

      expect(await rewardToken.balanceOf(user1Address)).to.eq(0);

      await liquidityMining.harnessTransferReward(rewardToken.address, user1Address, amount);

      expect(await rewardToken.balanceOf(user1Address)).to.eq(amount);
    });

    it('transfer non-standard ERC20 reward token but insufficient funds', async () => {
      const amount = toWei('101');

      expect(await nonStandardRewardToken.balanceOf(user1Address)).to.eq(0);

      await liquidityMining.harnessTransferReward(nonStandardRewardToken.address, user1Address, amount);

      expect(await nonStandardRewardToken.balanceOf(user1Address)).to.eq(0);
    });

    it('not transfer non-standard ERC20 reward token to a debtor', async () => {
      const amount = toWei('10');

      expect(await nonStandardRewardToken.balanceOf(user2Address)).to.eq(0);

      await liquidityMining.harnessTransferReward(nonStandardRewardToken.address, user2Address, amount);

      expect(await nonStandardRewardToken.balanceOf(user2Address)).to.eq(0);
    });

    it('transfer non-standard ERC20 reward token', async () => {
      const amount = toWei('10');

      expect(await nonStandardRewardToken.balanceOf(user1Address)).to.eq(0);

      await liquidityMining.harnessTransferReward(nonStandardRewardToken.address, user1Address, amount);

      expect(await nonStandardRewardToken.balanceOf(user1Address)).to.eq(amount);
    });

    it('transfer reward to the delegate receiver', async () => {
      const amount = toWei('10');

      expect(await rewardToken.balanceOf(user2Address)).to.eq(0);

      await liquidityMining.setRewardsReceiver(user1Address, user2Address);

      await liquidityMining.harnessTransferReward(rewardToken.address, user1Address, amount);

      expect(await rewardToken.balanceOf(user2Address)).to.eq(amount);
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
      expect(await liquidityMining.debtors(user2Address)).to.eq(false); // value unchanged

      await comptroller.setAccountLiquidity(user1Address, 0, 0); // not debtor

      await liquidityMining.updateDebtors([user1Address, user2Address]);
      expect(await liquidityMining.debtors(user1Address)).to.eq(false);
      expect(await liquidityMining.debtors(user2Address)).to.eq(false); // value unchanged
    });

    it('fails to update debtors for comptroller failure', async () => {
      await comptroller.setAccountLiquidity(user1Address, 1, 0); // comptroller error

      await expect(liquidityMining.updateDebtors([user1Address])).to.be.revertedWith('failed to get account liquidity from comptroller');
      expect(await liquidityMining.debtors(user1Address)).to.eq(false); // value unchanged

      await comptroller.setAccountLiquidity(user1Address, 0, 1); // debtor

      await liquidityMining.updateDebtors([user1Address]);
      expect(await liquidityMining.debtors(user1Address)).to.eq(true);

      await comptroller.setAccountLiquidity(user1Address, 1, 0); // comptroller error
      await expect(liquidityMining.updateDebtors([user1Address])).to.be.revertedWith('failed to get account liquidity from comptroller');
      expect(await liquidityMining.debtors(user1Address)).to.eq(true); // value unchanged
    });
  });

  describe('setRewardsReceiver', async () => {
    it('sets reward receiver', async () => {
      await liquidityMining.setRewardsReceiver(user1Address, user2Address);
      expect(await liquidityMining.rewardReceivers(user1Address)).to.eq(user2Address);
    });

    it('fails to set reward receiver for non-admin', async () => {
      await expect(liquidityMining.connect(user2).setRewardsReceiver(user1Address, user2Address)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('_addRewardToken', async () => {
    it('adds new reward token', async () => {
      expect(await liquidityMining.rewardTokensMap(rewardToken3.address)).to.eq(false);
      expect(await liquidityMining.getRewardTokenList()).to.eql([rewardToken.address, rewardToken2.address]);

      await liquidityMining._addRewardToken(rewardToken3.address);

      expect(await liquidityMining.rewardTokensMap(rewardToken3.address)).to.eq(true);
      expect(await liquidityMining.getRewardTokenList()).to.eql([rewardToken.address, rewardToken2.address, rewardToken3.address]);
    });

    it('fails to add new reward token for non-admin', async () => {
      await expect(liquidityMining.connect(user1)._addRewardToken(rewardToken3.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('reverts if trying to add duplicate reward token', async () => {
      await expect(liquidityMining._addRewardToken(rewardToken.address)).to.be.revertedWith('reward token has been added');
    });
  });

  ['Supply', 'Borrow'].forEach(action => {
    describe(`_setReward${action}Speeds`, async () => {
      beforeEach(async () => {
        const blockTimestamp = 100000;
        const totalSupply = toWei('1'); // 1e18
        const totalBorrows = toWei('1'); // 1e18
        const borrowIndex = toWei('1'); // 1e18
        await Promise.all([
          liquidityMining.setBlockTimestamp(blockTimestamp),
          cToken.setTotalSupply(totalSupply),
          cToken.setTotalBorrows(totalBorrows),
          cToken.setBorrowIndex(borrowIndex)
        ]);
      });

      it('set the reward whose start timestamp is earlier than the current timestamp', async () => {
        /**
         * speed        = 1e18
         * start        = 99990
         * current      = 100000
         * end          = 100010 (delta = 10)
         * totalSupply  = 1e18
         * totalBorrows = 1e18
         * borrowIndex  = 1e18
         *
         * totalReward = 20e18
         * ratio       = 20e18 * 1e18 / 1e18 = 20e18
         * index       = 1e18 + 20e18 = 21e18
         */
        const speed = toWei('1'); // 1e18
        const start = 99990;
        const end = 100010;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end]);

        const blockTimestamp = 100010;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('11'));
        expect(block).to.eq(blockTimestamp);
      });

      it('replace the reward before the old one started', async () => {
        /**
         * speed        = 2e18
         * start        = 100020
         * end          = 100030 (delta = 10)
         * totalSupply  = 1e18
         * totalBorrows = 1e18
         * borrowIndex  = 1e18
         *
         * totalReward = 20e18
         * ratio       = 20e18 * 1e18 / 1e18 = 20e18
         * index       = 1e18 + 20e18 = 21e18
         */
        const speed = toWei('1'); // 1e18
        const start = 100100;
        const end = 100120;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end]);

        let blockTimestamp = 100010;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // The reward hasn't started yet. Can replace the old reward entirely.
        const newSpeed = toWei('2'); // 2e18
        const newStart = 100020;
        const newEnd = 100030;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [newSpeed], [newStart], [newEnd]);

        blockTimestamp = 100030;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('21'));
        expect(block).to.eq(blockTimestamp);
      });

      it('extend the reward end day and update the speed after the reward started', async () => {
        /**
         *            100010                  100015                  100025
         *               |-----------------------|-----------------------|
         * speed            2e18                    1e18
         * totalSupply      1e18                    1e18
         * totalBorrows     1e18                    1e18
         * borrowIndex      1e18                    1e18
         * totalReward      2e18 * 5                1e18 * 10
         * ratio            10e18 * 1e18 / 1e18     10e18 * 1e18 / 1e18
         *                  = 10e18                 = 10e18
         *
         * index = 1e18 + 10e18 + 10e18 = 21e18
         */
        const speed = toWei('2'); // 2e18
        const start = 100010;
        const end = 100020;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end]);

        let blockTimestamp = 100015;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // The reward has started. Can't change the start timestamp.
        const newSpeed = toWei('1'); // 1e18
        const newStart = 100015;
        const newEnd = 100025;
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [newSpeed], [newStart], [newEnd])).to.be.revertedWith('cannot change the start timestamp after the reward starts');
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [newSpeed], [start], [newEnd]);

        blockTimestamp = 100030;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('21'));
        expect(block).to.eq(blockTimestamp);
      });

      it('restart the speed after the old reward ended', async () => {
        /**
         *            100010                  100015  100020                  100030
         *               |-----------------------|-------|-----------------------|
         * speed            2e18                            1e18
         * totalSupply      1e18                            1e18
         * totalBorrows     1e18                            1e18
         * borrowIndex      1e18                            1e18
         * totalReward      2e18 * 5                        1e18 * 10
         * ratio            10e18 * 1e18 / 1e18             10e18 * 1e18 / 1e18
         *                  = 10e18                         = 10e18
         *
         * index = 1e18 + 10e18 + 10e18 = 21e18
         */
        const speed = toWei('2'); // 2e18
        const start = 100010;
        const end = 100015;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end]);

        let blockTimestamp = 100020;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const newSpeed = toWei('1'); // 1e18
        const newStart = 100020;
        const newEnd = 100030;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [newSpeed], [newStart], [newEnd]);

        blockTimestamp = 100030;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('21'));
        expect(block).to.eq(blockTimestamp);
      });

      it('update the reward content during the reward', async () => {
        /**
         *            100010                  100015                  100020                  100025
         *               |-----------------------|-----------------------|-----------------------|
         * speed            2e18                    0                       1e18
         * totalSupply      1e18                    1e18                    1e18
         * totalBorrows     1e18                    1e18                    1e18
         * borrowIndex      1e18                    1e18                    1e18
         * totalReward      2e18 * 5                0                       1e18 * 5
         * ratio            10e18 * 1e18 / 1e18     0 * 1e18 / 1e18         5e18 * 1e18 / 1e18
         *                  = 10e18                 = 0                     = 5e18
         *
         * index = 1e18 + 10e18 + 5e18 = 16e18
         */
        const speed1 = toWei('2'); // 2e18
        const start1 = 100010;
        const end1 = 100015;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed1], [start1], [end1]);

        let blockTimestamp = 100015;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const speed2 = 0;
        const start2 = 100015;
        const end2 = 100020;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed2], [start2], [end2]);

        blockTimestamp = 100020;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const speed3 = toWei('1'); // 1e18
        const start3 = 100020;
        const end3 = 100025;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed3], [start3], [end3]);

        blockTimestamp = 100030;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('16'));
        expect(block).to.eq(blockTimestamp);
      });

      it('clear the speed and reset it later during the reward', async () => {
        /**
         *            100010                  100015                  100020                  100025
         *               |-----------------------|-----------------------|-----------------------|
         * speed            2e18                    0                       2e18
         * totalSupply      1e18                    1e18                    1e18
         * totalBorrows     1e18                    1e18                    1e18
         * borrowIndex      1e18                    1e18                    1e18
         * totalReward      2e18 * 5                0                       2e18 * 5
         * ratio            10e18 * 1e18 / 1e18     0 * 1e18 / 1e18         10e18 * 1e18 / 1e18
         *                  = 10e18                 = 0                     = 10e18
         *
         * index = 1e18 + 10e18 + 10e18 = 21e18
         */
        const speed1 = toWei('2'); // 2e18
        const start = 100010;
        const end = 100025;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed1], [start], [end]);

        let blockTimestamp = 100015;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const speed2 = 0; // clear the speed to 0
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed2], [start], [end]);

        blockTimestamp = 100020;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const speed3 = toWei('2'); // reset the speed to 2e18
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed3], [start], [end]);

        blockTimestamp = 100030;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('21'));
        expect(block).to.eq(blockTimestamp);
      });

      it('end the reward earlier and relaunch it later', async () => {
        /**
         *            100010                  100015                  100020                  100025
         *               |-----------------------|-----------------------|-----------------------|
         * speed            2e18                    0                       2e18
         * totalSupply      1e18                    1e18                    1e18
         * totalBorrows     1e18                    1e18                    1e18
         * borrowIndex      1e18                    1e18                    1e18
         * totalReward      2e18 * 5                0                       2e18 * 5
         * ratio            10e18 * 1e18 / 1e18     0 * 1e18 / 1e18         10e18 * 1e18 / 1e18
         *                  = 10e18                 = 0                     = 10e18
         *
         * index = 1e18 + 10e18 + 10e18 = 21e18
         */
        const speed = toWei('2'); // 2e18
        const start = 100010;
        const end1 = 100025;
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end1]);

        let blockTimestamp = 100015;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const end2 = 100015; // end the reward earlier to current timestamp
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end2]);

        blockTimestamp = 100020;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        const end3 = 100025; // reset the end timestamp to 100025
        await liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [speed], [start], [end3]);

        blockTimestamp = 100030;
        await liquidityMining.setBlockTimestamp(blockTimestamp);

        // Force updating the index.
        await liquidityMining[`harnessUpdateGlobal${action}Index`](rewardToken.address, cToken.address);

        const [index, block] = await liquidityMining[`reward${action}State`](rewardToken.address, cToken.address);
        expect(index).to.eq(toWei('21'));
        expect(block).to.eq(blockTimestamp);
      });

      it('fails to set speed for non-admin', async () => {
        await expect(liquidityMining.connect(user1)[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [1], [1], [1])).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('fails to set speed for invalid input', async () => {
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [1, 1], [1], [1])).to.be.revertedWith('invalid input');
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [1], [1, 1], [1])).to.be.revertedWith('invalid input');
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [1], [1], [1, 1])).to.be.revertedWith('invalid input');
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [], [1], [1], [1])).to.be.revertedWith('invalid input');
      });

      it('fails to set speed for reward token not added', async () => {
        const randomTokenFactory = await ethers.getContractFactory('MockRewardToken');
        const randomToken = await randomTokenFactory.deploy();
        await expect(liquidityMining[`_setReward${action}Speeds`](randomToken.address, [cToken.address], [1], [1], [1])).to.be.revertedWith('reward token was not added');
      });

      it('fails to set speed for invalid start / end timestamp', async () => {
        await liquidityMining.setBlockTimestamp(2);
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [1], [3], [2])).to.be.revertedWith('the end timestamp must be greater than the start timestamp');
        await expect(liquidityMining[`_setReward${action}Speeds`](rewardToken.address, [cToken.address], [1], [1], [1])).to.be.revertedWith('the end timestamp must be greater than the current timestamp');
      });
    });
  });
});
