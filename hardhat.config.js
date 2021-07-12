require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-etherscan");

module.exports = {
  solidity: {
    version: "0.8.2" ,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    goerli: {
      url: "https://goerli.infura.io/v3/" + process.env.INFURA_TOKEN,
      accounts: [`0x${process.env.DEPLOY_PRIVATE_KEY}`]
    },
    bsc: {
      url: "https://bsc-dataseed1.ninicoin.io/",
      accounts: [`0x${process.env.DEPLOY_PRIVATE_KEY}`]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
