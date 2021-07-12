const { ethers } = require("hardhat");

admin = "";
comptroller = "";

async function main() {

  const lensFactory = await ethers.getContractFactory("LiquidityMiningLens");
  const liquidityMiningFactory = await ethers.getContractFactory("LiquidityMining");
  const proxyFactory = await ethers.getContractFactory("LiquidityMiningProxy");

  const liquidityMining = await liquidityMiningFactory.deploy();
  console.log("Implementation deployed to:", liquidityMining.address);
  await liquidityMining.deployed();

  const fragment = liquidityMiningFactory.interface.getFunction('initialize');
  const initData = liquidityMiningFactory.interface.encodeFunctionData(fragment, [admin, comptroller]);
  const proxy = await proxyFactory.deploy(liquidityMining.address, initData);

  console.log("Proxy deployed to:", proxy.address);
  console.log("constructor agrs:", liquidityMining.address, initData);

  await proxy.deployed();

  const lens = await lensFactory.deploy(proxy.address);
  console.log("Lens deployed to:", lens.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
