// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface LiquidityMiningInterface {
    function updateSupplyIndex(address cToken, address[] memory accounts) external;
    function updateBorrowIndex(address cToken, address[] memory accounts) external;
    function claimRewards(address holder) external;
    function claimRewards(address[] memory holders, address[] memory cTokens, address[] memory rewards, bool borrowers, bool suppliers) external;
    function updateDebtors(address[] memory accounts) external;
}
