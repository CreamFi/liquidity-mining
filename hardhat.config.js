/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

module.exports = {
  solidity: {
    version: "0.8.2" ,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
