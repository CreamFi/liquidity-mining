// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./LiquidityMiningStorage.sol";
import "./interfaces/ComptrollerInterface.sol";
import "./interfaces/CTokenInterface.sol";
import "./interfaces/Erc20Interface.sol";
import "./interfaces/LiquidityMiningInterface.sol";

contract LiquidityMining is LiquidityMiningStorage, LiquidityMiningInterface {
    uint internal constant initialIndex = 1e18;

    /**
     * @notice Emitted when a supplier's reward supply index is updated
     */
    event UpdateSupplierRewardIndex(
        address indexed rewardToken,
        address indexed cToken,
        address indexed supplier,
        uint rewards,
        uint supplyIndex
    );

    /**
     * @notice Emitted when a borrower's reward borrower index is updated
     */
    event UpdateBorowerRewardIndex(
        address indexed rewardToken,
        address indexed cToken,
        address indexed borrower,
        uint rewards,
        uint borrowIndex
    );

    /**
     * @notice Emitted when a market's reward supply speed is updated
     */
    event UpdateSupplyRewardSpeed(
        address indexed rewardToken,
        address indexed cToken,
        uint indexed speed
    );

    /**
     * @notice Emitted when a market's reward borrow speed is updated
     */
    event UpdateBorrowRewardSpeed(
        address indexed rewardToken,
        address indexed cToken,
        uint indexed speed
    );

    /**
     * @notice Emitted when a user claims rewards
     */
    event ClaimReward(
        address indexed rewardToken,
        address indexed account,
        uint indexed amount
    );

    /**
     * @notice Initialize the contract with admin and comptroller
     */
    constructor(address _admin, address _comptroller) {
        admin = _admin;
        comptroller = _comptroller;
    }

    /**
     * @notice Modifier used internally that assures the sender is the admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin could perform the action");
        _;
    }

    /**
     * @notice Modifier used internally that assures the sender is the comptroller.
     */
    modifier onlyComptroller() {
        require(msg.sender == comptroller, "only comptroller could perform the action");
        _;
    }

    /* Comptroller functions */

    /**
     * @notice Accrue rewards to the market by updating the supply index and calculate rewards accrued by suppliers
     * @param cToken The market whose supply index to update
     * @param suppliers The related suppliers
     */
    function updateSupplyIndex(address cToken, address[] memory suppliers) external override onlyComptroller {
        // Distribute the rewards right away.
        updateSupplyIndexInternal(rewardTokens, cToken, suppliers, true);
    }

    /**
     * @notice Accrue rewards to the market by updating the borrow index and calculate rewards accrued by borrowers
     * @param cToken The market whose borrow index to update
     * @param borrowers The related borrowers
     */
    function updateBorrowIndex(address cToken, address[] memory borrowers) external override onlyComptroller {
        // Distribute the rewards right away.
        updateBorrowIndexInternal(rewardTokens, cToken, borrowers, true);
    }

    /* User functions */

    /**
     * @notice Return the current block number.
     * @return The current block number
     */
    function getBlockNumber() public virtual view returns (uint) {
        return block.number;
    }

    /**
     * @notice Claim all the rewards accrued by holder in all markets
     * @param holder The address to claim rewards for
     */
    function claimRewards(address holder) public override {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        address[] memory allMarkets = ComptrollerInterface(comptroller).getAllMarkets();
        return claimRewards(holders, allMarkets, rewardTokens, true, true);
    }

    /**
     * @notice Claim all the rewards accrued by the holders
     * @param holders The addresses to claim rewards for
     * @param cTokens The list of markets to claim rewards in
     * @param rewards The list of reward tokens to claim
     * @param borrowers Whether or not to claim rewards earned by borrowing
     * @param suppliers Whether or not to claim rewards earned by supplying
     */
    function claimRewards(address[] memory holders, address[] memory cTokens, address[] memory rewards, bool borrowers, bool suppliers) public override {
        for (uint i = 0; i < cTokens.length; i++) {
            address cToken = cTokens[i];
            (bool isListed, , ) = ComptrollerInterface(comptroller).markets(cToken);
            require(isListed, "market must be listed");

            // Same reward generated from multiple markets could aggregate and distribute once later for gas consumption.
            if (borrowers == true) {
                updateBorrowIndexInternal(rewards, cToken, holders, false);
            }
            if (suppliers == true) {
                updateSupplyIndexInternal(rewards, cToken, holders, false);
            }
        }

        // Distribute the rewards.
        for (uint i = 0; i < rewards.length; i++) {
            for (uint j = 0; j < holders.length; j++) {
                address rewardToken = rewards[i];
                address holder = holders[j];
                rewardAccrued[rewardToken][holder] = transferReward(rewardToken, holder, rewardAccrued[rewardToken][holder]);
            }
        }
    }

    /* Admin functions */

    /**
     * @notice Add new reward token. Revert if the reward token has been added
     * @param rewardToken The new reward token
     */
    function _addRewardToken(address rewardToken) external onlyAdmin {
        require(!rewardTokensMap[rewardToken], "reward token has been added");
        rewardTokensMap[rewardToken] = true;
        rewardTokens.push(rewardToken);
    }

    /**
     * @notice Set cTokens reward supply speeds
     * @param rewardToken The reward token
     * @param cTokens The addresses of cTokens
     * @param speeds The list of reward speeds
     */
    function _setRewardSupplySpeeds(address rewardToken, address[] memory cTokens, uint[] memory speeds) external onlyAdmin {
        _setRewardSpeeds(rewardToken, cTokens, speeds, true);
    }

    /**
     * @notice Set cTokens reward borrow speeds
     * @param rewardToken The reward token
     * @param cTokens The addresses of cTokens
     * @param speeds The list of reward speeds
     */
    function _setRewardBorrowSpeeds(address rewardToken, address[] memory cTokens, uint[] memory speeds) external onlyAdmin {
        _setRewardSpeeds(rewardToken, cTokens, speeds, false);
    }

    /* Internal functions */

    /**
     * @notice Given the reward token list, accrue rewards to the market by updating the supply index and calculate rewards accrued by suppliers
     * @param rewards The list of rewards to update
     * @param cToken The market whose supply index to update
     * @param suppliers The related suppliers
     * @param distribute Distribute the reward or not
     */
    function updateSupplyIndexInternal(address[] memory rewards, address cToken, address[] memory suppliers, bool distribute) internal {
        for (uint i = 0; i < rewards.length; i++) {
            require(rewardTokensMap[rewards[i]], "reward token not support");
            updateGlobalSupplyIndex(rewards[i], cToken);
            for (uint j = 0; j < suppliers.length; j++) {
                updateUserSupplyIndex(rewards[i], cToken, suppliers[j], distribute);
            }
        }
    }

    /**
     * @notice Given the reward token list, accrue rewards to the market by updating the borrow index and calculate rewards accrued by borrowers
     * @param rewards The list of rewards to update
     * @param cToken The market whose borrow index to update
     * @param borrowers The related borrowers
     * @param distribute Distribute the reward or not
     */
    function updateBorrowIndexInternal(address[] memory rewards, address cToken, address[] memory borrowers, bool distribute) internal {
        for (uint i = 0; i < rewards.length; i++) {
            require(rewardTokensMap[rewards[i]], "reward token not support");

            uint marketBorrowIndex = CTokenInterface(cToken).borrowIndex();
            updateGlobalBorrowIndex(rewards[i], cToken, marketBorrowIndex);
            for (uint j = 0; j < borrowers.length; j++) {
                updateUserBorrowIndex(rewards[i], cToken, borrowers[j], marketBorrowIndex, distribute);
            }
        }
    }

    /**
     * @notice Accrue rewards to the market by updating the supply index
     * @param rewardToken The reward token
     * @param cToken The market whose supply index to update
     */
    function updateGlobalSupplyIndex(address rewardToken, address cToken) internal {
        RewardState storage supplyState = rewardSupplyState[rewardToken][cToken];
        uint supplySpeed = rewardSupplySpeeds[rewardToken][cToken];
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = blockNumber - supplyState.block;
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = CTokenInterface(cToken).totalSupply();
            uint rewardAccrued = deltaBlocks * supplySpeed;
            uint ratio = supplyTokens > 0 ? rewardAccrued * 1e18 / supplyTokens : 0;
            uint index = supplyState.index + ratio;
            rewardSupplyState[rewardToken][cToken] = RewardState({
                index: index,
                block: blockNumber
            });
        } else if (deltaBlocks > 0) {
            supplyState.block = blockNumber;
        }
    }

    /**
     * @notice Accrue rewards to the market by updating the borrow index
     * @param rewardToken The reward token
     * @param cToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateGlobalBorrowIndex(address rewardToken, address cToken, uint marketBorrowIndex) internal {
        RewardState storage borrowState = rewardBorrowState[rewardToken][cToken];
        uint borrowSpeed = rewardBorrowSpeeds[rewardToken][cToken];
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = blockNumber - borrowState.block;
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = CTokenInterface(cToken).totalBorrows() / marketBorrowIndex;
            uint rewardAccrued = deltaBlocks * borrowSpeed;
            uint ratio = borrowAmount > 0 ? rewardAccrued * 1e18 / borrowAmount : 0;
            uint index = borrowState.index + ratio;
            rewardBorrowState[rewardToken][cToken] = RewardState({
                index: index,
                block: blockNumber
            });
        } else if (deltaBlocks > 0) {
            borrowState.block = blockNumber;
        }
    }

    /**
     * @notice Calculate rewards accrued by a supplier and possibly transfer it to them
     * @param rewardToken The reward token
     * @param cToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute rewards to
     * @param distribute Distribute the reward or not
     */
    function updateUserSupplyIndex(address rewardToken, address cToken, address supplier, bool distribute) internal {
        RewardState memory supplyState = rewardSupplyState[rewardToken][cToken];
        uint supplyIndex = supplyState.index;
        uint supplierIndex = rewardSupplierIndex[rewardToken][cToken][supplier];
        rewardSupplierIndex[rewardToken][cToken][supplier] = supplyIndex;

        if (supplierIndex == 0 && supplyIndex > 0) {
            supplierIndex = initialIndex;
        }

        uint deltaIndex = supplyIndex - supplierIndex;
        uint supplierTokens = CTokenInterface(cToken).balanceOf(supplier);
        uint supplierDelta = supplierTokens * deltaIndex / 1e18;
        uint accruedAmount = rewardAccrued[rewardToken][supplier] + supplierDelta;
        if (distribute) {
            rewardAccrued[rewardToken][supplier] = transferReward(rewardToken, supplier, accruedAmount);
        } else {
            rewardAccrued[rewardToken][supplier] = accruedAmount;
        }
        emit UpdateSupplierRewardIndex(rewardToken, cToken, supplier, supplierDelta, supplyIndex);
    }

    /**
     * @notice Calculate rewards accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param rewardToken The reward token
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute rewards to
     * @param marketBorrowIndex The market borrow index
     * @param distribute Distribute the reward or not
     */
    function updateUserBorrowIndex(address rewardToken, address cToken, address borrower, uint marketBorrowIndex, bool distribute) internal {
        RewardState memory borrowState = rewardBorrowState[rewardToken][cToken];
        uint borrowIndex = borrowState.index;
        uint borrowerIndex = rewardBorrowerIndex[rewardToken][cToken][borrower];
        rewardBorrowerIndex[rewardToken][cToken][borrower] = borrowIndex;

        if (borrowerIndex > 0) {
            uint deltaIndex = borrowIndex - borrowerIndex;
            uint borrowerAmount = CTokenInterface(cToken).borrowBalanceStored(borrower) / marketBorrowIndex;
            uint borrowerDelta = borrowerAmount * deltaIndex / 1e18;
            uint accruedAmount = rewardAccrued[rewardToken][borrower] + borrowerDelta;
            if (distribute) {
                rewardAccrued[rewardToken][borrower] = transferReward(rewardToken, borrower, accruedAmount);
            } else {
                rewardAccrued[rewardToken][borrower] = accruedAmount;
            }
            emit UpdateBorowerRewardIndex(rewardToken, cToken, borrower, borrowerDelta, borrowIndex);
        }
    }

    /**
     * @notice Transfer rewards to the user
     * @param rewardToken The reward token
     * @param user The address of the user to transfer rewards to
     * @param amount The amount of rewards to (possibly) transfer
     * @return The amount of rewards which was NOT transferred to the user
     */
    function transferReward(address rewardToken, address user, uint amount) internal returns (uint) {
        uint reamining = IERC20(rewardToken).balanceOf(address(this));
        if (amount > 0 && amount <= reamining) {
            IERC20(rewardToken).transfer(user, amount);
            emit ClaimReward(rewardToken, user, amount);
            return 0;
        }
        return amount;
    }

    /**
     * @notice Set reward speeds
     * @param rewardToken The reward token
     * @param cTokens The addresses of cTokens
     * @param speeds The list of reward speeds
     * @param supply It's supply speed or borrow speed
     */
    function _setRewardSpeeds(address rewardToken, address[] memory cTokens, uint[] memory speeds, bool supply) internal {
        uint numMarkets = cTokens.length;
        uint numSpeeds = speeds.length;
        require(numMarkets != 0 && numMarkets == numSpeeds, "invalid input");
        require(rewardTokensMap[rewardToken], "reward token was not added");

        for (uint i = 0; i < numMarkets; i++) {
            if (speeds[i] > 0) {
                _initRewardState(rewardToken, cTokens[i], supply);
            }

            // Update supply and borrow index.
            uint marketBorrowIndex = CTokenInterface(cTokens[i]).borrowIndex();
            updateGlobalSupplyIndex(rewardToken, cTokens[i]);
            updateGlobalBorrowIndex(rewardToken, cTokens[i], marketBorrowIndex);

            if (supply) {
                rewardSupplySpeeds[rewardToken][cTokens[i]] = speeds[i];
                emit UpdateSupplyRewardSpeed(rewardToken, cTokens[i], speeds[i]);
            } else {
                rewardBorrowSpeeds[rewardToken][cTokens[i]] = speeds[i];
                emit UpdateBorrowRewardSpeed(rewardToken, cTokens[i], speeds[i]);
            }
        }
    }

    /**
     * @notice Initialize the reward speed
     * @param rewardToken The reward token
     * @param cToken The market
     * @param supply It's supply speed or borrow speed
     */
    function _initRewardState(address rewardToken, address cToken, bool supply) internal {
        if (supply && rewardSupplyState[rewardToken][cToken].index == 0 && rewardSupplyState[rewardToken][cToken].block == 0) {
            rewardSupplyState[rewardToken][cToken] = RewardState({
                index: initialIndex,
                block: getBlockNumber()
            });
        }

        if (!supply && rewardBorrowState[rewardToken][cToken].index == 0 && rewardBorrowState[rewardToken][cToken].block == 0) {
            rewardBorrowState[rewardToken][cToken] = RewardState({
                index: initialIndex,
                block: getBlockNumber()
            });
        }
    }
}
