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
        updateSupplyIndexInternal(rewardTokens, cToken, suppliers);
    }

    /**
     * @notice Accrue rewards to the market by updating the borrow index and calculate rewards accrued by borrowers
     * @param cToken The market whose borrow index to update
     * @param borrowers The related borrowers
     */
    function updateBorrowIndex(address cToken, address[] memory borrowers) external override onlyComptroller {
        updateBorrowIndexInternal(rewardTokens, cToken, borrowers);
    }

    /* User functions */

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

            if (borrowers == true) {
                updateBorrowIndexInternal(rewards, cToken, holders);
            }
            if (suppliers == true) {
                updateSupplyIndexInternal(rewards, cToken, holders);
            }
        }

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
     */
    function updateSupplyIndexInternal(address[] memory rewards, address cToken, address[] memory suppliers) internal {
        for (uint i = 0; i < rewards.length; i++) {
            require(rewardTokensMap[rewards[i]], "reward token not support");
            updateGlobalSupplyIndex(rewards[i], cToken);
            for (uint j = 0; j < suppliers.length; j++) {
                updateUserSupplyIndex(rewards[i], cToken, suppliers[i]);
            }
        }
    }

    /**
     * @notice Given the reward token list, accrue rewards to the market by updating the borrow index and calculate rewards accrued by borrowers
     * @param rewards The list of rewards to update
     * @param cToken The market whose borrow index to update
     * @param borrowers The related borrowers
     */
    function updateBorrowIndexInternal(address[] memory rewards, address cToken, address[] memory borrowers) internal {
        for (uint i = 0; i < rewards.length; i++) {
            require(rewardTokensMap[rewards[i]], "reward token not support");
            updateGlobalBorrowIndex(rewards[i], cToken);
            for (uint j = 0; j < borrowers.length; j++) {
                updateUserBorrowIndex(rewards[i], cToken, borrowers[i]);
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
        uint blockNumber = block.number;
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
     */
    function updateGlobalBorrowIndex(address rewardToken, address cToken) internal {
        RewardState storage borrowState = rewardBorrowState[rewardToken][cToken];
        uint borrowSpeed = rewardBorrowSpeeds[rewardToken][cToken];
        uint blockNumber = block.number;
        uint deltaBlocks = blockNumber - borrowState.block;
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = CTokenInterface(cToken).totalBorrows() / CTokenInterface(cToken).borrowIndex();
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
     */
    function updateUserSupplyIndex(address rewardToken, address cToken, address supplier) internal {
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
        rewardAccrued[rewardToken][supplier] = rewardAccrued[rewardToken][supplier] + supplierDelta;
        emit UpdateSupplierRewardIndex(rewardToken, cToken, supplier, supplierDelta, supplyIndex);
    }

    /**
     * @notice Calculate rewards accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param rewardToken The reward token
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute rewards to
     */
    function updateUserBorrowIndex(address rewardToken, address cToken, address borrower) internal {
        RewardState memory borrowState = rewardBorrowState[rewardToken][cToken];
        uint borrowIndex = borrowState.index;
        uint borrowerIndex = rewardBorrowerIndex[rewardToken][cToken][borrower];
        rewardBorrowerIndex[rewardToken][cToken][borrower] = borrowIndex;

        if (borrowerIndex > 0) {
            uint deltaIndex = borrowIndex - borrowerIndex;
            uint borrowerAmount = CTokenInterface(cToken).borrowBalanceStored(borrower) / CTokenInterface(cToken).borrowIndex();
            uint borrowerDelta = borrowerAmount * deltaIndex / 1e18;
            rewardAccrued[rewardToken][borrower] = rewardAccrued[rewardToken][borrower] + borrowerDelta;
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
            return 0;
        }
        return amount;
    }

    /**
     * @notice Set reward speeds
     * @param rewardToken The reward token
     * @param cTokens The addresses of cTokens
     * @param speeds The list of reward speeds
     * @param supply It's supply speed of borrow speed
     */
    function _setRewardSpeeds(address rewardToken, address[] memory cTokens, uint[] memory speeds, bool supply) internal {
        uint numMarkets = cTokens.length;
        uint numSpeeds = speeds.length;
        require(numMarkets != 0 && numMarkets == numSpeeds, "invalid input");
        require(rewardTokensMap[rewardToken], "reward token was not added");

        for (uint i = 0; i < numMarkets; i++) {
            if (speeds[i] > 0) {
                _initRewardState(rewardToken, cTokens[i]);
            }

            // Update supply and borrow index.
            updateGlobalSupplyIndex(rewardToken, cTokens[i]);
            updateGlobalBorrowIndex(rewardToken, cTokens[i]);

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
     */
    function _initRewardState(address rewardToken, address cToken) internal {
        if (rewardSupplyState[rewardToken][cToken].index == 0 && rewardSupplyState[rewardToken][cToken].block == 0) {
            rewardSupplyState[rewardToken][cToken] = RewardState({
                index: initialIndex,
                block: block.number
            });
        }

        if (rewardBorrowState[rewardToken][cToken].index == 0 && rewardBorrowState[rewardToken][cToken].block == 0) {
            rewardBorrowState[rewardToken][cToken] = RewardState({
                index: initialIndex,
                block: block.number
            });
        }
    }
}